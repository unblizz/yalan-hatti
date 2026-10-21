'use client'

import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { serverUrl } from '@/lib/server-url'

export function useLanBase(): string | null {
  const [base, setBase] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch(`${serverUrl()}/network`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ joinUrls: string[] }>)
      .then((data) => {
        if (!cancelled) setBase(data.joinUrls[0] ?? window.location.origin)
      })
      .catch(() => {
        if (!cancelled) setBase(window.location.origin)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return base
}

export function useJoinUrl(code: string): string | null {
  const base = useLanBase()
  return base && `${base}/?kod=${code}`
}

export function JoinQr({ url, size = 176 }: { url: string; size?: number }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0a0a0a', light: '#ffffff' } })
      .then(setSvg)
      .catch(() => setSvg(''))
  }, [url])
  return (
    <div
      role="img"
      aria-label={`Katılım bağlantısı: ${url}`}
      className="shrink-0 rounded-md bg-white p-3 [&_svg]:h-full [&_svg]:w-full"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
