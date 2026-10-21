'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AlertsConsole } from './alerts-console'
import { normalizeCode } from '@/lib/format'
import { hostToken } from '@/lib/storage'

export default function AlertsPage() {
  const params = useParams<{ code: string }>()
  const code = normalizeCode(params.code)
  const [token, setToken] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('anahtar')
    if (fromHash) {
      hostToken.set(code, fromHash)
      history.replaceState(null, '', window.location.pathname)
    }
    setToken(hostToken.get(code))
  }, [code])

  if (token === undefined) return null
  if (!token) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5">
        <p className="text-lg font-bold">Bu cihaz {code} odasının uyarılarını göremiyor.</p>
        <p className="mt-2 text-quiet">Yönetim panelinden “Uyarı ekranı bağlantısı”nı kopyalayıp burada aç.</p>
        <Link href="/" className="mt-4 text-sm font-semibold underline underline-offset-4">
          Ana sayfa
        </Link>
      </main>
    )
  }
  return <AlertsConsole code={code} token={token} />
}
