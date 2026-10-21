export function normalizeCode(raw: string): string {
  return raw
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I')
    .replace(/[^A-Z]/g, '')
    .slice(0, 4)
}

export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function timeOfDay(at: number): string {
  return new Date(at).toLocaleTimeString('tr-TR', { hour12: false })
}

export function ago(ms: number): string {
  if (ms < 1500) return 'şimdi'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} sn önce`
  return `${Math.round(s / 60)} dk önce`
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s} sn`
  const m = Math.floor(s / 60)
  if (m < 60) return s % 60 ? `${m} dk ${s % 60} sn` : `${m} dk`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} sa ${m % 60} dk` : `${h} sa`
}

export type DeviceHealth = 'ok' | 'warn' | 'down'

export function deviceHealth(
  device: { connected: boolean; lastSeenAt: number; battery: { level: number; charging: boolean } | null; rttMs: number | null },
  now: number,
): { health: DeviceHealth; reasons: string[] } {
  if (!device.connected) return { health: 'down', reasons: ['Bağlantı yok'] }
  const reasons: string[] = []
  if (now - device.lastSeenAt > 12_000) reasons.push('Sinyal gecikiyor')
  if (device.battery && !device.battery.charging && device.battery.level < 0.2) reasons.push('Pil düşük')
  if (device.rttMs !== null && device.rttMs > 800) reasons.push('Ağ yavaş')
  return { health: reasons.length > 0 ? 'warn' : 'ok', reasons }
}
