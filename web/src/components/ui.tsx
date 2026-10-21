import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

type Variant = 'primary' | 'outline' | 'ghost' | 'danger'
type Size = 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-paper hover:opacity-90',
  outline: 'border border-line-strong hover:bg-soft',
  ghost: 'text-quiet hover:bg-soft hover:text-ink',
  danger: 'border border-bad/35 text-bad hover:bg-bad/10',
}

const SIZES: Record<Size, string> = {
  md: 'h-10 px-4 text-[13px]',
  lg: 'h-12 px-5 text-[15px]',
}

export function Button({
  variant = 'outline',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-bold transition-[background-color,opacity,transform] duration-150 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  )
}

export const fieldClass =
  'h-12 w-full rounded-md border border-line-strong bg-paper px-3.5 text-[15px] outline-none transition-colors focus:border-ink'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClass} ${props.className ?? ''}`} />
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldClass} appearance-none bg-[length:12px] pr-9 ${className}`} style={{ backgroundImage: CHEVRON, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }} />
}

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' fill='none' stroke='%23888' stroke-width='1.6'%3E%3Cpath d='M1 1.5l5 5 5-5'/%3E%3C/svg%3E\")"

export function Section({
  title,
  meta,
  children,
  framed = false,
  className = '',
}: {
  title?: ReactNode
  meta?: ReactNode
  children: ReactNode
  framed?: boolean
  className?: string
}) {
  return (
    <section className={`${framed ? 'rounded-xl border border-line' : ''} ${className}`}>
      {title && (
        <header className={`flex min-h-12 items-center justify-between gap-3 ${framed ? 'border-b border-line px-4' : 'border-b border-line'}`}>
          <h2 className="text-sm font-bold">{title}</h2>
          {meta && <div className="text-sm text-quiet">{meta}</div>}
        </header>
      )}
      <div className={framed ? 'p-4' : 'pt-4'}>{children}</div>
    </section>
  )
}

export function Dot({ tone }: { tone: 'ok' | 'warn' | 'down' | 'live' }) {
  const color = { ok: 'bg-ok', warn: 'bg-warn', down: 'bg-bad', live: 'bg-live animate-live' }[tone]
  return <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${color}`} />
}

type StatusInput = { status: 'setup' | 'live' | 'finished'; stage: { number: number; phase: 'intro' | 'active' | 'review' | 'done' } | null }

export function statusText({ status, stage }: StatusInput): string {
  if (status === 'setup') return 'Kurulum'
  if (status === 'finished') return 'Oyun bitti'
  if (!stage || stage.phase === 'done') return 'Etap arası'
  return { intro: `Etap ${stage.number} · kurallar`, active: `Etap ${stage.number} sürüyor`, review: `Etap ${stage.number} · sonuç` }[stage.phase]
}

export function StatusLabel(input: StatusInput) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold">
      {input.status === 'live' && input.stage?.phase === 'active' && <Dot tone="live" />}
      {statusText(input)}
    </span>
  )
}

export function Delta({ value }: { value: number }) {
  return <span className={`font-bold ${value > 0 ? 'text-ok' : value < 0 ? 'text-bad' : 'text-quiet'}`}>{value > 0 ? `+${value}` : value}</span>
}
