'use client'

import { buzz } from '@/lib/haptics'
import { useEffect, useRef, useState } from 'react'
import { clock, timeOfDay } from '@/lib/format'
import type { Marker } from '@/lib/types'
import type { ConnectionStatus } from '@/lib/use-room'

export function useTicker(intervalMs = 500): void {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
}

export function Countdown({
  endsAt,
  pausedAt = null,
  now,
  className = '',
}: {
  endsAt: number
  pausedAt?: number | null
  now: () => number
  className?: string
}) {
  useTicker(250)
  const left = endsAt - (pausedAt ?? now())
  const seconds = Math.max(0, Math.ceil(left / 1000))
  const urgent = !pausedAt && left < 10_000 && left > 0
  return (
    <span
      key={urgent ? seconds : 'steady'}
      className={`inline-block tabular-nums transition-colors ${pausedAt ? 'text-quiet' : left < 15_000 ? 'text-live' : ''} ${urgent ? 'animate-tick' : ''} ${className}`}
    >
      {clock(left)}
    </span>
  )
}

export function ProgressBar({ startedAt, endsAt, pausedAt = null, now }: { startedAt: number; endsAt: number; pausedAt?: number | null; now: () => number }) {
  useTicker(250)
  const total = Math.max(1, endsAt - startedAt)
  const left = Math.min(1, Math.max(0, (endsAt - (pausedAt ?? now())) / total))
  return (
    <div className="h-0.5 w-full overflow-hidden bg-line" aria-hidden>
      <div
        className={`h-full origin-left transition-transform duration-300 ease-linear ${left < 0.15 && !pausedAt ? 'bg-live' : 'bg-ink'}`}
        style={{ transform: `scaleX(${left})` }}
      />
    </div>
  )
}

export function ConnectionBar({ status, message }: { status: ConnectionStatus; message?: string | undefined }) {
  if (status === 'online') return null
  const text = status === 'rejected' ? (message ?? 'Bağlantı reddedildi.') : status === 'connecting' ? 'Bağlanıyor…' : 'Bağlantı koptu, yeniden bağlanıyor.'
  return (
    <div role="status" className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-ink px-4 py-2 text-[13px] font-semibold text-paper">
      <span className={`size-2 rounded-full ${status === 'rejected' ? 'bg-bad' : 'bg-warn animate-live'}`} />
      {text}
    </div>
  )
}

export function MarkerFlash({ marker, now }: { marker: Marker | null; now: () => number }) {
  const [shown, setShown] = useState<Marker | null>(null)
  const seen = useRef<string | null>(null)

  useEffect(() => {
    if (!marker || marker.id === seen.current) return
    const first = seen.current === null
    seen.current = marker.id
    if (first && now() - marker.at > 4000) return
    setShown(marker)
    buzz(200)
    const id = setTimeout(() => setShown(null), 3000)
    return () => clearTimeout(id)
  }, [marker, now])

  if (!shown) return null
  return (
    <div className="animate-flash pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-white text-black">
      <p className="px-6 text-center text-5xl font-extrabold sm:text-7xl">{shown.label}</p>
      <p className="text-3xl font-semibold tabular-nums">{timeOfDay(shown.at)}</p>
    </div>
  )
}

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen')
        if (cancelled) await sentinel.release()
      } catch {}
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }
    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release().catch(() => {})
    }
  }, [active])
}

export function CellDisplay({ value }: { value: string }) {
  return (
    <div className="flex h-16 items-center justify-center gap-3 rounded-md border border-line-strong text-4xl font-extrabold tabular-nums">
      {[0, 1, 2].map((i) => (
        <span key={i} className={`w-7 text-center ${value[i] ? '' : 'text-line-strong'}`}>
          {value[i] ?? '–'}
        </span>
      ))}
    </div>
  )
}

export function Keypad({
  value,
  onChange,
  onEnter,
  length = 3,
}: {
  value: string
  onChange: (next: string) => void
  onEnter?: () => void
  length?: number
}) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back']
  const press = (k: string) => {
    if (k === 'back') onChange(value.slice(0, -1))
    else if (k === 'clear') onChange('')
    else if (value.length < length) onChange(value + k)
  }

  const latest = useRef({ press, onEnter, value, length })
  latest.current = { press, onEnter, value, length }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return
      const { press: p, onEnter: enter, value: v, length: max } = latest.current
      if (/^\d$/.test(e.key)) p(e.key)
      else if (e.key === 'Backspace') p('back')
      else if (e.key === 'Escape') p('clear')
      else if (e.key === 'Enter' && v.length === max && enter) enter()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          aria-label={k === 'back' ? 'Sil' : k === 'clear' ? 'Temizle' : k}
          onClick={() => press(k)}
          className="h-14 bg-paper text-2xl font-semibold transition-colors active:bg-soft"
        >
          {k === 'back' ? <span className="text-base text-quiet">Sil</span> : k === 'clear' ? <span className="text-base text-quiet">Temizle</span> : k}
        </button>
      ))}
    </div>
  )
}
