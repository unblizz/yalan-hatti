'use client'

import { useTicker } from '@/components/live'
import { Button } from '@/components/ui'
import { SEVERITY_LABEL } from '@/lib/alert-signal'
import { duration, timeOfDay } from '@/lib/format'
import type { Alert, Severity } from '@/lib/types'

export const SEVERITY_BAR: Record<Severity, string> = { critical: 'bg-bad', warning: 'bg-warn', info: 'bg-quiet' }
const SEVERITY_TEXT: Record<Severity, string> = { critical: 'text-bad', warning: 'text-warn', info: 'text-quiet' }

export function AlertRow({ alert, now, onAck, compact = false }: { alert: Alert; now: () => number; onAck?: (id: string) => void; compact?: boolean }) {
  useTicker(1000)
  const unseen = alert.acknowledgedAt === null
  return (
    <div
      className={`animate-enter-down relative flex items-center gap-4 overflow-hidden ${compact ? 'py-3 pl-4 pr-3' : 'py-4 pl-5 pr-4'} ${
        unseen && alert.severity === 'critical' ? 'animate-attention' : ''
      } ${unseen ? '' : 'opacity-60'}`}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${SEVERITY_BAR[alert.severity]}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-[13px] font-semibold ${SEVERITY_TEXT[alert.severity]}`}>
          {SEVERITY_LABEL[alert.severity]}
          <span className="font-normal text-quiet"> · {duration(now() - alert.raisedAt)}</span>
        </p>
        <p className={`${compact ? 'text-[15px]' : 'text-lg'} font-bold leading-snug`}>{alert.title}</p>
        <p className="text-sm text-quiet">{alert.detail}</p>
      </div>
      {onAck &&
        (unseen ? (
          <Button onClick={() => onAck(alert.id)}>Gördüm</Button>
        ) : (
          <span className="text-[13px] text-quiet">Görüldü {timeOfDay(alert.acknowledgedAt!)}</span>
        ))}
    </div>
  )
}

export function AlertHistoryRow({ alert }: { alert: Alert }) {
  return (
    <div className="flex items-center gap-3 py-2.5 text-sm">
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${SEVERITY_BAR[alert.severity]}`} />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{alert.title}</span> <span className="text-quiet">{alert.detail}</span>
      </span>
      <span className="shrink-0 text-quiet">
        {timeOfDay(alert.raisedAt)} · {duration((alert.resolvedAt ?? alert.raisedAt) - alert.raisedAt)}
      </span>
    </div>
  )
}
