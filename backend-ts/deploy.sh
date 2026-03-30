#!/bin/bash
# =============================================================================
# Deploy backend-ts to Hetzner
# Usage: ./deploy.sh [user@host]
# =============================================================================
set -euo pipefail

SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_drape}"
SSH_PORT="${SSH_PORT:-49222}"
SSH_OPTS="-i ${SSH_KEY} -p ${SSH_PORT}"
REMOTE="${1:-root@77.42.1.116}"
REMOTE_DIR="/opt/drape-backend"

echo "🔨 Building TypeScript..."
npm run build

echo "📦 Syncing to ${REMOTE}:${REMOTE_DIR}..."
ssh ${SSH_OPTS} "$REMOTE" "mkdir -p ${REMOTE_DIR}"

rsync -avz --delete \
  --exclude node_modules \
  --include 'templates/***' \
  --exclude src \
  --exclude .git \
  --exclude .env \
  --exclude local-data \
  --exclude service-account-key.json \
  --exclude '*.ts' \
  ./ -e "ssh ${SSH_OPTS}" "${REMOTE}:${REMOTE_DIR}/"

echo "📥 Installing production deps on server..."
ssh ${SSH_OPTS} "$REMOTE" "cd ${REMOTE_DIR} && npm ci --omit=dev"

echo "🔄 Restarting backend..."
ssh ${SSH_OPTS} "$REMOTE" "systemctl restart drape-backend"
sleep 4

if ! ssh ${SSH_OPTS} "$REMOTE" "systemctl is-active --quiet drape-backend"; then
  echo "❌ Backend process did not start. Check logs:"
  ssh ${SSH_OPTS} "$REMOTE" "systemctl status drape-backend --no-pager -n 40 || tail -40 /var/log/drape-backend.log"
  exit 1
fi

echo "🔍 Verifying health..."
if curl -s --max-time 5 https://drape.info/health | grep -q 'ok'; then
  echo "✅ Deploy complete! Backend is healthy."
  echo "   URL:   https://drape.info"
  echo "   Logs:  ssh ${REMOTE} 'tail -f /var/log/drape-backend.log'"
else
  echo "❌ Backend failed to start. Check logs:"
  ssh ${SSH_OPTS} "$REMOTE" "tail -20 /var/log/drape-backend.log"
  exit 1
fi
