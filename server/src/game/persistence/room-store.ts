import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AlertBook } from '../domain/alerts.js'
import { STATE_VERSION, type DomainEvent, type GameState } from '../domain/game.types.js'

export interface LoggedEvent extends DomainEvent {
  seq: number
  at: number
}

export interface StoredRoom {
  state: GameState
  seq: number
  replies?: [string, Record<string, unknown>][]
  alerts?: AlertBook
}

export class RoomStore {
  constructor(private readonly root: string) {
    mkdirSync(this.roomsDir, { recursive: true })
  }

  private get roomsDir(): string {
    return join(this.root, 'rooms')
  }

  private dir(code: string): string {
    return join(this.roomsDir, code)
  }

  save(code: string, room: StoredRoom, events: LoggedEvent[]): void {
    const dir = this.dir(code)
    mkdirSync(dir, { recursive: true })
    if (events.length > 0) {
      appendFileSync(join(dir, 'events.ndjson'), events.map((e) => JSON.stringify(e)).join('\n') + '\n')
    }
    const target = join(dir, 'snapshot.json')
    const temp = `${target}.tmp`
    writeFileSync(temp, JSON.stringify(room))
    renameSync(temp, target)
  }

  loadAll(): { rooms: StoredRoom[]; skipped: string[] } {
    const rooms: StoredRoom[] = []
    const skipped: string[] = []
    for (const entry of readdirSync(this.roomsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const file = join(this.dir(entry.name), 'snapshot.json')
      if (!existsSync(file)) continue
      const stored = JSON.parse(readFileSync(file, 'utf8')) as StoredRoom
      if (stored.state?.version === STATE_VERSION) rooms.push(stored)
      else skipped.push(entry.name)
    }
    return { rooms, skipped }
  }

  saveRecording(code: string, callId: string, extension: string, data: Buffer): string {
    const dir = join(this.dir(code), 'recordings')
    mkdirSync(dir, { recursive: true })
    const file = `${callId}.${extension}`
    writeFileSync(join(dir, file), data)
    return file
  }

  recordingPath(code: string, file: string): string | null {
    const path = join(this.dir(code), 'recordings', file)
    return existsSync(path) ? path : null
  }

  events(code: string): LoggedEvent[] {
    const file = join(this.dir(code), 'events.ndjson')
    if (!existsSync(file)) return []
    return readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as LoggedEvent]
        } catch {
          return []
        }
      })
  }
}
