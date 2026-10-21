'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui'
import { normalizeCode } from '@/lib/format'
import { serverUrl } from '@/lib/server-url'

export default function PosterPage() {
  const params = useParams<{ code: string }>()
  const code = normalizeCode(params.code)
  const [lines, setLines] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${serverUrl()}/rooms/${code}/lines`, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<{ lines: string[] }>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => setLines(data.lines))
      .catch(() => setError('Hat listesi alınamadı.'))
  }, [code])

  return (
    <div className="min-h-dvh bg-white text-black print:min-h-0">
      <div className="mx-auto max-w-[800px] px-10 py-12 print:px-0 print:py-0">
        <div className="mb-8 flex items-center justify-between print:hidden">
          <p className="text-sm text-neutral-500">A4 dikey yazdır. Her odaya bir tane as.</p>
          <Button variant="primary" className="!bg-black !text-white" onClick={() => window.print()}>
            Yazdır
          </Button>
        </div>
        <header className="border-b-4 border-black pb-6">
          <p className="text-lg font-bold tracking-[0.3em]">YALAN HATTI</p>
          <h1 className="mt-2 text-6xl font-extrabold tracking-tight">Hat rehberi</h1>
        </header>
        {error && <p className="mt-8 text-lg">{error}</p>}
        {lines && (
          <ul className="mt-10 grid grid-cols-2 gap-x-10 gap-y-6">
            {lines.map((line) => (
              <li key={line} className="flex items-center justify-between border-b-2 border-black pb-3">
                <span className="text-6xl font-extrabold tracking-[0.12em]">{line}</span>
                <span className="text-2xl text-neutral-400">☐</span>
              </li>
            ))}
          </ul>
        )}
        <footer className="mt-12 space-y-2 text-lg">
          <p>Ahizeyi kaldır, numarayı tuşla, Ara’ya bas.</p>
          <p>Hangi hatta kimin olduğunu bulmak senin işin. Karşındaki yalan söyleyebilir.</p>
          <p className="pt-4 text-sm text-neutral-500">Oda {code}</p>
        </footer>
      </div>
    </div>
  )
}
