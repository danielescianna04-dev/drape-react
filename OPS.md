# Drape Ops Handbook

Come lavorare con dev + prod senza rompere niente, e cosa fa ogni comando.

---

## 0. Onboarding nuovo collega — Day 1

Prima di poter fare qualsiasi cosa serve accesso a 4 sistemi. Chiedimi (Daniele) di aggiungerti uno alla volta.

### 0.1 Account che ti servono

| Servizio | Account che ti servirà | Cosa serve |
|---|---|---|
| **GitHub** | invitato come collaborator su `danielescianna04-dev/drape-react` | clone + push del repo |
| **Firebase** | aggiunto come Editor sui progetti `drape-dev` e `drapev2` | console rules, auth, firestore |
| **Expo / EAS** | aggiunto al team `drape01` | `eas update` / `eas build` |
| **Hetzner VPS** | chiave SSH `id_ed25519_drape` (te la passo io 1:1) | deploy backend + log |
| **Apple Dev / Play Console** | invito separato (solo se devi fare binary builds) | `eas submit` |

### 0.2 Setup locale (macOS)

```bash
# 1. Clone
git clone git@github.com:danielescianna04-dev/drape-react.git
cd drape-react

# 2. Tooling globale (una volta sola sulla tua macchina)
brew install node@20 watchman
npm i -g eas-cli firebase-tools
xcode-select --install                         # serve per il simulatore iOS

# 3. Login ai servizi
eas login                                      # account drape1.dev@gmail.com
firebase login                                 # stesso account
gh auth login                                  # account GitHub tuo

# 4. Dipendenze app + backend
npm install
cd backend-ts && npm install && cd ..

# 5. SSH key per il VPS (Daniele te la dà via canale sicuro)
chmod 600 ~/.ssh/id_ed25519_drape

# 6. .env locali (Daniele te li passa via 1Password / canale sicuro)
#    - .env (root)                  → vars Expo PUBLIC + Firebase prod
#    - backend-ts/.env              → solo se vuoi runnare il backend in locale
#    - backend-ts/service-account-key.json  → service account drape-dev
```

### 0.3 Avviare l'app in locale

#### Modalità DEV (default — quasi sempre questa)

Punta al backend `dev.drape.info` + Firebase `drape-dev`. Usala 99% del tempo.

```bash
# Prima volta su una macchina nuova: build nativa + installa nel simulatore
npx expo run:ios --device "iPhone 15 Pro"     # iOS
npx expo run:android                          # Android

# Dopo la prima build, riusi solo Metro (più veloce):
npx expo start --clear
# → premi 'i' per iOS, 'a' per Android
```

`.env` (root) imposta `EXPO_PUBLIC_API_URL=https://dev.drape.info` e `EXPO_PUBLIC_ENV=development`, quindi non serve passare nulla a mano. L'app sul simulatore dialoga col backend dev e Firebase `drape-dev`.

#### Modalità PROD (solo per riprodurre bug prod in locale)

Punta al backend `drape.info` + Firebase `drapev2`. Lo usi raramente — di solito basta la build prod via TestFlight.

```bash
EXPO_PUBLIC_ENV=production \
EXPO_PUBLIC_API_URL=https://drape.info \
EXPO_PUBLIC_WS_URL=wss://drape.info \
  npx expo start --clear
```

Attenzione:
- Stai parlando con utenti reali e dati reali. **Non** creare progetti spazzatura, **non** fare publish, **non** pagare con sandbox IAP (non funziona, è per dev).
- Devi loggarti con un account `drapev2`. Il login dev (`drape-dev`) qui non funziona — sono Firebase project diversi.
- Il bundle identifier resta `com.drape.app.dev` (binary di sviluppo) ma punta a backend prod: ok per debug, **non** distribuirla.

#### Quando usare cosa

| Caso | Usa |
|---|---|
| Lavoro normale, sviluppo features | DEV |
| Test di un bug specifico segnalato da un utente prod | PROD locale (con .env override) |
| Demo a qualcuno o screenshot per App Store | TestFlight build prod (non locale) |
| Test del flusso IAP/paywall | TestFlight (sandbox StoreKit) — locale non basta |

### 0.4 Smoke test (sei pronto se questi 3 funzionano)

```bash
./drape status              # vedi branch + health di entrambi i backend
git log --oneline -5        # vedi gli ultimi commit
npx expo start --clear      # Metro parte e l'app si apre nel simulatore
```

Se uno fallisce, prima di toccare codice apri un thread con Daniele.

### 0.5 Prima di committare la prima volta

- Lavori SEMPRE su una feature branch partita da `dev`. Mai diretto su `main`. Mai diretto su `dev` (almeno finché lavoriamo in più di uno).
- Leggi le sezioni 2 e 3 di questo doc (workflow git + reference comandi).
- Solo Daniele fa `./drape prod release`. Tu fermati al merge in `dev`.

### 0.6 Workflow team (PR-based) — questo è il flusso da seguire

Il punto chiave: **`dev` non è la tua sandbox**, è l'ambiente condiviso che gira su `dev.drape.info` ed è usato dalla build TestFlight di sviluppo. Se ci pushi roba rotta, la rompi a tutti. Quindi: tutto passa da una feature branch + PR.

#### Flusso standard

```bash
# 1. Aggiorna dev locale
git checkout dev
git pull origin dev

# 2. Crea una branch dal nome parlante
git checkout -b feat/skills-marketplace
# oppure: fix/login-crash, refactor/chat-store, chore/bump-deps, ecc.

# 3. Lavora. Committa spesso, messaggi piccoli e chiari.
git add -A
git commit -m "feat(skills): add slash command menu in chat input"
# ... altri commit ...

# 4. Push della branch
git push -u origin feat/skills-marketplace

# 5. Apri una Pull Request su GitHub: base = dev, compare = feat/skills-marketplace
gh pr create --base dev --title "feat: skills marketplace" --body "..."

# 6. Daniele (o un altro collega) revisiona, lascia commenti
#    Tu fixi, ripushi, ripeti finché non c'è approvazione.

# 7. Merge della PR in dev (preferiamo "Squash and merge" per tenere la history pulita)
#    NON fare il merge tu — aspetta che Daniele lo faccia, o conferma con lui.

# 8. Dopo il merge, qualcuno (di solito Daniele) fa il release dev:
./drape dev release "feat: skills marketplace"
#    → backend dev aggiornato + OTA al canale preview → tutta la team vede la nuova versione.

# 9. Cleanup locale
git checkout dev
git pull origin dev
git branch -d feat/skills-marketplace
```

#### Branch naming

| Prefisso | Quando usarlo |
|---|---|
| `feat/<short-name>` | Nuova funzionalità |
| `fix/<short-name>` | Bugfix |
| `refactor/<short-name>` | Refactor senza cambio di comportamento |
| `chore/<short-name>` | Manutenzione (deps, lint, docs, CI) |
| `hotfix/<short-name>` | SOLO per emergenze prod (vedi sezione 2) |

#### Backend e frontend nella stessa PR

Il repo è monorepo: `backend-ts/` (Express, deploy-ato sul VPS) e tutto il resto (React Native, deploy-ato via OTA).

- Se la tua feature tocca solo frontend → PR con changes in `src/`.
- Se tocca solo backend → PR con changes in `backend-ts/`.
- Se tocca entrambi (es. una feature end-to-end tipo "skills") → **una sola PR** con tutto. Più facile reviewer e atomic per il release.

Quando viene mergiata e si fa `./drape dev release`:
1. Backend viene buildato e deployato su `dev.drape.info` (~30s).
2. OTA viene pubblicato sul canale `preview` (~2 min).
3. La build TestFlight dev al prossimo riavvio scarica il nuovo bundle.

Se la tua PR cambia anche `firestore.rules`, **scrivilo nella PR description**, perché serve `./drape dev rules` (e poi `./drape prod rules` quando si va in prod). Il release dev NON deploya le rules in automatico — solo `prod release` lo fa.

#### PR description — cosa scrivere

Tieni il template semplice ma sempre presente. Esempio:

```
## Cosa
- Aggiunto popover slash menu nel ChatInputBar
- Nuovo endpoint POST /skills/install
- Nuova collezione Firestore `skills` (rules aggiornate)

## Perché
Permettere agli utenti di installare skill dalla marketplace senza uscire dalla chat.

## Test
- Testato su simulatore iOS, sign-in fresh, install di /landing-page
- Backend: curl POST con auth, verificato che il doc viene creato

## Note di deploy
- ⚠️ Modifica firestore.rules → serve `./drape dev rules` e `./drape prod rules` al prossimo release
- Migrazione DB Postgres: nessuna
```

Questo aiuta chi rivede e chi fa il release a sapere cosa controllare.

#### Cosa NON fare

- ❌ Push diretto su `dev` senza PR (anche per "fix piccoli" — se è davvero piccolo, una PR si chiude in 30 secondi).
- ❌ Push diretto su `main`. Mai. È bloccato a livello di workflow, non a livello git: se lo fai, lo vediamo subito e dobbiamo revertare.
- ❌ Force push su una branch dove c'è una PR aperta che qualcun altro sta revisionando.
- ❌ Mergiare la tua PR senza review (a meno che Daniele non te lo dica esplicitamente per quel caso).
- ❌ Lanciare `./drape prod *` senza accordi espliciti con Daniele.

#### Cosa puoi fare in autonomia (senza ping)

- ✅ Aprire/aggiornare/chiudere le tue PR.
- ✅ Lanciare `./drape dev deploy` o `./drape dev release` su feature backend-only quando hai bisogno di testare integrazioni server prima del merge (ma avvisa nel canale: "deployo X su dev backend per test").
- ✅ Leggere log: `./drape logs dev` / `./drape logs prod`.
- ✅ Leggere Firestore Console (sia drape-dev che drapev2).
- ✅ Modificare `.env` del backend dev sul VPS via SSH **se** strettamente necessario per testare (e avvisa).

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
| `./drape dev rules` | Deploy `firestore.rules` → progetto `drape-dev` (richiede `firebase login`). |
| `./drape dev ota [message]` | Bundla JS con env dev, publica OTA al canale `preview`. |
| `./drape dev release [message]` | `deploy` + `ota` in sequenza. Release dev completa. |

Il `dev deploy` stampa un warning se non sei su branch `dev` (soft, non blocca).

### Prod

| Comando | Cosa fa |
|---|---|
| `./drape prod promote` | Checkout `main`, fast-forward merge di `dev`, push. Resta su `main`. Rifiuta se hai changes non committate. |
| `./drape prod deploy` | Build + rsync + migrazione DB + restart `drape-backend`. **Rifiuta se non sei su `main`** (`FORCE=1` per override). |
| `./drape prod rules` | Deploy `firestore.rules` → progetto `drapev2`. **Rifiuta se non sei su `main`**. |
| `./drape prod ota [message]` | OTA al canale `production`. **Rifiuta se non sei su `main`** + chiede conferma esplicita. |
| `./drape prod release [message]` | `promote` + `deploy` + `rules` + `ota` → release end-to-end. Ti riporta su `dev` alla fine. |

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

## 5b. Firestore rules

Le rules vivono in `firestore.rules` (root del repo). Sono lato Firebase, **non** vengono incluse nel bundle JS, quindi un OTA o un deploy backend NON le aggiorna in remoto.

### Quando deployarle

Ogni volta che modifichi `firestore.rules` localmente. Se aggiungi una collezione nuova (es. `skills`) e dimentichi il deploy, l'app vede `Missing or insufficient permissions.` per ogni read/write su quella collezione.

### Come

```bash
./drape dev rules               # → drape-dev (preview)
./drape prod rules              # → drapev2  (richiede branch=main)
```

`prod release` lo fa già in automatico tra `deploy` e `ota`. Lo standalone serve quando modifichi solo le rules senza altro.

### Sintomi di rules disallineate

- "Missing or insufficient permissions" su collezioni che dovrebbero essere accessibili
- App stuck su splash nero dopo login (un read fallito blocca `onAuthStateChanged`)
- DeviceService warn `permission-denied during token refresh` ripetuti

Soluzione: `./drape dev rules` (o `prod rules`) e ricarica.

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

# Solo Firestore rules (quando modifichi firestore.rules)
./drape dev rules
./drape prod rules                   # (solo da main)

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
