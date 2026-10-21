'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useTicker } from '@/components/live'
import { Button, Dot, Input, Section } from '@/components/ui'
import { ago, deviceHealth, timeOfDay } from '@/lib/format'
import { serverUrl } from '@/lib/server-url'
import type { HostView } from '@/lib/types'
import type { Send } from './shared'

const ROLE_LABEL = { host: 'Yönetim', player: 'Oyuncu', screen: 'Sahne' } as const

export function RecordsTab({ view, send, now, token }: { view: HostView; send: Send; now: () => number; token: string }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="space-y-5">
        <MarkerSection view={view} send={send} />
        <DevicesSection view={view} now={now} />
      </div>
      <EventsSection view={view} token={token} />
    </div>
  )
}

function MarkerSection({ view, send }: { view: HostView; send: Send }) {
  const [label, setLabel] = useState('')
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const ack = await send({ type: 'marker.add', label: label || `Klaket ${view.markers.length + 1}` })
    if (ack.ok) setLabel('')
  }
  return (
    <Section framed title="Klaket" meta="Tüm ekranlarda 3 sn">
      <form onSubmit={add} className="flex gap-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder={`Klaket ${view.markers.length + 1}`} />
        <Button variant="primary" size="lg" type="submit">
          İşaretle
        </Button>
      </form>
      {view.markers.length > 0 && (
        <ul className="mt-3 text-sm">
          {view.markers.slice(0, 6).map((m) => (
            <li key={m.id} className="animate-enter flex justify-between py-1">
              <span>{m.label}</span>
              <span className="text-quiet">{timeOfDay(m.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function DevicesSection({ view, now }: { view: HostView; now: () => number }) {
  useTicker(1000)
  const t = now()
  const devices = view.devices.filter((d) => d.connected || (d.disconnectedAt ?? 0) > t - 30 * 60_000)
  const problems = devices.filter((d) => deviceHealth(d, t).health !== 'ok').length
  return (
    <Section framed title="Cihazlar" meta={problems ? <span className="font-semibold text-warn">{problems} sorunlu</span> : 'Sorun yok'}>
      <ul className="-my-2.5 divide-y divide-line text-sm">
        {devices.map((d) => {
          const { health, reasons } = deviceHealth(d, t)
          return (
            <li key={d.socketId} className="flex items-center gap-3 py-2.5">
              <Dot tone={health} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">
                  {d.label} <span className="font-normal text-quiet">{ROLE_LABEL[d.role]}</span>
                </p>
                <p className="text-[13px] text-quiet">
                  {d.connected ? ago(t - d.lastSeenAt) : `koptu, ${ago(t - (d.disconnectedAt ?? t))}`}
                  {d.sessions > 1 && ` · ${d.sessions}. bağlantı`}
                  {d.connected && reasons.length > 0 && <span className="text-warn"> · {reasons.join(', ')}</span>}
                </p>
              </div>
              <div className="text-right text-[13px] text-quiet">
                <p>{d.rttMs !== null ? `${d.rttMs} ms` : '—'}</p>
                <p>{d.battery ? `%${Math.round(d.battery.level * 100)}${d.battery.charging ? ' şarjda' : ''}` : '—'}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

function EventsSection({ view, token }: { view: HostView; token: string }) {
  const base = `${serverUrl()}/rooms/${view.code}/events?key=${encodeURIComponent(token)}`
  return (
    <Section
      framed
      title="Olay günlüğü"
      meta={
        <span className="flex gap-3 font-bold text-ink">
          <Link href={`/oda/${view.code}/uyarilar`} target="_blank" className="underline-offset-4 hover:underline">
            Uyarılar
          </Link>
          <a href={`${base}&format=csv`} className="underline-offset-4 hover:underline">
            CSV
          </a>
          <a href={base} className="underline-offset-4 hover:underline">
            JSON
          </a>
        </span>
      }
    >
      <ol className="-my-1 max-h-[640px] overflow-y-auto text-[13px]">
        {view.events.map((e) => (
          <li
            key={e.seq}
            className={`flex gap-3 py-1 ${
              e.type === 'marker.added' || e.type === 'alert.raised' || e.type.startsWith('stage.') ? 'font-bold' : e.type.startsWith('device.') ? 'text-quiet' : ''
            }`}
          >
            <span className="shrink-0 text-quiet">{timeOfDay(e.at)}</span>
            <span>{e.text}</span>
          </li>
        ))}
      </ol>
    </Section>
  )
}
