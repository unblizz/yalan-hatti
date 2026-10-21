'use client'

import { useEffect, useRef, useState } from 'react'
import { ConnectionBar, Countdown, Keypad, MarkerFlash, ProgressBar, useTicker, useWakeLock } from '@/components/live'
import { AnimatedNumber, FlipList, Stagger } from '@/components/motion'
import { Button, Dot } from '@/components/ui'
import { clock, timeOfDay } from '@/lib/format'
import type { Phone } from '@/lib/phone'
import type { Ack, PlayerView } from '@/lib/types'
import { usePhone } from '@/lib/use-phone'
import { useRoom } from '@/lib/use-room'

type Send = (command: Record<string, unknown>) => Promise<Ack>
type PhoneApi = ReturnType<typeof usePhone>
type Tab = 'telefon' | 'etap' | 'puan'

const TABS: [Tab, string][] = [
  ['telefon', 'Telefon'],
  ['etap', 'Etap'],
  ['puan', 'Puan'],
]

export function PlayerConsole({ code, token, onForget }: { code: string; token: string; onForget: () => void }) {
  const { view, status, rejection, send, now, socket } = useRoom<PlayerView>({ code, role: 'player', token })
  const phone = usePhone({ view, socket, code, token, send })
  const [tab, setTab] = useState<Tab>('telefon')
  const [notice, setNotice] = useState<string | null>(null)
  useWakeLock(true)

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 3000)
    return () => clearTimeout(id)
  }, [notice])

  const run: Send = async (command) => {
    const ack = await send(command)
    if (!ack.ok) setNotice(ack.message)
    return ack
  }

  const incoming = view?.call?.direction === 'in' && view.call.status === 'ringing'
  useEffect(() => {
    if (incoming) setTab('telefon')
  }, [incoming])

  if (rejection?.code === 'not_found' || rejection?.code === 'forbidden') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-5">
        <p className="text-lg font-bold">{rejection.code === 'not_found' ? `${code} odası kapanmış.` : 'Bu tablet odada kayıtlı değil.'}</p>
        <Button
          variant="primary"
          size="lg"
          onClick={() => {
            onForget()
            if (rejection.code === 'not_found') window.location.href = '/'
          }}
        >
          {rejection.code === 'not_found' ? 'Ana sayfaya dön' : 'Yeniden bağlan'}
        </Button>
      </main>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <ConnectionBar status={status} message={rejection?.message} />
      <MarkerFlash marker={view?.marker ?? null} now={now} />
      {!view ? (
        <p className="p-5 text-quiet">Yükleniyor…</p>
      ) : !phone.ready ? (
        <PrepareGate phone={phone} name={view.me.name} />
      ) : (
        <>
          <Header view={view} />
          {view.me.eliminated && <p className="mx-5 mb-3 border-l-2 border-bad pl-3 text-sm text-bad">Oyun dışındasın. Arama yapamazsın.</p>}
          <div className="mx-auto w-full max-w-6xl flex-1 border-t border-line lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:divide-x lg:divide-line">
            <section className={`${tab === 'telefon' ? 'block' : 'hidden'} px-5 pb-28 pt-5 lg:block lg:pb-8`}>
              <PhonePanel view={view} phone={phone} send={run} setNotice={setNotice} now={now} />
            </section>
            <section className={`${tab === 'etap' ? 'block' : 'hidden'} px-5 pb-28 pt-5 lg:block lg:pb-8`}>
              <StagePanel view={view} send={run} now={now} />
              <div className="mt-10 hidden lg:block">
                <Leaderboard view={view} />
              </div>
            </section>
            <section className={`${tab === 'puan' ? 'block' : 'hidden'} px-5 pb-28 pt-5 lg:hidden`}>
              <Leaderboard view={view} />
            </section>
          </div>
          {notice && (
            <p role="alert" className="animate-enter fixed inset-x-5 bottom-20 z-40 mx-auto max-w-md rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper lg:bottom-6">
              {notice}
            </p>
          )}
          <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden">
            <div className="mx-auto grid max-w-md grid-cols-3">
              {TABS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`relative h-14 text-sm font-bold transition-colors ${tab === key ? 'text-ink' : 'text-quiet'}`}
                >
                  {label}
                  {key === 'telefon' && incoming && <span className="absolute right-[calc(50%-30px)] top-4 size-2 rounded-full bg-live animate-live" />}
                  {key === 'etap' && view.stage?.phase === 'active' && tab !== 'etap' && (
                    <span className="absolute right-[calc(50%-22px)] top-4 size-2 rounded-full bg-ink" />
                  )}
                  {tab === key && <span className="absolute inset-x-8 top-0 h-0.5 bg-ink" />}
                </button>
              ))}
            </div>
          </nav>
        </>
      )}
    </div>
  )
}

function PrepareGate({ phone, name }: { phone: PhoneApi; name: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <main className="mx-auto flex min-h-[80dvh] max-w-sm flex-col justify-center px-5">
      <p className="text-sm text-quiet">{name}</p>
      <h1 className="mt-1 text-[28px] font-extrabold tracking-tight">Telefonu hazırla</h1>
      <p className="mt-2 text-quiet">Ahizeyi tablete bağla. Tarayıcı mikrofon izni isteyecek.</p>
      <Button
        variant="primary"
        size="lg"
        className="mt-8 w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await phone.prepare()
          setBusy(false)
        }}
      >
        {busy ? 'Hazırlanıyor…' : 'Hazırla'}
      </Button>
      <button type="button" className="mt-4 text-sm text-quiet underline underline-offset-4" onClick={() => void phone.prepare(true)}>
        Mikrofonsuz dene (test sesi)
      </button>
    </main>
  )
}

function Header({ view }: { view: PlayerView }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-end justify-between gap-4 px-5 pb-4 pt-5">
      <div>
        <p className="text-sm text-quiet">{view.me.name}</p>
        <div className="mt-1 flex items-end gap-6">
          <div>
            <p className="text-[13px] text-quiet">Oda</p>
            <p className="text-4xl font-extrabold leading-none tracking-tight">{view.me.room}</p>
          </div>
          <div>
            <p className="text-[13px] text-quiet">Hattın</p>
            <p className="text-4xl font-extrabold leading-none tracking-[0.08em]">{view.me.line}</p>
          </div>
        </div>
      </div>
      <div className="text-right">
        <p className="text-[13px] text-quiet">Puan</p>
        <AnimatedNumber value={view.me.points} className="text-4xl font-extrabold leading-none" />
      </div>
    </header>
  )
}

const CALL_LABEL: Record<string, string> = {
  ended: 'Görüşüldü',
  missed: 'Cevapsız',
  declined: 'Reddedildi',
  busy: 'Meşgul',
  unreachable: 'Ulaşılamadı',
  ringing: 'Çalıyor',
  active: 'Görüşmede',
}

function PhonePanel({ view, phone, send, setNotice, now }: { view: PlayerView; phone: PhoneApi; send: Send; setNotice: (s: string) => void; now: () => number }) {
  const [number, setNumber] = useState('')
  const call = view.call

  const dial = async () => {
    if (number.length < 3) return
    const ack = await phone.dial(number)
    if (!ack.ok) return setNotice(ack.message)
    if (ack.data.result === 'busy') setNotice('Hat meşgul.')
    if (ack.data.result === 'unreachable') setNotice('Bu numara kullanılmıyor.')
    setNumber('')
  }

  if (call?.status === 'ringing' && call.direction === 'in') {
    return (
      <div className="animate-enter flex min-h-[60dvh] flex-col items-center justify-center text-center lg:min-h-[480px]">
        <p className="flex items-center gap-2 text-sm font-semibold text-live">
          <span className="size-2 rounded-full bg-live animate-live" />
          Telefon çalıyor
        </p>
        <p className="mt-3 text-6xl font-extrabold tracking-[0.08em]">{call.number ?? 'Gizli numara'}</p>
        <div className="mt-10 grid w-full max-w-xs grid-cols-2 gap-3">
          <Button size="lg" variant="danger" onClick={() => void send({ type: 'call.decline', callId: call.id })}>
            Reddet
          </Button>
          <Button size="lg" variant="primary" onClick={() => void send({ type: 'call.answer', callId: call.id })}>
            Aç
          </Button>
        </div>
      </div>
    )
  }

  if (call) {
    return <InCall call={call} phone={phone} send={send} now={now} />
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="flex items-center justify-between text-sm">
        <span className="inline-flex items-center gap-2 font-semibold">
          <Dot tone={view.linesOpen ? 'ok' : 'down'} />
          {view.linesOpen ? 'Hatlar açık' : 'Hatlar kapalı'}
        </span>
        <span className="text-quiet">
          {phone.mode === 'tone' ? 'Test sesi' : 'Mikrofon'}
          {view.voice.enabled ? ' · ses değiştirici' : ''}
        </span>
      </div>
      <div className="mt-4 flex h-20 items-center justify-center rounded-md border border-line-strong text-5xl font-extrabold tracking-[0.15em]">
        {number || <span className="text-line-strong">—</span>}
      </div>
      <div className="mt-3">
        <Keypad value={number} onChange={setNumber} onEnter={() => void dial()} length={6} />
      </div>
      <Button variant="primary" size="lg" className="mt-3 w-full" disabled={number.length < 3 || !view.linesOpen || view.me.eliminated} onClick={dial}>
        Ara
      </Button>
      {phone.error && phone.mode === 'tone' && <p className="mt-3 text-sm text-warn">{phone.error} Test sesi kullanılıyor.</p>}
      {view.recentCalls.length > 0 && (
        <ul className="mt-8 divide-y divide-line border-y border-line text-sm">
          {view.recentCalls.slice(0, 6).map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2.5">
              <span className="font-bold tracking-wider">
                {c.number ?? 'Gizli'} <span className="font-normal tracking-normal text-quiet">{c.direction === 'out' ? 'giden' : 'gelen'}</span>
              </span>
              <span className="text-quiet">
                {CALL_LABEL[c.status]}
                {c.durationMs > 0 && ` · ${clock(c.durationMs)}`} · {timeOfDay(c.startedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function InCall({ call, phone, send, now }: { call: NonNullable<PlayerView['call']>; phone: PhoneApi; send: Send; now: () => number }) {
  useTicker(500)
  const active = call.status === 'active'
  return (
    <div className="animate-enter flex min-h-[60dvh] flex-col items-center justify-center text-center lg:min-h-[480px]">
      <p className="text-sm font-semibold text-quiet">
        {active ? (phone.connected ? 'Görüşmede' : 'Bağlanıyor…') : 'Aranıyor…'}
      </p>
      <p className="mt-3 text-6xl font-extrabold tracking-[0.08em]">{call.number ?? 'Gizli numara'}</p>
      <p className="mt-3 text-2xl font-bold tabular-nums">{active && call.answeredAt ? clock(now() - call.answeredAt + 999) : ' '}</p>
      {active && <LevelMeter phone={phone.phone} muted={phone.muted} />}
      <div className="mt-10 grid w-full max-w-xs grid-cols-2 gap-3">
        <Button size="lg" disabled={!active} onClick={phone.toggleMute} aria-pressed={phone.muted}>
          {phone.muted ? 'Sesi aç' : 'Sessize al'}
        </Button>
        <Button size="lg" variant="danger" onClick={() => void send({ type: 'call.hangup', callId: call.id })}>
          Kapat
        </Button>
      </div>
    </div>
  )
}

function LevelMeter({ phone, muted }: { phone: Phone; muted: boolean }) {
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let frame = 0
    const loop = () => {
      if (bar.current) bar.current.style.transform = `scaleX(${muted ? 0 : phone.level()})`
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [phone, muted])
  return (
    <div className="mt-6 w-40">
      <div className="h-1 overflow-hidden rounded-full bg-line">
        <div ref={bar} className="h-full origin-left bg-ok transition-transform duration-75" />
      </div>
      <p className="mt-1 text-[12px] text-quiet">{muted ? 'Sessizde' : 'Senin sesin'}</p>
    </div>
  )
}

function StagePanel({ view, send, now }: { view: PlayerView; send: Send; now: () => number }) {
  const stage = view.stage

  if (view.status === 'finished') {
    return (
      <div className="animate-enter">
        <p className="text-sm text-quiet">Oyun bitti</p>
        <p className="mt-2 text-4xl font-extrabold">{view.winners.join(', ') || '-'} kazandı</p>
      </div>
    )
  }

  if (view.status === 'setup' || !stage) {
    return (
      <div>
        <p className="text-sm text-quiet">Bekleniyor</p>
        <p className="mt-2 text-3xl font-extrabold">Sunucu oyunu başlatacak.</p>
        <p className="mt-2 text-quiet">Hattını kimseye kolay verme.</p>
      </div>
    )
  }

  const head = (
    <div className="flex items-baseline justify-between gap-3">
      <p className="text-sm text-quiet">
        Etap {stage.number}/{stage.total}
      </p>
      {stage.phase === 'active' && stage.endsAt && (
        <Countdown endsAt={stage.endsAt} pausedAt={stage.pausedAt} now={now} className="text-3xl font-extrabold" />
      )}
    </div>
  )

  if (stage.phase === 'intro') {
    return (
      <div key={`intro-${stage.number}`} className="animate-enter">
        {head}
        <h2 className="mt-1 text-4xl font-extrabold tracking-tight">{stage.title}</h2>
        <p className="text-xl text-quiet">{stage.subtitle}</p>
        <ol className="mt-6 space-y-3">
          {stage.rules.map((rule, i) => (
            <li key={i}>
              <Stagger index={i} step={80}>
                <p className="flex gap-3 text-lg">
                  <span className="w-5 shrink-0 font-bold text-quiet">{i + 1}</span>
                  {rule}
                </p>
              </Stagger>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-quiet">Sunucu başlatınca süre işlemeye başlar.</p>
      </div>
    )
  }

  if (stage.phase === 'active') {
    return (
      <div key={`active-${stage.number}`} className="animate-enter">
        {head}
        <h2 className="mt-1 text-3xl font-extrabold tracking-tight">{stage.title}</h2>
        {stage.endsAt && stage.startedAt && (
          <div className="mt-3">
            <ProgressBar startedAt={stage.startedAt} endsAt={stage.endsAt} pausedAt={stage.pausedAt} now={now} />
          </div>
        )}
        {stage.pausedAt && <p className="mt-3 rounded-md bg-soft px-3.5 py-2.5 text-sm font-semibold">Duraklatıldı. Süre işlemiyor.</p>}
        {!stage.playing ? (
          <p className="mt-4 text-quiet">Bu etapta yoksun.</p>
        ) : stage.roomGuess ? (
          <RoomGuessForm data={stage.roomGuess} send={send} />
        ) : stage.buttons ? (
          <ButtonsGame data={stage.buttons} send={send} now={now} paused={stage.pausedAt !== null} />
        ) : stage.loveVote ? (
          <LoveVoteForm data={stage.loveVote} send={send} />
        ) : stage.manual ? (
          <Salon points={view.me.points} />
        ) : null}
      </div>
    )
  }

  const result = stage.result
  const award = result?.award ?? null
  return (
    <div key={`result-${stage.number}`} className="animate-enter">
      {head}
      <h2 className="mt-1 text-3xl font-extrabold tracking-tight">{stage.title}</h2>
      {result ? (
        <div className={`mt-6 grid gap-px overflow-hidden rounded-md border border-line bg-line ${stage.manual ? 'grid-cols-1' : 'grid-cols-3'}`}>
          {!stage.manual && <Stat label="Oyun puanın" value={result.points} />}
          {!stage.manual && <Stat label="Sıran" value={result.position ? `${result.position}/${result.of}` : '—'} />}
          <Stat label="Tabloya" value={award === null ? '…' : award > 0 ? `+${award}` : String(award)} />
        </div>
      ) : (
        <p className="mt-4 text-quiet">Bu etapta yoktun.</p>
      )}
      {!result?.confirmed && <p className="mt-4 text-quiet">Sunucu sonuçları açıklıyor.</p>}
      {stage.reveal.length > 0 && (
        <div className="mt-8">
          <p className="border-b border-line pb-2 text-sm font-bold">Kim kime oy verdi</p>
          <ul className="divide-y divide-line text-sm">
            {stage.reveal.map((v, i) => (
              <li key={i}>
                <Stagger index={i} step={60}>
                  <p className="py-2">
                    <span className="font-bold">{v.from}</span> → <span className="font-bold">{v.to}</span>
                  </p>
                </Stagger>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

type ButtonsData = NonNullable<NonNullable<PlayerView['stage']>['buttons']>

function ButtonsGame({ data, send, now, paused }: { data: ButtonsData; send: Send; now: () => number; paused: boolean }) {
  useTicker(500)
  const pair = data.pair
  const last = data.last
  const fresh = last && last.at !== null && now() - last.at < 8000
  const left = pair ? data.timeoutSeconds * 1000 - (now() - pair.startedAt) : 0
  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-quiet">{data.rounds} eşleşme</p>
        <p className="text-sm">
          Oyun puanın <AnimatedNumber value={data.points} className="ml-1 text-2xl font-extrabold" />
        </p>
      </div>
      {fresh && last && (
        <div key={last.id} className="animate-enter mt-4 rounded-md bg-soft px-4 py-3">
          <p className="text-sm text-quiet">{last.partnerName} ile sonuç</p>
          <p className="mt-1 text-lg font-bold">
            Sen {choiceText(last.myChoice)}, eşin {choiceText(last.partnerChoice)}
            <span className={`ml-3 ${last.delta > 0 ? 'text-ok' : 'text-quiet'}`}>+{last.delta}</span>
          </p>
          {last.outcome === 'timeout' && <p className="text-[13px] text-quiet">Süre doldu.</p>}
        </div>
      )}
      {pair ? (
        <div key={pair.id} className="animate-enter mt-5">
          <p className="text-sm text-quiet">Eşin</p>
          <p className="text-4xl font-extrabold tracking-tight">{pair.partnerName}</p>
          <p className="mt-1 text-sm text-quiet">
            Hattı <span className="font-bold tracking-[0.1em] text-ink">{pair.partnerLine}</span> · {clock(Math.max(0, left))} içinde bas
          </p>
          {pair.myChoice ? (
            <p className="mt-6 rounded-md bg-soft px-4 py-3 text-lg font-bold">
              {choiceText(pair.myChoice)} bastın. Eşin bekleniyor.
            </p>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={paused}
                onClick={() => void send({ type: 'button.press', choice: 'green' })}
                className="h-32 rounded-xl bg-[#1d9a5a] text-2xl font-extrabold text-white transition-transform duration-150 active:scale-[0.96] disabled:opacity-40"
              >
                YEŞİL
              </button>
              <button
                type="button"
                disabled={paused}
                onClick={() => void send({ type: 'button.press', choice: 'red' })}
                className="h-32 rounded-xl bg-[#d1342c] text-2xl font-extrabold text-white transition-transform duration-150 active:scale-[0.96] disabled:opacity-40"
              >
                KIRMIZI
              </button>
            </div>
          )}
          <p className="mt-3 text-[13px] text-quiet">İkiniz yeşil: +1 +1 · Kırmızı +2, yeşil 0 · İkiniz kırmızı: 0</p>
        </div>
      ) : (
        <p className="mt-6 text-2xl font-extrabold">Yeni eş bekleniyor…</p>
      )}
    </div>
  )
}

function choiceText(choice: 'green' | 'red' | null): string {
  return choice === 'green' ? 'yeşil' : choice === 'red' ? 'kırmızı' : 'basmadı'
}

function LoveVoteForm({ data, send }: { data: NonNullable<NonNullable<PlayerView['stage']>['loveVote']>; send: Send }) {
  return (
    <div className="mt-5">
      <p className="text-sm font-bold">Kime oy veriyorsun?</p>
      <ul className="mt-2 grid grid-cols-2 gap-2">
        {data.targets.map((t) => {
          const on = data.myVote === t.id
          return (
            <li key={t.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => void send({ type: 'vote.cast', targetId: t.id })}
                className={`h-16 w-full rounded-md border text-lg font-bold transition-[background-color,transform] duration-150 active:scale-[0.97] ${
                  on ? 'border-ink bg-ink text-paper' : 'border-line-strong hover:bg-soft'
                }`}
              >
                {t.name}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-[13px] text-quiet">{data.myVote ? 'Süre bitene kadar değiştirebilirsin.' : 'Henüz oy vermedin.'}</p>
    </div>
  )
}

function Salon({ points }: { points: number }) {
  return (
    <div className="mt-8">
      <p className="text-3xl font-extrabold">Bu oyun salonda oynanıyor.</p>
      <p className="mt-2 text-quiet">Puanları sunucu girer.</p>
      <p className="mt-6 text-sm text-quiet">Genel puanın</p>
      <AnimatedNumber value={points} className="text-5xl font-extrabold" />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-paper px-4 py-3">
      <p className="text-[13px] text-quiet">{label}</p>
      <p className="text-2xl font-extrabold">{value}</p>
    </div>
  )
}

function RoomGuessForm({ data, send }: { data: NonNullable<NonNullable<PlayerView['stage']>['roomGuess']>; send: Send }) {
  const [draft, setDraft] = useState<Record<string, string>>(data.guesses)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const locked = data.lockedAt !== null
  const filled = data.targets.filter((t) => (draft[t.id] ?? '') !== '').length

  useEffect(() => {
    setDraft((current) => {
      const next = { ...data.guesses }
      for (const [id, value] of Object.entries(current)) if (timers.current.has(id)) next[id] = value
      return next
    })
  }, [data.guesses])

  const change = (targetId: string, value: string) => {
    const room = value.replace(/\D/g, '').slice(0, 4)
    setDraft((d) => ({ ...d, [targetId]: room }))
    const existing = timers.current.get(targetId)
    if (existing) clearTimeout(existing)
    timers.current.set(
      targetId,
      setTimeout(() => {
        timers.current.delete(targetId)
        void send({ type: 'guess.set', targetId, room })
      }, 450),
    )
  }

  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-bold">Kim hangi odada?</p>
        <p className="text-sm text-quiet">
          {filled}/{data.targets.length}
        </p>
      </div>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {data.targets.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-4 py-2.5">
            <label htmlFor={`g-${t.id}`} className="text-lg font-semibold">
              {t.name}
            </label>
            <input
              id={`g-${t.id}`}
              inputMode="numeric"
              autoComplete="off"
              disabled={locked}
              value={draft[t.id] ?? ''}
              onChange={(e) => change(t.id, e.target.value)}
              placeholder="Oda"
              className="h-12 w-24 rounded-md border border-line-strong bg-paper text-center text-2xl font-extrabold outline-none transition-colors focus:border-ink disabled:opacity-60"
            />
          </li>
        ))}
      </ul>
      {locked ? (
        <p className="animate-enter mt-4 rounded-md bg-soft px-3.5 py-2.5 text-sm font-semibold">Listen kilitli. Süre bitince sonuç açıklanacak.</p>
      ) : (
        <Button
          size="lg"
          className="mt-4 w-full"
          onClick={() => {
            if (window.confirm('Liste kilitlensin mi? Sonra değiştiremezsin.')) void send({ type: 'guess.lock' })
          }}
        >
          Listeyi kilitle
        </Button>
      )}
      <p className="mt-2 text-[13px] text-quiet">Yazdıkça kaydedilir. Erken kilitleyen eşitlikte öne geçer.</p>
    </div>
  )
}

function Leaderboard({ view }: { view: PlayerView }) {
  return (
    <div>
      <h3 className="border-b border-line pb-2 text-sm font-bold">Puan tablosu</h3>
      <FlipList
        items={view.leaderboard}
        className="divide-y divide-line"
        render={(row, i) => (
          <div className={`flex items-center justify-between py-2.5 ${row.eliminated ? 'text-quiet line-through' : ''}`}>
            <span>
              <span className="mr-4 inline-block w-4 text-quiet">{i + 1}</span>
              <span className={row.id === view.me.id ? 'font-bold' : ''}>{row.name}</span>
            </span>
            <AnimatedNumber value={row.points} className="font-bold" />
          </div>
        )}
      />
    </div>
  )
}
