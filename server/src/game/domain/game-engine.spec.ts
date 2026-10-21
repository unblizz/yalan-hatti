import { describe, expect, it } from 'vitest'
import type { Command, HostCommand, PlayerCommand } from './commands.js'
import { apply, createGame } from './game-engine.js'
import { GameError } from './game-error.js'
import type { EngineContext, GameState, StageKind } from './game.types.js'
import { playerView } from './views.js'

const NAMES = ['Begüm', 'Saniye', 'Unlost', 'Eray']

function harness(names: string[] = NAMES) {
  let now = 1_000_000
  let ids = 0
  let seed = 7
  const ctx = (): EngineContext => ({
    now,
    random: { int: (max) => (seed = (seed * 9301 + 49297) % 233280) % max },
    id: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
  })
  let state: GameState = createGame({ code: 'ABCD', hostToken: 'host', roster: names, ctx: ctx() }).state
  const run = (command: Command) => {
    const out = apply(state, command, ctx())
    state = out.state
    return out
  }
  const host = (command: HostCommand) => run({ actor: 'host', ...command } as Command)
  const as = (name: string, command: PlayerCommand) => run({ actor: 'player', playerId: byName(name).id, ...command })
  const byName = (name: string) => state.players.find((p) => p.name === name)!
  const claimAll = () => state.players.forEach((p, i) => run({ actor: 'system', type: 'player.claim', playerId: p.id, token: `token-${i}` }))
  const startStage = (seconds = 60, kind: StageKind = 'roomGuess', awards?: number[]) => {
    host({ type: 'stage.open', kind })
    host({ type: 'checklist.confirm', items: ['Kameralar kayıtta'] })
    host({ type: 'stage.start', seconds, awards })
  }
  const live = () => {
    claimAll()
    host({ type: 'game.start' })
  }
  return {
    get state() {
      return state
    },
    advance: (ms: number) => {
      now += ms
    },
    run,
    host,
    as,
    byName,
    live,
    startStage,
  }
}

function expectCode(fn: () => unknown, code: string) {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(GameError)
    expect((error as GameError).code).toBe(code)
    return
  }
  throw new Error(`Beklenen hata gelmedi: ${code}`)
}

describe('kurulum', () => {
  it('kadroya 11den başlayan oda ve tekrarsız 3 haneli hat numarası verir', () => {
    const g = harness()
    expect(g.state.players.map((p) => p.room)).toEqual(['11', '12', '13', '14'])
    const lines = g.state.players.map((p) => p.line)
    expect(new Set(lines).size).toBe(4)
    lines.forEach((line) => expect(line).toMatch(/^[1-9]\d{2}$/))
  })

  it('aynı oda ya da hat numarasını ikinci kişiye vermez, hane sayısını denetler', () => {
    const g = harness()
    const [a, b] = g.state.players
    expectCode(() => g.host({ type: 'player.update', playerId: b!.id, room: a!.room }), 'duplicate_number')
    expectCode(() => g.host({ type: 'player.update', playerId: b!.id, line: a!.line }), 'duplicate_number')
    expectCode(() => g.host({ type: 'player.update', playerId: b!.id, line: '12' }), 'invalid_input')
    g.host({ type: 'player.update', playerId: b!.id, room: '7', line: '482' })
    expect(g.byName('Saniye')).toMatchObject({ room: '7', line: '482' })
  })

  it('hane sayısı 4 olunca hat numaralarını yeniden dağıtır', () => {
    const g = harness()
    g.host({ type: 'settings.update', patch: { lineDigits: 4 } })
    g.state.players.forEach((p) => expect(p.line).toMatch(/^\d{4}$/))
  })

  it('oyun başlayınca oda numarası değişmez', () => {
    const g = harness()
    g.live()
    expectCode(() => g.host({ type: 'player.update', playerId: g.byName('Eray').id, room: '99' }), 'invalid_phase')
  })

  it('bir oyuncuyu tek cihaza bağlar, aynı cihazın tekrar gelişini kabul eder, ayırınca yeni cihaza izin verir', () => {
    const g = harness()
    const id = g.byName('Begüm').id
    g.run({ actor: 'system', type: 'player.claim', playerId: id, token: 'tablet-1' })
    expect(g.run({ actor: 'system', type: 'player.claim', playerId: id, token: 'tablet-1' }).reply).toMatchObject({ rejoined: true })
    expectCode(() => g.run({ actor: 'system', type: 'player.claim', playerId: id, token: 'tablet-2' }), 'claimed')
    g.host({ type: 'player.release', playerId: id })
    g.run({ actor: 'system', type: 'player.claim', playerId: id, token: 'tablet-2' })
    expect(g.byName('Begüm').token).toBe('tablet-2')
  })
})

describe('etap akışı', () => {
  it('oyun başlamadan etap açılmaz, kontrol onaylanmadan etap başlamaz', () => {
    const g = harness()
    expectCode(() => g.host({ type: 'stage.open', kind: 'roomGuess' }), 'invalid_phase')
    g.live()
    g.host({ type: 'stage.open', kind: 'roomGuess' })
    expectCode(() => g.host({ type: 'stage.start', seconds: 60 }), 'checklist_required')
  })

  it('etap başlayınca hatları açar, süre dolunca kapatır ve açık görüşmeleri sonlandırır', () => {
    const g = harness()
    g.live()
    g.startStage(60)
    expect(g.state.linesOpen).toBe(true)
    g.as('Begüm', { type: 'call.dial', number: g.byName('Saniye').line })
    g.advance(60_000)
    g.run({ actor: 'system', type: 'tick' })
    expect(g.state.stages[0]!.phase).toBe('review')
    expect(g.state.linesOpen).toBe(false)
    expect(g.state.calls[0]!.status).toBe('missed')
  })

  it('duraklatılan etap süresi dolsa da kapanmaz, sürdürülünce kalan süre korunur', () => {
    const g = harness()
    g.live()
    g.startStage(60)
    const endsAt = g.state.stages[0]!.endsAt!
    g.advance(20_000)
    g.host({ type: 'stage.pause' })
    g.advance(120_000)
    g.run({ actor: 'system', type: 'tick' })
    expect(g.state.stages[0]!.phase).toBe('active')
    g.host({ type: 'stage.resume' })
    expect(g.state.stages[0]!.endsAt).toBe(endsAt + 120_000)
  })
})

describe('Tahmin Oyunu', () => {
  function played() {
    const g = harness()
    g.live()
    g.startStage(60)
    const room = (name: string) => g.byName(name).room
    const target = (name: string) => g.byName(name).id
    g.as('Begüm', { type: 'guess.set', targetId: target('Saniye'), room: room('Saniye') })
    g.as('Begüm', { type: 'guess.set', targetId: target('Unlost'), room: room('Unlost') })
    g.as('Begüm', { type: 'guess.set', targetId: target('Eray'), room: '99' })
    g.advance(5_000)
    g.as('Saniye', { type: 'guess.set', targetId: target('Begüm'), room: room('Begüm') })
    g.as('Saniye', { type: 'guess.set', targetId: target('Unlost'), room: room('Unlost') })
    g.as('Saniye', { type: 'guess.lock' })
    g.as('Unlost', { type: 'guess.set', targetId: target('Begüm'), room: room('Begüm') })
    return g
  }

  it('her doğru odaya 1 oyun puanı verir, boş ve yanlış tahmin puan götürmez', () => {
    const g = played()
    g.host({ type: 'stage.close' })
    const scores = Object.fromEntries(g.state.stages[0]!.result!.scores.map((s) => [g.state.players.find((p) => p.id === s.playerId)!.name, s.points]))
    expect(scores).toEqual({ Begüm: 2, Saniye: 2, Unlost: 1, Eray: 0 })
  })

  it('eşitler sırayı paylaşır: iki 1. ikisi de 1.nin puanını alır, sonraki 3. sayılır, sıfır puanlı almaz', () => {
    const g = played()
    g.host({ type: 'stage.close' })
    const result = g.state.stages[0]!.result!
    const pos = (n: string) => result.positions[g.byName(n).id]
    expect([pos('Begüm'), pos('Saniye'), pos('Unlost'), pos('Eray')]).toEqual([1, 1, 3, 4])
    expect(result.awards).toEqual({ [g.byName('Begüm').id]: 2, [g.byName('Saniye').id]: 2, [g.byName('Unlost').id]: 1 })
  })

  it('sunucu etap başında 3-2-1 dağılımını seçebilir, geçersiz dağılımı reddeder', () => {
    const g = harness()
    g.live()
    g.host({ type: 'stage.open', kind: 'roomGuess' })
    g.host({ type: 'checklist.confirm', items: [] })
    expectCode(() => g.host({ type: 'stage.start', seconds: 60, awards: [9, 9, 9] }), 'invalid_input')
    g.host({ type: 'stage.start', seconds: 60, awards: [3, 2, 1] })
    g.as('Eray', { type: 'guess.set', targetId: g.byName('Begüm').id, room: g.byName('Begüm').room })
    g.host({ type: 'stage.close' })
    expect(g.state.stages[0]!.result!.awards).toEqual({ [g.byName('Eray').id]: 3 })
  })

  it('sunucu sonuçta herkesin puanını elle değiştirebilir, eksi de verebilir; onaylanınca tabloya yazılır', () => {
    const g = played()
    g.host({ type: 'stage.close' })
    g.host({ type: 'stage.award', playerId: g.byName('Saniye').id, award: 1 })
    g.host({ type: 'stage.award', playerId: g.byName('Eray').id, award: -1 })
    expect(g.state.stages[0]!.result!.adjusted).toBe(true)
    g.host({ type: 'stage.confirm' })
    expect(['Begüm', 'Saniye', 'Unlost', 'Eray'].map((n) => g.byName(n).points)).toEqual([2, 1, 1, -1])
    expect(g.state.stages[0]!.phase).toBe('done')
  })

  it('etapta olmayan oyuncuya ya da sınır dışı puan vermez', () => {
    const g = played()
    g.host({ type: 'stage.close' })
    expectCode(() => g.host({ type: 'stage.award', playerId: '00000000-0000-4000-8000-999999999999', award: 1 }), 'invalid_input')
    expectCode(() => g.host({ type: 'stage.award', playerId: g.byName('Eray').id, award: 50 }), 'invalid_input')
  })

  it('kilitli listeyi değiştirmez, herkes kilitleyince etabı kapatır', () => {
    const g = played()
    expectCode(() => g.as('Saniye', { type: 'guess.set', targetId: g.byName('Eray').id, room: '11' }), 'locked')
    ;['Begüm', 'Unlost', 'Eray'].forEach((n) => g.as(n, { type: 'guess.lock' }))
    expect(g.state.stages[0]!.phase).toBe('review')
  })

  it('oyuncu ekranında başkalarının oda ve hat numarasını göstermez', () => {
    const g = played()
    const view = JSON.stringify(playerView(g.state, g.byName('Eray'), 0))
    for (const name of ['Begüm', 'Saniye', 'Unlost']) {
      expect(view).not.toContain(`"${g.byName(name).line}"`)
      expect(view).not.toContain(`"room":"${g.byName(name).room}"`)
    }
  })
})

describe('telefon', () => {
  function ready() {
    const g = harness()
    g.live()
    g.host({ type: 'lines.set', open: true })
    return g
  }

  it('hatlar kapalıyken arama yapılamaz', () => {
    const g = harness()
    g.live()
    expectCode(() => g.as('Begüm', { type: 'call.dial', number: g.byName('Saniye').line }), 'lines_closed')
  })

  it('numarayı çaldırır, açılınca görüşme başlar, görüşmedeki kişiyi arayan meşgul alır', () => {
    const g = ready()
    const callId = g.as('Begüm', { type: 'call.dial', number: g.byName('Saniye').line }).reply.callId as string
    expect(g.state.calls[0]).toMatchObject({ status: 'ringing', callee: g.byName('Saniye').id })
    g.as('Saniye', { type: 'call.answer', callId })
    const busy = g.as('Unlost', { type: 'call.dial', number: g.byName('Begüm').line })
    expect(busy.reply.result).toBe('busy')
    expect(g.state.calls.at(-1)!.status).toBe('busy')
  })

  it('kullanılmayan ya da kendi numarasını arayana ulaşılamıyor der', () => {
    const g = ready()
    expect(g.as('Begüm', { type: 'call.dial', number: '000' }).reply.result).toBe('unreachable')
    expect(g.as('Begüm', { type: 'call.dial', number: g.byName('Begüm').line }).reply.result).toBe('unreachable')
  })

  it('açılmayan arama çalma süresi dolunca cevapsız kalır', () => {
    const g = ready()
    g.as('Begüm', { type: 'call.dial', number: g.byName('Saniye').line })
    g.advance(25_000)
    g.run({ actor: 'system', type: 'tick' })
    expect(g.state.calls[0]!.status).toBe('missed')
  })

  it('arayan numarası ayarı kapalıyken arananın ekranında numara görünmez, açıkken görünür', () => {
    const g = ready()
    g.as('Begüm', { type: 'call.dial', number: g.byName('Saniye').line })
    expect(playerView(g.state, g.byName('Saniye'), 0).call?.number).toBeNull()
    g.host({ type: 'settings.update', patch: { callerId: true } })
    expect(playerView(g.state, g.byName('Saniye'), 0).call?.number).toBe(g.byName('Begüm').line)
  })

  it('görüşme süresini kaydeder ve kimin kimi aradığını tutar', () => {
    const g = ready()
    const callId = g.as('Begüm', { type: 'call.dial', number: g.byName('Saniye').line }).reply.callId as string
    g.as('Saniye', { type: 'call.answer', callId })
    g.advance(42_000)
    const out = g.as('Saniye', { type: 'call.hangup', callId })
    expect(out.events[0]).toMatchObject({ type: 'call.ended', data: { caller: g.byName('Begüm').id, callee: g.byName('Saniye').id, durationMs: 42_000 } })
  })
})

describe('bitiş', () => {
  it('en çok puanlıyı kazanan yapar, hatları kapatır', () => {
    const g = harness()
    g.live()
    g.startStage()
    g.as('Eray', { type: 'guess.set', targetId: g.byName('Begüm').id, room: g.byName('Begüm').room })
    g.host({ type: 'stage.close' })
    g.host({ type: 'stage.confirm' })
    g.host({ type: 'game.finish' })
    expect(g.state.status).toBe('finished')
    expect(g.state.winnerIds).toEqual([g.byName('Eray').id])
    expect(g.state.linesOpen).toBe(false)
  })
})

describe('Yeşil Buton Kırmızı Buton', () => {
  function buttons(names = ['Begüm', 'Saniye', 'Unlost', 'Eray']) {
    const g = harness(names)
    g.live()
    g.startStage(300, 'buttons')
    const game = () => {
      const stage = g.state.stages[0]!
      if (stage.game.kind !== 'buttons') throw new Error('buttons değil')
      return stage.game
    }
    const pairOf = (name: string) => game().pairs.find((p) => p.resolvedAt === null && (p.a === g.byName(name).id || p.b === g.byName(name).id))
    const partnerOf = (name: string) => {
      const pair = pairOf(name)!
      const id = pair.a === g.byName(name).id ? pair.b : pair.a
      return g.state.players.find((p) => p.id === id)!.name
    }
    return { g, game, pairOf, partnerOf }
  }

  it('başlangıçta herkesi ikişer eşler', () => {
    const { game } = buttons()
    expect(game().pairs.filter((p) => p.resolvedAt === null)).toHaveLength(2)
  })

  it('ödeme tablosu: ikisi yeşil +1/+1, kırmızı +2 yeşil 0, ikisi kırmızı 0/0', () => {
    const { g, game, partnerOf } = buttons(['Begüm', 'Saniye'])
    const run = (a: 'green' | 'red', b: 'green' | 'red') => {
      const other = partnerOf('Begüm')
      g.as('Begüm', { type: 'button.press', choice: a })
      g.as(other, { type: 'button.press', choice: b })
      const last = game().pairs.filter((p) => p.resolvedAt !== null).at(-1)!
      return [last.deltas[g.byName('Begüm').id], last.deltas[g.byName(other).id]]
    }
    expect(run('green', 'green')).toEqual([1, 1])
    expect(run('red', 'green')).toEqual([2, 0])
    expect(run('red', 'red')).toEqual([0, 0])
    expect(game().points[g.byName('Begüm').id]).toBe(3)
  })

  it('sonuçtan sonra daha önce eşleşmediği biriyle eşler, eşleşmediği kişi meşgulse bekletir', () => {
    const { g, partnerOf, pairOf } = buttons()
    const first = partnerOf('Begüm')
    g.as('Begüm', { type: 'button.press', choice: 'green' })
    g.as(first, { type: 'button.press', choice: 'green' })
    expect(pairOf('Begüm')).toBeUndefined()
    const others = ['Saniye', 'Unlost', 'Eray'].filter((n) => n !== first)
    g.as(others[0]!, { type: 'button.press', choice: 'red' })
    g.as(others[1]!, { type: 'button.press', choice: 'green' })
    const next = partnerOf('Begüm')
    expect(next).not.toBe(first)
    expect(partnerOf(first)).not.toBe('Begüm')
  })

  it('bir eşleşmede iki kez basılamaz', () => {
    const { g } = buttons()
    g.as('Begüm', { type: 'button.press', choice: 'green' })
    expectCode(() => g.as('Begüm', { type: 'button.press', choice: 'red' }), 'locked')
  })

  it('eş 40 saniye basmazsa eşleşme bozulur: basmayan 0, basan eşi yeşil basmış gibi alır', () => {
    const { g, game, partnerOf } = buttons(['Begüm', 'Saniye'])
    partnerOf('Begüm')
    g.as('Begüm', { type: 'button.press', choice: 'red' })
    g.advance(40_000)
    g.run({ actor: 'system', type: 'tick' })
    const pair = game().pairs[0]!
    expect(pair.outcome).toBe('timeout')
    expect(pair.deltas).toEqual({ [g.byName('Begüm').id]: 2, [g.byName('Saniye').id]: 0 })
    expect(game().pairs.filter((p) => p.resolvedAt === null)).toHaveLength(1)
  })

  it('süre bitince yarım kalan eşleşmeler puansız kapanır, sıralama oyun puanına göre yapılır', () => {
    const { g, game, partnerOf, pairOf } = buttons()
    const other = partnerOf('Begüm')
    const waiting = ['Saniye', 'Unlost', 'Eray'].find((n) => n !== other)!
    g.as('Begüm', { type: 'button.press', choice: 'red' })
    g.as(other, { type: 'button.press', choice: 'green' })
    expect(pairOf('Begüm')).toBeUndefined()
    g.as(waiting, { type: 'button.press', choice: 'red' })
    g.host({ type: 'stage.close' })
    expect(game().pairs.every((p) => p.resolvedAt !== null)).toBe(true)
    expect(game().pairs.at(-1)!.outcome).toBe('void')
    expect(game().points[g.byName(waiting).id] ?? 0).toBe(0)
    const result = g.state.stages[0]!.result!
    expect(result.positions[g.byName('Begüm').id]).toBe(1)
    expect(result.awards[g.byName('Begüm').id]).toBe(2)
  })
})

describe('Sevgi Oyu', () => {
  function voting() {
    const g = harness(['Begüm', 'Saniye', 'Unlost', 'Eray', 'Limon'])
    g.live()
    g.startStage(120, 'loveVote')
    return g
  }

  it('kendine oy verilemez, oy değiştirilebilir, aldığı oy kadar oyun puanı', () => {
    const g = voting()
    const id = (n: string) => g.byName(n).id
    expectCode(() => g.as('Begüm', { type: 'vote.cast', targetId: id('Begüm') }), 'invalid_input')
    g.as('Begüm', { type: 'vote.cast', targetId: id('Saniye') })
    g.as('Begüm', { type: 'vote.cast', targetId: id('Unlost') })
    g.as('Saniye', { type: 'vote.cast', targetId: id('Unlost') })
    g.as('Unlost', { type: 'vote.cast', targetId: id('Begüm') })
    g.as('Eray', { type: 'vote.cast', targetId: id('Limon') })
    g.host({ type: 'stage.close' })
    const result = g.state.stages[0]!.result!
    const score = (n: string) => result.scores.find((s) => s.playerId === id(n))!.points
    expect([score('Unlost'), score('Begüm'), score('Limon'), score('Saniye')]).toEqual([2, 1, 1, 0])
    expect(result.awards).toEqual({ [id('Unlost')]: 2, [id('Begüm')]: 1, [id('Limon')]: 1 })
  })

  it('sonuçta kimin kime oy verdiğini açıklar, süre işlerken açıklamaz', () => {
    const g = voting()
    g.as('Begüm', { type: 'vote.cast', targetId: g.byName('Saniye').id })
    expect(playerView(g.state, g.byName('Eray'), 0).stage?.reveal).toEqual([])
    g.host({ type: 'stage.close' })
    expect(playerView(g.state, g.byName('Eray'), 0).stage?.reveal).toEqual([{ from: 'Begüm', to: 'Saniye' }])
  })
})

describe('Bomba Patlama', () => {
  it('puanları sunucu girer, eksi puan genel tabloya yazılır, hatlar açılmaz', () => {
    const g = harness()
    g.live()
    g.startStage(600, 'bomb')
    expect(g.state.linesOpen).toBe(false)
    g.host({ type: 'stage.close' })
    expect(g.state.stages[0]!.result).toMatchObject({ manual: true, awards: {} })
    g.host({ type: 'stage.award', playerId: g.byName('Eray').id, award: 3 })
    g.host({ type: 'stage.award', playerId: g.byName('Begüm').id, award: -2 })
    g.host({ type: 'stage.confirm' })
    expect([g.byName('Eray').points, g.byName('Begüm').points, g.byName('Saniye').points]).toEqual([3, -2, 0])
  })
})
