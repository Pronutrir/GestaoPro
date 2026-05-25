import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  reactStrictMode: true,
  // Evita conflito entre `next dev` e `next build` quando ambos rodam no mesmo ambiente.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  eslint: {
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
