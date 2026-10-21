export const STATE_VERSION = 3

export type GameStatus = 'setup' | 'live' | 'finished'

export type StageKind = 'roomGuess' | 'buttons' | 'bomb' | 'loveVote'

export type ButtonChoice = 'green' | 'red'

export type StagePhase = 'intro' | 'active' | 'review' | 'done'

export interface Settings {
  lineDigits: 3 | 4
  callerId: boolean
  voiceChanger: boolean
  ringSeconds: number
  awards: number[]
  pairTimeoutSeconds: number
  maxPlayers: number
}

export interface Player {
  id: string
  name: string
  room: string
  line: string
  voice: number
  token: string | null
  claimedAt: number | null
  points: number
  eliminated: boolean
  createdAt: number
}

export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'declined' | 'busy' | 'unreachable'

export interface Call {
  id: string
  caller: string
  callee: string | null
  dialed: string
  status: CallStatus
  startedAt: number
  answeredAt: number | null
  endedAt: number | null
  endedBy: string | null
  recording: string | null
}

export interface RoomGuessEntry {
  guesses: Record<string, string>
  lockedAt: number | null
  updatedAt: number | null
}

export interface ButtonPair {
  id: string
  a: string
  b: string
  startedAt: number
  choices: Record<string, { choice: ButtonChoice; at: number }>
  resolvedAt: number | null
  outcome: 'decided' | 'timeout' | 'void' | null
  deltas: Record<string, number>
}

export interface LoveVote {
  targetId: string
  at: number
}

export type StageGame =
  | { kind: 'roomGuess'; entries: Record<string, RoomGuessEntry> }
  | { kind: 'buttons'; pairs: ButtonPair[]; points: Record<string, number>; freeSince: Record<string, number> }
  | { kind: 'bomb' }
  | { kind: 'loveVote'; votes: Record<string, LoveVote> }

export interface StageScore {
  playerId: string
  points: number
}

export interface StageResult {
  scores: StageScore[]
  positions: Record<string, number>
  awards: Record<string, number>
  manual: boolean
  adjusted: boolean
  confirmedAt: number | null
}

export interface Stage {
  number: number
  kind: StageKind
  phase: StagePhase
  seconds: number
  awards: number[]
  openedAt: number
  startedAt: number | null
  endsAt: number | null
  pausedAt: number | null
  closedAt: number | null
  participants: string[]
  game: StageGame
  result: StageResult | null
}

export interface Marker {
  id: string
  label: string
  at: number
}

export interface GameState {
  version: typeof STATE_VERSION
  code: string
  hostToken: string
  createdAt: number
  status: GameStatus
  settings: Settings
  players: Player[]
  stages: Stage[]
  calls: Call[]
  markers: Marker[]
  linesOpen: boolean
  checklistConfirmedFor: number
  winnerIds: string[]
}

export interface DomainEvent {
  type: string
  actor: string | null
  data: Record<string, unknown>
}

export interface Random {
  int(maxExclusive: number): number
}

export interface EngineContext {
  now: number
  random: Random
  id: () => string
}
