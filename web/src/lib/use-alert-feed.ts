'use client'

import { useEffect, useRef } from 'react'
import type { Alert } from './types'

export function useAlertFeed(active: Alert[] | undefined, onRaised: (alert: Alert) => void): void {
  const known = useRef<Map<string, string> | null>(null)
  const handler = useRef(onRaised)
  handler.current = onRaised

  useEffect(() => {
    if (!active) return
    const next = new Map(active.map((a) => [a.id, `${a.severity}:${a.acknowledgedAt ?? ''}`]))
    const previous = known.current
    known.current = next
    if (!previous) return
    for (const alert of active) {
      if (alert.acknowledgedAt !== null) continue
      const before = previous.get(alert.id)
      if (before === undefined || (before.startsWith('warning') && alert.severity === 'critical')) handler.current(alert)
    }
  }, [active])
}
