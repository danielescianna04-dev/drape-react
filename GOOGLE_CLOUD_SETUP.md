# ☁️ Google Cloud Setup

## Backend Configuration

Il backend è già deployato su **Google Cloud Run** nel progetto Flutter originale.

### Informazioni Backend

- **Project ID**: `drape-mobile-ide`
- **Region**: `us-central1`
- **Service**: `drape-ai-backend`
- **Repository**: `drape-repo` (Artifact Registry)
- **URL**: `https://drape-ai-backend-xxxxx-uc.a.run.app`

## 🔧 Configurazione App

### 1. Ottieni URL Backend

```bash
# Vai al backend Flutter
cd /Users/getmad/Projects/warp-mobile-ai-ide/backend

# Ottieni URL Cloud Run
gcloud run services describe drape-ai-backend \
  --region us-central1 \
  --format 'value(status.url)'
```

### 2. Configura .env

Crea `.env` in `/Users/getmad/Projects/drape-react`:

```env
EXPO_PUBLIC_API_URL=https://drape-ai-backend-xxxxx-uc.a.run.app
EXPO_PUBLIC_WS_URL=wss://drape-ai-backend-xxxxx-uc.a.run.app
EXPO_PUBLIC_ENV=development
EXPO_PUBLIC_GCP_PROJECT_ID=drape-mobile-ide
EXPO_PUBLIC_GCP_REGION=us-central1
```

### 3. Test Connection

```bash
# Avvia app
npm start

# L'app si connetterà automaticamente al backend Google Cloud
```

## 📡 Endpoints Disponibili

Il backend espone questi endpoint:

### Health Check
```bash
GET https://drape-ai-backend-xxxxx-uc.a.run.app/health
```

### AI Chat
```bash
POST https://drape-ai-backend-xxxxx-uc.a.run.app/ai/chat
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "model": "auto"
}
```

### AI Agent
```bash
POST https://drape-ai-backend-xxxxx-uc.a.run.app/agent
Content-Type: application/json

{
  "task": "Create a simple Python script"
}
```

### Terminal Execute
```bash
POST https://drape-ai-backend-xxxxx-uc.a.run.app/terminal/execute
Content-Type: application/json

{
  "command": "ls -la"
}
```

## 🚀 Deploy Backend (se necessario)

Se devi aggiornare il backend:

```bash
# Vai al backend
cd /Users/getmad/Projects/warp-mobile-ai-ide/backend

# Deploy con Cloud Build
gcloud builds submit --config cloudbuild.yaml

# Oppure deploy diretto
gcloud run deploy drape-ai-backend \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated
```

## 🔐 Autenticazione (Opzionale)

Per produzione, abilita autenticazione:

```bash
# Rimuovi accesso pubblico
gcloud run services update drape-ai-backend \
  --region us-central1 \
  --no-allow-unauthenticated

# L'app dovrà usare token di autenticazione
```

## 📊 Monitoring

### Logs
```bash
# Visualizza logs
gcloud run services logs read drape-ai-backend \
  --region us-central1 \
  --limit 50
```

### Metrics
```bash
# Apri console
gcloud run services describe drape-ai-backend \
  --region us-central1 \
  --format 'value(status.url)'
```

## 💰 Costi

Google Cloud Run pricing:
- **Free tier**: 2M requests/month
- **CPU**: $0.00002400/vCPU-second
- **Memory**: $0.00000250/GiB-second
- **Requests**: $0.40/million

Costo stimato per sviluppo: **~$5-10/mese**

## 🔧 Troubleshooting

### Backend non risponde
```bash
# Verifica status
gcloud run services describe drape-ai-backend --region us-central1

# Verifica logs
gcloud run services logs read drape-ai-backend --region us-central1
```

### Timeout
```bash
# Aumenta timeout (max 300s)
gcloud run services update drape-ai-backend \
  --region us-central1 \
  --timeout 300
```

### Memory issues
```bash
# Aumenta memoria
gcloud run services update drape-ai-backend \
  --region us-central1 \
  --memory 2Gi
```

## 📝 Note

- Il backend è **già deployato** dal progetto Flutter
- L'app React Native usa lo **stesso backend**
- Non serve deploy separato
- Basta configurare l'URL in `.env`

---

**Backend condiviso tra Flutter e React Native!** ✅
