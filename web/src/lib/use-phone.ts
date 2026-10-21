'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { Socket } from 'socket.io-client'
import { buzz } from './haptics'
import { Phone, type SignalMessage } from './phone'
import { serverUrl } from './server-url'
import type { Ack, PlayerView } from './types'

export function usePhone({
  view,
  socket,
  code,
  token,
  send,
}: {
  view: PlayerView | null
  socket: Socket | null
  code: string
  token: string
  send: (command: Record<string, unknown>) => Promise<Ack>
}) {
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  const socketRef = useRef(socket)
  socketRef.current = socket
  const phoneRef = useRef<Phone | null>(null)
  phoneRef.current ??= new Phone({
    emit: (callId, payload) => socketRef.current?.emit('rtc.signal', { callId, payload }),
    upload: (callId, blob) => {
      void fetch(`${serverUrl()}/rooms/${code}/calls/${callId}/recording`, {
        method: 'POST',
        headers: { 'content-type': blob.type || 'audio/webm', 'x-player-token': token },
        body: blob,
      }).catch(() => {})
    },
    onChange: refresh,
  })
  const phone = phoneRef.current

  useEffect(() => () => phone.dispose(), [phone])

  useEffect(() => {
    if (!socket) return
    const onSignal = (message: SignalMessage) => void phone.onSignal(message).catch(() => {})
    socket.on('rtc.signal', onSignal)
    return () => {
      socket.off('rtc.signal', onSignal)
    }
  }, [socket, phone])

  useEffect(() => {
    if (view) phone.setVoice(view.voice.enabled, view.voice.pitch)
  }, [phone, view?.voice.enabled, view?.voice.pitch])

  const call = view?.call ?? null
  const previous = useRef<{ id: string; status: string } | null>(null)
  useEffect(() => {
    const before = previous.current
    previous.current = call ? { id: call.id, status: call.status } : null
    if (!call) {
      if (before) {
        phone.end()
        phone.ring(before.status === 'active' ? 'hangup' : null)
      }
      return
    }
    if (call.status === 'ringing') {
      phone.ring(call.direction === 'in' ? 'incoming' : 'ringback')
      if (call.direction === 'in') buzz([400, 200, 400])
    }
    if (call.status === 'active') {
      phone.ring(null)
      if (call.direction === 'out') void phone.startAsCaller(call.id).catch(() => {})
    }
  }, [phone, call?.id, call?.status, call?.direction])

  const dial = useCallback(
    async (number: string): Promise<Ack> => {
      const ack = await send({ type: 'call.dial', number })
      if (ack.ok && ack.data.result === 'busy') phone.ring('busy')
      if (ack.ok && ack.data.result === 'unreachable') phone.ring('unreachable')
      return ack
    },
    [phone, send],
  )

  return {
    phone,
    ready: phone.ready,
    mode: phone.mode,
    error: phone.error,
    muted: phone.muted,
    connected: phone.connected,
    prepare: (forceTone = false) => phone.prepare(forceTone),
    toggleMute: () => phone.setMuted(!phone.muted),
    stopTone: () => phone.ring(null),
    dial,
  }
}
