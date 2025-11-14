const express = require('express');
const cors = require('cors');
const axios = require('axios');
const http = require('http');
const WebSocket = require('ws');
require('dotenv').config();
const { VertexAI } = require('@google-cloud/vertexai');
const { GoogleAuth } = require('google-auth-library');
const admin = require('firebase-admin');

// Import Claude Code-style helpers
const {
    isDuplicateRequest,
    summarizeMessages,
    createSystemBlocks,
    handleAPIError,
    trackRequest,
    getTelemetry,
    getCachedToolResult,
    setCachedToolResult,
    pruneMessages,
    getAdaptiveContextSize,
    trackUserCost,
    getUserCostStats
} = require('./claude-helpers');

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'drape-mobile-ide'
  });
}
const db = admin.firestore();

// Google Cloud Configuration
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'drape-93229';
const LOCATION = 'us-central1';
const CLUSTER = process.env.WORKSTATION_CLUSTER || 'cluster-mh0wcmlm';
const CONFIG = process.env.WORKSTATION_CONFIG || 'config-mh0xdxfl';

// Initialize Google Auth
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

// Initialize Vertex AI
const vertex_ai = new VertexAI({ 
  project: PROJECT_ID, 
  location: LOCATION 
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    project: PROJECT_ID,
    timestamp: new Date().toISOString()
  });
});

// Telemetry/Analytics endpoint (like Claude Code)
app.get('/stats', (req, res) => {
  const stats = getTelemetry();
  res.json({
    ...stats,
    timestamp: new Date().toISOString()
  });
});

// User Cost Stats endpoint (OPTIMIZATION 12: Cost Budgeting)
app.get('/user-costs/:userId', (req, res) => {
  const { userId } = req.params;
  const userStats = getUserCostStats(userId);
  res.json({
    userId,
    totalCost: `$${userStats.total.toFixed(4)}`,
    requests: userStats.requests,
    averageCostPerRequest: userStats.requests > 0 ? `$${(userStats.total / userStats.requests).toFixed(4)}` : '$0.0000',
    timestamp: new Date().toISOString()
  });
});

// AI Chat endpoint
// DISABLED - Old endpoint that conflicts with the newer one below (line 252)
// app.post('/ai/chat', async (req, res) => {
//   try {
//     const { message, model = 'gemini-pro', projectContext } = req.body;
//
//     console.log('AI Chat request:', { message, model, projectContext });
//
//     // Get Vertex AI model
//     const generativeModel = vertex_ai.getGenerativeModel({ model });
//
//     // Add project context to message
//     const contextualMessage = projectContext ?
//       `Project Context: ${JSON.stringify(projectContext)}\n\nUser: ${message}` :
//       message;
//
//     // Generate response
//     const result = await generativeModel.generateContent(contextualMessage);
//     const response = result.response;
//
//     res.json({
//       success: true,
//       response: response.text(),
//       model: model,
//       timestamp: new Date().toISOString()
//     });
//
//   } catch (error) {
//     console.error('AI Chat error:', error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//       timestamp: new Date().toISOString()
//     });
//   }
// });

// DISABLED - Old simple endpoint that just returns "Command completed successfully"
// Use the more complete endpoint at line 343 instead
// app.post('/terminal/execute', async (req, res) => {
//   try {
//     const { command, workstationId, language = 'bash' } = req.body;
//
//     console.log('Terminal execute:', { command, workstationId, language });
//
//     // Simulate command execution
//     // In production, this would execute in a container
//     const output = `Executing: ${command}\n✅ Command completed successfully`;
//
//     res.json({
//       success: true,
//       output: output,
//       workstationId: workstationId,
//       timestamp: new Date().toISOString()
//     });
//
//   } catch (error) {
//     console.error('Terminal execute error:', error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//       timestamp: new Date().toISOString()
//     });
//   }
// });

// Container management endpoints
app.post('/containers/start', async (req, res) => {
  try {
    const { projectId, language } = req.body;
    
    console.log('Starting container:', { projectId, language });
    
    // Simulate container startup
    setTimeout(() => {
      console.log(`Container ${projectId} started`);
    }, 2000);
    
    res.json({
      success: true,
      containerId: `container-${projectId}`,
      status: 'starting',
      webUrl: `http://localhost:${3000 + Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Container start error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/containers/stop', async (req, res) => {
  try {
    const { containerId } = req.body;
    
    console.log('Stopping container:', containerId);
    
    res.json({
      success: true,
      containerId: containerId,
      status: 'stopped',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Container stop error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server (commentato - usa quello alla fine del file)
/*
app.listen(PORT, () => {
  console.log(`🚀 Drape Backend running on port ${PORT}`);
  console.log(`📊 Project: ${PROJECT_ID}`);
  console.log(`🤖 Vertex AI: Ready`);
  console.log(`🔗 Health: http://localhost:${PORT}/health`);
});
*/
// GitHub OAuth Device Flow - Start
app.post('/github/device-flow', async (req, res) => {
  try {
    console.log('🔐 GitHub Device Flow - Start');
    console.log('Client ID:', GITHUB_CLIENT_ID);
    console.log('Scope:', req.body.scope);

    if (!GITHUB_CLIENT_ID) {
      console.error('❌ GITHUB_CLIENT_ID is not set in environment variables');
      return res.status(500).json({ error: 'GitHub Client ID not configured on server' });
    }

    const response = await axios.post(
      'https://github.com/login/device/code',
      new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        scope: req.body.scope,
      }),
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    console.log('✅ Device flow response:', response.data);
    res.json(response.data);
  } catch (error) {
    console.error('❌ Device flow error:', error.response?.data || error.message);
    res.status(500).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

// GitHub OAuth Device Flow - Poll
app.post('/github/poll-device', async (req, res) => {
  try {
    const response = await axios.post(
      'https://github.com/login/oauth/access_token',
      new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        device_code: req.body.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Poll device error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GitHub OAuth - Exchange code for token
app.post('/github/exchange-code', async (req, res) => {
  try {
    const { code, redirect_uri } = req.body;

    console.log('🔄 Exchanging GitHub code for token');
    console.log('Code:', code?.substring(0, 10) + '...');
    console.log('Redirect URI:', redirect_uri);
    console.log('Client ID:', GITHUB_CLIENT_ID);

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      console.error('❌ Missing GitHub credentials');
      return res.status(500).json({ error: 'GitHub credentials not configured' });
    }

    const response = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code: code,
        redirect_uri: redirect_uri,
      },
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );

    console.log('✅ Token exchange successful');
    res.json(response.data);
  } catch (error) {
    console.error('❌ Exchange code error:', error.response?.data || error.message);
    res.status(500).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

// Import Claude SDK
const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// AI Chat endpoint - Using Claude 3.5 Sonnet with native tool calling
app.post('/ai/chat', async (req, res) => {
    const { prompt, conversationHistory = [], workstationId, context, projectId, repositoryUrl } = req.body;
    // Use Claude Sonnet 4.0 (latest model)
    // Note: Model IDs available depend on API tier
    const model = 'claude-sonnet-4-20250514';

    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    // 🚀 OPTIMIZATION 5: Request deduplication (like Claude Code)
    // Prevent duplicate requests within 2 seconds
    const sessionId = workstationId || projectId || 'default';
    if (isDuplicateRequest(sessionId, prompt)) {
        console.log('⚠️ Duplicate request detected - ignoring');
        return res.status(429).json({ error: 'Duplicate request - please wait' });
    }

    try {
        // Build system message with project context and tool capabilities
        let systemMessage = `Sei un assistente AI esperto di programmazione.

IMPORTANTE: Rispondi SEMPRE in italiano corretto e fluente. Usa grammatica italiana perfetta, evita errori di ortografia e usa un tono professionale ma amichevole.

Linee guida per le risposte:
- Scrivi in italiano standard senza errori
- Usa terminologia tecnica appropriata
- Sii chiaro e conciso
- Quando non sei sicuro di qualcosa, ammettilo onestamente

📱 FORMATTAZIONE MOBILE-FRIENDLY (OBBLIGATORIO):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Stai rispondendo su un DISPOSITIVO MOBILE con schermo piccolo.

❌ VIETATO usare markdown complesso:
   • NO ### titoli multipli
   • NO --- separatori
   • NO ** grassetto eccessivo
   • NO liste con - - - troppo indentate
   • NO box con simboli ASCII
   • NO formattazione tipo "### ❌ File .env" con emoji grandi

✅ USA SOLO formattazione semplice e leggibile:
   • Paragrafi brevi (max 3-4 righe)
   • Liste semplici con emoji: 📂 📄 ✅ ❌ 🔧 💡
   • Emoji INLINE nel testo, non su righe separate
   • Spazi bianchi tra sezioni
   • Testo chiaro senza simboli decorativi

❌ ESEMPIO SBAGLIATO (illeggibile su mobile):
### ❌ File .env
Non è presente alcun file '.env' nel progetto (è ignorato dal .gitignore).

### ✅ File .env.example (root del progetto)
Contiene la configurazione per l'app React Native/Expo:
- **Backend**: URL API e WebSocket (localhost:3000)
- **GitHub OAuth**: Client ID per autenticazione
[...]

✅ ESEMPIO CORRETTO (leggibile su mobile):
File .env trovati:

❌ .env - Non presente nel progetto (ignorato da .gitignore)

✅ .env.example - Configurazione per l'app React Native/Expo
   📂 Backend: URL API e WebSocket (localhost:3000)
   🔑 GitHub OAuth: Client ID per autenticazione
   ☁️ Google Cloud: Project ID e region
   🔥 Firebase: Configurazione completa

REGOLE D'ORO:
1. Un concetto = una riga
2. Emoji inline per chiarezza
3. NO formattazione markdown complessa
4. Testo fluido e scorrevole`;

        if (context) {
            systemMessage += `\n\nContesto Progetto:\n- Nome: ${context.projectName}\n- Linguaggio: ${context.language}`;
            if (context.repositoryUrl) {
                systemMessage += `\n- Repository: ${context.repositoryUrl}`;
            }

            systemMessage += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
            systemMessage += '🔍 ESPLORAZIONE AUTONOMA DEL CODEBASE (Claude Code Style)\n';
            systemMessage += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

            systemMessage += '🚨🚨🚨 REGOLA FONDAMENTALE - LEGGI ATTENTAMENTE! 🚨🚨🚨\n\n';
            systemMessage += '❌ VIETATO rispondere a domande esplorative senza aver letto ALMENO 10 FILE!\n';
            systemMessage += '❌ VIETATO basarti solo su package.json e glob!\n';
            systemMessage += '❌ VIETATO fermarti dopo i primi 3 tool calls!\n';
            systemMessage += '⚡ OBBLIGO: USA MULTIPLI TOOL CONTEMPORANEAMENTE! Non usare UN tool per volta!\n';
            systemMessage += '⚡ ESEMPIO: Invece di chiamare read_file 5 volte separate, chiamale tutte insieme!\n\n';
            systemMessage += '✅ OBBLIGO: Per domande come "Cosa fa questa applicazione?", DEVI:\n';
            systemMessage += '   1. Leggere package.json ✓\n';
            systemMessage += '   2. Fare glob per trovare file ✓\n';
            systemMessage += '   3. Leggere App.tsx (OBBLIGATORIO!)\n';
            systemMessage += '   4. Cercare e leggere ALMENO 3-5 file Service\n';
            systemMessage += '   5. Leggere backend/server.js se esiste\n';
            systemMessage += '   6. Leggere almeno 3 componenti principali\n';
            systemMessage += '   7. Esplorare le feature più importanti\n';
            systemMessage += '   → MINIMO 10 FILE LETTI prima di rispondere!\n\n';
            systemMessage += '⚠️ Se non leggi abbastanza file, la tua risposta sarà INCOMPLETA e SUPERFICIALE!\n\n';

            systemMessage += '🚨 COMPORTAMENTO VISIBILE - MOSTRA PROGRESSO SENZA SPIEGARE TUTTO:\n\n';
            systemMessage += '✅ OBBLIGO: Dopo OGNI tool call, scrivi SOLO 5-8 PAROLE per dire cosa hai trovato\n';
            systemMessage += '✅ NON spiegare i dettagli del file! Dì solo COSA hai trovato, non COME funziona\n';
            systemMessage += '✅ Usa emoji: 📂 🔍 ✅ 🔧 💡\n';
            systemMessage += '✅ Risposta DETTAGLIATA solo ALLA FINE, dopo aver esplorato tutto!\n\n';
            systemMessage += '❌ VIETATO scrivere paragrafi lunghi DURANTE l\'esplorazione!\n';
            systemMessage += '❌ VIETATO spiegare cosa contiene ogni file!\n';
            systemMessage += '✅ PERMESSO: brevi indicatori di progresso tipo "Trovato servizio AI", "Letto config"\n\n';
            systemMessage += '❌ ESEMPIO SBAGLIATO (silenzioso):\n';
            systemMessage += 'User: "Cosa fa questa applicazione?"\n';
            systemMessage += 'Tu: "Esplorerò il codebase."\n';
            systemMessage += 'Tu: [Chiama read_file(package.json)]\n';
            systemMessage += '[Sistema mostra contenuto]\n';
            systemMessage += 'Tu: [Chiama glob_files(**/*.ts)] <- ❌ NESSUN COMMENTO!\n';
            systemMessage += '[Sistema mostra file]\n';
            systemMessage += 'Tu: [Chiama read_file(App.tsx)] <- ❌ NESSUN COMMENTO!\n';
            systemMessage += '👆 VIETATO! L\'utente non vede cosa stai pensando!\n\n';
            systemMessage += '✅ ESEMPIO CORRETTO (visibile MA conciso):\n';
            systemMessage += 'User: "Cosa fa questa applicazione?"\n';
            systemMessage += 'Tu: "📂 Esploro il codebase"\n';
            systemMessage += 'Tu: [Chiama read_file(package.json)]\n';
            systemMessage += '[Sistema mostra contenuto]\n';
            systemMessage += 'Tu: "✅ React Native + Expo"\n';
            systemMessage += 'Tu: [Chiama glob_files(**/*.ts)]\n';
            systemMessage += '[Sistema mostra file]\n';
            systemMessage += 'Tu: "🔍 25 file TS trovati"\n';
            systemMessage += 'Tu: [Chiama read_file(App.tsx)]\n';
            systemMessage += '[Sistema mostra App.tsx]\n';
            systemMessage += 'Tu: "💡 È un IDE mobile"\n';
            systemMessage += 'Tu: [read_file(aiService.ts)]\n';
            systemMessage += 'Tu: "🤖 Integrazione AI trovata"\n';
            systemMessage += '... più tool calls con commenti BREVI (5-8 parole) ...\n';
            systemMessage += 'Tu: "Ecco la sintesi completa: [RISPOSTA DETTAGLIATA QUI]"\n\n';
            systemMessage += '⚠️ DURANTE l\'esplorazione: max 5-8 parole per commento\n';
            systemMessage += '⚠️ ALLA FINE: risposta completa e dettagliata\n\n';
            systemMessage += '🎯 REGOLA D\'ORO: Brief comment → Tool call → Brief comment → Tool call → ...\n';
            systemMessage += '1. Commento iniziale (1 riga)\n';
            systemMessage += '2. Tool call\n';
            systemMessage += '3. Breve commento su cosa hai trovato (1-2 righe)\n';
            systemMessage += '4. Ripeti tool call + commento\n';
            systemMessage += '5. Sintesi finale completa\n\n';

            systemMessage += '📋 DOMANDE ESPLORATIVE (richiedono esplorazione automatica):\n';
            systemMessage += '• "Cosa fa questa applicazione?"\n';
            systemMessage += '• "Come funziona il sistema di autenticazione?"\n';
            systemMessage += '• "Quali API sono disponibili?"\n';
            systemMessage += '• "Qual è l\'architettura del progetto?"\n';
            systemMessage += '• "Dove viene gestito X?"\n';
            systemMessage += '• "Come è strutturato il codice?"\n';
            systemMessage += '• Qualsiasi domanda che richiede comprensione del codebase\n\n';

            systemMessage += '🎯 PROCESSO DI ESPLORAZIONE (esegui SEMPRE questi step):\n\n';

            systemMessage += '1️⃣ STEP 1 - Esplora la struttura base (USA I TOOL SUBITO!):\n';
            systemMessage += '   a) Leggi package.json per capire dipendenze e nome progetto\n';
            systemMessage += '      → read_file(package.json)\n';
            systemMessage += '   b) Trova tutti i file TypeScript/JavaScript:\n';
            systemMessage += '      → glob_files(**/*.ts)\n';
            systemMessage += '      → glob_files(**/*.tsx)\n';
            systemMessage += '      → glob_files(**/*.js)\n\n';

            systemMessage += '2️⃣ STEP 2 - Analizza entry points e servizi core (APPROFONDISCI!):\n';
            systemMessage += '   a) Leggi il file principale (App.tsx, index.ts, main.ts, ecc.)\n';
            systemMessage += '      → read_file(App.tsx) o read_file(src/index.ts)\n';
            systemMessage += '   b) Cerca e leggi servizi importanti:\n';
            systemMessage += '      → search_in_files(Service) per trovare servizi\n';
            systemMessage += '      → read_file() sui file di servizio trovati (leggi ALMENO 3-5 servizi!)\n';
            systemMessage += '   c) Se esiste un backend, leggilo:\n';
            systemMessage += '      → glob_files(backend/**/*.js)\n';
            systemMessage += '      → read_file(backend/server.js) o simile\n';
            systemMessage += '   d) Esplora componenti e features importanti:\n';
            systemMessage += '      → list_files(src/features) per vedere le feature disponibili\n';
            systemMessage += '      → read_file() sui componenti principali di ogni feature\n';
            systemMessage += '   e) Cerca pattern e funzionalità chiave:\n';
            systemMessage += '      → search_in_files(API) per trovare chiamate API\n';
            systemMessage += '      → search_in_files(auth) per trovare autenticazione\n';
            systemMessage += '      → search_in_files(database) per trovare database logic\n\n';

            systemMessage += '3️⃣ STEP 3 - Analizza configurazioni:\n';
            systemMessage += '   → read_file(src/config/config.ts) se esiste\n';
            systemMessage += '   → search_in_files(apiUrl) per trovare configurazioni\n\n';

            systemMessage += '4️⃣ STEP 4 - Aggrega e sintetizza:\n';
            systemMessage += '   Dopo aver raccolto i dati, fornisci una risposta strutturata basata\n';
            systemMessage += '   ESCLUSIVAMENTE su ciò che hai trovato nel codice reale.\n\n';

            systemMessage += '💡 ESEMPIO COMPLETO di risposta a "Cosa fa questa applicazione?":\n\n';
            systemMessage += 'User: "Cosa fa questa applicazione?"\n';
            systemMessage += 'Tu: "📂 Inizio ad esplorare il progetto..."\n';
            systemMessage += 'Tu: [chiama read_file(package.json)]\n';
            systemMessage += '[Sistema mostra package.json]\n';
            systemMessage += 'Tu: "✅ È un progetto React Native con Expo. Cerco i file TypeScript..."\n';
            systemMessage += 'Tu: [chiama glob_files(**/*.ts)]\n';
            systemMessage += '[Sistema mostra 25 file]\n';
            systemMessage += 'Tu: "🔍 Trovati 25 file TS. Leggo App.tsx per capire la struttura..."\n';
            systemMessage += 'Tu: [chiama read_file(App.tsx)]\n';
            systemMessage += '[Sistema mostra App.tsx con 334 righe]\n';
            systemMessage += 'Tu: "💡 Ho visto che gestisce navigazione e tabs. Cerco i servizi principali..."\n';
            systemMessage += 'Tu: [chiama search_in_files(Service)]\n';
            systemMessage += '[Sistema mostra file con "Service"]\n';
            systemMessage += 'Tu: "📋 Trovati aiService, workstationService, githubService. Leggo aiService..."\n';
            systemMessage += 'Tu: [chiama read_file(src/core/ai/aiService.ts)]\n';
            systemMessage += '[Sistema mostra aiService.ts]\n';
            systemMessage += 'Tu: "🤖 Vedo chiamate AI per chat. Controllo il backend..."\n';
            systemMessage += 'Tu: [chiama read_file(backend/server.js)]\n';
            systemMessage += '[Sistema mostra server.js]\n';
            systemMessage += 'Tu: "🔧 Backend usa Gemini 2.0 Flash. Ora sintetizzo tutto..."\n\n';
            systemMessage += 'Tu: "Ecco l\'analisi completa:\n\nQuesta applicazione è un IDE mobile AI-powered chiamato Drape...\n';
            systemMessage += '[descrizione completa dettagliata basata su TUTTI i file letti]"\n\n';
            systemMessage += '⚡ NOTA CRITICA: Nell\'esempio sopra, ci sono SEMPRE brevi commenti tra i tool calls\n';
            systemMessage += 'per far vedere all\'utente il progresso dell\'esplorazione!\n\n';

            systemMessage += '❌ ERRORI DA EVITARE:\n';
            systemMessage += '• NON rispondere senza prima esplorare il codice\n';
            systemMessage += '• NON basarti solo sul nome del progetto o su supposizioni\n';
            systemMessage += '• NON limitarti a leggere 1-2 file - esplora in modo completo\n';
            systemMessage += '• NON dire "non ho accesso al codice" - HAI gli strumenti!\n';
            systemMessage += '• ❌❌❌ VIETATO ASSOLUTO: NON FARE MAI ESEMPI/DEMO DI TOOL CALLS!\n';
            systemMessage += '• ❌❌❌ NON scrivere "Ecco come usare i tool:" o spiegare i tool!\n';
            systemMessage += '• ❌❌❌ DOPO l\'esplorazione scrivi SOLO la sintesi, NON esempi di tool!\n\n';

            systemMessage += '✅ QUANDO PUOI RISPONDERE DIRETTAMENTE (senza esplorazione):\n';
            systemMessage += '• Domande teoriche di programmazione ("Come funziona async/await?")\n';
            systemMessage += '• Richieste di creazione di nuovo codice senza contesto esistente\n';
            systemMessage += '• Conversazione generale non legata al codebase\n\n';

            systemMessage += '\n\n🔧 STRUMENTI DISPONIBILI (come Claude Code):\n\n';
            systemMessage += '1. read_file(path)\n';
            systemMessage += '   → Leggi il contenuto di un file\n';
            systemMessage += '   → Esempio: read_file(src/app.js)\n\n';

            systemMessage += '2. edit_file(path, oldString, newString) ⭐ PREFERISCI QUESTO!\n';
            systemMessage += '   → Modifica file esistente con search & replace\n';
            systemMessage += '   → Esempio: edit_file(app.js, "const x = 1", "const x = 2")\n';
            systemMessage += '   → ✅ Veloce, preciso, diff automatico\n';
            systemMessage += '   → ✅ Non devi riscrivere tutto il file!\n';
            systemMessage += '   → ⚠️ La stringa oldString DEVE esistere esattamente nel file\n';
            systemMessage += '   → ⚠️ FUNZIONA SOLO SU FILE ESISTENTI - verifica con read_file() prima!\n';
            systemMessage += '   → 🚫 Se read_file() fallisce → USA write_file() invece\n\n';

            systemMessage += '3. write_file(path, content)\n';
            systemMessage += '   → Crea NUOVI file o riscrive completamente file esistenti\n';
            systemMessage += '   → ⚠️ SOVRASCRIVE tutto il contenuto!\n';
            systemMessage += '   → Usa solo per: file nuovi, refactoring completo\n';
            systemMessage += '   → ✅ Se un file NON esiste ancora, USA QUESTO!\n';
            systemMessage += '   → Esempio: write_file(new.js, "console.log(\'hello\')")\n\n';

            systemMessage += '4. list_files(directory)\n';
            systemMessage += '   → Elenca file in una directory\n';
            systemMessage += '   → Esempio: list_files(.)\n\n';

            systemMessage += '5. search_in_files(pattern)\n';
            systemMessage += '   → Cerca pattern nei file del progetto\n';
            systemMessage += '   → Esempio: search_in_files(home)\n\n';

            systemMessage += '6. execute_command(command)\n';
            systemMessage += '   → Esegui comando bash nel progetto\n';
            systemMessage += '   → Esempio: execute_command(npm install)\n\n';

            systemMessage += '💡 QUANDO USARE OGNI TOOL:\n';
            systemMessage += '• File ESISTE e vuoi modificarlo → edit_file() ⭐\n';
            systemMessage += '• File NON ESISTE ancora → write_file() ✅\n';
            systemMessage += '• Aggiungere/modificare righe → edit_file() ⭐ (solo se file esiste!)\n';
            systemMessage += '• Cambiare una funzione → edit_file() ⭐ (solo se file esiste!)\n';
            systemMessage += '• Creare file nuovo → write_file() ✅\n';
            systemMessage += '• Refactoring completo → write_file()\n\n';
            systemMessage += '⚠️ IMPORTANTE - Come usare gli strumenti:\n';
            systemMessage += '1. PRIMA annuncia cosa stai per fare (es: "Leggo il file deploy_now.md")\n';
            systemMessage += '2. POI chiama lo strumento scrivendo SOLO il nome e i parametri\n';
            systemMessage += '   → Esempio CORRETTO: search_in_files(home)\n';
            systemMessage += '   → ❌ NON usare markdown: ```bash\\nsearch_in_files(home)\\n```\n';
            systemMessage += '   → ❌ NON usare comandi shell diretti come: grep -r "home" .\n';
            systemMessage += '   → ✅ USA SOLO: search_in_files(home)\n';
            systemMessage += '3. DOPO che lo strumento ha restituito il risultato, spiega cosa hai trovato\n';
            systemMessage += '4. NON mostrare mai il contenuto completo del file, il sistema lo mostrerà\n';
            systemMessage += '5. NON ripetere il contenuto che hai letto, commenta solo cosa contiene\n\n';
            systemMessage += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
            systemMessage += '📖 ESEMPI DI UTILIZZO:\n';
            systemMessage += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

            systemMessage += 'Esempio 1: GLOB + READ ⭐ (quando non conosci il path esatto)\n';
            systemMessage += 'Utente: "Leggi il file deploy.txt"\n';
            systemMessage += 'Tu: "Cerco prima il file"\n';
            systemMessage += 'Tu: glob_files(**/deploy.txt)\n';
            systemMessage += '[Sistema mostra: Found 1 file(s): deploy.txt]\n';
            systemMessage += 'Tu: "Ora leggo"\n';
            systemMessage += 'Tu: read_file(deploy.txt)\n';
            systemMessage += 'Tu: "Il file contiene le istruzioni"\n\n';

            systemMessage += 'Esempio 2: READ diretto (solo se conosci GIÀ il path completo)\n';
            systemMessage += 'Utente: "Leggi src/app.js"\n';
            systemMessage += 'Tu: read_file(src/app.js)\n\n';

            systemMessage += 'Esempio 3: GLOB per trovare file TypeScript\n';
            systemMessage += 'Utente: "Mostrami tutti i file TypeScript"\n';
            systemMessage += 'Tu: glob_files(**/*.ts)\n';
            systemMessage += '[Sistema mostra: Found 15 file(s)]\n\n';

            systemMessage += 'Esempio 4: EDIT ⭐ (PREFERITO per modifiche)\n';
            systemMessage += 'Utente: "Aggiungi Leon alla fine del file deploy.txt"\n';
            systemMessage += 'Tu: "Leggo prima il file"\n';
            systemMessage += 'Tu: read_file(deploy.txt)\n';
            systemMessage += '[Sistema mostra in READ format il contenuto: "Il file contiene istruzioni"]\n';
            systemMessage += 'Tu: "Ora aggiungo Leon alla fine usando edit_file"\n';
            systemMessage += 'Tu: edit_file(deploy.txt, Il file contiene istruzioni, Il file contiene istruzioni\\nLeon)\n';
            systemMessage += '       ↑↑↑ COPIA ESATTAMENTE IL TESTO CHE HAI LETTO (non riassumere!)\n';
            systemMessage += 'Tu: "✅ Aggiunto Leon"\n\n';

            systemMessage += 'Esempio 3: WRITE (solo per file nuovi)\n';
            systemMessage += 'Utente: "Crea un file config.json"\n';
            systemMessage += 'Tu: "Creo il file config.json"\n';
            systemMessage += 'Tu: write_file(config.json, {\\"version\\": \\"1.0\\"})\n';
            systemMessage += 'Tu: "✅ File creato"\n\n';

            systemMessage += '⚠️ REGOLE CRITICHE:\n\n';
            systemMessage += '📍 GLOB (quando NON conosci il path):\n';
            systemMessage += '1. Se l\'utente chiede "leggi deploy.txt" → USA glob_files(**/deploy.txt) PRIMA\n';
            systemMessage += '2. Se l\'utente chiede "trova tutti i file .ts" → USA glob_files(**/*.ts)\n';
            systemMessage += '3. Dopo glob, usa il path trovato per read_file()\n\n';

            systemMessage += '✏️ EDIT (per modificare file):\n';
            systemMessage += '1. SEMPRE chiama read_file() PRIMA di edit_file()\n';
            systemMessage += '2. Se read_file() FALLISCE (file non esiste) → USA write_file() invece!\n';
            systemMessage += '3. Nella chiamata edit_file(), COPIA ESATTAMENTE il testo che hai letto\n';
            systemMessage += '4. NON riassumere, NON parafrasare - USA IL TESTO IDENTICO!\n';
            systemMessage += '5. Se il file ha "ABC", scrivi edit_file(file, ABC, ABC + nuova riga)\n\n';
            systemMessage += '🎯 WORKFLOW CORRETTO:\n';
            systemMessage += 'read_file() → Leggi contenuto esatto → edit_file(file, contenuto_esatto, contenuto_esatto + modifica)\n';
        }

        // Define tools for Claude native function calling (converted from Gemini format)
        const tools = [
            {
                name: 'read_file',
                description: 'Leggi il contenuto di un file nel progetto',
                input_schema: {
                    type: 'object',
                    properties: {
                        filePath: {
                            type: 'string',
                            description: 'Il path del file da leggere'
                        }
                    },
                    required: ['filePath']
                }
            },
            {
                name: 'write_file',
                description: 'Crea un nuovo file o sovrascrive completamente un file esistente',
                input_schema: {
                    type: 'object',
                    properties: {
                        filePath: {
                            type: 'string',
                            description: 'Il path del file da creare/sovrascrivere'
                        },
                        content: {
                            type: 'string',
                            description: 'Il contenuto completo del file'
                        }
                    },
                    required: ['filePath', 'content']
                }
            },
            {
                name: 'edit_file',
                description: 'Modifica un file esistente con search & replace. Il file DEVE esistere.',
                input_schema: {
                    type: 'object',
                    properties: {
                        filePath: {
                            type: 'string',
                            description: 'Il path del file da modificare'
                        },
                        oldString: {
                            type: 'string',
                            description: 'Il testo esatto da cercare e sostituire'
                        },
                        newString: {
                            type: 'string',
                            description: 'Il nuovo testo con cui sostituire oldString'
                        }
                    },
                    required: ['filePath', 'oldString', 'newString']
                }
            },
            {
                name: 'list_files',
                description: 'Elenca i file in una directory',
                input_schema: {
                    type: 'object',
                    properties: {
                        directory: {
                            type: 'string',
                            description: 'La directory da elencare (es: "." per root)'
                        }
                    },
                    required: ['directory']
                }
            },
            {
                name: 'glob_files',
                description: 'Cerca file usando pattern glob (es: "**/*.ts" per tutti i file TypeScript, "**/deploy*" per file che iniziano con deploy)',
                input_schema: {
                    type: 'object',
                    properties: {
                        pattern: {
                            type: 'string',
                            description: 'Il pattern glob da cercare (es: "**/*.ts", "**/*.js", "**/package.json")'
                        }
                    },
                    required: ['pattern']
                }
            },
            {
                name: 'search_in_files',
                description: 'Cerca un pattern di testo all\'interno dei file del progetto (come grep)',
                input_schema: {
                    type: 'object',
                    properties: {
                        pattern: {
                            type: 'string',
                            description: 'Il pattern di testo da cercare nei file (es: "Service", "API", "auth")'
                        }
                    },
                    required: ['pattern']
                }
            }
        ];

        // Build conversation history for Claude (convert from simple string array to Claude format)
        // 🚀 OPTIMIZATION 1: Limit context window + Message Summarization (like Claude Code does)
        // 🚀 OPTIMIZATION 10 & 11: Adaptive Context + Smart Pruning (like Claude Code)
        const MAX_HISTORY_MESSAGES = 20;

        // Adaptive context size based on prompt type
        const adaptiveMaxMessages = getAdaptiveContextSize(prompt, conversationHistory);

        const limitedHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES);

        const messages = [];

        // Convert history to message objects
        const historyMessages = [];
        for (let i = 0; i < limitedHistory.length; i++) {
            historyMessages.push({
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: limitedHistory[i]
            });
        }

        // Apply smart pruning with relevance scoring (better than summarization)
        const optimizedMessages = pruneMessages(historyMessages, prompt, adaptiveMaxMessages);
        messages.push(...optimizedMessages);

        // Add current user message
        messages.push({
            role: 'user',
            content: prompt
        });

        // Set headers for SSE streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Helper function to execute tool calls (compatible with both Gemini and Claude)
        async function executeTool(name, args) {
            const axios = require('axios');

            // 🚀 OPTIMIZATION 9: Tool Result Caching (like Claude Code)
            // Check cache first for read-only operations
            if (['read_file', 'list_files', 'glob_files', 'search_in_files'].includes(name)) {
                const cachedResult = getCachedToolResult(name, args);
                if (cachedResult) {
                    return cachedResult;
                }
            }

            try {
                let result;
                switch (name) {
                    case 'read_file':
                        const readRes = await axios.post(`http://localhost:${PORT}/workstation/read-file`, {
                            projectId: projectId,
                            filePath: args.filePath
                        });
                        result = readRes.data.success ? readRes.data.content : `Error: ${readRes.data.error}`;
                        // Cache the result
                        if (readRes.data.success) {
                            setCachedToolResult(name, args, result);
                        }
                        return result;

                    case 'write_file':
                        const writeRes = await axios.post(`http://localhost:${PORT}/workstation/write-file`, {
                            projectId: projectId,
                            filePath: args.filePath,
                            content: args.content
                        });
                        return writeRes.data.success ? `File ${args.filePath} scritto con successo` : `Error: ${writeRes.data.error}`;

                    case 'edit_file':
                        const editRes = await axios.post(`http://localhost:${PORT}/workstation/edit-file`, {
                            projectId: projectId,
                            filePath: args.filePath,
                            oldString: args.oldString,
                            newString: args.newString
                        });
                        if (editRes.data.success) {
                            // Return the diff if available, otherwise return success message
                            return editRes.data.diffInfo?.diff || `File ${args.filePath} modificato con successo`;
                        } else {
                            return `Error: ${editRes.data.error}`;
                        }

                    case 'list_files':
                        const listRes = await axios.post(`http://localhost:${PORT}/workstation/list-directory`, {
                            projectId: projectId,
                            directory: args.directory
                        });
                        result = listRes.data.success ? listRes.data.files.map(f => f.name).join(', ') : `Error: ${listRes.data.error}`;
                        if (listRes.data.success) {
                            setCachedToolResult(name, args, result);
                        }
                        return result;

                    case 'glob_files':
                        const globRes = await axios.post(`http://localhost:${PORT}/workstation/glob-files`, {
                            projectId: projectId,
                            pattern: args.pattern
                        });
                        if (globRes.data.success) {
                            const files = globRes.data.files || [];
                            const fileCount = files.length;
                            const fileList = files.join('\n');
                            result = `Glob pattern: ${args.pattern}\n└─ Found ${fileCount} file(s)\n\n${fileList}`;
                            setCachedToolResult(name, args, result);
                            return result;
                        } else {
                            return `Error: ${globRes.data.error}`;
                        }

                    case 'search_in_files':
                        const searchRes = await axios.post(`http://localhost:${PORT}/workstation/search-files`, {
                            projectId: projectId,
                            pattern: args.pattern
                        });
                        if (searchRes.data.success) {
                            const results = searchRes.data.results || [];
                            const matchCount = results.length;
                            const resultList = results.slice(0, 20).map(r => `${r.file}:${r.line}: ${r.content}`).join('\n');
                            const truncated = matchCount > 20 ? `\n... (showing first 20 of ${matchCount} matches)` : '';
                            result = `Search "${args.pattern}"\n└─ ${matchCount} match(es)\n\n${resultList}${truncated}`;
                            setCachedToolResult(name, args, result);
                            return result;
                        } else {
                            return `Error: ${searchRes.data.error}`;
                        }

                    default:
                        return `Error: Unknown function ${name}`;
                }
            } catch (error) {
                return `Error executing ${name}: ${error.message}`;
            }
        }

        // Create Claude streaming session with tool support
        let currentMessages = [...messages];

        // Main streaming loop to handle tool calls
        let continueLoop = true;
        let retryCount = 0;
        const MAX_RETRIES = 3;

        while (continueLoop) {
            continueLoop = false;

            try {
                // 🚀 OPTIMIZATION 2 & 4: Prompt Caching with graceful fallback (like Claude Code)
                // Try caching first, fallback to simple string if not supported
                let systemBlocks;
                let usedCache = false;

                try {
                    systemBlocks = createSystemBlocks(systemMessage, true); // Try with caching
                    usedCache = true;
                } catch (cacheError) {
                    console.log('⚠️ Prompt caching not supported, using fallback');
                    systemBlocks = createSystemBlocks(systemMessage, false); // Fallback to string
                }

                // Start Claude streaming
                const stream = anthropic.messages.stream({
                    model: model,
                    max_tokens: 8192,
                    system: systemBlocks,
                    messages: currentMessages,
                    tools: tools,
                    temperature: 0.7
                });

            // Track tool calls detected during streaming (for UI only)
            const toolCallsForUI = [];

            // Handle streaming events
            for await (const event of stream) {
                // Text delta - stream to client
                if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                    res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
                }

                // Tool use started - send to frontend for UI (but don't execute yet!)
                if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
                    const toolUse = event.content_block;
                    console.log('🔧 Tool call detected (streaming):', toolUse.name, '- params empty:', JSON.stringify(toolUse.input));

                    // Stream function call to frontend for UI (EXCEPT for glob_files and search_in_files)
                    // NOTE: At this point, toolUse.input is still empty {}!
                    if (toolUse.name !== 'glob_files' && toolUse.name !== 'search_in_files') {
                        res.write(`data: ${JSON.stringify({
                            functionCall: {
                                name: toolUse.name,
                                args: toolUse.input // This will be empty {} during streaming
                            }
                        })}\n\n`);
                    }

                    // Store tool ID for tracking (DO NOT execute yet!)
                    toolCallsForUI.push({
                        id: toolUse.id,
                        name: toolUse.name
                    });
                }
            }

            // After streaming completes, get the final message with complete tool parameters
            const finalMessage = await stream.finalMessage();

            // 📊 Log token usage and cache hits + Track telemetry (like Claude Code)
            const usage = finalMessage.usage;
            const toolUseBlocks = finalMessage.content.filter(block => block.type === 'tool_use');

            if (usage) {
                const cacheHit = usage.cache_read_input_tokens || 0;
                const cacheSavings = (cacheHit * 0.00003).toFixed(4); // $0.03 per 1M tokens
                console.log(`📊 Token usage: Input=${usage.input_tokens}, Cache=${cacheHit} (saved $${cacheSavings}), Output=${usage.output_tokens}`);

                // Track in telemetry
                trackRequest({
                    tokens: {
                        input: usage.input_tokens || 0,
                        output: usage.output_tokens || 0,
                        cached: cacheHit
                    },
                    tools: toolUseBlocks.map(t => t.name)
                });

                // 🚀 OPTIMIZATION 12: Cost Budgeting & Alerts (like Claude Code)
                const userCostData = trackUserCost(sessionId, {
                    input: usage.input_tokens || 0,
                    output: usage.output_tokens || 0,
                    cached: cacheHit
                });
                console.log(`💰 User ${sessionId} total cost: $${userCostData.total.toFixed(4)} over ${userCostData.requests} requests`);
            }

            // Now execute tools with complete parameters from finalMessage
            const toolsUsed = [];

            if (toolUseBlocks.length > 0) {
                console.log(`✅ Streaming complete. Executing ${toolUseBlocks.length} tool(s) with complete parameters...`);

                // 🚀 OPTIMIZATION 13: Parallel Tool Execution (like Claude Code)
                // Execute all tools in parallel instead of sequentially
                const startTime = Date.now();

                const toolPromises = toolUseBlocks.map(async (toolUse) => {
                    console.log('🔧 Executing tool:', toolUse.name, 'with params:', JSON.stringify(toolUse.input));

                    try {
                        const toolResult = await executeTool(toolUse.name, toolUse.input);
                        console.log('✅ Tool result:', toolResult.substring(0, 200));

                        return {
                            success: true,
                            id: toolUse.id,
                            name: toolUse.name,
                            input: toolUse.input,
                            result: toolResult
                        };
                    } catch (error) {
                        console.error(`❌ Tool ${toolUse.name} failed:`, error.message);
                        return {
                            success: false,
                            id: toolUse.id,
                            name: toolUse.name,
                            input: toolUse.input,
                            result: `Error executing ${toolUse.name}: ${error.message}`
                        };
                    }
                });

                // Wait for all tools to complete in parallel
                const toolResults = await Promise.all(toolPromises);
                const executionTime = Date.now() - startTime;

                console.log(`⚡ All ${toolResults.length} tools executed in ${executionTime}ms (parallel execution)`);

                // 🚀 OPTIMIZATION 15: Batch Tool Results (reduce SSE overhead)
                // Send all tool results in a single SSE message instead of multiple
                const batchedResults = toolResults.map(toolData => ({
                    name: toolData.name,
                    args: toolData.input,
                    result: toolData.result
                }));

                // Stream all results in a single batch
                res.write(`data: ${JSON.stringify({
                    toolResultsBatch: batchedResults,
                    executionTime: `${executionTime}ms`,
                    count: batchedResults.length
                })}\n\n`);

                // Store tool use for next iteration
                for (const toolData of toolResults) {
                    toolsUsed.push(toolData);
                }
            }

            // If tools were used, continue the conversation with tool results
            if (toolsUsed.length > 0) {

                // Build the assistant's message with tool uses
                const assistantMessage = {
                    role: 'assistant',
                    content: finalMessage.content
                };

                // Build user message with tool results
                const toolResultsMessage = {
                    role: 'user',
                    content: toolsUsed.map(tool => ({
                        type: 'tool_result',
                        tool_use_id: tool.id,
                        content: tool.result
                    }))
                };

                // Add to messages and continue loop
                currentMessages.push(assistantMessage);
                currentMessages.push(toolResultsMessage);
                continueLoop = true;

                // Reset retry count after successful tool execution
                retryCount = 0;
            } else {
                // No tools used - reset retry count
                retryCount = 0;
            }

            // 🚀 OPTIMIZATION 3 & 6: Granular error handling with retry (like Claude Code)
            } catch (streamError) {
                // Classify error type with granular error handler
                const errorInfo = handleAPIError(streamError);

                console.log(`❌ ${errorInfo.type} error:`, errorInfo.technicalDetails);

                // Track error in telemetry
                trackRequest({ error: errorInfo });

                // Retry logic for retryable errors
                if (errorInfo.shouldRetry && retryCount < MAX_RETRIES) {
                    retryCount++;
                    // Exponential backoff: 2s, 4s, 8s
                    const waitTime = Math.pow(2, retryCount) * 1000;

                    console.log(`⏳ ${errorInfo.type} - Retry ${retryCount}/${MAX_RETRIES} in ${waitTime/1000}s...`);

                    // Send user-friendly error message to frontend
                    res.write(`data: ${JSON.stringify({
                        text: `\n${errorInfo.userMessage}\nRiprovo (${retryCount}/${MAX_RETRIES}) tra ${waitTime/1000}s...\n`
                    })}\n\n`);

                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, waitTime));

                    // Retry - continue the loop
                    continueLoop = true;
                    continue;
                } else {
                    // Not retryable or max retries exceeded
                    if (retryCount >= MAX_RETRIES) {
                        console.log(`❌ Max retries (${MAX_RETRIES}) exceeded`);
                        res.write(`data: ${JSON.stringify({
                            text: `\n❌ Tentativi esauriti dopo ${MAX_RETRIES} retry. ${errorInfo.userMessage}\n`
                        })}\n\n`);
                    } else {
                        res.write(`data: ${JSON.stringify({
                            text: `\n${errorInfo.userMessage}\n`
                        })}\n\n`);
                    }
                    throw streamError;
                }
            }
        }

        // Send done signal
        res.write('data: [DONE]\n\n');
        res.end();

    } catch (error) {
        console.error('AI Chat error:', error.response?.data || error.message);

        const errorMessage = error.response?.data?.error?.message || error.message;

        // Check if headers have already been sent (streaming started)
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: errorMessage
            });
        } else {
            // Headers already sent, stream error message instead
            try {
                res.write(`data: ${JSON.stringify({ text: `\n\n❌ Error: ${errorMessage}` })}\n\n`);
                res.write('data: [DONE]\n\n');
                res.end();
            } catch (streamError) {
                console.error('Error sending error message to stream:', streamError);
                // Connection might be already closed, ignore
            }
        }
    }
});

// Terminal execute endpoint - Execute commands on workstation
app.post('/terminal/execute', async (req, res) => {
  const { command, workstationId } = req.body;

  console.log('Terminal execute:', { command, workstationId, language: req.body.language });

  try {
    console.log(`⚡ Executing command: ${command}`);

    // Execute command (simulated for now, real with workstations in production)
    const output = await executeCommandOnWorkstation(command, workstationId || 'local');

    console.log('✅ Command executed successfully');

    let previewUrl = detectPreviewUrl(output.stdout, command);
    let serverReady = false;
    let healthCheckResult = null;

    if (previewUrl) {
      console.log('👁️  Preview URL detected:', previewUrl);

      // For dev server commands, do health check to verify it's actually running
      const isDevServerCommand = command.includes('start') ||
                                 command.includes('serve') ||
                                 command.includes('dev') ||
                                 command.includes('run');

      if (isDevServerCommand && output.exitCode === 0) {
        console.log('🔍 Performing health check on server...');

        // Always do health check in production mode
        healthCheckResult = await healthCheckUrl(previewUrl, 15, 1000);
        serverReady = healthCheckResult.healthy;

        if (serverReady) {
          console.log(`✅ Server is verified running and healthy!`);

          // Don't convert Expo tunnel URLs (they're already public)
          if (!previewUrl.startsWith('exp://') && !previewUrl.includes('.exp.direct')) {
            // Convert to public URL for production
            previewUrl = convertToPublicUrl(previewUrl, workstationId || 'local');
            console.log(`🌐 Public preview URL: ${previewUrl}`);
          } else {
            console.log(`🚇 Using Expo tunnel URL as-is: ${previewUrl}`);
          }
        } else {
          console.log(`⚠️ Server command executed but health check failed`);
        }
      }
    }

    res.json({
      output: output.stdout,
      error: output.stderr,
      exitCode: output.exitCode,
      workstationId: workstationId || 'local',
      command,
      previewUrl,
      serverReady, // tells client if server is verified running
      healthCheck: healthCheckResult // health check details
    });

  } catch (error) {
    console.error('❌ TERMINAL EXECUTE ERROR:', error);
    res.status(500).json({ error: error.message });
  }
});

// Execute command on workstation (real execution)
async function executeCommandOnWorkstation(command, workstationId) {
  console.log(`🔧 executeCommandOnWorkstation called:`);
  console.log(`   Command: ${command}`);
  console.log(`   Workstation: ${workstationId}`);

  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  const path = require('path');
  const fs = require('fs').promises;

  // Get the repository path
  const repoPath = path.join(__dirname, 'cloned_repos', workstationId);

  // Check if repository exists
  try {
    await fs.access(repoPath);
  } catch {
    console.log('⚠️  Repository not found, using simulation fallback');
    return {
      stdout: `Error: Project directory not found for workstation ${workstationId}`,
      stderr: 'Repository directory does not exist',
      exitCode: 1
    };
  }

  // Check if this is a React Native/Expo project
  const isReactNative = await checkIfReactNative(repoPath);

  // Add HOST=0.0.0.0 for dev server commands to allow network access
  let execCommand = command;
  const isDevServerCommand = /npm\s+(run\s+)?dev|npm\s+start|yarn\s+(run\s+)?dev|yarn\s+start|ng\s+serve|gatsby\s+develop|npx\s+expo\s+start|python3?\s+-m\s+http\.server|php\s+artisan\s+serve|rails\s+server|flask\s+run|uvicorn/.test(command);

  if (isDevServerCommand) {
    if (isReactNative) {
      console.log('📱 React Native/Expo project detected - using port 8081');
      // For Expo, use EXPO_WEBPACK_PORT to set the port for web mode
      execCommand = `EXPO_WEBPACK_PORT=8081 ${command}`;
    } else {
      console.log('🌐 Adding HOST=0.0.0.0 to dev server command for network access');
      execCommand = `HOST=0.0.0.0 ${command}`;
    }
  }

  try {
    console.log(`💻 Executing in ${repoPath}: ${execCommand}`);

    // For dev server commands, we need to run them in background
    // For now, just return success to indicate server is starting
    if (isDevServerCommand) {
      // Extract port from command or use defaults
      let port = 3000; // default
      if (isReactNative) {
        port = 8081;
      } else {
        // Try to extract port from command
        const portMatch = command.match(/(?:--port[=\s]|:)(\d+)|(\d+)$/);
        if (portMatch) {
          port = parseInt(portMatch[1] || portMatch[2]);
        }
      }

      try {
        console.log(`🧹 Cleaning up port ${port}...`);
        await execAsync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { timeout: 5000 });
        console.log(`✅ Port ${port} is now free`);
      } catch (err) {
        console.log(`⚠️  Error cleaning port: ${err.message}`);
      }

      // Check if node_modules exists for npm/yarn projects, if not install dependencies
      const isNpmProject = /npm|yarn|npx/.test(command);
      if (isNpmProject) {
        const fs = require('fs').promises;
        const path = require('path');
        const nodeModulesPath = path.join(repoPath, 'node_modules');
        let needsInstall = false;
        try {
          await fs.access(nodeModulesPath);
          console.log('✅ node_modules exists');
        } catch {
          console.log('📦 node_modules not found, installing dependencies...');
          needsInstall = true;
        }

        if (needsInstall) {
          try {
            console.log('⏳ Running npm install...');
            await execAsync('npm install', {
              cwd: repoPath,
              timeout: 120000 // 2 minutes for install
            });
            console.log('✅ Dependencies installed successfully');
          } catch (installErr) {
            console.error('❌ Failed to install dependencies:', installErr.message);
            return {
              stdout: '',
              stderr: `Failed to install dependencies: ${installErr.message}`,
              exitCode: 1
            };
          }
        }
      } else {
        console.log('ℹ️  Non-npm project detected, skipping dependency installation');
      }

      // Start the dev server in background (non-blocking)
      const { spawn } = require('child_process');
      const serverProcess = spawn('sh', ['-c', execCommand], {
        cwd: repoPath,
        detached: true,
        stdio: 'ignore'
      });

      serverProcess.unref(); // Allow parent to exit independently

      console.log('✅ Dev server started in background');
      return {
        stdout: `> Starting development server...\n\nLocal:   http://localhost:${port}\nNetwork: http://0.0.0.0:${port}\n\n✨ Server starting in background...\n🚀 Development server running on workstation ${workstationId}`,
        stderr: '',
        exitCode: 0
      };
    }

    // For other commands, execute normally with timeout
    const { stdout, stderr } = await execAsync(`cd "${repoPath}" && ${execCommand}`, {
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });

    console.log('✅ Command executed successfully');
    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0
    };

  } catch (error) {
    console.error('❌ Command execution error:', error);
    return {
      stdout: error.stdout ? error.stdout.toString().trim() : '',
      stderr: error.stderr ? error.stderr.toString().trim() : error.message,
      exitCode: error.code || 1
    };
  }
}

// Health check a URL con retry logic
async function healthCheckUrl(url, maxAttempts = 15, delayMs = 1000) {
  console.log(`🏥 Starting health check for ${url}`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`   Attempt ${attempt}/${maxAttempts}...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await axios.get(url, {
        signal: controller.signal,
        validateStatus: (status) => status < 500, // Accept 2xx, 3xx, 4xx (server is up)
        timeout: 3000
      });

      clearTimeout(timeoutId);

      if (response.status < 500) {
        console.log(`✅ Health check passed! Server is responding (status: ${response.status})`);
        return { healthy: true, attempts: attempt, status: response.status };
      }
    } catch (error) {
      console.log(`   ⏳ Server not ready yet (${error.message})`);
    }

    // Wait before next attempt (except on last attempt)
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  console.log(`❌ Health check failed after ${maxAttempts} attempts`);
  return { healthy: false, attempts: maxAttempts };
}

// Check if a project is React Native/Expo by reading package.json
async function checkIfReactNative(repoPath) {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const packageJsonPath = path.join(repoPath, 'package.json');

    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonContent);

    // Check for React Native or Expo dependencies
    const deps = packageJson.dependencies || {};
    const devDeps = packageJson.devDependencies || {};

    const isRN = deps['react-native'] || devDeps['react-native'] ||
                 deps['expo'] || devDeps['expo'];

    if (isRN) {
      console.log('📱 Detected React Native/Expo project');
    }

    return !!isRN;
  } catch (error) {
    console.log('⚠️  Could not read package.json, assuming not React Native');
    return false;
  }
}

// Convert localhost URL to publicly accessible URL
// In production, this would use Cloud Run workstation's public IP or tunnel
function convertToPublicUrl(localUrl, workstationId) {
  try {
    const url = new URL(localUrl);
    const port = url.port || '3000';

    // For development: replace localhost with machine's local IP
    if (process.env.NODE_ENV !== 'production') {
      const os = require('os');
      const networkInterfaces = os.networkInterfaces();
      let localIp = 'localhost';

      // Find the first non-internal IPv4 address
      for (const interfaceName in networkInterfaces) {
        const interfaces = networkInterfaces[interfaceName];
        if (interfaces) {
          for (const iface of interfaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
              localIp = iface.address;
              break;
            }
          }
        }
        if (localIp !== 'localhost') break;
      }

      console.log(`🌐 Converting ${localUrl} to http://${localIp}:${port}`);
      return `http://${localIp}:${port}`;
    }

    // In production: replace localhost with workstation's public hostname
    // Example: http://localhost:3000 -> https://workstation-abc123-3000.run.app
    const publicHost = process.env.WORKSTATION_PUBLIC_HOST ||
                      `${workstationId}-${port}.${LOCATION}.run.app`;

    return `https://${publicHost}`;
  } catch (error) {
    console.error('Error converting URL:', error);
    return localUrl;
  }
}

// Detect preview URL from command output
function detectPreviewUrl(output, command) {
  // Look for common development server patterns
  const urlPatterns = [
    // Expo tunnel URLs (exp:// protocol for React Native)
    /exp:\/\/[^\s]+/,
    // Expo web URLs when using --tunnel
    /https?:\/\/[a-z0-9-]+\.exp\.direct[^\s]*/,
    // Standard web dev servers
    /Local:\s+(https?:\/\/[^\s]+)/,
    /http:\/\/localhost:\d+/,
    /http:\/\/127\.0\.0\.1:\d+/,
    /http:\/\/0\.0\.0\.0:\d+/,
    /Server running on (https?:\/\/[^\s]+)/
  ];

  for (const pattern of urlPatterns) {
    const match = output.match(pattern);
    if (match) {
      const url = match[1] || match[0];
      console.log(`🔗 Detected preview URL: ${url}`);
      return url;
    }
  }

  return null;
}

// Workstation create endpoint - Create and auto-clone repository or load personal project
app.post('/workstation/create', async (req, res) => {
  const { repositoryUrl, userId, projectId, projectType, projectName, githubToken } = req.body;
  
  console.log('🚀 Creating workstation for:', projectType === 'git' ? repositoryUrl : projectName);
  
  try {
    const workstationId = `ws-${projectId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
    console.log('Workstation ID:', workstationId);

    // Fetch file list from GitHub API if it's a git project
    let files = [];
    if (projectType === 'git' && repositoryUrl) {
      try {
        const repoMatch = repositoryUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
        if (repoMatch) {
          const [, owner, repo] = repoMatch;
          console.log(`📦 Fetching files from GitHub: ${owner}/${repo}`);
          
          const headers = { 'User-Agent': 'Drape-App' };
          if (githubToken) {
            headers['Authorization'] = `Bearer ${githubToken}`;
            console.log('🔐 Using GitHub token for authentication');
          }
          
          // Try main branch first, then master
          let githubResponse;
          try {
            githubResponse = await axios.get(
              `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`,
              { headers }
            );
          } catch (error) {
            console.log('⚠️ main branch not found, trying master...');
            githubResponse = await axios.get(
              `https://api.github.com/repos/${owner}/${repo}/git/trees/master?recursive=1`,
              { headers }
            );
          }
          
          files = githubResponse.data.tree
            .filter(item => item.type === 'blob')
            .map(item => item.path)
            .filter(path => 
              !path.includes('node_modules/') && 
              !path.startsWith('.git/') &&
              !path.includes('/dist/') &&
              !path.includes('/build/')
            )
            .slice(0, 500);
          
          console.log(`✅ Found ${files.length} files from GitHub`);
        }
      } catch (error) {
        console.error('⚠️ Error fetching GitHub files:', error.message);

        // Check if it's an authentication issue
        if (error.response?.status === 404 && !githubToken) {
          // For public repos, GitHub API returns 200
          // A 404 without auth means: repo doesn't exist OR it's private
          // Let's check if the repo exists by trying to access it via web
          const repoMatch = repositoryUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
          if (repoMatch) {
            const [, owner, repo] = repoMatch;
            try {
              // Check repo existence via GitHub API (this endpoint works without auth for public repos)
              await axios.head(`https://github.com/${owner}/${repo}`, {
                maxRedirects: 0,
                validateStatus: (status) => status === 200 || status === 404
              });
              // If we get here, repo exists but API returned 404 = it's private
              console.log('🔒 Private repository detected, authentication required');
              return res.status(401).json({
                error: 'Authentication required',
                message: 'This repository is private and requires authentication',
                requiresAuth: true
              });
            } catch (checkError) {
              // Repo doesn't exist at all
              console.log('❌ Repository not found');
              return res.status(404).json({
                error: 'Repository not found',
                message: 'This repository does not exist on GitHub',
                requiresAuth: false
              });
            }
          }
        }

        // If 401/403, it's definitely an auth issue (even with token provided)
        if (error.response?.status === 401 || error.response?.status === 403) {
          console.log('🔒 Authentication failed or insufficient permissions');
          return res.status(401).json({
            error: 'Authentication required',
            message: githubToken
              ? 'The provided token does not have access to this repository'
              : 'This repository requires authentication',
            requiresAuth: true
          });
        }
        
        // Use basic structure as fallback
        files = [
          'README.md',
          'package.json',
          '.gitignore',
          'src/index.js',
          'src/App.js'
        ];
        console.log('📝 Using fallback file structure');
      }
      
      // Always store files in Firestore (even if fallback)
      try {
        await db.collection('workstation_files').doc(projectId).set({
          workstationId,
          files,
          repositoryUrl,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`💾 Saved ${files.length} files to Firestore`);
        } catch (error) {
          console.error('⚠️ Error saving files to Firestore:', error); // Log the full error object
        }    }

    res.json({
      workstationId,
      status: 'running',
      message: 'Workstation created successfully',
      repositoryUrl: repositoryUrl || null,
      filesCount: files.length
    });
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    res.status(500).json({
      error: error.message,
      details: error.response?.data 
    });
  }
});

// Detect project type endpoint
app.get('/workstation/:workstationId/detect-project', async (req, res) => {
  const { workstationId } = req.params;

  console.log(`🔍 Detecting project type for workstation: ${workstationId}`);

  try {
    const fs = require('fs').promises;
    const path = require('path');

    // Extract project ID from workstation ID (format: ws-projectid in lowercase)
    // Convert back to original case by looking for matching folder
    let repoPath = path.join(__dirname, 'cloned_repos', workstationId);

    // If workstation ID starts with 'ws-', try to find the project folder
    if (workstationId.startsWith('ws-')) {
      const projectIdLower = workstationId.substring(3); // Remove 'ws-' prefix
      const clonedReposDir = path.join(__dirname, 'cloned_repos');

      try {
        const folders = await fs.readdir(clonedReposDir);
        const matchingFolder = folders.find(f => f.toLowerCase() === projectIdLower);

        if (matchingFolder) {
          repoPath = path.join(clonedReposDir, matchingFolder);
          console.log(`   Mapped ${workstationId} → ${matchingFolder}`);
        }
      } catch (err) {
        console.error('   Error reading cloned_repos:', err);
      }
    }

    // Check if repository exists
    try {
      await fs.access(repoPath);
    } catch {
      return res.status(404).json({ error: 'Workstation not found' });
    }

    // Read package.json if it exists
    let packageJson = null;
    try {
      const packageJsonPath = path.join(repoPath, 'package.json');
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
      packageJson = JSON.parse(packageJsonContent);
    } catch {
      console.log('⚠️  No package.json found');
    }

    // Get list of files in root directory
    let files = [];
    try {
      files = await fs.readdir(repoPath);
    } catch (error) {
      console.error('Error reading directory:', error);
    }

    // Import detection logic
    const { detectProjectType } = require('./projectDetector');
    const projectInfo = detectProjectType(files, packageJson);

    console.log('✅ Project detected:', projectInfo);

    res.json({
      projectInfo: projectInfo || {
        type: 'unknown',
        defaultPort: 3000,
        startCommand: 'npm start',
        description: 'Unknown Project Type'
      }
    });
  } catch (error) {
    console.error('❌ Error detecting project:', error);
    res.status(500).json({ error: error.message });
  }
});

// Setup personal project on workstation
async function setupPersonalProject(projectName, workstationId, userId, projectId) {
  console.log(`🔧 setupPersonalProject called:`);
  console.log(`   Project: ${projectName}`);
  console.log(`   Workstation: ${workstationId}`);
  console.log(`   User: ${userId}`);
  console.log(`   Project ID: ${projectId}`);
  
  // Simulate checking if project exists in Cloud Storage
  const projectExists = Math.random() > 0.5; // Random for simulation
  
  if (projectExists) {
    console.log('📥 Loading existing project from Cloud Storage...');
    return {
      stdout: `Loading project '${projectName}' from Cloud Storage...\n✅ Project loaded successfully!\nFiles restored to workstation ${workstationId}`,
      stderr: '',
      exitCode: 0
    };
  } else {
    console.log('🆕 Creating new project structure...');
    return {
      stdout: `Creating new project '${projectName}'...\n📁 Created project directory\n📄 Created README.md\n📄 Created package.json\n✅ New project initialized on workstation ${workstationId}`,
      stderr: '',
      exitCode: 0
    };
  }
}

// Workstation status endpoint
app.get('/workstation/:id/status', async (req, res) => {
  const { id } = req.params;
  
  // Simulate workstation status
  res.json({
    workstationId: id,
    status: 'running',
    uptime: '5m 32s',
    repositoryCloned: true,
    previewUrl: null
  });
});

// Workstation delete endpoint
app.delete('/workstation/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Simulate workstation deletion
    res.json({
      workstationId: id,
      status: 'deleting',
      message: 'Workstation deletion started'
    });
  } catch (error) {
    console.error('Workstation deletion error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/workstation/list-files', async (req, res) => {
    const { workstationId } = req.body;
    
    try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        // List files in workstation (assuming it's accessible via gcloud)
        const { stdout } = await execAsync(`gcloud workstations ssh ${workstationId} --command="find /workspace -type f -name '*.js' -o -name '*.ts' -o -name '*.tsx' -o -name '*.json' | head -50"`);
        
        const files = stdout.trim().split('\n').filter(f => f);
        
        res.json({ success: true, files });
    } catch (error) {
        console.error('List files error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Read file content from cloned repository
app.post('/workstation/read-file', async (req, res) => {
    const { projectId, filePath } = req.body;

    try {
        const fs = require('fs').promises;
        const path = require('path');

        // Remove ws- prefix if present
        const cleanProjectId = projectId.startsWith('ws-') ? projectId.substring(3) : projectId;
        const repoPath = path.join(__dirname, 'cloned_repos', cleanProjectId);
        const fullPath = path.join(repoPath, filePath);

        console.log('📖 Reading file:', fullPath);

        // Check if file exists, try with common extensions if not found
        let actualFilePath = fullPath;
        let fileFound = false;

        try {
            await fs.access(fullPath);
            fileFound = true;
        } catch {
            // Try common extensions
            const commonExtensions = ['.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx', '.css', '.html', '.sh', '.yml', '.yaml'];

            for (const ext of commonExtensions) {
                const pathWithExt = fullPath + ext;
                try {
                    await fs.access(pathWithExt);
                    actualFilePath = pathWithExt;
                    fileFound = true;
                    console.log(`✅ Found file with extension: ${path.basename(pathWithExt)}`);
                    break;
                } catch (e) {
                    // Continue to next extension
                }
            }
        }

        if (!fileFound) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }

        const content = await fs.readFile(actualFilePath, 'utf8');

        // Return both content and the actual file path found
        res.json({
            success: true,
            content,
            actualFilePath: path.basename(actualFilePath) // Return only filename, not full path
        });
    } catch (error) {
        console.error('Read file error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Write/modify file in cloned repository
app.post('/workstation/write-file', async (req, res) => {
    const { projectId, filePath, content } = req.body;

    try {
        const fs = require('fs').promises;
        const path = require('path');

        // Remove ws- prefix if present
        const cleanProjectId = projectId.startsWith('ws-') ? projectId.substring(3) : projectId;
        const repoPath = path.join(__dirname, 'cloned_repos', cleanProjectId);
        const fullPath = path.join(repoPath, filePath);

        console.log('✍️  Writing file:', fullPath);

        // Unescape special characters (\n, \t, etc.) from AI response
        let unescapedContent = content
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\r/g, '\r')
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\\\/g, '\\');

        // Read original content if file exists (for diff)
        let originalContent = '';
        let diffInfo = null;
        try {
            originalContent = await fs.readFile(fullPath, 'utf8');

            // Generate simple diff with context
            const oldLines = originalContent.split('\n');
            const newLines = unescapedContent.split('\n');

            // Find all differences and collect them
            let diffLines = [];
            let addedCount = 0;
            let removedCount = 0;
            let lastDiffIndex = -10; // Track last change to group nearby changes

            for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
                const oldLine = oldLines[i];
                const newLine = newLines[i];

                if (oldLine !== newLine) {
                    // If this change is far from the last one, add separator
                    if (i - lastDiffIndex > 11 && diffLines.length > 0) {
                        diffLines.push('...');
                    }

                    // Show 5 lines of context before (if not already shown)
                    const contextStart = Math.max(0, i - 5);
                    const contextEnd = i;

                    for (let j = contextStart; j < contextEnd; j++) {
                        // Only add if not already in diffLines
                        const contextLine = newLines[j] !== undefined ? newLines[j] : oldLines[j];
                        if (oldLines[j] === newLines[j] && !diffLines.some(line => line === `  ${contextLine}`)) {
                            diffLines.push(`  ${contextLine}`);
                        }
                    }

                    // Show removed line (if exists)
                    if (oldLine !== undefined && newLine !== oldLine) {
                        diffLines.push(`- ${oldLine}`);
                        removedCount++;
                    }

                    // Show added line (if exists)
                    if (newLine !== undefined && newLine !== oldLine) {
                        diffLines.push(`+ ${newLine}`);
                        addedCount++;
                    }

                    // Show 5 lines of context after
                    const afterStart = i + 1;
                    const afterEnd = Math.min(i + 6, Math.max(oldLines.length, newLines.length));

                    for (let j = afterStart; j < afterEnd; j++) {
                        const contextLine = newLines[j] !== undefined ? newLines[j] : oldLines[j];
                        if (oldLines[j] === newLines[j]) {
                            diffLines.push(`  ${contextLine}`);
                        } else {
                            // More changes ahead, don't add context yet
                            break;
                        }
                    }

                    lastDiffIndex = i;
                }
            }

            // Limit to 30 lines for preview (show more context)
            if (diffLines.length > 30) {
                diffLines = diffLines.slice(0, 30);
                diffLines.push('...');
                diffLines.push(`(${diffLines.length - 30} more lines)`);
            }

            diffInfo = {
                added: addedCount,
                removed: removedCount,
                diff: diffLines.join('\n')
            };
        } catch (readError) {
            // File doesn't exist, it's a new file - show first 10 lines
            const newLines = unescapedContent.split('\n');
            const preview = newLines.slice(0, 10).map(line => `+ ${line}`).join('\n');
            diffInfo = {
                added: newLines.length,
                removed: 0,
                diff: preview + (newLines.length > 10 ? `\n...\n(${newLines.length - 10} more lines)` : '')
            };
        }

        // Create directory if it doesn't exist
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });

        await fs.writeFile(fullPath, unescapedContent, 'utf8');

        res.json({
            success: true,
            message: 'File written successfully',
            diffInfo: diffInfo
        });
    } catch (error) {
        console.error('Write file error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Edit file using search & replace (like Claude Code)
app.post('/workstation/edit-file', async (req, res) => {
    const { projectId, filePath, oldString, newString } = req.body;

    try {
        const fs = require('fs').promises;
        const path = require('path');

        // Remove ws- prefix if present
        const cleanProjectId = projectId.startsWith('ws-') ? projectId.substring(3) : projectId;
        const repoPath = path.join(__dirname, 'cloned_repos', cleanProjectId);
        const fullPath = path.join(repoPath, filePath);

        console.log('✏️  Editing file:', fullPath);
        console.log('🔍 Searching for:', oldString.substring(0, 100) + (oldString.length > 100 ? '...' : ''));

        // Unescape special characters in both strings
        const unescapeString = (str) => str
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\r/g, '\r')
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\\\/g, '\\');

        const unescapedOld = unescapeString(oldString);
        const unescapedNew = unescapeString(newString);

        // Read current file content
        let originalContent;
        let actualFilePath = fullPath;

        try {
            originalContent = await fs.readFile(fullPath, 'utf8');
        } catch (readError) {
            // If file not found, try common extensions
            const commonExtensions = ['.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx', '.css', '.html', '.sh', '.yml', '.yaml'];
            let found = false;

            for (const ext of commonExtensions) {
                const pathWithExt = fullPath + ext;
                try {
                    originalContent = await fs.readFile(pathWithExt, 'utf8');
                    actualFilePath = pathWithExt;
                    found = true;
                    console.log(`✅ Found file with extension: ${path.basename(pathWithExt)}`);
                    break;
                } catch (e) {
                    // Continue to next extension
                }
            }

            if (!found) {
                return res.status(404).json({
                    success: false,
                    error: 'File not found. Use write_file() to create new files.',
                    filePath: filePath
                });
            }
        }

        // Check if old string exists in file
        let stringToReplace = unescapedOld;
        let fuzzyMatchUsed = false;

        if (!originalContent.includes(unescapedOld)) {
            // Try fuzzy matching - normalize whitespace and case
            const normalize = (str) => str.toLowerCase().replace(/\s+/g, ' ').trim();
            const normalizedSearch = normalize(unescapedOld);

            // Split file into lines and find similar content
            const lines = originalContent.split('\n');
            let bestMatch = null;
            let bestMatchScore = 0;

            for (let i = 0; i < lines.length; i++) {
                const lineContent = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
                const normalizedLine = normalize(lineContent);

                // Calculate similarity (simple approach - check if normalized versions match)
                if (normalizedLine.includes(normalizedSearch)) {
                    bestMatch = lineContent.substring(0, unescapedOld.length + 50);
                    bestMatchScore = 1;
                    break;
                }
            }

            if (bestMatch && bestMatchScore > 0.8) {
                console.log('✨ Using fuzzy match instead of exact match');
                stringToReplace = bestMatch.substring(0, unescapedOld.length);
                fuzzyMatchUsed = true;
            } else {
                return res.status(400).json({
                    success: false,
                    error: 'String not found in file',
                    suggestion: 'Read the file first with read_file() to see the exact content',
                    searchedFor: unescapedOld.substring(0, 200),
                    filePreview: originalContent.substring(0, 500)
                });
            }
        }

        // Replace old string with new string
        const newContent = originalContent.replace(stringToReplace, unescapedNew);

        // Generate diff
        const oldLines = originalContent.split('\n');
        const newLines = newContent.split('\n');

        let diffLines = [];
        let addedCount = 0;
        let removedCount = 0;
        let lastDiffIndex = -10;

        for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
            const oldLine = oldLines[i];
            const newLine = newLines[i];

            if (oldLine !== newLine) {
                if (i - lastDiffIndex > 11 && diffLines.length > 0) {
                    diffLines.push('...');
                }

                const contextStart = Math.max(0, i - 5);
                const contextEnd = i;

                for (let j = contextStart; j < contextEnd; j++) {
                    const contextLine = newLines[j] !== undefined ? newLines[j] : oldLines[j];
                    if (oldLines[j] === newLines[j] && !diffLines.some(line => line === `  ${contextLine}`)) {
                        diffLines.push(`  ${contextLine}`);
                    }
                }

                if (oldLine !== undefined && newLine !== oldLine) {
                    diffLines.push(`- ${oldLine}`);
                    removedCount++;
                }

                if (newLine !== undefined && newLine !== oldLine) {
                    diffLines.push(`+ ${newLine}`);
                    addedCount++;
                }

                const afterStart = i + 1;
                const afterEnd = Math.min(i + 6, Math.max(oldLines.length, newLines.length));

                for (let j = afterStart; j < afterEnd; j++) {
                    const contextLine = newLines[j] !== undefined ? newLines[j] : oldLines[j];
                    if (oldLines[j] === newLines[j]) {
                        diffLines.push(`  ${contextLine}`);
                    } else {
                        break;
                    }
                }

                lastDiffIndex = i;
            }
        }

        if (diffLines.length > 30) {
            diffLines = diffLines.slice(0, 30);
            diffLines.push('...');
            diffLines.push(`(${diffLines.length - 30} more lines)`);
        }

        const diffInfo = {
            added: addedCount,
            removed: removedCount,
            diff: diffLines.join('\n')
        };

        // Write the modified content
        await fs.writeFile(actualFilePath, newContent, 'utf8');

        console.log('✅ File edited successfully');
        console.log(`📊 Changes: +${addedCount} -${removedCount}`);

        res.json({
            success: true,
            message: 'File edited successfully',
            diffInfo: diffInfo
        });
    } catch (error) {
        console.error('Edit file error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// List files in directory
app.post('/workstation/list-directory', async (req, res) => {
    const { projectId, directory = '.' } = req.body;

    try {
        const fs = require('fs').promises;
        const path = require('path');

        // Remove ws- prefix if present
        const cleanProjectId = projectId.startsWith('ws-') ? projectId.substring(3) : projectId;
        const repoPath = path.join(__dirname, 'cloned_repos', cleanProjectId);
        const fullPath = path.join(repoPath, directory);

        console.log('📁 Listing directory:', fullPath);

        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        const files = entries.map(entry => ({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            path: path.join(directory, entry.name)
        }));

        res.json({ success: true, files });
    } catch (error) {
        console.error('List directory error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Glob files - search for files using glob patterns
app.post('/workstation/glob-files', async (req, res) => {
    const { projectId, pattern } = req.body;

    try {
        const { glob } = require('glob');
        const path = require('path');

        // Remove ws- prefix if present
        const cleanProjectId = projectId.startsWith('ws-') ? projectId.substring(3) : projectId;
        const repoPath = path.join(__dirname, 'cloned_repos', cleanProjectId);

        console.log('🔍 Glob search for pattern:', pattern, 'in', repoPath);

        // Use glob to find matching files
        const files = await glob(pattern, {
            cwd: repoPath,
            ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**', '.next/**'],
            nodir: true // Only return files, not directories
        });

        console.log(`Found ${files.length} files matching pattern: ${pattern}`);

        res.json({ success: true, files });
    } catch (error) {
        console.error('Glob search error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Search in files
app.post('/workstation/search-files', async (req, res) => {
    const { projectId, pattern } = req.body;

    try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        const path = require('path');

        // Remove ws- prefix if present
        const cleanProjectId = projectId.startsWith('ws-') ? projectId.substring(3) : projectId;
        const repoPath = path.join(__dirname, 'cloned_repos', cleanProjectId);

        console.log('🔍 Searching for:', pattern, 'in', repoPath);

        // Use grep to search
        const { stdout } = await execAsync(`cd "${repoPath}" && grep -r -n "${pattern}" --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" --include="*.json" . || true`);

        const results = stdout.split('\n').filter(line => line.trim()).map(line => {
            const [file, ...rest] = line.split(':');
            return { file, match: rest.join(':') };
        });

        res.json({ success: true, results });
    } catch (error) {
        console.error('Search files error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Execute bash command in repository
app.post('/workstation/execute-command', async (req, res) => {
    const { projectId, command } = req.body;

    try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        const path = require('path');

        // Remove ws- prefix if present
        const cleanProjectId = projectId.startsWith('ws-') ? projectId.substring(3) : projectId;
        const repoPath = path.join(__dirname, 'cloned_repos', cleanProjectId);

        console.log('💻 Executing command:', command);
        console.log('📂 In directory:', repoPath);

        // Security: validate that repoPath exists
        const fs = require('fs').promises;
        try {
            await fs.access(repoPath);
        } catch {
            return res.status(404).json({
                success: false,
                error: 'Project directory not found'
            });
        }

        // Add HOST=0.0.0.0 for dev server commands to allow network access
        let execCommand = command;
        const isDevServerCommand = /npm\s+(run\s+)?dev|npm\s+start|yarn\s+(run\s+)?dev|yarn\s+start|ng\s+serve|gatsby\s+develop/.test(command);

        if (isDevServerCommand) {
            console.log('🌐 Adding HOST=0.0.0.0 to dev server command for network access');
            execCommand = `HOST=0.0.0.0 ${command}`;
        }

        // Execute command with timeout (30 seconds)
        const { stdout, stderr } = await execAsync(`cd "${repoPath}" && ${execCommand}`, {
            timeout: 30000,
            maxBuffer: 1024 * 1024 * 10 // 10MB buffer
        });

        const output = stdout.trim();
        const errorOutput = stderr.trim();

        console.log('✅ Command executed successfully');
        if (output) console.log('📤 Output:', output.substring(0, 200));
        if (errorOutput) console.log('⚠️ Stderr:', errorOutput.substring(0, 200));

        res.json({
            success: true,
            stdout: output,
            stderr: errorOutput,
            exitCode: 0
        });
    } catch (error) {
        console.error('Command execution error:', error);

        // Extract stdout/stderr from error if available
        const stdout = error.stdout ? error.stdout.toString().trim() : '';
        const stderr = error.stderr ? error.stderr.toString().trim() : '';
        const exitCode = error.code || 1;

        res.json({
            success: false,
            stdout: stdout,
            stderr: stderr || error.message,
            exitCode: exitCode
        });
    }
});

// Edit multiple files atomically
app.post('/workstation/edit-multiple-files', async (req, res) => {
    const { projectId, edits } = req.body;

    try {
        const fs = require('fs').promises;
        const path = require('path');

        const cleanProjectId = projectId.startsWith('ws-') ? projectId.substring(3) : projectId;
        const repoPath = path.join(__dirname, 'cloned_repos', cleanProjectId);

        console.log('📝 Editing multiple files:', edits.length, 'files');

        const results = [];
        const backups = [];

        // Prima fase: backup di tutti i file
        for (const edit of edits) {
            const fullPath = path.join(repoPath, edit.filePath);
            try {
                const originalContent = await fs.readFile(fullPath, 'utf8');
                backups.push({ filePath: edit.filePath, content: originalContent });
            } catch (error) {
                // File non esiste, nessun backup necessario
                backups.push({ filePath: edit.filePath, content: null });
            }
        }

        // Seconda fase: applica tutte le modifiche
        try {
            for (let i = 0; i < edits.length; i++) {
                const edit = edits[i];
                const fullPath = path.join(repoPath, edit.filePath);

                if (edit.type === 'write') {
                    await fs.writeFile(fullPath, edit.content, 'utf8');
                    results.push({
                        filePath: edit.filePath,
                        success: true,
                        type: 'write',
                        lines: edit.content.split('\n').length
                    });
                } else if (edit.type === 'edit') {
                    const originalContent = backups[i].content;
                    if (!originalContent) {
                        throw new Error(`File ${edit.filePath} not found for edit`);
                    }
                    const newContent = originalContent.replace(edit.oldString, edit.newString);
                    await fs.writeFile(fullPath, newContent, 'utf8');
                    results.push({
                        filePath: edit.filePath,
                        success: true,
                        type: 'edit'
                    });
                }
            }

            console.log(`✅ Successfully edited ${results.length} files`);

            res.json({
                success: true,
                results: results,
                totalFiles: edits.length
            });
        } catch (error) {
            // Rollback: ripristina tutti i file dal backup
            console.error('❌ Error during multi-file edit, rolling back:', error.message);
            for (const backup of backups) {
                if (backup.content !== null) {
                    const fullPath = path.join(repoPath, backup.filePath);
                    await fs.writeFile(fullPath, backup.content, 'utf8');
                }
            }
            throw error;
        }
    } catch (error) {
        console.error('Multi-file edit error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            rolledBack: true
        });
    }
});

// Read multiple files at once - for whole file context
app.post('/workstation/read-multiple-files', async (req, res) => {
    const { projectId, filePaths } = req.body;

    try {
        const fs = require('fs').promises;
        const path = require('path');

        const cleanProjectId = projectId.startsWith('ws-') ? projectId.substring(3) : projectId;
        const repoPath = path.join(__dirname, 'cloned_repos', cleanProjectId);

        console.log('📚 Reading multiple files:', filePaths);

        const results = [];

        for (const filePath of filePaths) {
            const fullPath = path.join(repoPath, filePath);

            try {
                const content = await fs.readFile(fullPath, 'utf8');
                results.push({
                    filePath: filePath,
                    success: true,
                    content: content,
                    lines: content.split('\n').length
                });
            } catch (error) {
                results.push({
                    filePath: filePath,
                    success: false,
                    error: error.message
                });
            }
        }

        const successCount = results.filter(r => r.success).length;
        console.log(`✅ Read ${successCount}/${filePaths.length} files successfully`);

        res.json({
            success: true,
            results: results,
            totalFiles: filePaths.length,
            successCount: successCount
        });
    } catch (error) {
        console.error('Read multiple files error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Git command execution with formatted output
app.post('/workstation/git-command', async (req, res) => {
    const { projectId, gitCommand } = req.body;

    try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        const path = require('path');

        // Remove ws- prefix if present
        const cleanProjectId = projectId.startsWith('ws-') ? projectId.substring(3) : projectId;
        const repoPath = path.join(__dirname, 'cloned_repos', cleanProjectId);

        console.log('🔧 Executing git command:', gitCommand);
        console.log('📂 In directory:', repoPath);

        // Security: validate that repoPath exists
        const fs = require('fs').promises;
        try {
            await fs.access(repoPath);
        } catch {
            return res.status(404).json({
                success: false,
                error: 'Project directory not found'
            });
        }

        // Execute git command
        const { stdout, stderr } = await execAsync(`cd "${repoPath}" && git ${gitCommand}`, {
            timeout: 30000,
            maxBuffer: 1024 * 1024 * 10
        });

        const output = stdout.trim();
        const errorOutput = stderr.trim();

        console.log('✅ Git command executed successfully');
        if (output) console.log('📤 Output:', output.substring(0, 200));

        res.json({
            success: true,
            stdout: output,
            stderr: errorOutput,
            exitCode: 0
        });
    } catch (error) {
        console.error('Git command error:', error);

        const stdout = error.stdout ? error.stdout.toString().trim() : '';
        const stderr = error.stderr ? error.stderr.toString().trim() : '';
        const exitCode = error.code || 1;

        res.json({
            success: false,
            stdout: stdout,
            stderr: stderr || error.message,
            exitCode: exitCode
        });
    }
});

// Helper function to clone and read repository files
async function cloneAndReadRepository(repositoryUrl, projectId) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    const fs = require('fs').promises;
    const path = require('path');

    const reposDir = path.join(__dirname, 'cloned_repos');
    const repoPath = path.join(reposDir, projectId);

    // Create repos directory if it doesn't exist
    try {
        await fs.mkdir(reposDir, { recursive: true });
    } catch (err) {
        console.error('Error creating repos directory:', err);
    }

    // Check if repository is already cloned
    try {
        await fs.access(repoPath);
        console.log('✅ Repository already cloned at:', repoPath);
    } catch {
        // Repository not cloned yet, clone it now
        console.log('📦 Cloning repository:', repositoryUrl);
        try {
            await execAsync(`git clone ${repositoryUrl} ${repoPath}`);
            console.log('✅ Repository cloned successfully');
        } catch (cloneError) {
            console.error('❌ Error cloning repository:', cloneError.message);
            throw new Error(`Failed to clone repository: ${cloneError.message}`);
        }
    }

    // Read files from the cloned repository (RECURSIVE)
    // NOTE: Only returns files, not directories. Directories are implicit in the file paths.
    async function readDirectory(dirPath, basePath = '') {
        const files = [];
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                // Skip .git directory and node_modules
                if (entry.name === '.git' || entry.name === 'node_modules') continue;

                const fullPath = path.join(dirPath, entry.name);
                const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

                if (entry.isDirectory()) {
                    // DON'T add the directory itself, just recurse into it
                    // The directory structure is implicit in the file paths
                    const subFiles = await readDirectory(fullPath, relativePath);
                    files.push(...subFiles);
                } else {
                    // Only add files
                    files.push({
                        name: entry.name,
                        type: 'file',
                        path: relativePath
                    });
                }
            }
        } catch (err) {
            console.error('Error reading directory:', err);
        }

        return files;
    }

    return await readDirectory(repoPath);
}

// Get project files from workstation
app.get('/workstation/:projectId/files', async (req, res) => {
    let { projectId } = req.params;
    const { repositoryUrl } = req.query;

    // Remove ws- prefix if present
    if (projectId.startsWith('ws-')) {
        projectId = projectId.substring(3);
    }

    try {
        console.log('📂 Getting files for project:', projectId);
        console.log('🔗 Repository URL:', repositoryUrl);

        // If repositoryUrl is provided, clone and read from local filesystem
        if (repositoryUrl) {
            const files = await cloneAndReadRepository(repositoryUrl, projectId);
            console.log(`✅ Found ${files.length} files in cloned repository`);
            res.json({ success: true, files });
            return;
        }

        // Fallback to Firestore
        const doc = await db.collection('workstation_files').doc(projectId).get();

        if (doc.exists) {
            const data = doc.data();
            console.log(`✅ Found ${data.files.length} files in Firestore`);
            res.json({ success: true, files: data.files });
        } else {
            console.log('⚠️ No files found in Firestore for:', projectId);
            res.json({ success: true, files: [] });
        }
    } catch (error) {
        console.error('❌ Error getting files:', error.message);

        // If repository clone failed (private or not found), return error
        if (error.message.includes('Failed to clone repository')) {
            console.log('⚠️ Clone failed - repository private or not found');
            res.status(403).json({
                success: false,
                error: 'Repository is private or not found. Authentication required.',
                needsAuth: true
            });
        } else {
            res.status(500).json({ success: false, error: error.message });
        }
    }
});

/**
 * Get file content from cloned repository
 */
app.get('/workstation/:projectId/file-content', async (req, res) => {
    const { projectId } = req.params;
    const { filePath, repositoryUrl } = req.query;

    try {
        console.log('📄 [FILE-CONTENT] Request received:');
        console.log('   - projectId:', projectId);
        console.log('   - filePath:', filePath);
        console.log('   - repositoryUrl:', repositoryUrl);

        if (!filePath) {
            console.log('❌ [FILE-CONTENT] Error: File path is required');
            return res.status(400).json({ success: false, error: 'File path is required' });
        }

        // Ensure repository is cloned
        const reposDir = path.join(__dirname, 'cloned_repos');
        const repoPath = path.join(reposDir, projectId);
        console.log('📂 [FILE-CONTENT] Checking repo path:', repoPath);

        // Check if repo exists, clone if not
        try {
            await fs.access(repoPath);
            console.log('✅ [FILE-CONTENT] Repository directory exists');
        } catch {
            console.log('⚠️  [FILE-CONTENT] Repository directory not found');
            if (repositoryUrl) {
                console.log('📦 [FILE-CONTENT] Attempting to clone repository...');
                await cloneAndReadRepository(repositoryUrl, projectId);
                console.log('✅ [FILE-CONTENT] Repository cloned successfully');
            } else {
                console.log('❌ [FILE-CONTENT] No repositoryUrl provided, returning 404');
                return res.status(404).json({ success: false, error: 'Repository not found and no URL provided' });
            }
        }

        // Read file content
        const fullFilePath = path.join(repoPath, filePath);
        console.log('📄 [FILE-CONTENT] Reading file from:', fullFilePath);

        const content = await fs.readFile(fullFilePath, 'utf-8');

        console.log(`✅ [FILE-CONTENT] File content loaded: ${filePath} (${content.length} bytes)`);
        res.json({ success: true, content, filePath });

    } catch (error) {
        console.error('❌ [FILE-CONTENT] Error:', error.message);
        console.error('   Stack:', error.stack);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Save file content to cloned repository
 */
app.post('/workstation/:projectId/file-content', async (req, res) => {
    const { projectId } = req.params;
    const { filePath, content, repositoryUrl } = req.body;

    try {
        console.log('💾 Saving file:', filePath);

        if (!filePath || content === undefined) {
            return res.status(400).json({ success: false, error: 'File path and content are required' });
        }

        const reposDir = path.join(__dirname, 'cloned_repos');
        const repoPath = path.join(reposDir, projectId);

        // Check if repo exists
        try {
            await fs.access(repoPath);
        } catch {
            if (repositoryUrl) {
                console.log('📦 Repository not found, cloning first...');
                await cloneAndReadRepository(repositoryUrl, projectId);
            } else {
                return res.status(404).json({ success: false, error: 'Repository not found and no URL provided' });
            }
        }

        // Write file content
        const fullFilePath = path.join(repoPath, filePath);

        // Ensure directory exists
        const dir = path.dirname(fullFilePath);
        await fs.mkdir(dir, { recursive: true });

        await fs.writeFile(fullFilePath, content, 'utf-8');

        console.log(`✅ File saved: ${filePath} (${content.length} bytes)`);
        res.json({ success: true, filePath, size: content.length });

    } catch (error) {
        console.error('❌ Error saving file:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Search in files - grep-like functionality
app.get('/workstation/:projectId/search', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { query, repositoryUrl } = req.query;

        if (!query) {
            return res.status(400).json({ success: false, error: 'Search query is required' });
        }

        const reposDir = path.join(__dirname, 'cloned_repos');
        const repoPath = path.join(reposDir, projectId);

        // Check if repo exists
        try {
            await fs.access(repoPath);
        } catch {
            if (repositoryUrl) {
                console.log('📦 Repository not found, cloning first...');
                await cloneAndReadRepository(repositoryUrl, projectId);
            } else {
                return res.status(404).json({ success: false, error: 'Repository not found' });
            }
        }

        // Search in files using grep-like approach
        const results = [];
        const searchQuery = query.toLowerCase();

        async function searchInDirectory(dir, relativePath = '') {
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

                // Skip node_modules, .git, and other common directories
                if (entry.isDirectory()) {
                    if (!['node_modules', '.git', 'dist', 'build', '.next', 'coverage'].includes(entry.name)) {
                        await searchInDirectory(fullPath, relPath);
                    }
                } else if (entry.isFile()) {
                    // Only search in text files (skip binaries, images, etc.)
                    const ext = path.extname(entry.name).toLowerCase();
                    const textExtensions = ['.js', '.jsx', '.ts', '.tsx', '.json', '.txt', '.md', '.html', '.css', '.py', '.java', '.go', '.rs', '.c', '.cpp', '.h'];

                    if (textExtensions.includes(ext)) {
                        try {
                            const content = await fs.readFile(fullPath, 'utf-8');
                            const lines = content.split('\n');

                            lines.forEach((line, lineNumber) => {
                                if (line.toLowerCase().includes(searchQuery)) {
                                    results.push({
                                        file: relPath,
                                        line: lineNumber + 1,
                                        content: line.trim(),
                                        match: query
                                    });
                                }
                            });
                        } catch (err) {
                            // Skip files that can't be read as text
                            console.log(`⚠️ Skipping ${relPath}: ${err.message}`);
                        }
                    }
                }
            }
        }

        await searchInDirectory(repoPath);

        console.log(`🔍 Search completed: "${query}" - ${results.length} matches found`);
        res.json({ success: true, query, results, count: results.length });

    } catch (error) {
        console.error('❌ Error searching files:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * OPTIMIZATION 16: WebSocket Helper Function
 * Streams messages to WebSocket client (replaces SSE res.write)
 */
function wsWrite(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

// OPTIMIZATION 16: WebSocket Server (instead of app.listen for HTTP only)
// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('🔌 WebSocket client connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('📨 WebSocket message received:', data.type);

      if (data.type === 'chat') {
        // Handle chat messages via WebSocket
        const { prompt, conversationHistory, workstationId, context, projectId, repositoryUrl } = data.payload;

        // Create a pseudo-response object that uses WebSocket instead of SSE
        const wsResponse = {
            write: (data) => wsWrite(ws, JSON.parse(data.substring(6))), // Remove "data: " prefix
            end: () => wsWrite(ws, { type: 'done' }),
            setHeader: () => {}, // No-op for WebSocket
            status: () => wsResponse,
            json: (data) => wsWrite(ws, { type: 'error', ...data })
        };

        // Reuse existing /ai/chat logic by passing our WebSocket pseudo-response
        const req = { body: { prompt, conversationHistory, workstationId, context, projectId, repositoryUrl } };

        // Call the same handler that /ai/chat uses (we'll extract it to a function)
        await handleAIChatRequest(req, wsResponse);
      }
    } catch (error) {
      console.error('❌ WebSocket error:', error);
      wsWrite(ws, { type: 'error', error: error.message });
    }
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket client disconnected');
  });

  // Send welcome message
  wsWrite(ws, { type: 'connected', message: 'WebSocket connected successfully' });
});

// Start server with WebSocket support
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Drape Backend running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Network access: http://YOUR_IP:${PORT}/health`);
  console.log(`🔌 WebSocket endpoint: ws://YOUR_IP:${PORT}/ws`);
  console.log(`☁️  Connected to Google Cloud Project: ${PROJECT_ID}`);
  console.log(`🌍 Location: ${LOCATION}`);
  console.log(`🖥️  Workstation Management: ENABLED`);
  console.log(`👁️  Preview URL Detection: ENABLED`);
});

// Get project files from workstation
