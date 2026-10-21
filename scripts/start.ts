import { spawn, spawnSync } from 'node:child_process'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureCertificate, startGateway } from './https-gateway.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const PORTS = { web: 3000, api: 4000, secure: 3443 }

const print = (name) => (chunk) =>
  chunk
    .toString()
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((line) => console.log(`[${name}] ${line}`))

const lan = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal)
  .map((n) => n.address)
  .sort((a, b) => Number(b.startsWith('192.168.')) - Number(a.startsWith('192.168.')))

const tls = ensureCertificate(join(root, 'certs'), lan)
const env = { ...process.env, PORT: String(PORTS.api), WEB_PORT: String(PORTS.web), ...(tls ? { SECURE_PORT: String(PORTS.secure) } : {}) }

const services = [
  { name: 'sunucu', command: 'npm --prefix server start' },
  { name: 'web   ', command: `npm --prefix web start` },
]

const children = services.map(({ name, command }) => {
  const child = spawn(command, { cwd: root, shell: true, env })
  child.stdout.on('data', print(name))
  child.stderr.on('data', print(name))
  child.on('exit', (code) => {
    console.log(`[${name}] kapandı (${code ?? 'sinyal'})`)
    shutdown(code ?? 1)
  })
  return child
})

if (tls) startGateway({ port: PORTS.secure, webPort: PORTS.web, apiPort: PORTS.api, ...tls, log: print('kapı  ') })
else console.log('[kapı  ] openssl bulunamadı, yalnız http açık.')

setTimeout(() => {
  console.log('\nBu bilgisayarda:  http://localhost:3000')
  if (tls) {
    console.log('Telefon ve tablet:')
    lan.forEach((ip) => console.log(`  https://${ip}:${PORTS.secure}`))
    console.log('İlk açılışta "bağlantı gizli değil" uyarısı çıkar: Gelişmiş > Devam et.\n')
  } else {
    lan.forEach((ip) => console.log(`  http://${ip}:${PORTS.web}`))
  }
}, 2500)

let stopping = false
function shutdown(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else child.kill()
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
