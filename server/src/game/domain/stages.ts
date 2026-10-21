import type {
  ButtonChoice,
  ButtonPair,
  EngineContext,
  GameState,
  Player,
  RoomGuessEntry,
  Stage,
  StageGame,
  StageKind,
  StageResult,
  StageScore,
} from './game.types.js'

export interface StageDefinition {
  kind: StageKind
  title: string
  subtitle: string
  rules: string[]
  defaultSeconds: number
  usesPhone: boolean
  manual: boolean
  minPlayers: number
  scoreLabel: string
}

export const STAGES: Record<StageKind, StageDefinition> = {
  roomGuess: {
    kind: 'roomGuess',
    title: 'Tahmin Oyunu',
    subtitle: 'Odada Kim Var?',
    rules: [
      'Herkesin gizli bir oda numarası var. Numara duvarında yazıyor.',
      'Afişteki hatları arayıp kimin hangi odada kaldığını öğren.',
      'Listeye her oyuncunun oda numarasını yaz. Her doğru oda 1 oyun puanı.',
      'Yalan söyleyebilirsin. Kimseye güvenme.',
      'Listen bitince kilitle. Herkes kilitlerse etap erken biter.',
    ],
    defaultSeconds: 60,
    usesPhone: true,
    manual: false,
    minPlayers: 2,
    scoreLabel: 'doğru',
  },
  buttons: {
    kind: 'buttons',
    title: 'Yeşil Buton Kırmızı Buton',
    subtitle: 'Güven oyunu',
    rules: [
      'Rastgele bir mahkumla eşleşirsin. Eşini arayıp pazarlık edebilirsin.',
      'İkiniz de gizlice yeşil (işbirliği) ya da kırmızı (ihanet) basarsınız.',
      'İkiniz yeşil: +1, +1. Kırmızı basan +2, yeşil basan 0. İkiniz kırmızı: 0.',
      'Sonuç hemen açıklanır, daha önce eşleşmediğin biriyle yeniden eşleşirsin.',
      'Süre bitene kadar döngü sürer.',
    ],
    defaultSeconds: 300,
    usesPhone: true,
    manual: false,
    minPlayers: 2,
    scoreLabel: 'puan',
  },
  bomb: {
    kind: 'bomb',
    title: 'Bomba Patlama',
    subtitle: 'Salonda oynanır',
    rules: [
      'Bu oyun salonda oynanır. Bomba bir mahkumun hücresine bırakılır.',
      'Bombayı istediğin birinin hücresine götür.',
      'Bombayı en fazla 45 saniye tutabilirsin. Fazlası eksi puan.',
      'Puanları sunucu girer, skorunu tabletinden takip et.',
    ],
    defaultSeconds: 600,
    usesPhone: false,
    manual: true,
    minPlayers: 2,
    scoreLabel: 'puan',
  },
  loveVote: {
    kind: 'loveVote',
    title: 'Sevgi Oyu',
    subtitle: 'Sevdiğin kişiye puan ver',
    rules: [
      'Tabletinde oyuncuların isimleri var. Yalnız bir kişiye oy verebilirsin.',
      'Kendine oy veremezsin. Süre bitene kadar oyunu değiştirebilirsin.',
      'Aldığın her oy 1 oyun puanı.',
      'Telefonla pazarlık serbest. Kimin kime oy verdiği sonunda açıklanır.',
    ],
    defaultSeconds: 120,
    usesPhone: true,
    manual: false,
    minPlayers: 3,
    scoreLabel: 'oy',
  },
}

export const STAGE_ORDER: StageKind[] = ['roomGuess', 'buttons', 'bomb', 'loveVote']

export const TOTAL_STAGES = 11

export const AWARD_SCHEMES: readonly (readonly number[])[] = [
  [2, 1, 1],
  [3, 2, 1],
]

export const DEFAULT_ROSTER: readonly string[] = [
  'Begüm',
  'Saniye',
  'Unlost',
  'Bakirkertenkele',
  'Limon',
  'Enes Batur',
  'Kendine Müzisyen',
  'Eray',
]

export const VOICE_PRESETS: readonly number[] = [0.72, 1.32, 0.8, 1.22, 0.66, 1.4, 0.88, 1.16, 0.76, 1.28, 0.7, 1.36]

export const BUTTON_PAYOFF: Record<ButtonChoice, Record<ButtonChoice, number>> = {
  green: { green: 1, red: 0 },
  red: { green: 2, red: 0 },
}

export function emptyEntry(): RoomGuessEntry {
  return { guesses: {}, lockedAt: null, updatedAt: null }
}

export function initialGame(kind: StageKind): StageGame {
  switch (kind) {
    case 'roomGuess':
      return { kind, entries: {} }
    case 'buttons':
      return { kind, pairs: [], points: {}, freeSince: {} }
    case 'bomb':
      return { kind }
    case 'loveVote':
      return { kind, votes: {} }
  }
}

export function stageTargets(state: GameState, playerId: string, stage?: Stage | null): Player[] {
  const pool = stage ? state.players.filter((p) => stage.participants.includes(p.id)) : state.players.filter((p) => !p.eliminated)
  return pool.filter((p) => p.id !== playerId)
}

export function activePair(stage: Stage, playerId: string): ButtonPair | null {
  if (stage.game.kind !== 'buttons') return null
  return stage.game.pairs.find((p) => p.resolvedAt === null && (p.a === playerId || p.b === playerId)) ?? null
}

export function matchmake(stage: Stage, ctx: EngineContext): ButtonPair[] {
  const game = stage.game
  if (game.kind !== 'buttons') return []
  const busy = new Set(game.pairs.filter((p) => p.resolvedAt === null).flatMap((p) => [p.a, p.b]))
  const free = stage.participants.filter((id) => !busy.has(id)).sort((x, y) => (game.freeSince[x] ?? 0) - (game.freeSince[y] ?? 0))
  const met = (x: string, y: string) => game.pairs.filter((p) => p.outcome !== 'void' && ((p.a === x && p.b === y) || (p.a === y && p.b === x)))
  const created: ButtonPair[] = []
  const taken = new Set<string>()
  for (const id of free) {
    if (taken.has(id)) continue
    const candidates = free.filter((c) => c !== id && !taken.has(c))
    if (candidates.length === 0) break
    const fresh = candidates.filter((c) => met(id, c).length === 0)
    let partner: string | undefined
    if (fresh.length > 0) {
      partner = fresh[ctx.random.int(fresh.length)]
    } else {
      const neverMet = stage.participants.filter((c) => c !== id && met(id, c).length === 0)
      if (neverMet.length > 0) continue
      partner = [...candidates].sort((x, y) => {
        const mx = met(id, x)
        const my = met(id, y)
        return mx.length - my.length || (mx.at(-1)?.startedAt ?? 0) - (my.at(-1)?.startedAt ?? 0)
      })[0]
    }
    if (!partner) continue
    taken.add(id)
    taken.add(partner)
    const pair: ButtonPair = { id: ctx.id(), a: id, b: partner, startedAt: ctx.now, choices: {}, resolvedAt: null, outcome: null, deltas: {} }
    game.pairs.push(pair)
    created.push(pair)
  }
  return created
}

export function resolvePair(stage: Stage, pair: ButtonPair, outcome: 'decided' | 'timeout' | 'void', now: number): void {
  if (stage.game.kind !== 'buttons' || pair.resolvedAt !== null) return
  const game = stage.game
  pair.resolvedAt = now
  pair.outcome = outcome
  const ca = pair.choices[pair.a]?.choice
  const cb = pair.choices[pair.b]?.choice
  if (outcome === 'void') {
    pair.deltas = { [pair.a]: 0, [pair.b]: 0 }
  } else {
    pair.deltas = {
      [pair.a]: ca ? BUTTON_PAYOFF[ca][cb ?? 'green'] : 0,
      [pair.b]: cb ? BUTTON_PAYOFF[cb][ca ?? 'green'] : 0,
    }
  }
  for (const id of [pair.a, pair.b]) {
    game.points[id] = (game.points[id] ?? 0) + (pair.deltas[id] ?? 0)
    game.freeSince[id] = now
  }
}

export function stageScores(state: GameState, stage: Stage): StageScore[] {
  const game = stage.game
  switch (game.kind) {
    case 'roomGuess':
      return stage.participants.map((playerId) => {
        const entry = game.entries[playerId]
        const points = Object.entries(entry?.guesses ?? {}).filter(([targetId, room]) => {
          const target = state.players.find((p) => p.id === targetId)
          return target !== undefined && target.id !== playerId && room !== '' && room === target.room
        }).length
        return { playerId, points }
      })
    case 'buttons':
      return stage.participants.map((playerId) => ({ playerId, points: game.points[playerId] ?? 0 }))
    case 'loveVote': {
      const received = new Map<string, number>()
      for (const vote of Object.values(game.votes)) received.set(vote.targetId, (received.get(vote.targetId) ?? 0) + 1)
      return stage.participants.map((playerId) => ({ playerId, points: received.get(playerId) ?? 0 }))
    }
    case 'bomb':
      return stage.participants.map((playerId) => ({ playerId, points: 0 }))
  }
}

export function sharedPositions(scores: StageScore[]): Record<string, number> {
  const sorted = [...scores].sort((a, b) => b.points - a.points)
  const positions: Record<string, number> = {}
  sorted.forEach((s, i) => {
    const prev = sorted[i - 1]
    positions[s.playerId] = prev && prev.points === s.points ? positions[prev.playerId]! : i + 1
  })
  return positions
}

export function awardsFor(scores: StageScore[], positions: Record<string, number>, scheme: number[]): Record<string, number> {
  const awards: Record<string, number> = {}
  for (const s of scores) {
    const award = scheme[(positions[s.playerId] ?? 99) - 1] ?? 0
    if (award > 0 && s.points > 0) awards[s.playerId] = award
  }
  return awards
}

export function buildResult(state: GameState, stage: Stage): StageResult {
  const scores = stageScores(state, stage)
  const manual = STAGES[stage.kind].manual
  const positions = manual ? {} : sharedPositions(scores)
  return {
    scores,
    positions,
    awards: manual ? {} : awardsFor(scores, positions, stage.awards),
    manual,
    adjusted: false,
    confirmedAt: null,
  }
}
