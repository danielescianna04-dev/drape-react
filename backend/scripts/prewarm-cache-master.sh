#!/bin/bash
# Pre-warm pnpm cache on Cache Master VM with common dependencies
# This populates the cache with Next.js 12-16, React, TypeScript, Tailwind, etc.

set -e

echo "🔥 Pre-warming pnpm cache on Cache Master VM..."
echo "================================================"

TEMP_DIR="/tmp/prewarm-$$"
mkdir -p "$TEMP_DIR"
cd "$TEMP_DIR"

# Ensure pnpm store directory exists
mkdir -p /home/coder/volumes/pnpm-store
mkdir -p /home/coder/.local/share/pnpm
ln -snf /home/coder/volumes/pnpm-store /home/coder/.local/share/pnpm/store

# Function to create and install a project
prewarm_project() {
    local name=$1
    local deps=$2

    echo ""
    echo "📦 Pre-warming: $name"
    echo "---"

    mkdir -p "$name"
    cd "$name"

    # Create minimal package.json
    cat > package.json <<EOF
{
  "name": "prewarm-$name",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    $deps
  }
}
EOF

    # Install to populate cache
    echo "   Installing..."
    CI=true pnpm install --store-dir /home/coder/volumes/pnpm-store --prefer-offline --no-frozen-lockfile 2>&1 | grep -E "Progress|dependencies|Downloading" || true

    echo "   ✅ $name cache populated"
    cd ..
    rm -rf "$name"
}

# Next.js 16 (latest)
prewarm_project "nextjs16" '"next": "^16.1.0", "react": "^19.0.0", "react-dom": "^19.0.0", "typescript": "^5.7.2", "@types/react": "^19.0.0", "@types/node": "^22.10.0", "tailwindcss": "^3.4.0", "autoprefixer": "^10.4.0", "postcss": "^8.4.0"'

# Next.js 15
prewarm_project "nextjs15" '"next": "^15.1.0", "react": "^19.0.0", "react-dom": "^19.0.0", "typescript": "^5.6.0", "@types/react": "^18.3.0", "@types/node": "^20.0.0", "tailwindcss": "^3.4.0"'

# Next.js 14 (most common)
prewarm_project "nextjs14" '"next": "^14.2.0", "react": "^18.3.0", "react-dom": "^18.3.0", "typescript": "^5.5.0", "@types/react": "^18.3.0", "@types/node": "^20.0.0", "tailwindcss": "^3.4.0", "eslint": "^8.57.0", "eslint-config-next": "^14.2.0"'

# Next.js 13
prewarm_project "nextjs13" '"next": "^13.5.0", "react": "^18.2.0", "react-dom": "^18.2.0", "typescript": "^5.2.0", "@types/react": "^18.2.0", "@types/node": "^20.0.0"'

# Next.js 12
prewarm_project "nextjs12" '"next": "^12.3.0", "react": "^18.2.0", "react-dom": "^18.2.0", "typescript": "^4.9.0", "@types/react": "^18.0.0", "@types/node": "^18.0.0"'

# Common utility packages
prewarm_project "common-utils" '"axios": "^1.6.0", "date-fns": "^3.0.0", "lodash": "^4.17.0", "@types/lodash": "^4.14.0", "zod": "^3.22.0", "clsx": "^2.1.0", "framer-motion": "^11.0.0"'

# Common state management
prewarm_project "state-mgmt" '"zustand": "^4.5.0", "@tanstack/react-query": "^5.17.0", "react-hook-form": "^7.49.0", "swr": "^2.2.0"'

# Common UI libraries
prewarm_project "ui-libs" '"@radix-ui/react-dialog": "^1.0.0", "@radix-ui/react-dropdown-menu": "^2.0.0", "lucide-react": "^0.263.0", "class-variance-authority": "^0.7.0", "tailwind-merge": "^2.2.0"'

# ENTERPRISE: Database & Backend (Prisma, tRPC, Auth)
prewarm_project "enterprise-db" '"prisma": "^5.7.0", "@prisma/client": "^5.7.0", "@trpc/server": "^10.45.0", "@trpc/client": "^10.45.0", "@trpc/react-query": "^10.45.0", "next-auth": "^4.24.0", "@auth/prisma-adapter": "^1.0.0"'

# ENTERPRISE: Payments & Analytics
prewarm_project "enterprise-payments" '"stripe": "^14.9.0", "@stripe/stripe-js": "^2.4.0", "@stripe/react-stripe-js": "^2.4.0", "posthog-js": "^1.96.0", "@vercel/analytics": "^1.1.0"'

# ENTERPRISE: Database Clients
prewarm_project "enterprise-clients" '"pg": "^8.11.0", "@types/pg": "^8.10.0", "mongodb": "^6.3.0", "redis": "^4.6.0", "ioredis": "^5.3.0"'

# ENTERPRISE: Content & Media
prewarm_project "enterprise-media" '"@upstash/redis": "^1.28.0", "@vercel/blob": "^0.16.0", "sharp": "^0.33.0", "uploadthing": "^6.3.0"'

# Cleanup
cd /
rm -rf "$TEMP_DIR"

# Show cache stats
echo ""
echo "================================================"
echo "✅ Cache pre-warming complete!"
echo ""
echo "📊 Cache Statistics:"
du -sh /home/coder/volumes/pnpm-store 2>/dev/null || echo "Cache size: N/A"
find /home/coder/volumes/pnpm-store -type f 2>/dev/null | wc -l | xargs echo "Files cached:"
echo ""
echo "🚀 Cache Master is ready to serve worker VMs!"
