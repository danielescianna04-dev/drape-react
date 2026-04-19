#!/bin/bash
# =============================================================================
# Deploy backend-ts to Hetzner — DEV environment
# Usage: ./deploy-dev.sh [user@host]
# =============================================================================
set -euo pipefail

SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_drape}"
SSH_PORT="${SSH_PORT:-49222}"
SSH_OPTS="-i ${SSH_KEY} -p ${SSH_PORT}"
REMOTE="${1:-root@77.42.1.116}"
REMOTE_DIR="/opt/drape-backend-dev"

echo "🔨 Building TypeScript..."
npm run build

echo "📦 Syncing to ${REMOTE}:${REMOTE_DIR} (DEV)..."
ssh ${SSH_OPTS} "$REMOTE" "mkdir -p ${REMOTE_DIR}"

rsync -avz --delete \
  --exclude node_modules \
  --include 'templates/***' \
  --exclude src \
  --exclude .git \
  --exclude .env \
  --exclude local-data \
  --exclude service-account-key.json \
  --include '**/*.d.ts' \
  --exclude '*.ts' \
  ./ -e "ssh ${SSH_OPTS}" "${REMOTE}:${REMOTE_DIR}/"

echo "📥 Installing production deps on server..."
ssh ${SSH_OPTS} "$REMOTE" "cd ${REMOTE_DIR} && npm ci --omit=dev"

echo "🗄️  Applying Drape Cloud migrations (idempotent)..."
ssh ${SSH_OPTS} "$REMOTE" "cd ${REMOTE_DIR} && set -a && . ./.env && set +a && node scripts/drape-cloud-migrate.js" || echo "   (skipped — DRAPE_CLOUD_DB_URL may not be set)"

echo "🔄 Restarting DEV backend..."
ssh ${SSH_OPTS} "$REMOTE" "systemctl restart drape-backend-dev"
sleep 4

if ! ssh ${SSH_OPTS} "$REMOTE" "systemctl is-active --quiet drape-backend-dev"; then
  echo "❌ DEV backend did not start. Check logs:"
  ssh ${SSH_OPTS} "$REMOTE" "systemctl status drape-backend-dev --no-pager -n 40 || tail -40 /var/log/drape-backend-dev.log"
  exit 1
fi

echo "🔍 Verifying health..."
if curl -s --max-time 5 https://dev.drape.info/health | grep -q 'ok'; then
  echo "✅ DEV deploy complete! Backend is healthy."
  echo "   URL:   https://dev.drape.info"
  echo "   Logs:  ssh ${REMOTE} 'tail -f /var/log/drape-backend-dev.log'"
else
  echo "⚠️  Health check failed (DNS/SSL might not be ready yet). Check manually:"
  echo "   ssh ${REMOTE} 'curl -s http://localhost:3002/health'"
fi
