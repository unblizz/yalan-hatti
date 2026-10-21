'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function AnimatedNumber({ value, className = '' }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value)
  const [pulse, setPulse] = useState(0)
  const from = useRef(value)

  useEffect(() => {
    if (from.current === value) return
    const start = from.current
    from.current = value
    setPulse((p) => p + 1)
    if (prefersReducedMotion()) return setShown(value)
    const began = performance.now()
    let frame = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - began) / 600)
      const eased = 1 - Math.pow(1 - k, 3)
      setShown(Math.round(start + (value - start) * eased))
      if (k < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return (
    <span key={pulse} className={`inline-block tabular-nums ${pulse > 0 ? 'animate-pop' : ''} ${className}`}>
      {shown}
    </span>
  )
}

export function FlipList<T extends { id: string }>({
  items,
  render,
  className = '',
  itemClassName = '',
}: {
  items: T[]
  render: (item: T, index: number) => ReactNode
  className?: string
  itemClassName?: string
}) {
  const refs = useRef(new Map<string, HTMLLIElement>())
  const last = useRef(new Map<string, number>())

  useLayoutEffect(() => {
    const next = new Map<string, number>()
    refs.current.forEach((el, id) => next.set(id, el.getBoundingClientRect().top))
    if (!prefersReducedMotion()) {
      next.forEach((top, id) => {
        const before = last.current.get(id)
        const el = refs.current.get(id)
        if (before === undefined || !el || before === top) return
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'translateY(0)' }], {
          duration: 520,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        })
      })
    }
    last.current = next
  })

  return (
    <ol className={className}>
      {items.map((item, i) => (
        <li
          key={item.id}
          className={itemClassName}
          ref={(el) => {
            if (el) refs.current.set(item.id, el)
            else refs.current.delete(item.id)
          }}
        >
          {render(item, i)}
        </li>
      ))}
    </ol>
  )
}

export function Stagger({ children, index, step = 60 }: { children: ReactNode; index: number; step?: number }) {
  return (
    <div className="animate-enter" style={{ animationDelay: `${index * step}ms` }}>
      {children}
    </div>
  )
}
