import type { ButtonChoice, Settings, StageKind } from './game.types.js'

export type HostCommand =
  | { type: 'player.add'; name: string }
  | { type: 'player.update'; playerId: string; name?: string | undefined; room?: string | undefined; line?: string | undefined }
  | { type: 'player.remove'; playerId: string }
  | { type: 'player.release'; playerId: string }
  | { type: 'player.eliminate'; playerId: string }
  | { type: 'numbers.auto' }
  | { type: 'settings.update'; patch: Partial<Pick<Settings, 'lineDigits' | 'callerId' | 'voiceChanger' | 'ringSeconds' | 'pairTimeoutSeconds' | 'awards'>> }
  | { type: 'game.start' }
  | { type: 'game.finish' }
  | { type: 'stage.open'; kind: StageKind }
  | { type: 'stage.cancel' }
  | { type: 'stage.start'; seconds: number; awards?: number[] | undefined }
  | { type: 'stage.pause' }
  | { type: 'stage.resume' }
  | { type: 'stage.extend'; seconds: number }
  | { type: 'stage.close' }
  | { type: 'stage.award'; playerId: string; award: number }
  | { type: 'stage.confirm' }
  | { type: 'lines.set'; open: boolean }
  | { type: 'checklist.confirm'; items: string[] }
  | { type: 'marker.add'; label: string }

export type PlayerCommand =
  | { type: 'guess.set'; targetId: string; room: string }
  | { type: 'guess.lock' }
  | { type: 'button.press'; choice: ButtonChoice }
  | { type: 'vote.cast'; targetId: string }
  | { type: 'call.dial'; number: string }
  | { type: 'call.answer'; callId: string }
  | { type: 'call.decline'; callId: string }
  | { type: 'call.hangup'; callId: string }

export type SystemCommand =
  | { type: 'player.claim'; playerId: string; token: string }
  | { type: 'call.recorded'; callId: string; file: string }
  | { type: 'tick' }

export type Command =
  | ({ actor: 'host' } & HostCommand)
  | ({ actor: 'player'; playerId: string } & PlayerCommand)
  | ({ actor: 'system' } & SystemCommand)
