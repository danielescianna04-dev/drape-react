# 🚀 Setup Produzione - Architettura a 2 Livelli

## 🏗️ Architettura

### **LIVELLO 1: Credenziali Sistema** (GitHub Secrets)
- Firebase project config
- Google Cloud service account  
- GitHub OAuth app
- Backend URLs

### **LIVELLO 2: Credenziali Utente** (Database Firebase)
- Token GitHub personali
- API keys AI personali
- Preferenze utente

## 🔐 Setup GitHub Secrets

### 1. Vai nel tuo repository GitHub
```
Settings → Secrets and variables → Actions → New repository secret
```

### 2. Aggiungi questi secrets:

#### **Firebase (Sistema)**
```
FIREBASE_API_KEY = "la_tua_firebase_api_key"
FIREBASE_AUTH_DOMAIN = "tuo-progetto.firebaseapp.com"  
FIREBASE_PROJECT_ID = "tuo-progetto-id"
FIREBASE_STORAGE_BUCKET = "tuo-progetto.appspot.com"
FIREBASE_MESSAGING_SENDER_ID = "123456789"
FIREBASE_APP_ID = "1:123456789:web:abcdef123456"
```

#### **Google Cloud (Sistema)**
```
GCP_PROJECT_ID = "tuo-gcp-project-id"
GCP_REGION = "us-central1"
```

#### **GitHub OAuth (Sistema)**
```
GITHUB_CLIENT_ID = "tuo_github_oauth_client_id"
```

#### **Backend (Sistema)**
```
API_URL = "https://tuo-backend.run.app"
WS_URL = "wss://tuo-backend.run.app"
```

## 🔄 Flusso di Build

### **Sviluppo:**
```bash
# Usa .env locale per sviluppo
npm start
```

### **Produzione:**
```bash
# GitHub Actions:
1. Legge secrets dal repository
2. Inietta variabili ambiente nell'app
3. Builda APK/IPA
4. Rimuove credenziali temporanee
5. Pubblica artifacts
```

## 👤 Gestione Utenti

### **Primo accesso utente:**
```typescript
1. Utente fa login con GitHub
2. App salva token GitHub nel database (criptato)
3. Utente può accedere ai suoi repository privati
4. Configurazioni personali salvate nel database
```

### **Accessi successivi:**
```typescript
1. App carica token dal database
2. Utente ha accesso immediato alle sue risorse
3. Preferenze e configurazioni ripristinate
```

## 🛡️ Sicurezza

### **Credenziali Sistema:**
- ✅ Mai visibili nell'app compilata
- ✅ Iniettate solo al build
- ✅ Gestite tramite GitHub Secrets
- ✅ Accesso controllato dal team

### **Credenziali Utente:**
- ✅ Salvate criptate nel database
- ✅ Ogni utente vede solo le sue
- ✅ Token con scadenza automatica
- ✅ Revoca possibile in qualsiasi momento

## 📱 Deploy

### **Android:**
```bash
# Automatico con GitHub Actions
git push origin main
# → Build automatico → APK pronto per Play Store
```

### **iOS:**
```bash
# Richiede certificati Apple in GitHub Secrets
APPLE_CERTIFICATE = "base64_encoded_cert"
APPLE_PROVISIONING_PROFILE = "base64_encoded_profile"
```

## 🔧 File Modificati

- ✅ `src/core/config/systemConfig.ts` - Configurazione sistema
- ✅ `src/core/config/userConfig.ts` - Configurazione utente  
- ✅ `src/core/firebase/firebase.ts` - Firebase con config sistema
- ✅ `.github/workflows/build-production.yml` - Build automatico

## 🎯 Vantaggi

### **Per Sviluppatori:**
- Setup una volta sola
- Credenziali sempre disponibili
- Build automatici
- Nessun file .env da gestire

### **Per Produzione:**
- Sicurezza massima
- Scalabilità utenti
- Configurazione dinamica
- Compliance app store

## 🚀 Prossimi Passi

1. **Configura GitHub Secrets** con le tue credenziali
2. **Testa build locale** con .env di sviluppo
3. **Push su main** per trigger build produzione
4. **Scarica APK** da GitHub Actions artifacts

**L'app sarà pronta per la pubblicazione!** 🎉
