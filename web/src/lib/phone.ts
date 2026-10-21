'use client'

import { voiceWorkletUrl } from './voice-worklet'

export type MicMode = 'off' | 'mic' | 'tone'

export interface SignalMessage {
  callId: string
  from: 'caller' | 'callee'
  payload: { type: 'offer'; sdp: string } | { type: 'answer'; sdp: string } | { type: 'candidate'; candidate: RTCIceCandidateInit }
}

interface PhoneOptions {
  emit: (callId: string, payload: SignalMessage['payload']) => void
  upload: (callId: string, blob: Blob) => void
  onChange: () => void
}

type Tone = { stop: () => void }

const RTC_CONFIG: RTCConfiguration = { iceServers: [] }

export class Phone {
  ctx: AudioContext | null = null
  mode: MicMode = 'off'
  error: string | null = null
  muted = false
  connected = false
  private micStream: MediaStream | null = null
  private source: AudioNode | null = null
  private shifter: AudioWorkletNode | null = null
  private sendGain: GainNode | null = null
  private sendDest: MediaStreamAudioDestinationNode | null = null
  private analyser: AnalyserNode | null = null
  private pc: RTCPeerConnection | null = null
  private callId: string | null = null
  private role: 'caller' | 'callee' | null = null
  private pending: RTCIceCandidateInit[] = []
  private remoteAudio: HTMLAudioElement | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private tone: Tone | null = null
  private voice = { enabled: true, pitch: 1 }

  constructor(private readonly options: PhoneOptions) {}

  get ready(): boolean {
    return this.ctx !== null && this.mode !== 'off'
  }

  async prepare(forceTone = false): Promise<void> {
    this.ctx ??= new AudioContext({ latencyHint: 'interactive' })
    await this.ctx.resume()
    const worklet = voiceWorkletUrl()
    try {
      await this.ctx.audioWorklet.addModule(worklet)
    } catch {
    } finally {
      URL.revokeObjectURL(worklet)
    }
    this.sendGain = this.ctx.createGain()
    this.sendDest = this.ctx.createMediaStreamDestination()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 512
    this.sendGain.connect(this.sendDest)
    this.sendGain.connect(this.analyser)
    if (!forceTone) {
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
        this.source = this.ctx.createMediaStreamSource(this.micStream)
        this.mode = 'mic'
        this.error = null
      } catch (error) {
        this.error = error instanceof Error && error.name === 'NotAllowedError' ? 'Mikrofon izni verilmedi.' : 'Mikrofon bulunamadı.'
      }
    }
    if (!this.source) {
      this.source = testTone(this.ctx)
      this.mode = 'tone'
    }
    this.rewire()
    this.remoteAudio = document.createElement('audio')
    this.remoteAudio.autoplay = true
    this.remoteAudio.setAttribute('playsinline', '')
    document.body.appendChild(this.remoteAudio)
    this.options.onChange()
  }

  setVoice(enabled: boolean, pitch: number): void {
    if (this.voice.enabled === enabled && this.voice.pitch === pitch) return
    this.voice = { enabled, pitch }
    this.rewire()
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.sendGain) this.sendGain.gain.value = muted ? 0 : 1
    this.options.onChange()
  }

  level(): number {
    if (!this.analyser) return 0
    const data = new Uint8Array(this.analyser.fftSize)
    this.analyser.getByteTimeDomainData(data)
    let peak = 0
    for (const v of data) peak = Math.max(peak, Math.abs(v - 128))
    return Math.min(1, peak / 64)
  }

  ring(kind: 'incoming' | 'ringback' | 'busy' | 'unreachable' | 'hangup' | null): void {
    this.tone?.stop()
    this.tone = null
    if (!kind || !this.ctx) return
    this.tone = playTone(this.ctx, kind)
  }

  async startAsCaller(callId: string): Promise<void> {
    if (this.callId === callId && this.pc) return
    this.open(callId, 'caller')
    const offer = await this.pc!.createOffer()
    await this.pc!.setLocalDescription(offer)
    this.options.emit(callId, { type: 'offer', sdp: offer.sdp ?? '' })
  }

  async onSignal(message: SignalMessage): Promise<void> {
    const { payload } = message
    if (payload.type === 'offer') {
      this.open(message.callId, 'callee')
      await this.pc!.setRemoteDescription({ type: 'offer', sdp: payload.sdp })
      await this.flushCandidates()
      const answer = await this.pc!.createAnswer()
      await this.pc!.setLocalDescription(answer)
      this.options.emit(message.callId, { type: 'answer', sdp: answer.sdp ?? '' })
      return
    }
    if (message.callId !== this.callId || !this.pc) return
    if (payload.type === 'answer') {
      await this.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp })
      await this.flushCandidates()
      return
    }
    if (this.pc.remoteDescription) await this.pc.addIceCandidate(payload.candidate).catch(() => {})
    else this.pending.push(payload.candidate)
  }

  end(): void {
    if (!this.callId) return
    const callId = this.callId
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.recorder?.mimeType || 'audio/webm' })
        this.chunks = []
        if (blob.size > 0) this.options.upload(callId, blob)
      }
      this.recorder.stop()
    }
    this.pc?.close()
    this.pc = null
    this.callId = null
    this.role = null
    this.pending = []
    this.connected = false
    if (this.remoteAudio) this.remoteAudio.srcObject = null
    this.options.onChange()
  }

  dispose(): void {
    this.end()
    this.ring(null)
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.remoteAudio?.remove()
    void this.ctx?.close()
    this.ctx = null
    this.mode = 'off'
  }

  private open(callId: string, role: 'caller' | 'callee'): void {
    if (this.callId && this.callId !== callId) this.end()
    if (this.pc) return
    this.callId = callId
    this.role = role
    const pc = new RTCPeerConnection(RTC_CONFIG)
    this.pc = pc
    const track = this.sendDest!.stream.getAudioTracks()[0]
    if (track) pc.addTrack(track, this.sendDest!.stream)
    pc.onicecandidate = (e) => {
      if (e.candidate) this.options.emit(callId, { type: 'candidate', candidate: e.candidate.toJSON() })
    }
    pc.onconnectionstatechange = () => {
      this.connected = pc.connectionState === 'connected'
      this.options.onChange()
    }
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track])
      if (this.remoteAudio) {
        this.remoteAudio.srcObject = stream
        void this.remoteAudio.play().catch(() => {})
      }
      if (role === 'caller') this.record(stream)
    }
  }

  private record(remote: MediaStream): void {
    if (!this.ctx || !this.sendGain || typeof MediaRecorder === 'undefined') return
    const mix = this.ctx.createMediaStreamDestination()
    this.sendGain.connect(mix)
    this.ctx.createMediaStreamSource(remote).connect(mix)
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t))
    try {
      this.recorder = new MediaRecorder(mix.stream, mimeType ? { mimeType } : undefined)
      this.chunks = []
      this.recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data)
      }
      this.recorder.start(1000)
    } catch {
      this.recorder = null
    }
  }

  private async flushCandidates(): Promise<void> {
    const queued = this.pending.splice(0)
    for (const c of queued) await this.pc?.addIceCandidate(c).catch(() => {})
  }

  private rewire(): void {
    if (!this.ctx || !this.source || !this.sendGain) return
    try {
      this.source.disconnect()
    } catch {}
    try {
      this.shifter?.disconnect()
    } catch {}
    this.shifter = null
    if (this.voice.enabled && this.voice.pitch !== 1) {
      try {
        this.shifter = new AudioWorkletNode(this.ctx, 'pitch-shifter')
        this.shifter.parameters.get('pitch')?.setValueAtTime(this.voice.pitch, this.ctx.currentTime)
        this.source.connect(this.shifter).connect(this.sendGain)
        return
      } catch {
        this.shifter = null
      }
    }
    this.source.connect(this.sendGain)
  }
}

function testTone(ctx: AudioContext): AudioNode {
  const carrier = ctx.createOscillator()
  carrier.frequency.value = 330
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 3
  const depth = ctx.createGain()
  depth.gain.value = 120
  lfo.connect(depth).connect(carrier.frequency)
  const out = ctx.createGain()
  out.gain.value = 0.2
  carrier.connect(out)
  carrier.start()
  lfo.start()
  return out
}

function playTone(ctx: AudioContext, kind: 'incoming' | 'ringback' | 'busy' | 'unreachable' | 'hangup'): Tone {
  const out = ctx.createGain()
  out.gain.value = 0
  out.connect(ctx.destination)
  const osc = ctx.createOscillator()
  osc.connect(out)
  const pattern: { freq: number; on: number; off: number; loop: boolean; volume: number }[] =
    kind === 'incoming'
      ? [
          { freq: 1000, on: 0.4, off: 0, loop: true, volume: 0.18 },
          { freq: 800, on: 0.4, off: 2, loop: true, volume: 0.18 },
        ]
      : kind === 'ringback'
        ? [{ freq: 450, on: 1, off: 4, loop: true, volume: 0.1 }]
        : kind === 'busy'
          ? [{ freq: 450, on: 0.5, off: 0.5, loop: true, volume: 0.1 }]
          : kind === 'unreachable'
            ? [
                { freq: 950, on: 0.33, off: 0, loop: false, volume: 0.1 },
                { freq: 1400, on: 0.33, off: 0, loop: false, volume: 0.1 },
                { freq: 1800, on: 0.33, off: 1, loop: false, volume: 0.1 },
              ]
            : [{ freq: 450, on: 0.25, off: 0, loop: false, volume: 0.1 }]
  const cycle = pattern.reduce((s, p) => s + p.on + p.off, 0)
  const repeats = pattern[0]!.loop ? (kind === 'busy' ? 6 : 40) : kind === 'unreachable' ? 2 : 1
  let t = ctx.currentTime + 0.02
  for (let r = 0; r < repeats; r++) {
    for (const step of pattern) {
      osc.frequency.setValueAtTime(step.freq, t)
      out.gain.setValueAtTime(step.volume, t)
      out.gain.setValueAtTime(0, t + step.on)
      t += step.on + step.off
    }
  }
  osc.start()
  osc.stop(ctx.currentTime + cycle * repeats + 0.1)
  return {
    stop: () => {
      try {
        osc.stop()
      } catch {}
      out.disconnect()
    },
  }
}
