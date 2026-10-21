'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { AlertRow, SEVERITY_BAR } from '@/components/alerts'
import { ConnectionBar, Countdown, MarkerFlash } from '@/components/live'
import { Dot } from '@/components/ui'
import type { Alert, HostView } from '@/lib/types'
import { useAlertFeed } from '@/lib/use-alert-feed'
import { useRoom } from '@/lib/use-room'
import { LinesTab } from './lines-tab'
import { RecordsTab } from './records-tab'
import { ScoreTab } from './score-tab'
import { SetupTab } from './setup-tab'
import type { Send } from './shared'
import { StageTab } from './stage-tab'

type Tab = 'etap' | 'kurulum' | 'hat' | 'puan' | 'kayit'

const TABS: [Tab, string][] = [
  ['etap', 'Etap'],
  ['kurulum', 'Kurulum'],
  ['hat', 'Hat durumu'],
  ['puan', 'Puan'],
  ['kayit', 'Kayıt'],
]

const TOAST_MS = 7000

export function HostConsole({ code, token }: { code: string; token: string }) {
  const { view, status, rejection, send, now } = useRoom<HostView>({ code, role: 'host', token, label: 'Yönetim' })
  const [error, setError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Alert[]>([])
  const [tab, setTab] = useState<Tab | null>(null)
  const initial = useRef(false)

  useEffect(() => {
    if (!view || initial.current) return
    initial.current = true
    setTab(view.status === 'setup' ? 'kurulum' : 'etap')
  }, [view])

  useAlertFeed(view?.alerts.active, (alert) => {
    if (alert.severity === 'info') return
    setToasts((list) => [alert, ...list.filter((t) => t.id !== alert.id)].slice(0, 3))
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== alert.id)), TOAST_MS)
  })

  const run: Send = async (command) => {
    setError(null)
    const ack = await send(command)
    if (!ack.ok) setError(ack.message)
    return ack
  }

  if (rejection?.code === 'not_found' || rejection?.code === 'forbidden') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5">
        <p className="text-lg font-bold">{rejection.message}</p>
        <Link href="/" className="mt-4 text-sm font-semibold underline underline-offset-4">
          Ana sayfa
        </Link>
      </main>
    )
  }

  const current = tab ?? 'etap'

  return (
    <div className="min-h-dvh">
      <ConnectionBar status={status} message={rejection?.message} />
      <MarkerFlash marker={view?.markers[0] ?? null} now={now} />
      {toasts.length > 0 && view && (
        <div className="fixed right-4 top-4 z-40 w-[min(360px,calc(100vw-2rem))] space-y-2">
          {toasts.map((t) => (
            <div key={t.id} className="overflow-hidden rounded-md border border-line-strong bg-paper shadow-lg">
              <AlertRow
                alert={view.alerts.active.find((a) => a.id === t.id) ?? t}
                now={now}
                compact
                onAck={(id) => {
                  void run({ type: 'alert.ack', alertId: id })
                  setToasts((list) => list.filter((x) => x.id !== id))
                }}
              />
            </div>
          ))}
        </div>
      )}
      {!view ? (
        <p className="p-6 text-quiet">Yükleniyor…</p>
      ) : (
        <>
          <TopBar view={view} send={run} now={now} />
          <nav className="sticky top-[65px] z-10 border-b border-line bg-paper/95 backdrop-blur">
            <div className="mx-auto flex max-w-[1240px] gap-1 overflow-x-auto px-3 lg:px-8">
              {TABS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`relative h-12 shrink-0 px-3 text-sm font-bold transition-colors ${current === key ? 'text-ink' : 'text-quiet hover:text-ink'}`}
                >
                  {label}
                  {current === key && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-ink" />}
                </button>
              ))}
            </div>
          </nav>
          <main className="mx-auto max-w-[1240px] px-5 py-6 lg:px-10">
            {error && (
              <p role="alert" className="animate-enter mb-4 border-l-2 border-bad pl-3 text-sm text-bad">
                {error}
              </p>
            )}
            <div key={current} className="animate-enter">
              {current === 'etap' && <StageTab view={view} send={run} now={now} goSetup={() => setTab('kurulum')} />}
              {current === 'kurulum' && <SetupTab view={view} send={run} token={token} />}
              {current === 'hat' && <LinesTab view={view} send={run} now={now} token={token} />}
              {current === 'puan' && <ScoreTab view={view} />}
              {current === 'kayit' && <RecordsTab view={view} send={run} now={now} token={token} />}
            </div>
          </main>
        </>
      )}
    </div>
  )
}

const STATUS_LABEL = { setup: 'Kurulum', live: 'Oyunda', finished: 'Bitti' } as const
const PHASE_LABEL = { intro: 'Kurallar', active: 'Süre işliyor', review: 'Sonuç', done: 'Tamamlandı' } as const

function TopBar({ view, send, now }: { view: HostView; send: Send; now: () => number }) {
  const unseen = view.alerts.active.filter((a) => a.acknowledgedAt === null)
  const worst = unseen.find((a) => a.severity === 'critical') ?? unseen.find((a) => a.severity === 'warning') ?? unseen[0]
  const stage = view.stage
  const open = stage && stage.phase !== 'done'
  return (
    <header className="sticky top-0 z-20 h-[65px] border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-full max-w-[1240px] items-center justify-between gap-4 px-5 lg:px-10">
        <div className="flex min-w-0 items-center gap-6">
          <div>
            <p className="text-[12px] text-quiet">Yalan Hattı</p>
            <p className="text-xl font-extrabold leading-none tracking-[0.12em]">{view.code}</p>
          </div>
          <div className="hidden min-w-0 sm:block">
            <p className="text-[12px] text-quiet">{STATUS_LABEL[view.status]}</p>
            <p className="truncate text-sm font-bold">
              {open ? `Etap ${stage.number}/${view.totalStages} · ${stage.title} · ${PHASE_LABEL[stage.phase]}` : view.status === 'live' ? 'Etap seçilecek' : '—'}
            </p>
          </div>
          {open && stage.phase === 'active' && stage.endsAt && (
            <Countdown endsAt={stage.endsAt} pausedAt={stage.pausedAt} now={now} className="text-2xl font-extrabold" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {view.status === 'live' && (
            <button
              type="button"
              onClick={() => void send({ type: 'lines.set', open: !view.linesOpen })}
              className="hidden h-10 items-center gap-2 rounded-md border border-line px-3 text-[13px] font-bold hover:bg-soft md:inline-flex"
              title={view.linesOpen ? 'Hatları kapat' : 'Hatları aç'}
            >
              <Dot tone={view.linesOpen ? 'ok' : 'down'} />
              {view.linesOpen ? 'Hatlar açık' : 'Hatlar kapalı'}
            </button>
          )}
          <Link
            href={`/oda/${view.code}/uyarilar`}
            target="_blank"
            className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-[13px] font-bold ${worst ? 'border-line-strong' : 'border-line text-quiet hover:text-ink'}`}
          >
            {worst ? <span className={`size-2 rounded-full ${SEVERITY_BAR[worst.severity]} animate-live`} /> : <Dot tone="ok" />}
            {unseen.length > 0 ? `${unseen.length} uyarı` : 'Uyarı yok'}
          </Link>
          <Link
            href={`/oda/${view.code}/hat`}
            target="_blank"
            className="hidden h-10 items-center rounded-md border border-line-strong px-3 text-[13px] font-bold hover:bg-soft lg:inline-flex"
          >
            Hat ekranı
          </Link>
        </div>
      </div>
    </header>
  )
}
