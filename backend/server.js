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

const coderService = require('./coder-service');

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

// ============================================
// REAL-TIME LOG BROADCASTING SYSTEM
// ============================================
let wssInstance = null; // Will be set after WebSocket server is created

// Store server logs per workstation for streaming to frontend
const serverLogsMap = new Map(); // workstationId -> { logs: [], listeners: Set<res> }

/**
 * Add a log entry for a workstation and notify listeners
 */
function addServerLog(workstationId, log) {
  if (!serverLogsMap.has(workstationId)) {
    serverLogsMap.set(workstationId, { logs: [], listeners: new Set() });
  }
  const entry = serverLogsMap.get(workstationId);

  // Limit logs to last 500 entries
  if (entry.logs.length > 500) {
    entry.logs = entry.logs.slice(-400);
  }

  const logEntry = {
    timestamp: new Date().toISOString(),
    type: log.type || 'info', // 'stdout', 'stderr', 'info', 'error'
    message: log.message
  };
  entry.logs.push(logEntry);

  // Notify all SSE listeners
  entry.listeners.forEach(res => {
    try {
      res.write(`data: ${JSON.stringify(logEntry)}\n\n`);
    } catch (e) {
      // Remove dead listener
      entry.listeners.delete(res);
    }
  });
}

/**
 * Broadcast a log message to all connected WebSocket clients
 * @param {string} level - Log level: 'info', 'error', 'warn', 'debug'
 * @param {string} message - The log message
 * @param {object} metadata - Optional metadata (workstationId, tool, etc.)
 */
function broadcastLog(level, message, metadata = {}) {
  if (!wssInstance) return;

  // Filter out WebSocket connection/disconnection spam and other noise
  const spamPatterns = [
    /WebSocket.*connect/i,
    /WebSocket.*disconnect/i,
    /🔌.*WebSocket/i,
    /📨.*WebSocket message/i,
    /\[WebSocketLogService\]/i,
  ];

  if (spamPatterns.some(pattern => pattern.test(message))) {
    return; // Don't broadcast spam messages
  }

  const logEntry = {
    type: 'log',
    level,
    message,
    timestamp: new Date().toISOString(),
    ...metadata
  };

  wssInstance.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(logEntry));
      } catch (e) {
        // Ignore send errors
      }
    }
  });
}

// Store original console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// Override console.log to also broadcast
console.log = (...args) => {
  originalConsoleLog.apply(console, args);
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  broadcastLog('info', message);
};

// Override console.error to also broadcast
console.error = (...args) => {
  originalConsoleError.apply(console, args);
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  broadcastLog('error', message);
};

// Override console.warn to also broadcast
console.warn = (...args) => {
  originalConsoleWarn.apply(console, args);
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  broadcastLog('warn', message);
};
// ============================================

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
  // Reserved ports that should never be used (3001 is our backend port)
  const reservedPorts = [3001];

  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    // Skip reserved ports
    if (reservedPorts.includes(port)) {
      console.log(`⚠️  Port ${port} is reserved (backend), skipping...`);
      continue;
    }
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
  },
  // Google Gemini
  'gemini-2-flash': {
    provider: 'gemini',
    modelId: 'gemini-2.0-flash',
    name: 'Gemini 2 Flash',
    description: 'Google - Velocissimo e potente'
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
            res.write(`data: ${JSON.stringify({ text: `\n⏳ Rate limit - Riprovo tra ${waitTime / 1000}s...\n` })}\n\n`);
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
    // GEMINI PROVIDER (Google) - with tool calling support
    // ==========================================
    if (provider === 'gemini') {
      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
      }

      // Convert tools to Gemini format
      const geminiTools = [{
        function_declarations: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema
        }))
      }];

      // Convert messages to Gemini format
      const geminiContents = currentMessages.map(msg => {
        if (msg.role === 'user') {
          if (Array.isArray(msg.content)) {
            // Handle tool_result messages
            const toolResults = msg.content.filter(c => c.type === 'tool_result');
            if (toolResults.length > 0) {
              return {
                role: 'user',
                parts: toolResults.map(tr => ({
                  functionResponse: {
                    name: tr.tool_use_id.split('_')[0] || 'tool',
                    response: { result: tr.content }
                  }
                }))
              };
            }
            const textContent = msg.content.find(c => c.type === 'text');
            return { role: 'user', parts: [{ text: textContent?.text || '' }] };
          }
          return { role: 'user', parts: [{ text: msg.content }] };
        }
        if (msg.role === 'assistant') {
          if (Array.isArray(msg.content)) {
            const parts = [];
            for (const block of msg.content) {
              if (block.type === 'text') {
                parts.push({ text: block.text });
              } else if (block.type === 'tool_use') {
                parts.push({
                  functionCall: {
                    name: block.name,
                    args: block.input
                  }
                });
              }
            }
            return { role: 'model', parts };
          }
          return { role: 'model', parts: [{ text: msg.content }] };
        }
        return { role: msg.role === 'assistant' ? 'model' : 'user', parts: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }] };
      });

      while (continueLoop) {
        continueLoop = false;

        try {
          console.log(`🔄 Calling Gemini API with model: ${model}`);

          // Gemini streaming request
          const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
            {
              contents: geminiContents,
              systemInstruction: { parts: [{ text: systemMessage }] },
              tools: geminiTools,
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 8192
              }
            },
            {
              headers: {
                'Content-Type': 'application/json'
              },
              responseType: 'stream',
              timeout: 120000
            }
          );

          let fullText = '';
          let toolCalls = [];
          let buffer = '';

          // Process streaming response
          response.data.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.candidates?.[0]?.content?.parts) {
                    // Check if this chunk contains a function call
                    const hasToolCall = data.candidates[0].content.parts.some(p => p.functionCall);

                    for (const part of data.candidates[0].content.parts) {
                      if (part.text) {
                        // Filter out raw tool call syntax from text (e.g., "write_file(index.html, ...")
                        // This happens when Gemini includes the tool call in text format
                        const toolCallPatterns = [
                          /\b(write_file|read_file|edit_file|glob_files|grep_search|execute_command)\s*\(/,
                        ];
                        const isRawToolCall = toolCallPatterns.some(pattern => pattern.test(part.text));

                        // Only send text if it's not a raw tool call syntax
                        if (!isRawToolCall || !hasToolCall) {
                          fullText += part.text;
                          res.write(`data: ${JSON.stringify({ text: part.text })}\n\n`);
                        }
                      }
                      if (part.functionCall) {
                        toolCalls.push({
                          id: `gemini_${Date.now()}_${toolCalls.length}`,
                          name: part.functionCall.name,
                          input: part.functionCall.args || {}
                        });
                        res.write(`data: ${JSON.stringify({
                          functionCall: {
                            name: part.functionCall.name,
                            args: part.functionCall.args || {}
                          }
                        })}\n\n`);
                      }
                    }
                  }
                } catch (e) {
                  // Ignore parse errors for incomplete JSON
                }
              }
            }
          });

          await new Promise((resolve, reject) => {
            response.data.on('end', resolve);
            response.data.on('error', reject);
          });

          // Process tool calls if any
          if (toolCalls.length > 0) {
            console.log(`🔧 Processing ${toolCalls.length} Gemini tool calls`);

            // Add assistant message with tool calls
            const assistantContent = [];
            if (fullText) {
              assistantContent.push({ type: 'text', text: fullText });
            }
            for (const tc of toolCalls) {
              assistantContent.push({
                type: 'tool_use',
                id: tc.id,
                name: tc.name,
                input: tc.input
              });
            }
            currentMessages.push({ role: 'assistant', content: assistantContent });

            // Execute tools and stream results to frontend
            const toolResults = [];
            for (const tc of toolCalls) {
              console.log(`   🔧 Executing: ${tc.name}`);
              const result = await executeTool(tc.name, tc.input);
              const resultContent = typeof result === 'string' ? result : JSON.stringify(result);

              // Send tool result to frontend for UI display
              res.write(`data: ${JSON.stringify({
                toolResult: {
                  name: tc.name,
                  args: tc.input,
                  result: resultContent
                }
              })}\n\n`);

              toolResults.push({
                type: 'tool_result',
                tool_use_id: tc.id,
                content: resultContent
              });
            }
            currentMessages.push({ role: 'user', content: toolResults });

            // Update geminiContents for next iteration
            geminiContents.push({
              role: 'model',
              parts: toolCalls.map(tc => ({
                functionCall: { name: tc.name, args: tc.input }
              }))
            });
            geminiContents.push({
              role: 'user',
              parts: toolResults.map(tr => ({
                functionResponse: {
                  name: tr.tool_use_id.split('_')[1] || 'tool',
                  response: { result: tr.content }
                }
              }))
            });

            continueLoop = true;
          }

        } catch (error) {
          console.error('❌ Gemini API error:', error.response?.data || error.message);
          res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        }
      }

      // Done with Gemini
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

// Execute command on workstation (cloud execution via Coder)
async function executeCommandOnWorkstation(command, workstationId) {
  console.log(`🔧 executeCommandOnWorkstation called:`);
  console.log(`   Command: ${command}`);
  console.log(`   Workstation: ${workstationId}`);

  // ===========================================
  // VIBE CODING: CLOUD EXECUTION
  // ===========================================

  // 1. Identify workspace
  // workstationId format: "ws-<name>" or just "<name>"
  const wsName = workstationId.replace(/^ws-/, '').replace(/[^a-z0-9-]/g, '-').toLowerCase().substring(0, 32);

  try {
    // 2. Ensure User & Agent
    // We assume admin user for MVP flow
    const user = await coderService.ensureUser('admin@drape.dev', 'admin');

    // 3. Find Workspace
    // We need the workspace ID to connect
    // For speed, strict mapping would be better, but we search for now
    // Simpler: assume we stored the mapping in memory or deduce it
    // Let's deduce: workspace name is derived from repo name usually

    console.log(`☁️  Routing command to Coder workspace: ${wsName}`);

    // 4. Execute via Coder Agent (SSH/ReconnectingPTY)
    // Since Coder's API for "exec" is complex (needs WebSocket upgrade), 
    // for this MVP we will use the `coder` CLI installed on this server to proxy the command.
    // This is much more reliable than implementing the SSH protocol in JS for now.

    // Ensure we are logged in
    // (This should be handled by setup-coder.js but good to check)

    // Execute via Coder CLI: "coder ssh <workspace> -- <command>"
    // Note: We need to set stdio to pipe to capture output

    console.log(`🚀 Sending command to cloud: ${command}`);

    // Pre-process command for non-interactive execution
    let remoteCommand = command;
    let isBackground = false;

    // Handle long-running servers (start/dev/serve)
    const isDevServer = /npm\s+(run\s+)?dev|npm\s+start|yarn\s+(run\s+)?dev|yarn\s+start|ng\s+serve|python3?\s+-m\s+http\.server|uvicorn/.test(command);

    if (isDevServer) {
      isBackground = true;
      // Run in background with nohup to survive disconnects
      // We redirect stdout/stderr to a log file we can tail later
      remoteCommand = `nohup ${command} > debug.log 2>&1 & echo $!`;
      console.log(`🌐 Converting to background command: ${remoteCommand}`);
    }

    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    // Use the coder CLI to run the command inside the workspace
    // We use the full path to ensuring we hit the binary
    const coderCli = 'coder';

    // Construct the SSH command
    // -t force pseudo-terminal (good for colors), but might break some parsers. Let's try without first.
    const fullCmd = `${coderCli} ssh ${wsName} -- ${remoteCommand}`;

    const { stdout, stderr } = await execAsync(fullCmd, {
      env: { ...process.env, CODER_SESSION_TOKEN: process.env.CODER_SESSION_TOKEN },
      timeout: isBackground ? 10000 : 30000 // Short timeout for launch, longer for normal cmds
    });

    // If backround, execution returns the PID
    if (isBackground) {
      console.log(`✅ Background process started. PID: ${stdout.trim()}`);

      // We can assume standard ports for now or parse them from logs later
      // For Cloud Workstations, we usually rely on port forwarding or public ingress
      // MVP: Let's assume port 3000 is exposed via Coder's port forwarding URL

      // Generate the Proxy URL for the User
      const proxyUrl = `${process.env.CODER_API_URL}/@${user.username}/${wsName}/apps/port/3000`; // Approximate URL structure for Coder port forwarding

      return {
        stdout: `> Cloud Process Started\n\nPID: ${stdout.trim()}\nlogs: debug.log\n\n🌐 App Address: ${proxyUrl}`,
        stderr: stderr,
        exitCode: 0
      };
    }

    return {
      stdout,
      stderr,
      exitCode: 0
    };

  } catch (err) {
    console.error('❌ Cloud Execution Failed:', err);
    return {
      stdout: '',
      stderr: `Cloud Error: ${err.message}\n${err.stderr || ''}`,
      exitCode: 1
    };
  }
}


// --- OLD LOCAL LOGIC DELETED ---

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

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    envAnalysisCache.set(workstationId, {
      status: 'error',
      error: 'GEMINI_API_KEY not configured',
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
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: phase1Prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1000,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
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
                    if (i > 0) context.push(lines[i - 1]);
                    context.push(line);
                    if (i < lines.length - 1) context.push(lines[i + 1]);
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
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: phase3Prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4000,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

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

// POST /workstation/:id/env-variables - Aggiunge o aggiorna una variabile d'ambiente nel .env
app.post('/workstation/:id/env-variables', async (req, res) => {
  const { id } = req.params;
  const { key, value, isSecret, description, variables } = req.body;

  try {
    const fs = require('fs');
    const path = require('path');

    // Get workstation repository path - handle both ws-xxx format and direct ID
    let repoName = id.replace(/\//g, '_').replace(/:/g, '_');
    const cleanId = repoName.startsWith('ws-') ? repoName.slice(3) : repoName;

    let repoPath = path.join(__dirname, 'cloned_repos', repoName);

    if (!fs.existsSync(repoPath)) {
      repoPath = path.join(__dirname, 'cloned_repos', cleanId);
    }

    if (!fs.existsSync(repoPath)) {
      // Try case-insensitive match
      const clonedReposDir = path.join(__dirname, 'cloned_repos');
      const repos = fs.readdirSync(clonedReposDir);
      const match = repos.find(r => r.toLowerCase() === cleanId.toLowerCase() || r.toLowerCase() === repoName.toLowerCase());
      if (match) {
        repoPath = path.join(clonedReposDir, match);
      }
    }

    const envPath = path.join(repoPath, '.env');

    // Se viene passato un array variables, sovrascrivi tutto
    if (variables && Array.isArray(variables)) {
      let envContent = '# Environment Variables\n';
      envContent += `# Last updated: ${new Date().toISOString()}\n\n`;

      variables.forEach(variable => {
        if (variable.description) {
          envContent += `# ${variable.description}\n`;
        }
        envContent += `${variable.key}=${variable.value}\n\n`;
      });

      fs.writeFileSync(envPath, envContent, 'utf8');

      console.log(`✅ Saved ${variables.length} environment variables to ${envPath}`);

      return res.json({
        success: true,
        message: `Saved ${variables.length} variables`,
        path: envPath
      });
    }

    // Se viene passata una singola variabile (key, value), aggiungila/aggiornala
    if (key) {
      // Leggi le variabili esistenti
      let existingVars = [];
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        existingVars = parseEnvFile(content);
      }

      // Cerca se la variabile esiste già
      const existingIndex = existingVars.findIndex(v => v.key === key);
      if (existingIndex >= 0) {
        // Aggiorna
        existingVars[existingIndex] = { key, value, isSecret, description };
      } else {
        // Aggiungi
        existingVars.push({ key, value, isSecret, description });
      }

      // Riscrivi il file
      let envContent = '# Environment Variables\n';
      envContent += `# Last updated: ${new Date().toISOString()}\n\n`;

      existingVars.forEach(variable => {
        if (variable.description) {
          envContent += `# ${variable.description}\n`;
        }
        envContent += `${variable.key}=${variable.value || ''}\n\n`;
      });

      fs.writeFileSync(envPath, envContent, 'utf8');

      console.log(`✅ Added/updated env variable ${key} in ${envPath}`);

      return res.json({
        success: true,
        message: `Variable ${key} saved`,
        path: envPath
      });
    }

    res.status(400).json({ error: 'Missing key or variables' });
  } catch (error) {
    console.error('Failed to save env variables:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /workstation/:id/env-variables/:key - Elimina una variabile d'ambiente
app.delete('/workstation/:id/env-variables/:key', async (req, res) => {
  const { id, key } = req.params;

  try {
    const fs = require('fs');
    const path = require('path');

    // Get workstation repository path
    let repoName = id.replace(/\//g, '_').replace(/:/g, '_');
    const cleanId = repoName.startsWith('ws-') ? repoName.slice(3) : repoName;

    let repoPath = path.join(__dirname, 'cloned_repos', repoName);

    if (!fs.existsSync(repoPath)) {
      repoPath = path.join(__dirname, 'cloned_repos', cleanId);
    }

    if (!fs.existsSync(repoPath)) {
      const clonedReposDir = path.join(__dirname, 'cloned_repos');
      const repos = fs.readdirSync(clonedReposDir);
      const match = repos.find(r => r.toLowerCase() === cleanId.toLowerCase() || r.toLowerCase() === repoName.toLowerCase());
      if (match) {
        repoPath = path.join(clonedReposDir, match);
      }
    }

    const envPath = path.join(repoPath, '.env');

    if (!fs.existsSync(envPath)) {
      return res.status(404).json({ error: '.env file not found' });
    }

    // Leggi e filtra le variabili
    const content = fs.readFileSync(envPath, 'utf8');
    let existingVars = parseEnvFile(content);
    existingVars = existingVars.filter(v => v.key !== key);

    // Riscrivi il file
    let envContent = '# Environment Variables\n';
    envContent += `# Last updated: ${new Date().toISOString()}\n\n`;

    existingVars.forEach(variable => {
      if (variable.description) {
        envContent += `# ${variable.description}\n`;
      }
      envContent += `${variable.key}=${variable.value || ''}\n\n`;
    });

    fs.writeFileSync(envPath, envContent, 'utf8');

    console.log(`✅ Deleted env variable ${key} from ${envPath}`);

    res.json({
      success: true,
      message: `Variable ${key} deleted`
    });
  } catch (error) {
    console.error('Failed to delete env variable:', error.message);
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

    // Use grep to search - exclude node_modules, dist, build, .git
    const { stdout } = await execAsync(
      `cd "${repoPath}" && grep -r -n "${pattern}" --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" --include="*.json" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build --exclude-dir=.git --exclude-dir=coverage . || true`,
      { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer
    );

    const results = stdout.split('\n').filter(line => line.trim()).map(line => {
      const [file, ...rest] = line.split(':');
      return { file, match: rest.join(':') };
    });

    // Limit to first 50 results
    const limitedResults = results.slice(0, 50);
    const truncated = results.length > 50;

    res.json({ success: true, results: limitedResults, totalCount: results.length, truncated });
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


    // ===========================================
    // VIBE CODING: CLOUD FILE SYSTEM (LIST)
    // ===========================================
    const wsName = projectId.replace(/^ws-/, '').replace(/[^a-z0-9-]/g, '-').toLowerCase().substring(0, 32);
    try {
      await coderService.ensureUser('admin@drape.dev', 'admin');
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      // We use 'git ls-files' if it's a git repo, otherwise 'find'
      // Let's use 'find' to be generic and robust
      // Exclude node_modules, .git, etc.
      const cmd = `find . -maxdepth 4 -not -path '*/.*' -not -path '*/node_modules/*' -not -type d`;

      console.log(`☁️  Listing files from cloud: ${wsName}`);
      const { stdout } = await execAsync(`coder ssh ${wsName} -- ${cmd}`, {
        env: { ...process.env, CODER_SESSION_TOKEN: process.env.CODER_SESSION_TOKEN },
        timeout: 10000
      });

      const files = stdout.split('\n').filter(f => f.trim() !== '').map(f => f.replace(/^\.\//, ''));
      console.log(`✅ Found ${files.length} files in cloud workspace`);
      res.json({ success: true, files });
      return;

    } catch (err) {
      console.error('❌ Cloud List Files Error:', err.message);
      // Fallback or error?
      // If the workspace is off, this fails. 
      // For now, let's treat it as "needs clone" or empty to avoid crashing UI
      res.json({ success: true, files: [], error: err.message });
      return;
    }

  } catch (error) {
    console.error('❌ Outer Error:', error);
    res.status(500).json({ error: error.message });
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

    // ===========================================
    // VIBE CODING: CLOUD FILE SYSTEM (READ)
    // ===========================================
    const wsName = projectId.replace(/^ws-/, '').replace(/[^a-z0-9-]/g, '-').toLowerCase().substring(0, 32);

    // Read file content from cloud via SSH + cat
    // We use base64 encoding on the remote side to avoid special char issues in transit
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    console.log(`📄 [CLOUD-READ] Reading ${filePath} from ${wsName}`);

    try {
      const cmd = `base64 "${filePath}"`; // cat file | base64 (checking syntax) -> simple 'base64 file' works on linux
      const { stdout } = await execAsync(`coder ssh ${wsName} -- ${cmd}`, {
        env: { ...process.env, CODER_SESSION_TOKEN: process.env.CODER_SESSION_TOKEN },
        timeout: 5000
      });

      // Decode logic
      const content = Buffer.from(stdout.trim(), 'base64').toString('utf-8');

      console.log(`✅ [CLOUD-READ] Loaded ${content.length} bytes`);
      res.json({ success: true, content, filePath });

    } catch (err) {
      console.error(`❌ [CLOUD-READ] Failed: ${err.message}`);
      res.status(404).json({ success: false, error: 'File not found on cloud workspace' });
    }

  } catch (error) {
    console.error('❌ [FILE-CONTENT] Error:', error.message);
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


  // ===========================================
  // VIBE CODING: CLOUD GIT STATUS
  // ===========================================
  const wsName = projectId.replace(/^ws-/, '').replace(/[^a-z0-9-]/g, '-').toLowerCase().substring(0, 32);

  try {
    await coderService.ensureUser('admin@drape.dev', 'admin');
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    console.log(`☁️  Git Status Check in cloud: ${wsName}`);

    // We run a combined script in the cloud to gather all git info at once
    // This is faster than multiple SSH calls
    const script = `
        if [ -d .git ]; then
            echo "IS_GIT:true"
            echo "BRANCH:$(git rev-parse --abbrev-ref HEAD)"
            echo "---LOG---"
            git log --pretty=format:"%H|%h|%s|%an|%ae|%aI" -20
            echo ""
            echo "---STATUS---"
            git status --porcelain
        else
            echo "IS_GIT:false"
        fi
    `.replace(/\n/g, ' '); // simple sanitization

    const { stdout } = await execAsync(`coder ssh ${wsName} -- sh -c '${script}'`, {
      env: { ...process.env, CODER_SESSION_TOKEN: process.env.CODER_SESSION_TOKEN },
      timeout: 10000
    });

    // Parse output
    const output = stdout.toString().trim();
    if (output.includes("IS_GIT:false")) {
      return res.json({ isGitRepo: false });
    }

    const currentBranchMatch = output.match(/BRANCH:(.*)/);
    const currentBranch = currentBranchMatch ? currentBranchMatch[1] : 'main';

    // Parse commits
    const logPart = output.split('---LOG---')[1]?.split('---STATUS---')[0] || '';
    const commits = logPart.trim().split('\n').filter(l => l).map((line, index) => {
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

    // Parse status
    const statusPart = output.split('---STATUS---')[1] || '';
    let status = { staged: [], modified: [], untracked: [], deleted: [] };

    if (statusPart.trim()) {
      statusPart.trim().split('\n').forEach(line => {
        const code = line.substring(0, 2);
        const file = line.substring(3);
        if (code[0] === 'A' || code[0] === 'M' || code[0] === 'D') status.staged.push(file);
        if (code[1] === 'M') status.modified.push(file);
        if (code === '??') status.untracked.push(file);
        if (code[1] === 'D') status.deleted.push(file);
      });
    }

    // Return mocked branches for now to save complexity, or fetch them too
    const branches = [{ name: currentBranch, isCurrent: true, isRemote: false }];

    res.json({
      isGitRepo: true,
      currentBranch,
      commits,
      branches,
      status
    });

  } catch (error) {
    console.error('❌ Cloud Git Status Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/git/fetch/:projectId', async (req, res) => {
  let { projectId } = req.params;
  const wsName = projectId.replace(/^ws-/, '').replace(/[^a-z0-9-]/g, '-').toLowerCase().substring(0, 32);

  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    console.log(`☁️  Git Fetch in cloud: ${wsName}`);
    await execAsync(`coder ssh ${wsName} -- git fetch --all`, {
      env: { ...process.env, CODER_SESSION_TOKEN: process.env.CODER_SESSION_TOKEN },
      timeout: 30000
    });

    res.json({ success: true, message: 'Fetch completed' });
  } catch (error) {
    console.error('❌ Cloud Git Fetch Error:', error.message);
    res.json({ success: false, message: error.message });
  }
});

/**
 * Git pull
 */
app.post('/git/pull/:projectId', async (req, res) => {
  let { projectId } = req.params;
  const wsName = projectId.replace(/^ws-/, '').replace(/[^a-z0-9-]/g, '-').toLowerCase().substring(0, 32);

  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    console.log(`☁️  Git Pull in cloud: ${wsName}`);
    await execAsync(`coder ssh ${wsName} -- git pull`, {
      env: { ...process.env, CODER_SESSION_TOKEN: process.env.CODER_SESSION_TOKEN },
      timeout: 30000
    });

    res.json({ success: true, message: 'Pull completed' });
  } catch (error) {
    console.error('❌ Cloud Git Pull Error:', error.message);
    res.json({ success: false, message: error.message });
  }
});

/**
 * Git push
 */
app.post('/git/push/:projectId', async (req, res) => {
  let { projectId } = req.params;
  const wsName = projectId.replace(/^ws-/, '').replace(/[^a-z0-9-]/g, '-').toLowerCase().substring(0, 32);

  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    console.log(`☁️  Git Push in cloud: ${wsName}`);
    await execAsync(`coder ssh ${wsName} -- git push`, {
      env: { ...process.env, CODER_SESSION_TOKEN: process.env.CODER_SESSION_TOKEN },
      timeout: 30000
    });

    res.json({ success: true, message: 'Push completed' });
  } catch (error) {
    console.error('❌ Cloud Git Push Error:', error.message);
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

    // ===========================================
    // VIBE CODING: CLOUD FILE SYSTEM (WRITE)
    // ===========================================
    const wsName = projectId.replace(/^ws-/, '').replace(/[^a-z0-9-]/g, '-').toLowerCase().substring(0, 32);

    // Write file content to cloud via SSH
    // Strategy: local echo base64 -> pipe -> ssh -> remote base64 -d > file
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    // 1. Encode content to base64 locally
    const base64Content = Buffer.from(content).toString('base64');

    console.log(`💾 [CLOUD-WRITE] Saving ${filePath} to ${wsName} (${content.length} bytes)`);

    // 2. Ensure directory exists first
    const dir = path.dirname(filePath);
    if (dir !== '.') {
      await execAsync(`coder ssh ${wsName} -- mkdir -p "${dir}"`, {
        env: { ...process.env, CODER_SESSION_TOKEN: process.env.CODER_SESSION_TOKEN }
      });
    }

    // 3. Write file
    // We pass base64 string as environment variable or direct argument? 
    // Argument might be too long. Stdin is safer.
    // "echo <base64> | coder ssh <ws> 'base64 -d > <file>'"

    // Caution: echo on mac might differ. Let's send raw bytes to stdin of the ssh process.
    // But child_process.exec is bad for stdin. Use spawn.
    // Simpler hack for now: If content is small (<1MB), arguement is likely fine.
    // If very large, we might hit limits.
    // Let's use a temporary PROPER way with spawn.

    const { spawn } = require('child_process');

    const writeProcess = spawn('coder', ['ssh', wsName, '--', `base64 -d > "${filePath}"`], {
      env: { ...process.env, CODER_SESSION_TOKEN: process.env.CODER_SESSION_TOKEN },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    try {
      await new Promise((resolve, reject) => {
        writeProcess.stdin.write(base64Content);
        writeProcess.stdin.end();

        writeProcess.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Exit code ${code}`));
        });

        writeProcess.on('error', reject);
      });

      console.log('✅ [CLOUD-WRITE] Save successful');
      res.json({ success: true, filePath, size: content.length });
    } catch (writeErr) {
      throw new Error(`Write failed: ${writeErr.message}`);
    }

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
 * OPTIMIZATION: Fast pre-AI detection for common frameworks
 * Returns commands if detected, null if AI needed
 */
async function fastDetectProject(repoPath) {
  const packageJsonPath = path.join(repoPath, 'package.json');

  try {
    // Check if package.json exists
    await fs.access(packageJsonPath);
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const scripts = packageJson.scripts || {};

    // Detect framework from dependencies
    let projectType = null;
    let startCommand = null;
    let port = 3000;

    // Remix - check BEFORE Vite since Remix uses Vite internally
    if (deps['@remix-run/react']) {
      projectType = 'Remix';
      startCommand = 'npm run dev';
      port = 3000;
    }
    // Next.js - ALWAYS use dev mode (npm start requires a build)
    else if (deps.next) {
      projectType = 'Next.js';
      // Use npm run dev if available, otherwise use npx next dev directly
      startCommand = scripts.dev ? 'npm run dev' : 'npx next dev';
      port = 3000;
    }
    // Nuxt - ALWAYS use dev mode
    else if (deps.nuxt) {
      projectType = 'Nuxt.js';
      // Use npm run dev if available, otherwise use npx nuxi dev directly
      startCommand = scripts.dev ? 'npm run dev' : 'npx nuxi dev';
      port = 3000;
    }
    // Create React App
    else if (deps['react-scripts']) {
      projectType = 'Create React App';
      startCommand = 'npm start';
      port = 3000;
    }
    // Expo / React Native
    else if (deps.expo || deps['expo-cli']) {
      projectType = 'Expo / React Native';
      startCommand = 'npx expo start --web --port 8081';
      port = 8081;
    }
    // Angular
    else if (deps['@angular/core']) {
      projectType = 'Angular';
      startCommand = scripts.start ? 'npm start' : 'npm run serve';
      port = 4200;
    }
    // SvelteKit
    else if (deps['@sveltejs/kit']) {
      projectType = 'SvelteKit';
      startCommand = 'npm run dev';
      port = 5173;
    }
    // Astro
    else if (deps.astro) {
      projectType = 'Astro';
      startCommand = 'npm run dev';
      port = 4321;
    }
    // Vite detection (React, Vue, Svelte with Vite) - AFTER specific frameworks
    else if (deps.vite) {
      projectType = deps.react ? 'React + Vite' : deps.vue ? 'Vue + Vite' : deps.svelte ? 'Svelte + Vite' : 'Vite';
      startCommand = scripts.dev ? 'npm run dev' : 'npm run start';
      port = 5173;
    }
    // Express.js detection
    else if (deps.express) {
      projectType = 'Express.js';
      // Prefer dev script, then start, then look for common entry points
      if (scripts.dev) {
        startCommand = 'npm run dev';
      } else if (scripts.start) {
        startCommand = 'npm start';
      } else {
        // Try common Express entry points
        startCommand = 'node server.js || node index.js || node app.js';
      }
      port = 3000;
    }
    // Generic Node.js with common scripts
    else if (scripts.dev && (deps.react || deps.vue || deps.svelte)) {
      projectType = deps.react ? 'React' : deps.vue ? 'Vue' : 'Svelte';
      startCommand = 'npm run dev';
      port = 3000;
    }
    else if (scripts.start) {
      projectType = 'Node.js';
      startCommand = 'npm start';
      port = 3000;
    }

    if (projectType && startCommand) {
      console.log(`⚡ Fast detection: ${projectType}`);

      // Check for backend scripts
      let hasBackend = false;
      let backendCommand = null;
      let backendPort = null;

      if (scripts.server || scripts.backend || scripts.api) {
        hasBackend = true;
        backendCommand = scripts.server ? 'npm run server' :
          scripts.backend ? 'npm run backend' : 'npm run api';
        backendPort = 5000;
      } else if (scripts['json-server'] || deps['json-server']) {
        hasBackend = true;
        backendCommand = 'npm run json-server';
        backendPort = 3001;
      }

      return {
        projectType,
        installCommand: 'npm install',
        startCommand,
        port,
        needsInstall: true,
        notes: 'Fast detected',
        hasBackend,
        backendCommand,
        backendPort,
        fastDetected: true
      };
    }
  } catch (err) {
    // No package.json or parse error - check for static site
  }

  // Check for static HTML site
  const indexHtmlPath = path.join(repoPath, 'index.html');
  try {
    await fs.access(indexHtmlPath);
    console.log('⚡ Fast detection: Static HTML site');
    return {
      projectType: 'Static HTML',
      installCommand: null,
      startCommand: `node ${path.join(__dirname, 'static-server.js')} 8000 .`,
      port: 8000,
      needsInstall: false,
      notes: 'Static HTML site',
      hasBackend: false,
      backendCommand: null,
      backendPort: null,
      fastDetected: true
    };
  } catch (err) {
    // No index.html in root
  }

  // Check for Python projects
  const requirementsPath = path.join(repoPath, 'requirements.txt');
  const pyprojectPath = path.join(repoPath, 'pyproject.toml');

  try {
    await fs.access(requirementsPath);
    const requirements = await fs.readFile(requirementsPath, 'utf-8');

    if (requirements.includes('django')) {
      console.log('⚡ Fast detection: Django');
      return {
        projectType: 'Django',
        installCommand: 'pip3 install -r requirements.txt',
        startCommand: 'python3 manage.py runserver 0.0.0.0:8000',
        port: 8000,
        needsInstall: true,
        notes: 'Django project',
        hasBackend: false,
        fastDetected: true
      };
    } else if (requirements.includes('flask')) {
      console.log('⚡ Fast detection: Flask');
      return {
        projectType: 'Flask',
        installCommand: 'pip3 install -r requirements.txt',
        startCommand: 'python3 -m flask run --host=0.0.0.0 --port=5000',
        port: 5000,
        needsInstall: true,
        notes: 'Flask project',
        hasBackend: false,
        fastDetected: true
      };
    } else if (requirements.includes('fastapi')) {
      console.log('⚡ Fast detection: FastAPI');
      return {
        projectType: 'FastAPI',
        installCommand: 'pip3 install -r requirements.txt',
        startCommand: 'python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload',
        port: 8000,
        needsInstall: true,
        notes: 'FastAPI project',
        hasBackend: false,
        fastDetected: true
      };
    }
  } catch (err) {
    // No requirements.txt
  }

  // Check for Ruby on Rails (Gemfile)
  const gemfilePath = path.join(repoPath, 'Gemfile');
  try {
    await fs.access(gemfilePath);
    const gemfile = await fs.readFile(gemfilePath, 'utf-8');

    if (gemfile.includes('rails')) {
      console.log('⚡ Fast detection: Ruby on Rails');
      return {
        projectType: 'Ruby on Rails',
        installCommand: 'bundle install',
        startCommand: 'rails server -b 0.0.0.0 -p 3000',
        port: 3000,
        needsInstall: true,
        notes: 'Ruby on Rails project',
        hasBackend: false,
        fastDetected: true
      };
    } else if (gemfile.includes('sinatra')) {
      console.log('⚡ Fast detection: Sinatra');
      return {
        projectType: 'Sinatra',
        installCommand: 'bundle install',
        startCommand: 'ruby app.rb -o 0.0.0.0 -p 4567',
        port: 4567,
        needsInstall: true,
        notes: 'Sinatra project',
        hasBackend: false,
        fastDetected: true
      };
    }
  } catch (err) {
    // No Gemfile
  }

  // Check for Laravel (PHP - composer.json)
  const composerPath = path.join(repoPath, 'composer.json');
  try {
    await fs.access(composerPath);
    const composerJson = JSON.parse(await fs.readFile(composerPath, 'utf-8'));
    const phpDeps = { ...composerJson.require, ...composerJson['require-dev'] };

    if (phpDeps['laravel/framework']) {
      console.log('⚡ Fast detection: Laravel');
      return {
        projectType: 'Laravel',
        installCommand: 'composer install && php artisan key:generate --force',
        startCommand: 'php artisan serve --host=0.0.0.0 --port=8000',
        port: 8000,
        needsInstall: true,
        notes: 'Laravel PHP project',
        hasBackend: false,
        fastDetected: true
      };
    } else if (phpDeps['symfony/framework-bundle'] || phpDeps['symfony/symfony']) {
      console.log('⚡ Fast detection: Symfony');
      return {
        projectType: 'Symfony',
        installCommand: 'composer install',
        startCommand: 'php -S 0.0.0.0:8000 -t public/',
        port: 8000,
        needsInstall: true,
        notes: 'Symfony PHP project',
        hasBackend: false,
        fastDetected: true
      };
    }
  } catch (err) {
    // No composer.json
  }

  // Check for Spring Boot (Java/Kotlin - pom.xml or build.gradle)
  const pomPath = path.join(repoPath, 'pom.xml');
  const gradlePath = path.join(repoPath, 'build.gradle');
  const gradleKtsPath = path.join(repoPath, 'build.gradle.kts');

  try {
    // Check Maven (pom.xml)
    await fs.access(pomPath);
    const pomXml = await fs.readFile(pomPath, 'utf-8');

    if (pomXml.includes('spring-boot')) {
      console.log('⚡ Fast detection: Spring Boot (Maven)');
      return {
        projectType: 'Spring Boot',
        installCommand: './mvnw dependency:resolve || mvn dependency:resolve',
        startCommand: './mvnw spring-boot:run -Dspring-boot.run.arguments="--server.address=0.0.0.0 --server.port=8080" || mvn spring-boot:run -Dspring-boot.run.arguments="--server.address=0.0.0.0 --server.port=8080"',
        port: 8080,
        needsInstall: true,
        notes: 'Spring Boot project (Maven)',
        hasBackend: false,
        fastDetected: true
      };
    }
  } catch (err) {
    // No pom.xml
  }

  try {
    // Check Gradle (build.gradle or build.gradle.kts)
    let gradleFile = null;
    try {
      await fs.access(gradlePath);
      gradleFile = await fs.readFile(gradlePath, 'utf-8');
    } catch {
      try {
        await fs.access(gradleKtsPath);
        gradleFile = await fs.readFile(gradleKtsPath, 'utf-8');
      } catch {
        // Neither exists
      }
    }

    if (gradleFile) {
      if (gradleFile.includes('spring-boot') || gradleFile.includes('org.springframework.boot')) {
        console.log('⚡ Fast detection: Spring Boot (Gradle)');
        return {
          projectType: 'Spring Boot',
          installCommand: './gradlew build --no-daemon || gradle build',
          startCommand: './gradlew bootRun --args="--server.address=0.0.0.0 --server.port=8080" || gradle bootRun --args="--server.address=0.0.0.0 --server.port=8080"',
          port: 8080,
          needsInstall: true,
          notes: 'Spring Boot project (Gradle)',
          hasBackend: false,
          fastDetected: true
        };
      } else if (gradleFile.includes('io.ktor') || gradleFile.includes('ktor-server')) {
        console.log('⚡ Fast detection: Ktor');
        return {
          projectType: 'Ktor',
          installCommand: './gradlew build --no-daemon || gradle build',
          startCommand: './gradlew run || gradle run',
          port: 8080,
          needsInstall: true,
          notes: 'Ktor Kotlin project',
          hasBackend: false,
          fastDetected: true
        };
      }
    }
  } catch (err) {
    // Gradle check failed
  }

  // Could not fast detect - need AI
  return null;
}

/**
 * Call Gemini AI API (optimized for project analysis)
 */
async function callGeminiAI(prompt, options = {}) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    console.log('⚠️ GEMINI_API_KEY not set, falling back to Groq');
    return null; // Will fallback to Groq
  }

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
          responseMimeType: options.json ? 'application/json' : 'text/plain'
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text;
  } catch (error) {
    console.error('Gemini API error:', error.response?.data || error.message);
    return null; // Will fallback to Groq
  }
}

/**
 * OPTIMIZED: Single AI call to analyze project (replaces 2 separate calls)
 */
async function aiAnalyzeProjectOptimized(repoPath) {
  // Only read essential files - no need for AI to select them
  const essentialFiles = [
    'package.json',
    'vite.config.js', 'vite.config.ts',
    'next.config.js', 'next.config.mjs',
    'nuxt.config.js', 'nuxt.config.ts',
    'angular.json',
    'svelte.config.js',
    'astro.config.mjs',
    'requirements.txt',
    'pyproject.toml',
    'Cargo.toml',
    'go.mod',
    'Makefile',
    'Dockerfile',
    'Gruntfile.js',  // Grunt-based projects
    'Gulpfile.js',   // Gulp-based projects
    'bower.json',    // Bower dependencies
    'Gemfile',       // Ruby projects
    'composer.json', // PHP projects (Laravel, Symfony)
    'pom.xml',       // Maven/Java/Kotlin projects
    'build.gradle',  // Gradle/Java/Kotlin projects
    'build.gradle.kts', // Gradle Kotlin DSL
    'README.md'
  ];

  // Read only files that exist (max 2000 chars each to save tokens)
  const fileContents = {};
  for (const file of essentialFiles) {
    try {
      const content = await fs.readFile(path.join(repoPath, file), 'utf-8');
      fileContents[file] = content.substring(0, 2000);
    } catch (err) {
      // File doesn't exist, skip
    }
  }

  if (Object.keys(fileContents).length === 0) {
    return null; // No recognizable project files
  }

  // Get minimal tree (only first level + key subdirs)
  const entries = await fs.readdir(repoPath, { withFileTypes: true });
  const tree = entries
    .filter(e => !['node_modules', '.git', 'dist', 'build', '.next'].includes(e.name))
    .slice(0, 30)
    .map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`)
    .join('\n');

  const filesText = Object.entries(fileContents)
    .map(([name, content]) => `=== ${name} ===\n${content}`)
    .join('\n\n');

  const prompt = `Analyze this project and return ONLY valid JSON:

Project files:
${tree}

File contents:
${filesText}

Return JSON:
{"projectType":"string","installCommand":"npm install or null","startCommand":"command to start dev server","port":3000,"needsInstall":true,"hasBackend":false,"backendCommand":null,"backendPort":null}

Rules:
- Use npm (not yarn/pnpm)
- For Vite: port 5173, "npm run dev"
- For Next.js: port 3000, "npm run dev"
- For static HTML: port 8000, use static server
- For Expo: "npx expo start --web --port 8081"
- For Grunt: "grunt server" or check Gruntfile.js for server task, typically port 8888
- For Gulp: check gulpfile.js for serve/server task
- For older AngularJS: might need "grunt server" and port 8888`;

  // Use Gemini only
  const response = await callGeminiAI(prompt, { json: true });

  if (!response) {
    console.error('❌ Gemini AI failed - check GEMINI_API_KEY');
    return null;
  }

  try {
    return JSON.parse(response);
  } catch (err) {
    console.error('Failed to parse AI response:', response);
    return null;
  }
}

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
 * Basic project detection fallback (when GROQ_API_KEY not available)
 * Uses projectDetector.js instead of AI
 */
async function basicDetectCommands(repoPath) {
  const { detectProjectType } = require('./projectDetector');
  const fsSync = require('fs');

  // Get file list
  const entries = await fs.readdir(repoPath, { withFileTypes: true });
  const files = entries.map(e => e.name);

  // Read package.json if present
  let packageJson = null;
  const packageJsonPath = path.join(repoPath, 'package.json');
  if (fsSync.existsSync(packageJsonPath)) {
    try {
      packageJson = JSON.parse(fsSync.readFileSync(packageJsonPath, 'utf-8'));
    } catch (e) {
      console.log('⚠️ Could not parse package.json');
    }
  }

  // Use projectDetector
  const detected = detectProjectType(files, packageJson);

  // Check if this is a static HTML project that wasn't detected
  // (has HTML files but package.json has no runnable scripts)
  const htmlFiles = files.filter(f => f.endsWith('.html'));
  const hasRunnableScripts = packageJson?.scripts?.start ||
    packageJson?.scripts?.dev ||
    packageJson?.scripts?.serve ||
    packageJson?.dependencies?.react ||
    packageJson?.dependencies?.vue ||
    packageJson?.dependencies?.['@angular/core'];

  if (!detected || (!hasRunnableScripts && htmlFiles.length > 0)) {
    // Treat as static HTML site
    const staticServerPath = path.join(__dirname, 'static-server.js');

    return {
      projectType: 'Static HTML Site',
      installCommand: null,
      startCommand: `node "${staticServerPath}" 8000 .`,
      port: 8000,
      needsInstall: false,
      notes: htmlFiles.length > 0 ? `Available HTML files: ${htmlFiles.join(', ')}` : null,
      hasBackend: false,
      backendCommand: null,
      backendPort: null
    };
  }

  if (!detected) {
    // Default fallback for unknown projects
    return {
      projectType: 'unknown',
      installCommand: packageJson ? 'npm install' : null,
      startCommand: packageJson?.scripts?.start ? 'npm start' :
        packageJson?.scripts?.dev ? 'npm run dev' : null,
      port: 3000,
      needsInstall: !!packageJson,
      notes: 'Could not auto-detect project type',
      hasBackend: false,
      backendCommand: null,
      backendPort: null
    };
  }

  // Convert projectDetector format to AI format
  return {
    projectType: detected.description || detected.type,
    installCommand: detected.installCommand,
    startCommand: detected.startCommand,
    port: detected.defaultPort || 3000,
    needsInstall: !!detected.installCommand,
    notes: detected.previewNote || null,
    hasBackend: false,
    backendCommand: null,
    backendPort: null
  };
}

/**
 * Check if AI is available (GROQ_API_KEY configured)
 */
function isAIAvailable() {
  return !!process.env.GROQ_API_KEY;
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
          model: options.model || 'openai/gpt-oss-120b',
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

        console.log(`⏳ Rate limit hit (attempt ${attempt + 1}/${maxRetries}), waiting ${waitTime / 1000}s...`);

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
- IMPORTANT for Python: ALWAYS use "python3" and "pip3" (not "python" or "pip") because on macOS python2 is deprecated
- For Flask: ALWAYS use "pip3 install -r requirements.txt" and "python3 -m flask run" (never "python3 app.py" because it doesn't support host binding)
- For Django: use "pip3 install -r requirements.txt" and "python3 manage.py runserver 0.0.0.0:8000"
- For FastAPI: use "pip3 install -r requirements.txt" and "python3 -m uvicorn main:app --host 0.0.0.0 --port 8000"
- For Expo/React Native: use "npx expo start --web --port 8081"
- Default ports: React 3000, Vite 5173, Next.js 3000, Expo 8081, Django 8000, Flask 5000, FastAPI 8000
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

    // ===================================
    // VIBE CODING ARCHITECTURE SWITCH
    // ===================================
    // Instead of cloning locally, we spawn a container on our K8s cluster
    console.log(`\n🚀 [Vibe] Starting Cloud Workstation: ${workstationId}`);

    // 1. Ensure User 
    const coderUser = await coderService.ensureUser('admin@drape.dev', 'admin');

    // 2. Create Workspace (it handles idempotency)
    // Name must be clean (lowercase, alphanumeric, dashes)
    const wsName = workstationId.replace(/[^a-z0-9-]/g, '-').toLowerCase().substring(0, 32);
    console.log(`   Creating Coder workspace: ${wsName}`);

    try {
      const workspace = await coderService.createWorkspace(coderUser.id, wsName, repositoryUrl);
      console.log(`   Workspace active! ID: ${workspace.id}`);

      // 3. Start if stopped
      if (workspace.latest_build.job.status !== 'running') {
        console.log('   Starting workspace...');
        await coderService.startWorkspace(workspace.id);
      }

      // 4. Return connection info immediately
      // In a real Vibe implementation, we would wait for it to be ready
      // But for speed, we return the URL and let the frontend handle the "waiting" state

      // Calculate dynamic URL
      // format: https://<workspace-name>--<username>.coder.drape.dev (if wildcard DNS)
      // MVP: We return the Coder dashboard URL deep link
      const dashboardUrl = `${process.env.CODER_API_URL || 'http://35.193.11.163'}/@${coderUser.username}/${wsName}`;
      const vscodeUrl = `${process.env.CODER_API_URL || 'http://35.193.11.163'}/@${coderUser.username}/${wsName}/apps/vscode`;

      return res.json({
        success: true,
        previewUrl: vscodeUrl, // Direct link to VS Code Web
        port: 80,
        serverReady: true,
        projectType: 'Cloud Container',
        commands: {
          install: 'Done by Coder',
          start: 'Done by Coder'
        },
        timing: {
          totalMs: Date.now() - startTime,
          cached: true
        },
        isCloudWorkstation: true,
        dashboardUrl: dashboardUrl
      });

    } catch (coderError) {
      console.error('❌ Coder provisioning failed:', coderError);
      // Fallback to local? No, let's fail hard to debug
      return res.status(500).json({ success: false, error: coderError.message });
    }


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
 * SSE endpoint to stream server logs for a workstation
 */
app.get('/preview/logs/:workstationId', (req, res) => {
  const { workstationId } = req.params;

  console.log(`📺 SSE logs connection for workstation: ${workstationId}`);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Initialize logs entry if not exists
  if (!serverLogsMap.has(workstationId)) {
    serverLogsMap.set(workstationId, { logs: [], listeners: new Set() });
  }

  const entry = serverLogsMap.get(workstationId);

  // Send existing logs first
  entry.logs.forEach(log => {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  });

  // Add this response to listeners
  entry.listeners.add(res);

  // Cleanup on disconnect
  req.on('close', () => {
    console.log(`📺 SSE logs disconnected for workstation: ${workstationId}`);
    entry.listeners.delete(res);
  });
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
 * Preview Element Inspector - AI-powered element analysis
 * Analyzes selected element from preview and finds responsible file
 */
app.post('/preview/inspect', async (req, res) => {
  const {
    workstationId,
    element,
    message,
    conversationHistory = [],
    selectedModel = 'gemini-2-flash'
  } = req.body;

  console.log('\n🔍 ═══════════════════════════════════════════════════');
  console.log('🔍 PREVIEW INSPECT - Element Analysis Request');
  console.log('🔍 ═══════════════════════════════════════════════════');
  console.log(`📦 Workstation: ${workstationId}`);
  console.log(`🏷️ Element: ${element ? `<${element.tag}> ${element.id ? '#' + element.id : ''} ${element.className || ''}` : '(none - general request)'}`);
  console.log(`💬 User message: ${message || '(none)'}`);

  if (!workstationId) {
    return res.status(400).json({ error: 'workstationId is required' });
  }

  if (!element && !message) {
    return res.status(400).json({ error: 'Either element or message is required' });
  }

  // FORCE OVERRIDE: Switch to Gemini if Claude is requested (temporary fix for credit issue)
  let effectiveModel = selectedModel;
  if (selectedModel.includes('claude')) {
    console.log('⚠️ Claude model requested but credit balance is low. Auto-switching to Gemini.');
    effectiveModel = 'gemini-2-flash';
  }

  // Get model configuration
  const modelConfig = AI_MODELS[effectiveModel] || AI_MODELS['gemini-2-flash'];
  const model = modelConfig.modelId;
  const provider = modelConfig.provider;

  try {
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

    console.log(`📂 Repo path: ${repoPath}`);

    // Build search terms from element (if provided)
    const searchTerms = [];
    if (element) {
      if (element.id) searchTerms.push(element.id);
      if (element.className) {
        const classes = element.className.split(' ').filter(c => c && !c.startsWith('__'));
        searchTerms.push(...classes.slice(0, 3));
      }
      if (element.text) {
        // Extract meaningful words from text (for i18n keys or hardcoded strings)
        const words = element.text.split(/\s+/).filter(w => w.length > 3).slice(0, 3);
        searchTerms.push(...words);
      }
    }

    console.log(`🔎 Search terms: ${searchTerms.length > 0 ? searchTerms.join(', ') : '(none - general request)'}`);

    // Search for files that might contain this element
    let relevantFiles = [];

    // Use grep to find files containing these terms (search ALL file types)
    for (const term of searchTerms.slice(0, 5)) {
      try {
        // Search in all files, excluding common binary/generated directories and files
        const { stdout } = await execPromise(
          `grep -rl "${term}" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build --exclude-dir=.next --exclude-dir=.nuxt --exclude-dir=coverage --exclude-dir=__pycache__ --exclude="*.min.js" --exclude="*.min.css" --exclude="*.map" --exclude="*.lock" --exclude="package-lock.json" . 2>/dev/null | head -15`,
          { cwd: repoPath, timeout: 5000 }
        );
        const files = stdout.trim().split('\n').filter(f => f);
        relevantFiles.push(...files);
      } catch (err) {
        // grep returns error if no matches, that's ok
      }
    }

    // Deduplicate and limit
    relevantFiles = [...new Set(relevantFiles)].slice(0, 10);
    console.log(`📄 Relevant files found: ${relevantFiles.length}`);

    // Read content of most relevant files
    const fileContents = [];
    for (const file of relevantFiles.slice(0, 5)) {
      try {
        const filePath = path.join(repoPath, file.replace(/^\.\//, ''));
        const content = await fs.readFile(filePath, 'utf8');
        // Truncate large files
        const truncatedContent = content.length > 3000
          ? content.substring(0, 3000) + '\n... (truncated)'
          : content;
        fileContents.push({ path: file, content: truncatedContent });
      } catch (err) {
        console.log(`⚠️ Could not read ${file}: ${err.message}`);
      }
    }

    // Build AI prompt
    const elementDescription = element ? `
ELEMENTO SELEZIONATO NELLA PREVIEW:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tag: <${element.tag}>
ID: ${element.id || '(nessuno)'}
Classi: ${element.className || '(nessuna)'}
Testo: "${element.text || '(vuoto)'}"
HTML interno (primi 200 char): ${element.innerHTML?.substring(0, 200) || '(vuoto)'}
` : '';

    const filesContext = fileContents.length > 0
      ? `\n\nFILE POTENZIALMENTE CORRELATI:\n${fileContents.map(f => `\n━━━ ${f.path} ━━━\n${f.content}`).join('\n\n')}`
      : '\n\nNessun file pre-caricato. Usa i tool per esplorare il codebase se necessario.';

    const userRequest = message
      ? `\n\nRICHIESTA UTENTE: "${message}"`
      : '\n\nL\'utente vuole modificare questo elemento. Analizza e proponi come procedere.';

    const systemPrompt = `Sei un assistente AI specializzato nella modifica di codice UI.

L'utente sta usando un IDE mobile${element ? ' e ha selezionato un elemento nella preview della sua app' : ' e vuole modificare il progetto'}.
Il tuo compito è:
1. ${element ? 'Identificare il file responsabile di questo elemento' : 'Capire cosa l\'utente vuole modificare'}
2. ESEGUIRE LE MODIFICHE richieste usando i tool disponibili
3. Confermare le modifiche effettuate

IMPORTANTE - HAI ACCESSO AI TOOL! USA SEMPRE edit_file PER MODIFICARE I FILE!

WORKFLOW OBBLIGATORIO:
1. ${element ? 'Se i file forniti contengono l\'elemento, usa edit_file per modificarlo' : 'Usa glob_files o search_in_files per trovare i file da modificare'}
2. Se non trovi il file, usa glob_files o search_in_files per cercarlo
3. Dopo aver trovato il file, usa read_file per leggerlo
4. Usa edit_file per applicare la modifica
5. Conferma la modifica effettuata

REGOLE:
- Rispondi in italiano, breve e pratico
- USA I TOOL per fare le modifiche, non solo suggerirle!
- Dopo ogni tool call, scrivi 1 riga di commento
- Usa formattazione mobile-friendly

${elementDescription}
${filesContext}
${userRequest}

ESEGUI la modifica richiesta usando i tool!`;

    // Define tools for preview inspect (same as /ai/chat)
    const inspectTools = [
      {
        name: 'read_file',
        description: 'Leggi il contenuto di un file nel progetto',
        input_schema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Il path del file da leggere' }
          },
          required: ['filePath']
        }
      },
      {
        name: 'edit_file',
        description: 'Modifica un file esistente con search & replace',
        input_schema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Il path del file da modificare' },
            oldString: { type: 'string', description: 'Il testo esatto da cercare e sostituire' },
            newString: { type: 'string', description: 'Il nuovo testo con cui sostituire' }
          },
          required: ['filePath', 'oldString', 'newString']
        }
      },
      {
        name: 'glob_files',
        description: 'Cerca file usando pattern glob',
        input_schema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Il pattern glob (es: "**/*.html")' }
          },
          required: ['pattern']
        }
      },
      {
        name: 'search_in_files',
        description: 'Cerca un pattern di testo nei file del progetto',
        input_schema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Il pattern di testo da cercare' }
          },
          required: ['pattern']
        }
      }
    ];

    // Helper function to execute tool calls for inspect
    async function executeInspectTool(name, args, projectPath) {
      const { promisify } = require('util');
      const { exec } = require('child_process');
      const execPromise = promisify(exec);
      const glob = require('glob');

      try {
        switch (name) {
          case 'read_file':
            const filePath = path.join(projectPath, args.filePath.replace(/^\.\//, ''));
            const content = await fs.readFile(filePath, 'utf8');
            return content.length > 5000 ? content.substring(0, 5000) + '\n... (truncated)' : content;

          case 'edit_file':
            const editPath = path.join(projectPath, args.filePath.replace(/^\.\//, ''));
            let fileContent = await fs.readFile(editPath, 'utf8');

            // Normalize line endings for both file content and search strings
            const normalizeLineEndings = (str) => str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const normalizedFileContent = normalizeLineEndings(fileContent);
            const normalizedOldString = normalizeLineEndings(args.oldString);
            const normalizedNewString = normalizeLineEndings(args.newString);

            // Try exact match first
            if (normalizedFileContent.includes(normalizedOldString)) {
              const newContent = normalizedFileContent.replace(normalizedOldString, normalizedNewString);
              await fs.writeFile(editPath, newContent, 'utf8');
              console.log(`✅ edit_file success: ${args.filePath}`);
              return `✅ File ${args.filePath} modificato con successo!`;
            }

            // Try trimmed match (in case of leading/trailing whitespace differences)
            const trimmedOldString = normalizedOldString.trim();
            if (trimmedOldString.length > 10 && normalizedFileContent.includes(trimmedOldString)) {
              const newContent = normalizedFileContent.replace(trimmedOldString, normalizedNewString.trim());
              await fs.writeFile(editPath, newContent, 'utf8');
              console.log(`✅ edit_file success (trimmed): ${args.filePath}`);
              return `✅ File ${args.filePath} modificato con successo!`;
            }

            // Try matching with collapsed whitespace
            const collapseWhitespace = (str) => str.replace(/\s+/g, ' ');
            const collapsedFile = collapseWhitespace(normalizedFileContent);
            const collapsedOld = collapseWhitespace(normalizedOldString);

            if (collapsedOld.length > 20 && collapsedFile.includes(collapsedOld)) {
              // Find the actual position in the original file
              // This is a simplified approach - replace the first occurrence that matches when whitespace is collapsed
              const lines = normalizedFileContent.split('\n');
              let found = false;
              let newLines = [];

              for (let i = 0; i < lines.length && !found; i++) {
                const lineCollapsed = collapseWhitespace(lines[i]);
                const oldFirstLine = collapsedOld.split(' ')[0];
                if (lineCollapsed.includes(oldFirstLine)) {
                  // Found a potential match, try to replace from here
                  const remainingContent = lines.slice(i).join('\n');
                  if (collapseWhitespace(remainingContent).startsWith(collapsedOld.substring(0, 100))) {
                    // Good enough match, do the replacement
                    const newContent = normalizedFileContent.replace(
                      new RegExp(normalizedOldString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 's'),
                      normalizedNewString
                    );
                    if (newContent !== normalizedFileContent) {
                      await fs.writeFile(editPath, newContent, 'utf8');
                      console.log(`✅ edit_file success (whitespace-tolerant): ${args.filePath}`);
                      return `✅ File ${args.filePath} modificato con successo!`;
                    }
                  }
                }
              }
            }

            console.log(`❌ edit_file failed: string not found in ${args.filePath}`);
            console.log(`   Looking for (first 100 chars): ${normalizedOldString.substring(0, 100)}`);
            return `❌ Errore: Il testo non è stato trovato nel file. Il file potrebbe essere stato modificato.`;

          case 'glob_files':
            const files = await glob(args.pattern, { cwd: projectPath, nodir: true, ignore: ['node_modules/**', '.git/**'] });
            return `Trovati ${files.length} file:\n${files.slice(0, 20).join('\n')}${files.length > 20 ? '\n...(altri)' : ''}`;

          case 'search_in_files':
            const { stdout } = await execPromise(
              `grep -rn "${args.pattern.replace(/"/g, '\\"')}" --exclude-dir=node_modules --exclude-dir=.git . 2>/dev/null | head -20`,
              { cwd: projectPath, timeout: 5000 }
            );
            return stdout || 'Nessun risultato trovato';

          default:
            return `Tool sconosciuto: ${name}`;
        }
      } catch (error) {
        console.log(`❌ Tool ${name} error:`, error.message);
        return `Errore ${name}: ${error.message}`;
      }
    }

    // Set up SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Main loop with tool support (like /ai/chat)
    let currentMessages = [{ role: 'user', content: systemPrompt }];
    let continueLoop = true;
    let loopCount = 0;
    const MAX_LOOPS = 10;

    while (continueLoop && loopCount < MAX_LOOPS) {
      loopCount++;

      if (provider === 'anthropic') {
        const response = await anthropic.messages.create({
          model: model,
          max_tokens: 2000,
          tools: inspectTools,
          messages: currentMessages,
          stream: true
        });

        let textBuffer = '';
        let toolUseBlocks = [];
        let currentToolUse = null;
        let stopReason = null;

        // Process streaming response
        for await (const event of response) {
          if (event.type === 'content_block_start') {
            if (event.content_block?.type === 'tool_use') {
              currentToolUse = {
                id: event.content_block.id,
                name: event.content_block.name,
                input: ''
              };
              // Send tool start event
              res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: event.content_block.name })}\n\n`);
            }
          } else if (event.type === 'content_block_delta') {
            if (event.delta?.type === 'text_delta') {
              textBuffer += event.delta.text;
              res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
            } else if (event.delta?.type === 'input_json_delta' && currentToolUse) {
              currentToolUse.input += event.delta.partial_json;
            }
          } else if (event.type === 'content_block_stop') {
            if (currentToolUse) {
              try {
                currentToolUse.input = JSON.parse(currentToolUse.input);
              } catch (e) {
                currentToolUse.input = {};
              }
              // Send tool_input event with parsed parameters (including filePath)
              res.write(`data: ${JSON.stringify({
                type: 'tool_input',
                tool: currentToolUse.name,
                input: currentToolUse.input
              })}\n\n`);
              toolUseBlocks.push(currentToolUse);
              currentToolUse = null;
            }
          } else if (event.type === 'message_delta') {
            stopReason = event.delta?.stop_reason;
          }
        }

        // If we have tool calls, execute them
        if (toolUseBlocks.length > 0 && stopReason === 'tool_use') {
          // Build assistant message with tool uses
          const assistantContent = [];
          if (textBuffer) {
            assistantContent.push({ type: 'text', text: textBuffer });
          }
          for (const tu of toolUseBlocks) {
            assistantContent.push({
              type: 'tool_use',
              id: tu.id,
              name: tu.name,
              input: tu.input
            });
          }
          currentMessages.push({ role: 'assistant', content: assistantContent });

          // Execute tools and build results
          const toolResults = [];
          for (const tu of toolUseBlocks) {
            console.log(`🔧 Executing tool: ${tu.name}`, JSON.stringify(tu.input).substring(0, 200));
            const result = await executeInspectTool(tu.name, tu.input, repoPath);

            // Determine success based on result content
            const isSuccess = result.startsWith('✅') ||
              result.startsWith('Trovati') ||
              (result.length > 0 && !result.startsWith('❌') && !result.startsWith('Errore'));

            // Send tool result event
            res.write(`data: ${JSON.stringify({ type: 'tool_result', tool: tu.name, success: isSuccess })}\n\n`);
            console.log(`   Result: ${isSuccess ? '✅' : '❌'} ${result.substring(0, 100)}`);

            toolResults.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: result
            });
          }

          currentMessages.push({ role: 'user', content: toolResults });
          // Continue loop to get AI's response to tool results
        } else {
          // No more tool calls, we're done
          continueLoop = false;
        }
      } else if (provider === 'gemini' || provider === 'google') {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) {
          console.error('❌ GEMINI_API_KEY missing');
          res.write(`data: ${JSON.stringify({ text: "Error: GEMINI_API_KEY is not configured." })}\n\n`);
          continueLoop = false;
          break;
        }

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

        // Map tools to Gemini format
        const geminiTools = {
          functionDeclarations: inspectTools.map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.input_schema
          }))
        };

        const geminiModel = genAI.getGenerativeModel({
          model: model,
          systemInstruction: systemPrompt,
          tools: [geminiTools]
        });

        // Build history from currentMessages
        let chatHistory = [];
        let lastUserMessage = "";

        // Skip index 0 (system prompt)
        for (let i = 1; i < currentMessages.length; i++) {
          const msg = currentMessages[i];
          const isLast = i === currentMessages.length - 1;

          if (msg.role === 'user') {
            if (isLast) {
              // This is the message we want to send now
              if (Array.isArray(msg.content)) {
                // It's a tool result batch
                // We need to construct functionResponses
                const toolResults = msg.content.filter(c => c.type === 'tool_result');
                const parts = toolResults.map(tr => ({
                  functionResponse: {
                    name: tr.tool || 'unknown_tool', // We need to find the name
                    response: { result: tr.content }
                  }
                }));

                // If there are tool results, this determines the content to send
                if (parts.length > 0) {
                  // For the current turn, we use these parts
                  // BUT sendMessage accepts parts or string.
                  lastUserMessage = parts;
                } else {
                  lastUserMessage = "Proceed"; // Fallback
                }
              } else {
                lastUserMessage = msg.content;
              }
            } else {
              // History item
              if (Array.isArray(msg.content)) {
                // Tool result in history
                const toolResults = msg.content.filter(c => c.type === 'tool_result');
                const parts = toolResults.map(tr => ({
                  functionResponse: {
                    name: tr.tool || 'unknown_tool',
                    response: { result: tr.content }
                  }
                }));
                if (parts.length > 0) {
                  chatHistory.push({ role: 'function', parts });
                }
              } else {
                chatHistory.push({ role: 'user', parts: [{ text: msg.content }] });
              }
            }
          } else if (msg.role === 'assistant') {
            // History item (Model)
            const parts = [];
            if (Array.isArray(msg.content)) {
              const text = msg.content.find(c => c.type === 'text');
              if (text) parts.push({ text: text.text });

              const toolUses = msg.content.filter(c => c.type === 'tool_use');
              toolUses.forEach(tu => {
                parts.push({
                  functionCall: {
                    name: tu.name,
                    args: tu.input
                  }
                });
              });
            } else {
              parts.push({ text: msg.content });
            }
            chatHistory.push({ role: 'model', parts });
          }
        }
      }

      // Gemini strict requirement: First message in history MUST be 'user' (role: 'user')
      // And roles must alternate: user -> model -> user -> model

      // 1. Ensure alternation by merging consecutive same-role messages
      const mergedHistory = [];
      if (chatHistory.length > 0) {
        let currentMsg = chatHistory[0];

        for (let i = 1; i < chatHistory.length; i++) {
          const nextMsg = chatHistory[i];
          if (currentMsg.role === nextMsg.role) {
            // Merge parts
            currentMsg.parts = [...currentMsg.parts, ...nextMsg.parts];
          } else {
            mergedHistory.push(currentMsg);
            currentMsg = nextMsg;
          }
        }
        mergedHistory.push(currentMsg);
      }

      // 2. Ensure first message is 'user'
      // If first is 'model' or 'function', we must prepend a dummy user message or merge it
      if (mergedHistory.length > 0 && mergedHistory[0].role !== 'user') {
        // In Gemini, 'function' role IS a user-turn effectively (it replies to a model call), but 
        // startChat history must start with user.
        // If the history starts with model, we prepend a user message.
        mergedHistory.unshift({ role: 'user', parts: [{ text: "Context:" }] });
      }

      chatHistory = mergedHistory;

      // If it's the very first message after system prompt
      if (chatHistory.length === 0 && !lastUserMessage && currentMessages.length > 1) {
        // Should not happen if loop logic is correct
      }
      if (!lastUserMessage) lastUserMessage = "Inizia l'analisi.";

      try {
        const chat = geminiModel.startChat({ history: chatHistory });
        const result = await chat.sendMessageStream(lastUserMessage);

        let fullText = '';
        let toolCalls = [];

        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            fullText += text;
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
          }

          // Check for function calls
          const calls = chunk.functionCalls();
          if (calls && calls.length > 0) {
            calls.forEach(call => {
              toolCalls.push({
                id: `call_${Math.random().toString(36).substr(2, 9)}`,
                name: call.name,
                input: call.args
              });
            });
          }
        }

        if (toolCalls.length > 0) {
          // Gemini doesn't stream function calls incrementally usually, it gives them at the end or in a chunk
          // We need to trigger the loop execution

          // Add assistant message to history logic (Anthropic format compatible)
          const assistantContent = [];
          if (fullText) assistantContent.push({ type: 'text', text: fullText });

          for (const tc of toolCalls) {
            assistantContent.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name, // Gemini provides name
              input: tc.input // Gemini provides parsed args
            });

            // Notify frontend
            res.write(`data: ${JSON.stringify({
              type: 'tool_input',
              tool: tc.name,
              input: tc.input
            })}\n\n`);
          }

          currentMessages.push({ role: 'assistant', content: assistantContent });

          // Execution
          const toolResults = [];
          for (const tc of toolCalls) {
            console.log(`🔧 Gemini Executing: ${tc.name}`);
            const result = await executeInspectTool(tc.name, tc.input, repoPath);

            const isSuccess = !result.startsWith('❌') && !result.startsWith('Errore');
            res.write(`data: ${JSON.stringify({ type: 'tool_result', tool: tc.name, success: isSuccess })}\n\n`);

            toolResults.push({
              type: 'tool_result',
              tool_use_id: tc.id,
              tool: tc.name, // Important for Gemini mapping next turn
              content: result
            });
          }

          currentMessages.push({ role: 'user', content: toolResults });
          // Continue loop
        } else {
          continueLoop = false;
        }

      } catch (error) {
        console.error('❌ Gemini Error:', error);
        res.write(`data: ${JSON.stringify({ text: `\n❌ Error: ${error.message}` })}\n\n`);
        continueLoop = false;
      }

    } // End of Gemini provider block

    if (false) { // Disabled Groq fallback block

      // ==========================================
      // GROQ PROVIDER IMPLEMENTATION
      // ==========================================
      const GROQ_API_KEY = process.env.GROQ_API_KEY;
      if (!GROQ_API_KEY) {
        console.error('❌ GROQ_API_KEY missing');
        res.write(`data: ${JSON.stringify({ text: "Error: GROQ_API_KEY is not configured on the server." })}\n\n`);
        continueLoop = false;
        // break; (Removed illegal break)
      }

      const axios = require('axios');

      // Map tools to OpenAI format
      const groqTools = inspectTools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema
        }
      }));

      // Convert messages to OpenAI format (handling Anthropic -> OpenAI conversion)
      const apiMessages = [
        { role: 'system', content: systemPrompt }
      ];

      // Process history (skipping the first "user" message which was system prompt in Anthropic flow)
      for (let i = 1; i < currentMessages.length; i++) {
        const m = currentMessages[i];

        if (m.role === 'user') {
          if (Array.isArray(m.content)) {
            // Check for tool results
            const results = m.content.filter(c => c.type === 'tool_result');
            if (results.length > 0) {
              for (const res of results) {
                apiMessages.push({
                  role: 'tool',
                  tool_call_id: res.tool_use_id,
                  content: res.content
                });
              }
              continue;
            }
            // Normal content
            const text = m.content.find(c => c.type === 'text')?.text;
            if (text) apiMessages.push({ role: 'user', content: text });
          } else {
            apiMessages.push({ role: 'user', content: m.content });
          }
        }
        else if (m.role === 'assistant') {
          if (Array.isArray(m.content)) {
            const toolUses = m.content.filter(c => c.type === 'tool_use');
            const text = m.content.find(c => c.type === 'text')?.text || null;

            apiMessages.push({
              role: 'assistant',
              content: text,
              tool_calls: toolUses.map(tu => ({
                id: tu.id,
                type: 'function',
                function: { name: tu.name, arguments: JSON.stringify(tu.input) }
              }))
            });
          } else {
            apiMessages.push({ role: 'assistant', content: m.content });
          }
        }
      }

      try {
        const response = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: model,
            messages: apiMessages,
            tools: groqTools,
            tool_choice: 'auto',
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
        let toolCallsMap = {};

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

              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  if (tc.index !== undefined) {
                    if (!toolCallsMap[tc.index]) {
                      toolCallsMap[tc.index] = { id: tc.id, name: '', arguments: '' };
                    }
                    if (tc.function?.name) toolCallsMap[tc.index].name = tc.function.name;
                    if (tc.id) toolCallsMap[tc.index].id = tc.id;
                    if (tc.function?.arguments) toolCallsMap[tc.index].arguments += tc.function.arguments;
                  }
                }
              }
            } catch (e) { }
          }
        }

        const toolCalls = Object.values(toolCallsMap);

        if (toolCalls.length > 0) {
          // Add assistant message to history (Anthropic format for consistency)
          const assistantContent = [];
          if (fullResponse) assistantContent.push({ type: 'text', text: fullResponse });

          for (const tc of toolCalls) {
            let args = {};
            try { args = JSON.parse(tc.arguments); } catch (e) { }

            assistantContent.push({
              type: 'tool_use',
              id: tc.id || `call_${Math.random().toString(36).substr(2, 9)}`,
              name: tc.name,
              input: args
            });

            res.write(`data: ${JSON.stringify({
              type: 'tool_input',
              tool: tc.name,
              input: args
            })}\n\n`);
          }

          currentMessages.push({ role: 'assistant', content: assistantContent });

          // Execute tools
          const toolResults = [];
          for (const tc of toolCalls) {
            let args = {};
            try { args = JSON.parse(tc.arguments); } catch (e) { }

            console.log(`🔧 Groq Executing: ${tc.name}`);
            const result = await executeInspectTool(tc.name, args, repoPath);

            const isSuccess = !result.startsWith('❌') && !result.startsWith('Errore');
            res.write(`data: ${JSON.stringify({ type: 'tool_result', tool: tc.name, success: isSuccess })}\n\n`);

            toolResults.push({
              type: 'tool_result',
              tool_use_id: tc.id || assistantContent.find(c => c.name === tc.name).id,
              content: result
            });
          }

          currentMessages.push({ role: 'user', content: toolResults });
          // Loop continues
        } else {
          continueLoop = false;
        }

      } catch (error) {
        console.error('❌ Groq API error:', error.response?.data || error.message);
        res.write(`data: ${JSON.stringify({ text: `\n❌ Error: ${error.message}` })}\n\n`);
        continueLoop = false;
      }

    } else {
      // For non-Anthropic providers, use simple streaming without tools
      if (provider === 'google') {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const geminiModel = genAI.getGenerativeModel({ model: model });

        try {
          const result = await geminiModel.generateContentStream(systemPrompt);
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              res.write(`data: ${JSON.stringify({ text })}\n\n`);
            }
          }
        } catch (e) {
          console.error('Gemini error:', e);
          res.write(`data: ${JSON.stringify({ text: "Error generating content with Gemini" })}\n\n`);
        }
      }
      continueLoop = false;
    }

    // End of stream
    if (res.writable) {
      res.write('data: [DONE]\n\n');
      res.end();
    }

  } catch (error) {
    console.error('❌ Preview inspect error:', error);
    // Only send error if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      // If streaming already started, send error via SSE
      res.write(`data: ${JSON.stringify({ text: `\n❌ Critical Error: ${error.message}` })}\n\n`);
      res.end();
    }
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
// ==========================================
// CLOUD WORKSTATION ROUTES (CODER V2)
// For cost-optimized infrastructure
// ==========================================

app.get('/api/workstations/list', async (req, res) => {
  try {
    const userId = req.query.userId || 'admin';
    // In a real app, you would list workspaces for the authenticated user
    const workspaces = await coderService.client.get('/api/v2/workspaces', { params: { q: 'owner:me' } });
    res.json(workspaces.data);
  } catch (error) {
    console.error('Workstation list error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/workstations/create', async (req, res) => {
  try {
    const { userId, name, repoUrl } = req.body;
    // Ensure user exists in Coder
    const coderUser = await coderService.ensureUser(`${userId}@drape.dev`, userId);

    // Create workspace
    const workspace = await coderService.createWorkspace(coderUser.id, name, repoUrl);
    res.json(workspace);
  } catch (error) {
    console.error('Workstation create error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/workstations/start', async (req, res) => {
  try {
    const { workspaceId } = req.body;
    const result = await coderService.startWorkspace(workspaceId);
    res.json(result);
  } catch (error) {
    console.error('Workstation start error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server, path: '/ws' });
wssInstance = wss; // Enable log broadcasting

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

