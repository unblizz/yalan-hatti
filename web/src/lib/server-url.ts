const API_PORT = 4000

export function serverUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SERVER_URL
  if (configured) return configured.replace(/\/$/, '')
  if (typeof window === 'undefined') return `http://localhost:${API_PORT}`
  if (window.location.protocol === 'https:') return window.location.origin
  return `http://${window.location.hostname}:${API_PORT}`
}
