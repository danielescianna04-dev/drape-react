const express = require('express');
const cors = require('cors');
const axios = require('axios');
const http = require('http');
const WebSocket = require('ws');
const os = require('os');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
require('dotenv').config();

// Auto-detect local network IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('192.168') || iface.address.startsWith('10.') || iface.address.startsWith('172.')) {
          return iface.address;
        }
      }
    }
  }
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}
const LOCAL_IP = getLocalIP();
const net = require('net');

/**
 * Check if a port is available
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} - True if port is available
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '0.0.0.0');
  });
}

/**
 * Find an available port starting from the given port
 * @param {number} startPort - Starting port to try
 * @param {number} maxAttempts - Maximum number of ports to try
 * @returns {Promise<number>} - First available port
 */
async function findAvailablePort(startPort, maxAttempts = 100) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
    console.log(`⚠️  Port ${port} is in use, trying ${port + 1}...`);
  }
  throw new Error(`No available port found after trying ${maxAttempts} ports starting from ${startPort}`);
}

/**
 * Use AI to analyze startup error output and identify required environment variables
 * Only called when the server fails to start
 */
async function aiAnalyzeStartupError(errorOutput, projectType) {
  const messages = [
    {
      role: 'system',
      content: `You are an expert at analyzing application startup errors.
Your task is to identify which environment variables are missing or incorrectly configured based on the error output.

IMPORTANT: Only return environment variables that are CLEARLY mentioned in the error or are REQUIRED for the specific error to be resolved.
Do NOT guess or add variables that might be useful - only the ones strictly needed to fix the current error.

Common patterns:
- "NEXT_PUBLIC_SUPABASE_URL is not defined" -> need NEXT_PUBLIC_SUPABASE_URL
- "Missing required environment variable: API_KEY" -> need API_KEY
- "Error: STRIPE_SECRET_KEY must be set" -> need STRIPE_SECRET_KEY
- "Cannot read property 'xyz' of undefined" where xyz is accessed from process.env -> need that env var

Respond in JSON format:
{
  "hasEnvError": true/false,
  "envVars": [
    { "key": "VAR_NAME", "description": "Brief description", "required": true }
  ],
  "errorSummary": "Brief summary of the error"
}`
    },
    {
      role: 'user',
      content: `Project type: ${projectType}

Error output:
${errorOutput.substring(0, 4000)}

Analyze this error and identify any missing environment variables. If the error is NOT related to environment variables, set hasEnvError to false.`
    }
  ];

  try {
    const response = await callGroqAI(messages, { json: true, temperature: 0.1, maxTokens: 500 });
    const parsed = JSON.parse(response);
    return {
      hasEnvError: parsed.hasEnvError || false,
      envVars: parsed.envVars || [],
      errorSummary: parsed.errorSummary || ''
    };
  } catch (error) {
    console.error('AI error analysis failed:', error.message);
    return { hasEnvError: false, envVars: [], errorSummary: '' };
  }
}

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

// Available AI models configuration
const AI_MODELS = {
  // Claude models
  'claude-sonnet-4': {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    description: 'Anthropic - Migliore qualità'
  },
  // Groq models (with tool calling support)
  'gpt-oss-120b': {
    provider: 'groq',
    modelId: 'openai/gpt-oss-120b',
    name: 'GPT OSS 120B',
    description: 'OpenAI via Groq - Potente e gratuito'
  },
  'gpt-oss-20b': {
    provider: 'groq',
    modelId: 'openai/gpt-oss-20b',
    name: 'GPT OSS 20B',
    description: 'OpenAI via Groq - Veloce'
  },
  'llama-4-scout': {
    provider: 'groq',
    modelId: 'meta-llama/llama-4-scout-17b-16e-instruct',
    name: 'Llama 4 Scout',
    description: 'Meta via Groq - Bilanciato'
  },
  'qwen-3-32b': {
    provider: 'groq',
    modelId: 'qwen/qwen3-32b',
    name: 'Qwen 3 32B',
    description: 'Alibaba via Groq - Ottimo per codice'
  }
};

// Get available AI models
app.get('/ai/models', (req, res) => {
  const models = Object.entries(AI_MODELS).map(([key, config]) => ({
    id: key,
    name: config.name,
    description: config.description,
    provider: config.provider
  }));
  res.json({ models });
});

// AI Chat endpoint - Multi-model support (Claude + Groq)
app.post('/ai/chat', async (req, res) => {
  const { prompt, conversationHistory = [], workstationId, context, projectId, repositoryUrl, selectedModel = 'claude-sonnet-4' } = req.body;

  console.log(`📥 Received selectedModel from frontend: "${selectedModel}"`);
  console.log(`📋 Available models: ${Object.keys(AI_MODELS).join(', ')}`);

  // Get model configuration
  const modelConfig = AI_MODELS[selectedModel] || AI_MODELS['claude-sonnet-4'];
  const model = modelConfig.modelId;
  const provider = modelConfig.provider;

  console.log(`🤖 Using model: ${modelConfig.name} (${provider}/${model})`);

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

    // Create streaming session with tool support
    let currentMessages = [...messages];

    // Main streaming loop to handle tool calls
    let continueLoop = true;
    let retryCount = 0;
    const MAX_RETRIES = 3;

    // ==========================================
    // GROQ PROVIDER - with tool calling support
    // ==========================================
    if (provider === 'groq') {
      const GROQ_API_KEY = process.env.GROQ_API_KEY;
      if (!GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY not configured');
      }

      // Convert tools to OpenAI format for Groq
      const groqTools = tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema
        }
      }));

      // Convert messages to OpenAI format
      const groqMessages = [
        { role: 'system', content: systemMessage },
        ...currentMessages.map(msg => {
          if (msg.role === 'user' && Array.isArray(msg.content)) {
            // Handle tool_result messages
            const toolResults = msg.content.filter(c => c.type === 'tool_result');
            if (toolResults.length > 0) {
              return toolResults.map(tr => ({
                role: 'tool',
                tool_call_id: tr.tool_use_id,
                content: tr.content
              }));
            }
            // Handle text content
            const textContent = msg.content.find(c => c.type === 'text');
            return { role: 'user', content: textContent?.text || '' };
          }
          if (msg.role === 'assistant' && Array.isArray(msg.content)) {
            // Handle assistant messages with tool calls
            const textBlocks = msg.content.filter(c => c.type === 'text');
            const toolUses = msg.content.filter(c => c.type === 'tool_use');
            return {
              role: 'assistant',
              content: textBlocks.map(t => t.text).join('') || null,
              tool_calls: toolUses.length > 0 ? toolUses.map(tu => ({
                id: tu.id,
                type: 'function',
                function: {
                  name: tu.name,
                  arguments: JSON.stringify(tu.input)
                }
              })) : undefined
            };
          }
          return { role: msg.role, content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) };
        }).flat()
      ];

      while (continueLoop) {
        continueLoop = false;

        try {
          console.log(`🔄 Calling Groq API with model: ${model}`);
          console.log(`🔑 GROQ_API_KEY present: ${GROQ_API_KEY ? 'YES' : 'NO'}`);

          // Groq streaming with tool support
          const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
              model: model,
              messages: groqMessages,
              temperature: 0.7,
              max_tokens: 8192,
              tools: groqTools.length > 0 ? groqTools : undefined,
              tool_choice: groqTools.length > 0 ? 'auto' : undefined,
              stream: true
            },
            {
              headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
              },
              responseType: 'stream',
              timeout: 120000
            }
          );

          let fullResponse = '';
          let toolCalls = [];
          let currentToolCall = null;

          // Process streaming response
          for await (const chunk of response.data) {
            const lines = chunk.toString().split('\n').filter(line => line.trim().startsWith('data:'));

            for (const line of lines) {
              const data = line.replace('data: ', '').trim();
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;

                if (delta?.content) {
                  fullResponse += delta.content;
                  res.write(`data: ${JSON.stringify({ text: delta.content })}\n\n`);
                }

                // Handle tool calls
                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    if (tc.index !== undefined) {
                      if (!toolCalls[tc.index]) {
                        toolCalls[tc.index] = { id: tc.id, name: '', arguments: '' };
                      }
                      if (tc.function?.name) {
                        toolCalls[tc.index].name = tc.function.name;
                        toolCalls[tc.index].id = tc.id;
                      }
                      if (tc.function?.arguments) {
                        toolCalls[tc.index].arguments += tc.function.arguments;
                      }
                    }
                  }
                }
              } catch (parseError) {
                // Skip invalid JSON chunks
              }
            }
          }

          // Execute tool calls if any
          if (toolCalls.length > 0) {
            console.log(`🔧 Groq: Executing ${toolCalls.length} tool(s)...`);

            const toolResults = await Promise.all(toolCalls.map(async (tc) => {
              try {
                const args = JSON.parse(tc.arguments || '{}');
                console.log(`🔧 Executing ${tc.name}:`, args);

                // Send tool call to frontend
                res.write(`data: ${JSON.stringify({
                  functionCall: { name: tc.name, args }
                })}\n\n`);

                const result = await executeTool(tc.name, args);

                return {
                  id: tc.id,
                  name: tc.name,
                  args,
                  result
                };
              } catch (error) {
                return {
                  id: tc.id,
                  name: tc.name,
                  args: {},
                  result: `Error: ${error.message}`
                };
              }
            }));

            // Send batched results to frontend
            res.write(`data: ${JSON.stringify({
              toolResultsBatch: toolResults.map(tr => ({
                name: tr.name,
                args: tr.args,
                result: tr.result
              })),
              count: toolResults.length
            })}\n\n`);

            // Add assistant message with tool calls
            groqMessages.push({
              role: 'assistant',
              content: fullResponse || null,
              tool_calls: toolCalls.map(tc => ({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: tc.arguments
                }
              }))
            });

            // Add tool results
            for (const tr of toolResults) {
              groqMessages.push({
                role: 'tool',
                tool_call_id: tr.id,
                content: tr.result
              });
            }

            continueLoop = true;
          }

        } catch (groqError) {
          console.error('❌ Groq error details:');
          console.error('  Status:', groqError.response?.status);
          // Safely extract error data to avoid circular JSON reference
          const errorData = groqError.response?.data?.error?.message || groqError.response?.data?.message || 'No additional data';
          console.error('  Data:', errorData);
          console.error('  Message:', groqError.message);

          // Send error to frontend
          res.write(`data: ${JSON.stringify({ text: `\n❌ Errore Groq: ${groqError.response?.data?.error?.message || groqError.message}\n` })}\n\n`);

          if (groqError.response?.status === 429 && retryCount < MAX_RETRIES) {
            retryCount++;
            const waitTime = Math.pow(2, retryCount) * 1000;
            res.write(`data: ${JSON.stringify({ text: `\n⏳ Rate limit - Riprovo tra ${waitTime/1000}s...\n` })}\n\n`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continueLoop = true;
          } else {
            throw groqError;
          }
        }
      }

      // Done with Groq
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // ==========================================
    // CLAUDE PROVIDER (Anthropic) - default
    // ==========================================
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

          console.log(`⏳ ${errorInfo.type} - Retry ${retryCount}/${MAX_RETRIES} in ${waitTime / 1000}s...`);

          // Send user-friendly error message to frontend
          res.write(`data: ${JSON.stringify({
            text: `\n${errorInfo.userMessage}\nRiprovo (${retryCount}/${MAX_RETRIES}) tra ${waitTime / 1000}s...\n`
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

      // Replace 0.0.0.0 with actual IP BEFORE health check
      if (previewUrl.includes('0.0.0.0')) {
        const os = require('os');
        const networkInterfaces = os.networkInterfaces();
        let localIp = 'localhost';

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

        previewUrl = previewUrl.replace('0.0.0.0', localIp);
        console.log(`🔗 Replaced 0.0.0.0 with ${localIp}: ${previewUrl}`);
      }

      // For dev server commands, do health check to verify it's actually running
      const isDevServerCommand = command.includes('start') ||
        command.includes('serve') ||
        command.includes('dev') ||
        command.includes('run');

      if (isDevServerCommand && output.exitCode === 0) {
        console.log('🔍 Performing health check on server...');

        // Expo/React Native and React servers take longer to start, increase attempts and delay
        const isExpo = command.includes('expo');
        const isReact = command.includes('react-scripts') || command.includes('npm start');
        const needsMoreTime = isExpo || isReact;
        const maxAttempts = needsMoreTime ? 45 : 15;  // 45 attempts for React/Expo (45 seconds)
        const delayMs = 1000;   // 1 second between attempts

        console.log(`⏱️  Health check config: ${maxAttempts} attempts, ${delayMs}ms delay ${isExpo ? '(Expo mode)' : isReact ? '(React mode)' : ''}`);

        // Always do health check in production mode
        healthCheckResult = await healthCheckUrl(previewUrl, maxAttempts, delayMs);
        serverReady = healthCheckResult.healthy;

        if (serverReady) {
          console.log(`✅ Server is verified running and healthy!`);

          // For Expo web projects, use the HTML wrapper endpoint
          if (command && command.includes('expo') && command.includes('--web')) {
            try {
              // Extract port from previewUrl
              const urlMatch = previewUrl.match(/:(\d+)/);
              if (urlMatch) {
                const port = urlMatch[1];

                // Get the backend URL (this server)
                const os = require('os');
                const networkInterfaces = os.networkInterfaces();
                let backendIp = 'localhost';

                // Find the first non-internal IPv4 address
                for (const interfaceName in networkInterfaces) {
                  const interfaces = networkInterfaces[interfaceName];
                  if (interfaces) {
                    for (const iface of interfaces) {
                      if (iface.family === 'IPv4' && !iface.internal) {
                        backendIp = iface.address;
                        break;
                      }
                    }
                  }
                  if (backendIp !== 'localhost') break;
                }

                // Point directly to webpack-dev-server (now bound to 0.0.0.0 via .env file)
                previewUrl = `http://${backendIp}:${port}`;
                console.log(`📱 Direct Expo Web URL: ${previewUrl}`);
              } else {
                console.log(`⚠️  Could not extract port from ${previewUrl}`);
              }
            } catch (error) {
              console.log(`⚠️  Error creating wrapper URL: ${error.message}`);
            }
          } else {
            // Don't convert Expo tunnel URLs (they're already public)
            if (!previewUrl.startsWith('exp://') && !previewUrl.includes('.exp.direct')) {
              // Convert to public URL for production
              previewUrl = convertToPublicUrl(previewUrl, workstationId || 'local');
              console.log(`🌐 Public preview URL: ${previewUrl}`);
            } else {
              console.log(`🚇 Using tunnel URL as-is: ${previewUrl}`);
            }
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

// Expo Web Preview Wrapper - Serves HTML that loads Expo bundle
app.get('/expo-preview/:port', async (req, res) => {
  try {
    const { port } = req.params;
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

    const metroUrl = `http://${localIp}:${port}`;

    // Serve an HTML page that loads the Expo bundle
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Expo Web Preview</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body, #root {
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #000;
    }
    #loading {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      color: #fff;
      z-index: 9999;
    }
    .spinner {
      width: 50px;
      height: 50px;
      border: 3px solid rgba(255,255,255,0.3);
      border-radius: 50%;
      border-top-color: #fff;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    #loading p {
      margin-top: 20px;
      font-size: 14px;
      opacity: 0.7;
    }
  </style>
</head>
<body>
  <div id="loading">
    <div class="spinner"></div>
    <p>Caricamento Expo Web...</p>
  </div>
  <div id="root"></div>

  <script>
    // Fetch the manifest first
    fetch('${metroUrl}')
      .then(response => response.json())
      .then(manifest => {
        if (manifest.launchAsset && manifest.launchAsset.url) {
          // Extract bundle URL and load it
          let bundleUrl = manifest.launchAsset.url;

          // Ensure we're using web platform
          bundleUrl = bundleUrl.replace('platform=ios', 'platform=web')
                               .replace('platform=android', 'platform=web');

          console.log('Loading Expo bundle:', bundleUrl);

          // Load the bundle script
          const script = document.createElement('script');
          script.src = bundleUrl;
          script.onload = () => {
            console.log('Expo bundle loaded successfully');
            const loading = document.getElementById('loading');
            if (loading) {
              loading.style.display = 'none';
            }
          };
          script.onerror = (error) => {
            console.error('Failed to load bundle:', error);
            document.getElementById('loading').innerHTML =
              '<p style="color: #ff6b6b;">❌ Errore nel caricamento del bundle</p>';
          };
          document.body.appendChild(script);
        } else {
          throw new Error('No launchAsset found in manifest');
        }
      })
      .catch(error => {
        console.error('Failed to load Expo manifest:', error);
        document.getElementById('loading').innerHTML =
          '<p style="color: #ff6b6b;">❌ Errore nel caricamento del manifest Expo</p>' +
          '<p style="font-size: 12px; margin-top: 10px;">Assicurati che il server Expo sia in esecuzione</p>';
      });
  </script>
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('❌ Expo preview wrapper error:', error);
    res.status(500).send('Internal Server Error');
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

  // Get the repository path - handle ws- prefix and case-insensitive matching
  let repoPath = path.join(__dirname, 'cloned_repos', workstationId);

  // If workstation ID starts with 'ws-', try to find the project folder with case-insensitive matching
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
      // For Expo projects, add --host lan flag
      // Environment variables (HOST, WDS_SOCKET_HOST) are passed via spawn env option
      if (command.includes('expo')) {
        execCommand = `${command} --host lan`;
      } else {
        execCommand = command;
      }
    } else {
      console.log('🌐 Adding HOST=0.0.0.0 to dev server command for network access');
      // On Windows, use cross-env or set command based on OS
      const isWindows = process.platform === 'win32';
      if (isWindows) {
        execCommand = `set HOST=0.0.0.0 && ${command}`;
      } else {
        execCommand = `HOST=0.0.0.0 ${command}`;
      }
    }
  }

  try {
    console.log(`💻 Executing in ${repoPath}: ${execCommand}`);

    // For dev server commands, we need to run them in background
    // For now, just return success to indicate server is starting
    if (isDevServerCommand) {
      // Extract port from command or use defaults
      let port = 3000; // default

      // Try to extract port from command with multiple patterns
      // Pattern 1: --port=8080 or --port 8080 (most frameworks)
      // Pattern 2: :8080 (some servers like Rails, PHP)
      // Pattern 3: http.server 8080 (Python simple server)
      // Pattern 4: PORT=8080 (environment variable style)
      const portPatterns = [
        /(?:--port[=\s])(\d+)/,           // --port=8080 or --port 8080
        /:(\d{4,5})\b/,                   // :8080
        /http\.server\s+(\d+)/,           // python3 -m http.server 8000
        /PORT[=\s](\d+)/                  // PORT=8080
      ];

      let portMatch = null;
      for (const pattern of portPatterns) {
        portMatch = command.match(pattern);
        if (portMatch) {
          port = parseInt(portMatch[1]);
          console.log(`📍 Extracted port from command: ${port}`);
          break;
        }
      }

      // Fallbacks if no port found
      if (!portMatch) {
        if (isReactNative) {
          port = 8081;
        }
        console.log(`📍 Using default port: ${port}`);
      }

      // Check if this is a static server command (node static-server.js)
      const isStaticServer = command.includes('static-server.js');

      // For ALL dev server commands, find an available port dynamically
      // This prevents port conflicts when running multiple projects
      console.log(`🔍 Checking if port ${port} is available...`);
      const originalPort = port;
      port = await findAvailablePort(port);

      if (port !== originalPort) {
        console.log(`⚠️  Port ${originalPort} is in use, using port ${port} instead`);
        // Update the command with the new port if it contains the original port
        if (execCommand.includes(originalPort.toString())) {
          execCommand = execCommand.replace(new RegExp(`\\b${originalPort}\\b`, 'g'), port.toString());
          console.log(`📝 Updated command: ${execCommand}`);
        }
        // Also set PORT environment variable for servers that use it
        execCommand = `PORT=${port} ${execCommand}`;
        console.log(`📝 Added PORT env variable: ${execCommand}`);
      } else {
        console.log(`✅ Port ${port} is available`);
      }

      // No port cleanup needed - we already found an available port dynamically
      // This avoids accidentally killing other processes

      // Initialize fs and path at the beginning
      const fs = require('fs');
      const fsPromises = require('fs').promises;
      const path = require('path');

      // For Expo/React Native projects, create .env file intelligently
      if (isReactNative) {
        try {
          const os = require('os');
          const networkInterfaces = os.networkInterfaces();
          let localIp = 'localhost';

          // Get local IP
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

          const envPath = path.join(repoPath, '.env');
          const envExamplePath = path.join(repoPath, '.env.example');

          // IMPORTANT: Check if .env already exists - don't overwrite user's configuration!
          if (fs.existsSync(envPath)) {
            console.log('✅ .env file already exists - preserving user configuration');

            // Only check if it has necessary variables for Expo Web
            if (command.includes('--web')) {
              const existingContent = fs.readFileSync(envPath, 'utf8');
              let needsUpdate = false;
              let updatedContent = existingContent;

              // Check if HOST and WDS_SOCKET_HOST are present
              if (!existingContent.includes('HOST=')) {
                console.log('⚠️  Adding missing HOST=0.0.0.0 to existing .env');
                updatedContent = `HOST=0.0.0.0\n${updatedContent}`;
                needsUpdate = true;
              }
              if (!existingContent.includes('WDS_SOCKET_HOST=')) {
                console.log('⚠️  Adding missing WDS_SOCKET_HOST=0.0.0.0 to existing .env');
                updatedContent = `WDS_SOCKET_HOST=0.0.0.0\n${updatedContent}`;
                needsUpdate = true;
              }

              // Only write if we added missing variables
              if (needsUpdate) {
                fs.writeFileSync(envPath, updatedContent, 'utf8');
                console.log('📝 Updated .env with missing webpack-dev-server variables');
              }
            }
          } else {
            // No .env exists - create it from template or minimal config
            let envContent = '';

            // Check if .env.example exists
            if (fs.existsSync(envExamplePath)) {
              console.log('📄 Found .env.example - using it as template');
              envContent = fs.readFileSync(envExamplePath, 'utf8');

              // Replace dynamic values (IP addresses)
              envContent = envContent.replace(/192\.168\.\d+\.\d+/g, localIp);
              envContent = envContent.replace(/localhost:3000/g, `${localIp}:${PORT}`);

              // Ensure webpack dev server variables are present (for Expo Web)
              if (command.includes('--web')) {
                if (!envContent.includes('HOST=')) {
                  envContent = `HOST=0.0.0.0\n${envContent}`;
                }
                if (!envContent.includes('WDS_SOCKET_HOST=')) {
                  envContent = `WDS_SOCKET_HOST=0.0.0.0\n${envContent}`;
                }
              }
            } else {
              console.log('⚠️  No .env.example found - creating minimal .env');
              // Minimal .env for projects without .env.example
              envContent = `# Auto-generated configuration\n`;
              if (command.includes('--web')) {
                envContent += `HOST=0.0.0.0\nWDS_SOCKET_HOST=0.0.0.0\n\n`;
              }
              envContent += `# Backend URL\nEXPO_PUBLIC_API_URL=http://${localIp}:${PORT}/\n`;
            }

            fs.writeFileSync(envPath, envContent, 'utf8');
            console.log(`📝 Created .env file for ${command.includes('--web') ? 'Expo Web' : 'Expo'} with backend at ${localIp}:${PORT}`);
          }
        } catch (error) {
          console.error('⚠️  Failed to create .env file:', error.message);
        }

        // Check if node_modules exists for React Native projects, if not install dependencies
        const nodeModulesPath = path.join(repoPath, 'node_modules');
        let needsInstall = false;
        try {
          await fsPromises.access(nodeModulesPath);
          console.log('✅ node_modules exists');
        } catch {
          console.log('📦 node_modules not found, installing dependencies...');
          needsInstall = true;
        }

        if (needsInstall) {
          try {
            console.log('⏳ Running npm install...');
            console.log('   This may take several minutes for large projects...');
            await execAsync('npm install', {
              cwd: repoPath,
              timeout: 600000, // 10 minutes for install - Expo projects have many dependencies
              maxBuffer: 10 * 1024 * 1024 // 10MB buffer for npm output
            });
            console.log('✅ Dependencies installed successfully');
          } catch (installErr) {
            console.error('❌ Failed to install dependencies:', installErr.message);
            // Log more details about the error
            if (installErr.killed) {
              console.error('   Installation was killed (likely timeout)');
            }
            if (installErr.code) {
              console.error('   Exit code:', installErr.code);
            }
            return {
              stdout: '',
              stderr: `Failed to install dependencies: ${installErr.message}`,
              exitCode: 1
            };
          }
        }
      }

      // Check if node_modules exists for ANY JS project (not just React Native)
      // This applies to: React, Vue, Angular, Next.js, Svelte, etc.
      const packageJsonPath = path.join(repoPath, 'package.json');
      const nodeModulesPath = path.join(repoPath, 'node_modules');

      // Only check for JS projects that have package.json
      if (fs.existsSync(packageJsonPath)) {
        let needsInstall = false;
        try {
          await fsPromises.access(nodeModulesPath);
          console.log('✅ node_modules exists');
        } catch {
          console.log('📦 node_modules not found, installing dependencies...');
          needsInstall = true;
        }

        if (needsInstall) {
          try {
            console.log('⏳ Running npm install...');
            console.log('   This may take several minutes for large projects...');
            await execAsync('npm install', {
              cwd: repoPath,
              timeout: 600000, // 10 minutes for install
              maxBuffer: 10 * 1024 * 1024 // 10MB buffer for npm output
            });
            console.log('✅ Dependencies installed successfully');
          } catch (installErr) {
            console.error('❌ Failed to install dependencies:', installErr.message);
            if (installErr.killed) {
              console.error('   Installation was killed (likely timeout)');
            }
            if (installErr.code) {
              console.error('   Exit code:', installErr.code);
            }
            return {
              stdout: '',
              stderr: `Failed to install dependencies: ${installErr.message}`,
              exitCode: 1
            };
          }
        }
      }

      // Start ALL dev servers in background (non-blocking) - applies to ALL project types!
      // This includes: React, Vue, Next.js, Python static servers, PHP, Rails, etc.
      const { spawn } = require('child_process');
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'cmd.exe' : 'sh';
      const shellArg = isWindows ? '/c' : '-c';

      // Prepare environment variables - inherit from parent and add network binding variables
      const spawnEnv = {
        ...process.env,
        HOST: '0.0.0.0',                      // For webpack-dev-server (Expo Web)
        WDS_SOCKET_HOST: '0.0.0.0',           // For webpack HMR socket
        EXPO_DEVTOOLS_LISTEN_ADDRESS: '0.0.0.0',  // For Expo Metro (fallback)
        SKIP_PREFLIGHT_CHECK: 'true',         // Skip Create React App dependency checks
        BROWSER: 'none',                      // Don't open browser automatically
        NODE_OPTIONS: '--openssl-legacy-provider'  // Fix for older react-scripts with Node 17+
      };

      console.log('🌐 Spawn environment variables set:', {
        HOST: spawnEnv.HOST,
        WDS_SOCKET_HOST: spawnEnv.WDS_SOCKET_HOST,
        EXPO_DEVTOOLS_LISTEN_ADDRESS: spawnEnv.EXPO_DEVTOOLS_LISTEN_ADDRESS,
        SKIP_PREFLIGHT_CHECK: spawnEnv.SKIP_PREFLIGHT_CHECK,
        BROWSER: spawnEnv.BROWSER,
        NODE_OPTIONS: spawnEnv.NODE_OPTIONS
      });
      console.log('💻 Final command to execute:', execCommand);

      const serverProcess = spawn(shell, [shellArg, execCommand], {
        cwd: repoPath,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],  // Capture stdout/stderr for debugging
        env: spawnEnv
      });

      // Log spawn errors for debugging
      serverProcess.on('error', (err) => {
        console.error('❌ Spawn error:', err.message);
      });

      // Log process output for debugging (first few seconds)
      let outputBuffer = '';
      let errorBuffer = '';

      if (serverProcess.stdout) {
        serverProcess.stdout.on('data', (data) => {
          outputBuffer += data.toString();
          if (outputBuffer.length < 2000) {
            console.log('📤 Process output:', data.toString().trim());
          }
        });
      }

      if (serverProcess.stderr) {
        serverProcess.stderr.on('data', (data) => {
          errorBuffer += data.toString();
          console.log('⚠️  Process stderr:', data.toString().trim());
        });
      }

      serverProcess.unref(); // Allow parent to exit independently

      console.log('✅ Dev server started in background (PID:', serverProcess.pid, ')');
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

    // Preserve the path, search params, and hash from original URL
    const pathname = url.pathname || '/';
    const search = url.search || '';
    const hash = url.hash || '';

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

      const fullUrl = `http://${localIp}:${port}${pathname}${search}${hash}`;
      console.log(`🌐 Converting ${localUrl} to ${fullUrl}`);
      return fullUrl;
    }

    // In production: replace localhost with workstation's public hostname
    // Example: http://localhost:3000 -> https://workstation-abc123-3000.run.app
    const publicHost = process.env.WORKSTATION_PUBLIC_HOST ||
      `${workstationId}-${port}.${LOCATION}.run.app`;

    return `https://${publicHost}${pathname}${search}${hash}`;
  } catch (error) {
    console.error('Error converting URL:', error);
    return localUrl;
  }
}

// Detect preview URL from command output
function detectPreviewUrl(output, command) {
  const isExpoWeb = command && command.includes('expo') && command.includes('--web');

  // Check for ACTUAL_PORT from our static-server.js (automatic port finding)
  const actualPortMatch = output.match(/ACTUAL_PORT:(\d+)/);
  if (actualPortMatch) {
    const port = actualPortMatch[1];
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    let localIp = 'localhost';

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

    const url = `http://${localIp}:${port}`;
    console.log(`🔗 Detected ACTUAL_PORT: ${port}, using URL: ${url}`);
    return url;
  }

  // Look for common development server patterns
  const urlPatterns = [
    // Expo tunnel URLs (exp:// protocol for React Native)
    /exp:\/\/[^\s]+/,
    // Expo web URLs when using --tunnel
    /https?:\/\/[a-z0-9-]+\.exp\.direct[^\s]*/,
    // PRIORITY: Network URL (accessible from mobile/network devices)
    // Must come BEFORE Local: to prefer network-accessible URLs
    /Network:\s+(https?:\/\/[^\s]+)/,
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
      let url = match[1] || match[0];
      console.log(`🔗 Detected preview URL: ${url}`);

      // If we found localhost/127.0.0.1/0.0.0.0, replace with actual network IP
      if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('0.0.0.0')) {
        // Try to extract network URL from output if it exists
        const networkMatch = output.match(/Network:\s+(https?:\/\/[^\s]+)/);
        if (networkMatch) {
          const networkUrl = networkMatch[1];
          console.log(`🔗 Replacing localhost with network URL: ${networkUrl}`);
          url = networkUrl;
        } else {
          // Fallback: manually replace with actual local IP
          const os = require('os');
          const networkInterfaces = os.networkInterfaces();
          let localIp = 'localhost';

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

          url = url.replace('localhost', localIp)
            .replace('127.0.0.1', localIp)
            .replace('0.0.0.0', localIp);
          console.log(`🔗 Replacing localhost with detected IP: ${url}`);
        }
      }

      // For Expo web SDK 54+, Metro serves the manifest at root
      // The WebView or browser will handle loading the correct bundle
      if (isExpoWeb) {
        // Remove any trailing slashes for consistency
        url = url.replace(/\/$/, '');
        console.log(`📱 Expo web detected, using Metro manifest URL: ${url}`);
      }

      return url;
    }
  }

  return null;
}

// Check if a repository requires authentication BEFORE importing
app.post('/repo/check-visibility', async (req, res) => {
  const { repositoryUrl, githubToken } = req.body;

  console.log('🔍 Checking repo visibility BEFORE import:', repositoryUrl);

  try {
    const result = await checkIfRepoIsPrivate(repositoryUrl, githubToken);

    if (result.requiresAuth) {
      console.log('🔒 Repository requires authentication');
      return res.status(401).json({
        success: false,
        requiresAuth: true,
        isPrivate: result.isPrivate,
        message: 'Questa repository è privata. È necessario autenticarsi con GitHub.'
      });
    }

    console.log('✅ Repository is accessible');
    return res.json({
      success: true,
      requiresAuth: false,
      isPrivate: result.isPrivate,
      repoInfo: result.repoInfo
    });
  } catch (error) {
    console.error('❌ Error checking repo visibility:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

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
        const repoMatch = repositoryUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/);
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
          // Let's check if the repo exists using GitHub's public API endpoint
          const repoMatch = repositoryUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/);
          if (repoMatch) {
            const [, owner, repo] = repoMatch;
            try {
              // Use GitHub API to check repo visibility - this endpoint returns repo info for public repos
              // without authentication, and 404 for private repos
              const repoInfo = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
                headers: {
                  'Accept': 'application/vnd.github.v3+json',
                  'User-Agent': 'Drape-Mobile-IDE'
                },
                validateStatus: (status) => status === 200 || status === 404
              });

              if (repoInfo.status === 200) {
                // Repo is public and exists - the 404 was for branches, not the repo
                // This means the default branch is not main/master
                console.log('📂 Repository is public, checking available branches...');
                const defaultBranch = repoInfo.data.default_branch;
                console.log(`🌿 Default branch: ${defaultBranch}`);

                // Try to fetch with the actual default branch
                try {
                  const branchResponse = await axios.get(
                    `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
                    { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Drape-Mobile-IDE' } }
                  );

                  files = branchResponse.data.tree
                    .filter(item => item.type === 'blob')
                    .map(item => item.path)
                    .filter(path =>
                      !path.includes('node_modules/') &&
                      !path.startsWith('.git/') &&
                      !path.includes('/dist/') &&
                      !path.includes('/build/')
                    )
                    .slice(0, 500);

                  console.log(`✅ Found ${files.length} files from GitHub (branch: ${defaultBranch})`);
                } catch (branchError) {
                  console.log('⚠️ Could not fetch files from default branch, using fallback');
                  files = ['README.md', 'package.json', '.gitignore', 'src/index.js', 'src/App.js'];
                }
              } else {
                // Repo returned 404 on the public API - it's private
                console.log('🔒 Private repository detected, authentication required');
                return res.status(401).json({
                  error: 'Authentication required',
                  message: 'This repository is private and requires authentication',
                  requiresAuth: true
                });
              }
            } catch (checkError) {
              // Network error or other issue
              console.log('❌ Error checking repository:', checkError.message);
              return res.status(404).json({
                error: 'Repository not found',
                message: 'Could not verify repository existence',
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
      }
    }

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

    // Get list of files recursively (needed to detect files in subdirectories)
    const getAllFiles = async (dirPath, arrayOfFiles = []) => {
      const files = await fs.readdir(dirPath);

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = await fs.stat(filePath);

        if (stat.isDirectory()) {
          // Skip .git and node_modules
          if (file !== '.git' && file !== 'node_modules') {
            arrayOfFiles = await getAllFiles(filePath, arrayOfFiles);
          }
        } else {
          // Store relative path from repo root
          const relativePath = path.relative(repoPath, filePath);
          arrayOfFiles.push(relativePath);
        }
      }

      return arrayOfFiles;
    };

    let files = [];
    try {
      files = await getAllFiles(repoPath);
      console.log(`   Found ${files.length} files (recursive)`);
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

// Check git status for unsaved changes
app.get('/workstation/:id/git-status', async (req, res) => {
  let { id } = req.params;

  console.log(`🔍 Checking git status for workstation: ${id}`);

  try {
    const fs = require('fs').promises;
    const path = require('path');
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    // Handle ws- prefix and case-insensitive matching
    let repoPath = path.join(__dirname, 'cloned_repos', id);

    if (id.startsWith('ws-')) {
      const projectIdLower = id.substring(3);
      const clonedReposDir = path.join(__dirname, 'cloned_repos');

      try {
        const folders = await fs.readdir(clonedReposDir);
        const matchingFolder = folders.find(f => f.toLowerCase() === projectIdLower);

        if (matchingFolder) {
          repoPath = path.join(clonedReposDir, matchingFolder);
        }
      } catch (err) {
        console.error('   Error reading cloned_repos:', err);
      }
    }

    // Check if repository exists
    try {
      await fs.access(repoPath);
    } catch {
      return res.json({
        hasUncommittedChanges: false,
        hasUnpushedCommits: false,
        message: 'Repository not found locally'
      });
    }

    // Check for uncommitted changes
    let hasUncommittedChanges = false;
    let uncommittedFiles = [];
    try {
      const { stdout: statusOutput } = await execAsync(`cd "${repoPath}" && git status --porcelain`);
      if (statusOutput.trim()) {
        hasUncommittedChanges = true;
        uncommittedFiles = statusOutput.trim().split('\n').map(line => line.trim());
      }
    } catch (err) {
      console.log('   Not a git repository or git error:', err.message);
    }

    // Check for unpushed commits
    let hasUnpushedCommits = false;
    let unpushedCount = 0;
    try {
      const { stdout: logOutput } = await execAsync(`cd "${repoPath}" && git log @{u}..HEAD --oneline 2>/dev/null || echo ""`);
      if (logOutput.trim()) {
        hasUnpushedCommits = true;
        unpushedCount = logOutput.trim().split('\n').filter(l => l.trim()).length;
      }
    } catch (err) {
      // No upstream branch or other error - that's ok
    }

    res.json({
      hasUncommittedChanges,
      hasUnpushedCommits,
      uncommittedFiles,
      unpushedCount,
      message: hasUncommittedChanges || hasUnpushedCommits
        ? 'Ci sono modifiche non salvate su Git'
        : 'Tutto sincronizzato con Git'
    });
  } catch (error) {
    console.error('Git status error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Workstation delete endpoint - Also deletes cloned repository
app.delete('/workstation/:id', async (req, res) => {
  let { id } = req.params;
  const { force } = req.query; // ?force=true to skip git check

  console.log(`🗑️ Deleting workstation: ${id}, force: ${force}`);

  try {
    const fs = require('fs').promises;
    const path = require('path');

    // Handle ws- prefix and case-insensitive matching
    let repoPath = path.join(__dirname, 'cloned_repos', id);
    let actualFolderName = id;

    if (id.startsWith('ws-')) {
      const projectIdLower = id.substring(3);
      const clonedReposDir = path.join(__dirname, 'cloned_repos');

      try {
        const folders = await fs.readdir(clonedReposDir);
        const matchingFolder = folders.find(f => f.toLowerCase() === projectIdLower);

        if (matchingFolder) {
          repoPath = path.join(clonedReposDir, matchingFolder);
          actualFolderName = matchingFolder;
        }
      } catch (err) {
        console.error('   Error reading cloned_repos:', err);
      }
    }

    // Delete the cloned repository folder
    let folderDeleted = false;
    try {
      await fs.access(repoPath);
      await fs.rm(repoPath, { recursive: true, force: true });
      folderDeleted = true;
      console.log(`✅ Deleted cloned repository: ${repoPath}`);
    } catch (err) {
      console.log(`⚠️ Repository folder not found or already deleted: ${repoPath}`);
    }

    res.json({
      workstationId: id,
      status: 'deleted',
      folderDeleted,
      message: folderDeleted
        ? 'Progetto e file locali eliminati'
        : 'Progetto eliminato (nessun file locale trovato)'
    });
  } catch (error) {
    console.error('Workstation deletion error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Environment Variables / Secrets Management
// Cache per analisi AI in corso
const envAnalysisCache = new Map(); // workstationId -> { status, variables, timestamp }

// POST /workstation/:id/env-analyze - Avvia analisi AI delle variabili d'ambiente
app.post('/workstation/:id/env-analyze', async (req, res) => {
  const { id } = req.params;

  try {
    const fs = require('fs');
    const path = require('path');

    // Check if analysis is already in progress or recent
    const cached = envAnalysisCache.get(id);
    if (cached && cached.status === 'analyzing') {
      return res.json({ status: 'analyzing', message: 'Analysis already in progress' });
    }
    if (cached && cached.status === 'complete' && Date.now() - cached.timestamp < 300000) {
      // Cache valid for 5 minutes
      return res.json({ status: 'complete', variables: cached.variables });
    }

    // Mark as analyzing with progress
    envAnalysisCache.set(id, { status: 'analyzing', progress: 0, phase: 'starting', timestamp: Date.now() });

    // Get workstation repository path - handle both ws-xxx format and direct ID
    let repoName = id.replace(/\//g, '_').replace(/:/g, '_');
    // Remove ws- prefix if present and try to find the repo
    const cleanId = repoName.startsWith('ws-') ? repoName.slice(3) : repoName;

    let repoPath = path.join(__dirname, 'cloned_repos', repoName);

    // Try with original ID first
    if (!fs.existsSync(repoPath)) {
      // Try with clean ID (without ws- prefix)
      repoPath = path.join(__dirname, 'cloned_repos', cleanId);
    }

    // Try case-insensitive match in cloned_repos folder
    if (!fs.existsSync(repoPath)) {
      const clonedReposPath = path.join(__dirname, 'cloned_repos');
      if (fs.existsSync(clonedReposPath)) {
        const dirs = fs.readdirSync(clonedReposPath);
        const match = dirs.find(d => d.toLowerCase() === cleanId.toLowerCase());
        if (match) {
          repoPath = path.join(clonedReposPath, match);
        }
      }
    }

    console.log(`🔑 [env-analyze] id=${id}, cleanId=${cleanId}, repoPath=${repoPath}, exists=${fs.existsSync(repoPath)}`);

    if (!fs.existsSync(repoPath)) {
      envAnalysisCache.delete(id);
      return res.status(404).json({ error: 'Repository not found' });
    }

    // Start async analysis
    res.json({ status: 'analyzing', message: 'Analysis started' });

    // Do analysis in background
    analyzeEnvVariablesWithAI(id, repoPath).catch(err => {
      console.error('AI env analysis failed:', err);
      envAnalysisCache.set(id, { status: 'error', error: err.message, timestamp: Date.now() });
    });

  } catch (error) {
    console.error('Failed to start env analysis:', error.message);
    envAnalysisCache.delete(id);
    res.status(500).json({ error: error.message });
  }
});

// GET /workstation/:id/env-analyze/status - Controlla stato analisi
app.get('/workstation/:id/env-analyze/status', async (req, res) => {
  const { id } = req.params;
  const cached = envAnalysisCache.get(id);

  if (!cached) {
    return res.json({ status: 'not_started' });
  }

  res.json(cached);
});

// Funzione per analizzare le variabili con AI - Approccio in 2 fasi
async function analyzeEnvVariablesWithAI(workstationId, repoPath) {
  const fs = require('fs');
  const path = require('path');

  console.log(`🔍 Starting AI env analysis for ${workstationId}`);

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    envAnalysisCache.set(workstationId, {
      status: 'error',
      error: 'GROQ_API_KEY not configured',
      timestamp: Date.now()
    });
    return;
  }

  // ============ FASE 1: AI identifica i pattern da cercare ============
  console.log(`📋 Phase 1: AI identifying env patterns for ${workstationId}`);
  envAnalysisCache.set(workstationId, { status: 'analyzing', progress: 10, phase: 'Identificazione pattern...', timestamp: Date.now() });

  // Leggi alcuni file chiave per capire il tipo di progetto
  const sampleFiles = [];
  const keyFiles = ['package.json', 'requirements.txt', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle', '.env.example', '.env.sample', 'docker-compose.yml'];

  for (const keyFile of keyFiles) {
    const filePath = path.join(repoPath, keyFile);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8').substring(0, 2000);
        sampleFiles.push({ file: keyFile, content });
      } catch (e) { /* ignore */ }
    }
  }

  // Leggi anche i primi file sorgente trovati
  const extensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.java', '.rb', '.php', '.env.example'];
  let filesScanned = 0;

  function scanForSamples(dir, depth = 0) {
    if (depth > 2 || filesScanned >= 5) return;
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        if (filesScanned >= 5) break;
        if (item.startsWith('.') || item === 'node_modules' || item === 'vendor' || item === 'dist' || item === 'build' || item === '__pycache__') continue;
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanForSamples(fullPath, depth + 1);
        } else if (stat.isFile() && extensions.includes(path.extname(item))) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8').substring(0, 1500);
            sampleFiles.push({ file: path.relative(repoPath, fullPath), content });
            filesScanned++;
          } catch (e) { /* ignore */ }
        }
      }
    } catch (e) { /* ignore */ }
  }

  scanForSamples(repoPath);

  // Prima chiamata AI: identifica i pattern da cercare
  const phase1Prompt = `Analyze this project and tell me what patterns to search for to find ALL environment variables.

Project files:
${sampleFiles.map(f => `=== ${f.file} ===\n${f.content}`).join('\n\n')}

Return ONLY a JSON object with this format (no markdown, just JSON):
{
  "patterns": [
    "process.env.",
    "import.meta.env.",
    "os.getenv(",
    "etc..."
  ],
  "fileExtensions": [".js", ".ts", ".py", "etc..."],
  "configFiles": ["config.js", ".env.example", "etc..."],
  "projectType": "nodejs/python/go/etc",
  "hints": "any special patterns or files to check for this project type"
}

Be thorough - include ALL patterns used in this language/framework for reading env vars.`;

  let searchPatterns;
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{ role: 'user', content: phase1Prompt }],
        temperature: 0.1,
        max_tokens: 1000
      })
    });

    if (!response.ok) throw new Error(`Groq API error: ${response.status}`);

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '{}';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    searchPatterns = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (e) {
    console.error('Phase 1 AI error:', e);
    // Fallback a pattern standard
    searchPatterns = {
      patterns: ['process.env.', 'import.meta.env.', 'os.getenv(', 'os.environ[', 'ENV[', 'getenv('],
      fileExtensions: ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.java', '.rb', '.php'],
      configFiles: ['.env.example', '.env.sample', 'config.js', 'config.ts', 'settings.py']
    };
  }

  console.log(`🔎 Phase 1 complete. Patterns: ${searchPatterns?.patterns?.length || 0}, Extensions: ${searchPatterns?.fileExtensions?.length || 0}`);
  envAnalysisCache.set(workstationId, { status: 'analyzing', progress: 30, phase: 'Pattern identificati', timestamp: Date.now() });

  // ============ FASE 2: Scansiona i file con i pattern identificati ============
  console.log(`📂 Phase 2: Scanning files with identified patterns`);
  envAnalysisCache.set(workstationId, { status: 'analyzing', progress: 40, phase: 'Scansione file...', timestamp: Date.now() });

  const patterns = searchPatterns?.patterns || ['process.env.', 'import.meta.env.'];
  const exts = searchPatterns?.fileExtensions || ['.js', '.ts', '.jsx', '.tsx', '.py'];
  const configFiles = searchPatterns?.configFiles || ['.env.example'];

  // Crea regex dai pattern
  const patternRegex = new RegExp(patterns.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');

  const codeSnippets = [];
  const foundVarNames = new Set();
  let totalFilesScanned = 0;
  let totalDirsScanned = 0;

  function scanDir(dir, depth = 0) {
    if (depth > 10) return; // Profondità massima 10 livelli
    try {
      const items = fs.readdirSync(dir);
      totalDirsScanned++;
      console.log(`  📁 [depth=${depth}] Scanning: ${path.relative(repoPath, dir) || '.'} (${items.length} items)`);

      for (const item of items) {
        if (item.startsWith('.') && !configFiles.includes(item)) continue;
        if (['node_modules', 'vendor', 'dist', 'build', '__pycache__', '.git', 'coverage'].includes(item)) continue;

        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          scanDir(fullPath, depth + 1);
        } else if (stat.isFile()) {
          const ext = path.extname(item);
          const isConfig = configFiles.includes(item);

          if (exts.includes(ext) || isConfig) {
            totalFilesScanned++;
            try {
              const content = fs.readFileSync(fullPath, 'utf8');

              // Cerca tutti i match dei pattern
              const matches = content.match(patternRegex);
              if (matches || isConfig) {
                const lines = content.split('\n');
                const relevantLines = [];
                const fileVars = [];

                for (let i = 0; i < lines.length; i++) {
                  const line = lines[i];
                  if (patternRegex.test(line) || (isConfig && line.includes('='))) {
                    // Estrai anche contesto (linea prima e dopo)
                    const context = [];
                    if (i > 0) context.push(lines[i-1]);
                    context.push(line);
                    if (i < lines.length - 1) context.push(lines[i+1]);
                    relevantLines.push(context.join('\n'));

                    // Estrai nome variabile se possibile
                    const envMatch = line.match(/(?:process\.env\.|import\.meta\.env\.|os\.getenv\(["']|os\.environ\[["']|ENV\[["'])([A-Z_][A-Z0-9_]*)/i);
                    if (envMatch) {
                      foundVarNames.add(envMatch[1]);
                      fileVars.push(envMatch[1]);
                    }
                  }
                }

                if (relevantLines.length > 0 || isConfig) {
                  codeSnippets.push({
                    file: path.relative(repoPath, fullPath),
                    content: isConfig ? content.substring(0, 2000) : relevantLines.slice(0, 15).join('\n---\n').substring(0, 1500)
                  });
                  if (fileVars.length > 0) {
                    console.log(`    📄 ${path.relative(repoPath, fullPath)}: found ${fileVars.length} vars [${fileVars.join(', ')}]`);
                  }
                }
              }
            } catch (e) { /* ignore read errors */ }
          }
        }
      }
    } catch (e) { /* ignore dir errors */ }
  }

  scanDir(repoPath);

  console.log(`📄 Found ${codeSnippets.length} files with env patterns, ${foundVarNames.size} variable names extracted directly`);
  envAnalysisCache.set(workstationId, { status: 'analyzing', progress: 60, phase: 'File scansionati', timestamp: Date.now() });

  if (codeSnippets.length === 0 && foundVarNames.size === 0) {
    envAnalysisCache.set(workstationId, {
      status: 'complete',
      variables: [],
      message: 'No environment variables found in code',
      timestamp: Date.now()
    });
    return;
  }

  // ============ FASE 3: AI analizza i file trovati ============
  console.log(`🤖 Phase 3: AI analyzing ${codeSnippets.length} code snippets, ${foundVarNames.size} vars found`);
  envAnalysisCache.set(workstationId, { status: 'analyzing', progress: 70, phase: 'Analisi AI...', timestamp: Date.now() });

  // Se abbiamo trovato variabili direttamente, usiamo l'AI solo per arricchire le descrizioni
  // Limitiamo i snippet a 50 per non superare il limite token
  const snippetsForAI = codeSnippets.slice(0, 50);
  const codeContext = snippetsForAI.map(s => `=== ${s.file} ===\n${s.content}`).join('\n\n');
  const varsList = Array.from(foundVarNames).join(', ');

  const phase3Prompt = `I found these environment variables in a project: ${varsList}

Here's the code context where they are used:
${codeContext}

For each variable, provide a description of what it's used for based on the code context.
Return ONLY a JSON array with this exact format (no markdown, just JSON):
[
  {"key": "VAR_NAME", "description": "what it's used for", "isSecret": true/false, "defaultValue": "if found"}
]

Rules:
- ONLY include variables that are PROJECT-SPECIFIC configuration (API keys, database URLs, service endpoints, feature flags)
- isSecret=true for passwords, tokens, API keys, secrets, credentials, database URLs
- defaultValue only if explicitly defined in code
- EXCLUDE system/OS variables like: PATH, HOME, USER, SHELL, LANG, TERM, PWD, OLDPWD, TMPDIR, DISPLAY, XDG_*, LC_*, DART_HOME, FLUTTER_HOME, ANDROID_*, JAVA_HOME, NODE_PATH, etc.
- EXCLUDE generic runtime variables that are not project configuration
- Only return variables the user would need to configure in a .env file to run the project`;

  let variables = [];

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{ role: 'user', content: phase3Prompt }],
        temperature: 0.1,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '[]';

    // Parse JSON from response
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        variables = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse AI response:', e);
    }
  } catch (error) {
    console.error('AI analysis error (continuing with regex results):', error);
  }

  // Aggiungi tutte le variabili trovate direttamente con regex che l'AI potrebbe aver perso
  const aiKeys = new Set(variables.map(v => v.key));
  for (const varName of foundVarNames) {
    if (!aiKeys.has(varName)) {
      variables.push({
        key: varName,
        description: 'Environment variable used in the project',
        isSecret: /password|secret|key|token|api|auth|credential|db|database|mongo|redis|mysql|postgres|private/i.test(varName),
        defaultValue: null
      });
    }
  }

  // Filter out system/OS variables that are not project-specific
  const systemVarsToExclude = new Set([
    'PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'TERM', 'PWD', 'OLDPWD', 'TMPDIR', 'DISPLAY',
    'LOGNAME', 'HOSTNAME', 'HOSTTYPE', 'OSTYPE', 'MACHTYPE', 'SHLVL', 'PS1', 'PS2',
    'EDITOR', 'VISUAL', 'PAGER', 'BROWSER', 'COLORTERM', 'LS_COLORS', 'CLICOLOR',
    'DART_HOME', 'FLUTTER_HOME', 'FLUTTER_ROOT', 'PUB_CACHE',
    'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'ANDROID_NDK_HOME',
    'JAVA_HOME', 'JRE_HOME', 'CLASSPATH',
    'NODE_PATH', 'NVM_DIR', 'NVM_BIN', 'NPM_CONFIG_PREFIX',
    'GOPATH', 'GOROOT', 'GOPROXY',
    'PYTHONPATH', 'PYTHONHOME', 'VIRTUAL_ENV', 'CONDA_PREFIX',
    'RUBY_HOME', 'GEM_HOME', 'GEM_PATH', 'RBENV_ROOT',
    'CARGO_HOME', 'RUSTUP_HOME',
    'SSH_AUTH_SOCK', 'SSH_AGENT_PID', 'GPG_AGENT_INFO',
    'DBUS_SESSION_BUS_ADDRESS', 'XDG_SESSION_ID', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME',
    'MAIL', 'MANPATH', 'INFOPATH',
    '__CF_USER_TEXT_ENCODING', 'Apple_PubSub_Socket_Render', 'COMMAND_MODE',
    'GOOGLE_CLOUD_PROJECT', // This is set automatically by GCP, not user config
  ]);

  // Also exclude variables that match certain patterns
  const systemVarPatterns = [
    /^LC_/, /^XDG_/, /^GTK_/, /^QT_/, /^GNOME_/, /^KDE_/,
    /^__/, /^npm_/, /^COMP_/, /^BASH_/, /^ZSH_/,
    /^LESS/, /^MORE/, /^PAGER_/,
  ];

  const isSystemVar = (key) => {
    if (systemVarsToExclude.has(key)) return true;
    return systemVarPatterns.some(pattern => pattern.test(key));
  };

  // Filter out system vars
  variables = variables.filter(v => !isSystemVar(v.key));

  // Deduplicate by key
  const seen = new Set();
  variables = variables.filter(v => {
    if (!v.key || seen.has(v.key)) return false;
    seen.add(v.key);
    return true;
  });

  console.log(`✅ Found ${variables.length} env variables for ${workstationId} (scanned ${codeSnippets.length} files)`);

  // Update progress to 90% before completing
  envAnalysisCache.set(workstationId, { status: 'analyzing', progress: 90, phase: 'Finalizzazione...', timestamp: Date.now() });

  envAnalysisCache.set(workstationId, {
    status: 'complete',
    progress: 100,
    variables,
    filesScanned: codeSnippets.length,
    projectType: searchPatterns?.projectType || 'unknown',
    timestamp: Date.now()
  });
}

// GET /workstation/:id/env-variables - Legge le variabili d'ambiente dal .env del progetto
app.get('/workstation/:id/env-variables', async (req, res) => {
  const { id } = req.params;

  try {
    const fs = require('fs');
    const path = require('path');

    // Get workstation repository path - handle both ws-xxx format and direct ID
    let repoName = id.replace(/\//g, '_').replace(/:/g, '_');
    // Remove ws- prefix if present and try to find the repo
    const cleanId = repoName.startsWith('ws-') ? repoName.slice(3) : repoName;

    let repoPath = path.join(__dirname, 'cloned_repos', repoName);

    // Try with original ID first
    if (!fs.existsSync(repoPath)) {
      // Try with clean ID (without ws- prefix)
      repoPath = path.join(__dirname, 'cloned_repos', cleanId);
    }

    // Try case-insensitive match in cloned_repos folder
    if (!fs.existsSync(repoPath)) {
      const clonedReposPath = path.join(__dirname, 'cloned_repos');
      if (fs.existsSync(clonedReposPath)) {
        const dirs = fs.readdirSync(clonedReposPath);
        const match = dirs.find(d => d.toLowerCase() === cleanId.toLowerCase());
        if (match) {
          repoPath = path.join(clonedReposPath, match);
        }
      }
    }

    console.log(`🔑 [env-variables] id=${id}, repoPath=${repoPath}, exists=${fs.existsSync(repoPath)}`);

    const envPath = path.join(repoPath, '.env');
    const envExamplePath = path.join(repoPath, '.env.example');

    let variables = [];
    let hasEnvExample = fs.existsSync(envExamplePath);

    // Helper per identificare valori placeholder (non configurati)
    const isPlaceholderValue = (value) => {
      if (!value || value.trim() === '') return true;
      const lowerValue = value.toLowerCase();
      // Pattern comuni per placeholder
      return (
        lowerValue.startsWith('your_') ||
        lowerValue.startsWith('your-') ||
        lowerValue.includes('your_') ||
        lowerValue.includes('_here') ||
        lowerValue === 'xxx' ||
        lowerValue === 'yyy' ||
        lowerValue === 'zzz' ||
        /^(sk_test_|pk_test_|whsec_)\.{2,}$/.test(value) || // Stripe placeholders come sk_test_...
        /^[a-z_]+\.\.\.$/.test(value) || // Valori che finiscono con ...
        lowerValue.match(/^(todo|fixme|changeme|replace|insert|add)$/i)
      );
    };

    // Se esiste .env, leggilo
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const allVars = parseEnvFile(envContent);
      // Filtra solo le variabili che hanno valori REALI (non placeholder)
      variables = allVars.filter(v => !isPlaceholderValue(v.value));
    }
    // Altrimenti, se esiste .env.example, NON mostrare come "dal progetto"
    // perché .env.example contiene solo placeholder
    else if (hasEnvExample) {
      // Non caricare variabili da .env.example come "dal progetto"
      // saranno mostrate solo come suggerimenti AI
      variables = [];
    }

    // Check if AI analysis found additional variables
    const aiAnalysis = envAnalysisCache.get(id);
    let aiVariables = [];
    let aiStatus = 'not_started';
    if (aiAnalysis) {
      aiStatus = aiAnalysis.status;
      if (aiAnalysis.status === 'complete' && aiAnalysis.variables) {
        // Merge AI variables with existing (AI vars that don't exist in .env)
        const existingKeys = new Set(variables.map(v => v.key));
        aiVariables = aiAnalysis.variables.filter(v => !existingKeys.has(v.key));
      }
    }

    res.json({
      variables,
      aiVariables,
      aiStatus,
      hasEnvExample
    });
  } catch (error) {
    console.error('Failed to read env variables:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /workstation/:id/env-variables - Salva le variabili d'ambiente nel .env
app.post('/workstation/:id/env-variables', async (req, res) => {
  const { id } = req.params;
  const { variables } = req.body;

  try {
    const fs = require('fs');
    const path = require('path');

    // Get workstation repository path
    const repoName = id.replace(/\//g, '_').replace(/:/g, '_');
    const repoPath = path.join(__dirname, 'cloned_repos', repoName);

    const envPath = path.join(repoPath, '.env');

    // Converti l'array di variabili in formato .env
    let envContent = '# Environment Variables\n';
    envContent += `# Last updated: ${new Date().toISOString()}\n\n`;

    variables.forEach(variable => {
      if (variable.description) {
        envContent += `# ${variable.description}\n`;
      }
      envContent += `${variable.key}=${variable.value}\n\n`;
    });

    // Scrivi il file .env
    fs.writeFileSync(envPath, envContent, 'utf8');

    console.log(`✅ Saved ${variables.length} environment variables to ${envPath}`);

    res.json({
      success: true,
      message: `Saved ${variables.length} variables`,
      path: envPath
    });
  } catch (error) {
    console.error('Failed to save env variables:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to parse .env file
function parseEnvFile(content) {
  const variables = [];
  const lines = content.split('\n');
  let currentDescription = null;

  lines.forEach(line => {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      currentDescription = null;
      return;
    }

    // Check if it's a comment (description)
    if (trimmed.startsWith('#')) {
      const comment = trimmed.substring(1).trim();
      // Skip common header comments
      if (!comment.toLowerCase().includes('environment') &&
        !comment.toLowerCase().includes('last updated') &&
        !comment.toLowerCase().includes('auto-generated')) {
        currentDescription = comment;
      }
      return;
    }

    // Parse variable (KEY=VALUE)
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex > 0) {
      const key = trimmed.substring(0, equalIndex).trim();
      const value = trimmed.substring(equalIndex + 1).trim();

      // Determina se è un secret (contiene parole chiave sensibili)
      const isSecret = /key|secret|password|token|credential|private/i.test(key);

      variables.push({
        key,
        value,
        isSecret,
        description: currentDescription || undefined
      });

      currentDescription = null;
    }
  });

  return variables;
}

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

// Helper function to check if a GitHub repository is private
async function checkIfRepoIsPrivate(repositoryUrl, githubToken = null) {
  try {
    // Extract owner and repo from URL
    // Supports: https://github.com/owner/repo.git or https://github.com/owner/repo
    const match = repositoryUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/);
    if (!match) {
      console.log('⚠️ Could not parse GitHub URL, assuming public');
      return { isPrivate: false, requiresAuth: false };
    }

    const [, owner, repo] = match;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;

    console.log(`🔍 Checking repo visibility: ${owner}/${repo}`);

    // Try to access the repo API
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Drape-IDE'
    };

    // If we have a token, use it
    if (githubToken) {
      headers['Authorization'] = `token ${githubToken}`;
    }

    const response = await axios.get(apiUrl, { headers, timeout: 5000 });

    const isPrivate = response.data.private === true;
    console.log(`   Repo "${owner}/${repo}" is ${isPrivate ? 'PRIVATE' : 'PUBLIC'}`);

    return {
      isPrivate,
      requiresAuth: isPrivate && !githubToken,
      repoInfo: {
        name: response.data.name,
        fullName: response.data.full_name,
        private: isPrivate,
        defaultBranch: response.data.default_branch
      }
    };
  } catch (error) {
    // If 404, repo might be private and we don't have access
    if (error.response?.status === 404) {
      console.log('   Repo returned 404 - likely private or does not exist');
      return {
        isPrivate: true,
        requiresAuth: !githubToken,
        error: 'Repository not found or is private'
      };
    }
    // If 401, token is invalid
    if (error.response?.status === 401) {
      console.log('   Invalid or expired token');
      return {
        isPrivate: true,
        requiresAuth: true,
        error: 'Invalid or expired token'
      };
    }
    console.log('   Error checking repo:', error.message);
    // On other errors, assume public and try to clone
    return { isPrivate: false, requiresAuth: false };
  }
}

// Helper function to clone and read repository files
async function cloneAndReadRepository(repositoryUrl, projectId, githubToken = null) {
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

  // If no repositoryUrl provided, just read from existing local repo
  if (!repositoryUrl) {
    console.log('📂 No repositoryUrl provided, reading from existing local repo');
    // Skip to reading files at the end
  }

  // CHECK IF REPO IS PRIVATE - Require authentication for private repos
  if (repositoryUrl) {
    const repoCheck = await checkIfRepoIsPrivate(repositoryUrl, githubToken);

    if (repoCheck.requiresAuth) {
      const error = new Error('Questa repository è privata. È necessario autenticarsi con GitHub.');
      error.requiresAuth = true;
      error.isPrivate = true;
      throw error;
    }
  }

  // Build clone URL with token if provided (for private repos)
  let cloneUrl = repositoryUrl;
  if (repositoryUrl && githubToken) {
    // Convert https://github.com/user/repo.git to https://token@github.com/user/repo.git
    cloneUrl = repositoryUrl.replace('https://github.com/', `https://${githubToken}@github.com/`);
    console.log('🔑 Using authenticated clone URL');
  }

  // Check if repository is already cloned AND has files
  let needsClone = false;
  try {
    await fs.access(repoPath);
    // Folder exists, check if it has files (not just .git)
    const entries = await fs.readdir(repoPath);
    const hasFiles = entries.some(e => e !== '.git');
    if (hasFiles) {
      console.log('✅ Repository already cloned at:', repoPath);
      // If we have a token, do a git pull to ensure latest
      if (githubToken) {
        try {
          console.log('🔄 Pulling latest changes...');
          await execAsync(`cd "${repoPath}" && git pull`);
        } catch (pullError) {
          console.log('⚠️ Pull failed, but repo exists:', pullError.message);
        }
      }
    } else {
      console.log('📂 Folder exists but is empty, re-cloning...');
      // Remove empty folder
      await fs.rm(repoPath, { recursive: true, force: true });
      needsClone = true;
    }
  } catch {
    needsClone = true;
  }

  if (needsClone) {
    // Can only clone if we have a URL
    if (!repositoryUrl) {
      throw new Error('Repository not cloned and no URL provided');
    }
    // Repository not cloned yet, clone it now
    console.log('📦 Cloning repository:', repositoryUrl);
    console.log('📦 Has token:', !!githubToken);
    try {
      await execAsync(`git clone ${cloneUrl} "${repoPath}"`);
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

  // Get GitHub token from Authorization header
  const authHeader = req.headers.authorization;
  const githubToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  // Remove ws- prefix if present
  if (projectId.startsWith('ws-')) {
    projectId = projectId.substring(3);
  }

  try {
    console.log('📂 Getting files for project:', projectId);
    console.log('🔗 Repository URL:', repositoryUrl);
    console.log('🔑 Has GitHub token:', !!githubToken);

    // If repositoryUrl is provided, clone and read from local filesystem
    if (repositoryUrl) {
      const files = await cloneAndReadRepository(repositoryUrl, projectId, githubToken);
      console.log(`✅ Found ${files.length} files in cloned repository`);
      res.json({ success: true, files });
      return;
    }

    // Check if repo is already cloned locally (even without repositoryUrl)
    const reposDir = path.join(__dirname, 'cloned_repos');
    const repoPath = path.join(reposDir, projectId);
    try {
      await fs.access(repoPath);
      // Repo exists locally, read files from it
      console.log('📂 Found existing cloned repo at:', repoPath);
      const files = await cloneAndReadRepository(null, projectId, null);
      console.log(`✅ Found ${files.length} files in existing cloned repository`);
      res.json({ success: true, files });
      return;
    } catch {
      // Repo not cloned locally - return empty array instead of checking Firestore
      // (Firestore requires Google Cloud credentials which may not be configured)
      console.log('📂 No local repo found and no repositoryUrl provided');
      console.log('ℹ️ Returning empty file list (project needs to be cloned first)');
      res.json({ success: true, files: [], needsClone: true });
      return;
    }
  } catch (error) {
    console.error('❌ Error getting files:', error.message);

    // If repository is private and requires authentication
    if (error.requiresAuth || error.isPrivate) {
      console.log('🔒 Repository is private - authentication required');
      res.status(401).json({
        success: false,
        error: error.message || 'Repository privata. È necessario autenticarsi con GitHub.',
        requiresAuth: true,
        isPrivate: true
      });
    }
    // If repository clone failed (private or not found), return error
    else if (error.message.includes('Failed to clone repository')) {
      console.log('⚠️ Clone failed - repository private or not found');
      res.status(401).json({
        success: false,
        error: 'Repository is private or not found. Authentication required.',
        requiresAuth: true
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

// ==================== GIT OPERATIONS ====================

const { execSync, exec } = require('child_process');

/**
 * Get git status, commits, and branches for a project
 */
app.get('/git/status/:projectId', async (req, res) => {
  let { projectId } = req.params;

  // Remove ws- prefix if present
  if (projectId.startsWith('ws-')) {
    projectId = projectId.substring(3);
  }

  const reposDir = path.join(__dirname, 'cloned_repos');
  const repoPath = path.join(reposDir, projectId);

  try {
    // Check if repo exists
    await fs.access(repoPath);

    // Check if it's a git repo
    const gitDir = path.join(repoPath, '.git');
    try {
      await fs.access(gitDir);
    } catch {
      return res.json({ isGitRepo: false });
    }

    // Get current branch
    let currentBranch = 'main';
    try {
      currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();
    } catch (e) {
      console.log('Could not get current branch:', e.message);
    }

    // Get commits (last 50)
    let commits = [];
    try {
      const logOutput = execSync(
        'git log --pretty=format:"%H|%h|%s|%an|%ae|%ai" -50',
        { cwd: repoPath, encoding: 'utf-8' }
      );
      if (logOutput.trim()) {
        commits = logOutput.trim().split('\n').map((line, index) => {
          const [hash, shortHash, message, author, authorEmail, date] = line.split('|');
          return {
            hash,
            shortHash,
            message,
            author,
            authorEmail,
            date: new Date(date),
            isHead: index === 0,
            branch: index === 0 ? currentBranch : undefined
          };
        });
      }
    } catch (e) {
      console.log('Could not get commits:', e.message);
    }

    // Get branches
    let branches = [];
    try {
      const branchOutput = execSync('git branch -a', { cwd: repoPath, encoding: 'utf-8' });
      const branchLines = branchOutput.trim().split('\n');
      branches = branchLines.map(line => {
        const isCurrent = line.startsWith('*');
        const name = line.replace(/^\*?\s*/, '').trim();
        const isRemote = name.startsWith('remotes/');
        return {
          name: isRemote ? name.replace('remotes/', '') : name,
          isCurrent,
          isRemote
        };
      }).filter(b => !b.name.includes('HEAD'));

      // Get ahead/behind for current branch
      try {
        const trackingOutput = execSync(`git rev-list --left-right --count origin/${currentBranch}...HEAD`, { cwd: repoPath, encoding: 'utf-8' });
        const [behind, ahead] = trackingOutput.trim().split('\t').map(Number);
        const currentBranchObj = branches.find(b => b.isCurrent);
        if (currentBranchObj) {
          currentBranchObj.ahead = ahead;
          currentBranchObj.behind = behind;
        }
      } catch (e) {
        // No tracking branch or other error
      }
    } catch (e) {
      console.log('Could not get branches:', e.message);
    }

    // Get status (staged, modified, untracked)
    let status = { staged: [], modified: [], untracked: [], deleted: [] };
    try {
      const statusOutput = execSync('git status --porcelain', { cwd: repoPath, encoding: 'utf-8' });
      if (statusOutput.trim()) {
        statusOutput.trim().split('\n').forEach(line => {
          const code = line.substring(0, 2);
          const file = line.substring(3);

          if (code[0] === 'A' || code[0] === 'M' || code[0] === 'D') {
            status.staged.push(file);
          }
          if (code[1] === 'M') {
            status.modified.push(file);
          }
          if (code === '??') {
            status.untracked.push(file);
          }
          if (code[1] === 'D') {
            status.deleted.push(file);
          }
        });
      }
    } catch (e) {
      console.log('Could not get status:', e.message);
    }

    res.json({
      isGitRepo: true,
      currentBranch,
      commits,
      branches,
      status
    });

  } catch (error) {
    console.error('❌ Git status error:', error.message);
    res.json({ isGitRepo: false, error: error.message });
  }
});

/**
 * Git fetch
 */
app.post('/git/fetch/:projectId', async (req, res) => {
  let { projectId } = req.params;
  const authHeader = req.headers.authorization;
  const githubToken = authHeader?.replace('Bearer ', '');

  if (projectId.startsWith('ws-')) {
    projectId = projectId.substring(3);
  }

  const repoPath = path.join(__dirname, 'cloned_repos', projectId);

  try {
    await fs.access(repoPath);

    // Configure git with token if provided
    if (githubToken) {
      const remoteUrl = execSync('git config --get remote.origin.url', { cwd: repoPath, encoding: 'utf-8' }).trim();
      if (remoteUrl.includes('github.com')) {
        const newUrl = remoteUrl.replace('https://github.com/', `https://${githubToken}@github.com/`);
        execSync(`git remote set-url origin "${newUrl}"`, { cwd: repoPath });
      }
    }

    // Fetch
    execSync('git fetch --all', { cwd: repoPath, encoding: 'utf-8' });

    // Reset remote URL to remove token
    if (githubToken) {
      const remoteUrl = execSync('git config --get remote.origin.url', { cwd: repoPath, encoding: 'utf-8' }).trim();
      const cleanUrl = remoteUrl.replace(/https:\/\/[^@]+@github\.com\//, 'https://github.com/');
      execSync(`git remote set-url origin "${cleanUrl}"`, { cwd: repoPath });
    }

    res.json({ success: true, message: 'Fetch completed' });
  } catch (error) {
    console.error('❌ Git fetch error:', error.message);
    res.json({ success: false, message: error.message });
  }
});

/**
 * Git pull
 */
app.post('/git/pull/:projectId', async (req, res) => {
  let { projectId } = req.params;
  const authHeader = req.headers.authorization;
  const githubToken = authHeader?.replace('Bearer ', '');

  if (projectId.startsWith('ws-')) {
    projectId = projectId.substring(3);
  }

  const repoPath = path.join(__dirname, 'cloned_repos', projectId);

  try {
    await fs.access(repoPath);

    // Configure git with token if provided
    if (githubToken) {
      const remoteUrl = execSync('git config --get remote.origin.url', { cwd: repoPath, encoding: 'utf-8' }).trim();
      if (remoteUrl.includes('github.com')) {
        const newUrl = remoteUrl.replace('https://github.com/', `https://${githubToken}@github.com/`);
        execSync(`git remote set-url origin "${newUrl}"`, { cwd: repoPath });
      }
    }

    // Pull
    const output = execSync('git pull', { cwd: repoPath, encoding: 'utf-8' });

    // Reset remote URL to remove token
    if (githubToken) {
      const remoteUrl = execSync('git config --get remote.origin.url', { cwd: repoPath, encoding: 'utf-8' }).trim();
      const cleanUrl = remoteUrl.replace(/https:\/\/[^@]+@github\.com\//, 'https://github.com/');
      execSync(`git remote set-url origin "${cleanUrl}"`, { cwd: repoPath });
    }

    res.json({ success: true, message: 'Pull completed', output });
  } catch (error) {
    console.error('❌ Git pull error:', error.message);
    res.json({ success: false, message: error.message });
  }
});

/**
 * Git push
 */
app.post('/git/push/:projectId', async (req, res) => {
  let { projectId } = req.params;
  const authHeader = req.headers.authorization;
  const githubToken = authHeader?.replace('Bearer ', '');

  if (projectId.startsWith('ws-')) {
    projectId = projectId.substring(3);
  }

  const repoPath = path.join(__dirname, 'cloned_repos', projectId);

  try {
    await fs.access(repoPath);

    if (!githubToken) {
      return res.json({ success: false, message: 'GitHub token required for push' });
    }

    // Configure git with token
    const remoteUrl = execSync('git config --get remote.origin.url', { cwd: repoPath, encoding: 'utf-8' }).trim();
    if (remoteUrl.includes('github.com')) {
      const newUrl = remoteUrl.replace('https://github.com/', `https://${githubToken}@github.com/`);
      execSync(`git remote set-url origin "${newUrl}"`, { cwd: repoPath });
    }

    // Push
    const output = execSync('git push', { cwd: repoPath, encoding: 'utf-8' });

    // Reset remote URL to remove token
    const currentUrl = execSync('git config --get remote.origin.url', { cwd: repoPath, encoding: 'utf-8' }).trim();
    const cleanUrl = currentUrl.replace(/https:\/\/[^@]+@github\.com\//, 'https://github.com/');
    execSync(`git remote set-url origin "${cleanUrl}"`, { cwd: repoPath });

    res.json({ success: true, message: 'Push completed', output });
  } catch (error) {
    console.error('❌ Git push error:', error.message);
    res.json({ success: false, message: error.message });
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

// ============================================
// AI-POWERED PREVIEW SYSTEM
// ============================================

// Cache for AI-detected project commands (avoids re-calling AI)
const projectCommandsCache = new Map();

/**
 * Get directory tree structure (for AI analysis)
 */
async function getProjectTree(repoPath, maxDepth = 3) {
  const tree = [];

  async function walkDir(dir, depth = 0, prefix = '') {
    if (depth > maxDepth) return;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const filtered = entries.filter(e =>
        !['node_modules', '.git', 'dist', 'build', '.next', '.expo', '__pycache__', 'venv', '.venv', 'coverage', '.cache'].includes(e.name)
      );

      for (const entry of filtered) {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          tree.push({ type: 'dir', path: relativePath });
          await walkDir(path.join(dir, entry.name), depth + 1, relativePath);
        } else {
          tree.push({ type: 'file', path: relativePath });
        }
      }
    } catch (err) {
      console.error(`Error reading ${dir}:`, err.message);
    }
  }

  await walkDir(repoPath);
  return tree;
}

/**
 * Read specific files from project
 */
async function readProjectFiles(repoPath, filePaths) {
  const contents = {};

  for (const filePath of filePaths) {
    try {
      const fullPath = path.join(repoPath, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      // Limit file size to avoid token overflow
      contents[filePath] = content.length > 10000
        ? content.substring(0, 10000) + '\n... (truncated)'
        : content;
    } catch (err) {
      contents[filePath] = `[Error reading file: ${err.message}]`;
    }
  }

  return contents;
}

/**
 * Call Groq AI API
 */
async function callGroqAI(messages, options = {}) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const maxRetries = options.maxRetries || 3;
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: options.model || 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages,
          temperature: options.temperature || 0.3,
          max_tokens: options.maxTokens || 1000,
          response_format: options.json ? { type: 'json_object' } : undefined
        },
        {
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      lastError = error;

      // Check for rate limit (429) error
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'];
        const waitTime = retryAfter ? Math.min(parseInt(retryAfter) * 1000, 30000) : Math.pow(2, attempt + 1) * 1000;

        console.log(`⏳ Rate limit hit (attempt ${attempt + 1}/${maxRetries}), waiting ${waitTime/1000}s...`);

        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }

      // For other errors, don't retry
      if (error.response?.status !== 429) {
        throw error;
      }
    }
  }

  // If we exhausted retries, throw with helpful message
  throw new Error(`Groq API rate limit exceeded after ${maxRetries} attempts. Please wait a moment and try again.`);
}

/**
 * Detect the package manager used by the project
 * @param {string} repoPath - Path to the repository
 * @returns {string} - 'pnpm', 'yarn', or 'npm'
 */
function detectPackageManager(repoPath) {
  const fs = require('fs');

  // Check for lock files in order of priority
  if (fs.existsSync(path.join(repoPath, 'pnpm-lock.yaml')) ||
      fs.existsSync(path.join(repoPath, 'pnpm-workspace.yaml'))) {
    console.log('📦 Detected package manager: pnpm');
    return 'pnpm';
  }

  if (fs.existsSync(path.join(repoPath, 'yarn.lock'))) {
    console.log('📦 Detected package manager: yarn');
    return 'yarn';
  }

  if (fs.existsSync(path.join(repoPath, 'bun.lockb'))) {
    console.log('📦 Detected package manager: bun');
    return 'bun';
  }

  // Default to npm
  console.log('📦 Detected package manager: npm (default)');
  return 'npm';
}

/**
 * Get the install command for the detected package manager
 * @param {string} packageManager - 'pnpm', 'yarn', 'bun', or 'npm'
 * @returns {string} - Install command
 */
function getInstallCommand(packageManager) {
  switch (packageManager) {
    case 'pnpm':
      return 'pnpm install';
    case 'yarn':
      return 'yarn install';
    case 'bun':
      return 'bun install';
    default:
      return 'npm install --legacy-peer-deps';
  }
}

/**
 * Get the run command prefix for the detected package manager
 * @param {string} packageManager - 'pnpm', 'yarn', 'bun', or 'npm'
 * @returns {string} - Run command prefix (e.g., 'npm run', 'pnpm run')
 */
function getRunCommand(packageManager) {
  switch (packageManager) {
    case 'pnpm':
      return 'pnpm run';
    case 'yarn':
      return 'yarn';
    case 'bun':
      return 'bun run';
    default:
      return 'npm run';
  }
}

/**
 * AI-powered project analysis - Step 1: Get file list to read
 */
async function aiSelectFilesToRead(tree) {
  const treeText = tree.map(e => `${e.type === 'dir' ? '📁' : '📄'} ${e.path}`).join('\n');

  const messages = [
    {
      role: 'system',
      content: `You are a project analyzer. Given a file tree, identify which files to read to understand how to run the project.

Return ONLY a JSON object with this exact format:
{"files": ["file1.json", "README.md", "etc..."]}

Focus on:
- Package managers: package.json, requirements.txt, Cargo.toml, go.mod, pom.xml, build.gradle, Gemfile, etc.
- README files
- Config files: vite.config.*, next.config.*, angular.json, etc.
- Docker files if present
- Main entry points if obvious

Select maximum 5-7 most important files. DO NOT select source code files (*.js, *.ts, *.py in src/ folders).`
    },
    {
      role: 'user',
      content: `Project structure:\n${treeText}`
    }
  ];

  const response = await callGroqAI(messages, { json: true, temperature: 0.1 });
  const parsed = JSON.parse(response);
  return parsed.files || [];
}

/**
 * AI-powered project analysis - Step 2: Determine commands
 */
async function aiDetermineCommands(tree, fileContents) {
  const treeText = tree.slice(0, 50).map(e => `${e.type === 'dir' ? '📁' : '📄'} ${e.path}`).join('\n');

  const filesText = Object.entries(fileContents)
    .map(([path, content]) => `=== ${path} ===\n${content}`)
    .join('\n\n');

  const messages = [
    {
      role: 'system',
      content: `You are a DevOps expert. Analyze the project and determine how to run it.

Return ONLY a JSON object with this exact format:
{
  "projectType": "string describing the project type",
  "installCommand": "command to install dependencies (or null if not needed)",
  "startCommand": "command to start the dev server",
  "port": 3000,
  "needsInstall": true,
  "notes": "any important notes",
  "hasBackend": false,
  "backendCommand": null,
  "backendPort": null
}

Rules:
- ALWAYS use npm (not yarn, not pnpm) for Node.js projects: "npm install" and "npm run <script>" or "npm start"
- For Node.js: check "scripts" in package.json for "dev", "start", "serve" commands
- For Python: look for requirements.txt, setup.py, pyproject.toml
- For Expo/React Native: use "npx expo start --web --port 8081"
- Default ports: React 3000, Vite 5173, Next.js 3000, Expo 8081, Django 8000, Flask 5000
- If you see a Makefile or Dockerfile, consider those
- Be specific with commands, include flags if needed
- IMPORTANT: Never use yarn or pnpm, always use npm

MULTI-SERVER DETECTION:
- If package.json has a "backend", "server", "api", or "json-server" script, set hasBackend=true
- Common patterns: "npm run backend", "npm run server", "npm run api", "json-server"
- Look for db.json (json-server), server.js in root, or separate /server /backend folders
- If hasBackend=true, set backendCommand to the command to start it and backendPort to its port
- json-server typically runs on port 5000 or 3001`
    },
    {
      role: 'user',
      content: `Project structure (partial):\n${treeText}\n\nFile contents:\n${filesText}`
    }
  ];

  const response = await callGroqAI(messages, { json: true, temperature: 0.1, maxTokens: 500 });
  return JSON.parse(response);
}

/**
 * Main endpoint: AI-powered preview start
 */
app.post('/preview/start', async (req, res) => {
  const startTime = Date.now();

  try {
    const { workstationId, forceRefresh, githubToken, repositoryUrl } = req.body;

    if (!workstationId) {
      return res.status(400).json({ success: false, error: 'workstationId is required' });
    }

    console.log(`\n🚀 Starting AI-powered preview for: ${workstationId}`);
    console.log(`   GitHub token provided: ${githubToken ? 'yes' : 'no'}`);

    // Resolve repo path
    let repoPath = path.join(__dirname, 'cloned_repos', workstationId);

    if (workstationId.startsWith('ws-')) {
      const projectIdLower = workstationId.substring(3);
      const clonedReposDir = path.join(__dirname, 'cloned_repos');

      try {
        const folders = await fs.readdir(clonedReposDir);
        const matchingFolder = folders.find(f => f.toLowerCase() === projectIdLower);
        if (matchingFolder) {
          repoPath = path.join(clonedReposDir, matchingFolder);
        }
      } catch (err) {
        console.error('Error reading cloned_repos:', err);
      }
    }

    // Check repo exists
    try {
      await fs.access(repoPath);
    } catch {
      // If repo doesn't exist but we have a URL, try to clone it
      if (repositoryUrl) {
        console.log(`📦 Repository not found, cloning from ${repositoryUrl}...`);
        console.log(`   Using GitHub token: ${githubToken ? 'yes' : 'no'}`);
        try {
          await cloneAndReadRepository(repositoryUrl, workstationId, githubToken);
          // Re-check access after clone
          await fs.access(repoPath);
        } catch (cloneError) {
          console.error('❌ Clone failed:', cloneError);
          return res.status(500).json({ success: false, error: `Failed to clone repository: ${cloneError.message}` });
        }
      } else {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }
    }

    console.log(`📁 Repository path: ${repoPath}`);

    // Check cache first (unless force refresh)
    const cacheKey = repoPath;
    let commands = null;

    if (!forceRefresh && projectCommandsCache.has(cacheKey)) {
      commands = projectCommandsCache.get(cacheKey);
      console.log('📦 Using cached commands');
    } else {
      // Step 1: Get project tree
      console.log('🌳 Reading project structure...');
      const tree = await getProjectTree(repoPath);
      console.log(`   Found ${tree.length} entries`);

      // Step 2: AI selects files to read
      console.log('🤖 AI selecting files to analyze...');
      const filesToRead = await aiSelectFilesToRead(tree);
      console.log(`   Selected: ${filesToRead.join(', ')}`);

      // Step 3: Read selected files
      console.log('📖 Reading selected files...');
      const fileContents = await readProjectFiles(repoPath, filesToRead);

      // Step 4: AI determines commands
      console.log('🧠 AI analyzing project...');
      commands = await aiDetermineCommands(tree, fileContents);
      console.log(`   Project type: ${commands.projectType}`);
      console.log(`   Install: ${commands.installCommand}`);
      console.log(`   Start: ${commands.startCommand}`);
      console.log(`   Port: ${commands.port}`);

      // Cache the result
      projectCommandsCache.set(cacheKey, commands);
    }

    // Step 5: Run install if needed - use detected package manager
    const packageManager = detectPackageManager(repoPath);

    if (commands.needsInstall) {
      // Use the detected package manager instead of what AI suggested
      const installCommand = getInstallCommand(packageManager);
      console.log(`📦 Running install: ${installCommand}`);

      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);

        await execAsync(installCommand, {
          cwd: repoPath,
          timeout: 180000, // 3 minute timeout for install (pnpm can be slower first time)
          maxBuffer: 10 * 1024 * 1024
        });
        console.log('✅ Install completed');
      } catch (installError) {
        console.error('⚠️ Install warning:', installError.message);
        // Continue anyway - install might have partially succeeded
      }
    }

    // Step 5.5: For Expo/React Native projects, install web dependencies
    const isExpoForWebInstall = commands.startCommand?.includes('expo') ||
                                commands.projectType?.toLowerCase().includes('expo') ||
                                commands.projectType?.toLowerCase().includes('react native');

    if (isExpoForWebInstall) {
      console.log('📱 Expo project detected, installing web dependencies...');
      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);

        // Install react-dom and react-native-web for Expo web support
        // Note: npx expo install requires -- before npm flags
        await execAsync('npx expo install react-dom react-native-web @expo/metro-runtime -- --legacy-peer-deps', {
          cwd: repoPath,
          timeout: 120000,
          maxBuffer: 10 * 1024 * 1024
        });
        console.log('✅ Web dependencies installed');
      } catch (webInstallError) {
        console.error('⚠️ Web dependencies install warning:', webInstallError.message);
        // Continue anyway - might already be installed
      }
    }

    // Step 6: Find available port
    let port = commands.port || 3000;
    port = await findAvailablePort(port);
    console.log(`🔌 Using port: ${port}`);

    // Step 7: Prepare and execute start command
    let startCommand = commands.startCommand;

    // Fallback if AI didn't return a start command
    if (!startCommand) {
      // For static websites/libraries, use our static file server
      const projectTypeLower = commands.projectType?.toLowerCase() || '';
      const isStaticSite = projectTypeLower.includes('static') ||
                           projectTypeLower === 'html' ||
                           projectTypeLower.includes('html/css') ||
                           projectTypeLower.includes('css library') ||
                           projectTypeLower.includes('css framework') ||
                           projectTypeLower.includes('documentation') ||
                           projectTypeLower.includes('landing page');

      if (isStaticSite) {
        console.log(`📁 Static site/library detected (${commands.projectType}), using static-server.js`);
        startCommand = `node ${path.join(__dirname, 'static-server.js')} ${port} .`;
      } else {
        console.log(`⚠️ No start command from AI, using default ${packageManager} start`);
        startCommand = packageManager === 'yarn' ? 'yarn start' : `${packageManager} run start`;
      }
    }

    // Convert npm commands to the detected package manager
    if (packageManager !== 'npm') {
      // Replace npm run with the correct package manager
      startCommand = startCommand.replace(/^npm run /, `${getRunCommand(packageManager)} `);
      startCommand = startCommand.replace(/^npm start/, packageManager === 'yarn' ? 'yarn start' : `${packageManager} run start`);
      console.log(`📦 Converted start command for ${packageManager}: ${startCommand}`);
    }

    // Convert global CLI commands to npx (handles gulp, grunt, webpack, etc.)
    // These tools are often not installed globally but are in devDependencies
    const globalCliTools = ['gulp', 'grunt', 'webpack', 'rollup', 'parcel', 'esbuild', 'tsc', 'eslint', 'prettier', 'jest', 'mocha', 'karma', 'bower', 'browserify'];
    for (const tool of globalCliTools) {
      // Match the tool at the start of the command (e.g., "gulp build" -> "npx gulp build")
      const toolRegex = new RegExp(`^${tool}(\\s|$)`);
      if (toolRegex.test(startCommand)) {
        startCommand = `npx ${startCommand}`;
        console.log(`🔧 Converted global CLI command to npx: ${startCommand}`);
        break;
      }
    }

    // Update port in command if different
    if (port !== commands.port) {
      // Replace port in various formats
      startCommand = startCommand.replace(/--port[=\s]\d+/, `--port ${port}`);
      startCommand = startCommand.replace(/PORT=\d+/, `PORT=${port}`);
      startCommand = startCommand.replace(/:(\d{4,5})\b/, `:${port}`);

      // If no port found in command, prepend PORT env var
      if (!startCommand.includes(port.toString())) {
        startCommand = `PORT=${port} ${startCommand}`;
      }
    }

    // Add HOST=0.0.0.0 for network access - framework-specific handling
    const isExpoProject = startCommand.includes('expo') ||
                          commands.projectType?.toLowerCase().includes('expo') ||
                          commands.projectType?.toLowerCase().includes('react native');

    let metroPort = null; // For Expo projects, this will be the actual port used

    if (!startCommand.includes('HOST=') && !startCommand.includes('--host')) {
      if (isExpoProject) {
        // Expo: use --web for web preview, --port for custom port, CI=1 for non-interactive mode
        // Find an available port for Metro bundler (starting from 8082 to avoid 8081)
        metroPort = await findAvailablePort(8082);
        // For npm start that wraps expo, we need to call expo directly with --web flag
        if (startCommand === 'npm start' || startCommand === 'npm run start') {
          startCommand = `CI=1 npx expo start --web --port ${metroPort}`;
        } else {
          startCommand = `CI=1 ${startCommand} --web --port ${metroPort}`;
        }
        console.log(`🔌 Using Metro port: ${metroPort} (web mode)`);
      } else if (startCommand.includes('ng serve') || commands.projectType === 'Angular') {
        // Angular CLI requires --host flag
        startCommand = `${startCommand} --host 0.0.0.0`;
      } else if (startCommand.includes('vue-cli-service serve') || commands.projectType === 'Vue') {
        // Vue CLI also uses --host flag
        startCommand = `${startCommand} --host 0.0.0.0`;
      } else if (startCommand.includes('vite') || commands.projectType === 'Vite' || commands.projectType?.toLowerCase().includes('vite')) {
        // Vite uses --host flag
        startCommand = `${startCommand} --host`;
      } else if (startCommand.includes('run dev') || startCommand.includes('run start') ||
                 startCommand.includes('yarn dev') || startCommand.includes('yarn start')) {
        // Check if it's a Vite project by looking for vite.config
        const fs = require('fs');
        const viteConfigExists = fs.existsSync(`${repoPath}/vite.config.js`) ||
                                  fs.existsSync(`${repoPath}/vite.config.ts`) ||
                                  fs.existsSync(`${repoPath}/vite.config.mjs`);
        if (viteConfigExists) {
          console.log('📦 Vite project detected via config file - adding --host');
          // For pnpm/yarn, use -- to pass args to the underlying script
          if (packageManager === 'pnpm' || packageManager === 'yarn') {
            startCommand = `${startCommand} --host`;
          } else {
            startCommand = `${startCommand} -- --host`;
          }
        } else {
          // Default: use HOST environment variable
          startCommand = `HOST=0.0.0.0 ${startCommand}`;
        }
      } else if (startCommand.includes('flask run') || commands.projectType === 'Flask') {
        // Flask uses --host flag
        startCommand = `${startCommand} --host 0.0.0.0`;
      } else if (startCommand.includes('python') && startCommand.includes('manage.py runserver')) {
        // Django uses 0.0.0.0:port format
        startCommand = startCommand.replace(/runserver/, `runserver 0.0.0.0:${port}`);
      } else if (startCommand.includes('rails') && startCommand.includes('server')) {
        // Rails uses -b flag for binding
        startCommand = `${startCommand} -b 0.0.0.0`;
      } else {
        // Default: use HOST environment variable (works for most Node.js frameworks)
        startCommand = `HOST=0.0.0.0 ${startCommand}`;
      }
    }

    console.log(`🚀 Executing: ${startCommand}`);

    // Start the backend server if detected (e.g., json-server, express API)
    let backendProcess = null;
    let backendPort = null;
    if (commands.hasBackend && commands.backendCommand) {
      backendPort = commands.backendPort || 5000;
      // Check if port is available, find alternative if not
      backendPort = await findAvailablePort(backendPort);

      let backendCmd = commands.backendCommand;
      // Update port in command if needed
      if (backendCmd.includes('--port')) {
        backendCmd = backendCmd.replace(/--port[=\s]\d+/, `--port ${backendPort}`);
      } else if (backendCmd.includes('json-server')) {
        backendCmd = `${backendCmd} --port ${backendPort}`;
      }
      // Add host for network access
      if (backendCmd.includes('json-server') && !backendCmd.includes('--host')) {
        backendCmd = `${backendCmd} --host 0.0.0.0`;
      }

      console.log(`🔧 Starting backend server: ${backendCmd} (port ${backendPort})`);

      const { exec: execBackend } = require('child_process');
      backendProcess = execBackend(backendCmd, {
        cwd: repoPath,
        env: { ...process.env, PORT: backendPort.toString() },
        maxBuffer: 10 * 1024 * 1024
      });

      backendProcess.stdout?.on('data', (data) => {
        console.log(`[Backend] ${data.toString().trim()}`);
      });
      backendProcess.stderr?.on('data', (data) => {
        console.log(`[Backend Error] ${data.toString().trim()}`);
      });
      backendProcess.on('error', (err) => {
        console.error(`[Backend Process Error] ${err.message}`);
      });
    }

    // Start the server in background using exec (more compatible with npm)
    const { exec } = require('child_process');

    // Collect output for error analysis
    let serverOutput = '';
    let serverErrorOutput = '';
    let processExited = false;
    let exitCode = null;

    const serverProcess = exec(startCommand, {
      cwd: repoPath,
      env: {
        ...process.env,
        HOST: '0.0.0.0',
        PORT: port.toString(),
        SKIP_PREFLIGHT_CHECK: 'true',  // Skip CRA dependency check (avoids conflicts with parent node_modules)
        BROWSER: 'none',  // Don't open browser automatically
        NODE_OPTIONS: '--openssl-legacy-provider'  // Fix for Node.js 17+ with old webpack
      },
      maxBuffer: 10 * 1024 * 1024
    });

    // Track actual port from server output
    let detectedPort = null;

    // Log server output and collect for error analysis
    serverProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      serverOutput += output;
      console.log(`[Server] ${output.trim()}`);

      // Detect actual port from server output
      // Vite: "Local: http://localhost:3000/" or "Network: http://192.168.x.x:3000/"
      // React: "On Your Network: http://192.168.x.x:3000"
      // Next.js: "started server on 0.0.0.0:3000"
      const portMatches = output.match(/(?:localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|0\.0\.0\.0):(\d{4,5})/g);
      if (portMatches && !detectedPort) {
        const match = portMatches[0].match(/:(\d{4,5})/);
        if (match) {
          detectedPort = parseInt(match[1]);
          console.log(`🔍 Detected actual port from output: ${detectedPort}`);
        }
      }
    });
    serverProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      serverErrorOutput += output;
      console.log(`[Server Error] ${output.trim()}`);
    });
    serverProcess.on('error', (err) => {
      console.error(`[Server Process Error] ${err.message}`);
      serverErrorOutput += `Process error: ${err.message}\n`;
    });
    serverProcess.on('exit', (code) => {
      processExited = true;
      exitCode = code;
      console.log(`[Server] Process exited with code: ${code}`);
    });

    // Step 8: Health check
    // Wait a bit for server to start and output port info
    await new Promise(r => setTimeout(r, 2000));

    // Use detected port from output if available, otherwise fall back to expected port
    // For Expo projects, use the Metro port instead of the generic port
    let actualPort = isExpoProject && metroPort ? metroPort : port;
    if (detectedPort && detectedPort !== actualPort) {
      console.log(`🔄 Using detected port ${detectedPort} instead of expected port ${actualPort}`);
      actualPort = detectedPort;
    }

    let previewUrl = `http://${LOCAL_IP}:${actualPort}`;
    console.log(`🏥 Health checking: ${previewUrl}`);

    const maxAttempts = 30; // Reduced from 45 to fail faster if there's an error
    let healthy = false;
    let attempts = 0;

    for (let i = 0; i < maxAttempts; i++) {
      attempts++;
      await new Promise(r => setTimeout(r, 1000));

      // Check if process crashed early (within first 10 seconds)
      if (processExited && exitCode !== 0 && i < 10) {
        console.log(`⚠️ Server process exited early with code ${exitCode}`);
        break;
      }

      // Update port if detected during health check loop
      if (detectedPort && detectedPort !== actualPort) {
        console.log(`🔄 Port changed: ${actualPort} -> ${detectedPort}`);
        actualPort = detectedPort;
        previewUrl = `http://${LOCAL_IP}:${actualPort}`;
      }

      try {
        const healthResponse = await axios.get(previewUrl, { timeout: 3000 });
        if (healthResponse.status < 500) {
          healthy = true;
          console.log(`✅ Server ready after ${attempts} attempts`);
          break;
        }
      } catch (err) {
        // Server not ready yet
        if (i % 10 === 0) {
          console.log(`   Attempt ${attempts}...`);
        }
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`⏱️ Total time: ${totalTime}ms`);

    // If server failed to start, analyze the error output with AI
    if (!healthy && (serverErrorOutput || processExited)) {
      console.log('🔍 Analyzing startup error with AI...');
      const combinedOutput = serverOutput + '\n' + serverErrorOutput;
      const errorAnalysis = await aiAnalyzeStartupError(combinedOutput, commands.projectType);

      if (errorAnalysis.hasEnvError && errorAnalysis.envVars.length > 0) {
        console.log(`⚠️ AI detected missing env vars: ${errorAnalysis.envVars.map(v => v.key).join(', ')}`);

        // Kill the failed process
        try { serverProcess.kill(); } catch {}

        return res.status(200).json({
          success: false,
          requiresEnvVars: true,
          envVars: errorAnalysis.envVars,
          projectType: commands.projectType,
          message: errorAnalysis.errorSummary || 'Il progetto richiede variabili d\'ambiente per avviarsi.',
          targetFile: '.env'
        });
      }

      // Check for common startup errors (command not found, npm install failed, etc.)
      const errorLower = serverErrorOutput.toLowerCase();
      const isCommandNotFound = errorLower.includes('command not found') ||
                                 errorLower.includes('not recognized') ||
                                 exitCode === 127;
      const isNpmError = errorLower.includes('npm error') ||
                         errorLower.includes('npm err!') ||
                         errorLower.includes('enoent') ||
                         errorLower.includes('missing script');
      const isModuleNotFound = errorLower.includes('cannot find module') ||
                               errorLower.includes('module not found');

      if (processExited && exitCode !== 0) {
        // Kill any remaining process
        try { serverProcess.kill(); } catch {}

        let errorMessage = 'Il server non è riuscito ad avviarsi.';
        let errorDetails = serverErrorOutput || 'Errore sconosciuto';

        if (isCommandNotFound) {
          const cmdMatch = serverErrorOutput.match(/(\w+): command not found/i);
          const missingCmd = cmdMatch ? cmdMatch[1] : 'richiesto';
          errorMessage = `Comando "${missingCmd}" non trovato. Il progetto potrebbe richiedere dipendenze globali non installate.`;
        } else if (isNpmError) {
          errorMessage = 'Errore durante l\'installazione delle dipendenze npm.';
          if (errorLower.includes('missing script')) {
            errorMessage = 'Script npm non trovato nel package.json.';
          }
        } else if (isModuleNotFound) {
          errorMessage = 'Modulo Node.js mancante. Prova a eseguire "npm install".';
        }

        console.log(`❌ Server startup failed: ${errorMessage}`);

        return res.status(200).json({
          success: false,
          error: errorMessage,
          errorDetails: errorDetails.substring(0, 500),
          projectType: commands.projectType,
          exitCode: exitCode
        });
      }
    }

    // Prepare response with backend info if available
    const response = {
      success: true,
      previewUrl,
      port: actualPort,
      serverReady: healthy,
      projectType: commands.projectType,
      commands: {
        install: commands.installCommand,
        start: commands.startCommand
      },
      timing: {
        totalMs: totalTime,
        cached: projectCommandsCache.has(cacheKey) && !req.body.forceRefresh
      }
    };

    // Add backend info if detected
    if (commands.hasBackend && backendPort) {
      response.hasBackend = true;
      response.backendUrl = `http://${LOCAL_IP}:${backendPort}`;
      response.backendPort = backendPort;
      response.backendCommand = commands.backendCommand;
      console.log(`🔧 Backend server started at: ${response.backendUrl}`);
    }

    res.json(response);

  } catch (error) {
    console.error('❌ Preview start error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

/**
 * Clear preview commands cache for a project
 */
app.post('/preview/clear-cache', (req, res) => {
  const { workstationId } = req.body;

  if (workstationId) {
    const repoPath = path.join(__dirname, 'cloned_repos', workstationId);
    projectCommandsCache.delete(repoPath);
    console.log(`🗑️ Cache cleared for: ${workstationId}`);
  } else {
    projectCommandsCache.clear();
    console.log('🗑️ All preview cache cleared');
  }

  res.json({ success: true });
});

/**
 * Save environment variables for a project
 * Creates or updates .env file with provided variables
 */
app.post('/preview/env', async (req, res) => {
  try {
    const { workstationId, envVars, targetFile } = req.body;

    if (!workstationId || !envVars) {
      return res.status(400).json({ success: false, error: 'workstationId and envVars are required' });
    }

    console.log(`\n📝 Saving environment variables for: ${workstationId}`);
    console.log(`   Target file: ${targetFile || '.env'}`);
    console.log(`   Variables: ${Object.keys(envVars).join(', ')}`);

    // Resolve repo path
    let repoPath = path.join(__dirname, 'cloned_repos', workstationId);

    if (workstationId.startsWith('ws-')) {
      const projectIdLower = workstationId.substring(3);
      const clonedReposDir = path.join(__dirname, 'cloned_repos');

      try {
        const folders = await fs.readdir(clonedReposDir);
        const matchingFolder = folders.find(f => f.toLowerCase() === projectIdLower);
        if (matchingFolder) {
          repoPath = path.join(clonedReposDir, matchingFolder);
        }
      } catch (err) {
        console.error('Error reading cloned_repos:', err);
      }
    }

    // Build env file content
    const envFileName = targetFile || '.env';
    const envFilePath = path.join(repoPath, envFileName);

    // Read existing content if file exists
    let existingContent = '';
    try {
      existingContent = await fs.readFile(envFilePath, 'utf8');
    } catch {
      // File doesn't exist, will create new
    }

    // Parse existing vars
    const existingVars = {};
    if (existingContent) {
      const lines = existingContent.split('\n');
      for (const line of lines) {
        const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
        if (match) {
          existingVars[match[1]] = match[2];
        }
      }
    }

    // Merge with new vars (new vars override existing)
    const mergedVars = { ...existingVars, ...envVars };

    // Build new content
    let newContent = '# Environment variables\n# Generated by Drape IDE\n\n';
    for (const [key, value] of Object.entries(mergedVars)) {
      // Quote value if it contains spaces or special characters
      const needsQuotes = /[\s#=]/.test(value);
      const quotedValue = needsQuotes ? `"${value}"` : value;
      newContent += `${key}=${quotedValue}\n`;
    }

    // Write file
    await fs.writeFile(envFilePath, newContent, 'utf8');

    console.log(`✅ Environment file saved: ${envFilePath}`);
    console.log(`   Total variables: ${Object.keys(mergedVars).length}`);

    res.json({
      success: true,
      file: envFileName,
      varsCount: Object.keys(mergedVars).length
    });

  } catch (error) {
    console.error('❌ Error saving env vars:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
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
          setHeader: () => { }, // No-op for WebSocket
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
  console.log('');
  console.log('='.repeat(55));
  console.log('  🚀 Drape Backend Started');
  console.log('='.repeat(55));
  console.log(`  📍 Local IP:     ${LOCAL_IP}`);
  console.log(`  🔌 Port:         ${PORT}`);
  console.log('');
  console.log(`  🌐 API URL:      http://${LOCAL_IP}:${PORT}`);
  console.log(`  🔗 Health:       http://${LOCAL_IP}:${PORT}/health`);
  console.log(`  📡 WebSocket:    ws://${LOCAL_IP}:${PORT}/ws`);
  console.log('');
  console.log(`  ☁️  GCP Project:  ${PROJECT_ID}`);
  console.log(`  🌍 Region:       ${LOCATION}`);
  console.log('='.repeat(55));
  console.log('');
});

// Get project files from workstation
