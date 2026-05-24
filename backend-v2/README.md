# Bynot backend v2

Express + Supabase Admin + Appwrite (self-hosted) Management. No Docker workspaces.

## Stack
- Express 4 + TypeScript
- Supabase Admin SDK (Bynot internal: auth, profiles, projects, files metadata)
- node-appwrite SDK (provisioning DB utenti su Appwrite self-hosted)
- Zod per env validation

## Setup

```bash
cd backend-v2
npm install
cp .env.example .env
# Riempi i valori in .env (non committare)
npm run dev
```

## Endpoints

| Path | Auth | Scopo |
|---|---|---|
| `GET /health` | no | Liveness check |
| `GET /health/deep` | no | Verifica Supabase + Appwrite raggiungibili |
| `POST /api/appwrite/provision` | yes | Provisiona Appwrite DB per progetto utente |
| `POST /api/appwrite/collections` | yes | Crea collection dichiarativa |
| `DELETE /api/appwrite/database/:projectId` | yes | Cancella DB Appwrite del progetto |
| `GET /api/appwrite/health` | no | Health Appwrite |

## Env required

Vedi `.env.example`. I valori sensibili da non committare:
- `SUPABASE_SERVICE_ROLE_KEY` — bypassa RLS, super-power
- `APPWRITE_API_KEY` — server key Appwrite, accesso admin

## Deploy

Target: VPS Netcup VPS 4000 ARM G11. Esegui via `npm run build && npm start` dietro a Traefik/Caddy che termina HTTPS.

TODO v2.1:
- pm2 ecosystem.config per process management
- Dockerfile multi-stage build (opzionale, può girare anche bare-metal)
- Health check endpoint che pinga anche opencode quando attivo
