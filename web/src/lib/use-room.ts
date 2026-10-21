'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { serverUrl } from './server-url'
import type { Ack, AnyView, Role } from './types'
import { uuid } from './uuid'

export type ConnectionStatus = 'connecting' | 'online' | 'offline' | 'rejected'

interface Options {
  code: string
  role: Role
  token: string | null
  label?: string
  enabled?: boolean
}

type BatteryManagerLike = { level: number; charging: boolean }
type NavigatorWithBattery = Navigator & { getBattery?: () => Promise<BatteryManagerLike> }

const HEARTBEAT_MS = 4000
const COMMAND_DEADLINE_MS = 90_000

async function readBattery(): Promise<{ level: number; charging: boolean } | undefined> {
  try {
    const battery = await (navigator as NavigatorWithBattery).getBattery?.()
    return battery ? { level: battery.level, charging: battery.charging } : undefined
  } catch {
    return undefined
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function useRoom<V extends AnyView>({ code, role, token, label = '', enabled = true }: Options) {
  const [view, setView] = useState<V | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [rejection, setRejection] = useState<{ code: string; message: string } | null>(null)
  const [offset, setOffset] = useState(0)
  const [socket, setSocket] = useState<Socket | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const readyRef = useRef<{ ready: boolean; waiters: Set<() => void> }>({ ready: false, waiters: new Set() })

  useEffect(() => {
    const gate = readyRef.current
    const setReady = (ready: boolean) => {
      gate.ready = ready
      if (!ready) return
      gate.waiters.forEach((wake) => wake())
      gate.waiters.clear()
    }
    if (!enabled) return
    const socket = io(serverUrl(), {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      timeout: 6000,
    })
    socketRef.current = socket
    setSocket(socket)
    let rttMs: number | undefined
    let disposed = false

    const resume = async () => {
      for (let attempt = 0; !disposed && socket.connected; attempt++) {
        try {
          const ack: Ack = await socket
            .timeout(5000)
            .emitWithAck('session.resume', { code, role, token: token ?? undefined, label, userAgent: navigator.userAgent })
          if (ack.ok) {
            setRejection(null)
            setStatus('online')
            setReady(true)
          } else {
            setRejection({ code: ack.code, message: ack.message })
            setStatus('rejected')
          }
          return
        } catch {
          await wait(Math.min(500 * 2 ** attempt, 4000))
        }
      }
    }

    const wake = () => {
      if (document.visibilityState === 'visible' && !socket.connected) socket.connect()
    }

    socket.on('connect', () => void resume())
    socket.on('disconnect', () => {
      setReady(false)
      setStatus('offline')
    })
    socket.on('connect_error', () => setStatus('offline'))
    socket.on('view', (next: V) => {
      setView(next)
      setOffset(next.serverNow - Date.now())
    })
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)

    const beat = setInterval(async () => {
      if (!socket.connected) return
      const sentAt = Date.now()
      const battery = await readBattery()
      try {
        const ack: Ack = await socket.timeout(HEARTBEAT_MS).emitWithAck('heartbeat', { sentAt, rttMs, battery })
        if (ack.ok) rttMs = Date.now() - sentAt
      } catch {
        rttMs = undefined
      }
    }, HEARTBEAT_MS)

    return () => {
      disposed = true
      setReady(false)
      clearInterval(beat)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
      setSocket(null)
    }
  }, [code, role, token, label, enabled])

  const send = useCallback(async (command: Record<string, unknown>): Promise<Ack> => {
    const commandId = uuid()
    const gate = readyRef.current
    const deadline = Date.now() + COMMAND_DEADLINE_MS
    while (Date.now() < deadline) {
      if (!gate.ready) {
        await new Promise<void>((resolve) => {
          const wake = () => {
            clearTimeout(timer)
            gate.waiters.delete(wake)
            resolve()
          }
          const timer = setTimeout(wake, Math.max(0, deadline - Date.now()))
          gate.waiters.add(wake)
        })
        continue
      }
      const socket = socketRef.current
      if (!socket) break
      try {
        return await socket.timeout(6000).emitWithAck('command', { commandId, command })
      } catch {
        await wait(500)
      }
    }
    return { ok: false, code: 'timeout', message: 'Sunucuya ulaşılamadı. Tekrar dene.' }
  }, [])

  const now = useCallback(() => Date.now() + offset, [offset])

  return { view, status, rejection, send, now, socket }
}

export async function joinRoom(code: string, playerId: string, token: string): Promise<Ack<{ playerId: string }>> {
  const socket = io(serverUrl(), { transports: ['websocket', 'polling'], reconnection: false, timeout: 6000 })
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve())
      socket.once('connect_error', reject)
    })
    return await socket.timeout(6000).emitWithAck('player.join', { code, playerId, token })
  } catch {
    return { ok: false, code: 'offline', message: 'Sunucuya bağlanılamadı. Aynı Wi‑Fi ağında mısın?' }
  } finally {
    socket.disconnect()
  }
}
