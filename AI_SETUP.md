# 🤖 AI Setup - Claude, Gemini, GPT

Il backend supporta **3 provider AI**:
- ✅ **Google Gemini** (Raccomandato - Free tier generoso)
- ✅ **Anthropic Claude** (Migliore per coding)
- ✅ **OpenAI GPT-4** (Più costoso)

## 🚀 Quick Start

### 1. Ottieni API Keys

#### Google Gemini (GRATIS)
1. Vai su https://makersuite.google.com/app/apikey
2. Clicca "Create API Key"
3. Copia la chiave

#### Anthropic Claude
1. Vai su https://console.anthropic.com/
2. Crea account
3. Settings → API Keys → Create Key
4. Copia la chiave

#### OpenAI GPT
1. Vai su https://platform.openai.com/api-keys
2. Create new secret key
3. Copia la chiave

### 2. Configura Backend

Crea `.env` in `backend-mock/`:

```env
PORT=3000
NODE_ENV=development

# Configura ALMENO UNO di questi:

# Google Gemini (Raccomandato)
GOOGLE_AI_API_KEY=AIzaSy...

# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI GPT
OPENAI_API_KEY=sk-...
```

### 3. Avvia Backend

```bash
cd backend-mock
npm install
npm start
```

Vedrai:
```
✅ Gemini service initialized
🤖 AI Agent initialized with 1 providers
```

## 🎯 Test AI

Nella app, prova:

### Chat Mode
```
Come creare un server Express?
Spiega async/await in JavaScript
Debug questo errore: TypeError...
```

### Agent Mode
```
Crea un'app React con routing
Installa e configura Tailwind CSS
Fai il setup di un progetto Node.js
```

## 📊 Modelli Disponibili

### Google Gemini
- **gemini-pro** - Veloce, gratis, ottimo per coding
- **gemini-1.5-pro** - Più potente, context window 1M tokens

### Anthropic Claude
- **claude-3-opus** - Migliore qualità, più costoso
- **claude-3-sonnet** - Bilanciato
- **claude-3-haiku** - Veloce ed economico

### OpenAI GPT
- **gpt-4-turbo** - Più recente e veloce
- **gpt-4** - Migliore qualità
- **gpt-3.5-turbo** - Veloce ed economico

## 🔄 Switching Models

Nel frontend, cambia modello:

```typescript
const { selectedModel, setSelectedModel } = useTerminalStore();

// Cambia a Claude
setSelectedModel('claude-3-sonnet');

// Cambia a Gemini
setSelectedModel('gemini-pro');

// Cambia a GPT
setSelectedModel('gpt-4-turbo');
```

## 💰 Costi

### Google Gemini
- **FREE**: 60 richieste/minuto
- Dopo: $0.00025 per 1K caratteri

### Anthropic Claude
- **Haiku**: $0.25 / 1M input tokens
- **Sonnet**: $3 / 1M input tokens
- **Opus**: $15 / 1M input tokens

### OpenAI GPT
- **GPT-3.5**: $0.50 / 1M tokens
- **GPT-4**: $30 / 1M input tokens
- **GPT-4 Turbo**: $10 / 1M input tokens

## 🎨 Features AI

### Chat Intelligente
- Riconosce automaticamente domande vs comandi
- Context-aware (conosce il tuo progetto)
- Syntax highlighting nelle risposte
- Code snippets formattati

### AI Agent (Autonomo)
- Esegue task complessi automaticamente
- Chiede conferma prima di comandi pericolosi
- Itera fino a completare il task
- Max 10 iterazioni per sicurezza

### Code Analysis
- Suggerimenti in tempo reale
- Error detection
- Best practices
- Refactoring suggestions

## 🔐 Sicurezza API Keys

**IMPORTANTE**: Non committare mai le API keys!

```bash
# .gitignore già include:
.env
.env.local
.env.*.local
```

Per produzione, usa:
- Google Cloud Secret Manager
- AWS Secrets Manager
- Environment variables su Cloud Run

## 🐛 Troubleshooting

### "AI service not available"
```bash
# Verifica .env
cat backend-mock/.env

# Deve contenere almeno una chiave valida
GOOGLE_AI_API_KEY=AIzaSy...
```

### "Invalid API key"
- Verifica che la chiave sia corretta
- Controlla che non ci siano spazi extra
- Rigenera la chiave se necessario

### "Rate limit exceeded"
- Gemini: 60 req/min (free tier)
- Aspetta 1 minuto o usa altro provider
- Upgrade a paid tier

## 🚀 Deploy su Google Cloud

```bash
# 1. Crea secret per API key
gcloud secrets create gemini-api-key \
  --data-file=- <<< "YOUR_API_KEY"

# 2. Deploy con secret
gcloud run deploy drape-backend \
  --image gcr.io/drape-mobile-ide/drape-backend \
  --update-secrets=GOOGLE_AI_API_KEY=gemini-api-key:latest \
  --region us-central1
```

## 📚 Esempi Prompt

### Coding
```
Crea un componente React per un form di login
Spiega come funziona useEffect
Debug questo errore: Cannot read property 'map' of undefined
```

### Terminal
```
Come installare PostgreSQL?
Setup progetto Next.js con TypeScript
Configura ESLint e Prettier
```

### Agent Mode
```
Crea un'API REST con Express e MongoDB
Setup testing con Jest
Deploy su Vercel
```

## ✅ Best Practices

1. **Usa Gemini per sviluppo** (gratis e veloce)
2. **Claude per produzione** (migliore qualità code)
3. **GPT-4 per task complessi** (reasoning migliore)
4. **Limita context** (meno token = meno costi)
5. **Cache risposte** (evita richieste duplicate)

## 🎯 Risultato

Ora hai un IDE mobile con AI integrata che:
- ✅ Risponde a domande di coding
- ✅ Esegue task autonomamente
- ✅ Suggerisce codice in tempo reale
- ✅ Supporta 3 provider AI
- ✅ Funziona offline (solo comandi)

🚀 Pronto per sviluppare con l'AI! ✨
