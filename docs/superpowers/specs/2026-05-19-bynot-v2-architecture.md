# Bynot v2 — Architecture (rebuild from scratch)

**Data**: 19 maggio 2026
**Branch**: `v2/main`
**Stato**: in implementazione
**Domain**: `bynot.it` (landing + app), subdomain `api.bynot.it` e `appwrite.bynot.it`

---

## Decisioni confermate

### Stack
- **Frontend**: React Native + Expo (riutilizzato 80%)
- **Bynot backend**: Express + opencode su Netcup VPS (no Docker workspaces)
- **Bynot internal DB**: Supabase Cloud (auth, profiles, projects, files metadata)
- **User-generated apps DB**: **Appwrite self-hosted su Netcup VPS 4000 ARM G11**
- **Preview**: Sandpack in WebView (client-side)
- **Domain**: bynot.it (landing + subdomain Bynot app)

### Infrastruttura VPS

**Setup unificato Netcup VPS 4000 ARM G11** (14 ARM cores, 32 GB RAM, 1 TB NVMe — €29.99/mese):
- Bynot Express backend
- opencode serve
- Appwrite Docker stack (self-hosted)
- Reverse proxy Traefik o Caddy

**Capacità realistica:** 500-1.000 utenti registrati, ~150-200 concorrenti attivi.

**Scaling path:**
- A 1.000+ utenti: cluster Appwrite multi-node (split DB su VPS dedicato)
- A 5.000+ utenti: dedicated MariaDB managed + Appwrite cluster

### Provisioning utenti
- 1 utente Bynot (un progetto) = 1 database Appwrite (logical, no overhead)
- Auth utente Bynot su Supabase (Magic Link / email / Google / Apple)
- Provisioning Appwrite trasparente via backend Bynot (Server API key)

---

## Architettura

```
[App RN / Expo]
  ├─ Supabase JS (auth + DB + storage Bynot)
  ├─ <SandpackPreview> in WebView (preview client-side)
  └─ Appwrite JS SDK (chiamato dal codice generato dall'AI)
         ↓
[Netcup VPS 4000 ARM G11] (€29.99/mese)
  ├─ Express + opencode      (porta 3000, dietro Traefik)
  ├─ Appwrite Docker stack    (porta 80/443 su sottodominio)
  │   ├─ Appwrite API
  │   ├─ MariaDB (storage logico databases utenti)
  │   ├─ Redis (cache + queue)
  │   ├─ InfluxDB (telemetry)
  │   └─ Workers (builds, mail, functions, ecc.)
  └─ Traefik (reverse proxy + SSL automatico)
         ↓
[Supabase Cloud free]
  └─ Bynot internal (auth, profiles, projects, files, ai_*)
```

DNS:
- `bynot.it` → landing page (statica, Cloudflare Pages o equivalente)
- `api.bynot.it` → Bynot Express backend (porta interna 3000)
- `appwrite.bynot.it` → Appwrite Docker stack (porta interna 80)

---

## Migrations Supabase applicate

```
20260519200000_initial_schema      profiles, projects, ai_sessions, ai_runs, files + RLS
20260519201000_user_configs        credentials JSONB + preferences JSONB
20260519202000_git_accounts        provider OAuth tokens per utente
```

---

## Self-host Appwrite — overview

Appwrite si distribuisce come Docker Compose stack ufficiale, compatibile multi-arch (amd64 + arm64).

### Pre-requisiti VPS
- Netcup VPS 4000 ARM G11 con Docker installato (vedi `infra/appwrite/01-bootstrap.sh`)
- Sottodominio `appwrite.bynot.it` con record A pointing al VPS
- Porte aperte: 80, 443

### Setup (eseguito una volta sul VPS)

```bash
ssh root@<vps-ip>
bash 01-bootstrap.sh

ssh bynot@<vps-ip>
bash 02-install-appwrite.sh
# Wizard chiede domain: appwrite.bynot.it
```

### Configurazione critica (`.env` di Appwrite)
- `_APP_DOMAIN=appwrite.bynot.it`
- `_APP_DOMAIN_TARGET=appwrite.bynot.it`
- `_APP_SYSTEM_EMAIL_ADDRESS=noreply@bynot.it`
- `_APP_STORAGE_DEVICE=local`
- `_APP_STORAGE_LIMIT=10485760` (10 MB per file)
- `_APP_SMTP_*` per email transazionali (Resend free / SendGrid)
- `_APP_OPENSSL_KEY_V1=<segreto-32-char>`

### Setup admin + Bynot internal project
1. Vai a `https://appwrite.bynot.it/console`
2. Crea account admin (mail + password)
3. Crea organizzazione "Bynot"
4. Crea progetto "bynot-platform"
5. Settings → API Keys → crea Server key con scopes:
   - users, teams, databases, collections, attributes, indexes, documents, files, buckets

---

## Backend integration

### Variabili .env backend Bynot
```
SUPABASE_URL=https://pfejqyiakkywzdzfoxce.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<from-supabase-dashboard>

APPWRITE_ENDPOINT=https://appwrite.bynot.it/v1
APPWRITE_PROJECT_ID=bynot-platform
APPWRITE_API_KEY=<server-api-key-from-self-hosted>

CORS_ORIGINS=https://bynot.it,exp://*
```

### Servizio: `appwrite-management.service.ts`
- `provisionUserDatabase(userId, projectId)` → crea database Appwrite per progetto utente
- `createCollection(databaseId, schema)` → crea collection con attr/index dichiarativi
- `deleteUserDatabase(databaseId)` → cleanup quando utente cancella progetto
- `health()` → check connessione Appwrite

### Mapping Bynot project ↔ Appwrite database
In Supabase `projects` table:
- `appwrite_database_id` text
- `appwrite_endpoint` text (sempre = `https://appwrite.bynot.it/v1`)
- `appwrite_project_id` text (sempre = `bynot-platform`)

Le credenziali per il **client Appwrite generato** (nel codice utente) sono pubbliche: endpoint + project_id. Il database_id isola l'utente.

---

## Permissions Appwrite per isolamento

Ogni database creato per un utente Bynot ha:
- Collection permissions: per MVP — pubbliche (chiunque conosce database_id può leggere/scrivere)
- v2.1: aggiunge auth Appwrite user mappato a supabase user_id per restringere accesso

---

## Out of scope (post-PMF)

- IAP / paid tier (Bynot free per il lancio)
- Push notifications (stub, todo expo-notifications)
- Analytics (stub, todo PostHog)
- Backup automatico Appwrite MariaDB (todo cron settimanale)
- Multi-region (singolo VPS Nuremberg per ora)
- Cifratura at-rest credenziali Appwrite (todo, v2.1)

---

## Sintesi costi mensili

| Servizio | Costo |
|---|---|
| Netcup VPS 4000 ARM G11 (Bynot backend + Appwrite + opencode) | €29.99 |
| Supabase Cloud (free) | €0 |
| Sandpack (client-side) | €0 |
| Cloudflare DNS + Pages landing (free) | €0 |
| Resend SMTP (free tier 3k/mese) | €0 |
| **Totale baseline** | **€30/mese** |

**Vs Bynot originale (Hetzner 140€): -78%.**
