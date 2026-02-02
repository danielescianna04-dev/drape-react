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
ssh "$REMOTE" "cd ${REMOTE_DIR} && npm ci --production"

echo "🔄 Restarting backend..."
ssh "$REMOTE" "
  # Stop old process if running
  pkill -f 'node dist/index.js' || true
  sleep 1

  # Start new process with nohup
  cd ${REMOTE_DIR}
  nohup node dist/index.js > /var/log/drape-backend.log 2>&1 &

  sleep 2

  # Verify it's running
  if curl -s http://localhost:3001/health | grep -q 'ok'; then
    echo '✅ Backend is running!'
  else
    echo '❌ Backend failed to start. Check /var/log/drape-backend.log'
    tail -20 /var/log/drape-backend.log
    exit 1
  fi
"

echo ""
echo "✅ Deploy complete!"
echo "   Backend: http://${REMOTE#*@}:3001"
echo "   Health:  http://${REMOTE#*@}:3001/health"
echo "   Logs:    ssh ${REMOTE} 'tail -f /var/log/drape-backend.log'"
