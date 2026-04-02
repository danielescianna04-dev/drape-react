# Ambiente Dev — Piano di Lavoro

Questa cartella contiene la documentazione e i piani per l'ambiente di sviluppo di Drape.

## Configurazione attuale

| Risorsa | Valore |
|---------|--------|
| Firebase Project | `drape-dev` |
| Backend API | `https://dev.drape.info` |
| WebSocket | `wss://dev.drape.info` |
| GCP Project | `drape-dev` |
| GCP Region | `europe-west1` |
| Bundle ID | `com.drape.app.dev` |
| Nome App | Drape Dev |
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

# 2. Assicurati che .env punti a drape-dev (vedi docs/DEPLOY-OTA.md)

# 3. Installa dipendenze
yarn install

# 4. Primo avvio (build nativo necessario)
npx expo run:ios

# 5. Avvii successivi (solo Metro)
npx expo start --dev-client --clear
```
