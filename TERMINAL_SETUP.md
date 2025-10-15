# 🚀 Terminal Execution Setup

Sistema per eseguire comandi terminale su Google Cloud Run (o localmente per test).

## 📦 Setup Backend Locale (Test)

```bash
# 1. Installa dipendenze backend
cd backend-mock
npm install

# 2. Avvia backend
npm start
```

Il backend sarà disponibile su `http://localhost:8080`

## 🎯 Avvia Frontend

```bash
# In un altro terminale
cd ..
npm start
# Premi 'w' per web
```

## ✅ Test Comandi

Nella app, prova questi comandi:

### Comandi Base
```bash
ls                    # Lista file
pwd                   # Directory corrente
echo "Hello World"    # Stampa testo
node --version        # Versione Node.js
npm --version         # Versione npm
```

### Git Commands
```bash
git status
git log --oneline -5
git branch
```

### Node.js/npm
```bash
npm init -y
npm install express
node -e "console.log('Hello from Node!')"
```

### Python
```bash
python --version
python -c "print('Hello from Python!')"
pip list
```

## 🔧 Comandi Speciali Integrati

L'app riconosce automaticamente questi comandi e li esegue:

- `ls`, `cd`, `pwd`, `mkdir`, `rm`, `cp`, `mv`
- `cat`, `echo`, `touch`, `grep`, `find`
- `git` (tutti i comandi git)
- `npm`, `node`, `python`, `pip`
- `docker`, `kubectl`

## 🌐 Deploy su Google Cloud Run

### 1. Crea Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Installa tools comuni
RUN apk add --no-cache \
    git \
    python3 \
    py3-pip \
    bash

COPY backend-mock/package*.json ./
RUN npm install --production

COPY backend-mock/server.js ./

EXPOSE 8080

CMD ["node", "server.js"]
```

### 2. Build e Deploy

```bash
# Build immagine
gcloud builds submit --tag gcr.io/drape-mobile-ide/drape-backend

# Deploy su Cloud Run
gcloud run deploy drape-backend \
  --image gcr.io/drape-mobile-ide/drape-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 512Mi \
  --timeout 300
```

### 3. Aggiorna .env

```env
EXPO_PUBLIC_API_URL=https://drape-backend-xxxxx-uc.a.run.app
```

## 📊 Funzionalità Implementate

✅ **Esecuzione Comandi**
- Comandi shell standard
- Output in tempo reale
- Gestione errori
- Timeout 30s

✅ **Gestione Progetti**
- `npm install` - Installa dipendenze
- `npm start` - Avvia progetto
- `git clone` - Clona repository
- Comandi git (status, commit, push)

✅ **Multi-linguaggio**
- JavaScript/TypeScript (npm, node)
- Python (pip, python)
- Java (mvn)
- Go (go)
- Rust (cargo)

## 🎨 UI Features

- **Auto-detect**: Riconosce automaticamente se è un comando o chat AI
- **Syntax highlighting**: Comandi evidenziati
- **History**: Cronologia comandi
- **Autocomplete**: Suggerimenti comandi

## 🔐 Sicurezza

⚠️ **IMPORTANTE per produzione:**

1. **Sandbox**: Esegui comandi in container isolati
2. **Whitelist**: Limita comandi permessi
3. **Rate limiting**: Previeni abusi
4. **Authentication**: Richiedi autenticazione
5. **Timeout**: Limita tempo esecuzione

## 📝 Esempio Workflow

```bash
# 1. Crea nuovo progetto
mkdir my-app
cd my-app

# 2. Inizializza npm
npm init -y

# 3. Installa dipendenze
npm install express

# 4. Crea file
echo "console.log('Hello!');" > index.js

# 5. Esegui
node index.js

# 6. Git
git init
git add .
git commit -m "Initial commit"
```

## 🐛 Debug

Se i comandi non funzionano:

1. Verifica backend: `curl http://localhost:8080/health`
2. Controlla console browser per errori
3. Verifica .env ha `EXPO_PUBLIC_API_URL` corretto
4. Riavvia backend e frontend

## 🚀 Next Steps

- [ ] WebSocket per output streaming
- [ ] File system virtuale persistente
- [ ] Sessioni terminale multiple
- [ ] Integrazione Docker per sandbox
- [ ] Code editor integrato
