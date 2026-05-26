# Bynot — Dev / Prod Workflow

## Ambienti

| | **DEV** | **PROD** |
|---|---|---|
| Backend URL | `https://dev.bynot.it` | `https://bynot.it` |
| Firebase | `bynot-dev` | `bynotv2` |
| Backend path server | `/opt/bynot-backend-dev` | `/opt/bynot-backend` |
| Backend porta | 3002 | 3001 |
| App TestFlight | Stessa app "Bynot", canale OTA `preview` | Stessa app "Bynot", canale OTA `production` |
| Server SSH | `ssh -p 49222 root@77.42.1.116` | `ssh -p 49222 root@77.42.1.116` |

---

## Backend

### Deploy su DEV
```bash
cd backend-ts
./deploy-dev.sh
```

### Deploy su PROD
```bash
cd backend-ts
./deploy.sh
```

### Flusso consigliato
```
Scrivi codice → deploy-dev.sh → testa su dev.bynot.it → OK → deploy.sh
```

### Logs
```bash
# Dev
ssh -p 49222 root@77.42.1.116 'tail -f /var/log/bynot-backend-dev.log'

# Prod
ssh -p 49222 root@77.42.1.116 'tail -f /var/log/bynot-backend.log'
```

### Restart servizio
```bash
# Dev
ssh -p 49222 root@77.42.1.116 'systemctl restart bynot-backend-dev'

# Prod
ssh -p 49222 root@77.42.1.116 'systemctl restart bynot-backend'
```

---

## App (OTA Updates)

### Push update su DEV
```bash
eas update --channel preview --message "descrizione modifica"
```
L'app su TestFlight (canale preview) si aggiorna al prossimo avvio.
Punta a `dev.bynot.it` + Firebase `bynot-dev`.

### Push update su PROD
```bash
eas update --channel production --message "descrizione modifica"
```
L'app in produzione (App Store / TestFlight canale production) si aggiorna.
Punta a `bynot.it` + Firebase `bynotv2`.

### Flusso consigliato
```
Scrivi codice → eas update --channel preview → testa sull'app → OK → eas update --channel production
```

### Nota importante
Gli OTA update cambiano solo il JavaScript bundle, NON il codice nativo.
Se modifichi file nativi (ios/, plugins/, package.json con nuove native deps), serve un nuovo build:
```bash
# Build per TestFlight
eas build --profile preview --platform ios

# Dopo il build, submitta
eas submit --profile preview --platform ios --latest
```

---

## Build Nativi (quando servono)

Serve un nuovo build quando:
- Aggiungi/rimuovi un pacchetto npm con codice nativo
- Modifichi `app.config.ts` (permissions, plugins, ecc)
- Modifichi file in `ios/` o `android/`
- Aggiorni Expo SDK

### Build DEV (TestFlight)
```bash
eas build --profile preview --platform ios
eas submit --profile preview --platform ios --latest
```

### Build PROD (App Store)
```bash
eas build --profile production --platform ios
eas submit --profile production --platform ios --latest
```

---

## Flusso Completo (esempio feature nuova)

```bash
# 1. Scrivi il codice
git add -A && git commit -m "feat: nuova feature" && git push

# 2. Deploy backend su dev
cd backend-ts && ./deploy-dev.sh

# 3. Push OTA su dev
eas update --channel preview --message "feat: nuova feature"

# 4. Testa sull'app (apri, chiudi, riapri per scaricare OTA)

# 5. Tutto OK? Deploy backend prod
cd backend-ts && ./deploy.sh

# 6. Push OTA su prod
eas update --channel production --message "feat: nuova feature"
```

---

## Accesso Server

```bash
# SSH
ssh -p 49222 root@77.42.1.116

# Env dev
cat /opt/bynot-backend-dev/.env

# Env prod
cat /opt/bynot-backend/.env

# Docker containers attivi
docker ps

# Health check
curl https://dev.bynot.it/health
curl https://bynot.it/health
```

---

## Firebase Console

- **Dev**: https://console.firebase.google.com/project/bynot-dev
- **Prod**: https://console.firebase.google.com/project/bynotv2

---

## Troubleshooting

### L'OTA non arriva
- Chiudi completamente l'app (swipe up) e riaprila
- Verifica il canale: `preview` per dev, `production` per prod
- Controlla su https://expo.dev/accounts/bynot01/projects/bynot-react/updates

### Backend non risponde
```bash
ssh -p 49222 root@77.42.1.116 'systemctl status bynot-backend-dev'
ssh -p 49222 root@77.42.1.116 'tail -20 /var/log/bynot-backend-dev.log'
```

### Build fallisce
- Controlla i log su https://expo.dev/accounts/bynot01/projects/bynot-react/builds
- Se errore CocoaPods: `cd ios && pod install --repo-update`
- Se errore certificati: `eas credentials` per gestirli
