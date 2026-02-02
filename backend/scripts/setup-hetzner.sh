#!/bin/bash
# =============================================================================
# Hetzner Server Setup Script for Drape Workspaces
# Run this on each new Hetzner AX102 server
# =============================================================================

set -euo pipefail

echo "🚀 Drape Hetzner Server Setup"
echo "=============================="

# --- 1. Install Docker Engine ---
echo ""
echo "📦 Step 1: Installing Docker..."

if command -v docker &>/dev/null; then
    echo "   Docker already installed: $(docker --version)"
else
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "   ✅ Docker installed: $(docker --version)"
fi

# --- 2. Configure Docker daemon ---
echo ""
echo "⚙️ Step 2: Configuring Docker daemon..."

# Enable TCP access for remote management (with TLS)
mkdir -p /etc/docker

cat > /etc/docker/daemon.json << 'EOF'
{
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    },
    "default-ulimits": {
        "nofile": {
            "Name": "nofile",
            "Hard": 65536,
            "Soft": 65536
        }
    },
    "storage-driver": "overlay2"
}
EOF

systemctl restart docker
echo "   ✅ Docker daemon configured"

# --- 3. Create Docker network ---
echo ""
echo "🌐 Step 3: Creating Docker network..."

if docker network inspect drape-net &>/dev/null; then
    echo "   Network 'drape-net' already exists"
else
    docker network create drape-net
    echo "   ✅ Network 'drape-net' created"
fi

# --- 4. Create data directories on NVMe ---
echo ""
echo "💾 Step 4: Creating data directories..."

mkdir -p /data/pnpm-store
mkdir -p /data/projects
mkdir -p /data/next-cache

# Set permissions
chmod 755 /data/pnpm-store
chmod 755 /data/projects
chmod 755 /data/next-cache

echo "   ✅ Directories created:"
echo "   /data/pnpm-store  (shared pnpm cache, mounted :ro to containers)"
echo "   /data/projects    (per-project persistent storage)"
echo "   /data/next-cache  (per-project .next cache)"

# --- 5. Build workspace Docker image ---
echo ""
echo "🐳 Step 5: Building workspace image..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE_DIR="${SCRIPT_DIR}/../fly-workspace"

if [ -f "${WORKSPACE_DIR}/Dockerfile.workspace" ]; then
    docker build -t drape-workspace:latest -f "${WORKSPACE_DIR}/Dockerfile.workspace" "${WORKSPACE_DIR}"
    echo "   ✅ Image 'drape-workspace:latest' built"
else
    echo "   ⚠️ Dockerfile.workspace not found at ${WORKSPACE_DIR}"
    echo "   Copy it to the server and run: docker build -t drape-workspace:latest -f Dockerfile.workspace ."
fi

# --- 6. Populate pnpm store ---
echo ""
echo "📚 Step 6: Populating pnpm store with common packages..."

# Run a temporary container to populate the store
docker run --rm \
    -v /data/pnpm-store:/home/coder/volumes/pnpm-store \
    drape-workspace:latest \
    bash -c '
        cd /tmp
        cat > package.json << PKGJSON
{
    "name": "drape-cache-warmup",
    "private": true,
    "dependencies": {
        "next": "latest",
        "react": "latest",
        "react-dom": "latest",
        "typescript": "latest",
        "@types/react": "latest",
        "@types/node": "latest",
        "tailwindcss": "latest",
        "postcss": "latest",
        "autoprefixer": "latest",
        "eslint": "latest",
        "prettier": "latest",
        "@next/font": "latest",
        "lucide-react": "latest",
        "clsx": "latest",
        "vite": "latest",
        "@vitejs/plugin-react": "latest"
    }
}
PKGJSON
        pnpm install --store-dir /home/coder/volumes/pnpm-store
        echo "✅ pnpm store populated"
        du -sh /home/coder/volumes/pnpm-store
    '

echo "   ✅ pnpm store ready"
du -sh /data/pnpm-store

# --- 7. Configure Docker TLS for remote access ---
echo ""
echo "🔒 Step 7: Docker TLS setup..."

TLS_DIR="/etc/docker/tls"
mkdir -p "$TLS_DIR"

if [ ! -f "$TLS_DIR/server-cert.pem" ]; then
    echo "   ⚠️ TLS certificates not found."
    echo "   To enable remote Docker API access, generate certs:"
    echo ""
    echo "   # On your CA machine:"
    echo "   openssl genrsa -out ca-key.pem 4096"
    echo "   openssl req -new -x509 -days 365 -key ca-key.pem -out ca.pem"
    echo ""
    echo "   # For this server:"
    echo "   openssl genrsa -out server-key.pem 4096"
    echo "   openssl req -new -key server-key.pem -out server.csr"
    echo "   openssl x509 -req -days 365 -in server.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial -out server-cert.pem"
    echo ""
    echo "   Copy ca.pem, server-cert.pem, server-key.pem to $TLS_DIR"
    echo "   Then add to /etc/docker/daemon.json:"
    echo '   "hosts": ["unix:///var/run/docker.sock", "tcp://0.0.0.0:2376"],'
    echo '   "tls": true, "tlscacert": "/etc/docker/tls/ca.pem",'
    echo '   "tlscert": "/etc/docker/tls/server-cert.pem",'
    echo '   "tlskey": "/etc/docker/tls/server-key.pem"'
else
    echo "   ✅ TLS certificates found"
fi

# --- 8. Configure firewall ---
echo ""
echo "🛡️ Step 8: Firewall configuration..."

if command -v ufw &>/dev/null; then
    ufw allow 22/tcp     # SSH
    ufw allow 2376/tcp   # Docker API (TLS only)
    ufw allow 80/tcp     # HTTP (preview)
    ufw allow 443/tcp    # HTTPS (preview)
    echo "   ✅ Firewall rules added"
else
    echo "   ⚠️ ufw not found. Configure iptables manually:"
    echo "   Allow: 22 (SSH), 2376 (Docker API), 80/443 (Preview)"
fi

# --- 9. Test ---
echo ""
echo "🧪 Step 9: Running test container..."

TEST_OUTPUT=$(docker run --rm \
    --network drape-net \
    -v /data/pnpm-store:/home/coder/volumes/pnpm-store:ro \
    drape-workspace:latest \
    bash -c 'echo "Node: $(node -v)" && echo "pnpm: $(pnpm -v)" && echo "Store: $(du -sh /home/coder/volumes/pnpm-store 2>/dev/null | cut -f1)"')

echo "$TEST_OUTPUT"

echo ""
echo "=============================="
echo "✅ Hetzner server setup complete!"
echo ""
echo "Next steps:"
echo "1. Generate TLS certificates for remote Docker API"
echo "2. Update backend DOCKER_SERVERS env var with this server's IP"
echo "3. Set INFRA_BACKEND=docker to switch from Fly.io"
echo ""
echo "Server info:"
echo "  CPU: $(nproc) cores"
echo "  RAM: $(free -h | awk '/Mem:/{print $2}')"
echo "  Disk: $(df -h /data | awk 'NR==2{print $2, "total,", $4, "free"}')"
echo ""
