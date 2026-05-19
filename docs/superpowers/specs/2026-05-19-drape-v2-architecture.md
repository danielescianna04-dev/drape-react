# Drape v2 — Architecture (rebuild from scratch)

**Data**: 19 maggio 2026
**Branch**: `v2/main`
**Stato**: in implementazione

---

## Decisioni confermate

### Stack
- **Frontend**: React Native + Expo (riutilizzato 80%)
- **Drape backend**: Express + opencode su Hetzner (no Docker workspaces)
- **Drape internal DB**: Supabase Cloud (auth, profiles, projects, files metadata)
- **User-generated apps DB**: **Appwrite self-hosted su Hetzner CX42**
- **Preview**: Sandpack in WebView (client-side)

### Infrastruttura Hetzner

**Setup unificato CX42** (8 vCPU, 16 GB RAM, 80 GB SSD — 24€/mese):
- Drape Express backend
- opencode serve
- Appwrite Docker stack (self-hosted)
- Reverse proxy Traefik o Nginx

**Capacità realistica:** 300-600 utenti registrati, ~100 concorrenti attivi.

**Scaling path:** 
- A 600+ utenti: aggiungi Hetzner Volume 100GB (+5€/mese)
- A 1000+ utenti: upgrade CX52 (48€/mese) o split su 2 VPS
- A 5000+ utenti: cluster Appwrite multi-node

### Provisioning utenti
- 1 utente Drape = 1 database Appwrite (logical, no overhead)
- Magic Link Supabase per signup (Appwrite invisibile all'utente)
- Backend Drape gestisce provisioning via Appwrite Node SDK + API key Server

---

## Architettura

```
[App RN / Expo]
  ├─ Supabase JS (auth + DB + storage Drape)
  ├─ <SandpackPreview> in WebView (preview client-side)
  └─ Appwrite JS SDK (chiamato dal codice generato dall'AI)
         ↓
[Hetzner CX42] (24€/mese)
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
  └─ Drape internal (auth, profiles, projects, files, ai_*)
```

DNS:
- `api.drape.info` → Drape Express backend (porta interna 3000)
- `appwrite.drape.info` → Appwrite Docker stack (porta interna 80)

---

## Migrations Supabase applicate

```
20260519200000_initial_schema      profiles, projects, ai_sessions, ai_runs, files + RLS
20260519201000_user_configs        credentials JSONB + preferences JSONB
20260519202000_git_accounts        provider OAuth tokens per utente
```

---

## Self-host Appwrite — overview

Appwrite si distribuisce come Docker Compose stack ufficiale.

### Pre-requisiti VPS
- Hetzner CX42 con Docker installato
- Sottodominio `appwrite.drape.info` con record A pointing al VPS
- Porte aperte: 80, 443

### Setup (eseguito una volta sul VPS)

```bash
# Su VPS Hetzner
ssh root@<vps-ip>
mkdir -p /opt/appwrite && cd /opt/appwrite

# Download stack ufficiale
docker run -it --rm \
  --volume /var/run/docker.sock:/var/run/docker.sock \
  --volume "$(pwd)":/usr/src/code/appwrite:rw \
  --entrypoint="install" \
  appwrite/appwrite:latest

# Domande wizard: domain appwrite.drape.info, email admin, ecc.
```

### Configurazione critica (`.env` di Appwrite)
- `_APP_DOMAIN=appwrite.drape.info`
- `_APP_DOMAIN_TARGET=appwrite.drape.info`
- `_APP_SYSTEM_EMAIL_ADDRESS=admin@drape.info`
- `_APP_STORAGE_DEVICE=local`
- `_APP_STORAGE_LIMIT=10485760` (10 MB per file)
- `_APP_SMTP_HOST=...` per email transazionali
- `_APP_OPENSSL_KEY_V1=<segreto-32-char>` (genera con `openssl rand -hex 16`)

### Setup admin + Drape internal project
1. Vai a `https://appwrite.drape.info/console`
2. Crea account admin (mail + password)
3. Crea organizzazione "Drape"
4. Crea progetto "drape-platform" 
5. Settings → API Keys → crea Server key con scopes:
   - users, teams, databases, collections, attributes, indexes, documents, files, buckets

---

## Backend integration

### Variabili .env backend Drape
```
SUPABASE_URL=https://pfejqyiakkywzdzfoxce.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<from-supabase-dashboard>

APPWRITE_ENDPOINT=https://appwrite.drape.info/v1
APPWRITE_PROJECT_ID=drape-platform
APPWRITE_API_KEY=<server-api-key-from-self-hosted>
```

### Servizio: `appwrite-management.service.ts`
- `provisionUserDatabase(userId, projectId)` → crea database Appwrite per progetto utente
- `seedCollections(databaseId, schema[])` → crea collection base (todo, blog, ecc.)
- `revokeUserDatabase(userId, projectId)` → cleanup quando utente cancella progetto
- `getUserDatabaseId(supabaseProjectId)` → lookup mapping

### Mapping Drape project ↔ Appwrite database
In Supabase `projects` table:
- `appwrite_database_id` text
- `appwrite_endpoint` text (sempre = `https://appwrite.drape.info/v1`)
- `appwrite_project_id` text (sempre = `drape-platform`)

Le credenziali per il **client Appwrite generato** (nel codice utente) sono pubbliche: endpoint + project_id. L'utente legge/scrive sul SUO database via permissions Appwrite.

---

## Permissions Appwrite per isolamento

Ogni database creato per un utente Drape ha:
- Collection permissions: solo l'auth Appwrite user_id corrispondente può leggere/scrivere
- Magic flow: il backend Drape crea anche un "Appwrite user" che mappa al supabase user_id, e gli dà accesso al database

Alternative più semplice: tutto pubblico (database accessibili da chiunque conosce il `database_id`). Per MVP: si parte così. Per v2.1: aggiungi auth Appwrite user.

---

## Out of scope

- IAP (rimandato post-PMF, plan free per ora)
- Push notifications (stub, todo expo-notifications)
- Analytics (stub, todo PostHog)
- Backend backup automatico (todo Hetzner backup snapshots manuali settimanali)
- Multi-region (singolo VPS Falkenstein per ora)
- Backend Appwrite cifratura at-rest (todo, v2.1)
