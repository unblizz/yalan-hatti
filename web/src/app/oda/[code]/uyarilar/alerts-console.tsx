'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AlertHistoryRow, AlertRow } from '@/components/alerts'
import { ConnectionBar, Countdown, useWakeLock } from '@/components/live'
import { Button, Dot, StatusLabel } from '@/components/ui'
import { chime, notificationsSupported, notify, unlockSound, vibrate } from '@/lib/alert-signal'
import { timeOfDay } from '@/lib/format'
import { soundPreference } from '@/lib/storage'
import type { HostView } from '@/lib/types'
import { useAlertFeed } from '@/lib/use-alert-feed'
import { useRoom } from '@/lib/use-room'

type Permission = 'unsupported' | NotificationPermission

export function AlertsConsole({ code, token }: { code: string; token: string }) {
  const { view, status, rejection, send, now } = useRoom<HostView>({ code, role: 'host', token, label: 'Uyarılar' })
  const [sound, setSound] = useState(false)
  const [soundReady, setSoundReady] = useState(false)
  const [permission, setPermission] = useState<Permission>('unsupported')
  useWakeLock(true)

  useEffect(() => {
    setSound(soundPreference.get())
    setPermission(notificationsSupported() ? Notification.permission : 'unsupported')
  }, [])

  useEffect(() => {
    if (!sound || soundReady) return
    const unlock = () => setSoundReady(unlockSound())
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [sound, soundReady])

  useAlertFeed(view?.alerts.active, (alert) => {
    if (sound) chime(alert.severity)
    vibrate(alert.severity)
    if (document.visibilityState !== 'visible' || alert.severity === 'critical') notify(alert, code)
  })

  const toggleSound = () => {
    const next = !sound
    setSound(next)
    soundPreference.set(next)
    if (next) {
      const ready = unlockSound()
      setSoundReady(ready)
      if (ready) chime('info')
    }
  }

  const askPermission = async () => {
    if (!notificationsSupported()) return
    setPermission(await Notification.requestPermission())
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

  const active = view?.alerts.active ?? []
  const counts = {
    critical: active.filter((a) => a.severity === 'critical').length,
    warning: active.filter((a) => a.severity === 'warning').length,
    info: active.filter((a) => a.severity === 'info').length,
  }
  const unseen = active.filter((a) => a.acknowledgedAt === null).length
  const players = view?.players.filter((p) => !p.eliminated) ?? []
  const online = players.filter((p) => p.online).length

  return (
    <div className="min-h-dvh">
      <ConnectionBar status={status} message={rejection?.message} />
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-10">
          <div className="flex items-center gap-5">
            <div>
              <p className="text-sm text-quiet">Uyarılar</p>
              <p className="text-3xl font-extrabold tracking-[0.12em]">{code}</p>
            </div>
            {view && <StatusLabel status={view.status} stage={view.stage} />}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={sound ? 'primary' : 'outline'} onClick={toggleSound} aria-pressed={sound}>
              {sound ? 'Ses açık' : 'Ses kapalı'}
            </Button>
            {permission === 'default' && <Button onClick={askPermission}>Bildirimlere izin ver</Button>}
            {permission === 'granted' && <span className="px-2 text-[13px] text-quiet">Bildirim açık</span>}
            {permission === 'denied' && <span className="px-2 text-[13px] text-quiet">Bildirim engelli</span>}
            <Link href={`/oda/${code}/yonetim`} className="inline-flex h-10 items-center rounded-md px-3 text-[13px] font-bold text-quiet hover:bg-soft hover:text-ink">
              Yönetim
            </Link>
          </div>
        </div>
      </header>

      {sound && !soundReady && (
        <p className="border-b border-line bg-soft px-5 py-2 text-center text-[13px]">Sesin çalması için ekrana bir kez dokun.</p>
      )}

      {view && (
        <main className="mx-auto max-w-5xl px-5 py-6 lg:px-10">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
            <Stat label="Kritik" value={counts.critical} tone={counts.critical ? 'text-bad' : ''} />
            <Stat label="Uyarı" value={counts.warning} tone={counts.warning ? 'text-warn' : ''} />
            <Stat label="Bağlı oyuncu" value={`${online}/${players.length}`} tone={online < players.length ? 'text-bad' : ''} />
            <div className="bg-paper px-4 py-3">
              <p className="text-[13px] text-quiet">{view.stage && view.stage.phase === 'active' ? `Etap ${view.stage.number}` : 'Etap'}</p>
              <p className="text-2xl font-extrabold">
                {view.stage?.phase === 'active' && view.stage.endsAt ? <Countdown endsAt={view.stage.endsAt} pausedAt={view.stage.pausedAt} now={now} /> : '—'}
              </p>
            </div>
          </div>

          <section className="mt-8">
            <header className="flex min-h-10 items-center justify-between border-b border-line pb-2">
              <h2 className="text-sm font-bold">Şu an</h2>
              {unseen > 1 && (
                <Button variant="ghost" onClick={() => void send({ type: 'alert.ackAll' })}>
                  Hepsini gördüm
                </Button>
              )}
            </header>
            {active.length === 0 ? (
              <div className="animate-enter flex items-center gap-3 py-10">
                <Dot tone="ok" />
                <div>
                  <p className="text-2xl font-extrabold">Sorun yok</p>
                  <p className="text-sm text-quiet">Bütün cihazlar bağlı. Son kontrol {timeOfDay(now())}</p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {active.map((alert) => (
                  <li key={alert.id}>
                    <AlertRow alert={alert} now={now} onAck={(id) => void send({ type: 'alert.ack', alertId: id })} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {view.alerts.history.length > 0 && (
            <section className="mt-10">
              <h2 className="border-b border-line pb-2 text-sm font-bold">Geçmiş</h2>
              <ul className="divide-y divide-line">
                {view.alerts.history.slice(0, 30).map((alert) => (
                  <li key={alert.id}>
                    <AlertHistoryRow alert={alert} />
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

function Stat({ label, value, tone = '' }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="bg-paper px-4 py-3">
      <p className="text-[13px] text-quiet">{label}</p>
      <p className={`text-2xl font-extrabold tabular-nums ${tone}`}>{value}</p>
    </div>
  )
}
