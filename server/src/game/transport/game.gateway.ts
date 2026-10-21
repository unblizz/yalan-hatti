import { Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayDisconnect,
} from '@nestjs/websockets'
import type { Server, Socket } from 'socket.io'
import type { Subscription } from 'rxjs'
import { ZodError } from 'zod'
import type { Command, PlayerCommand } from '../domain/commands.js'
import { GameError } from '../domain/game-error.js'
import { hostView, playerView, screenView, type DeviceRole } from '../domain/views.js'
import { RoomService } from '../room.service.js'
import {
  alertCommandSchema,
  envelopeSchema,
  heartbeatSchema,
  hostCommandSchema,
  joinSchema,
  playerCommandSchema,
  resumeSchema,
  signalSchema,
  type Ack,
} from './messages.schema.js'

interface SocketSession {
  code: string
  role: DeviceRole
  playerId: string | null
}

const roomChannel = (code: string) => `room:${code}`
const FLUSH_MS = 40

@WebSocketGateway({ cors: { origin: true }, pingInterval: 5000, pingTimeout: 8000, maxHttpBufferSize: 1e6 })
export class GameGateway implements OnModuleInit, OnModuleDestroy, OnGatewayDisconnect {
  private readonly logger = new Logger(GameGateway.name)
  private readonly pending = new Map<string, 'all' | 'host'>()
  private flushTimer: NodeJS.Timeout | null = null
  private subscription: Subscription | null = null

  @WebSocketServer()
  server!: Server

  constructor(private readonly rooms: RoomService) {}

  onModuleInit(): void {
    this.subscription = this.rooms.changes.subscribe(({ code, scope }) => {
      if (this.pending.get(code) !== 'all') this.pending.set(code, scope)
      this.flushTimer ??= setTimeout(() => this.flush(), FLUSH_MS)
    })
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe()
    if (this.flushTimer) clearTimeout(this.flushTimer)
  }

  handleDisconnect(socket: Socket): void {
    const session = this.session(socket)
    if (session) this.rooms.disconnectDevice(session.code, socket.id)
  }

  @SubscribeMessage('player.join')
  join(@MessageBody() body: unknown): Ack {
    return this.guard(() => {
      const input = joinSchema.parse(body)
      return this.rooms.execute(input.code, { actor: 'system', type: 'player.claim', playerId: input.playerId, token: input.token })
    })
  }

  @SubscribeMessage('session.resume')
  resume(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Ack {
    return this.guard(() => {
      const input = resumeSchema.parse(body)
      if (!this.rooms.exists(input.code)) throw new GameError('not_found', 'Oda bulunamadı.')
      let playerId: string | null = null
      let label = input.label
      if (input.role === 'host' && !this.rooms.isHost(input.code, input.token)) {
        throw new GameError('forbidden', 'Yönetim anahtarı geçersiz.')
      }
      if (input.role === 'player') {
        const player = this.rooms.playerByToken(input.code, input.token)
        if (!player) throw new GameError('forbidden', 'Bu cihaz odaya kayıtlı değil.')
        playerId = player.id
        label = player.name
      }
      const previous = this.session(socket)
      if (previous) {
        void socket.leave(roomChannel(previous.code))
        this.rooms.disconnectDevice(previous.code, socket.id)
      }
      const session: SocketSession = { code: input.code, role: input.role, playerId }
      socket.data = session
      void socket.join(roomChannel(input.code))
      this.rooms.connectDevice(input.code, {
        socketId: socket.id,
        role: input.role,
        playerId,
        label: label || (input.role === 'host' ? 'Yönetim' : 'Sahne'),
        userAgent: input.userAgent,
      })
      socket.emit('view', this.viewFor(session))
      return { playerId }
    })
  }

  @SubscribeMessage('command')
  command(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Ack {
    return this.guard(() => {
      const session = this.requireSession(socket)
      const envelope = envelopeSchema.parse(body)
      if (session.role === 'host') {
        const alertCommand = alertCommandSchema.safeParse(envelope.command)
        if (alertCommand.success) {
          const alertId = alertCommand.data.type === 'alert.ack' ? alertCommand.data.alertId : null
          return this.rooms.acknowledgeAlert(session.code, alertId, envelope.commandId)
        }
        return this.rooms.execute(session.code, { actor: 'host', ...hostCommandSchema.parse(envelope.command) } as Command, envelope.commandId)
      }
      if (session.role !== 'player' || !session.playerId) throw new GameError('forbidden', 'Bu ekran komut gönderemez.')
      const command = playerCommandSchema.parse(envelope.command) as PlayerCommand
      const reply = this.rooms.execute(session.code, { actor: 'player', playerId: session.playerId, ...command }, envelope.commandId)
      if (command.type === 'call.dial' && reply.result === 'ringing' && typeof reply.callId === 'string') {
        this.rooms.bindCallSocket(session.code, reply.callId, 'caller', socket.id)
      }
      if (command.type === 'call.answer') this.rooms.bindCallSocket(session.code, command.callId, 'callee', socket.id)
      return reply
    })
  }

  @SubscribeMessage('rtc.signal')
  signal(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Ack {
    return this.guard(() => {
      const session = this.requireSession(socket)
      const input = signalSchema.parse(body)
      const state = this.rooms.state(session.code)
      const call = state.calls.find((c) => c.id === input.callId)
      if (!call || call.status !== 'active') throw new GameError('invalid_phase', 'Görüşme açık değil.')
      const side = call.caller === session.playerId ? 'caller' : call.callee === session.playerId ? 'callee' : null
      if (!side) throw new GameError('forbidden', 'Bu görüşmede değilsin.')
      const otherId = side === 'caller' ? call.callee : call.caller
      const sockets = this.rooms.callSockets(session.code, call.id)
      const target = side === 'caller' ? sockets.callee : sockets.caller
      const recipients = target && this.server.sockets.sockets.has(target) ? [target] : this.playerSockets(session.code, otherId)
      for (const id of recipients) this.server.to(id).emit('rtc.signal', { callId: call.id, from: side, payload: input.payload })
      return { delivered: recipients.length }
    })
  }

  @SubscribeMessage('heartbeat')
  heartbeat(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Ack {
    return this.guard(() => {
      const session = this.requireSession(socket)
      const input = heartbeatSchema.parse(body)
      this.rooms.heartbeat(session.code, socket.id, { rttMs: input.rttMs, battery: input.battery })
      return { serverNow: Date.now(), sentAt: input.sentAt }
    })
  }

  private playerSockets(code: string, playerId: string | null): string[] {
    if (!playerId) return []
    const members = this.server.sockets.adapter.rooms.get(roomChannel(code)) ?? new Set<string>()
    return [...members].filter((id) => {
      const socket = this.server.sockets.sockets.get(id)
      return socket && this.session(socket)?.playerId === playerId
    })
  }

  private flush(): void {
    this.flushTimer = null
    const batch = [...this.pending]
    this.pending.clear()
    for (const [code, scope] of batch) {
      if (!this.rooms.exists(code)) continue
      const members = this.server.sockets.adapter.rooms.get(roomChannel(code))
      if (!members) continue
      for (const socketId of members) {
        const socket = this.server.sockets.sockets.get(socketId)
        const session = socket && this.session(socket)
        if (!socket || !session) continue
        if (scope === 'host' && session.role !== 'host') continue
        try {
          socket.emit('view', this.viewFor(session))
        } catch (error) {
          this.logger.error(`Görünüm gönderilemedi ${code}/${socketId}: ${String(error)}`)
        }
      }
    }
  }

  private viewFor(session: SocketSession) {
    const state = this.rooms.state(session.code)
    const now = Date.now()
    if (session.role === 'host') {
      return hostView(state, now, this.rooms.devices(session.code), this.rooms.recentEvents(session.code), this.rooms.alerts(session.code))
    }
    if (session.role === 'player') {
      const player = state.players.find((p) => p.id === session.playerId)
      if (player) return playerView(state, player, now)
    }
    return screenView(state, now)
  }

  private session(socket: Socket): SocketSession | null {
    const data = socket.data as Partial<SocketSession> | undefined
    return data?.code && data.role ? (data as SocketSession) : null
  }

  private requireSession(socket: Socket): SocketSession {
    const session = this.session(socket)
    if (!session) throw new GameError('forbidden', 'Önce oturum açılmalı.')
    return session
  }

  private guard(fn: () => Record<string, unknown>): Ack {
    try {
      return { ok: true, data: fn() }
    } catch (error) {
      if (error instanceof GameError) return { ok: false, code: error.code, message: error.message }
      if (error instanceof ZodError) return { ok: false, code: 'invalid_input', message: 'Geçersiz istek.' }
      this.logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
      return { ok: false, code: 'internal', message: 'Sunucu hatası.' }
    }
  }
}
