#!/bin/bash
# =============================================================================
# Setup DEV environment on Hetzner server
# Run this ONCE: ssh root@77.42.1.116 < scripts/setup-dev-env.sh
# =============================================================================
set -euo pipefail

echo "=== Setting up Drape DEV environment ==="

# 1. Create directory
mkdir -p /opt/drape-backend-dev
echo "✅ Created /opt/drape-backend-dev"

# 2. Create .env for dev (EDIT THESE VALUES)
if [ ! -f /opt/drape-backend-dev/.env ]; then
  cat > /opt/drape-backend-dev/.env << 'ENVEOF'
# === DRAPE DEV ENVIRONMENT ===
NODE_ENV=development
PORT=3002

# Firebase — DEV project (create at console.firebase.google.com)
# FIREBASE_SERVICE_ACCOUNT_PATH=/opt/drape-backend-dev/service-account-key.json

# Neon — DEV org/project
# NEON_API_KEY=your-dev-neon-api-key
# NEON_ORG_ID=your-dev-neon-org-id

# AI providers (same keys as prod, or separate)
# ANTHROPIC_API_KEY=
# GOOGLE_AI_API_KEY=
# OPENAI_API_KEY=

# Docker
PROJECTS_ROOT=/data/projects-dev
WORKSPACE_IMAGE=drape-workspace:latest
CONTAINER_MEMORY_MB=512
CONTAINER_CPUS=1

# Public URL
PUBLIC_URL=https://dev.drape.info
ENVEOF
  echo "✅ Created /opt/drape-backend-dev/.env (EDIT IT with real values!)"
else
  echo "⏭️  .env already exists, skipping"
fi

# 3. Create projects directory for dev
mkdir -p /data/projects-dev
chown -R 1000:1000 /data/projects-dev
echo "✅ Created /data/projects-dev"

# 4. Create systemd service
cat > /etc/systemd/system/drape-backend-dev.service << 'SVCEOF'
[Unit]
Description=Drape Backend DEV
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=/opt/drape-backend-dev
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
EnvironmentFile=/opt/drape-backend-dev/.env
StandardOutput=append:/var/log/drape-backend-dev.log
StandardError=append:/var/log/drape-backend-dev.log

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable drape-backend-dev
echo "✅ Created systemd service drape-backend-dev"

# 5. Create log file
touch /var/log/drape-backend-dev.log
echo "✅ Created /var/log/drape-backend-dev.log"

# 6. Add Nginx config for dev.drape.info
if [ -d /etc/nginx/sites-available ]; then
  cat > /etc/nginx/sites-available/dev.drape.info << 'NGXEOF'
server {
    listen 80;
    server_name dev.drape.info;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
NGXEOF

  ln -sf /etc/nginx/sites-available/dev.drape.info /etc/nginx/sites-enabled/
  nginx -t && nginx -s reload
  echo "✅ Nginx configured for dev.drape.info"
  echo "   Run: certbot --nginx -d dev.drape.info (after DNS is set up)"
elif command -v caddy &> /dev/null; then
  echo "⚠️  Caddy detected — add dev.drape.info to Caddyfile manually"
else
  echo "⚠️  No Nginx or Caddy found — configure reverse proxy manually"
fi

echo ""
echo "=== DEV environment setup complete ==="
echo ""
echo "Next steps:"
echo "1. Edit /opt/drape-backend-dev/.env with real values"
echo "2. Point dev.drape.info DNS to 77.42.1.116"
echo "3. Run: certbot --nginx -d dev.drape.info"
echo "4. Copy service-account-key.json for dev Firebase project"
echo "5. Deploy: ./deploy-dev.sh"
