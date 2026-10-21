import type { AlertBook } from './alerts.js'
import { currentStage, openCallOf } from './game-engine.js'
import type { Call, GameState, Player, Stage } from './game.types.js'
import {
  activePair,
  AWARD_SCHEMES,
  sharedPositions,
  STAGE_ORDER,
  STAGES,
  stageScores,
  stageTargets,
  TOTAL_STAGES,
  VOICE_PRESETS,
} from './stages.js'

export type DeviceRole = 'host' | 'player' | 'screen'

export interface DeviceStatus {
  socketId: string
  role: DeviceRole
  playerId: string | null
  label: string
  connected: boolean
  connectedAt: number
  lastSeenAt: number
  disconnectedAt: number | null
  rttMs: number | null
  battery: { level: number; charging: boolean } | null
  userAgent: string
  sessions: number
}

export interface EventRow {
  seq: number
  at: number
  type: string
  text: string
}

export type LineState = 'idle' | 'dialing' | 'ringing' | 'talking'

const nameOf = (state: GameState, id: string | null) => state.players.find((p) => p.id === id)?.name ?? null
const isOnline = (devices: DeviceStatus[], id: string) => devices.some((d) => d.playerId === id && d.connected)

function leaderboard(state: GameState) {
  return [...state.players]
    .sort((a, b) => Number(a.eliminated) - Number(b.eliminated) || b.points - a.points || a.name.localeCompare(b.name, 'tr'))
    .map((p) => ({ id: p.id, name: p.name, points: p.points, eliminated: p.eliminated }))
}

function stageHeader(stage: Stage) {
  const def = STAGES[stage.kind]
  return {
    number: stage.number,
    total: TOTAL_STAGES,
    kind: stage.kind,
    title: def.title,
    subtitle: def.subtitle,
    rules: def.rules,
    phase: stage.phase,
    seconds: stage.seconds,
    awards: stage.awards,
    scoreLabel: def.scoreLabel,
    manual: def.manual,
    usesPhone: def.usesPhone,
    startedAt: stage.startedAt,
    endsAt: stage.endsAt,
    pausedAt: stage.pausedAt,
  }
}

function lineState(state: GameState, player: Player): { state: LineState; call: Call | null; withId: string | null } {
  const call = openCallOf(state, player.id)
  if (!call) return { state: 'idle', call: null, withId: null }
  const outgoing = call.caller === player.id
  const withId = outgoing ? call.callee : call.caller
  if (call.status === 'active') return { state: 'talking', call, withId }
  return { state: outgoing ? 'dialing' : 'ringing', call, withId }
}

export function lineBoard(state: GameState, devices: DeviceStatus[]) {
  return [...state.players]
    .sort((a, b) => Number(a.room) - Number(b.room) || a.room.localeCompare(b.room))
    .map((p) => {
      const { state: status, call, withId } = lineState(state, p)
      return {
        playerId: p.id,
        name: p.name,
        room: p.room,
        line: p.line,
        online: isOnline(devices, p.id),
        claimed: p.token !== null,
        eliminated: p.eliminated,
        status,
        callId: call?.id ?? null,
        withName: nameOf(state, withId),
        withRoom: state.players.find((x) => x.id === withId)?.room ?? null,
        since: call ? (call.answeredAt ?? call.startedAt) : null,
      }
    })
}

function callRow(state: GameState, call: Call, now: number) {
  const name = (id: string | null) => nameOf(state, id) ?? '—'
  return {
    id: call.id,
    status: call.status,
    caller: name(call.caller),
    callerLine: state.players.find((p) => p.id === call.caller)?.line ?? '',
    callee: call.callee ? name(call.callee) : null,
    dialed: call.dialed,
    startedAt: call.startedAt,
    answeredAt: call.answeredAt,
    endedAt: call.endedAt,
    durationMs: call.answeredAt ? (call.endedAt ?? now) - call.answeredAt : 0,
    recording: call.recording !== null,
  }
}

function standings(state: GameState, stage: Stage) {
  const result = stage.result
  const scores = result?.scores ?? stageScores(state, stage)
  const positions = result ? result.positions : sharedPositions(scores)
  return scores
    .map((s) => ({
      playerId: s.playerId,
      name: nameOf(state, s.playerId) ?? '?',
      position: positions[s.playerId] ?? null,
      points: s.points,
      award: result?.awards[s.playerId] ?? 0,
    }))
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || b.award - a.award || a.name.localeCompare(b.name, 'tr'))
}

function voteList(state: GameState, stage: Stage) {
  if (stage.game.kind !== 'loveVote') return []
  return Object.entries(stage.game.votes).map(([fromId, v]) => ({
    fromId,
    from: nameOf(state, fromId) ?? '?',
    toId: v.targetId,
    to: nameOf(state, v.targetId) ?? '?',
    at: v.at,
  }))
}

export function playerView(state: GameState, player: Player, now: number) {
  const stage = currentStage(state)
  const call = openCallOf(state, player.id)
  const numberFor = (c: Call) => {
    if (c.caller === player.id) return c.dialed
    return state.settings.callerId ? (state.players.find((p) => p.id === c.caller)?.line ?? null) : null
  }
  const playing = stage ? stage.participants.includes(player.id) : false
  const game = stage?.game
  const active = stage?.phase === 'active' && playing
  const pair = stage && game?.kind === 'buttons' ? activePair(stage, player.id) : null
  const lastPair =
    game?.kind === 'buttons'
      ? [...game.pairs].reverse().find((p) => p.resolvedAt !== null && p.outcome !== 'void' && (p.a === player.id || p.b === player.id))
      : undefined
  const other = (p: { a: string; b: string }) => (p.a === player.id ? p.b : p.a)
  const result = stage?.result
  return {
    role: 'player' as const,
    serverNow: now,
    code: state.code,
    status: state.status,
    linesOpen: state.linesOpen,
    voice: { enabled: state.settings.voiceChanger, pitch: VOICE_PRESETS[player.voice] ?? 1 },
    me: { id: player.id, name: player.name, room: player.room, line: player.line, points: player.points, eliminated: player.eliminated },
    leaderboard: leaderboard(state),
    stage: stage && {
      ...stageHeader(stage),
      playing,
      roomGuess:
        active && game?.kind === 'roomGuess' && game.entries[player.id]
          ? {
              targets: stageTargets(state, player.id, stage).map((p) => ({ id: p.id, name: p.name })),
              guesses: game.entries[player.id]!.guesses,
              lockedAt: game.entries[player.id]!.lockedAt,
            }
          : null,
      buttons:
        active && game?.kind === 'buttons'
          ? {
              points: game.points[player.id] ?? 0,
              rounds: game.pairs.filter((p) => p.resolvedAt !== null && p.outcome !== 'void' && (p.a === player.id || p.b === player.id)).length,
              timeoutSeconds: state.settings.pairTimeoutSeconds,
              pair: pair && {
                id: pair.id,
                partnerName: nameOf(state, other(pair)) ?? '?',
                partnerLine: state.players.find((p) => p.id === other(pair))?.line ?? '',
                myChoice: pair.choices[player.id]?.choice ?? null,
                startedAt: pair.startedAt,
              },
              last: lastPair
                ? {
                    id: lastPair.id,
                    partnerName: nameOf(state, other(lastPair)) ?? '?',
                    myChoice: lastPair.choices[player.id]?.choice ?? null,
                    partnerChoice: lastPair.choices[other(lastPair)]?.choice ?? null,
                    delta: lastPair.deltas[player.id] ?? 0,
                    outcome: lastPair.outcome,
                    at: lastPair.resolvedAt,
                  }
                : null,
            }
          : null,
      loveVote:
        active && game?.kind === 'loveVote'
          ? {
              targets: stageTargets(state, player.id, stage).map((p) => ({ id: p.id, name: p.name })),
              myVote: game.votes[player.id]?.targetId ?? null,
            }
          : null,
      reveal: stage.phase === 'review' || stage.phase === 'done' ? voteList(state, stage).map(({ from, to }) => ({ from, to })) : [],
      result:
        result && playing
          ? {
              points: result.scores.find((s) => s.playerId === player.id)?.points ?? 0,
              position: result.positions[player.id] ?? null,
              of: stage.participants.length,
              award: result.confirmedAt !== null ? (result.awards[player.id] ?? 0) : null,
              confirmed: result.confirmedAt !== null,
            }
          : null,
    },
    call: call && {
      id: call.id,
      direction: call.caller === player.id ? ('out' as const) : ('in' as const),
      number: numberFor(call),
      status: call.status,
      startedAt: call.startedAt,
      answeredAt: call.answeredAt,
    },
    recentCalls: state.calls
      .filter((c) => c.caller === player.id || c.callee === player.id)
      .slice(-12)
      .reverse()
      .map((c) => ({
        id: c.id,
        direction: c.caller === player.id ? ('out' as const) : ('in' as const),
        number: numberFor(c),
        status: c.status,
        startedAt: c.startedAt,
        durationMs: c.answeredAt && c.endedAt ? c.endedAt - c.answeredAt : 0,
      })),
    marker: state.markers.at(-1) ?? null,
    winners: state.winnerIds.map((id) => nameOf(state, id)),
  }
}

function progressOf(stage: Stage) {
  const game = stage.game
  switch (game.kind) {
    case 'roomGuess':
      return { done: stage.participants.filter((id) => game.entries[id]?.lockedAt).length, label: 'liste kilitli' }
    case 'loveVote':
      return { done: Object.keys(game.votes).length, label: 'oy verildi' }
    case 'buttons':
      return { done: game.pairs.filter((p) => p.resolvedAt !== null && p.outcome !== 'void').length, label: 'eşleşme bitti' }
    case 'bomb':
      return { done: 0, label: '' }
  }
}

export function screenView(state: GameState, now: number) {
  const stage = currentStage(state)
  const showResult = stage && (stage.phase === 'done' || stage.phase === 'review')
  return {
    role: 'screen' as const,
    serverNow: now,
    code: state.code,
    status: state.status,
    linesOpen: state.linesOpen,
    activeCalls: state.calls.filter((c) => c.status === 'active').length,
    stage: stage && {
      ...stageHeader(stage),
      players: stage.participants.length,
      progress: progressOf(stage),
      confirmed: stage.result?.confirmedAt !== null && stage.result !== null,
      standings: showResult ? standings(state, stage) : [],
      reveal: showResult ? voteList(state, stage).map(({ from, to }) => ({ from, to })) : [],
    },
    leaderboard: leaderboard(state),
    playerCount: state.players.length,
    marker: state.markers.at(-1) ?? null,
    winners: state.winnerIds.map((id) => nameOf(state, id)),
  }
}

function stageDetail(state: GameState, stage: Stage, now: number) {
  const name = (id: string) => nameOf(state, id) ?? '?'
  const game = stage.game
  const roomOf = new Map(state.players.map((p) => [p.id, p.room]))
  const rows =
    game.kind === 'roomGuess'
      ? stage.participants.map((playerId) => {
          const entry = game.entries[playerId]
          const guesses = stageTargets(state, playerId, stage).map((t) => {
            const room = entry?.guesses[t.id] ?? null
            return { targetId: t.id, targetName: t.name, room, correct: room !== null && room === roomOf.get(t.id) }
          })
          return {
            playerId,
            name: name(playerId),
            filled: guesses.filter((g) => g.room !== null).length,
            total: guesses.length,
            correct: guesses.filter((g) => g.correct).length,
            lockedAt: entry?.lockedAt ?? null,
            updatedAt: entry?.updatedAt ?? null,
            guesses,
          }
        })
      : []
  const buttons =
    game.kind === 'buttons'
      ? (() => {
          const busy = new Set(game.pairs.filter((p) => p.resolvedAt === null).flatMap((p) => [p.a, p.b]))
          const side = (pairId: string, id: string, choices: Record<string, { choice: 'green' | 'red' }>) => ({
            id,
            name: name(id),
            choice: choices[id]?.choice ?? null,
            pairId,
          })
          return {
            timeoutSeconds: state.settings.pairTimeoutSeconds,
            active: game.pairs
              .filter((p) => p.resolvedAt === null)
              .map((p) => ({ id: p.id, startedAt: p.startedAt, a: side(p.id, p.a, p.choices), b: side(p.id, p.b, p.choices) })),
            waiting: stage.participants.filter((id) => !busy.has(id)).map((id) => ({ id, name: name(id), since: game.freeSince[id] ?? now })),
            history: game.pairs
              .filter((p) => p.resolvedAt !== null)
              .slice(-40)
              .reverse()
              .map((p) => ({
                id: p.id,
                at: p.resolvedAt!,
                outcome: p.outcome,
                a: { ...side(p.id, p.a, p.choices), delta: p.deltas[p.a] ?? 0 },
                b: { ...side(p.id, p.b, p.choices), delta: p.deltas[p.b] ?? 0 },
              })),
          }
        })()
      : null
  const votes = game.kind === 'loveVote' ? voteList(state, stage) : []
  const result = stage.result
  return {
    ...stageHeader(stage),
    checklistReady: state.checklistConfirmedFor === stage.number,
    participants: stage.participants.map((id) => ({ id, name: name(id) })),
    rows,
    buttons,
    votes,
    notVoted: game.kind === 'loveVote' ? stage.participants.filter((id) => !game.votes[id]).map(name) : [],
    standings: stage.phase === 'active' || result ? standings(state, stage) : [],
    result: result && {
      adjusted: result.adjusted,
      confirmedAt: result.confirmedAt,
      manual: result.manual,
    },
  }
}

export function hostView(state: GameState, now: number, devices: DeviceStatus[], events: EventRow[], alerts: AlertBook) {
  const stage = currentStage(state)
  return {
    role: 'host' as const,
    serverNow: now,
    code: state.code,
    status: state.status,
    settings: state.settings,
    linesOpen: state.linesOpen,
    totalStages: TOTAL_STAGES,
    catalog: STAGE_ORDER.map((kind) => {
      const def = STAGES[kind]
      return {
        kind,
        title: def.title,
        subtitle: def.subtitle,
        defaultSeconds: def.defaultSeconds,
        manual: def.manual,
        played: state.stages.filter((s) => s.kind === kind).length,
      }
    }),
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      room: p.room,
      line: p.line,
      voice: p.voice,
      claimed: p.token !== null,
      online: isOnline(devices, p.id),
      points: p.points,
      eliminated: p.eliminated,
    })),
    leaderboard: leaderboard(state),
    lines: lineBoard(state, devices),
    stage: stage && stageDetail(state, stage, now),
    awardSchemes: AWARD_SCHEMES,
    stages: state.stages.map((s) => ({
      number: s.number,
      title: STAGES[s.kind].title,
      phase: s.phase,
      awards: Object.entries(s.result?.awards ?? {}).map(([id, award]) => ({ name: nameOf(state, id) ?? '?', award })),
      startedAt: s.startedAt,
      closedAt: s.closedAt,
    })),
    calls: state.calls.slice(-60).reverse().map((c) => callRow(state, c, now)),
    devices,
    events,
    alerts,
    markers: [...state.markers].reverse(),
    winners: state.winnerIds.map((id) => nameOf(state, id)),
  }
}

export type PlayerView = ReturnType<typeof playerView>
export type ScreenView = ReturnType<typeof screenView>
export type HostView = ReturnType<typeof hostView>
