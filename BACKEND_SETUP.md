# 🚀 Backend Setup - Warp Mobile AI IDE

Il backend è lo stesso di `warp-mobile-ai-ide` con Docker containers per eseguire comandi.

## 📦 Prerequisiti

1. **Docker Desktop** installato e avviato
2. **Node.js 18+**
3. **Git**

## 🔧 Setup

### 1. Avvia Docker Desktop

Assicurati che Docker Desktop sia avviato.

### 2. Build Docker Image

```bash
cd backend-mock

# Build immagine dev
docker build -f Dockerfile.simple -t warp-dev-simple:latest .
```

### 3. Installa Dipendenze Backend

```bash
npm install
```

### 4. Configura Environment

Crea `.env` in `backend-mock/`:

```env
PORT=3000
NODE_ENV=development

# AI Models (opzionale)
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
GOOGLE_AI_API_KEY=your_key_here
```

### 5. Avvia Backend

```bash
npm start
```

Il backend sarà su `http://localhost:3000`

## 🎯 Avvia Frontend

In un altro terminale:

```bash
cd ..
npm start
# Premi 'w' per web
```

## ✅ Test

Nella app, prova:

```bash
ls
pwd
echo "Hello from Docker!"
node --version
python3 --version
git --version
```

## 🐳 Come Funziona

1. **Container per Utente**: Ogni sessione crea un container Docker isolato
2. **Workspace Persistente**: `/workspace` dentro il container
3. **Command Execution**: Comandi eseguiti con `docker exec`
4. **WebSocket**: Comunicazione real-time per output streaming

## 📊 Architettura

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   React     │  HTTP   │   Backend    │  Docker │  Container  │
│   Native    │◄───────►│   Node.js    │◄───────►│  (Alpine)   │
│   App       │  WS     │   + Docker   │  API    │  + Tools    │
└─────────────┘         └──────────────┘         └─────────────┘
```

## 🔐 Sicurezza

- Container isolati per ogni utente
- Timeout 30s per comandi
- Resource limits (CPU, RAM)
- Whitelist comandi pericolosi

## 🌐 Deploy su Google Cloud Run

### Opzione 1: Cloud Run con Docker Socket (NON RACCOMANDATO)

Cloud Run non supporta Docker-in-Docker nativamente.

### Opzione 2: Cloud Run + Cloud Build (RACCOMANDATO)

Usa Cloud Build API per eseguire comandi in container temporanei:

```javascript
const { CloudBuildClient } = require('@google-cloud/cloudbuild');

async function executeCommand(command) {
  const client = new CloudBuildClient();
  
  const build = {
    steps: [{
      name: 'node:18-alpine',
      args: ['sh', '-c', command],
    }],
  };
  
  const [operation] = await client.createBuild({
    projectId: 'drape-mobile-ide',
    build,
  });
  
  return operation;
}
```

### Opzione 3: Google Cloud Shell (MIGLIORE)

Usa Cloud Shell API per sessioni terminale persistenti:

```javascript
const { CloudShellServiceClient } = require('@google-cloud/shell');

async function createSession() {
  const client = new CloudShellServiceClient();
  
  const [session] = await client.startEnvironment({
    name: 'users/me/environments/default',
  });
  
  return session;
}
```

## 🚀 Deploy Rapido

```bash
# 1. Build e push immagine
gcloud builds submit --tag gcr.io/drape-mobile-ide/drape-backend

# 2. Deploy su Cloud Run
gcloud run deploy drape-backend \
  --image gcr.io/drape-mobile-ide/drape-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --set-env-vars="NODE_ENV=production"

# 3. Aggiorna .env frontend
EXPO_PUBLIC_API_URL=https://drape-backend-xxxxx-uc.a.run.app
```

## 🐛 Troubleshooting

### Docker non si connette
```bash
# Verifica Docker
docker ps

# Riavvia Docker Desktop
```

### Container non si crea
```bash
# Verifica immagine
docker images | grep warp-dev

# Rebuild
docker build -f Dockerfile.simple -t warp-dev-simple:latest .
```

### Backend non risponde
```bash
# Verifica porta
curl http://localhost:3000/health

# Check logs
npm start
```

## 📝 Comandi Supportati

✅ **Shell**: ls, cd, pwd, mkdir, rm, cp, mv, cat, echo, touch
✅ **Git**: clone, status, add, commit, push, pull, branch
✅ **Node.js**: npm, node, npx
✅ **Python**: python3, pip3
✅ **Tools**: curl, wget, vim, nano

## 🎨 Features

- ✅ Container isolati per sicurezza
- ✅ Workspace persistente
- ✅ Output real-time via WebSocket
- ✅ Multi-linguaggio (Node, Python, Git)
- ✅ Port forwarding per web servers
- ✅ AI Agent integrato

## 📚 Riferimenti

- Backend originale: `/warp-mobile-ai-ide/backend/`
- Documentazione: `/warp-mobile-ai-ide/ARCHITECTURE.md`
- Docker: `Dockerfile.simple`
