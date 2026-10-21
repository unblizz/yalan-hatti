'use client'

import { useState } from 'react'
import { Countdown, ProgressBar, useTicker } from '@/components/live'
import { AnimatedNumber, FlipList, Stagger } from '@/components/motion'
import { Button, Dot, Section, Select } from '@/components/ui'
import { clock, timeOfDay } from '@/lib/format'
import type { ButtonChoice, HostStage, HostView, StageKind, Standing } from '@/lib/types'
import { CHECKLIST, seconds, STAGE_DURATIONS, type Send } from './shared'

export function StageTab({ view, send, now, goSetup }: { view: HostView; send: Send; now: () => number; goSetup: () => void }) {
  if (view.status === 'setup') {
    return (
      <Section framed title="Oyun başlamadı">
        <p className="text-lg">Önce kurulumda oda ve hat numaralarını kontrol et, tabletleri bağla, sonra oyunu başlat.</p>
        <Button variant="primary" size="lg" className="mt-4" onClick={goSetup}>
          Kuruluma git
        </Button>
      </Section>
    )
  }
  if (view.status === 'finished') {
    return (
      <Section framed title="Oyun bitti">
        <p className="text-4xl font-extrabold">{view.winners.join(', ') || '-'} kazandı</p>
        <p className="mt-2 text-quiet">Kayıt sekmesinden olay günlüğünü indirmeyi unutma.</p>
      </Section>
    )
  }
  const stage = view.stage && view.stage.phase !== 'done' ? view.stage : null
  if (!stage) return <Chooser view={view} send={send} />
  if (stage.phase === 'intro') return <Intro key={stage.number} view={view} stage={stage} send={send} />
  if (stage.phase === 'active') return <Active view={view} stage={stage} send={send} now={now} />
  return <Review view={view} stage={stage} send={send} />
}

function Chooser({ view, send }: { view: HostView; send: Send }) {
  const next = view.stages.length + 1
  const last = view.stage?.phase === 'done' ? view.stage : null
  const winners = last?.standings.filter((s) => s.award !== 0) ?? []
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-5">
        {last && (
          <Section framed title={`Etap ${last.number} tamamlandı · ${last.title}`}>
            {winners.length === 0 ? (
              <p className="text-sm text-quiet">Bu etapta kimse puan almadı.</p>
            ) : (
              <ul className="text-sm">
                {winners.map((r) => (
                  <li key={r.playerId} className="flex justify-between py-1">
                    <span className="font-bold">
                      {r.position ? `${r.position}. ` : ''}
                      {r.name}
                    </span>
                    <AwardText value={r.award} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
        <Section framed title={`Etap ${next}/${view.totalStages}`} meta="Sıradaki oyunu seç">
          <ul className="-my-2 divide-y divide-line">
            {view.catalog.map((c) => (
              <li key={c.kind} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-lg font-bold">{c.title}</p>
                  <p className="text-sm text-quiet">
                    {c.subtitle} · {seconds(c.defaultSeconds)}
                    {c.manual && ' · puanı sen girersin'}
                    {c.played > 0 && ` · ${c.played} kez oynandı`}
                  </p>
                </div>
                <Button variant="primary" onClick={() => void send({ type: 'stage.open', kind: c.kind as StageKind })}>
                  Aç
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-quiet">Kalan etaplar kuralları netleşince eklenecek.</p>
        </Section>
      </div>
      <div className="space-y-5">
        <MiniLeaderboard view={view} />
        <Button
          variant="ghost"
          onClick={() => {
            if (window.confirm('Oyun bitirilsin mi?')) void send({ type: 'game.finish' })
          }}
        >
          Oyunu bitir
        </Button>
      </div>
    </div>
  )
}

function Intro({ view, stage, send }: { view: HostView; stage: HostStage; send: Send }) {
  const [checked, setChecked] = useState<boolean[]>(() => CHECKLIST.map(() => false))
  const [secs, setSecs] = useState(stage.seconds)
  const [scheme, setScheme] = useState<number[]>(stage.awards)
  const offline = view.players.filter((p) => !p.eliminated && !p.online)

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="rounded-xl border border-line p-6">
        <p className="text-sm text-quiet">
          Etap {stage.number}/{stage.total} · Sunucu metni
        </p>
        <h2 className="mt-1 text-4xl font-extrabold tracking-tight">{stage.title}</h2>
        <p className="text-xl text-quiet">{stage.subtitle}</p>
        <ol className="mt-6 space-y-4">
          {stage.rules.map((rule, i) => (
            <li key={i}>
              <Stagger index={i} step={70}>
                <p className="flex gap-4 text-xl leading-snug">
                  <span className="w-6 shrink-0 font-extrabold text-quiet">{i + 1}</span>
                  {rule}
                </p>
              </Stagger>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-quiet">Bu metin tabletlerde ve sahne ekranında da görünüyor.</p>
      </section>

      <div className="space-y-5">
        <Section framed title="Kayıt kontrolü" meta={stage.checklistReady ? 'Onaylandı' : `${checked.filter(Boolean).length}/${CHECKLIST.length}`}>
          <ul className="-my-1 divide-y divide-line">
            {CHECKLIST.map((item, i) => (
              <li key={item}>
                <label className="flex cursor-pointer items-center gap-3 py-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--ink)]"
                    disabled={stage.checklistReady}
                    checked={stage.checklistReady || !!checked[i]}
                    onChange={(e) => setChecked((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))}
                  />
                  <span className={stage.checklistReady || checked[i] ? '' : 'text-quiet'}>{item}</span>
                </label>
              </li>
            ))}
          </ul>
          {!stage.checklistReady && (
            <Button className="mt-3" disabled={!checked.every(Boolean)} onClick={() => void send({ type: 'checklist.confirm', items: CHECKLIST })}>
              Kontrolü onayla
            </Button>
          )}
        </Section>

        <Section framed title="Başlat">
          <label className="text-sm text-quiet" htmlFor="secs">
            Süre
          </label>
          <Select id="secs" className="mt-1" value={secs} onChange={(e) => setSecs(Number(e.target.value))}>
            {[...new Set([...STAGE_DURATIONS, stage.seconds, 600])]
              .sort((a, b) => a - b)
              .map((s) => (
                <option key={s} value={s}>
                  {seconds(s)}
                </option>
              ))}
          </Select>
          {stage.manual ? (
            <p className="mt-3 text-sm text-quiet">Bu etabın puanlarını etap bitince sen gireceksin.</p>
          ) : (
            <div className="mt-4">
              <p className="text-sm text-quiet">Tabloya yazılacak puan</p>
              <div className="mt-1 flex overflow-hidden rounded-md border border-line-strong">
                {view.awardSchemes.map((s) => {
                  const on = s.join() === scheme.join()
                  return (
                    <button
                      key={s.join()}
                      type="button"
                      onClick={() => setScheme(s)}
                      className={`h-10 flex-1 text-sm font-bold transition-colors ${on ? 'bg-ink text-paper' : 'hover:bg-soft'}`}
                    >
                      {s.join(' · ')}
                    </button>
                  )
                })}
              </div>
              <p className="mt-1 text-[13px] text-quiet">1., 2., 3. sıraya. Eşitler sırayı paylaşır.</p>
            </div>
          )}
          {offline.length > 0 && (
            <p className="mt-3 border-l-2 border-warn pl-3 text-sm">
              Bağlı değil: <span className="font-semibold">{offline.map((p) => p.name).join(', ')}</span>
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="lg"
              disabled={!stage.checklistReady}
              onClick={() => {
                if (offline.length > 0 && !window.confirm(`${offline.length} kişi bağlı değil. Yine de başlatılsın mı?`)) return
                void send({ type: 'stage.start', seconds: secs, ...(stage.manual ? {} : { awards: scheme }) })
              }}
            >
              Etabı başlat
            </Button>
            <Button variant="ghost" onClick={() => void send({ type: 'stage.cancel' })}>
              Vazgeç
            </Button>
          </div>
          {!stage.checklistReady && <p className="mt-2 text-sm text-quiet">Önce kayıt kontrolü.</p>}
          {stage.usesPhone && <p className="mt-3 text-[13px] text-quiet">Başlayınca hatlar açılır, etap bitince kapanır.</p>}
        </Section>
      </div>
    </div>
  )
}

function Active({ view, stage, send, now }: { view: HostView; stage: HostStage; send: Send; now: () => number }) {
  const paused = stage.pausedAt !== null
  const talking = view.lines.filter((l) => l.status === 'talking').length / 2
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-line">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm text-quiet">
              Etap {stage.number}/{stage.total} · {paused ? 'Duraklatıldı' : 'Süre işliyor'}
              {stage.usesPhone && ` · ${talking} görüşme`}
            </p>
            <h2 className="text-3xl font-extrabold tracking-tight">{stage.title}</h2>
            {!stage.manual && <p className="text-sm text-quiet">Tabloya: {stage.awards.join(' · ')}</p>}
          </div>
          {stage.endsAt && <Countdown endsAt={stage.endsAt} pausedAt={stage.pausedAt} now={now} className="text-7xl font-extrabold tracking-tight" />}
        </div>
        {stage.endsAt && stage.startedAt && <ProgressBar startedAt={stage.startedAt} endsAt={stage.endsAt} pausedAt={stage.pausedAt} now={now} />}
        <div className="flex flex-wrap gap-2 p-4">
          <Button variant="primary" onClick={() => void send({ type: paused ? 'stage.resume' : 'stage.pause' })}>
            {paused ? 'Sürdür' : 'Duraklat'}
          </Button>
          <Button onClick={() => void send({ type: 'stage.extend', seconds: 30 })}>+30 sn</Button>
          <Button onClick={() => void send({ type: 'stage.extend', seconds: 60 })}>+1 dk</Button>
          {stage.usesPhone && <Button onClick={() => void send({ type: 'lines.set', open: !view.linesOpen })}>{view.linesOpen ? 'Hatları kapat' : 'Hatları aç'}</Button>}
          <Button
            variant="ghost"
            className="ml-auto"
            onClick={() => {
              if (window.confirm('Etap şimdi bitirilsin mi?')) void send({ type: 'stage.close' })
            }}
          >
            Etabı bitir
          </Button>
        </div>
      </section>
      {stage.kind === 'roomGuess' && <RoomGuessLive view={view} stage={stage} />}
      {stage.kind === 'buttons' && <ButtonsLive stage={stage} now={now} />}
      {stage.kind === 'loveVote' && <LoveVoteLive stage={stage} />}
      {stage.kind === 'bomb' && (
        <Section framed title="Salonda oynanıyor">
          <p className="text-lg">Tabletlerde “Bu oyun salonda oynanıyor” yazıyor.</p>
          <p className="mt-1 text-quiet">Etabı bitirince herkesin artı ya da eksi puanını gireceksin.</p>
        </Section>
      )}
    </div>
  )
}

function RoomGuessLive({ view, stage }: { view: HostView; stage: HostStage }) {
  const lineOf = new Map(view.lines.map((l) => [l.playerId, l]))
  const rows = [...stage.rows].sort((a, b) => b.filled - a.filled || a.name.localeCompare(b.name, 'tr'))
  return (
    <Section framed title="Listeler" meta={`${stage.rows.filter((r) => r.lockedAt).length}/${stage.rows.length} kilitli · doğrular yalnız sende`}>
      <FlipList
        items={rows.map((r) => ({ ...r, id: r.playerId }))}
        className="-my-2 divide-y divide-line"
        render={(r) => (
          <div className="flex items-center gap-4 py-2.5">
            <Dot tone={lineOf.get(r.playerId)?.online ? 'ok' : 'down'} />
            <span className="w-36 truncate font-bold">{r.name}</span>
            <div className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-line sm:block">
              <div className="h-full origin-left bg-ink transition-transform duration-500" style={{ transform: `scaleX(${r.total ? r.filled / r.total : 0})` }} />
            </div>
            <span className="w-14 text-right tabular-nums">
              {r.filled}/{r.total}
            </span>
            <span className="w-20 text-right text-sm">
              <AnimatedNumber value={r.correct} className="font-bold text-ok" /> doğru
            </span>
            <span className="w-24 text-right text-[13px] text-quiet">{r.lockedAt ? `kilit ${timeOfDay(r.lockedAt)}` : ''}</span>
          </div>
        )}
      />
    </Section>
  )
}

function ChoiceDot({ choice, done = false }: { choice: ButtonChoice | null; done?: boolean }) {
  if (!choice) return <span className="text-[13px] text-quiet">{done ? 'basmadı' : 'bekliyor'}</span>
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-bold ${choice === 'green' ? 'text-ok' : 'text-bad'}`}>
      <span className={`size-2.5 rounded-full ${choice === 'green' ? 'bg-ok' : 'bg-bad'}`} />
      {choice === 'green' ? 'yeşil' : 'kırmızı'}
    </span>
  )
}

function ButtonsLive({ stage, now }: { stage: HostStage; now: () => number }) {
  useTicker(1000)
  const b = stage.buttons!
  const limit = b.timeoutSeconds * 1000
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-5">
        <Section framed title="Şu anki eşleşmeler" meta={`${b.active.length} eşleşme · ${b.timeoutSeconds} sn sınır`}>
          {b.active.length === 0 ? (
            <p className="text-sm text-quiet">Eşleşme yok.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {b.active.map((p) => {
                const left = limit - (now() - p.startedAt)
                return (
                  <li key={p.id} className="animate-enter rounded-lg border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">{p.a.name}</span>
                      <ChoiceDot choice={p.a.choice} />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="font-bold">{p.b.name}</span>
                      <ChoiceDot choice={p.b.choice} />
                    </div>
                    <p className={`mt-2 text-[13px] tabular-nums ${left < 10_000 ? 'text-warn' : 'text-quiet'}`}>{clock(Math.max(0, left))} kaldı</p>
                  </li>
                )
              })}
            </ul>
          )}
          {b.waiting.length > 0 && (
            <p className="mt-4 text-sm text-quiet">
              Eş bekliyor: <span className="font-semibold text-ink">{b.waiting.map((w) => w.name).join(', ')}</span>
            </p>
          )}
        </Section>
        <Section framed title="Son sonuçlar">
          {b.history.length === 0 ? (
            <p className="text-sm text-quiet">Henüz sonuç yok.</p>
          ) : (
            <ul className="-my-1 divide-y divide-line text-sm">
              {b.history.slice(0, 15).map((h) => (
                <li key={h.id} className="animate-enter flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                  <span className="w-16 shrink-0 text-quiet">{timeOfDay(h.at)}</span>
                  {h.outcome === 'void' ? (
                    <span className="text-quiet">
                      {h.a.name} ↔ {h.b.name}: süre doldu
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-2">
                        {h.a.name} <ChoiceDot choice={h.a.choice} done /> <span className="font-bold">+{h.a.delta}</span>
                      </span>
                      <span className="inline-flex items-center gap-2">
                        {h.b.name} <ChoiceDot choice={h.b.choice} done /> <span className="font-bold">+{h.b.delta}</span>
                      </span>
                      {h.outcome === 'timeout' && <span className="text-[12px] text-warn">eş basmadı</span>}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      <StandingsCard stage={stage} title="Kandırmaca sıralaması" />
    </div>
  )
}

function LoveVoteLive({ stage }: { stage: HostStage }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Section framed title="Oylar" meta={`${stage.votes.length}/${stage.participants.length} oy`}>
        {stage.votes.length === 0 ? (
          <p className="text-sm text-quiet">Henüz oy yok.</p>
        ) : (
          <ul className="-my-1 divide-y divide-line text-sm">
            {stage.votes.map((v) => (
              <li key={v.fromId} className="animate-enter flex justify-between py-2">
                <span>
                  <span className="font-bold">{v.from}</span> → <span className="font-bold">{v.to}</span>
                </span>
                <span className="text-quiet">{timeOfDay(v.at)}</span>
              </li>
            ))}
          </ul>
        )}
        {stage.notVoted.length > 0 && (
          <p className="mt-3 text-sm text-quiet">
            Oy vermedi: <span className="font-semibold text-ink">{stage.notVoted.join(', ')}</span>
          </p>
        )}
      </Section>
      <StandingsCard stage={stage} title="Aldığı oy" />
    </div>
  )
}

function StandingsCard({ stage, title }: { stage: HostStage; title: string }) {
  return (
    <Section framed title={title}>
      <FlipList
        items={stage.standings.map((s) => ({ ...s, id: s.playerId }))}
        className="-my-2 divide-y divide-line"
        render={(s) => (
          <div className="flex items-center justify-between py-2">
            <span>
              <span className="mr-3 inline-block w-5 text-quiet">{s.position ?? '–'}</span>
              <span className="font-bold">{s.name}</span>
            </span>
            <span>
              <AnimatedNumber value={s.points} className="font-extrabold" /> <span className="text-[13px] text-quiet">{stage.scoreLabel}</span>
            </span>
          </div>
        )}
      />
    </Section>
  )
}

function Review({ view, stage, send }: { view: HostView; stage: HostStage; send: Send }) {
  const [open, setOpen] = useState<string | null>(null)
  const counts = new Map<number, number>()
  stage.standings.forEach((s) => s.position && counts.set(s.position, (counts.get(s.position) ?? 0) + 1))
  const setAward = (s: Standing, next: number) => {
    if (next < -10 || next > 10) return
    void send({ type: 'stage.award', playerId: s.playerId, award: next })
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-5">
        <Section
          framed
          title={`Etap ${stage.number} sonucu · ${stage.title}`}
          meta={stage.manual ? 'Puanları sen gir' : stage.result?.adjusted ? 'Elle değişti' : `Tabloya ${stage.awards.join(' · ')} · eşitler paylaşır`}
        >
          <ul className="-my-2 divide-y divide-line">
            {stage.standings.map((s) => {
              const row = stage.rows.find((r) => r.playerId === s.playerId)
              return (
                <li key={s.playerId} className="py-2">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-lg font-extrabold">{stage.manual ? '' : s.position}</span>
                    <button
                      type="button"
                      className={`min-w-0 flex-1 truncate text-left font-bold ${row ? 'hover:underline' : ''}`}
                      onClick={() => row && setOpen(open === s.playerId ? null : s.playerId)}
                    >
                      {s.name}
                    </button>
                    {!stage.manual && s.position && (counts.get(s.position) ?? 0) > 1 && (
                      <span className="rounded bg-soft px-1.5 py-0.5 text-[11px] font-bold">eşit</span>
                    )}
                    {!stage.manual && (
                      <span className="w-20 text-right tabular-nums">
                        {s.points} {stage.scoreLabel}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Button variant="ghost" className="h-8 w-8 px-0" aria-label="Azalt" onClick={() => setAward(s, s.award - 1)}>
                        −
                      </Button>
                      <span className="w-10 text-center">
                        <AwardText value={s.award} />
                      </span>
                      <Button variant="ghost" className="h-8 w-8 px-0" aria-label="Arttır" onClick={() => setAward(s, s.award + 1)}>
                        +
                      </Button>
                    </span>
                  </div>
                  {open === s.playerId && row && (
                    <ul className="animate-enter mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-soft p-3 text-sm sm:grid-cols-3">
                      {row.guesses.map((g) => (
                        <li key={g.targetId} className="flex justify-between gap-2">
                          <span>{g.targetName}</span>
                          <span className={g.room === null ? 'text-quiet' : g.correct ? 'font-bold text-ok' : 'font-bold text-bad'}>{g.room ?? '—'}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                if (window.confirm('Puanlar tabloya yazılsın mı? Sonra değişmez.')) void send({ type: 'stage.confirm' })
              }}
            >
              Puanları tabloya yaz
            </Button>
            <span className="text-sm text-quiet">{stage.manual ? 'Eksi puan da girebilirsin.' : 'Sıfır puanlı tablo puanı almaz.'}</span>
          </div>
        </Section>
        {stage.kind === 'loveVote' && stage.votes.length > 0 && (
          <Section framed title="Kim kime oy verdi">
            <ul className="-my-1 divide-y divide-line text-sm">
              {stage.votes.map((v) => (
                <li key={v.fromId} className="py-1.5">
                  <span className="font-bold">{v.from}</span> → <span className="font-bold">{v.to}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
      <MiniLeaderboard view={view} />
    </div>
  )
}

function AwardText({ value }: { value: number }) {
  return <span className={`font-extrabold ${value > 0 ? 'text-ok' : value < 0 ? 'text-bad' : 'text-quiet'}`}>{value > 0 ? `+${value}` : value === 0 ? '—' : value}</span>
}

function MiniLeaderboard({ view }: { view: HostView }) {
  return (
    <Section framed title="Genel tablo">
      <FlipList
        items={view.leaderboard}
        className="-my-2 divide-y divide-line"
        render={(row, i) => (
          <div className={`flex items-center justify-between py-2 ${row.eliminated ? 'text-quiet line-through' : ''}`}>
            <span>
              <span className="mr-3 inline-block w-4 text-quiet">{i + 1}</span>
              {row.name}
            </span>
            <AnimatedNumber value={row.points} className="font-extrabold" />
          </div>
        )}
      />
    </Section>
  )
}
