import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { networkInterfaces } from 'node:os'
import { APP_CONFIG, type AppConfig } from '../../config/app.config.js'
import { GameError } from '../domain/game-error.js'
import { DEFAULT_ROSTER, STAGES } from '../domain/stages.js'
import { RoomService } from '../room.service.js'
import { createRoomSchema } from './messages.schema.js'

const CSV_COLUMNS = ['seq', 'zaman_iso', 'oda_saati', 'etap', 'aktor', 'olay', 'aciklama', 'veri'] as const

@Controller()
export class RoomsController {
  constructor(
    private readonly rooms: RoomService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('health')
  health(): { ok: true; now: number } {
    return { ok: true, now: Date.now() }
  }

  @Get('roster')
  roster(): { roster: readonly string[] } {
    return { roster: DEFAULT_ROSTER }
  }

  @Get('network')
  @Header('Cache-Control', 'no-store')
  network(): { joinUrls: string[] } {
    const ips = Object.values(networkInterfaces())
      .flat()
      .filter((n) => n && n.family === 'IPv4' && !n.internal)
      .map((n) => n!.address)
      .sort((a, b) => Number(b.startsWith('192.168.')) - Number(a.startsWith('192.168.')))
    const { securePort, webPort } = this.config
    return { joinUrls: ips.map((ip) => (securePort ? `https://${ip}:${securePort}` : `http://${ip}:${webPort}`)) }
  }

  @Post('rooms')
  create(@Body() body: unknown): { code: string; hostToken: string } {
    const parsed = createRoomSchema.safeParse(body ?? {})
    if (!parsed.success) throw new BadRequestException('Kadro listesi geçersiz.')
    return this.rooms.createRoom(parsed.data.roster)
  }

  @Get('rooms/:code')
  @Header('Cache-Control', 'no-store')
  room(@Param('code') code: string) {
    const state = this.rooms.state(this.known(code))
    return {
      code: state.code,
      status: state.status,
      players: state.players.map((p) => ({ id: p.id, name: p.name, claimed: p.token !== null, eliminated: p.eliminated })),
    }
  }

  @Get('rooms/:code/lines')
  @Header('Cache-Control', 'no-store')
  lines(@Param('code') code: string) {
    const state = this.rooms.state(this.known(code))
    return {
      code: state.code,
      digits: state.settings.lineDigits,
      lines: state.players.filter((p) => !p.eliminated && p.line).map((p) => p.line).sort(),
    }
  }

  @Post('rooms/:code/calls/:callId/recording')
  upload(
    @Param('code') code: string,
    @Param('callId') callId: string,
    @Headers('x-player-token') token: string | undefined,
    @Headers('content-type') mime: string | undefined,
    @Req() req: Request,
  ): { file: string } {
    const body = req.body as unknown
    if (!Buffer.isBuffer(body)) throw new BadRequestException('Ses verisi gelmedi.')
    try {
      return { file: this.rooms.saveRecording(this.known(code), callId, token, mime ?? 'audio/webm', body) }
    } catch (error) {
      if (error instanceof GameError && error.code === 'forbidden') throw new ForbiddenException(error.message)
      if (error instanceof GameError) throw new BadRequestException(error.message)
      throw error
    }
  }

  @Get('rooms/:code/calls/:callId/recording')
  recording(@Param('code') code: string, @Param('callId') callId: string, @Query('key') key: string | undefined, @Res() res: Response): void {
    const normalized = this.known(code)
    if (!this.rooms.isHost(normalized, key)) throw new ForbiddenException('Yönetim anahtarı geçersiz.')
    const path = this.rooms.recordingPath(normalized, callId)
    if (!path) throw new NotFoundException('Kayıt yok.')
    res.setHeader('Cache-Control', 'no-store')
    res.sendFile(path)
  }

  @Get('rooms/:code/events')
  events(@Param('code') code: string, @Query('key') key: string | undefined, @Query('format') format: string | undefined, @Res() res: Response): void {
    const normalized = this.known(code)
    if (!this.rooms.isHost(normalized, key)) throw new ForbiddenException('Yönetim anahtarı geçersiz.')
    const events = this.rooms.exportEvents(normalized)
    const state = this.rooms.state(normalized)
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
    const actorName = (actor: string | null) =>
      actor === null ? '' : actor === 'host' ? 'Yönetim' : (state.players.find((p) => p.id === actor)?.name ?? actor)
    const stageAt = (at: number) => state.stages.filter((s) => s.startedAt !== null && s.startedAt <= at).at(-1)?.number ?? ''
    res.setHeader('Cache-Control', 'no-store')

    if (format === 'csv') {
      const rows = events.map((e) =>
        [
          e.seq,
          new Date(e.at).toISOString(),
          new Date(e.at).toLocaleTimeString('tr-TR', { hour12: false }),
          stageAt(e.at),
          actorName(e.actor),
          e.type,
          this.rooms.describe(normalized, e),
          JSON.stringify(e.data),
        ].map(csvCell),
      )
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="yalan-hatti-${normalized}-${stamp}.csv"`)
      res.send('﻿' + [CSV_COLUMNS.join(','), ...rows.map((r) => r.join(','))].join('\r\n'))
      return
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="yalan-hatti-${normalized}-${stamp}.json"`)
    res.send(
      JSON.stringify(
        {
          code: normalized,
          exportedAt: new Date().toISOString(),
          players: state.players.map(({ token: _token, ...p }) => p),
          stages: state.stages.map((s) => ({ ...s, title: STAGES[s.kind].title })),
          calls: state.calls,
          markers: state.markers,
          events: events.map((e) => ({ ...e, text: this.rooms.describe(normalized, e) })),
        },
        null,
        2,
      ),
    )
  }

  private known(code: string): string {
    const normalized = code.toUpperCase()
    if (!this.rooms.exists(normalized)) throw new NotFoundException('Oda bulunamadı.')
    return normalized
  }
}

function csvCell(value: unknown): string {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
