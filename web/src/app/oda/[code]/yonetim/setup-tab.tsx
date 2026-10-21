'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { JoinQr, useLanBase } from '@/components/join-qr'
import { Button, Dot, Input, Section, Select } from '@/components/ui'
import type { HostPlayer, HostView } from '@/lib/types'
import type { Send } from './shared'

export function SetupTab({ view, send, token }: { view: HostView; send: Send; token: string }) {
  const setup = view.status === 'setup'
  const unclaimed = view.players.filter((p) => !p.claimed && !p.eliminated)
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-5">
        <Section framed title={`Oyuncular (${view.players.length})`} meta={setup ? 'Numaralar oyun başlayınca kilitlenir' : 'Oda numaraları kilitli'}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-quiet">
                  <th className="py-2 font-semibold">İsim</th>
                  <th className="w-24 font-semibold">Oda</th>
                  <th className="w-28 font-semibold">Hat</th>
                  <th className="w-16 font-semibold">Ton</th>
                  <th className="font-semibold">Tablet</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {view.players.map((p) => (
                  <PlayerRow key={p.id} player={p} view={view} send={send} />
                ))}
              </tbody>
            </table>
          </div>
          {setup && <AddPlayer send={send} />}
          {setup && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
              <Button
                onClick={() => {
                  if (window.confirm('Bütün oda ve hat numaraları yeniden dağıtılsın mı?')) void send({ type: 'numbers.auto' })
                }}
              >
                Numaraları yeniden dağıt
              </Button>
              <Link href={`/oda/${view.code}/afis`} target="_blank" className="inline-flex h-10 items-center rounded-md border border-line-strong px-4 text-[13px] font-bold hover:bg-soft">
                Hat afişini aç
              </Link>
            </div>
          )}
        </Section>

        {setup && (
          <Section framed title="Oyunu başlat">
            {unclaimed.length > 0 ? (
              <p className="text-sm">
                Tablete bağlanmayan: <span className="font-semibold">{unclaimed.map((p) => p.name).join(', ')}</span>
              </p>
            ) : (
              <p className="text-sm text-ok">Bütün tabletler bağlı.</p>
            )}
            <Button
              variant="primary"
              size="lg"
              className="mt-4"
              onClick={() => {
                if (unclaimed.length > 0 && !window.confirm(`${unclaimed.length} oyuncunun tableti bağlı değil. Yine de başlatılsın mı?`)) return
                void send({ type: 'game.start' })
              }}
            >
              Oyunu başlat
            </Button>
            <p className="mt-2 text-[13px] text-quiet">Başlayınca oda numaraları değişmez. Hat numarası gerekirse değişebilir.</p>
          </Section>
        )}
      </div>

      <div className="space-y-5">
        <SettingsSection view={view} send={send} />
        {view.status !== 'finished' && <LinksSection view={view} token={token} />}
      </div>
    </div>
  )
}

function PlayerRow({ player, view, send }: { player: HostPlayer; view: HostView; send: Send }) {
  const setup = view.status === 'setup'
  return (
    <tr className={player.eliminated ? 'text-quiet' : ''}>
      <td className="py-1.5 pr-3">
        <InlineField value={player.name} disabled={view.status === 'finished'} onCommit={(name) => send({ type: 'player.update', playerId: player.id, name })} className="font-bold" />
      </td>
      <td className="pr-3">
        <InlineField value={player.room} numeric disabled={!setup} onCommit={(room) => send({ type: 'player.update', playerId: player.id, room })} />
      </td>
      <td className="pr-3">
        <InlineField value={player.line} numeric disabled={view.status === 'finished'} onCommit={(line) => send({ type: 'player.update', playerId: player.id, line })} className="tracking-[0.1em]" />
      </td>
      <td className="text-quiet">{view.settings.voiceChanger ? player.voice + 1 : '—'}</td>
      <td>
        <span className="inline-flex items-center gap-2">
          <Dot tone={player.online ? 'ok' : player.claimed ? 'down' : 'warn'} />
          {player.online ? 'bağlı' : player.claimed ? 'koptu' : 'bekleniyor'}
          {player.claimed && (
            <Button
              variant="ghost"
              className="h-8 px-2"
              onClick={() => {
                if (window.confirm(`${player.name} tabletten ayrılsın mı? Başka bir tablet bu ismi seçebilir.`)) void send({ type: 'player.release', playerId: player.id })
              }}
            >
              Ayır
            </Button>
          )}
        </span>
      </td>
      <td className="text-right">
        {setup ? (
          <Button
            variant="ghost"
            className="h-8 px-2"
            aria-label={`${player.name} sil`}
            onClick={() => {
              if (window.confirm(`${player.name} kadrodan çıkarılsın mı?`)) void send({ type: 'player.remove', playerId: player.id })
            }}
          >
            Sil
          </Button>
        ) : (
          !player.eliminated && (
            <Button
              variant="ghost"
              className="h-8 px-2"
              onClick={() => {
                if (window.confirm(`${player.name} oyundan çıkarılsın mı?`)) void send({ type: 'player.eliminate', playerId: player.id })
              }}
            >
              Çıkar
            </Button>
          )
        )}
      </td>
    </tr>
  )
}

function InlineField({
  value,
  onCommit,
  disabled,
  numeric = false,
  className = '',
}: {
  value: string
  onCommit: (next: string) => Promise<{ ok: boolean }>
  disabled?: boolean
  numeric?: boolean
  className?: string
}) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setDraft(value)
  }, [value, focused])
  const commit = async () => {
    setFocused(false)
    const next = draft.trim()
    if (next === value) return
    const ack = await onCommit(next)
    if (!ack.ok) setDraft(value)
  }
  return (
    <input
      value={draft}
      disabled={disabled}
      inputMode={numeric ? 'numeric' : 'text'}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(numeric ? e.target.value.replace(/\D/g, '').slice(0, 4) : e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setDraft(value)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      className={`h-9 w-full rounded-md border border-transparent bg-transparent px-2 outline-none transition-colors hover:border-line focus:border-ink disabled:hover:border-transparent ${className}`}
    />
  )
}

function AddPlayer({ send }: { send: Send }) {
  const [name, setName] = useState('')
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        if (name.trim().length < 2) return
        const ack = await send({ type: 'player.add', name })
        if (ack.ok) setName('')
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Oyuncu ekle" maxLength={24} />
      <Button size="lg" type="submit" disabled={name.trim().length < 2}>
        Ekle
      </Button>
    </form>
  )
}

function SettingsSection({ view, send }: { view: HostView; send: Send }) {
  const patch = (value: Record<string, unknown>) => void send({ type: 'settings.update', patch: value })
  return (
    <Section framed title="Telefon ayarları">
      <ul className="-my-2 divide-y divide-line text-sm">
        <li className="flex items-center justify-between gap-4 py-3">
          <div>
            <p className="font-semibold">Hat numarası hanesi</p>
            <p className="text-[13px] text-quiet">Değişirse hatlar yeniden dağıtılır.</p>
          </div>
          <div className="flex overflow-hidden rounded-md border border-line-strong">
            {([3, 4] as const).map((d) => (
              <button
                key={d}
                type="button"
                disabled={view.status !== 'setup'}
                onClick={() => d !== view.settings.lineDigits && patch({ lineDigits: d })}
                className={`h-9 w-12 text-sm font-bold transition-colors disabled:opacity-50 ${view.settings.lineDigits === d ? 'bg-ink text-paper' : 'hover:bg-soft'}`}
              >
                {d}
              </button>
            ))}
          </div>
        </li>
        <Toggle label="Arayan numarası görünsün" hint="Kapalıyken telefon yalnız çalar." on={view.settings.callerId} onChange={(v) => patch({ callerId: v })} />
        <Toggle label="Ses değiştirici" hint="Her oyuncunun kendi tonu var." on={view.settings.voiceChanger} onChange={(v) => patch({ voiceChanger: v })} />
        <li className="flex items-center justify-between gap-4 py-3">
          <p className="font-semibold">Çalma süresi</p>
          <Select className="h-9 w-28" value={view.settings.ringSeconds} onChange={(e) => patch({ ringSeconds: Number(e.target.value) })}>
            {[15, 20, 25, 30, 45, 60].map((s) => (
              <option key={s} value={s}>
                {s} sn
              </option>
            ))}
          </Select>
        </li>
        <li className="flex items-center justify-between gap-4 py-3">
          <div>
            <p className="font-semibold">Buton oyununda eş bekleme</p>
            <p className="text-[13px] text-quiet">Basmayan bu süreden sonra 0 alır.</p>
          </div>
          <Select className="h-9 w-28" value={view.settings.pairTimeoutSeconds} onChange={(e) => patch({ pairTimeoutSeconds: Number(e.target.value) })}>
            {[20, 30, 40, 60, 90].map((s) => (
              <option key={s} value={s}>
                {s} sn
              </option>
            ))}
          </Select>
        </li>
      </ul>
    </Section>
  )
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (next: boolean) => void }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="font-semibold">{label}</p>
        <p className="text-[13px] text-quiet">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${on ? 'bg-ink' : 'bg-line-strong'}`}
      >
        <span className={`absolute top-1 size-5 rounded-full bg-paper transition-transform duration-200 ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </li>
  )
}

function LinksSection({ view, token }: { view: HostView; token: string }) {
  const base = useLanBase()
  const [copied, setCopied] = useState<string | null>(null)
  if (!base) return null
  const joinUrl = `${base}/?kod=${view.code}`
  const links = [
    ['Yönetim', `${base}/oda/${view.code}/yonetim#anahtar=${token}`],
    ['Uyarı ekranı', `${base}/oda/${view.code}/uyarilar#anahtar=${token}`],
    ['Hat ekranı', `${base}/oda/${view.code}/hat#anahtar=${token}`],
    ['Sahne', `${base}/oda/${view.code}/sahne`],
  ] as const
  const copy = async (label: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      window.prompt(label, url)
    }
  }
  return (
    <Section framed title="Tablet bağlantısı">
      <div className="flex gap-4">
        <JoinQr url={joinUrl} size={132} />
        <div className="min-w-0">
          <p className="text-[13px] text-quiet">Tabletle okut ya da yaz</p>
          <p className="break-all font-bold">{base.replace(/^https?:\/\//, '')}</p>
          <p className="mt-2 text-[13px] text-quiet">Oda kodu</p>
          <p className="text-2xl font-extrabold tracking-[0.12em]">{view.code}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1 border-t border-line pt-3">
        {links.map(([label, url]) => (
          <Button key={label} variant="ghost" className="h-9 px-3" onClick={() => void copy(label, url)}>
            {copied === label ? 'Kopyalandı' : `${label} bağlantısı`}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-[13px] text-quiet">Yönetim, uyarı ve hat bağlantıları anahtar taşır. Yalnız ekibe ver.</p>
    </Section>
  )
}
