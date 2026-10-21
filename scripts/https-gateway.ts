import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { join } from 'node:path'

const API_PATHS = ['/socket.io', '/rooms', '/roster', '/network', '/health']

const OPENSSL_CANDIDATES = [
  'openssl',
  'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
  'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe',
]

export function ensureCertificate(dir, ips) {
  const key = join(dir, 'key.pem')
  const cert = join(dir, 'cert.pem')
  if (existsSync(key) && existsSync(cert)) return { key: readFileSync(key), cert: readFileSync(cert) }
  mkdirSync(dir, { recursive: true })
  const san = ['DNS:localhost', 'IP:127.0.0.1', ...ips.map((ip) => `IP:${ip}`)].join(',')
  const args = ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '825', '-keyout', key, '-out', cert, '-subj', '/CN=Yalan Hatti', '-addext', `subjectAltName=${san}`]
  for (const bin of OPENSSL_CANDIDATES) {
    try {
      execFileSync(bin, args, { stdio: 'ignore', env: { ...process.env, MSYS_NO_PATHCONV: '1' } })
      return { key: readFileSync(key), cert: readFileSync(cert) }
    } catch {}
  }
  return null
}

export function startGateway({ port, webPort, apiPort, key, cert, log }) {
  const targetFor = (url = '/') => (API_PATHS.some((p) => url === p || url.startsWith(`${p}/`) || url.startsWith(`${p}?`)) ? apiPort : webPort)

  const server = https.createServer({ key, cert }, (req, res) => {
    const upstream = http.request(
      { host: '127.0.0.1', port: targetFor(req.url), method: req.method, path: req.url, headers: { ...req.headers, 'x-forwarded-proto': 'https' } },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers)
        up.pipe(res)
      },
    )
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Servis henüz hazır değil.')
    })
    req.pipe(upstream)
  })

  server.on('upgrade', (req, socket, head) => {
    const upstream = net.connect(targetFor(req.url), '127.0.0.1', () => {
      const headers = []
      for (let i = 0; i < req.rawHeaders.length; i += 2) headers.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
      upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${headers.join('\r\n')}\r\n\r\n`)
      if (head.length > 0) upstream.write(head)
      socket.pipe(upstream).pipe(socket)
    })
    const close = () => {
      socket.destroy()
      upstream.destroy()
    }
    upstream.on('error', close)
    socket.on('error', close)
  })

  server.on('error', (error) => log(`güvenli kapı açılamadı: ${error.message}`))
  server.listen(port, '0.0.0.0')
  return server
}
