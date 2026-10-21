'use client'

import { LineBoard } from '@/components/line-board'
import { Button, Dot, Section } from '@/components/ui'
import { clock, timeOfDay } from '@/lib/format'
import { serverUrl } from '@/lib/server-url'
import type { CallRow, HostView } from '@/lib/types'
import type { Send } from './shared'

export const CALL_STATUS: Record<CallRow['status'], string> = {
  ringing: 'çalıyor',
  active: 'görüşmede',
  ended: 'bitti',
  missed: 'cevapsız',
  declined: 'reddedildi',
  busy: 'meşgul',
  unreachable: 'kullanılmayan no',
}

export function LinesTab({ view, send, now, token }: { view: HostView; send: Send; now: () => number; token: string }) {
  const talking = view.lines.filter((l) => l.status === 'talking').length / 2
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-sm font-semibold">
          <Dot tone={view.linesOpen ? 'ok' : 'down'} />
          {view.linesOpen ? 'Hatlar açık' : 'Hatlar kapalı'} · {talking} görüşme
        </p>
        {view.status === 'live' && (
          <Button onClick={() => void send({ type: 'lines.set', open: !view.linesOpen })}>{view.linesOpen ? 'Hatları kapat' : 'Hatları aç'}</Button>
        )}
      </div>
      <LineBoard lines={view.lines} now={now} />
      <CallLog view={view} token={token} now={now} />
    </div>
  )
}

export function CallLog({ view, token, now }: { view: HostView; token: string; now: () => number }) {
  if (view.calls.length === 0) return null
  return (
    <Section framed title="Görüşmeler" meta={`${view.calls.length} kayıt`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-quiet">
              <th className="py-2 font-semibold">Saat</th>
              <th className="font-semibold">Arayan</th>
              <th className="font-semibold">Aranan</th>
              <th className="font-semibold">Durum</th>
              <th className="text-right font-semibold">Süre</th>
              <th className="pl-4 font-semibold">Kayıt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {view.calls.map((c) => (
              <tr key={c.id} className={c.status === 'active' ? 'font-semibold' : ''}>
                <td className="py-2 text-quiet">{timeOfDay(c.startedAt)}</td>
                <td>
                  {c.caller} <span className="text-quiet">{c.callerLine}</span>
                </td>
                <td>
                  {c.callee ?? '—'} <span className="text-quiet">{c.dialed}</span>
                </td>
                <td className={c.status === 'active' ? 'text-ok' : c.status === 'busy' || c.status === 'missed' ? 'text-warn' : ''}>{CALL_STATUS[c.status]}</td>
                <td className="text-right tabular-nums">{c.answeredAt ? clock(c.status === 'active' ? now() - c.answeredAt : c.durationMs) : '—'}</td>
                <td className="pl-4">
                  {c.recording ? (
                    <audio
                      controls
                      preload="none"
                      className="h-8 w-48"
                      src={`${serverUrl()}/rooms/${view.code}/calls/${c.id}/recording?key=${encodeURIComponent(token)}`}
                    />
                  ) : (
                    <span className="text-quiet">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}
