# Ambiente Dev — Piano di Lavoro

Questa cartella contiene la documentazione e i piani per l'ambiente di sviluppo di Bynot.

## Configurazione attuale

| Risorsa | Valore |
|---------|--------|
| Firebase Project | `bynot-dev` |
| Backend API | `https://dev.bynot.it` |
| WebSocket | `wss://dev.bynot.it` |
| GCP Project | `bynot-dev` |
| GCP Region | `europe-west1` |
| Bundle ID | `com.bynot.app.dev` |
| Nome App | Bynot Dev |
| Branch | `dev` |
| EAS Profile | `preview` |
| OTA Channel | `preview` |

## Struttura cartella

```
dev-environment/
├── README.md              ← questo file
└── piani/                 ← piani di lavoro e task futuri
    └── (verranno aggiunti man mano)
```

## Come avviare l'ambiente dev locale

```bash
# 1. Checkout branch dev
git checkout dev

# 2. Assicurati che .env punti a bynot-dev (vedi docs/DEPLOY-OTA.md)

# 3. Installa dipendenze
yarn install

# 4. Primo avvio (build nativo necessario)
npx expo run:ios

# 5. Avvii successivi (solo Metro)
npx expo start --dev-client --clear
```
