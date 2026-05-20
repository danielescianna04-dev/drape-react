# Deploy backend-v2 sul VPS

Tre opzioni: **systemd** (consigliato), **Docker**, o **pm2**. Scegli una.

## Pre-requisiti VPS

- Hai eseguito `infra/appwrite/01-bootstrap.sh` (Docker + utente `drape`)
- Node.js 22 installato (`sudo apt install -y nodejs npm` o NVM)
- Caddy installato (vedi sezione HTTPS sotto)
- Repository Drape clonato in `/opt/drape`

```bash
sudo mkdir -p /opt/drape && sudo chown drape:drape /opt/drape
cd /opt/drape
git clone https://github.com/danielescianna04-dev/drape-react.git .
git checkout v2/main
```

## .env del backend

Crea `/opt/drape/backend-v2/.env` con:

```bash
NODE_ENV=production
PORT=3000

SUPABASE_URL=https://pfejqyiakkywzdzfoxce.supabase.co
SUPABASE_ANON_KEY=<from-supabase-dashboard>
SUPABASE_SERVICE_ROLE_KEY=<from-supabase-dashboard>

APPWRITE_ENDPOINT=https://appwrite.bynot.it/v1
APPWRITE_PROJECT_ID=drape-platform
APPWRITE_API_KEY=<from-appwrite-console>

CORS_ORIGINS=https://bynot.it,exp://

# Opencode (quando attivo)
# OPENCODE_API_URL=http://localhost:4000
# OPENCODE_API_KEY=
```

`chmod 600 .env` per restringere lettura.

## Build

```bash
cd /opt/drape/backend-v2
npm install
npm run build
```

## Opzione 1 — systemd (consigliata)

```bash
sudo cp /opt/drape/infra/backend/drape-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable drape-backend
sudo systemctl start drape-backend
sudo systemctl status drape-backend
```

Logs:
```bash
sudo journalctl -u drape-backend -f
```

Restart dopo update:
```bash
cd /opt/drape && git pull && cd backend-v2 && npm install && npm run build
sudo systemctl restart drape-backend
```

## Opzione 2 — Docker

```bash
cd /opt/drape
docker build -f infra/backend/Dockerfile -t drape-backend:latest backend-v2/
docker run -d \
  --name drape-backend \
  -p 3000:3000 \
  --env-file backend-v2/.env \
  --restart unless-stopped \
  drape-backend:latest

docker logs -f drape-backend
```

## Opzione 3 — pm2

```bash
sudo npm install -g pm2
cd /opt/drape/backend-v2
pm2 start dist/index.js --name drape-backend --time
pm2 startup     # genera comando per autostart su boot
pm2 save        # persisti lista processi
pm2 logs drape-backend
```

## HTTPS via Caddy

Installa Caddy:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

Copia Caddyfile:

```bash
sudo cp /opt/drape/infra/backend/Caddyfile /etc/caddy/Caddyfile
sudo mkdir -p /var/log/caddy && sudo chown caddy:caddy /var/log/caddy
sudo systemctl reload caddy
```

Caddy ottiene certificato Let's Encrypt automaticamente al primo hit HTTPS verso `api.bynot.it`.

Verifica:
```bash
curl https://api.bynot.it/health
# {"ok":true,"service":"drape-backend-v2"}
```

## Coesistenza con Appwrite

Appwrite ha il suo Traefik (porte 80/443) per `appwrite.bynot.it`.
Caddy NON deve girare sulla 80/443 — Appwrite le occupa già.

Soluzione: usa Caddy solo per `api.bynot.it`, configurando Appwrite Traefik per gestire **solo** il subdomain `appwrite.bynot.it` e lasciando il resto a Caddy.

In alternativa più semplice: **disabilita Caddy** e configura Appwrite Traefik per fare reverse proxy anche di `api.bynot.it` → `localhost:3000`. Vedi `infra/appwrite/traefik-extra.yml` (TODO).

Configurazione consigliata: **Caddy come reverse proxy unico** in front, e Appwrite usa porte interne non-pubbliche:

1. Modifica `/opt/appwrite/.env`:
   ```
   _APP_OPTIONS_FORCE_HTTPS=disabled
   ```
2. In `/opt/appwrite/docker-compose.yml`, cambia mapping porte:
   ```yaml
   appwrite:
     ports:
       - 8080:80   # invece di 80:80
   ```
3. Aggiungi a Caddyfile:
   ```
   appwrite.bynot.it {
       reverse_proxy localhost:8080 {
           transport http {
               read_timeout 30m
               write_timeout 30m
           }
       }
   }
   ```
4. `sudo systemctl reload caddy && cd /opt/appwrite && docker compose up -d`

## Update rolling deploy

```bash
cd /opt/drape
git pull
cd backend-v2
npm install
npm run build
sudo systemctl restart drape-backend    # zero-downtime se sistema regge: <1s di interruzione
```

## Monitoring veloce

```bash
# RAM/CPU
htop
# Backend logs live
sudo journalctl -u drape-backend -f
# Appwrite logs
cd /opt/appwrite && docker compose logs -f --tail=50
# Disk
df -h
# Caddy access logs
sudo tail -f /var/log/caddy/api.bynot.it.log
```
