import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { randomInt, randomUUID } from 'node:crypto'
import { Subject } from 'rxjs'
import {
  acknowledge,
  emptyBook,
  evaluateAlerts,
  reconcileAlerts,
  sameActive,
  type Alert,
  type AlertBook,
} from './domain/alerts.js'
import type { Command } from './domain/commands.js'
import { describeEvent } from './domain/event-text.js'
import { apply, createGame, needsTick } from './domain/game-engine.js'
import { GameError } from './domain/game-error.js'
import type { DomainEvent, EngineContext, GameState, Player } from './domain/game.types.js'
import type { DeviceRole, DeviceStatus, EventRow } from './domain/views.js'
import type { LoggedEvent } from './persistence/room-store.js'
import { RoomStore } from './persistence/room-store.js'

export const CLOCK = Symbol('CLOCK')
export type Clock = () => number

interface Runtime {
  state: GameState
  seq: number
  devices: Map<string, DeviceStatus>
  replies: Map<string, Record<string, unknown>>
  recent: EventRow[]
  alerts: AlertBook
  bootedAt: number
  callSockets: Map<string, { caller?: string; callee?: string }>
}

export interface RoomChange {
  code: string
  scope: 'all' | 'host'
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPRSTUVYZ'
const REPLY_CACHE = 500
const RECENT_EVENTS = 80
const TICK_MS = 500

@Injectable()
export class RoomService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoomService.name)
  private readonly rooms = new Map<string, Runtime>()
  private timer: NodeJS.Timeout | null = null
  readonly changes = new Subject<RoomChange>()

  constructor(
    private readonly store: RoomStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    const { rooms, skipped } = this.store.loadAll()
    if (skipped.length > 0) this.logger.warn(`Eski biçimdeki ${skipped.length} oda yüklenmedi: ${skipped.join(', ')}`)
    for (const stored of rooms) {
      const events = this.store.events(stored.state.code)
      const lastSeq = events.at(-1)?.seq ?? 0
      const runtime: Runtime = {
        state: stored.state,
        seq: Math.max(stored.seq, lastSeq),
        devices: new Map(),
        replies: new Map(stored.replies ?? []),
        recent: events.slice(-RECENT_EVENTS).map((e) => this.row(e, stored.state)),
        alerts: stored.alerts ?? emptyBook(),
        bootedAt: this.clock(),
        callSockets: new Map(),
      }
      this.rooms.set(stored.state.code, runtime)
      this.record(runtime, [{ type: 'server.started', actor: null, data: {} }])
    }
    if (this.rooms.size > 0) this.logger.log(`${this.rooms.size} oda diskten yüklendi`)
    this.timer = setInterval(() => this.tickAll(), TICK_MS)
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  createRoom(roster: string[] = []): { code: string; hostToken: string } {
    let code = ''
    do {
      code = Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
    } while (this.rooms.has(code))
    const hostToken = randomUUID()
    const { state, events } = createGame({ code, hostToken, roster, ctx: this.context() })
    const runtime: Runtime = {
      state,
      seq: 0,
      devices: new Map(),
      replies: new Map(),
      recent: [],
      alerts: emptyBook(),
      bootedAt: this.clock(),
      callSockets: new Map(),
    }
    this.rooms.set(code, runtime)
    this.record(runtime, events)
    return { code, hostToken }
  }

  exists(code: string): boolean {
    return this.rooms.has(code)
  }

  state(code: string): GameState {
    return this.runtime(code).state
  }

  devices(code: string): DeviceStatus[] {
    return [...this.runtime(code).devices.values()].sort((a, b) => a.connectedAt - b.connectedAt)
  }

  alerts(code: string): AlertBook {
    return this.runtime(code).alerts
  }

  acknowledgeAlert(code: string, alertId: string | null, commandId?: string): Record<string, unknown> {
    const runtime = this.runtime(code)
    if (commandId && runtime.replies.has(commandId)) return runtime.replies.get(commandId)!
    const { book, acknowledged } = acknowledge(runtime.alerts, alertId, this.clock())
    runtime.alerts = book
    const reply = { acknowledged: acknowledged.length }
    if (commandId) this.remember(runtime, commandId, reply)
    if (acknowledged.length > 0) {
      this.record(
        runtime,
        acknowledged.map((a) => this.alertEvent('alert.acknowledged', a)),
        'host',
      )
    }
    return reply
  }

  recentEvents(code: string): EventRow[] {
    return [...this.runtime(code).recent].reverse()
  }

  isHost(code: string, token: string | undefined): boolean {
    return !!token && this.rooms.get(code)?.state.hostToken === token
  }

  playerByToken(code: string, token: string | undefined): Player | null {
    if (!token) return null
    return this.rooms.get(code)?.state.players.find((p) => p.token === token) ?? null
  }

  execute(code: string, command: Command, commandId?: string): Record<string, unknown> {
    const runtime = this.runtime(code)
    if (commandId) {
      const cached = runtime.replies.get(commandId)
      if (cached) return cached
    }
    const outcome = apply(runtime.state, command, this.context())
    runtime.state = outcome.state
    if (commandId) this.remember(runtime, commandId, outcome.reply)
    this.record(runtime, outcome.events)
    return outcome.reply
  }

  connectDevice(code: string, device: Omit<DeviceStatus, 'connected' | 'connectedAt' | 'lastSeenAt' | 'disconnectedAt' | 'rttMs' | 'battery' | 'sessions'>): void {
    const runtime = this.runtime(code)
    const now = this.clock()
    const previous = [...runtime.devices.values()].find(
      (d) => d.role === device.role && d.playerId === device.playerId && d.label === device.label && !d.connected,
    )
    if (previous) runtime.devices.delete(previous.socketId)
    runtime.devices.set(device.socketId, {
      ...device,
      connected: true,
      connectedAt: now,
      lastSeenAt: now,
      disconnectedAt: null,
      rttMs: null,
      battery: previous?.battery ?? null,
      sessions: (previous?.sessions ?? 0) + 1,
    })
    this.record(runtime, [
      { type: 'device.connected', actor: device.playerId, data: { role: device.role, label: device.label, socketId: device.socketId } },
    ], 'host')
  }

  heartbeat(code: string, socketId: string, input: { rttMs?: number | undefined; battery?: { level: number; charging: boolean } | undefined }): void {
    const device = this.rooms.get(code)?.devices.get(socketId)
    if (!device) return
    device.lastSeenAt = this.clock()
    if (input.rttMs !== undefined) device.rttMs = input.rttMs
    if (input.battery !== undefined) device.battery = input.battery
    this.changes.next({ code, scope: 'host' })
  }

  disconnectDevice(code: string, socketId: string): void {
    const runtime = this.rooms.get(code)
    const device = runtime?.devices.get(socketId)
    if (!runtime || !device) return
    device.connected = false
    device.disconnectedAt = this.clock()
    this.record(runtime, [
      { type: 'device.disconnected', actor: device.playerId, data: { role: device.role, label: device.label, socketId } },
    ], 'host')
  }

  bindCallSocket(code: string, callId: string, side: 'caller' | 'callee', socketId: string): void {
    const runtime = this.runtime(code)
    const entry = runtime.callSockets.get(callId) ?? {}
    entry[side] = socketId
    runtime.callSockets.set(callId, entry)
    if (runtime.callSockets.size > 200) {
      const oldest = runtime.callSockets.keys().next().value
      if (oldest !== undefined) runtime.callSockets.delete(oldest)
    }
  }

  callSockets(code: string, callId: string): { caller?: string; callee?: string } {
    return this.runtime(code).callSockets.get(callId) ?? {}
  }

  saveRecording(code: string, callId: string, token: string | undefined, mime: string, data: Buffer): string {
    const runtime = this.runtime(code)
    const player = this.playerByToken(code, token)
    const call = runtime.state.calls.find((c) => c.id === callId)
    if (!player || !call || (call.caller !== player.id && call.callee !== player.id)) throw new GameError('forbidden', 'Bu görüşmenin kaydı sana ait değil.')
    if (data.length === 0) throw new GameError('invalid_input', 'Kayıt boş.')
    const extension = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm'
    const file = this.store.saveRecording(code, callId, extension, data)
    this.execute(code, { actor: 'system', type: 'call.recorded', callId, file })
    return file
  }

  recordingPath(code: string, callId: string): string | null {
    const call = this.runtime(code).state.calls.find((c) => c.id === callId)
    return call?.recording ? this.store.recordingPath(code, call.recording) : null
  }

  exportEvents(code: string): LoggedEvent[] {
    this.runtime(code)
    return this.store.events(code)
  }

  describe(code: string, event: DomainEvent): string {
    return describeEvent(event, this.runtime(code).state)
  }

  tickAll(): void {
    for (const [code, runtime] of this.rooms) {
      try {
        if (needsTick(runtime.state)) this.execute(code, { actor: 'system', type: 'tick' })
        this.refreshAlerts(runtime)
      } catch (error) {
        this.logger.error(`Tick hatası ${code}: ${String(error)}`)
      }
    }
  }

  refreshAlerts(runtime: Runtime): void {
    if (runtime.alerts.active.length === 0 && runtime.state.status === 'finished') return
    const now = this.clock()
    const conditions = evaluateAlerts({ state: runtime.state, devices: [...runtime.devices.values()], now, bootedAt: runtime.bootedAt })
    const { book, raised, resolved } = reconcileAlerts(runtime.alerts, conditions, now, () => randomUUID())
    const changed = !sameActive(runtime.alerts.active, book.active)
    runtime.alerts = book
    const events = [
      ...raised.map((a) => this.alertEvent('alert.raised', a)),
      ...resolved.map((a) => this.alertEvent('alert.resolved', a)),
    ]
    if (events.length > 0) this.record(runtime, events, 'host')
    else if (changed) this.changes.next({ code: runtime.state.code, scope: 'host' })
  }

  private alertEvent(type: string, alert: Alert): DomainEvent {
    return {
      type,
      actor: null,
      data: {
        alertId: alert.id,
        key: alert.key,
        severity: alert.severity,
        title: alert.title,
        detail: alert.detail,
        ...(alert.resolvedAt ? { durationMs: alert.resolvedAt - alert.raisedAt } : {}),
      },
    }
  }

  private runtime(code: string): Runtime {
    const runtime = this.rooms.get(code)
    if (!runtime) throw new GameError('not_found', 'Oda bulunamadı.')
    return runtime
  }

  private context(): EngineContext {
    return { now: this.clock(), random: { int: (max) => randomInt(max) }, id: () => randomUUID() }
  }

  private record(runtime: Runtime, events: DomainEvent[], scope: RoomChange['scope'] = 'all'): void {
    if (events.length === 0) return
    const at = this.clock()
    const logged = events.map((e) => ({ ...e, seq: ++runtime.seq, at }))
    this.store.save(
      runtime.state.code,
      { state: runtime.state, seq: runtime.seq, replies: [...runtime.replies], alerts: runtime.alerts },
      logged,
    )
    runtime.recent.push(...logged.map((e) => this.row(e, runtime.state)))
    if (runtime.recent.length > RECENT_EVENTS) runtime.recent.splice(0, runtime.recent.length - RECENT_EVENTS)
    this.changes.next({ code: runtime.state.code, scope })
  }

  private row(event: LoggedEvent, state: GameState): EventRow {
    return { seq: event.seq, at: event.at, type: event.type, text: describeEvent(event, state) }
  }

  private remember(runtime: Runtime, commandId: string, reply: Record<string, unknown>): void {
    runtime.replies.set(commandId, reply)
    if (runtime.replies.size > REPLY_CACHE) {
      const oldest = runtime.replies.keys().next().value
      if (oldest !== undefined) runtime.replies.delete(oldest)
    }
  }
}
