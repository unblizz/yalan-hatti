'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button, Input } from '@/components/ui'
import { normalizeCode } from '@/lib/format'

export default function Home() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('kod')
    if (fromUrl) setCode(normalizeCode(fromUrl))
  }, [])

  const go = (target: 'oyuncu' | 'sahne') => {
    if (code.length !== 4) return setError('Oda kodu 4 harf.')
    router.push(`/oda/${code}/${target}`)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-12">
      <h1 className="text-[28px] font-extrabold tracking-tight">Yalan Hattı</h1>
      <p className="mt-1 text-quiet">Canlı çekim için oyun yönetimi.</p>

      <form
        className="mt-10 space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          go('oyuncu')
        }}
      >
        <label htmlFor="code" className="text-sm font-semibold">
          Oda kodu
        </label>
        <Input
          id="code"
          value={code}
          onChange={(e) => {
            setError(null)
            setCode(normalizeCode(e.target.value))
          }}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="ABCD"
          className="text-center text-2xl font-bold tracking-[0.35em]"
        />
        {error && <p className="text-sm text-bad">{error}</p>}
        <Button variant="primary" size="lg" type="submit" className="w-full">
          Katıl
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => go('sahne')}>
          Sahne ekranı olarak aç
        </Button>
      </form>

      <div className="mt-10 flex items-center justify-between border-t border-line pt-5 text-sm">
        <span className="text-quiet">Yapım ekibi</span>
        <Link href="/yeni" className="font-bold underline-offset-4 hover:underline">
          Yeni oda aç
        </Link>
      </div>
    </main>
  )
}
