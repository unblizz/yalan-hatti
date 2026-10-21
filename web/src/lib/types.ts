export type GameStatus = 'setup' | 'live' | 'finished'
export type StageKind = 'roomGuess' | 'buttons' | 'bomb' | 'loveVote'
export type ButtonChoice = 'green' | 'red'
export type StagePhase = 'intro' | 'active' | 'review' | 'done'
export type Role = 'host' | 'player' | 'screen'
export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'declined' | 'busy' | 'unreachable'
export type LineState = 'idle' | 'dialing' | 'ringing' | 'talking'
export type Severity = 'critical' | 'warning' | 'info'

export interface Marker {
  id: string
  label: string
  at: number
}

export interface LeaderRow {
  id: string
  name: string
  points: number
  eliminated: boolean
}

export interface StageHeader {
  number: number
  total: number
  kind: StageKind
  title: string
  subtitle: string
  rules: string[]
  phase: StagePhase
  seconds: number
  awards: number[]
  scoreLabel: string
  manual: boolean
  usesPhone: boolean
  startedAt: number | null
  endsAt: number | null
  pausedAt: number | null
}

export interface Standing {
  playerId: string
  name: string
  position: number | null
  points: number
  award: number
}

export interface PlayerView {
  role: 'player'
  serverNow: number
  code: string
  status: GameStatus
  linesOpen: boolean
  voice: { enabled: boolean; pitch: number }
  me: { id: string; name: string; room: string; line: string; points: number; eliminated: boolean }
  leaderboard: LeaderRow[]
  stage:
    | (StageHeader & {
        playing: boolean
        roomGuess: { targets: { id: string; name: string }[]; guesses: Record<string, string>; lockedAt: number | null } | null
        buttons: {
          points: number
          rounds: number
          timeoutSeconds: number
          pair: { id: string; partnerName: string; partnerLine: string; myChoice: ButtonChoice | null; startedAt: number } | null
          last: {
            id: string
            partnerName: string
            myChoice: ButtonChoice | null
            partnerChoice: ButtonChoice | null
            delta: number
            outcome: 'decided' | 'timeout' | 'void' | null
            at: number | null
          } | null
        } | null
        loveVote: { targets: { id: string; name: string }[]; myVote: string | null } | null
        reveal: { from: string; to: string }[]
        result: { points: number; position: number | null; of: number; award: number | null; confirmed: boolean } | null
      })
    | null
  call: { id: string; direction: 'in' | 'out'; number: string | null; status: CallStatus; startedAt: number; answeredAt: number | null } | null
  recentCalls: { id: string; direction: 'in' | 'out'; number: string | null; status: CallStatus; startedAt: number; durationMs: number }[]
  marker: Marker | null
  winners: (string | null)[]
}

export interface ScreenView {
  role: 'screen'
  serverNow: number
  code: string
  status: GameStatus
  linesOpen: boolean
  activeCalls: number
  stage:
    | (StageHeader & {
        players: number
        progress: { done: number; label: string }
        confirmed: boolean
        standings: Standing[]
        reveal: { from: string; to: string }[]
      })
    | null
  leaderboard: LeaderRow[]
  playerCount: number
  marker: Marker | null
  winners: (string | null)[]
}

export interface DeviceStatus {
  socketId: string
  role: Role
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

export interface LineRow {
  playerId: string
  name: string
  room: string
  line: string
  online: boolean
  claimed: boolean
  eliminated: boolean
  status: LineState
  callId: string | null
  withName: string | null
  withRoom: string | null
  since: number | null
}

export interface HostPlayer {
  id: string
  name: string
  room: string
  line: string
  voice: number
  claimed: boolean
  online: boolean
  points: number
  eliminated: boolean
}

export interface StageRow {
  playerId: string
  name: string
  filled: number
  total: number
  correct: number
  lockedAt: number | null
  updatedAt: number | null
  guesses: { targetId: string; targetName: string; room: string | null; correct: boolean }[]
}

export interface PairSide {
  id: string
  name: string
  choice: ButtonChoice | null
  pairId: string
}

export interface HostStage extends StageHeader {
  checklistReady: boolean
  participants: { id: string; name: string }[]
  rows: StageRow[]
  buttons: {
    timeoutSeconds: number
    active: { id: string; startedAt: number; a: PairSide; b: PairSide }[]
    waiting: { id: string; name: string; since: number }[]
    history: { id: string; at: number; outcome: 'decided' | 'timeout' | 'void' | null; a: PairSide & { delta: number }; b: PairSide & { delta: number } }[]
  } | null
  votes: { fromId: string; from: string; toId: string; to: string; at: number }[]
  notVoted: string[]
  standings: Standing[]
  result: { adjusted: boolean; confirmedAt: number | null; manual: boolean } | null
}

export interface CallRow {
  id: string
  status: CallStatus
  caller: string
  callerLine: string
  callee: string | null
  dialed: string
  startedAt: number
  answeredAt: number | null
  endedAt: number | null
  durationMs: number
  recording: boolean
}

export interface HostView {
  role: 'host'
  serverNow: number
  code: string
  status: GameStatus
  settings: { lineDigits: 3 | 4; callerId: boolean; voiceChanger: boolean; ringSeconds: number; awards: number[]; pairTimeoutSeconds: number; maxPlayers: number }
  linesOpen: boolean
  totalStages: number
  catalog: { kind: StageKind; title: string; subtitle: string; defaultSeconds: number; manual: boolean; played: number }[]
  awardSchemes: number[][]
  players: HostPlayer[]
  leaderboard: LeaderRow[]
  lines: LineRow[]
  stage: HostStage | null
  stages: { number: number; title: string; phase: StagePhase; awards: { name: string; award: number }[]; startedAt: number | null; closedAt: number | null }[]
  calls: CallRow[]
  devices: DeviceStatus[]
  events: { seq: number; at: number; type: string; text: string }[]
  alerts: AlertBook
  markers: Marker[]
  winners: (string | null)[]
}

export type AnyView = PlayerView | ScreenView | HostView

export type Ack<T = Record<string, unknown>> = { ok: true; data: T } | { ok: false; code: string; message: string }
