# Bynot Ops Handbook

Come è fatta Bynot oggi (May 2026), come si lavora, come si deploya.

Setup precedente (Hetzner, dev/prod split, `./bynot` CLI, backend-ts) è **dismesso**. Vedi git history pre-cleanup se serve archeologia.

---

## 1. Architettura attuale

```
┌────────────────────────────────────────────┐
│ Bynot App (RN + Expo + iOS native)         │
│ Branch: v2/main                            │
│ Deploy: EAS OTA + TestFlight                │
└────────┬───────────────────────────────────┘
         │ HTTPS
         ↓
┌────────────────────────────────────────────┐
│ api.bynot.it (Netcup VPS)                  │
│ Express backend (backend-v2/)              │
│ Process: pm2 unit "bynot-backend"          │
│ Port: 3000 (dietro Caddy reverse proxy)    │
└────────┬───────────────────────────────────┘
         │ HTTP 127.0.0.1:4000
         ↓
┌────────────────────────────────────────────┐
│ opencode serve (systemd unit)              │
│ Provider: OpenRouter (configurato)         │
│ API key: env via systemd drop-in           │
└────────┬───────────────────────────────────┘
         │ HTTPS
         ↓
┌────────────────────────────────────────────┐
│ OpenRouter → DeepSeek V4-Pro (default)     │
│ Pricing: $0.435/$0.87 per M tokens         │
│ Billing: prepaid $5 + auto-recharge        │
└────────────────────────────────────────────┘
```

**Niente più dev/prod split lato backend.** Un solo Netcup, un solo deploy. Il "dev vs prod" è gestito client-side via `EXPO_PUBLIC_ENV` (Firebase project diverso).

---

## 2. Server Netcup

| | |
|---|---|
| Host SSH | `bynot-vps` (alias in `~/.ssh/config`) |
| IP | `89.58.27.238` |
| Specs | 8 vCPU ARM / 32 GB RAM / ~400 GB SSD |
| OS | Ubuntu (rolling) |
| Key | `~/.ssh/bynot_netcup` |
| API esposto | `https://api.bynot.it` |
| Reverse proxy | Caddy (HTTPS + auto-cert Let's Encrypt) |

Accesso:

```bash
ssh bynot-vps
# Stessa cosa di: ssh -i ~/.ssh/bynot_netcup root@89.58.27.238
```

### Cosa gira sul server

| Servizio | Manager | Path | Note |
|---|---|---|---|
| `bynot-backend` | pm2 | `/root/bynot/backend-v2` | Express + Supabase + opencode client |
| `opencode.service` | systemd | binary in `/root/.opencode/bin` | LLM gateway su 127.0.0.1:4000 |
| `caddy.service` | systemd | `/etc/caddy/` | HTTPS reverse proxy |
| `appwrite-*` (varie) | docker | `/root/appwrite` | Backend Appwrite self-hosted |

Status check:
```bash
ssh bynot-vps "pm2 status bynot-backend && systemctl status opencode --no-pager -n 5"
```

---

## 3. Backend deploy

Niente più script automatici. Workflow manuale ma semplice:

```bash
# 1. Sul tuo Mac
git push origin <branch>

# 2. SSH al Netcup
ssh bynot-vps

# 3. Pull + build + restart
cd /root/bynot
git fetch origin <branch> && git reset --hard FETCH_HEAD
cd backend-v2
npm install --no-audit --no-fund     # solo se package.json cambiato
npm run build
pm2 restart bynot-backend
sleep 3
curl -s https://api.bynot.it/health
```

Il branch attuale di produzione è `feat/vercel-ai-sdk-migration` (transizione in corso). Quando si stabilizza torna a `v2/main`.

### Logs

```bash
ssh bynot-vps "pm2 logs bynot-backend --lines 100 --nostream"
# oppure live:
ssh bynot-vps "pm2 logs bynot-backend"
```

### Restart manuale (se non hai cambi)

```bash
ssh bynot-vps "pm2 restart bynot-backend"
```

### .env

```bash
ssh bynot-vps "cat /root/bynot/backend-v2/.env"
```

Modifiche `.env` → `pm2 restart bynot-backend --update-env` per ricaricare.

Variabili chiave:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `OPENROUTER_API_KEY` (è la chiave OpenRouter — usata sia da backend-v2 che ereditata da opencode via systemd drop-in)
- `OPENCODE_API_URL=http://127.0.0.1:4000`
- `APPWRITE_*` (self-hosted appwrite)
- `STRIPE_*` (quando aggiungi paywall)

---

## 4. AI provider — OpenRouter + DeepSeek V4-Pro

Default model: `openrouter/deepseek/deepseek-v4-pro` (parseModel in `opencode-http.service.ts`).

### Setup OpenRouter (già fatto)

1. Account: openrouter.ai
2. Deposito $5 minimum (caricato)
3. API key in `/root/bynot/backend-v2/.env` come `OPENROUTER_API_KEY`
4. **systemd drop-in** propaga la key a opencode:
   ```
   /etc/systemd/system/opencode.service.d/openrouter-env.conf
   ```
   Contenuto:
   ```
   [Service]
   Environment="OPENROUTER_API_KEY=sk-or-v1-..."
   ```
5. opencode config: `/root/.config/opencode/opencode.jsonc` registra OpenRouter come provider con 356 modelli accessibili.

### Verificare che opencode veda OpenRouter

```bash
ssh bynot-vps "curl -s http://127.0.0.1:4000/config/providers | python3 -c 'import sys,json; print([p[\"id\"] for p in json.load(sys.stdin)[\"providers\"]])'"
# Output atteso: ['opencode', 'openrouter']
```

### Cambiare la key OpenRouter

```bash
# 1. Aggiorna .env backend
ssh bynot-vps "nano /root/bynot/backend-v2/.env"   # cambia OPENROUTER_API_KEY=...

# 2. Aggiorna drop-in systemd
ssh bynot-vps "nano /etc/systemd/system/opencode.service.d/openrouter-env.conf"

# 3. Reload + restart
ssh bynot-vps "systemctl daemon-reload && systemctl restart opencode && pm2 restart bynot-backend --update-env"
```

### Monitorare consumo

OpenRouter dashboard: https://openrouter.ai/credits

API:
```bash
curl -H "Authorization: Bearer $OPENROUTER_API_KEY" https://openrouter.ai/api/v1/auth/key
```

### Fallback chain (in `ai.routes.ts`)

Se DeepSeek V4-Pro fallisce/satura:
1. `openrouter/deepseek/deepseek-v4-flash` (cheaper)
2. `openrouter/qwen/qwen3-coder` (code-specialized)
3. `openrouter/google/gemma-4-31b-it:free` (free fallback)
4. `opencode/big-pickle` (Zen anonymous fallback)
5. `opencode/deepseek-v4-flash-free` (Zen fallback)

---

## 5. Frontend (Bynot app)

### Run locale

```bash
npm install                              # da fare una volta dopo clone
npx expo start --clear                   # Metro
# premi 'i' per simulatore iOS
```

L'app punta a `https://api.bynot.it` di default (vedi `src/config/config.ts`).

### Build + submit native

```bash
eas build --profile production --platform ios
eas submit --profile production --platform ios
```

### OTA (codice JS senza nuova binary)

```bash
EXPO_PUBLIC_ENV=production \
EXPO_PUBLIC_API_URL=https://api.bynot.it \
  eas update --channel production --message "msg"
```

`version` vs `runtimeVersion` regola invariata: bumpa `runtimeVersion` SOLO quando cambia il nativo (libs, Info.plist, permessi).

---

## 6. Git workflow

Branch attivo: `feat/vercel-ai-sdk-migration`. `v2/main` è la base storica.

```bash
git checkout feat/vercel-ai-sdk-migration
# edit
git add -A
git commit -m "..."
git push
```

Quando la migration è stabile, merge in `v2/main` e da lì si riparte.

PR-based se sei in team. Solo (Daniele): push diretto su branch attivo va bene per ora.

---

## 7. Supabase

Project: `pfejqyiakkywzdzfoxce` (Italy region).

| Tabella chiave | Note |
|---|---|
| `projects` | Progetti utente (id, user_id, name, template) |
| `ai_runs` | Log esecuzioni AI per analytics |
| `auth.users` | Gestita da Supabase Auth |

Service role key in `.env` come `SUPABASE_SERVICE_ROLE_KEY` (backend lato). Anon key esposta al client.

Dashboard: https://supabase.com/dashboard/project/pfejqyiakkywzdzfoxce

---

## 8. Scenari comuni

### Cambio una funzione backend, voglio deployare

```bash
git add -A && git commit -m "fix: ..."
git push
ssh bynot-vps "cd /root/bynot && git pull && cd backend-v2 && npm run build && pm2 restart bynot-backend"
```

### Vedo errori in produzione

```bash
ssh bynot-vps "pm2 logs bynot-backend --lines 200 --nostream"
```

Cerca per `Error:`, `error`, `ECONNREFUSED`, ecc.

### OpenRouter exhausted ($0 balance)

1. Top up su openrouter.ai/credits
2. Non serve restartare niente — la key resta valida

### opencode non risponde

```bash
ssh bynot-vps "systemctl restart opencode && sleep 5 && curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4000/"
```

### Voglio testare un modello AI diverso

Cambia in `backend-v2/src/services/opencode-http.service.ts:45` (`DEFAULT_MODEL`), oppure passa `model` esplicito nel body del POST.

I 356 modelli OpenRouter disponibili sono ad esempio:
- `openrouter/anthropic/claude-sonnet-4-7` ($$$)
- `openrouter/openai/gpt-5` ($$$)
- `openrouter/qwen/qwen3-coder` (cheaper, code-tuned)
- `openrouter/meta-llama/llama-3.3-70b-instruct:free` (free)

Lista completa: `curl https://openrouter.ai/api/v1/models`.

---

## 9. Troubleshooting

| Sintomo | Causa probabile | Fix |
|---|---|---|
| `Missing bearer token` su /agent/v2/chat | OK, auth richiesta — dall'app è transparente | usa header `Authorization: Bearer <supabase_token>` |
| Backend 502/503 | pm2 down o opencode down | `ssh bynot-vps "pm2 restart bynot-backend && systemctl restart opencode"` |
| `Missing Authentication header` da OpenRouter | env var non propagata | check `/etc/systemd/system/opencode.service.d/openrouter-env.conf` + `systemctl daemon-reload + restart opencode` |
| Costi OpenRouter sospetti | qualcuno usa l'API key | rotala su openrouter.ai/keys + aggiorna .env e systemd drop-in |
| App stuck su splash | Firebase token issue | re-login su app, controlla `googleServicesFile` in `app.config.ts` |
| Stream SSE si chiude prematuramente | nginx/Caddy timeout o pm2 timeout | check Caddy log: `ssh bynot-vps "journalctl -u caddy -n 50"` |
| `npm run build` errori TS | type drift dopo merge | `cd backend-v2 && npx tsc --noEmit` per vedere tutti gli errori |

---

## 10. Cheat-sheet

```bash
# Connettersi
ssh bynot-vps

# Deploy backend (sul mac)
git push && ssh bynot-vps "cd /root/bynot && git pull && cd backend-v2 && npm run build && pm2 restart bynot-backend"

# Logs live
ssh bynot-vps "pm2 logs bynot-backend"

# Health
curl https://api.bynot.it/health

# Restart services
ssh bynot-vps "pm2 restart bynot-backend"
ssh bynot-vps "systemctl restart opencode"
ssh bynot-vps "systemctl restart caddy"

# Frontend OTA
EXPO_PUBLIC_ENV=production EXPO_PUBLIC_API_URL=https://api.bynot.it \
  eas update --channel production --message "..."

# OpenRouter saldo
curl -H "Authorization: Bearer $OPENROUTER_API_KEY" https://openrouter.ai/api/v1/auth/key

# opencode providers/modelli
ssh bynot-vps "curl -s http://127.0.0.1:4000/config/providers | python3 -c 'import sys,json; d=json.load(sys.stdin); [print(p[\"id\"], len(p.get(\"models\") or {})) for p in d[\"providers\"]]'"
```

---

## 11. Cosa NON usare

Tutto quello che è stato rimosso nel cleanup del 2026-05-24:

- ❌ `backend-ts/` (era il vecchio backend, ora morto)
- ❌ `./bynot` script (era CLI per Hetzner, ora dismesso)
- ❌ `dev.bynot.it` / `bynot.it` (vecchi domini Hetzner)
- ❌ `update-dev.sh`, `update-prod.sh`, `deploy-backend.sh` (script Hetzner)
- ❌ Systemd unit `bynot-backend-dev` / `bynot-backend` separati (era setup Hetzner)
- ❌ Big-pickle / deepseek-v4-flash-free come default (sostituiti da DeepSeek V4-Pro via OpenRouter)
