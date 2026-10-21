import 'reflect-metadata'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { io, type Socket } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'

type Ack = { ok: true; data: Record<string, unknown> } | { ok: false; code: string; message: string }
type View = Record<string, any>

const dataDir = mkdtempSync(join(tmpdir(), 'yalan-hatti-'))
let app: INestApplication
let base = ''
const sockets: Socket[] = []

async function boot(): Promise<void> {
  app = await NestFactory.create(AppModule.forRoot({ port: 0, host: '127.0.0.1', dataDir, webPort: 3000, securePort: 3443 }), { logger: false })
  await app.listen(0, '127.0.0.1')
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`
}

async function shutdown(): Promise<void> {
  sockets.splice(0).forEach((s) => s.disconnect())
  await app.close()
}

function connect(): Promise<Socket> {
  const socket = io(base, { transports: ['websocket'], reconnection: false, forceNew: true })
  sockets.push(socket)
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket))
    socket.once('connect_error', reject)
  })
}

const send = (socket: Socket, event: string, payload: unknown): Promise<Ack> => socket.timeout(5000).emitWithAck(event, payload)

async function ok(socket: Socket, event: string, payload: unknown): Promise<Record<string, unknown>> {
  const ack = await send(socket, event, payload)
  if (!ack.ok) throw new Error(`${event}: ${ack.code} ${ack.message}`)
  return ack.data
}

const cmd = (socket: Socket, command: Record<string, unknown>, commandId?: string) => ok(socket, 'command', { command, ...(commandId ? { commandId } : {}) })

function waitFor<T = View>(socket: Socket, event: string, predicate: (value: T) => boolean, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler)
      reject(new Error(`${event} gelmedi`))
    }, timeoutMs)
    const handler = (value: T) => {
      if (!predicate(value)) return
      clearTimeout(timer)
      socket.off(event, handler)
      resolve(value)
    }
    socket.on(event, handler)
  })
}

const waitView = (socket: Socket, predicate: (view: View) => boolean, timeoutMs = 5000) => waitFor<View>(socket, 'view', predicate, timeoutMs)

async function resume(socket: Socket, payload: Record<string, unknown>): Promise<View> {
  const first = waitView(socket, () => true)
  await ok(socket, 'session.resume', payload)
  return first
}

async function createRoom(roster: string[]) {
  const res = await fetch(`${base}/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roster }) })
  return (await res.json()) as { code: string; hostToken: string }
}

async function hostOf(code: string, hostToken: string) {
  const socket = await connect()
  const view = await resume(socket, { code, role: 'host', token: hostToken, label: 'Yönetim' })
  return { socket, view }
}

async function claim(code: string, playerId: string) {
  const token = randomUUID()
  const socket = await connect()
  await ok(socket, 'player.join', { code, playerId, token })
  const view = await resume(socket, { code, role: 'player', token })
  return { socket, token, view }
}

beforeAll(boot)
afterAll(async () => {
  await shutdown()
  rmSync(dataDir, { recursive: true, force: true })
})

describe('kurulum ve bağlantı', () => {
  let code = ''
  let hostToken = ''
  let players: { id: string; name: string }[] = []

  it('kadroyla oda açar, katılım listesini verir, yönetim anahtarını korur', async () => {
    ;({ code, hostToken } = await createRoom(['Begüm', 'Saniye', 'Begüm']))
    const room = (await (await fetch(`${base}/rooms/${code}`)).json()) as { status: string; players: { id: string; name: string; claimed: boolean }[] }
    expect(room.status).toBe('setup')
    expect(room.players.map((p) => p.name)).toEqual(['Begüm', 'Saniye'])
    players = room.players
    const intruder = await connect()
    expect(await send(intruder, 'session.resume', { code, role: 'host', token: 'yanlis' })).toMatchObject({ ok: false, code: 'forbidden' })
    expect((await fetch(`${base}/rooms/${code}/events?key=yanlis`)).status).toBe(403)
  })

  it('afiş için hat numaralarını isimsiz verir', async () => {
    const res = (await (await fetch(`${base}/rooms/${code}/lines`)).json()) as { digits: number; lines: string[] }
    expect(res.digits).toBe(3)
    expect(res.lines).toHaveLength(2)
    expect(JSON.stringify(res)).not.toContain('Begüm')
  })

  it('aynı oyuncuyu ikinci cihaz alamaz; kopan cihaz aynı kimlikle döner ve yönetim kopmayı görür', async () => {
    const host = await hostOf(code, hostToken)
    const begum = await claim(code, players[0]!.id)
    expect(begum.view.me).toMatchObject({ name: 'Begüm', room: '11' })
    const thief = await connect()
    expect(await send(thief, 'player.join', { code, playerId: players[0]!.id, token: randomUUID() })).toMatchObject({ ok: false, code: 'claimed' })

    const sawDrop = waitView(host.socket, (v) => v.devices.some((d: View) => d.label === 'Begüm' && !d.connected))
    begum.socket.disconnect()
    await sawDrop
    const back = await connect()
    const sawReturn = waitView(host.socket, (v) => v.devices.some((d: View) => d.label === 'Begüm' && d.connected))
    const view = await resume(back, { code, role: 'player', token: begum.token })
    expect(view.me.id).toBe(players[0]!.id)
    await sawReturn
  })

  it('oyuncu yönetim komutu, sahne ekranı hiçbir komut gönderemez', async () => {
    const saniye = await claim(code, players[1]!.id)
    expect(await send(saniye.socket, 'command', { command: { type: 'game.start' } })).toMatchObject({ ok: false, code: 'invalid_input' })
    const screen = await connect()
    await resume(screen, { code, role: 'screen' })
    expect(await send(screen, 'command', { command: { type: 'marker.add', label: 'x' } })).toMatchObject({ ok: false, code: 'forbidden' })
  })
})

describe('telefon hattı', () => {
  it('hat numarasıyla arar, sesi yalnız karşı tarafa taşır, üçüncü kişiye meşgul verir, kaydı saklar', async () => {
    const { code, hostToken } = await createRoom(['Begüm', 'Saniye', 'Unlost'])
    const host = await hostOf(code, hostToken)
    const lines = Object.fromEntries((host.view.players as View[]).map((p) => [p.name, p.line]))
    const ids = Object.fromEntries((host.view.players as View[]).map((p) => [p.name, p.id]))
    const begum = await claim(code, ids.Begüm)
    const saniye = await claim(code, ids.Saniye)
    const unlost = await claim(code, ids.Unlost)
    await cmd(host.socket, { type: 'game.start' })
    await cmd(host.socket, { type: 'lines.set', open: true })

    const ringing = waitView(saniye.socket, (v) => v.call?.status === 'ringing')
    const dialed = await cmd(begum.socket, { type: 'call.dial', number: lines.Saniye })
    expect(dialed.result).toBe('ringing')
    const incoming = await ringing
    expect(incoming.call).toMatchObject({ direction: 'in', number: null })

    const talking = waitView(begum.socket, (v) => v.call?.status === 'active')
    await cmd(saniye.socket, { type: 'call.answer', callId: incoming.call.id })
    await talking

    const offer = waitFor<View>(saniye.socket, 'rtc.signal', (m) => m.payload.type === 'offer')
    let leaked = false
    unlost.socket.on('rtc.signal', () => (leaked = true))
    expect(await ok(begum.socket, 'rtc.signal', { callId: incoming.call.id, payload: { type: 'offer', sdp: 'v=0' } })).toEqual({ delivered: 1 })
    expect((await offer).from).toBe('caller')
    expect(await send(unlost.socket, 'rtc.signal', { callId: incoming.call.id, payload: { type: 'offer' } })).toMatchObject({ ok: false, code: 'forbidden' })

    expect((await cmd(unlost.socket, { type: 'call.dial', number: lines.Begüm })).result).toBe('busy')

    const board = await waitView(host.socket, (v) => v.lines.some((l: View) => l.status === 'talking'))
    expect(board.lines.find((l: View) => l.name === 'Begüm')).toMatchObject({ status: 'talking', withName: 'Saniye' })

    const upload = await fetch(`${base}/rooms/${code}/calls/${incoming.call.id}/recording`, {
      method: 'POST',
      headers: { 'content-type': 'audio/webm', 'x-player-token': begum.token },
      body: new Uint8Array([1, 2, 3, 4]),
    })
    expect(upload.status).toBe(201)
    const stranger = await fetch(`${base}/rooms/${code}/calls/${incoming.call.id}/recording`, {
      method: 'POST',
      headers: { 'content-type': 'audio/webm', 'x-player-token': unlost.token },
      body: new Uint8Array([1]),
    })
    expect(stranger.status).toBe(403)
    const download = await fetch(`${base}/rooms/${code}/calls/${incoming.call.id}/recording?key=${hostToken}`)
    expect([...new Uint8Array(await download.arrayBuffer())]).toEqual([1, 2, 3, 4])

    await cmd(begum.socket, { type: 'call.hangup', callId: incoming.call.id })
    expect(leaked).toBe(false)
  })
})

describe('etap ve dayanıklılık', () => {
  let code = ''
  let hostToken = ''

  it('Tahmin Oyunu: liste, kilit, sonuç, elle sıralama ve puan tablosu', async () => {
    ;({ code, hostToken } = await createRoom(['Begüm', 'Saniye', 'Unlost']))
    const host = await hostOf(code, hostToken)
    const p = Object.fromEntries((host.view.players as View[]).map((x) => [x.name, x]))
    const begum = await claim(code, p.Begüm.id)
    const saniye = await claim(code, p.Saniye.id)
    await claim(code, p.Unlost.id)
    await cmd(host.socket, { type: 'game.start' })
    await cmd(host.socket, { type: 'stage.open', kind: 'roomGuess' })
    expect(await send(host.socket, 'command', { command: { type: 'stage.start', seconds: 60 } })).toMatchObject({ ok: false, code: 'checklist_required' })
    await cmd(host.socket, { type: 'checklist.confirm', items: ['Kameralar kayıtta'] })
    const started = waitView(begum.socket, (v) => v.stage?.phase === 'active')
    await cmd(host.socket, { type: 'stage.start', seconds: 60 })
    const view = await started
    expect(view.linesOpen).toBe(true)
    expect(view.stage.roomGuess.targets.map((t: View) => t.name).sort()).toEqual(['Saniye', 'Unlost'])

    await cmd(begum.socket, { type: 'guess.set', targetId: p.Saniye.id, room: p.Saniye.room })
    await cmd(begum.socket, { type: 'guess.set', targetId: p.Unlost.id, room: p.Unlost.room })
    await cmd(saniye.socket, { type: 'guess.set', targetId: p.Begüm.id, room: p.Begüm.room })
    await cmd(saniye.socket, { type: 'guess.lock' })
    expect(await send(saniye.socket, 'command', { command: { type: 'guess.set', targetId: p.Unlost.id, room: '1' } })).toMatchObject({ ok: false, code: 'locked' })

    const review = waitView(host.socket, (v) => v.stage?.phase === 'review')
    await cmd(host.socket, { type: 'stage.close' })
    const reviewed = await review
    expect(reviewed.stage.standings.map((r: View) => [r.name, r.position, r.points, r.award])).toEqual([
      ['Begüm', 1, 2, 2],
      ['Saniye', 2, 1, 1],
      ['Unlost', 3, 0, 0],
    ])
    await cmd(host.socket, { type: 'stage.award', playerId: p.Unlost.id, award: -1 })
    const done = waitView(host.socket, (v) => v.stage?.phase === 'done')
    await cmd(host.socket, { type: 'stage.confirm' })
    expect((await done).leaderboard.map((r: View) => [r.name, r.points])).toEqual([
      ['Begüm', 2],
      ['Saniye', 1],
      ['Unlost', -1],
    ])
  })

  it('sunucu kapanıp açılınca etap kaldığı yerden sürer, işlenmiş komut tekrar işlenmez', async () => {
    const host = await hostOf(code, hostToken)
    await cmd(host.socket, { type: 'stage.open', kind: 'roomGuess' })
    await cmd(host.socket, { type: 'checklist.confirm', items: ['Kameralar kayıtta'] })
    const started = waitView(host.socket, (v) => v.stage?.phase === 'active')
    await cmd(host.socket, { type: 'stage.start', seconds: 120 })
    const before = await started
    const markerId = randomUUID()
    await cmd(host.socket, { type: 'marker.add', label: 'Çökme öncesi' }, markerId)

    await shutdown()
    await boot()

    const again = await hostOf(code, hostToken)
    expect(again.view.stage).toMatchObject({ number: 2, phase: 'active', endsAt: before.stage.endsAt })
    expect(again.view.linesOpen).toBe(true)
    await cmd(again.socket, { type: 'marker.add', label: 'Çökme öncesi' }, markerId)
    const exported = (await (await fetch(`${base}/rooms/${code}/events?key=${hostToken}`)).json()) as { markers: unknown[] }
    expect(exported.markers).toHaveLength(1)
    expect(again.view.events.some((e: View) => e.type === 'server.started')).toBe(true)
  })

  it('olay günlüğünü kurgu için CSV olarak verir', async () => {
    const res = await fetch(`${base}/rooms/${code}/events?key=${hostToken}&format=csv`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain('İŞARET: Çökme öncesi')
    expect(text).toContain('Etap 1 puanları yazıldı')
  })
})

describe('uyarılar', () => {
  it('kopan cihaz için kritik uyarı açar, görüldü işaretler, cihaz dönünce süresiyle kapatır', async () => {
    const { code, hostToken } = await createRoom(['Eray', 'Limon'])
    const host = await hostOf(code, hostToken)
    const eray = await claim(code, (host.view.players as View[]).find((p) => p.name === 'Eray')!.id)
    const raised = waitView(host.socket, (v) => v.alerts.active.some((a: View) => a.key.startsWith('offline:')), 9000)
    eray.socket.disconnect()
    const alert = (await raised).alerts.active.find((a: View) => a.key.startsWith('offline:'))
    expect(alert).toMatchObject({ severity: 'critical', title: 'Eray bağlı değil' })
    const seen = waitView(host.socket, (v) => v.alerts.active.some((a: View) => a.id === alert.id && a.acknowledgedAt !== null))
    await cmd(host.socket, { type: 'alert.ack', alertId: alert.id })
    await seen
    const cleared = waitView(host.socket, (v) => !v.alerts.active.some((a: View) => a.id === alert.id))
    const back = await connect()
    await resume(back, { code, role: 'player', token: eray.token })
    expect((await cleared).alerts.history[0].id).toBe(alert.id)
  })

  it('katılım adresini güvenli kapıyla verir', async () => {
    const res = (await (await fetch(`${base}/network`)).json()) as { joinUrls: string[] }
    for (const url of res.joinUrls) expect(url).toMatch(/^https:\/\/[\d.]+:3443$/)
  })
})
