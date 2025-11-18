# 🚀 Drape React - Guida Setup Completo

Questa guida ti aiuterà a configurare il progetto Drape React sul tuo computer con supporto completo per la preview dei progetti.

## 📋 Prerequisiti

- Node.js 18+ installato
- npm o yarn
- Python 3 (per progetti statici HTML)
- Expo CLI (`npm install -g expo-cli`)
- Un account Firebase (per autenticazione)
- Un account Google Cloud (opzionale, per workstation cloud)

## 🔧 Setup Iniziale

### 1. Clona il Repository

```bash
git clone https://github.com/danielescianna04-dev/drape-react.git
cd drape-react
```

### 2. Installa le Dipendenze

```bash
# Dipendenze principali
npm install

# Dipendenze backend
cd backend
npm install
cd ..
```

### 3. Configurazione IP Automatica

Il sistema rileva automaticamente l'IP della tua macchina locale. **Non serve configurare manualmente l'IP!**

#### Crea il file `.env` nella root del progetto:

```bash
# File: .env (nella root del progetto)

# Backend URL - Usa il tuo IP locale (il sistema lo rileva automaticamente)
# Se sei sulla stessa macchina, usa localhost
EXPO_PUBLIC_API_URL=http://localhost:3000

# Se accedi da un altro dispositivo sulla stessa rete, usa l'IP della macchina dove gira il backend
# Esempio: EXPO_PUBLIC_API_URL=http://192.168.1.XXX:3000

# Firebase (opzionale - richiesto per autenticazione GitHub)
FIREBASE_API_KEY=your_firebase_api_key_here
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id

# Google Cloud (opzionale - solo se usi workstation cloud)
GOOGLE_CLOUD_PROJECT=your_project_id
WORKSTATION_CLUSTER=cluster-name
WORKSTATION_CONFIG=config-name

# GitHub OAuth (opzionale - per autenticazione GitHub)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

#### Crea anche `.env` nella cartella `backend`:

```bash
# File: backend/.env

PORT=3000
GOOGLE_CLOUD_PROJECT=your_project_id
# Altri config se necessari
```

### 4. Trova il Tuo IP Locale

#### Su macOS/Linux:
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

#### Su Windows:
```bash
ipconfig | findstr IPv4
```

Cerca l'IP che inizia con `192.168.x.x` o `10.0.x.x`

### 5. Aggiorna `.env` con il Tuo IP

Se accedi dall'app mobile su un dispositivo diverso dalla macchina dove gira il backend:

```bash
# Nel file .env alla root
EXPO_PUBLIC_API_URL=http://IL_TUO_IP:3000
```

Esempio:
```bash
EXPO_PUBLIC_API_URL=http://192.168.1.105:3000
```

## 🚀 Avvio del Sistema

### Terminale 1 - Backend:
```bash
cd backend
node server.js
```

Vedrai:
```
🚀 Drape Backend running on port 3000
📍 Health check: http://localhost:3000/health
🌐 Network access: http://YOUR_IP:3000/health
```

**Copia l'IP che vedi** in "Network access" e usalo nel file `.env`!

### Terminale 2 - App Expo:
```bash
npm start
# oppure
npx expo start
```

Scansiona il QR code con Expo Go app sul tuo telefono.

## 🔍 Verifica Setup

1. **Verifica Backend**:
   ```bash
   curl http://localhost:3000/health
   ```
   Dovresti vedere: `{"status":"ok"}`

2. **Verifica IP Automatico**:
   Il backend mostrerà nel log qualcosa come:
   ```
   🔗 Replaced 0.0.0.0 with 192.168.1.105: http://192.168.1.105:8000
   ```

3. **Testa Preview**:
   - Apri un progetto nell'app
   - Premi l'icona Preview
   - Clicca "Avvia Server"
   - Il sistema dovrebbe rilevare automaticamente l'IP e mostrare il preview

## 🐛 Troubleshooting

### Problema: Preview mostra "Anteprima non disponibile"

**Soluzione 1**: Verifica che il backend sia in esecuzione
```bash
curl http://IL_TUO_IP:3000/health
```

**Soluzione 2**: Verifica il file `.env`
- Assicurati che `EXPO_PUBLIC_API_URL` punti all'IP corretto
- Riavvia l'app Expo dopo aver modificato `.env`

**Soluzione 3**: Firewall/Rete
- Disabilita temporaneamente il firewall
- Assicurati che telefono e PC siano sulla stessa rete WiFi

### Problema: Backend crasha quando avvio preview

Questo è stato fixato! Il backend ora:
- Protegge automaticamente le porte 3000 (backend) e 8081 (main app) dalla chiusura
- Avvia TUTTI i server di sviluppo in background (React, Vue, Next.js, Python, PHP, etc.)
- Non usa più timeout che uccidono i server prima che partano

Se succede ancora:
```bash
# Killa tutti i processi Node.js e riavvia
pkill -9 node
cd backend && node server.js
```

### Problema: Porta già in uso

```bash
# macOS/Linux
lsof -ti:3000 | xargs kill -9

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

## 📱 Porte Utilizzate

- **3000**: Backend principale
- **8081**: Main app Expo (NON toccare!)
- **8085**: Preview progetti React Native/Expo
- **8000**: Preview progetti HTML statici (Python)
- **8080**: Preview progetti React/Next.js/Vue/altri

## 🎯 Come Funziona la Preview

1. L'app rileva automaticamente il tipo di progetto (React, Vue, Python, etc.)
2. Il backend estrae la porta dal comando di start
3. Il backend pulisce la porta (SOLO se non è 3000 o 8081)
4. Il backend avvia il server di sviluppo **in background** (detached mode)
5. Il server rimane in esecuzione indefinitamente (non viene più killato da timeout!)
6. Il backend fa health check sulla porta
7. Il backend **rileva automaticamente l'IP locale** e lo usa nel preview URL
8. L'app mostra il preview nel WebView

## ✅ Checklist Setup Completato

- [ ] Node.js installato
- [ ] Repository clonato
- [ ] Dipendenze installate (`npm install` nella root e in `backend/`)
- [ ] File `.env` creato nella root
- [ ] File `backend/.env` creato
- [ ] IP locale trovato e configurato in `.env`
- [ ] Backend avviato e risponde a `/health`
- [ ] App Expo avviata
- [ ] App connessa via Expo Go
- [ ] Test preview funzionante

## 📞 Supporto

Se hai problemi, controlla i log del backend - ti dicono esattamente cosa sta succedendo:
- Quale IP è stato rilevato
- Quale porta è stata estratta
- Se il cleanup è andato a buon fine
- Se il server è partito correttamente
- Se l'health check è passato

I log sono **molto dettagliati** e ti aiuteranno a capire dove si blocca il processo!
