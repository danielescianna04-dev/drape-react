# Drape Ops Handbook

Come lavorare con dev + prod senza rompere niente, e cosa fa ogni comando.

---

## 1. Architettura degli ambienti

### Due ambienti completamente distinti

|  | **Dev** | **Prod** |
|---|---|---|
| URL backend | `https://dev.drape.info` | `https://drape.info` |
| Servizio systemd | `drape-backend-dev` | `drape-backend` |
| Dir sul server | `/opt/drape-backend-dev` | `/opt/drape-backend` |
| Env file sul server | `/opt/drape-backend-dev/.env` | `/opt/drape-backend/.env` |
| Postgres Drape Cloud | DB `drape_cloud_dev` | DB `drape_cloud_prod` |
| Firebase project | `drape-dev` | `drapev2` |
| App identifier | `com.drape.app.dev` | `com.drape.app` |
| App deep-link scheme | `drape-dev://` | `drape://` |
| EAS channel OTA | `preview` | `production` |
| Git branch di riferimento | `dev` | `main` |

Entrambi i backend girano sullo stesso VPS Hetzner (77.42.1.116) ma sono servizi systemd separati con porte, directory, DB e env vars diverse. Non si influenzano mai.

---

## 2. Il workflow git

### Le due branch principali

- **`dev`** = dove lavori ogni giorno. Specchio di `dev.drape.info`.
- **`main`** = quello che gli utenti reali stanno usando. Specchio di `drape.info`.

**Regola d'oro:** `main` è SEMPRE un sottoinsieme di `dev`. Non si committa mai direttamente su `main`, ci si arriva solo via merge da `dev`.

### Flusso giornaliero (feature piccola)

```bash
git checkout dev
# ...edit, save...
git add -A
git commit -m "feat: aggiunge X"
git push origin dev
./drape dev release "test X"
```

Testi su `dev.drape.info` + app dev (TestFlight/APK preview). Se tutto ok → promote a prod.

### Flusso di release (promozione a prod)

```bash
./drape prod release "v2.1.0 — feature X"
```

Il comando da solo fa:
1. Checkout `main`
2. Fast-forward merge di `dev` → `main`
3. Push `main` su GitHub
4. Build + rsync + migrazione DB + restart backend prod
5. OTA al canale `production` (con conferma)
6. Ti riporta su `dev`

### Flusso per feature grossa (branch separata)

```bash
git checkout dev
git checkout -b feat/pricing-refactor
# ...lavori giorni...
git push origin feat/pricing-refactor     # backup remoto
# quando pronta:
git checkout dev
git merge feat/pricing-refactor
git push origin dev
git branch -d feat/pricing-refactor       # cleanup
./drape dev release                        # testi su dev
./drape prod release                       # quando sicuro, vai live
```

Opzionale: se lavori da solo puoi committare direttamente su `dev`. Le branch feature servono per tenere traccia di un lavoro lungo o per pull request.

### Flusso hotfix urgente (bypass di dev)

Quando un bug rompe prod e non puoi aspettare un giro completo:

```bash
git checkout main
git checkout -b hotfix/payment-500
# ...fix...
git commit -am "fix: payment retry swallows error"
git checkout main
git merge hotfix/payment-500
git push origin main
./drape prod deploy
./drape prod ota "hotfix payment 500"

# IMPORTANTE: riporta il fix anche su dev
git checkout dev
git merge main
git push origin dev
```

### Cosa NON fare

- ❌ Commit diretti su `main` (bypassa il test su dev)
- ❌ Deploy prod stando su `dev` → lo script rifiuta
- ❌ `git push --force` su `main`
- ❌ Merge `main → dev` "a caso" quando non c'è stato un hotfix: crea solo rumore

### Check di salute

```bash
./drape status      # branch, ultimi commit, health di entrambi
git log --oneline main..dev   # quanti commit sono su dev ma non ancora in prod
git log --oneline dev..main   # dovrebbe essere vuoto (se non lo è: hotfix non portato in dev)
```

---

## 3. Il comando `./drape` — reference completa

Tutti i comandi vanno lanciati dalla root del repo (`/Users/daniele/drape-react`).

### Dev

| Comando | Cosa fa |
|---|---|
| `./drape dev deploy` | Build TypeScript + rsync + migrazione DB + restart `drape-backend-dev`. Niente OTA. |
| `./drape dev ota [message]` | Bundla JS con env dev, publica OTA al canale `preview`. |
| `./drape dev release [message]` | `deploy` + `ota` in sequenza. Release dev completa. |

Il `dev deploy` stampa un warning se non sei su branch `dev` (soft, non blocca).

### Prod

| Comando | Cosa fa |
|---|---|
| `./drape prod promote` | Checkout `main`, fast-forward merge di `dev`, push. Resta su `main`. Rifiuta se hai changes non committate. |
| `./drape prod deploy` | Build + rsync + migrazione DB + restart `drape-backend`. **Rifiuta se non sei su `main`** (`FORCE=1` per override). |
| `./drape prod ota [message]` | OTA al canale `production`. **Rifiuta se non sei su `main`** + chiede conferma esplicita. |
| `./drape prod release [message]` | `promote` + `deploy` + `ota` → release end-to-end. Ti riporta su `dev` alla fine. |

### Utility

| Comando | Cosa fa |
|---|---|
| `./drape status` | Mostra branch corrente, commit di dev e main, gap tra loro, health di entrambi i backend. |
| `./drape logs dev` | Tail live di `/var/log/drape-backend-dev.log` via SSH. |
| `./drape logs prod` | Tail live di `/var/log/drape-backend.log`. |
| `./drape version <x.y.z>` | Bumpa la versione utente-visibile (`version` in app.config.ts + package.json + backend vars). **NON tocca `runtimeVersion`** (vedi sezione OTA). |
| `./drape rollback prod` | Lista ultimi OTA prod per trovare un update group da republicare. |
| `./drape help` | Riassunto di tutti i comandi. |

---

## 4. OTA (Over-The-Air updates)

### Cosa è un OTA

Un OTA aggiorna il **bundle JavaScript + assets** di un'app già installata, senza passare da App Store o Play Store. L'utente al prossimo avvio scarica il nuovo bundle e vede le novità.

**Cosa un OTA PUÒ fare:** cambiare UI, logica, aggiungere route, cambiare endpoints, modificare testi, aggiustare bug JS, ecc. Tutto ciò che è JavaScript/TypeScript.

**Cosa un OTA NON può fare:** aggiungere librerie native, cambiare permessi iOS/Android, modificare Info.plist, cambiare l'icona, cambiare il bundle identifier. Queste richiedono una nuova **binary** (vedi sezione 5).

### `version` vs `runtimeVersion`

Due campi in `app.config.ts` che si confondono ma fanno cose diverse:

| Campo | A cosa serve | Quando bumparlo |
|---|---|---|
| `version: '2.1.0'` | Versione utente-visibile. Mostrata nell'About screen, nel Play Store, da Apple. | Ogni release (OTA o binary). Liberamente. |
| `runtimeVersion: '2.0.2'` | Hash di compatibilità tra bundle JS e binary nativa. | SOLO quando cutti una nuova binary via `eas build`. Mai per un semplice OTA. |

**Perché non bumpo `runtimeVersion` insieme a `version`?**

Expo consegna un OTA a un'app solo se il `runtimeVersion` del bundle combacia con quello della binary nativa. Se bumpi `runtimeVersion` a 2.1.0 e pubblichi un OTA a 2.1.0, le binary esistenti (tutte a 2.0.2) non lo scaricano. Silenziosamente. Gli utenti restano sul vecchio bundle fino a quando non escono da App Store con una nuova binary al `runtimeVersion` 2.1.0.

**Regola pratica:**
- OTA = solo JS → `version` cambia, `runtimeVersion` resta.
- Nuova binary (eas build + App Store submit) = cambia sia `version` che `runtimeVersion`.

### Channels e branches EAS

| Concetto | Cosa è |
|---|---|
| **Channel** | Etichetta scritta dentro la binary al momento di `eas build`. Una binary "ascolta" un solo channel. |
| **Branch** | Timeline di update. Ogni `eas update --branch X` aggiunge un commit a quella timeline. |
| **Mapping** | Un channel può essere mappato a qualsiasi branch. Di default il channel `production` è mappato al branch `production`. |

Configurazione in `eas.json`:
- Profile `preview` → channel `preview` → branch `preview` (app dev TestFlight / preview APK)
- Profile `production` → channel `production` → branch `production` (app su App Store / Play Store)

Un OTA pubblicato su `preview` non raggiunge mai `production` e viceversa. Separazione totale.

### Comandi OTA diretti (se non vuoi il wrapper `./drape`)

Dev:
```bash
EXPO_PUBLIC_ENV=development \
EXPO_PUBLIC_API_URL=https://dev.drape.info \
EXPO_PUBLIC_WS_URL=wss://dev.drape.info \
  eas update --channel preview --message "..."
```

Prod:
```bash
EXPO_PUBLIC_ENV=production \
EXPO_PUBLIC_API_URL=https://drape.info \
EXPO_PUBLIC_WS_URL=wss://drape.info \
  eas update --channel production --message "..."
```

**Perché serve passare le env vars a mano:** `eas update` bundla con l'ambiente shell del momento, non con l'`env:` di `eas.json` (quello vale solo per `eas build`). Se non le imposti, il bundle prod potrebbe finire con URL/API di dev.

### Rollback di un OTA

Due strategie:

1. **Roll-back to embedded** — annulla tutti gli update e riporta gli utenti alla binary originale (quella scaricata da App Store):
   ```bash
   eas update:roll-back-to-embedded --channel production
   ```

2. **Republish di un update precedente** — ripesca un update group già pubblicato e lo ri-promuove:
   ```bash
   ./drape rollback prod              # mostra gli ultimi update group
   eas update --branch production --republish --group <group-id>
   ```

Gli utenti al prossimo avvio scaricano la versione rolled-back.

---

## 5. Backend deploy (come funziona sotto)

### Cosa fa `./drape dev deploy` / `prod deploy`

```
1. Branch guard (prod richiede main)
2. npm run build            # compila TS → dist/
3. ssh + rsync              # copia dist + scripts + package.json sul server
4. npm ci --omit=dev        # installa solo prod deps
5. drape-cloud-migrate.js   # applica schema.sql (idempotente)
6. systemctl restart …      # riavvia il servizio
7. curl /health             # verifica che stia rispondendo
```

Lo script NON tocca:
- `.env` sul server (modifica le env vars a mano via SSH)
- `node_modules/` (reinstalla da zero con `npm ci`)
- `local-data/` (progetti utente sul VPS)
- `service-account-key.json` (chiave Firebase)

### Variabili d'ambiente importanti

Nel file `/opt/drape-backend/.env` (prod) o `/opt/drape-backend-dev/.env` (dev):

| Var | Cosa controlla |
|---|---|
| `PORT` | Porta su cui il backend ascolta (dev 3002, prod 3001) |
| `DRAPE_CLOUD_ENABLED` | Se `true`, attiva le route `/v1/*` Drape Cloud |
| `DRAPE_CLOUD_DB_URL` | Connection string Postgres |
| `GOOGLE_CLOUD_PROJECT` | Firebase/GCP project id (`drape-dev` o `drapev2`) |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY` | Provider AI |
| `GITHUB_CLIENT_ID/SECRET` | OAuth app GitHub |
| `RESEND_API_KEY` | Email transazionali |

Per cambiarle:
```bash
ssh -i ~/.ssh/id_ed25519_drape -p 49222 root@77.42.1.116
nano /opt/drape-backend/.env
systemctl restart drape-backend
```

### Migrazioni Drape Cloud

Schema centralizzato in `backend-ts/src/services/drape-cloud/schema.sql`. Tutte le `CREATE TABLE / INDEX / ...` usano `IF NOT EXISTS`. Ogni deploy rilancia `scripts/drape-cloud-migrate.js` che applica lo schema: se niente è cambiato non fa nulla, se ci sono tabelle nuove le crea.

Per lanciare la migrazione a mano (es. dopo aver editato a mano uno schema):
```bash
ssh … root@… "cd /opt/drape-backend && set -a && . ./.env && set +a && node scripts/drape-cloud-migrate.js"
```

### Restart manuale

```bash
ssh … "systemctl restart drape-backend"          # prod
ssh … "systemctl restart drape-backend-dev"      # dev
ssh … "systemctl status drape-backend --no-pager"  # controlla se è active
```

### Log

```bash
./drape logs prod    # tail live
./drape logs dev

# O manualmente:
ssh … "tail -f /var/log/drape-backend.log"
ssh … "journalctl -u drape-backend --since '10 min ago'"
```

---

## 6. App native build (quando serve)

Quando bumpi `runtimeVersion`, aggiungi librerie native, o cambi Info.plist/icona, DEVI cuttare una nuova binary:

```bash
# build
eas build --profile production --platform ios        # iOS
eas build --profile production --platform android    # Android
eas build --profile production --platform all        # entrambi

# submit automatico a App Store Connect / Play Console
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

Apple ci mette di solito 24-48h di review. Google Play qualche ora. Dopo che la nuova binary è pubblicata, riparti con gli OTA al nuovo `runtimeVersion`.

Per test prima del submit:
```bash
eas build --profile preview --platform ios     # fa una build di preview (TestFlight interno)
```

---

## 7. Scenari comuni

### "Voglio testare una modifica piccola su dev"
```bash
# modifica il codice
git add -A && git commit -m "..."
git push origin dev
./drape dev release "quick test"
# controlla su dev.drape.info / app dev
```

### "Ho finito una feature, voglio mandarla in prod"
```bash
./drape prod release "v2.1.0 — descrizione"
# ti chiede conferma per l'OTA prod, accetti con y
```

### "C'è un bug critico in prod, devo fixare subito"
```bash
git checkout main
git checkout -b hotfix/x
# fix…
git commit -am "fix: …"
git checkout main
git merge hotfix/x
./drape prod deploy
./drape prod ota "hotfix x"
git checkout dev && git merge main && git push origin dev
```

### "L'ultimo OTA prod ha un problema, devo tornare indietro"
```bash
./drape rollback prod
# prendi il group-id di un update precedente funzionante
eas update --branch production --republish --group <group-id>
```

### "Voglio sapere se dev è già allineato a prod"
```bash
./drape status
# la riga "dev vs main: X ahead" dice quanti commit di dev non sono ancora in prod
```

### "Voglio cambiare la versione utente-visibile ovunque"
```bash
./drape version 2.2.0
# bumpa app.config.ts, package.json, backend vars
# NON tocca runtimeVersion
git commit -am "chore: bump 2.2.0"
```

### "Voglio mandare anche una nuova binary in App Store"
```bash
# 1. Bump runtime version manualmente in app.config.ts (sync con version)
# 2. eas build --profile production --platform all
# 3. eas submit --profile production --platform all
# 4. Attendi review Apple
# 5. Dopo la review, gli OTA su runtimeVersion nuovo iniziano a essere consegnati
```

---

## 8. Troubleshooting

| Sintomo | Causa probabile | Fix |
|---|---|---|
| `./drape prod deploy` rifiuta con "must run from main" | Non sei su main | `git checkout main` o `FORCE=1 ./drape prod deploy` (solo emergenze) |
| Backend prod in crash loop dopo deploy | Mancano env vars sul server, o porta già in uso | `ssh … tail /var/log/drape-backend.log` e controlla; verifica `ss -tlnp \| grep :3001` |
| OTA pubblicato ma utenti non lo vedono | Runtime version mismatch, o app non rilanciata | Verifica `runtimeVersion` sia uguale in app.config.ts e nella binary installata; forza l'utente a riavviare l'app |
| `eas update` finisce ma il bundle ha URL di dev | Env vars non passate al bundler | Usa il wrapper `./drape prod ota` (le imposta lui) o prefissa manualmente (vedi sez 4) |
| `git push` rifiutato con "Repository not found" | gh autenticato sull'account sbagliato | `gh auth switch -u danielescianna04-dev` |
| DB Drape Cloud con tabelle mancanti | Migrazione non eseguita | `./drape prod deploy` rilancia la migrazione; oppure a mano (vedi sez 5) |

---

## 9. Struttura repo

```
drape-react/
├── drape                              # CLI di questo handbook
├── app.config.ts                      # Expo config (version, runtimeVersion)
├── eas.json                           # Build + update profiles
├── package.json                       # App RN
├── src/                               # App React Native
├── backend-ts/
│   ├── deploy.sh                      # Deploy prod (guard su branch main)
│   ├── deploy-dev.sh                  # Deploy dev
│   ├── package.json                   # Backend
│   ├── scripts/
│   │   └── drape-cloud-migrate.js     # Migrazione schema Postgres
│   └── src/
│       ├── index.ts
│       ├── config/
│       ├── routes/
│       └── services/
│           └── drape-cloud/
│               ├── schema.sql         # Schema Postgres Drape Cloud
│               ├── provision.ts
│               ├── sdk/               # SDK incluso nei progetti generati
│               └── …
└── OPS.md                             # Questo file
```

---

## 10. Cheat-sheet da tenere a portata

```bash
# DEV giornaliero
./drape dev release "msg"

# PROD release
./drape prod release "v2.x.y"

# Solo backend (no OTA)
./drape dev deploy
./drape prod deploy                  # (solo da main)

# Solo OTA (no backend)
./drape dev ota "msg"
./drape prod ota "msg"

# Osservazione
./drape status
./drape logs dev
./drape logs prod

# Emergenza
./drape rollback prod
FORCE=1 ./drape prod deploy          # bypass branch guard

# Versioning
./drape version 2.2.0                # bump user-visible, NOT runtime

# Git workflow
git checkout dev                     # sempre di default
git checkout main                    # solo per hotfix o promote manuale
./drape prod promote                 # dev → main in automatico
```

Regola finale: **in dubbio, `./drape status`.** Ti dice dove sei, cosa è allineato e cosa no.
