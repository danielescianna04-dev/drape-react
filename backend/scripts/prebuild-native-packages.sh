#!/bin/bash
# Pre-build native packages on Cache Master VM
# These packages require compilation and can take 30-90s each
# Pre-building saves massive time on first install

set -e

echo "🔨 Pre-building native packages..."
echo "================================================"

TEMP_DIR="/tmp/prebuild-$$"
mkdir -p "$TEMP_DIR"
cd "$TEMP_DIR"

# Ensure pnpm store directory exists
mkdir -p /home/coder/volumes/pnpm-store
mkdir -p /home/coder/.local/share/pnpm
ln -snf /home/coder/volumes/pnpm-store /home/coder/.local/share/pnpm/store

# Function to prebuild a native package
prebuild_native() {
    local name=$1
    local package=$2
    local version=$3

    echo ""
    echo "🔨 Pre-building: $name ($package@$version)"
    echo "---"

    mkdir -p "$name"
    cd "$name"

    # Create minimal package.json
    cat > package.json <<EOF
{
  "name": "prebuild-$name",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "$package": "$version"
  }
}
EOF

    # Install and build (this compiles the native module)
    echo "   Building..."
    CI=true pnpm install --store-dir /home/coder/volumes/pnpm-store --prefer-offline --network-concurrency=64 --no-optional 2>&1 | tail -5

    echo "   ✅ $name pre-built"
    cd ..
    rm -rf "$name"
}

# Sharp (image processing) - VERY COMMON, 60-90s compile time
prebuild_native "sharp" "sharp" "^0.33.0"

# Canvas (2D graphics) - 30-60s compile time
prebuild_native "canvas" "canvas" "^2.11.0"

# Bcrypt (password hashing) - 20-30s compile time
prebuild_native "bcrypt" "bcrypt" "^5.1.0"

# SQLite3 (database) - 20-40s compile time
prebuild_native "sqlite3" "sqlite3" "^5.1.0"

# Node-gyp heavy packages
prebuild_native "bufferutil" "bufferutil" "^4.0.0"
prebuild_native "utf-8-validate" "utf-8-validate" "^6.0.0"

# Argon2 (modern password hashing) - 25-35s compile time
prebuild_native "argon2" "@node-rs/argon2" "^1.8.0"

# Swc (Rust-based compiler) - often used in Next.js
prebuild_native "swc-core" "@swc/core" "^1.3.0"

# Cleanup
cd /
rm -rf "$TEMP_DIR"

# Show stats
echo ""
echo "================================================"
echo "✅ Native packages pre-built!"
echo ""
echo "📊 Cache Statistics:"
du -sh /home/coder/volumes/pnpm-store 2>/dev/null || echo "Cache size: N/A"
echo ""
echo "⚡ Native package builds now instant (was 30-90s per package)!"
