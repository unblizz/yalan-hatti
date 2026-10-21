'use client'

import { buzz } from './haptics'
import type { Alert, Severity } from './types'

export const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Kritik', warning: 'Uyarı', info: 'Bilgi' }

let audio: AudioContext | null = null

export function unlockSound(): boolean {
  try {
    audio ??= new AudioContext()
    void audio.resume()
    return true
  } catch {
    return false
  }
}

export function chime(severity: Severity): void {
  if (!audio || audio.state !== 'running') return
  const notes = severity === 'critical' ? [880, 660, 880] : severity === 'warning' ? [660, 520] : [520]
  const start = audio.currentTime
  notes.forEach((freq, i) => {
    const osc = audio!.createOscillator()
    const gain = audio!.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const t = start + i * 0.16
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
    osc.connect(gain).connect(audio!.destination)
    osc.start(t)
    osc.stop(t + 0.15)
  })
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext
}

export function notify(alert: Alert, code: string): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  try {
    new Notification(`${SEVERITY_LABEL[alert.severity]}: ${alert.title}`, {
      body: `${alert.detail} · Oda ${code}`,
      tag: alert.key,
      requireInteraction: alert.severity === 'critical',
    })
  } catch {}
}

export function vibrate(severity: Severity): void {
  buzz(severity === 'critical' ? [300, 120, 300, 120, 300] : [200])
}
