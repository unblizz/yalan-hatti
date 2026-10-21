import type { Command, HostCommand, PlayerCommand, SystemCommand } from './commands.js'
import { GameError } from './game-error.js'
import {
  STATE_VERSION,
  type Call,
  type DomainEvent,
  type EngineContext,
  type GameState,
  type Player,
  type Settings,
  type ButtonChoice,
  type Stage,
  type StageKind,
} from './game.types.js'
import {
  activePair,
  AWARD_SCHEMES,
  buildResult,
  emptyEntry,
  initialGame,
  matchmake,
  resolvePair,
  STAGES,
  stageTargets,
  VOICE_PRESETS,
} from './stages.js'

export interface Outcome {
  state: GameState
  events: DomainEvent[]
  reply: Record<string, unknown>
}

export const DEFAULT_SETTINGS: Settings = {
  lineDigits: 3,
  callerId: false,
  voiceChanger: true,
  ringSeconds: 25,
  awards: [2, 1, 1],
  pairTimeoutSeconds: 40,
  maxPlayers: 12,
}

const NAME_MAX = 24
const MARKER_MAX = 60
const STAGE_SECONDS = { min: 15, max: 1800 }
const EXTEND_SECONDS = { min: 10, max: 600 }
const RING_SECONDS = { min: 5, max: 90 }
const PAIR_TIMEOUT = { min: 10, max: 180 }
const AWARD_LIMIT = 10
const FIRST_ROOM = 11

class Draft {
  readonly events: DomainEvent[] = []
  reply: Record<string, unknown> = {}

  constructor(
    readonly state: GameState,
    readonly ctx: EngineContext,
  ) {}

  emit(type: string, actor: string | null, data: Record<string, unknown> = {}): void {
    this.events.push({ type, actor, data })
  }
}

export function createGame(input: {
  code: string
  hostToken: string
  roster?: string[]
  ctx: EngineContext
  settings?: Partial<Settings>
}): { state: GameState; events: DomainEvent[] } {
  const draft = new Draft(
    {
      version: STATE_VERSION,
      code: input.code,
      hostToken: input.hostToken,
      createdAt: input.ctx.now,
      status: 'setup',
      settings: { ...DEFAULT_SETTINGS, ...input.settings },
      players: [],
      stages: [],
      calls: [],
      markers: [],
      linesOpen: false,
      checklistConfirmedFor: 0,
      winnerIds: [],
    },
    input.ctx,
  )
  draft.emit('room.created', 'host', { code: input.code })
  for (const name of input.roster ?? []) addPlayer(draft, name)
  autoNumbers(draft, false)
  return { state: draft.state, events: draft.events }
}

export function apply(state: GameState, command: Command, ctx: EngineContext): Outcome {
  const draft = new Draft(structuredClone(state), ctx)
  switch (command.actor) {
    case 'system':
      runSystem(draft, command)
      break
    case 'host':
      runHost(draft, command)
      break
    case 'player':
      runPlayer(draft, findPlayer(draft.state, command.playerId), command)
      break
  }
  return { state: draft.state, events: draft.events, reply: draft.reply }
}

export function currentStage(state: GameState): Stage | null {
  return state.stages.at(-1) ?? null
}

export function openStage(state: GameState): Stage | null {
  const stage = currentStage(state)
  return stage && stage.phase !== 'done' ? stage : null
}

export function openCallOf(state: GameState, playerId: string): Call | null {
  return state.calls.find((c) => (c.status === 'ringing' || c.status === 'active') && (c.caller === playerId || c.callee === playerId)) ?? null
}

export function needsTick(state: GameState): boolean {
  const stage = currentStage(state)
  return (stage?.phase === 'active' && !stage.pausedAt) || state.calls.some((c) => c.status === 'ringing')
}

export function sameScheme(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function runSystem(draft: Draft, command: SystemCommand): void {
  switch (command.type) {
    case 'tick':
      return tick(draft)
    case 'player.claim':
      return claim(draft, command.playerId, command.token)
    case 'call.recorded': {
      const call = findCall(draft.state, command.callId)
      call.recording = command.file
      draft.emit('call.recorded', call.caller, { callId: call.id, file: command.file })
      return
    }
  }
}

function runHost(draft: Draft, command: HostCommand): void {
  switch (command.type) {
    case 'player.add':
      requireStatus(draft.state, 'setup')
      addPlayer(draft, command.name)
      return autoNumbers(draft, false)
    case 'player.update':
      return updatePlayer(draft, command)
    case 'player.remove':
      return removePlayer(draft, command.playerId)
    case 'player.release':
      return release(draft, command.playerId)
    case 'player.eliminate':
      return eliminate(draft, command.playerId)
    case 'numbers.auto':
      requireStatus(draft.state, 'setup')
      return autoNumbers(draft, true)
    case 'settings.update':
      return updateSettings(draft, command.patch)
    case 'game.start':
      return startGame(draft)
    case 'game.finish':
      return finish(draft)
    case 'stage.open':
      return openNewStage(draft, command.kind)
    case 'stage.cancel':
      return cancelStage(draft)
    case 'stage.start':
      return startStage(draft, command.seconds, command.awards)
    case 'stage.pause':
      return pauseStage(draft)
    case 'stage.resume':
      return resumeStage(draft)
    case 'stage.extend':
      return extendStage(draft, command.seconds)
    case 'stage.close':
      return closeStage(draft, 'host')
    case 'stage.award':
      return setAward(draft, command.playerId, command.award)
    case 'stage.confirm':
      return confirmStage(draft)
    case 'lines.set':
      return setLines(draft, command.open, 'host')
    case 'checklist.confirm':
      return confirmChecklist(draft, command.items)
    case 'marker.add':
      return addMarker(draft, command.label)
  }
}

function runPlayer(draft: Draft, player: Player, command: PlayerCommand): void {
  switch (command.type) {
    case 'guess.set':
      return setGuess(draft, player, command.targetId, command.room)
    case 'guess.lock':
      return lockGuesses(draft, player)
    case 'button.press':
      return pressButton(draft, player, command.choice)
    case 'vote.cast':
      return castVote(draft, player, command.targetId)
    case 'call.dial':
      return dial(draft, player, command.number)
    case 'call.answer':
      return answer(draft, player, command.callId)
    case 'call.decline':
      return decline(draft, player, command.callId)
    case 'call.hangup':
      return hangUp(draft, player, command.callId)
  }
}

function addPlayer(draft: Draft, rawName: string): void {
  const { state, ctx } = draft
  if (state.players.length >= state.settings.maxPlayers) throw new GameError('room_full', 'Oyuncu sınırı dolu.')
  const name = cleanName(rawName)
  if (state.players.some((p) => sameName(p.name, name))) throw new GameError('name_taken', `${name} zaten listede.`)
  const used = new Set(state.players.map((p) => p.voice))
  const voice = VOICE_PRESETS.findIndex((_, i) => !used.has(i))
  const player: Player = {
    id: ctx.id(),
    name,
    room: '',
    line: '',
    voice: voice === -1 ? state.players.length % VOICE_PRESETS.length : voice,
    token: null,
    claimedAt: null,
    points: 0,
    eliminated: false,
    createdAt: ctx.now,
  }
  state.players.push(player)
  draft.reply = { playerId: player.id }
  draft.emit('player.added', 'host', { playerId: player.id, name })
}

function updatePlayer(draft: Draft, command: Extract<HostCommand, { type: 'player.update' }>): void {
  const { state } = draft
  if (state.status === 'finished') throw new GameError('invalid_phase', 'Oyun bitti.')
  const player = findPlayer(state, command.playerId)
  const changes: Record<string, unknown> = {}
  if (command.name !== undefined) {
    const name = cleanName(command.name)
    if (state.players.some((p) => p.id !== player.id && sameName(p.name, name))) throw new GameError('name_taken', `${name} zaten listede.`)
    player.name = name
    changes.name = name
  }
  if (command.room !== undefined) {
    if (state.status !== 'setup') throw new GameError('invalid_phase', 'Oda numarası oyun başladıktan sonra değişmez.')
    const room = command.room.trim()
    if (!/^\d{1,4}$/.test(room)) throw new GameError('invalid_input', 'Oda numarası 1-4 haneli bir sayı olmalı.')
    if (state.players.some((p) => p.id !== player.id && p.room === room)) throw new GameError('duplicate_number', `${room} numaralı oda başkasında.`)
    player.room = room
    changes.room = room
  }
  if (command.line !== undefined) {
    const line = command.line.trim()
    if (!new RegExp(`^\\d{${state.settings.lineDigits}}$`).test(line)) {
      throw new GameError('invalid_input', `Hat numarası ${state.settings.lineDigits} haneli olmalı.`)
    }
    if (state.players.some((p) => p.id !== player.id && p.line === line)) throw new GameError('duplicate_number', `${line} hattı başkasında.`)
    if (openCallOf(state, player.id)) throw new GameError('caller_busy', 'Oyuncu görüşmedeyken hattı değişmez.')
    player.line = line
    changes.line = line
  }
  draft.emit('player.updated', 'host', { playerId: player.id, ...changes })
}

function removePlayer(draft: Draft, playerId: string): void {
  requireStatus(draft.state, 'setup')
  const player = findPlayer(draft.state, playerId)
  draft.state.players = draft.state.players.filter((p) => p.id !== playerId)
  draft.emit('player.removed', 'host', { playerId, name: player.name })
}

function claim(draft: Draft, playerId: string, token: string): void {
  const player = findPlayer(draft.state, playerId)
  if (player.token === token) {
    draft.reply = { playerId: player.id, rejoined: true }
    return
  }
  if (player.token) throw new GameError('claimed', `${player.name} başka bir cihazda açık. Yönetimden cihazı ayırmasını iste.`)
  const other = draft.state.players.find((p) => p.token === token)
  if (other) throw new GameError('claimed', `Bu cihaz ${other.name} olarak kayıtlı.`)
  player.token = token
  player.claimedAt = draft.ctx.now
  draft.reply = { playerId: player.id, rejoined: false }
  draft.emit('player.claimed', player.id, { name: player.name })
}

function release(draft: Draft, playerId: string): void {
  const player = findPlayer(draft.state, playerId)
  if (!player.token) return
  const open = openCallOf(draft.state, player.id)
  if (open) closeCall(draft, open, open.status === 'ringing' ? 'missed' : 'ended', null)
  player.token = null
  player.claimedAt = null
  draft.emit('player.released', 'host', { playerId, name: player.name })
}

function eliminate(draft: Draft, playerId: string): void {
  const player = findPlayer(draft.state, playerId)
  if (player.eliminated) return
  if (openStage(draft.state)?.phase === 'active') throw new GameError('invalid_phase', 'Etap sürerken kimse çıkarılamaz.')
  player.eliminated = true
  const open = openCallOf(draft.state, playerId)
  if (open) closeCall(draft, open, open.status === 'ringing' ? 'missed' : 'ended', null)
  draft.emit('player.eliminated', 'host', { playerId, name: player.name })
}

function autoNumbers(draft: Draft, overwrite: boolean): void {
  const { state, ctx } = draft
  const rooms = new Set(state.players.filter((p) => p.room && !overwrite).map((p) => p.room))
  const lines = new Set(state.players.filter((p) => p.line && !overwrite).map((p) => p.line))
  let nextRoom = FIRST_ROOM
  const low = 10 ** (state.settings.lineDigits - 1)
  const span = 9 * low
  for (const player of state.players) {
    if (overwrite || !player.room) {
      while (rooms.has(String(nextRoom))) nextRoom++
      player.room = String(nextRoom)
      rooms.add(player.room)
    }
    if (overwrite || !player.line) {
      let line = ''
      do {
        line = String(low + ctx.random.int(span))
      } while (lines.has(line) || /(\d)\1\1/.test(line))
      player.line = line
      lines.add(line)
    }
  }
  if (overwrite) draft.emit('numbers.assigned', 'host', { players: state.players.map((p) => ({ name: p.name, room: p.room, line: p.line })) })
}

function updateSettings(draft: Draft, patch: Extract<HostCommand, { type: 'settings.update' }>['patch']): void {
  const { settings } = draft.state
  if (patch.lineDigits !== undefined && patch.lineDigits !== settings.lineDigits) {
    requireStatus(draft.state, 'setup')
    settings.lineDigits = patch.lineDigits
    for (const p of draft.state.players) p.line = ''
    autoNumbers(draft, false)
  }
  if (patch.callerId !== undefined) settings.callerId = patch.callerId
  if (patch.voiceChanger !== undefined) settings.voiceChanger = patch.voiceChanger
  if (patch.pairTimeoutSeconds !== undefined) {
    if (!Number.isInteger(patch.pairTimeoutSeconds) || patch.pairTimeoutSeconds < PAIR_TIMEOUT.min || patch.pairTimeoutSeconds > PAIR_TIMEOUT.max) {
      throw new GameError('invalid_input', `Eş bekleme süresi ${PAIR_TIMEOUT.min}-${PAIR_TIMEOUT.max} sn arasında olmalı.`)
    }
    settings.pairTimeoutSeconds = patch.pairTimeoutSeconds
  }
  if (patch.awards !== undefined) {
    const scheme = patch.awards
    if (!AWARD_SCHEMES.some((s) => sameScheme(s, scheme))) throw new GameError('invalid_input', 'Geçersiz puan dağılımı.')
    settings.awards = [...scheme]
  }
  if (patch.ringSeconds !== undefined) {
    if (!Number.isInteger(patch.ringSeconds) || patch.ringSeconds < RING_SECONDS.min || patch.ringSeconds > RING_SECONDS.max) {
      throw new GameError('invalid_input', `Çalma süresi ${RING_SECONDS.min}-${RING_SECONDS.max} sn arasında olmalı.`)
    }
    settings.ringSeconds = patch.ringSeconds
  }
  draft.emit('settings.updated', 'host', { ...patch })
}

function startGame(draft: Draft): void {
  const { state } = draft
  requireStatus(state, 'setup')
  if (state.players.length < 2) throw new GameError('not_enough_players', 'En az iki oyuncu gerekli.')
  const missing = state.players.filter((p) => !p.room || !p.line)
  if (missing.length > 0) throw new GameError('setup_incomplete', `Numarası eksik: ${missing.map((p) => p.name).join(', ')}`)
  state.status = 'live'
  draft.emit('game.started', 'host', { players: state.players.map((p) => ({ name: p.name, room: p.room, line: p.line })) })
}

function openNewStage(draft: Draft, kind: StageKind): void {
  const { state, ctx } = draft
  requireStatus(state, 'live')
  if (openStage(state)) throw new GameError('invalid_phase', 'Açık bir etap var.')
  const definition = STAGES[kind]
  if (state.players.filter((p) => !p.eliminated).length < definition.minPlayers) {
    throw new GameError('not_enough_players', `${definition.title} için en az ${definition.minPlayers} oyuncu gerekli.`)
  }
  const stage: Stage = {
    number: state.stages.length + 1,
    kind,
    phase: 'intro',
    seconds: definition.defaultSeconds,
    awards: [...state.settings.awards],
    openedAt: ctx.now,
    startedAt: null,
    endsAt: null,
    pausedAt: null,
    closedAt: null,
    participants: [],
    game: initialGame(kind),
    result: null,
  }
  state.stages.push(stage)
  draft.emit('stage.opened', 'host', { number: stage.number, kind })
}

function cancelStage(draft: Draft): void {
  const stage = requireStage(draft.state, 'intro')
  draft.state.stages.pop()
  draft.emit('stage.cancelled', 'host', { number: stage.number, kind: stage.kind })
}

function startStage(draft: Draft, seconds: number, awards: number[] | undefined): void {
  const { state, ctx } = draft
  const stage = requireStage(state, 'intro')
  if (state.checklistConfirmedFor !== stage.number) throw new GameError('checklist_required', 'Önce kayıt kontrolünü onayla.')
  if (!Number.isInteger(seconds) || seconds < STAGE_SECONDS.min || seconds > STAGE_SECONDS.max) {
    throw new GameError('invalid_input', `Süre ${STAGE_SECONDS.min}-${STAGE_SECONDS.max} sn arasında olmalı.`)
  }
  if (awards !== undefined) {
    if (!AWARD_SCHEMES.some((s) => sameScheme(s, awards))) throw new GameError('invalid_input', 'Geçersiz puan dağılımı.')
    stage.awards = [...awards]
  }
  stage.phase = 'active'
  stage.seconds = seconds
  stage.startedAt = ctx.now
  stage.endsAt = ctx.now + seconds * 1000
  stage.participants = state.players.filter((p) => !p.eliminated).map((p) => p.id)
  const game = stage.game
  if (game.kind === 'roomGuess') for (const id of stage.participants) game.entries[id] = emptyEntry()
  if (game.kind === 'buttons') for (const id of stage.participants) game.freeSince[id] = ctx.now
  draft.emit('stage.started', 'host', { number: stage.number, kind: stage.kind, seconds, awards: stage.awards })
  if (game.kind === 'buttons') announcePairs(draft, stage)
  if (STAGES[stage.kind].usesPhone && !state.linesOpen) setLines(draft, true, null)
}

function announcePairs(draft: Draft, stage: Stage): void {
  for (const pair of matchmake(stage, draft.ctx)) {
    draft.emit('button.paired', null, { number: stage.number, pairId: pair.id, a: pair.a, b: pair.b })
  }
}

function settlePair(draft: Draft, stage: Stage, pair: NonNullable<ReturnType<typeof activePair>>, outcome: 'decided' | 'timeout' | 'void'): void {
  resolvePair(stage, pair, outcome, draft.ctx.now)
  draft.emit('button.resolved', null, {
    number: stage.number,
    pairId: pair.id,
    a: pair.a,
    b: pair.b,
    choices: Object.fromEntries(Object.entries(pair.choices).map(([id, c]) => [id, c.choice])),
    deltas: pair.deltas,
    outcome,
  })
}

function pauseStage(draft: Draft): void {
  const stage = requireStage(draft.state, 'active')
  if (stage.pausedAt) return
  stage.pausedAt = draft.ctx.now
  draft.emit('stage.paused', 'host', { number: stage.number, remainingMs: stage.endsAt! - draft.ctx.now })
}

function resumeStage(draft: Draft): void {
  const stage = requireStage(draft.state, 'active')
  if (!stage.pausedAt) return
  const pausedMs = draft.ctx.now - stage.pausedAt
  stage.endsAt = stage.endsAt! + pausedMs
  stage.pausedAt = null
  draft.emit('stage.resumed', 'host', { number: stage.number, pausedMs })
}

function extendStage(draft: Draft, seconds: number): void {
  const stage = requireStage(draft.state, 'active')
  if (!Number.isInteger(seconds) || seconds < EXTEND_SECONDS.min || seconds > EXTEND_SECONDS.max) {
    throw new GameError('invalid_input', 'Geçersiz süre.')
  }
  stage.endsAt = stage.endsAt! + seconds * 1000
  draft.emit('stage.extended', 'host', { number: stage.number, seconds })
}

function closeStage(draft: Draft, actor: string | null): void {
  const { state, ctx } = draft
  const stage = requireStage(state, 'active')
  if (stage.game.kind === 'buttons') {
    for (const pair of stage.game.pairs.filter((p) => p.resolvedAt === null)) settlePair(draft, stage, pair, 'void')
  }
  stage.phase = 'review'
  stage.closedAt = ctx.now
  stage.pausedAt = null
  stage.result = buildResult(state, stage)
  draft.emit('stage.closed', actor, { number: stage.number, kind: stage.kind, scores: stage.result.scores, positions: stage.result.positions })
  if (STAGES[stage.kind].usesPhone) setLines(draft, false, null)
}

function setAward(draft: Draft, playerId: string, award: number): void {
  const stage = requireStage(draft.state, 'review')
  if (!stage.participants.includes(playerId)) throw new GameError('invalid_input', 'Bu oyuncu etapta yoktu.')
  if (!Number.isInteger(award) || Math.abs(award) > AWARD_LIMIT) throw new GameError('invalid_input', `Puan -${AWARD_LIMIT} ile ${AWARD_LIMIT} arasında olmalı.`)
  const result = stage.result!
  if (award === 0) delete result.awards[playerId]
  else result.awards[playerId] = award
  result.adjusted = true
  draft.emit('stage.awarded', 'host', { number: stage.number, playerId, award })
}

function confirmStage(draft: Draft): void {
  const { state, ctx } = draft
  const stage = requireStage(state, 'review')
  const result = stage.result!
  for (const [playerId, award] of Object.entries(result.awards)) {
    const player = state.players.find((p) => p.id === playerId)
    if (player) player.points += award
  }
  result.confirmedAt = ctx.now
  stage.phase = 'done'
  draft.emit('stage.confirmed', 'host', { number: stage.number, kind: stage.kind, awards: result.awards })
}

function setLines(draft: Draft, open: boolean, actor: string | null): void {
  const { state } = draft
  if (open) requireStatus(state, 'live')
  if (state.linesOpen === open) return
  state.linesOpen = open
  if (!open) {
    for (const call of state.calls) {
      if (call.status === 'ringing' || call.status === 'active') closeCall(draft, call, call.status === 'ringing' ? 'missed' : 'ended', null)
    }
  }
  draft.emit(open ? 'lines.opened' : 'lines.closed', actor, {})
}

function setGuess(draft: Draft, player: Player, targetId: string, rawRoom: string): void {
  const stage = requireStage(draft.state, 'active')
  if (stage.game.kind !== 'roomGuess') throw new GameError('invalid_phase', 'Bu etapta liste yok.')
  const entry = stage.game.entries[player.id]
  if (!entry) throw new GameError('eliminated', 'Bu etapta yoksun.')
  if (entry.lockedAt) throw new GameError('locked', 'Listeni kilitledin.')
  if (!stageTargets(draft.state, player.id, stage).some((p) => p.id === targetId)) throw new GameError('invalid_input', 'Bu oyuncu listede yok.')
  const room = rawRoom.trim()
  if (room !== '' && !/^\d{1,4}$/.test(room)) throw new GameError('invalid_input', 'Oda numarası sayı olmalı.')
  if (room === '') delete entry.guesses[targetId]
  else entry.guesses[targetId] = room
  entry.updatedAt = draft.ctx.now
  draft.emit('guess.set', player.id, { number: stage.number, targetId, room })
}

function lockGuesses(draft: Draft, player: Player): void {
  const stage = requireStage(draft.state, 'active')
  if (stage.game.kind !== 'roomGuess') throw new GameError('invalid_phase', 'Bu etapta liste yok.')
  const entries = stage.game.entries
  const entry = entries[player.id]
  if (!entry) throw new GameError('eliminated', 'Bu etapta yoksun.')
  if (entry.lockedAt) return
  entry.lockedAt = draft.ctx.now
  draft.emit('guess.locked', player.id, { number: stage.number, filled: Object.keys(entry.guesses).length })
  if (stage.participants.every((id) => entries[id]?.lockedAt)) closeStage(draft, null)
}

function pressButton(draft: Draft, player: Player, choice: ButtonChoice): void {
  const stage = requireStage(draft.state, 'active')
  if (stage.game.kind !== 'buttons') throw new GameError('invalid_phase', 'Bu etapta buton yok.')
  if (stage.pausedAt) throw new GameError('invalid_phase', 'Etap duraklatıldı.')
  const pair = activePair(stage, player.id)
  if (!pair) throw new GameError('invalid_phase', 'Şu an eşin yok, yeni eş bekleniyor.')
  if (pair.choices[player.id]) throw new GameError('locked', 'Bu eşleşmede zaten bastın.')
  pair.choices[player.id] = { choice, at: draft.ctx.now }
  draft.emit('button.pressed', player.id, { number: stage.number, pairId: pair.id, choice })
  if (pair.choices[pair.a] && pair.choices[pair.b]) {
    settlePair(draft, stage, pair, 'decided')
    announcePairs(draft, stage)
  }
}

function castVote(draft: Draft, player: Player, targetId: string): void {
  const stage = requireStage(draft.state, 'active')
  if (stage.game.kind !== 'loveVote') throw new GameError('invalid_phase', 'Bu etapta oy yok.')
  if (!stage.participants.includes(player.id)) throw new GameError('eliminated', 'Bu etapta yoksun.')
  if (targetId === player.id) throw new GameError('invalid_input', 'Kendine oy veremezsin.')
  if (!stage.participants.includes(targetId)) throw new GameError('invalid_input', 'Bu oyuncu etapta yok.')
  stage.game.votes[player.id] = { targetId, at: draft.ctx.now }
  draft.emit('vote.cast', player.id, { number: stage.number, targetId })
}

function dial(draft: Draft, caller: Player, rawNumber: string): void {
  const { state, ctx } = draft
  if (!state.linesOpen) throw new GameError('lines_closed', 'Hatlar şu an kapalı.')
  if (caller.eliminated) throw new GameError('eliminated', 'Oyun dışındasın.')
  if (openCallOf(state, caller.id)) throw new GameError('caller_busy', 'Önce açık görüşmeyi kapat.')
  const number = rawNumber.trim()
  if (!/^\d{1,6}$/.test(number)) throw new GameError('invalid_input', 'Geçersiz numara.')
  const callee = state.players.find((p) => p.line === number && !p.eliminated) ?? null
  const base = { id: ctx.id(), caller: caller.id, dialed: number, startedAt: ctx.now, answeredAt: null, endedBy: null, recording: null }
  if (!callee || callee.id === caller.id) {
    state.calls.push({ ...base, callee: callee?.id ?? null, status: 'unreachable', endedAt: ctx.now })
    draft.reply = { callId: base.id, result: 'unreachable' }
    draft.emit('call.unreachable', caller.id, { callId: base.id, caller: caller.id, dialed: number })
    return
  }
  if (openCallOf(state, callee.id)) {
    state.calls.push({ ...base, callee: callee.id, status: 'busy', endedAt: ctx.now })
    draft.reply = { callId: base.id, result: 'busy' }
    draft.emit('call.busy', caller.id, { callId: base.id, caller: caller.id, callee: callee.id, dialed: number })
    return
  }
  state.calls.push({ ...base, callee: callee.id, status: 'ringing', endedAt: null })
  draft.reply = { callId: base.id, result: 'ringing' }
  draft.emit('call.ringing', caller.id, { callId: base.id, caller: caller.id, callee: callee.id, dialed: number })
}

function answer(draft: Draft, player: Player, callId: string): void {
  const call = findCall(draft.state, callId)
  if (call.callee !== player.id) throw new GameError('forbidden', 'Bu arama sana değil.')
  if (call.status !== 'ringing') throw new GameError('invalid_phase', 'Arama artık çalmıyor.')
  call.status = 'active'
  call.answeredAt = draft.ctx.now
  draft.emit('call.answered', player.id, { callId, caller: call.caller, callee: call.callee })
}

function decline(draft: Draft, player: Player, callId: string): void {
  const call = findCall(draft.state, callId)
  if (call.callee !== player.id) throw new GameError('forbidden', 'Bu arama sana değil.')
  if (call.status !== 'ringing') return
  closeCall(draft, call, 'declined', player.id)
}

function hangUp(draft: Draft, player: Player, callId: string): void {
  const call = findCall(draft.state, callId)
  if (call.caller !== player.id && call.callee !== player.id) throw new GameError('forbidden', 'Bu görüşmede değilsin.')
  if (call.status === 'ringing') return closeCall(draft, call, 'missed', player.id)
  if (call.status === 'active') closeCall(draft, call, 'ended', player.id)
}

function closeCall(draft: Draft, call: Call, status: 'ended' | 'missed' | 'declined', actor: string | null): void {
  call.status = status
  call.endedAt = draft.ctx.now
  call.endedBy = actor
  draft.emit(`call.${status}`, actor, {
    callId: call.id,
    caller: call.caller,
    callee: call.callee,
    durationMs: call.answeredAt ? call.endedAt - call.answeredAt : 0,
  })
}

function confirmChecklist(draft: Draft, items: string[]): void {
  const stage = requireStage(draft.state, 'intro')
  draft.state.checklistConfirmedFor = stage.number
  draft.emit('checklist.confirmed', 'host', { forStage: stage.number, items })
}

function addMarker(draft: Draft, rawLabel: string): void {
  const { state, ctx } = draft
  const label = rawLabel.trim().slice(0, MARKER_MAX) || `Klaket ${state.markers.length + 1}`
  const marker = { id: ctx.id(), label, at: ctx.now }
  state.markers.push(marker)
  draft.reply = { markerId: marker.id }
  draft.emit('marker.added', 'host', { markerId: marker.id, label })
}

function finish(draft: Draft): void {
  const { state } = draft
  if (state.status === 'finished') return
  const stage = openStage(state)
  if (stage?.phase === 'active') closeStage(draft, 'host')
  if (stage && stage.phase !== 'done') stage.phase = 'done'
  if (state.linesOpen) setLines(draft, false, null)
  const pool = state.players.filter((p) => !p.eliminated)
  const top = Math.max(0, ...pool.map((p) => p.points))
  state.winnerIds = top > 0 ? pool.filter((p) => p.points === top).map((p) => p.id) : []
  state.status = 'finished'
  draft.emit('game.finished', 'host', { winnerIds: state.winnerIds })
}

function tick(draft: Draft): void {
  const { state, ctx } = draft
  const ringLimit = state.settings.ringSeconds * 1000
  for (const call of state.calls) {
    if (call.status === 'ringing' && ctx.now - call.startedAt >= ringLimit) closeCall(draft, call, 'missed', null)
  }
  const stage = openStage(state)
  if (stage?.phase !== 'active' || stage.pausedAt) return
  if (stage.game.kind === 'buttons') {
    const limit = state.settings.pairTimeoutSeconds * 1000
    const expired = stage.game.pairs.filter((p) => p.resolvedAt === null && ctx.now - p.startedAt >= limit)
    for (const pair of expired) settlePair(draft, stage, pair, 'timeout')
    if (expired.length > 0) announcePairs(draft, stage)
  }
  if (stage.endsAt !== null && ctx.now >= stage.endsAt) closeStage(draft, null)
}

function requireStatus(state: GameState, status: GameState['status']): void {
  if (state.status === status) return
  const message = status === 'setup' ? 'Bu ayar yalnız kurulumda değişir.' : status === 'live' ? 'Oyun başlamadı ya da bitti.' : 'Oyun bitmedi.'
  throw new GameError('invalid_phase', message)
}

function requireStage(state: GameState, phase: Stage['phase']): Stage {
  const stage = openStage(state)
  if (!stage || stage.phase !== phase) throw new GameError('invalid_phase', 'Bu işlem şu an yapılamaz.')
  return stage
}

function findPlayer(state: GameState, id: string): Player {
  const player = state.players.find((p) => p.id === id)
  if (!player) throw new GameError('not_found', 'Oyuncu bulunamadı.')
  return player
}

function findCall(state: GameState, id: string): Call {
  const call = state.calls.find((c) => c.id === id)
  if (!call) throw new GameError('not_found', 'Görüşme bulunamadı.')
  return call
}

function cleanName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > NAME_MAX) throw new GameError('invalid_input', `İsim 2-${NAME_MAX} karakter olmalı.`)
  return name
}

function sameName(a: string, b: string): boolean {
  return a.toLocaleLowerCase('tr-TR') === b.toLocaleLowerCase('tr-TR')
}
