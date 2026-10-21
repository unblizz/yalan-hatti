'use client'

import { useTicker } from '@/components/live'
import { clock } from '@/lib/format'
import type { LineRow } from '@/lib/types'

const STATUS_TEXT: Record<LineRow['status'], string> = {
  idle: 'BOŞTA',
  dialing: 'ARIYOR',
  ringing: 'ÇALIYOR',
  talking: 'GÖRÜŞMEDE',
}

export function LineBoard({ lines, now, size = 'md' }: { lines: LineRow[]; now: () => number; size?: 'md' | 'lg' }) {
  useTicker(500)
  const big = size === 'lg'
  return (
    <ul className={`grid gap-3 ${big ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 xl:grid-cols-4'}`}>
      {lines.map((l) => {
        const offline = !l.online
        const tone = l.eliminated
          ? 'border-line text-quiet'
          : offline
            ? 'border-bad/60'
            : l.status === 'talking'
              ? 'border-ink'
              : l.status === 'idle'
                ? 'border-line'
                : 'border-live/70'
        const label = l.eliminated ? 'OYUN DIŞI' : offline ? (l.claimed ? 'BAĞLI DEĞİL' : 'CİHAZ YOK') : STATUS_TEXT[l.status]
        const labelTone = l.eliminated
          ? 'text-quiet'
          : offline
            ? 'text-bad'
            : l.status === 'idle'
              ? 'text-ok'
              : l.status === 'talking'
                ? 'text-ink'
                : 'text-live'
        return (
          <li
            key={l.playerId}
            className={`relative overflow-hidden rounded-xl border-2 transition-colors duration-300 ${tone} ${big ? 'p-5' : 'p-4'} ${
              l.status === 'ringing' && !offline ? 'animate-attention' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className={`font-extrabold leading-none tracking-tight ${big ? 'text-6xl' : 'text-4xl'}`}>{l.room}</p>
              <p className={`text-right font-bold tracking-[0.12em] text-quiet ${big ? 'text-lg' : 'text-sm'}`}>{l.line}</p>
            </div>
            <p className={`mt-2 truncate font-bold ${big ? 'text-2xl' : 'text-lg'}`}>{l.name}</p>
            <div className={`mt-3 flex items-center justify-between gap-2 ${big ? 'text-base' : 'text-sm'}`}>
              <span className={`inline-flex items-center gap-2 font-extrabold tracking-wide ${labelTone}`}>
                {l.status !== 'idle' && !offline && !l.eliminated && <span className="size-2 rounded-full bg-current animate-live" />}
                {label}
              </span>
              {l.since !== null && !offline && <span className="tabular-nums text-quiet">{clock(now() - l.since + 999)}</span>}
            </div>
            {l.withName && !offline && (
              <p className={`mt-1 truncate text-quiet ${big ? 'text-base' : 'text-sm'}`}>
                {l.status === 'ringing' ? '← ' : '→ '}
                {l.withName} · oda {l.withRoom}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
