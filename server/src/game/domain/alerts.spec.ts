import { describe, expect, it } from 'vitest'
import { acknowledge, ALERT_LIMITS, emptyBook, evaluateAlerts, reconcileAlerts, type AlertCondition } from './alerts.js'
import { createGame } from './game-engine.js'
import type { GameState, Player, Stage } from './game.types.js'
import type { DeviceStatus } from './views.js'

const T0 = 1_000_000

function player(id: string, name: string, room: string, claimed = true): Player {
  return {
    id,
    name,
    room,
    line: `4${room}`,
    voice: 0,
    token: claimed ? `t-${id}` : null,
    claimedAt: claimed ? T0 : null,
    points: 0,
    eliminated: false,
    createdAt: T0,
  }
}

function game(players: Player[], patch: Partial<GameState> = {}): GameState {
  const ctx = { now: T0, random: { int: () => 0 }, id: () => 'x' }
  return { ...createGame({ code: 'ABCD', hostToken: 'h', ctx }).state, status: 'live', players, ...patch }
}

function stage(patch: Partial<Stage>): Stage {
  return {
    number: 1,
    kind: 'roomGuess',
    phase: 'active',
    seconds: 60,
    openedAt: T0,
    startedAt: T0,
    endsAt: T0 + 60_000,
    pausedAt: null,
    closedAt: null,
    awards: [2, 1, 1],
    participants: [],
    game: { kind: 'roomGuess', entries: {} },
    result: null,
    ...patch,
  }
}

function device(patch: Partial<DeviceStatus>): DeviceStatus {
  return {
    socketId: Math.random().toString(36),
    role: 'player',
    playerId: null,
    label: '',
    connected: true,
    connectedAt: T0,
    lastSeenAt: T0,
    disconnectedAt: null,
    rttMs: 20,
    battery: null,
    userAgent: '',
    sessions: 1,
    ...patch,
  }
}

const panel = (now: number) => device({ role: 'host', label: 'Yönetim', lastSeenAt: now })
const keys = (list: AlertCondition[]) => list.map((c) => c.key).sort()

describe('uyarı kuralları', () => {
  const begum = player('a', 'Begüm', '11')
  const saniye = player('b', 'Saniye', '12')

  it('kopan cihazı bekleme payından sonra kritik sayar ve oda ile hattı yazar', () => {
    const devices = [panel(T0), device({ playerId: 'a', connected: false, disconnectedAt: T0 + 1000 })]
    const state = game([begum])
    expect(evaluateAlerts({ state, devices, now: T0 + 3000, bootedAt: T0 })).toEqual([])
    const [alert] = evaluateAlerts({ state, devices, now: T0 + 1000 + ALERT_LIMITS.offlineGraceMs, bootedAt: T0 })
    expect(alert).toMatchObject({ key: 'offline:a', severity: 'critical', title: 'Begüm bağlı değil', detail: 'Oda 11 · hat 411', since: T0 + 1000 })
  })

  it('oyun başladığı halde cihazına bağlanmamış oyuncuyu uyarır, kurulumda uyarmaz', () => {
    const waiting = player('c', 'Eray', '13', false)
    expect(keys(evaluateAlerts({ state: game([waiting]), devices: [panel(T0)], now: T0, bootedAt: T0 }))).toEqual(['unclaimed:c'])
    expect(evaluateAlerts({ state: game([waiting], { status: 'setup' }), devices: [panel(T0)], now: T0, bootedAt: T0 })).toEqual([])
  })

  it('pil, sinyal ve gecikme uyarılarını ayırır, şarjdaki cihazı uyarmaz', () => {
    const now = T0 + 60_000
    const devices = [
      panel(now),
      device({ playerId: 'a', lastSeenAt: now - ALERT_LIMITS.staleMs - 1, battery: { level: 0.05, charging: false } }),
      device({ playerId: 'b', lastSeenAt: now, rttMs: 1200, battery: { level: 0.05, charging: true } }),
    ]
    const out = evaluateAlerts({ state: game([begum, saniye]), devices, now, bootedAt: T0 })
    expect(keys(out)).toEqual(['battery:a', 'slow:b', 'stale:a'])
    expect(out.find((c) => c.key === 'battery:a')?.severity).toBe('critical')
  })

  it('yönetim paneli kapalıysa uyarır ama uyarı ekranını panel saymaz', () => {
    const now = T0 + 60_000
    const devices = [
      device({ playerId: 'a', lastSeenAt: now }),
      device({ role: 'host', label: 'Uyarılar', lastSeenAt: now }),
      device({ role: 'host', label: 'Yönetim', connected: false, disconnectedAt: now - 10_000 }),
    ]
    expect(keys(evaluateAlerts({ state: game([begum]), devices, now, bootedAt: T0 }))).toEqual(['panel-offline'])
  })

  it('son 30 saniyede listesi eksik ve kilitsiz olanları adıyla sayar, duraklatılmış etapta saymaz', () => {
    const now = T0 + 40_000
    const entries = {
      a: { guesses: { b: '12' }, lockedAt: null, updatedAt: T0 },
      b: { guesses: {}, lockedAt: null, updatedAt: null },
    }
    const devices = [panel(now), device({ playerId: 'a', lastSeenAt: now }), device({ playerId: 'b', lastSeenAt: now })]
    const live = { participants: ['a', 'b'], game: { kind: 'roomGuess' as const, entries } }
    const running = evaluateAlerts({ state: game([begum, saniye], { stages: [stage(live)] }), devices, now, bootedAt: T0 })
    expect(running).toEqual([expect.objectContaining({ key: 'pending:1', title: '1 kişi listesi eksik', detail: 'Saniye' })])
    const paused = evaluateAlerts({ state: game([begum, saniye], { stages: [stage({ ...live, pausedAt: now - 5000 })] }), devices, now, bootedAt: T0 })
    expect(keys(paused)).toEqual(['paused:1'])
  })

  it('ilk etap başladıktan 20 dakika sonra klaket atılmadıysa hatırlatır', () => {
    const now = T0 + ALERT_LIMITS.markerEveryMs + 1
    const done = stage({ phase: 'done' })
    expect(keys(evaluateAlerts({ state: game([], { stages: [done] }), devices: [], now, bootedAt: T0 }))).toEqual(['marker-due'])
    const marked = game([], { stages: [done], markers: [{ id: 'm', label: 'x', at: now - 1000 }] })
    expect(evaluateAlerts({ state: marked, devices: [], now, bootedAt: T0 })).toEqual([])
  })

  it('oyun bitince uyarı üretmez', () => {
    expect(evaluateAlerts({ state: game([begum], { status: 'finished' }), devices: [], now: T0 + 999_999, bootedAt: T0 })).toEqual([])
  })
})

describe('uyarı defteri', () => {
  let n = 0
  const id = () => `id-${++n}`
  const offline: AlertCondition = { key: 'offline:a', severity: 'critical', title: 'Begüm bağlı değil', detail: 'Oda 11', since: 900 }
  const battery = (severity: 'warning' | 'critical'): AlertCondition => ({ key: 'battery:a', severity, title: 'Begüm pili azaldı', detail: '%15' })

  it('yeni koşulu açar, süren koşulu tekrar açmaz, biten koşulu süresiyle kapatır', () => {
    const first = reconcileAlerts(emptyBook(), [offline], 1000, id)
    expect(first.raised).toHaveLength(1)
    expect(first.book.active[0]?.raisedAt).toBe(900)
    const second = reconcileAlerts(first.book, [offline], 2000, id)
    expect(second.raised).toHaveLength(0)
    const third = reconcileAlerts(second.book, [], 3000, id)
    expect(third.resolved).toEqual([expect.objectContaining({ key: 'offline:a', resolvedAt: 3000 })])
    expect(third.book.history[0]?.key).toBe('offline:a')
  })

  it('görülen uyarı ağırlaşırsa yeniden görülmemiş sayılır', () => {
    const opened = reconcileAlerts(emptyBook(), [battery('warning')], 1000, id)
    const seen = acknowledge(opened.book, null, 1500)
    const worse = reconcileAlerts(seen.book, [battery('critical')], 2000, id)
    expect(worse.raised).toHaveLength(1)
    expect(worse.book.active[0]).toMatchObject({ severity: 'critical', acknowledgedAt: null })
  })

  it('görülmemiş kritik uyarıyı en üste koyar', () => {
    const book = reconcileAlerts(emptyBook(), [battery('warning'), offline], 1000, id).book
    expect(book.active.map((a) => a.key)).toEqual(['offline:a', 'battery:a'])
    const seen = acknowledge(book, book.active[0]!.id, 1100).book
    expect(reconcileAlerts(seen, [battery('warning'), offline], 1200, id).book.active.map((a) => a.key)).toEqual(['battery:a', 'offline:a'])
  })
})
