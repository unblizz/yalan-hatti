'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { JoinQr, useJoinUrl } from '@/components/join-qr'
import { ConnectionBar, Countdown, MarkerFlash, ProgressBar } from '@/components/live'
import { AnimatedNumber, FlipList, Stagger } from '@/components/motion'
import { StatusLabel } from '@/components/ui'
import { normalizeCode } from '@/lib/format'
import type { ScreenView } from '@/lib/types'
import { useRoom } from '@/lib/use-room'

export default function ScreenPage() {
  const params = useParams<{ code: string }>()
  const code = normalizeCode(params.code)
  const { view, status, rejection, now } = useRoom<ScreenView>({ code, role: 'screen', token: null, label: 'Sahne' })
  const joinUrl = useJoinUrl(code)

  if (rejection?.code === 'not_found') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5">
        <p className="text-lg font-bold">{code} diye bir oda yok.</p>
        <Link href="/" className="mt-4 text-sm font-semibold underline underline-offset-4">
          Ana sayfa
        </Link>
      </main>
    )
  }

  const stage = view?.stage
  const open = stage && stage.phase !== 'done'

  return (
    <div className="flex min-h-dvh flex-col">
      <ConnectionBar status={status} message={rejection?.message} />
      <MarkerFlash marker={view?.marker ?? null} now={now} />
      {view && (
        <main className="grid flex-1 gap-12 px-8 py-10 lg:grid-cols-[3fr_2fr] lg:px-16 lg:py-14">
          <section className="flex flex-col">
            <div className="flex items-center gap-6 text-xl">
              <span className="font-extrabold">Yalan Hattı</span>
              <StatusLabel status={view.status} stage={stage ?? null} />
            </div>
            <div className="mt-auto pt-12">
              {view.status === 'finished' ? (
                <div className="animate-enter">
                  <p className="text-2xl text-quiet">Kazanan</p>
                  <h1 className="text-7xl font-extrabold tracking-tight lg:text-9xl">{view.winners.join(', ') || '-'}</h1>
                </div>
              ) : open && stage.phase === 'active' ? (
                <div key={`active-${stage.number}`} className="animate-enter">
                  <p className="text-2xl text-quiet">
                    Etap {stage.number}/{stage.total}
                  </p>
                  <h1 className="text-6xl font-extrabold tracking-tight lg:text-8xl">{stage.title}</h1>
                  {stage.endsAt && (
                    <Countdown endsAt={stage.endsAt} pausedAt={stage.pausedAt} now={now} className="mt-6 block text-[9rem] font-extrabold leading-none tracking-tight lg:text-[12rem]" />
                  )}
                  {stage.endsAt && stage.startedAt && (
                    <div className="mt-6 max-w-2xl">
                      <ProgressBar startedAt={stage.startedAt} endsAt={stage.endsAt} pausedAt={stage.pausedAt} now={now} />
                    </div>
                  )}
                  <p className="mt-4 text-2xl text-quiet">
                    {stage.pausedAt
                      ? 'Duraklatıldı'
                      : stage.manual
                        ? 'Bu oyun salonda oynanıyor'
                        : `${stage.progress.done} ${stage.progress.label}${stage.usesPhone ? ` · ${view.activeCalls} görüşme` : ''}`}
                  </p>
                </div>
              ) : open && stage.phase === 'intro' ? (
                <div key={`intro-${stage.number}`} className="animate-enter">
                  <p className="text-2xl text-quiet">
                    Sıradaki oyun · Etap {stage.number}/{stage.total}
                  </p>
                  <h1 className="text-6xl font-extrabold tracking-tight lg:text-8xl">{stage.title}</h1>
                  <p className="text-3xl text-quiet">{stage.subtitle}</p>
                  <ol className="mt-8 max-w-3xl space-y-3 text-2xl">
                    {stage.rules.map((rule, i) => (
                      <li key={i}>
                        <Stagger index={i} step={120}>
                          <p className="flex gap-4">
                            <span className="w-6 shrink-0 font-extrabold text-quiet">{i + 1}</span>
                            {rule}
                          </p>
                        </Stagger>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : open && stage.phase === 'review' ? (
                <div key={`review-${stage.number}`} className="animate-enter">
                  <p className="text-2xl text-quiet">
                    Etap {stage.number} · {stage.title}
                  </p>
                  <h1 className="text-6xl font-extrabold tracking-tight lg:text-8xl">Sonuçlar açıklanıyor</h1>
                  <Reveal votes={stage.reveal} />
                </div>
              ) : stage && stage.phase === 'done' && view.status === 'live' ? (
                <Results key={`done-${stage.number}`} stage={stage} />
              ) : view.status === 'setup' ? (
                <div className="animate-enter flex flex-wrap items-end gap-10">
                  {joinUrl && <JoinQr url={joinUrl} size={240} />}
                  <div>
                    <p className="text-2xl text-quiet">{joinUrl ? joinUrl.replace(/^https?:\/\//, '').replace(/\/\?kod=.*$/, '') : ''}</p>
                    <p className="text-[8rem] font-extrabold leading-none tracking-[0.08em] lg:text-[11rem]">{view.code}</p>
                    <p className="mt-4 text-2xl text-quiet">
                      <AnimatedNumber value={view.playerCount} /> oyuncu
                    </p>
                  </div>
                </div>
              ) : (
                <div className="animate-enter">
                  <p className="text-2xl text-quiet">{stage ? `Etap ${stage.number} tamamlandı` : 'Oyun başladı'}</p>
                  <h1 className="text-6xl font-extrabold tracking-tight lg:text-8xl">Sıradaki etap birazdan</h1>
                </div>
              )}
            </div>
          </section>
          <section>
            <h2 className="border-b border-line pb-3 text-xl font-bold">Puan tablosu</h2>
            <FlipList
              items={view.leaderboard}
              className="divide-y divide-line"
              render={(row, i) => (
                <div className={`flex items-center justify-between py-4 text-3xl ${row.eliminated ? 'text-quiet line-through' : ''}`}>
                  <span>
                    <span className="mr-5 inline-block w-8 text-quiet">{i + 1}</span>
                    {row.name}
                  </span>
                  <AnimatedNumber value={row.points} className="font-extrabold" />
                </div>
              )}
            />
          </section>
        </main>
      )}
    </div>
  )
}

function Results({ stage }: { stage: NonNullable<ScreenView['stage']> }) {
  const winners = stage.manual
    ? stage.standings.filter((s) => s.award > 0 && s.award === Math.max(...stage.standings.map((x) => x.award)))
    : stage.standings.filter((s) => s.position === 1 && s.points > 0)
  const awarded = stage.standings.filter((s) => s.award !== 0)
  return (
    <div className="animate-enter">
      <p className="text-2xl text-quiet">
        {stage.title} · sonuçlar
      </p>
      {winners.length > 0 ? (
        <>
          <p className="mt-2 text-xl font-semibold text-quiet">Kazanan</p>
          <h1 className="text-6xl font-extrabold tracking-tight lg:text-8xl">{winners.map((w) => w.name).join(' · ')}</h1>
        </>
      ) : (
        <h1 className="text-6xl font-extrabold tracking-tight lg:text-8xl">Kimse puan almadı</h1>
      )}
      <ul className="mt-8 max-w-2xl divide-y divide-line border-y border-line text-3xl">
        {awarded.map((s, i) => (
          <li key={s.playerId}>
            <Stagger index={i} step={140}>
              <div className="flex items-baseline justify-between gap-4 py-3">
                <span>
                  {s.name}
                  {!stage.manual && (
                    <span className="ml-3 text-xl text-quiet">
                      {s.position}. · {s.points} {stage.scoreLabel}
                    </span>
                  )}
                </span>
                <span className={`font-extrabold ${s.award > 0 ? 'text-ok' : 'text-bad'}`}>{s.award > 0 ? `+${s.award}` : s.award}</span>
              </div>
            </Stagger>
          </li>
        ))}
      </ul>
      <Reveal votes={stage.reveal} />
    </div>
  )
}

function Reveal({ votes }: { votes: { from: string; to: string }[] }) {
  if (votes.length === 0) return null
  return (
    <ul className="mt-8 grid max-w-3xl grid-cols-2 gap-x-10 gap-y-2 text-xl">
      {votes.map((v, i) => (
        <li key={i}>
          <Stagger index={i} step={100}>
            <p>
              <span className="font-bold">{v.from}</span> <span className="text-quiet">→</span> <span className="font-bold">{v.to}</span>
            </p>
          </Stagger>
        </li>
      ))}
    </ul>
  )
}
