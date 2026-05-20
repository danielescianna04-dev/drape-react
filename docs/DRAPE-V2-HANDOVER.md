# Drape v2 — Handover completo

**Data**: 20 maggio 2026
**Stato**: Produzione live
**Branch**: `v2/main`
**Repo**: `git@github-daniele:danielescianna04-dev/drape-react.git`

⚠️ **Questo documento contiene secrets.** È stato committato per scelta esplicita del proprietario. Considera che chiunque abbia accesso al repository ha accesso a tutta l'infrastruttura. Ruota le chiavi quando avrai utenti reali in produzione.

---

## 1. Sommario esecutivo

Drape v2 è un rebuild completo (frontend RN preservato, backend riscritto, stack DB sostituito) per ridurre i costi infrastrutturali da **140€/mese → 30€/mese (-79%)** e modernizzare lo stack.

### Stack finale

- **Frontend**: React Native + Expo (riusato)
- **Backend interno**: Supabase Cloud (auth, DB, storage)
- **Backend Drape**: Express + opencode su Netcup VPS ARM
- **DB per app utenti**: Appwrite self-hosted sullo stesso VPS
- **Preview**: Sandpack in WebView (client-side)
- **AI**: opencode 1.15.5 + Zen models (free tier)
- **Reverse proxy**: Caddy con Let's Encrypt automatico
- **Dominio**: bynot.it

### Costi finali

| Voce | Costo mese |
|---|---|
| Netcup VPS 4000 ARM G11 | €29.99 |
| Supabase Cloud (free) | €0 |
| Appwrite self-hosted (sul VPS) | €0 |
| opencode + Zen models (free tier) | €0 |
| Sandpack (client-side) | €0 |
| Cloudflare/GoDaddy DNS | €0 |
| Let's Encrypt | €0 |
| **TOTALE** | **€29.99** |

Vs vecchio Hetzner Drape (140€): **-79% (~110€ risparmiati al mese, ~1.320€/anno)**.

---

## 2. Infrastruttura

### 2.1 VPS Netcup

| Voce | Valore |
|---|---|
| Provider | Netcup (Germania) |
| Piano | VPS 4000 ARM G11 |
| Specs | 14 vCore ARM, 32 GB DDR4 ECC, 1 TB NVMe |
| Location | Nuremberg, Germania |
| IPv4 | `89.58.27.238` |
| IPv6 | `2a03:4000:62:872:b461:a6ff:fe5c:414b/64` |
| Hostname | `v2202605359913461349.quicksrv.de` |
| OS | Ubuntu 24.04 LTS arm64 (Minimal) |
| Costo | €29.99/mese (€384/anno) |
| Provisioning date | 20 maggio 2026 |
| Billing | Mensile, prossimo addebito 20 giugno 2026 |

### 2.2 Netcup Customer Control Panel (CCP)

- URL: https://www.customercontrolpanel.de
- **Customer number**: `371963`
- **Password CCP**: `@mZmn0@D9XjNM6Afs` (mai cambiata dopo signup)
- 2FA: ⚠️ non abilitata (consigliato abilitarla)

### 2.3 Netcup Server Control Panel (SCP)

- URL: https://www.servercontrolpanel.de
- Stesse credenziali del CCP (Customer number + password)
- Da qui: console VNC, install OS, snapshot, gestione network

### 2.4 SSH al VPS

**Chiave privata locale**: `~/.ssh/drape_netcup` (Mac di Daniele)
**Chiave pubblica caricata su Netcup SCP** come "daniele-mac":
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHdkY8E6uMREL6ZHj1nGxPajOM0/GsgDoCBIyMr39Z/6 daniele@drape-netcup
```

**Alias SSH config** in `~/.ssh/config`:
```
Host drape-vps
    HostName 89.58.27.238
    User root
    IdentityFile ~/.ssh/drape_netcup
    StrictHostKeyChecking accept-new
```

Connessione:
```bash
ssh drape-vps
# oppure
ssh -i ~/.ssh/drape_netcup root@89.58.27.238
```

**Root password originale Debian iniziale** (sostituita con SSH key, non più usabile):
`z03TSz81EbXvvYR` (per Debian, l'install Ubuntu non ha password — solo SSH key)

---

## 3. DNS — bynot.it (su GoDaddy)

Registrar: **GoDaddy**

| Record | Tipo | Valore | TTL |
|---|---|---|---|
| `bynot.it` | A | (WebsiteBuilder GoDaddy, default) | 1h |
| `www.bynot.it` | CNAME | `bynot.it.` | 1h |
| **`appwrite.bynot.it`** | **A** | **`89.58.27.238`** | **10 min** |
| **`api.bynot.it`** | **A** | **`89.58.27.238`** | **10 min** |
| `_domainconnect.bynot.it` | CNAME | GoDaddy interno | — |
| Nameservers | NS | ns81/ns82.domaincontrol.com (GoDaddy) | — |

**Custom domain Resend (futuri)** — quando configuri Resend SMTP, aggiungerai 3 record TXT/CNAME per SPF/DKIM/DMARC.

---

## 4. Supabase Cloud

**Region**: Frankfurt (EU)
**Plan**: Free

| Voce | Valore |
|---|---|
| Project URL | `https://pfejqyiakkywzdzfoxce.supabase.co` |
| Project Reference | `pfejqyiakkywzdzfoxce` |
| Database password | `Rotolone01#@` ⚠️ (mai ruotata, in chat history) |
| DB connection string | `postgresql://postgres:Rotolone01#@db.pfejqyiakkywzdzfoxce.supabase.co:5432/postgres` |

### 4.1 API Keys

**Publishable / Anon Key** (pubblica, OK nel client RN):
```
sb_publishable_Rg0fM6KPoq_Yq_Csk4IY4Q_FhSZLd1q
```

**Anon JWT** (formato vecchio, stessa identità):
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmZWpxeWlha2t5d3pkemZveGNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMDUzNzYsImV4cCI6MjA5NDc4MTM3Nn0.VXk2fuBTGO5ezi2c8HG9VnGpzxokDoG0oyFr_J3Y25A
```

**Service Role Key** (admin, server-side only, BYPASSA RLS):
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmZWpxeWlha2t5d3pkemZveGNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTIwNTM3NiwiZXhwIjoyMDk0NzgxMzc2fQ.lSPcFnDkIknPBAETe17sDWpejwjg_dX-VGI9KXOyimQ
```

### 4.2 Schema applicato

3 migration in `supabase/migrations/`:

| Migration | Cosa fa |
|---|---|
| `20260519200000_initial_schema.sql` | Schema base: profiles, projects, ai_sessions, ai_runs, files. RLS su tutte. Storage bucket `project-files`. Auto-create profile on signup. |
| `20260519201000_user_configs.sql` | Tabella user_configs (JSONB per credentials AI + preferences) |
| `20260519202000_git_accounts.sql` | Tabella git_accounts (provider OAuth tokens GitHub/GitLab/Bitbucket) |

### 4.3 Tabelle in DB

```
public.profiles         — estende auth.users (display_name, plan, ecc.)
public.projects         — app create dagli utenti Drape (+ appwrite_database_id)
public.ai_sessions      — sessioni chat agent per progetto
public.ai_runs          — turni agent (prompt, response, tokens, cost, tool_calls)
public.files            — metadata file di ogni progetto (storage_key in bucket)
public.user_configs     — credentials API keys + preferences (JSONB)
public.git_accounts     — github/gitlab/bitbucket OAuth tokens
storage.buckets         — bucket `project-files` (privato, 10MB max)
```

### 4.4 Comandi utili Supabase

```bash
# Login + link (una volta sola)
supabase login
supabase link --project-ref pfejqyiakkywzdzfoxce

# Push nuova migration
SUPABASE_DB_PASSWORD='Rotolone01#@' supabase db push

# Regen types TypeScript
SUPABASE_DB_PASSWORD='Rotolone01#@' supabase gen types typescript --linked > src/lib/supabase/database.types.ts

# Lista migrations applicate
SUPABASE_DB_PASSWORD='Rotolone01#@' supabase migration list --linked
```

---

## 5. Appwrite (self-hosted)

**Installato su**: Netcup VPS, in `/opt/appwrite`
**URL pubblica**: `https://appwrite.bynot.it`
**Versione**: 1.9.0
**Porte interne** (dietro Caddy): 8080 (HTTP), 8443 (HTTPS)

### 5.1 Console admin

- URL: `https://appwrite.bynot.it/console`
- **Account admin**: email `bynot.form@gmail.com` (alias di `bynotform@gmail.com`)
- **Password admin**: `Rotolone01#@##0` ⚠️ (in chat history)
- Organization: `Personal projects`

### 5.2 Project Drape

| Voce | Valore |
|---|---|
| Project name | `bynotos` |
| **Project ID** | **`6a0da2c80026f880f73e`** |
| Region | Frankfurt |
| Plan | Free (self-hosted = no limit) |

### 5.3 API Key (Server scope)

Name: `bynot-backend`
Expiration: Never
Scopes: All
**Value**:
```
standard_759b7ffd1a8614c3f4db7f282ffc6ddd398819795d22e54284c042906144bf201d20a03b2c338ceb6910926180e7399cfaf330956f92eb6dbd77c317eb29fb3f81402935ba5c78d8d024b13fd368cc8f2f0c6d7aa6c85437f278b4b2bf0d677e7a1289c69d18f4f92be58c8d80f7843ecc0c1a6eda35a0757fd9592082bef5d6
```

### 5.4 Stack Docker

25 container (Appwrite API + workers + MariaDB + Redis + InfluxDB + Traefik). File:

```
/opt/appwrite/.env             — Config completa (SMTP, secrets, ecc.)
/opt/appwrite/docker-compose.yml — 25 servizi
```

Comandi utili:
```bash
cd /opt/appwrite
docker compose ps                  # status
docker compose logs -f appwrite    # logs API
docker compose down                # stop
docker compose up -d               # restart
```

### 5.5 Pattern provisioning per utenti Drape

- 1 utente Drape → 1 database Appwrite logico (no overhead)
- Backend Drape crea il database via Management API (`appwriteManagementService.provisionUserDatabase`)
- Database ID format: `drape-user-{supabase_user_id_no_dashes}`
- Le credenziali pubbliche (endpoint + project_id) vanno nel codice generato dall'AI
- Il database_id isola l'utente

### 5.6 SMTP

⚠️ **Da configurare prima del lancio.** Senza SMTP, gli utenti non riceveranno email di verifica/recovery.

Setup Resend (raccomandato):
1. Signup https://resend.com (free 3k email/mese)
2. Add domain bynot.it → aggiungi 3 DNS records (SPF/DKIM/DMARC)
3. Crea API key
4. Edit `/opt/appwrite/.env`:
   ```
   _APP_SMTP_HOST=smtp.resend.com
   _APP_SMTP_PORT=465
   _APP_SMTP_SECURE=ssl
   _APP_SMTP_USERNAME=resend
   _APP_SMTP_PASSWORD=<resend-api-key>
   _APP_SYSTEM_EMAIL_ADDRESS=noreply@bynot.it
   ```
5. `cd /opt/appwrite && docker compose down && docker compose up -d`

---

## 6. Backend Drape v2

**Path sul VPS**: `/root/drape/backend-v2/`
**Process manager**: pm2 (autostart abilitato)
**Porta interna**: 3000 (dietro Caddy)
**URL pubblica**: `https://api.bynot.it`

### 6.1 Stack tecnologico

- Node.js 22.22.2
- Express 4.21.x
- TypeScript 5.5
- `@supabase/supabase-js` 2.106
- `node-appwrite` 17.x
- zod 3.23 per env validation

### 6.2 .env del backend

File: `/root/drape/backend-v2/.env` (chmod 600)

```bash
NODE_ENV=production
PORT=3000

# Supabase
SUPABASE_URL=https://pfejqyiakkywzdzfoxce.supabase.co
SUPABASE_ANON_KEY=sb_publishable_Rg0fM6KPoq_Yq_Csk4IY4Q_FhSZLd1q
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmZWpxeWlha2t5d3pkemZveGNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTIwNTM3NiwiZXhwIjoyMDk0NzgxMzc2fQ.lSPcFnDkIknPBAETe17sDWpejwjg_dX-VGI9KXOyimQ

# Appwrite (HTTP locale via /etc/hosts → 127.0.0.1)
APPWRITE_ENDPOINT=http://appwrite.bynot.it/v1
APPWRITE_PROJECT_ID=6a0da2c80026f880f73e
APPWRITE_API_KEY=standard_759b7ffd1a8614c3f4db7f282ffc6ddd398819795d22e54284c042906144bf201d20a03b2c338ceb6910926180e7399cfaf330956f92eb6dbd77c317eb29fb3f81402935ba5c78d8d024b13fd368cc8f2f0c6d7aa6c85437f278b4b2bf0d677e7a1289c69d18f4f92be58c8d80f7843ecc0c1a6eda35a0757fd9592082bef5d6

# CORS
CORS_ORIGINS=*

# opencode (locale)
OPENCODE_API_URL=http://127.0.0.1:4000
```

### 6.3 /etc/hosts sul VPS

`/etc/hosts` ha un'entry per far risolvere appwrite.bynot.it a localhost (evita TLS check su Node 22 fetch undici con cert auto-emesso):

```
127.0.0.1 appwrite.bynot.it
```

### 6.4 Endpoint del backend

| Path | Auth | Cosa fa |
|---|---|---|
| `GET /health` | no | Liveness: `{"ok":true,"service":"drape-backend-v2"}` |
| `GET /health/deep` | no | Verifica Supabase + Appwrite |
| `POST /api/appwrite/provision` | Bearer | Crea DB Appwrite per progetto utente |
| `POST /api/appwrite/collections` | Bearer | Crea collection con schema |
| `DELETE /api/appwrite/database/:projectId` | Bearer | Cleanup DB utente |
| `GET /api/appwrite/health` | no | Diagnostica Appwrite |
| `POST /api/agent/chat` | Bearer | SSE streaming chat opencode |
| `POST /api/agent/cancel` | Bearer | Cancella sessione attiva |
| `GET /api/agent/health` | no | Diagnostica opencode |
| `GET /api/files/:projectId` | Bearer | Lista file progetto |
| `POST /api/files/:projectId` | Bearer | Upload file |
| `GET /api/files/:projectId/content` | Bearer | Download file |
| `GET /api/files/:projectId/signed-url` | Bearer | URL firmato per Sandpack |
| `DELETE /api/files/:projectId` | Bearer | Cancella file/i |
| `GET /sandpack/*` | no | Bridge Sandpack HTML statico |

### 6.5 Comandi pm2

```bash
pm2 list                                    # vedi processi
pm2 logs drape-backend                      # logs in real-time
pm2 logs drape-backend --lines 100 --nostream  # ultime 100 linee
pm2 restart drape-backend --update-env      # restart (rilegge .env)
pm2 stop drape-backend                      # ferma
pm2 start drape-backend                     # avvia
pm2 monit                                   # monitoring TUI
pm2 save                                    # persisti lista processi
```

### 6.6 Update + redeploy backend

```bash
ssh drape-vps
cd /root/drape
git pull
cd backend-v2
npm install
npm run build
pm2 restart drape-backend --update-env
```

---

## 7. opencode

**Versione**: 1.15.5
**Path binario**: `/root/.opencode/bin/opencode`
**Service**: `systemctl` (`/etc/systemd/system/opencode.service`)
**Porta**: 4000 (solo localhost)

### 7.1 systemd service

File: `/etc/systemd/system/opencode.service`

```ini
[Unit]
Description=opencode server (Zen models)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root
Environment="PATH=/root/.opencode/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="HOME=/root"
ExecStart=/root/.opencode/bin/opencode serve --hostname 127.0.0.1 --port 4000 --log-level INFO
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=opencode

[Install]
WantedBy=multi-user.target
```

Comandi:
```bash
systemctl status opencode
systemctl restart opencode
journalctl -u opencode -f         # logs live
```

### 7.2 Modelli Zen disponibili (provider="opencode")

| Model ID | Tier | Note |
|---|---|---|
| `big-pickle` | Premium | Modello flagship Zen |
| `deepseek-v4-flash-free` | Free | Default, ottimo per code |
| `minimax-m2.5-free` | Free | Multimodale |
| `nemotron-3-super-free` | Free | NVIDIA fine-tuned |
| `qwen3.6-plus-free` | Free | Alibaba, ottimo coding |

Default in backend: `opencode/deepseek-v4-flash-free`.

### 7.3 API opencode usata dal backend

```
POST /session                            → crea sessione (returns ses_xxx)
POST /session/{sessionID}/message        → invia messaggio
GET  /event (SSE)                        → stream eventi globali (filtra per sessionID)
POST /session/{sessionID}/abort          → cancel
GET  /api/model                          → lista modelli (health check)
GET  /doc                                → OpenAPI spec (per debug)
```

### 7.4 Upgrade opencode

```bash
ssh drape-vps
/root/.opencode/bin/opencode upgrade
systemctl restart opencode
```

---

## 8. Caddy (reverse proxy + HTTPS)

**Versione**: 2.11.3
**Config**: `/etc/caddy/Caddyfile`
**Logs**: `/var/log/caddy/api.bynot.it.log` (JSON rotated)

### 8.1 Caddyfile completo

```
appwrite.bynot.it {
    encode zstd gzip
    reverse_proxy localhost:8080 {
        transport http {
            read_timeout 30m
            write_timeout 30m
        }
        header_up Host {host}
        header_up X-Forwarded-Proto https
    }
}

api.bynot.it {
    encode zstd gzip
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options nosniff
        Referrer-Policy no-referrer
    }
    log {
        output file /var/log/caddy/api.bynot.it.log {
            roll_size 100mb
            roll_keep 10
        }
        format json
    }
    @sse path /api/agent/chat
    handle @sse {
        reverse_proxy localhost:3000 {
            flush_interval -1
            transport http {
                read_timeout 30m
                write_timeout 30m
            }
        }
    }
    @sandpack path /sandpack/*
    handle @sandpack {
        header Cache-Control "public, max-age=3600"
        reverse_proxy localhost:3000
    }
    reverse_proxy localhost:3000 {
        transport http {
            read_timeout 5m
            write_timeout 5m
        }
    }
}
```

### 8.2 Certificati Let's Encrypt

- Emessi automaticamente al primo HTTPS hit
- Path certificati: gestiti da Caddy in `/var/lib/caddy/.local/share/caddy/`
- Auto-renew ogni ~60 giorni

### 8.3 Comandi Caddy

```bash
systemctl status caddy
systemctl reload caddy           # reload config senza downtime
journalctl -u caddy -f           # logs live
caddy validate --config /etc/caddy/Caddyfile
tail -f /var/log/caddy/api.bynot.it.log
```

---

## 9. Frontend RN (Expo)

**Repo**: stesso (`drape-react`)
**Branch v2**: `v2/main` (origin)
**Path locale Daniele**: `/Users/daniele/drape-react`

### 9.1 `.env.development.local`

File NON committato (gitignored). Contenuto attuale:

```
EXPO_PUBLIC_ENV=development
EXPO_PUBLIC_API_URL=https://api.bynot.it
EXPO_PUBLIC_WS_URL=wss://api.bynot.it
EXPO_PUBLIC_CODER_URL=https://api.bynot.it

EXPO_PUBLIC_SUPABASE_URL=https://pfejqyiakkywzdzfoxce.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_Rg0fM6KPoq_Yq_Csk4IY4Q_FhSZLd1q
```

### 9.2 Avvio dev

```bash
cd /Users/daniele/drape-react
npx expo start --clear      # --clear pulisce Metro cache
```

### 9.3 Componenti v2 chiave

| File | Cosa fa |
|---|---|
| `src/lib/supabase/client.ts` | Supabase JS client con AsyncStorage |
| `src/lib/supabase/auth.ts` | Helper auth (email/Apple/Google/Magic Link) |
| `src/lib/supabase/database.types.ts` | TypeScript types autogenerati |
| `src/lib/api/client.ts` | Wrapper fetch con Bearer token |
| `src/lib/api/appwriteApi.ts` | Client REST per backend Appwrite ops |
| `src/lib/api/filesApi.ts` | Client REST per file Supabase Storage |
| `src/core/auth/authStore.ts` | Zustand store auth (Supabase backed) |
| `src/features/preview/SandpackPreview.tsx` | WebView wrapper Sandpack |
| `src/features/preview/ConnectDatabaseButton.tsx` | UI provision DB Appwrite |
| `src/features/preview/useProvisionDatabase.ts` | Hook provisioning |

### 9.4 Build production OTA

```bash
eas update --branch production
# oppure
eas update --branch preview
```

### 9.5 Build native (quando cambi native deps)

```bash
eas build --platform ios --profile production
eas build --platform android --profile production
```

---

## 10. Procedure operative

### 10.1 Riavviare tutto lo stack sul VPS

```bash
ssh drape-vps

# Backend
pm2 restart drape-backend

# Appwrite
cd /opt/appwrite && docker compose restart

# opencode
systemctl restart opencode

# Caddy
systemctl reload caddy

# Stato di tutto
pm2 list
docker compose -f /opt/appwrite/docker-compose.yml ps
systemctl status opencode caddy
```

### 10.2 Backup completo

```bash
ssh drape-vps

# Backup MariaDB di Appwrite
cd /opt/appwrite
docker compose exec -T mariadb mysqldump --all-databases -uroot -p$(grep _APP_DB_ROOT_PASS .env | cut -d= -f2 | tr -d '"') > /var/backups/appwrite-$(date +%Y%m%d).sql

# Backup volumes Appwrite storage
tar czf /var/backups/appwrite-storage-$(date +%Y%m%d).tar.gz -C /var/lib/docker/volumes/ appwrite_appwrite-uploads appwrite_appwrite-functions

# Backup .env files
tar czf /var/backups/env-$(date +%Y%m%d).tar.gz /opt/appwrite/.env /root/drape/backend-v2/.env /etc/caddy/Caddyfile
```

Snapshot Hetzner: configurati settimanali su CCP Netcup (5€/mese opzionale).

### 10.3 Aggiungere nuova migration Supabase

```bash
# Sul Mac
cd /Users/daniele/drape-react

# Crea nuovo file
cat > supabase/migrations/$(date +%Y%m%d%H%M%S)_descrizione.sql << EOF
-- la tua SQL
EOF

# Apply
SUPABASE_DB_PASSWORD='Rotolone01#@' supabase db push

# Regen types
SUPABASE_DB_PASSWORD='Rotolone01#@' supabase gen types typescript --linked > src/lib/supabase/database.types.ts
```

### 10.4 Deploy modifiche backend

```bash
# Sul Mac
git push origin v2/main

# Sul VPS
ssh drape-vps
cd /root/drape && git pull
cd backend-v2 && npm install && npm run build
pm2 restart drape-backend --update-env
```

### 10.5 Monitoring rapido

```bash
ssh drape-vps

htop                                # RAM/CPU
docker stats                        # container Appwrite
pm2 monit                           # backend
df -h                               # disco
journalctl -u opencode -f           # opencode logs
journalctl -u caddy -f              # caddy logs
pm2 logs drape-backend              # backend logs
docker compose -f /opt/appwrite/docker-compose.yml logs -f --tail=50 appwrite
```

---

## 11. Decisioni architetturali principali

### 11.1 Perché self-host Appwrite (no Cloud)

- Cloud free tier: 2 progetti max, 1 database per progetto = inadeguato per scaling
- Cloud Pro: $25/mese minimo per progetto = troppo caro
- Self-host: zero limiti su DB count, controllo totale, ~zero overhead

### 11.2 Perché Supabase (no Firebase) per backend interno

- Postgres > Firestore per query complesse
- Open source, possibilità self-host futuro
- Tipi TypeScript autogenerati
- Auth migliore (Magic Link, OAuth EU-friendly)
- Real-time built-in

### 11.3 Perché Sandpack (no Docker workspace)

- Vecchio Drape: 1 container Docker per utente attivo = costo lineare
- Sandpack runa nel client (WebView) = compute lato utente = COSTO ZERO per noi
- Apple-safe (JS interpretato in WebKit, no native code download)
- Limitazione accettata: solo progetti frontend (no Python/backend custom)

### 11.4 Perché opencode + Zen (no direct API)

- opencode fornisce gateway unificato a multipli LLM provider
- Zen free tier: 4 modelli gratis (deepseek, qwen, nemotron, minimax)
- Premium opzionale (big-pickle) quando servisse modello migliore
- Niente API key utente da gestire
- Streaming SSE nativo

### 11.5 Perché Netcup (no Hetzner Cloud)

- Hetzner CAX31 ARM target era €19.51/mese, ma sold out in EU
- Netcup VPS 4000 ARM G11: 32 GB RAM, 1 TB NVMe, €29.99 — più potente, prezzo simile
- Storage abbondante (vs CX42 80 GB)
- DDR4 ECC RAM
- Affidabilità tedesca paragonabile

---

## 12. Storia commit v2 (cronologica)

```
69b392a feat(v2): init Supabase + initial schema migration
f27394f feat(v2): supabase client + auth helpers + rewritten authStore
39a6fd4 feat(v2): complete Firebase removal — full Supabase migration
60eeb5f fix(v2): remove leftover Firebase refs from App.tsx and dynamic imports
3b9ab32 feat(v2): Appwrite self-host architecture + setup scripts
86a701a feat(v2): backend-v2 scaffold + Appwrite Management service + opencode prompts
ec17387 feat(v2): backend agent route + opencode HTTP + supabase storage adapter
32f60c3 feat(v2): SandpackPreview RN + database provisioning UI + backend bridge
5653151 chore(v2): switch domain drape.info → bynot.it + provider Netcup ARM
abfba63 chore(v2): deploy artifacts backend — Caddy, systemd, Dockerfile
3ab7a51 fix(v2): aggiungi isInitialized + pending new user + stub workstationService
e8804bb feat(v2): real opencode HTTP protocol integration
```

12 commit principali. Working tree pulito.

---

## 13. Roadmap post-handover

### Da fare prima del lancio pubblico

1. **Ruotare tutti i secrets** (4 chiavi compromesse in chat):
   - Password CCP Netcup
   - Password DB Supabase
   - Service role Supabase
   - API key Appwrite
2. **Configurare SMTP Resend** in `/opt/appwrite/.env` per email verify/reset
3. **Test e2e mobile** completo (signup, crea progetto, chat AI, preview Sandpack)
4. **App Store resubmit** con descrizione "AI coding assistant"
5. **Configurare landing page** su `bynot.it` root (Cloudflare Pages o similar, free)
6. **Configurare backup automatico Appwrite MariaDB** via cron settimanale
7. **Enable 2FA** su account Netcup CCP

### Nice-to-have (v2.1+)

- Multi-region Appwrite cluster (per scaling >5k utenti attivi)
- Cifratura at-rest credenziali Appwrite (pgsodium / KMS)
- Push notifications via expo-notifications (token salvato in profiles)
- Analytics via PostHog
- Vercel AI Gateway come fallback se opencode Zen sale di prezzo
- Monitoring dashboard (Grafana / Uptime Kuma)
- CI/CD GitHub Actions per build + test su PR
- Mobile native build via EAS quando cambi native deps

### Fuori scope (per ora)

- Drape Pro paid tier (free per il lancio)
- Drape Mobile companion app
- Plugin marketplace
- White-label / multi-tenant

---

## 14. Troubleshooting comune

### App schermo nero su signup

Cache Metro vecchia. Fix:
```bash
npx expo start --clear
```

### Backend "fetch failed" verso Appwrite

`/etc/hosts` sul VPS deve avere:
```
127.0.0.1 appwrite.bynot.it
```
e `APPWRITE_ENDPOINT` deve essere `http://...` (non https).

### Email Appwrite non arrivano

SMTP non configurato. Vedi sez. 5.6.

### Let's Encrypt cert non si emette

DNS non propagato. Verifica:
```bash
dig +short api.bynot.it
# deve restituire 89.58.27.238
```

Se propagato e ancora niente cert: `journalctl -u caddy -f` per vedere errori ACME.

### "401 Unauthorized" su Appwrite

Routing protection o domain mismatch. Verifica `/opt/appwrite/.env`:
```
_APP_DOMAIN="appwrite.bynot.it"
_APP_OPTIONS_ROUTER_PROTECTION="disabled"
```
Restart: `cd /opt/appwrite && docker compose down && docker compose up -d`.

### Backend non parte dopo update

Controlla logs:
```bash
pm2 logs drape-backend --lines 50 --nostream
```
Spesso errore env mancante (zod validation fallisce).

---

## 15. Contatti e riferimenti

- **Owner**: Daniele Scianna
- **Repo**: https://github.com/danielescianna04-dev/drape-react (branch `v2/main`)
- **Netcup support**: mail@netcup.de
- **Supabase status**: https://status.supabase.com
- **Appwrite docs**: https://appwrite.io/docs
- **opencode docs**: https://opencode.ai/docs

---

**Fine documento.** Drape v2 è in produzione.
