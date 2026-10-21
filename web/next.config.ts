import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.16.*.*'],
}

export default config
