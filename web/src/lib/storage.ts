const PREFIX = 'yalan-hatti'
const LEGACY_PREFIX = 'kodes'

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(`${PREFIX}:${key}`) ?? window.localStorage.getItem(`${LEGACY_PREFIX}:${key}`)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    window.localStorage.removeItem(`${LEGACY_PREFIX}:${key}`)
    if (value === null) window.localStorage.removeItem(`${PREFIX}:${key}`)
    else window.localStorage.setItem(`${PREFIX}:${key}`, value)
  } catch {}
}

export const hostToken = {
  get: (code: string) => read(`host:${code}`),
  set: (code: string, token: string) => write(`host:${code}`, token),
}

export const playerToken = {
  get: (code: string) => read(`player:${code}`),
  set: (code: string, token: string) => write(`player:${code}`, token),
  clear: (code: string) => write(`player:${code}`, null),
}

export const soundPreference = {
  get: () => read('sound') === 'on',
  set: (on: boolean) => write('sound', on ? 'on' : null),
}

export const deviceLabel = {
  get: () => read('label') ?? '',
  set: (label: string) => write('label', label),
}
