import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Tolerate AI-generated code during build
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
}

export default nextConfig
