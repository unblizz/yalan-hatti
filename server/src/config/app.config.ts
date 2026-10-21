import { resolve } from 'node:path'
import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATA_DIR: z.string().default('./data'),
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  SECURE_PORT: z.coerce.number().int().min(1).max(65535).optional(),
})

export interface AppConfig {
  port: number
  host: string
  dataDir: string
  webPort: number
  securePort: number | null
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.parse(env)
  return {
    port: parsed.PORT,
    host: parsed.HOST,
    dataDir: resolve(parsed.DATA_DIR),
    webPort: parsed.WEB_PORT,
    securePort: parsed.SECURE_PORT ?? null,
  }
}

export const APP_CONFIG = Symbol('APP_CONFIG')
