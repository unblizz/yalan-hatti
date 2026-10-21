import { z } from 'zod'

const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}$/)
const id = z.string().uuid()
const digits = z.string().trim().regex(/^\d{0,6}$/)

export const createRoomSchema = z.object({
  roster: z
    .array(z.string().trim().min(2).max(24))
    .max(16)
    .default([])
    .transform((names) => [...new Set(names)]),
})

export const resumeSchema = z.object({
  code,
  role: z.enum(['host', 'player', 'screen']),
  token: z.string().max(100).optional(),
  label: z.string().trim().max(40).default(''),
  userAgent: z.string().max(300).default(''),
})

export const joinSchema = z.object({
  code,
  playerId: id,
  token: id,
})

export const heartbeatSchema = z.object({
  sentAt: z.number(),
  rttMs: z.number().min(0).max(60_000).optional(),
  battery: z.object({ level: z.number().min(0).max(1), charging: z.boolean() }).optional(),
})

export const signalSchema = z.object({
  callId: id,
  payload: z.record(z.string(), z.unknown()),
})

export const hostCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('player.add'), name: z.string().max(60) }),
  z.object({
    type: z.literal('player.update'),
    playerId: id,
    name: z.string().max(60).optional(),
    room: digits.optional(),
    line: digits.optional(),
  }),
  z.object({ type: z.literal('player.remove'), playerId: id }),
  z.object({ type: z.literal('player.release'), playerId: id }),
  z.object({ type: z.literal('player.eliminate'), playerId: id }),
  z.object({ type: z.literal('numbers.auto') }),
  z.object({
    type: z.literal('settings.update'),
    patch: z
      .object({
        lineDigits: z.union([z.literal(3), z.literal(4)]).optional(),
        callerId: z.boolean().optional(),
        voiceChanger: z.boolean().optional(),
        ringSeconds: z.number().int().optional(),
        pairTimeoutSeconds: z.number().int().optional(),
        awards: z.array(z.number().int()).max(5).optional(),
      })
      .strict(),
  }),
  z.object({ type: z.literal('game.start') }),
  z.object({ type: z.literal('game.finish') }),
  z.object({ type: z.literal('stage.open'), kind: z.enum(['roomGuess', 'buttons', 'bomb', 'loveVote']) }),
  z.object({ type: z.literal('stage.cancel') }),
  z.object({ type: z.literal('stage.start'), seconds: z.number().int(), awards: z.array(z.number().int()).max(5).optional() }),
  z.object({ type: z.literal('stage.pause') }),
  z.object({ type: z.literal('stage.resume') }),
  z.object({ type: z.literal('stage.extend'), seconds: z.number().int() }),
  z.object({ type: z.literal('stage.close') }),
  z.object({ type: z.literal('stage.award'), playerId: id, award: z.number().int() }),
  z.object({ type: z.literal('stage.confirm') }),
  z.object({ type: z.literal('lines.set'), open: z.boolean() }),
  z.object({ type: z.literal('checklist.confirm'), items: z.array(z.string().max(120)).max(20) }),
  z.object({ type: z.literal('marker.add'), label: z.string().max(200) }),
])

export const alertCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('alert.ack'), alertId: id }),
  z.object({ type: z.literal('alert.ackAll') }),
])

export const playerCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('guess.set'), targetId: id, room: digits }),
  z.object({ type: z.literal('guess.lock') }),
  z.object({ type: z.literal('button.press'), choice: z.enum(['green', 'red']) }),
  z.object({ type: z.literal('vote.cast'), targetId: id }),
  z.object({ type: z.literal('call.dial'), number: digits }),
  z.object({ type: z.literal('call.answer'), callId: id }),
  z.object({ type: z.literal('call.decline'), callId: id }),
  z.object({ type: z.literal('call.hangup'), callId: id }),
])

export const envelopeSchema = z.object({
  commandId: id.optional(),
  command: z.unknown(),
})

export type Ack<T = Record<string, unknown>> = { ok: true; data: T } | { ok: false; code: string; message: string }
