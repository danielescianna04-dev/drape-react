#!/bin/bash
# =============================================================================
# Deploy backend-ts to Hetzner
# Usage: ./deploy.sh [user@host]
# =============================================================================
set -euo pipefail

REMOTE="${1:-root@77.42.1.116}"
REMOTE_DIR="/opt/drape-backend"

echo "🔨 Building TypeScript..."
npm run build

echo "📦 Syncing to ${REMOTE}:${REMOTE_DIR}..."
ssh "$REMOTE" "mkdir -p ${REMOTE_DIR}"

rsync -avz --delete \
  --exclude node_modules \
  --exclude src \
  --exclude .git \
  --exclude '*.ts' \
  ./ "${REMOTE}:${REMOTE_DIR}/"

echo "📥 Installing production deps on server..."
ssh "$REMOTE" "cd ${REMOTE_DIR} && npm ci --omit=dev"

echo "🔄 Stopping old backend..."
ssh "$REMOTE" "pkill -f 'node dist/index.js' || true"
sleep 2

echo "🚀 Starting new backend..."
ssh "$REMOTE" "cd ${REMOTE_DIR} && nohup node dist/index.js > /var/log/drape-backend.log 2>&1 &"
sleep 3

echo "🔍 Verifying health..."
if curl -s --max-time 5 https://drape.info/health | grep -q 'ok'; then
  echo "✅ Deploy complete! Backend is healthy."
  echo "   URL:   https://drape.info"
  echo "   Logs:  ssh ${REMOTE} 'tail -f /var/log/drape-backend.log'"
else
  echo "❌ Backend failed to start. Check logs:"
  ssh "$REMOTE" "tail -20 /var/log/drape-backend.log"
  exit 1
fi
