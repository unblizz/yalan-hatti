import { openStage } from './game-engine.js'
import { stageTargets } from './stages.js'
import type { GameState } from './game.types.js'
import type { DeviceStatus } from './views.js'

export type Severity = 'critical' | 'warning' | 'info'

export interface AlertCondition {
  key: string
  severity: Severity
  title: string
  detail: string
  since?: number
}

export interface Alert {
  id: string
  key: string
  severity: Severity
  title: string
  detail: string
  raisedAt: number
  acknowledgedAt: number | null
  resolvedAt: number | null
}

export interface AlertBook {
  active: Alert[]
  history: Alert[]
}

export interface AlertChanges {
  book: AlertBook
  raised: Alert[]
  resolved: Alert[]
}

export const MONITOR_LABELS: readonly string[] = ['Uyarılar', 'Hat ekranı']

export const ALERT_LIMITS = {
  offlineGraceMs: 4_000,
  staleMs: 12_000,
  slowRttMs: 800,
  lowBattery: 0.2,
  criticalBattery: 0.1,
  pendingWindowMs: 30_000,
  markerEveryMs: 20 * 60_000,
  historySize: 100,
} as const

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }

export const emptyBook = (): AlertBook => ({ active: [], history: [] })

export function evaluateAlerts(input: { state: GameState; devices: DeviceStatus[]; now: number; bootedAt: number }): AlertCondition[] {
  const { state, devices, now, bootedAt } = input
  if (state.status === 'finished') return []
  const out: AlertCondition[] = []
  const latest = (values: (number | null)[]) => Math.max(bootedAt, ...values.filter((v): v is number => v !== null))

  for (const player of state.players) {
    if (player.eliminated) continue
    const mine = devices.filter((d) => d.playerId === player.id)
    const live = mine.filter((d) => d.connected)
    if (live.length === 0) {
      if (player.token === null) {
        if (state.status === 'live') {
          out.push({ key: `unclaimed:${player.id}`, severity: 'warning', title: `${player.name} cihaza bağlanmadı`, detail: `Oda ${player.room}` })
        }
        continue
      }
      const since = Math.max(player.claimedAt ?? 0, latest(mine.map((d) => d.disconnectedAt)))
      if (now - since >= ALERT_LIMITS.offlineGraceMs) {
        out.push({ key: `offline:${player.id}`, severity: 'critical', title: `${player.name} bağlı değil`, detail: `Oda ${player.room} · hat ${player.line}`, since })
      }
      continue
    }
    const freshest = live.reduce((a, b) => (b.lastSeenAt > a.lastSeenAt ? b : a))
    if (now - freshest.lastSeenAt > ALERT_LIMITS.staleMs) {
      out.push({ key: `stale:${player.id}`, severity: 'warning', title: `${player.name} sinyal vermiyor`, detail: `Oda ${player.room}`, since: freshest.lastSeenAt })
    }
    if (freshest.rttMs !== null && freshest.rttMs > ALERT_LIMITS.slowRttMs) {
      out.push({ key: `slow:${player.id}`, severity: 'warning', title: `${player.name} bağlantısı yavaş`, detail: `${freshest.rttMs} ms` })
    }
    const battery = live.find((d) => d.battery && !d.battery.charging && d.battery.level < ALERT_LIMITS.lowBattery)?.battery
    if (battery) {
      out.push({
        key: `battery:${player.id}`,
        severity: battery.level < ALERT_LIMITS.criticalBattery ? 'critical' : 'warning',
        title: `${player.name} pili azaldı`,
        detail: `%${Math.round(battery.level * 100)}`,
      })
    }
  }

  const panels = devices.filter((d) => d.role === 'host' && !MONITOR_LABELS.includes(d.label))
  if (state.players.length > 0 && !panels.some((d) => d.connected)) {
    const since = latest(panels.map((d) => d.disconnectedAt))
    if (now - since >= ALERT_LIMITS.offlineGraceMs) {
      out.push({ key: 'panel-offline', severity: 'warning', title: 'Yönetim paneli kapalı', detail: 'Etap kontrolü yapılamıyor', since })
    }
  }

  const screens = devices.filter((d) => d.role === 'screen')
  if (screens.length > 0 && !screens.some((d) => d.connected)) {
    out.push({ key: 'screen-offline', severity: 'info', title: 'Sahne ekranı koptu', detail: 'Puan tablosu görünmüyor', since: latest(screens.map((d) => d.disconnectedAt)) })
  }

  const stage = openStage(state)
  if (stage?.phase === 'active' && stage.endsAt !== null) {
    if (stage.pausedAt) {
      out.push({ key: `paused:${stage.number}`, severity: 'info', title: `Etap ${stage.number} duraklatıldı`, detail: 'Süre işlemiyor', since: stage.pausedAt })
    } else if (stage.endsAt - now <= ALERT_LIMITS.pendingWindowMs) {
      const game = stage.game
      const pendingIds =
        game.kind === 'roomGuess'
          ? stage.participants.filter((id) => {
              const entry = game.entries[id]
              return !entry?.lockedAt && Object.keys(entry?.guesses ?? {}).length < stageTargets(state, id, stage).length
            })
          : game.kind === 'loveVote'
            ? stage.participants.filter((id) => !game.votes[id])
            : []
      if (pendingIds.length > 0) {
        const what = game.kind === 'loveVote' ? 'oy vermedi' : 'listesi eksik'
        out.push({
          key: `pending:${stage.number}`,
          severity: 'warning',
          title: `${pendingIds.length} kişi ${what}`,
          detail: pendingIds.map((id) => state.players.find((p) => p.id === id)?.name ?? '?').join(', '),
        })
      }
    }
  }

  const firstStart = state.stages.find((s) => s.startedAt !== null)?.startedAt ?? null
  if (firstStart !== null) {
    const lastMark = Math.max(firstStart, ...state.markers.map((m) => m.at))
    if (now - lastMark >= ALERT_LIMITS.markerEveryMs) {
      out.push({ key: 'marker-due', severity: 'info', title: 'Klaket zamanı', detail: `Son işaret ${Math.floor((now - lastMark) / 60_000)} dk önce`, since: lastMark })
    }
  }

  return out
}

export function reconcileAlerts(book: AlertBook, conditions: AlertCondition[], now: number, newId: () => string): AlertChanges {
  const byKey = new Map(book.active.map((a) => [a.key, a]))
  const seen = new Set<string>()
  const raised: Alert[] = []
  const active: Alert[] = []

  for (const condition of conditions) {
    if (seen.has(condition.key)) continue
    seen.add(condition.key)
    const existing = byKey.get(condition.key)
    if (existing) {
      const escalated = SEVERITY_RANK[condition.severity] < SEVERITY_RANK[existing.severity]
      const next = {
        ...existing,
        severity: condition.severity,
        title: condition.title,
        detail: condition.detail,
        acknowledgedAt: escalated ? null : existing.acknowledgedAt,
      }
      if (escalated) raised.push(next)
      active.push(next)
      continue
    }
    const alert: Alert = {
      id: newId(),
      key: condition.key,
      severity: condition.severity,
      title: condition.title,
      detail: condition.detail,
      raisedAt: Math.min(condition.since ?? now, now),
      acknowledgedAt: null,
      resolvedAt: null,
    }
    raised.push(alert)
    active.push(alert)
  }

  const resolved = book.active.filter((a) => !seen.has(a.key)).map((a) => ({ ...a, resolvedAt: now }))
  return {
    book: { active: sortAlerts(active), history: [...resolved.reverse(), ...book.history].slice(0, ALERT_LIMITS.historySize) },
    raised,
    resolved,
  }
}

export function acknowledge(book: AlertBook, alertId: string | null, now: number): { book: AlertBook; acknowledged: Alert[] } {
  const acknowledged: Alert[] = []
  const active = book.active.map((a) => {
    if (a.acknowledgedAt !== null || (alertId !== null && a.id !== alertId)) return a
    const next = { ...a, acknowledgedAt: now }
    acknowledged.push(next)
    return next
  })
  return { book: { ...book, active }, acknowledged }
}

export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort(
    (a, b) =>
      Number(a.acknowledgedAt !== null) - Number(b.acknowledgedAt !== null) ||
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      b.raisedAt - a.raisedAt,
  )
}

export function sameActive(a: Alert[], b: Alert[]): boolean {
  if (a.length !== b.length) return false
  return a.every((x, i) => {
    const y = b[i]!
    return x.id === y.id && x.severity === y.severity && x.title === y.title && x.detail === y.detail && x.acknowledgedAt === y.acknowledgedAt
  })
}
