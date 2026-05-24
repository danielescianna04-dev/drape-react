# Bynot — Guida Deploy & OTA

## Struttura Branch

| Branch | Ambiente | Bundle ID | API | TestFlight App |
|--------|----------|-----------|-----|----------------|
| `main` | Produzione | `com.bynot.app` | `https://bynot.it` | **Bynot** |
| `dev` | Sviluppo | `com.bynot.app.dev` | `https://dev.bynot.it` | **Bynot Dev** |

### Differenze chiave

- **`main`** — ha le cartelle `ios/` e `android/` nel repo (bare workflow per prod)
- **`dev`** — `ios/` e `android/` sono in `.gitignore` (managed workflow, EAS fa prebuild da `app.config.ts`)

### Workflow di sviluppo

1. Lavori su `dev`
2. Quando pronto, merge `dev` → `main` (escludi `.gitignore` e file dev-only se necessario)
3. Su `main` le cartelle `ios/` e `android/` restano con config prod

---

## OTA Updates (App)

### OTA Dev (Bynot Dev su TestFlight)

```bash
git checkout dev
./update-dev.sh "descrizione modifica"
```

Cosa fa:
- Setta le env var Firebase dev + API dev
- Pusha su canale `preview` (quello del build Bynot Dev)
- L'app scarica l'update al prossimo avvio

### OTA Prod (Bynot su App Store)

```bash
git checkout main
./update-prod.sh "descrizione modifica"
```

Cosa fa:
- Usa le env var di produzione (da `.env` o defaults)
- Pusha su canale `production`

### Quando serve un nuovo build (NON basta OTA)

L'OTA aggiorna solo il JS bundle. Serve un nuovo build nativo quando:
- Aggiungi/rimuovi un pacchetto con codice nativo (es. nuova libreria con pod)
- Cambi `app.config.ts` in modo che tocca il nativo (permissions, plugins, ecc.)
- Cambi `runtimeVersion` in `app.config.ts`

Per rebuildare:
```bash
# Dev
eas build --profile preview --platform ios
eas submit --profile preview --platform ios --latest

# Prod
eas build --profile production --platform ios
eas submit --profile production --platform ios --latest
```

---

## Deploy Backend

Server: **Hetzner** (77.42.1.116, porta SSH 49222)

### Backend Dev

```bash
cd backend-ts
./deploy-dev.sh
```

- Deploya su `/opt/bynot-backend-dev`
- Service: `bynot-backend-dev`
- URL: `https://dev.bynot.it`
- Logs: `ssh -i ~/.ssh/id_ed25519_bynot -p 49222 root@77.42.1.116 'tail -f /var/log/bynot-backend-dev.log'`

### Backend Prod

```bash
cd backend-ts
./deploy.sh
```

- Deploya su `/opt/bynot-backend`
- Service: `bynot-backend`
- URL: `https://bynot.it`
- Logs: `ssh -i ~/.ssh/id_ed25519_bynot -p 49222 root@77.42.1.116 'tail -f /var/log/bynot-backend.log'`

### Cosa fanno gli script di deploy

1. `npm run build` (compila TypeScript)
2. `rsync` al server (esclude node_modules, src, .env, secrets)
3. `npm ci --omit=dev` sul server
4. `systemctl restart bynot-backend[-dev]`
5. Health check su `/health`

---

## Riepilogo Comandi Rapidi

| Azione | Comando |
|--------|---------|
| OTA dev | `./update-dev.sh "messaggio"` |
| OTA prod | `./update-prod.sh "messaggio"` |
| Build dev iOS | `eas build --profile preview --platform ios` |
| Build prod iOS | `eas build --profile production --platform ios` |
| Submit TestFlight dev | `eas submit --profile preview --platform ios --latest` |
| Submit App Store | `eas submit --profile production --platform ios --latest` |
| Deploy backend dev | `cd backend-ts && ./deploy-dev.sh` |
| Deploy backend prod | `cd backend-ts && ./deploy.sh` |
| Logs backend dev | `ssh -p 49222 root@77.42.1.116 'tail -f /var/log/bynot-backend-dev.log'` |
| Logs backend prod | `ssh -p 49222 root@77.42.1.116 'tail -f /var/log/bynot-backend.log'` |

---

## EAS Profiles

| Profile | Canale OTA | Distribuzione | Uso |
|---------|-----------|---------------|-----|
| `development` | `development` | internal | Dev client locale (Expo Go) |
| `preview` | `preview` | store | TestFlight — Bynot Dev |
| `production` | `production` | store | App Store — Bynot |
