import type { Ack } from '@/lib/types'

export type Send = (command: Record<string, unknown>) => Promise<Ack>

export const CHECKLIST = ['Kameralar kayıtta', 'Kartlarda yer var', 'Ses kaydı açık', 'Klaket kadrajda', 'Tabletler şarjlı, ekran kilidi kapalı']

export const STAGE_DURATIONS = [30, 45, 60, 90, 120, 180, 300]

export function seconds(n: number): string {
  return n < 60 ? `${n} sn` : n % 60 ? `${Math.floor(n / 60)} dk ${n % 60} sn` : `${n / 60} dk`
}
