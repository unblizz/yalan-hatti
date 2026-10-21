'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button, fieldClass } from '@/components/ui'
import { serverUrl } from '@/lib/server-url'
import { hostToken } from '@/lib/storage'

export default function NewRoom() {
  const router = useRouter()
  const [roster, setRoster] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${serverUrl()}/roster`)
      .then((r) => r.json() as Promise<{ roster: string[] }>)
      .then((data) => setRoster((current) => current || data.roster.join('\n')))
      .catch(() => setError('Sunucuya ulaşılamıyor.'))
  }, [])

  const names = roster
    .split('\n')
    .map((n) => n.trim())
    .filter((n) => n.length >= 2)

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${serverUrl()}/rooms`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roster: names }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const room = (await res.json()) as { code: string; hostToken: string }
      hostToken.set(room.code, room.hostToken)
      router.push(`/oda/${room.code}/yonetim`)
    } catch {
      setError('Oda açılamadı. Sunucu çalışıyor mu?')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-12">
      <Link href="/" className="text-sm text-quiet hover:text-ink">
        ← Geri
      </Link>
      <h1 className="mt-4 text-[28px] font-extrabold tracking-tight">Yeni oda</h1>

      <label htmlFor="roster" className="mt-8 flex items-baseline justify-between text-sm font-semibold">
        Kadro
        <span className="font-normal text-quiet">{names.length} kişi</span>
      </label>
      <textarea
        id="roster"
        value={roster}
        onChange={(e) => setRoster(e.target.value)}
        rows={10}
        className={`${fieldClass} mt-2 h-auto py-3 leading-7`}
      />
      <p className="mt-2 text-sm text-quiet">Her satıra bir isim. Katılımcılar adını bu listeden seçer.</p>

      {error && <p className="mt-4 text-sm text-bad">{error}</p>}
      <Button variant="primary" size="lg" className="mt-6 w-full" disabled={busy} onClick={create}>
        {busy ? 'Açılıyor…' : 'Odayı aç'}
      </Button>
    </main>
  )
}
