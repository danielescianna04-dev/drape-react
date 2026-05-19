#!/bin/bash
# Installa Appwrite self-hosted in /opt/appwrite.
# Esegui come utente `drape` dopo 01-bootstrap.sh.

set -euo pipefail

APPWRITE_DIR="/opt/appwrite"
DOMAIN_DEFAULT="appwrite.bynot.it"

echo "[1/3] Crea directory $APPWRITE_DIR..."
sudo mkdir -p "$APPWRITE_DIR"
sudo chown drape:drape "$APPWRITE_DIR"
cd "$APPWRITE_DIR"

echo ""
echo "[2/3] Lancio wizard ufficiale Appwrite..."
echo "Risposte consigliate:"
echo "  - HTTP port: 80"
echo "  - HTTPS port: 443"
echo "  - Secret key: lascia auto-generato (premi invio)"
echo "  - DNS target / domain: $DOMAIN_DEFAULT"
echo ""
read -p "Premi invio per partire..."

docker run -it --rm \
  --volume /var/run/docker.sock:/var/run/docker.sock \
  --volume "$(pwd)":/usr/src/code/appwrite:rw \
  --entrypoint="install" \
  appwrite/appwrite:latest

echo ""
echo "[3/3] Setup post-wizard..."
echo ""
echo "Configura SMTP (Resend/SendGrid) editando .env:"
echo "  sudo nano $APPWRITE_DIR/.env"
echo ""
echo "Aggiorna queste righe:"
cat <<'EOF'
  _APP_SMTP_HOST=smtp.resend.com
  _APP_SMTP_PORT=465
  _APP_SMTP_SECURE=ssl
  _APP_SMTP_USERNAME=resend
  _APP_SMTP_PASSWORD=<la-tua-resend-api-key>
  _APP_SYSTEM_EMAIL_ADDRESS=noreply@bynot.it
  _APP_OPTIONS_FORCE_HTTPS=enabled
  _APP_STORAGE_LIMIT=10485760
  _APP_WORKER_PER_CORE=4
EOF

echo ""
echo "Poi riavvia: cd $APPWRITE_DIR && docker compose down && docker compose up -d"
echo ""
echo "Quando online, apri https://$DOMAIN_DEFAULT/console nel browser per creare admin e progetto."
