'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LineBoard } from '@/components/line-board'
import { ConnectionBar, Countdown, MarkerFlash, useWakeLock } from '@/components/live'
import { Dot, statusText } from '@/components/ui'
import { clock, normalizeCode, timeOfDay } from '@/lib/format'
import { hostToken } from '@/lib/storage'
import type { HostView } from '@/lib/types'
import { useRoom } from '@/lib/use-room'
import { CALL_STATUS } from '../yonetim/lines-tab'

export default function LineMonitorPage() {
  const params = useParams<{ code: string }>()
  const code = normalizeCode(params.code)
  const [token, setToken] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('anahtar')
    if (fromHash) {
      hostToken.set(code, fromHash)
      history.replaceState(null, '', window.location.pathname)
    }
    setToken(hostToken.get(code))
  }, [code])

  if (token === undefined) return null
  if (!token) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5">
        <p className="text-lg font-bold">Bu cihaz {code} odasının hat ekranını açamıyor.</p>
        <p className="mt-2 text-quiet">Yönetim panelinden “Hat ekranı bağlantısı”nı kopyalayıp burada aç.</p>
      </main>
    )
  }
  return <Monitor code={code} token={token} />
}

function Monitor({ code, token }: { code: string; token: string }) {
  const { view, status, rejection, now } = useRoom<HostView>({ code, role: 'host', token, label: 'Hat ekranı' })
  useWakeLock(true)

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

  const stage = view?.stage
  const open = stage && stage.phase !== 'done'
  const talking = view ? view.lines.filter((l) => l.status === 'talking').length / 2 : 0
  const recent = view?.calls.slice(0, 8) ?? []

  return (
    <div className="min-h-dvh">
      <ConnectionBar status={status} message={rejection?.message} />
      <MarkerFlash marker={view?.markers[0] ?? null} now={now} />
      {view && (
        <main className="px-6 py-6 lg:px-10">
          <header className="grid gap-6 border-b border-line pb-6 md:grid-cols-[1fr_auto]">
            <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
              <Field label="Mevcut durum" value={statusText({ status: view.status, stage: stage ?? null })} />
              <Field label={open ? 'Şu anki oyun' : 'Son oyun'} value={stage ? stage.title : '—'} />
              <Field
                label="Hat durumu"
                value={
                  <span className="inline-flex items-center gap-2">
                    <Dot tone={view.linesOpen ? 'ok' : 'down'} />
                    {view.linesOpen ? `Açık · ${talking} görüşme` : 'Kapalı'}
                  </span>
                }
              />
              <Field label="Oda" value={view.code} />
            </div>
            {open && stage.phase === 'active' && stage.endsAt && (
              <Countdown endsAt={stage.endsAt} pausedAt={stage.pausedAt} now={now} className="text-7xl font-extrabold leading-none tracking-tight" />
            )}
          </header>
          <div className="mt-6">
            <LineBoard lines={view.lines} now={now} size="lg" />
          </div>
          {recent.length > 0 && (
            <section className="mt-8">
              <h2 className="border-b border-line pb-2 text-sm font-bold">Son aramalar</h2>
              <ul className="divide-y divide-line">
                {recent.map((c) => (
                  <li key={c.id} className="animate-enter grid grid-cols-[80px_1fr_auto] gap-4 py-2 text-base">
                    <span className="text-quiet">{timeOfDay(c.startedAt)}</span>
                    <span>
                      <span className="font-bold">{c.caller}</span> → <span className="font-bold">{c.callee ?? c.dialed}</span>
                    </span>
                    <span className={c.status === 'active' ? 'font-bold text-ok' : 'text-quiet'}>
                      {CALL_STATUS[c.status]}
                      {c.answeredAt ? ` · ${clock(c.status === 'active' ? now() - c.answeredAt : c.durationMs)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-quiet">{label}</p>
      <p className="mt-1 text-xl font-extrabold">{value}</p>
    </div>
  )
}
