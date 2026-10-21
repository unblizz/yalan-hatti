'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { PlayerConsole } from './player-console'
import { Button, Select } from '@/components/ui'
import { normalizeCode } from '@/lib/format'
import { serverUrl } from '@/lib/server-url'
import { playerToken } from '@/lib/storage'
import { joinRoom } from '@/lib/use-room'
import { uuid } from '@/lib/uuid'

interface RoomInfo {
  status: string
  players: { id: string; name: string; claimed: boolean; eliminated: boolean }[]
}

export default function PlayerPage() {
  const params = useParams<{ code: string }>()
  const code = normalizeCode(params.code)
  const [token, setToken] = useState<string | null | undefined>(undefined)

  useEffect(() => setToken(playerToken.get(code)), [code])

  if (token === undefined) return null
  if (!token) {
    return (
      <JoinForm
        code={code}
        onJoined={(t) => {
          playerToken.set(code, t)
          setToken(t)
        }}
      />
    )
  }
  return (
    <PlayerConsole
      code={code}
      token={token}
      onForget={() => {
        playerToken.clear(code)
        setToken(null)
      }}
    />
  )
}

function JoinForm({ code, onJoined }: { code: string; onJoined: (token: string) => void }) {
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [missing, setMissing] = useState(false)
  const [choice, setChoice] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [token] = useState(uuid)

  const load = useCallback(
    () =>
      fetch(`${serverUrl()}/rooms/${code}`, { cache: 'no-store' })
        .then((r) => {
          if (r.status === 404) setMissing(true)
          return r.ok ? (r.json() as Promise<RoomInfo>) : null
        })
        .then((data) => {
          if (!data) return
          setRoom(data)
          setChoice((current) => {
            const free = data.players.filter((p) => !p.claimed && !p.eliminated)
            return free.some((p) => p.id === current) ? current : (free[0]?.id ?? '')
          })
        })
        .catch(() => setError('Sunucuya ulaşılamıyor. Aynı Wi‑Fi ağında mısın?')),
    [code],
  )

  useEffect(() => {
    void load()
  }, [load])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!choice) return
    setBusy(true)
    setError(null)
    const ack = await joinRoom(code, choice, token)
    if (ack.ok) return onJoined(token)
    setError(ack.message)
    setBusy(false)
    void load()
  }

  if (missing) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5">
        <p className="text-lg font-bold">{code} diye bir oda yok.</p>
        <Link href="/" className="mt-3 text-sm font-semibold underline underline-offset-4">
          Kodu tekrar gir
        </Link>
      </main>
    )
  }

  const free = room?.players.filter((p) => !p.claimed && !p.eliminated) ?? []

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-12">
      <p className="text-sm text-quiet">Oda {code}</p>
      <h1 className="mt-1 text-[28px] font-extrabold tracking-tight">Kimsin?</h1>
      <form onSubmit={submit} className="mt-8 space-y-3">
        {room && (
          <Select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Adın">
            {room.players.map((p) => (
              <option key={p.id} value={p.id} disabled={p.claimed || p.eliminated}>
                {p.claimed ? `${p.name} (bağlı)` : p.name}
              </option>
            ))}
          </Select>
        )}
        {room && free.length === 0 && <p className="text-sm text-quiet">Bütün oyuncular bağlı. Yönetimden cihaz ayırmasını iste.</p>}
        {error && <p className="text-sm text-bad">{error}</p>}
        <Button variant="primary" size="lg" type="submit" className="w-full" disabled={!choice || busy}>
          {busy ? 'Bağlanıyor…' : 'Bu tablet benim'}
        </Button>
      </form>
      <p className="mt-6 text-sm text-quiet">Tablet sana bağlanır. Sayfa kapanırsa aynı hatla dönersin.</p>
    </main>
  )
}
