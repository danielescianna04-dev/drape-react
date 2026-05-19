# Appwrite self-hosted setup per Drape v2

VPS target: **Netcup VPS 4000 ARM G11** (Nuremberg), Ubuntu 24.04 LTS ARM (arm64).
Lo stack è compatibile sia x86 sia ARM — Appwrite pubblica immagini multi-arch.

## Pre-requisiti

1. Hetzner CX42 acquistato + IP assegnato
2. DNS configurato:
   - `appwrite.drape.info` → A record verso IP del VPS
   - `api.drape.info` → A record verso IP del VPS (per backend Drape)
3. SSH access come root (chiave pubblica caricata su Hetzner)
4. Account SMTP per email transazionali (Resend free / SendGrid / Mailgun)

## Setup iniziale VPS (script `01-bootstrap.sh`)

Esegui sul VPS appena provisionato:

```bash
ssh root@<vps-ip>
curl -fsSL https://raw.githubusercontent.com/danielescianna04-dev/drape-react/v2/main/infra/appwrite/01-bootstrap.sh | bash
```

Oppure copia manualmente lo script `01-bootstrap.sh` da questa cartella.

Lo script:
- Aggiorna OS
- Installa Docker + Docker Compose
- Installa fail2ban + ufw (firewall)
- Apre porte 22, 80, 443
- Crea utente `drape` non-root

## Installazione Appwrite (`02-install-appwrite.sh`)

```bash
ssh drape@<vps-ip>
bash 02-install-appwrite.sh
```

Lo script:
- Crea `/opt/appwrite`
- Lancia il wizard ufficiale `docker run -it --rm appwrite/appwrite:latest`
- Wizard chiede:
  - Domain: `appwrite.drape.info`
  - HTTP port: `80`
  - HTTPS port: `443`
  - Secret key: auto-generato (lo salva in `.env`)
  - DNS target: `appwrite.drape.info`

Dopo il wizard, modifica `/opt/appwrite/.env`:

```bash
# Email SMTP (obbligatorio per signup/recovery email)
_APP_SMTP_HOST=smtp.resend.com
_APP_SMTP_PORT=465
_APP_SMTP_SECURE=ssl
_APP_SMTP_USERNAME=resend
_APP_SMTP_PASSWORD=<resend-api-key>
_APP_SYSTEM_EMAIL_ADDRESS=noreply@drape.info
_APP_SYSTEM_EMAIL_NAME=Drape

# Storage limits
_APP_STORAGE_LIMIT=10485760           # 10 MB per file upload

# Security
_APP_OPTIONS_FORCE_HTTPS=enabled
_APP_OPTIONS_ABUSE=enabled

# Workers (CX42 ha 8 vCPU, lasciamo headroom)
_APP_WORKER_PER_CORE=4
```

Riavvia stack:
```bash
cd /opt/appwrite
docker compose down
docker compose up -d
```

## Configurazione Drape platform project

1. Apri `https://appwrite.drape.info/console` nel browser
2. Crea account admin con la email che possiedi
3. Crea organizzazione `Drape`
4. Crea progetto `drape-platform`
5. Annota Project ID
6. Settings → API Keys → Create API Key:
   - Name: `drape-backend-management`
   - Expiration: Never
   - Scopes: select all (users, teams, databases, collections, attributes, indexes, documents, files, buckets, functions, health)
7. Copia API key (mostrata una sola volta)

## Variabili .env per backend Drape

Aggiungi al `.env` del backend Drape (NON commit, NON in chat):

```bash
APPWRITE_ENDPOINT=https://appwrite.drape.info/v1
APPWRITE_PROJECT_ID=drape-platform
APPWRITE_API_KEY=<server-api-key>
```

## Verifica health

```bash
curl https://appwrite.drape.info/v1/health
# Deve restituire {"name":"appwrite","status":"pass","version":"..."}
```

## Backup

Snapshot Hetzner settimanali (5€/mese opzionale, ma consigliato).
Backup MariaDB extra (manuale settimanale):

```bash
cd /opt/appwrite
docker compose exec mariadb mysqldump --all-databases -uroot -p<password> > /var/backups/appwrite-$(date +%Y%m%d).sql
```

## Troubleshooting

| Problema | Soluzione |
|---|---|
| Wizard non parte | Verifica DNS già propagato (`dig appwrite.drape.info`) |
| Email non arrivano | Controlla `_APP_SMTP_*` in `/opt/appwrite/.env` + restart |
| 502 Bad Gateway | `docker compose logs appwrite` per vedere errori |
| Slow performance | `docker stats` — se MariaDB satura RAM, upgrade CX52 |
| SSL non funziona | Aspetta 5-10 min, Let's Encrypt auto-genera certs al primo hit HTTPS |
