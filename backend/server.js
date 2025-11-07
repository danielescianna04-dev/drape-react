const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();
const { VertexAI } = require('@google-cloud/vertexai');
const { GoogleAuth } = require('google-auth-library');
const admin = require('firebase-admin');

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

// Import Gemini SDK
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// AI Chat endpoint - Using Gemini 2.0 Flash with native tool calling
app.post('/ai/chat', async (req, res) => {
    const { prompt, conversationHistory = [], workstationId, context, projectId, repositoryUrl } = req.body;
    // Use Gemini 2.5 Flash (latest and most powerful version)
    const model = 'gemini-2.5-flash';

    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    try {
        // Build system message with project context and tool capabilities
        let systemMessage = `Sei un assistente AI esperto di programmazione.

IMPORTANTE: Rispondi SEMPRE in italiano corretto e fluente. Usa grammatica italiana perfetta, evita errori di ortografia e usa un tono professionale ma amichevole.

Linee guida per le risposte:
- Scrivi in italiano standard senza errori
- Usa terminologia tecnica appropriata
- Sii chiaro e conciso
- Quando non sei sicuro di qualcosa, ammettilo onestamente`;

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
            systemMessage += '❌ VIETATO fermarti dopo i primi 3 tool calls!\n\n';
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

        // Define function declarations for Gemini native function calling
        const tools = [{
            functionDeclarations: [
                {
                    name: 'read_file',
                    description: 'Leggi il contenuto di un file nel progetto',
                    parameters: {
                        type: 'OBJECT',
                        properties: {
                            filePath: {
                                type: 'STRING',
                                description: 'Il path del file da leggere'
                            }
                        },
                        required: ['filePath']
                    }
                },
                {
                    name: 'write_file',
                    description: 'Crea un nuovo file o sovrascrive completamente un file esistente',
                    parameters: {
                        type: 'OBJECT',
                        properties: {
                            filePath: {
                                type: 'STRING',
                                description: 'Il path del file da creare/sovrascrivere'
                            },
                            content: {
                                type: 'STRING',
                                description: 'Il contenuto completo del file'
                            }
                        },
                        required: ['filePath', 'content']
                    }
                },
                {
                    name: 'edit_file',
                    description: 'Modifica un file esistente con search & replace. Il file DEVE esistere.',
                    parameters: {
                        type: 'OBJECT',
                        properties: {
                            filePath: {
                                type: 'STRING',
                                description: 'Il path del file da modificare'
                            },
                            oldString: {
                                type: 'STRING',
                                description: 'Il testo esatto da cercare e sostituire'
                            },
                            newString: {
                                type: 'STRING',
                                description: 'Il nuovo testo con cui sostituire oldString'
                            }
                        },
                        required: ['filePath', 'oldString', 'newString']
                    }
                },
                {
                    name: 'list_files',
                    description: 'Elenca i file in una directory',
                    parameters: {
                        type: 'OBJECT',
                        properties: {
                            directory: {
                                type: 'STRING',
                                description: 'La directory da elencare (es: "." per root)'
                            }
                        },
                        required: ['directory']
                    }
                },
                {
                    name: 'glob_files',
                    description: 'Cerca file usando pattern glob (es: "**/*.ts" per tutti i file TypeScript, "**/deploy*" per file che iniziano con deploy)',
                    parameters: {
                        type: 'OBJECT',
                        properties: {
                            pattern: {
                                type: 'STRING',
                                description: 'Il pattern glob da cercare (es: "**/*.ts", "**/*.js", "**/package.json")'
                            }
                        },
                        required: ['pattern']
                    }
                },
                {
                    name: 'search_in_files',
                    description: 'Cerca un pattern di testo all\'interno dei file del progetto (come grep)',
                    parameters: {
                        type: 'OBJECT',
                        properties: {
                            pattern: {
                                type: 'STRING',
                                description: 'Il pattern di testo da cercare nei file (es: "Service", "API", "auth")'
                            }
                        },
                        required: ['pattern']
                    }
                }
            ]
        }];

        // Initialize Gemini model WITH native function calling
        const geminiModel = genAI.getGenerativeModel({
            model: model,
            systemInstruction: systemMessage,
            tools: tools,
            toolConfig: {
                functionCallingConfig: {
                    mode: 'AUTO' // Enable automatic tool calling
                }
            }
        });

        // Build conversation history for Gemini
        const history = conversationHistory.map((msg, i) => ({
            role: i % 2 === 0 ? 'user' : 'model',
            parts: [{ text: msg }]
        }));

        // Set headers for SSE streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Start chat session with history
        const chat = geminiModel.startChat({
            history: history,
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 8192,
            }
        });

        // Helper function to execute tool calls
        async function executeTool(functionCall) {
            const { name, args } = functionCall;
            const axios = require('axios');

            try {
                switch (name) {
                    case 'read_file':
                        const readRes = await axios.post(`http://localhost:${PORT}/workstation/read-file`, {
                            projectId: projectId,
                            filePath: args.filePath
                        });
                        return readRes.data.success ? readRes.data.content : `Error: ${readRes.data.error}`;

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
                        return listRes.data.success ? listRes.data.files.map(f => f.name).join(', ') : `Error: ${listRes.data.error}`;

                    case 'glob_files':
                        const globRes = await axios.post(`http://localhost:${PORT}/workstation/glob-files`, {
                            projectId: projectId,
                            pattern: args.pattern
                        });
                        if (globRes.data.success) {
                            const files = globRes.data.files || [];
                            const fileCount = files.length;
                            const fileList = files.join('\n');
                            return `Glob pattern: ${args.pattern}\n└─ Found ${fileCount} file(s)\n\n${fileList}`;
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
                            return `Search "${args.pattern}"\n└─ ${matchCount} match(es)\n\n${resultList}${truncated}`;
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

        // Send message with function calling support
        let result = await chat.sendMessageStream(prompt);

        // Stream the response and handle function calls in a loop
        let continueLoop = true;
        while (continueLoop) {
            continueLoop = false; // Reset flag

            for await (const chunk of result.stream) {
                const functionCalls = chunk.functionCalls();

                if (functionCalls && functionCalls.length > 0) {
                    // Execute each function call
                    for (const functionCall of functionCalls) {
                        console.log('🔧 Function call:', functionCall.name, functionCall.args);

                        // Stream function call to frontend (EXCEPT for glob_files and search_in_files - we want to show only the result)
                        if (functionCall.name !== 'glob_files' && functionCall.name !== 'search_in_files') {
                            res.write(`data: ${JSON.stringify({
                                functionCall: {
                                    name: functionCall.name,
                                    args: functionCall.args
                                }
                            })}\n\n`);
                        }

                        // Execute the function
                        const functionResult = await executeTool(functionCall);
                        console.log('✅ Function result:', functionResult);

                        // Stream the formatted tool result to frontend
                        res.write(`data: ${JSON.stringify({
                            toolResult: {
                                name: functionCall.name,
                                args: functionCall.args,
                                result: functionResult
                            }
                        })}\n\n`);

                        // Send function result back to Gemini to continue generation
                        result = await chat.sendMessageStream([{
                            functionResponse: {
                                name: functionCall.name,
                                response: { result: functionResult }
                            }
                        }]);

                        // Continue the loop to process the new response
                        continueLoop = true;
                    }
                } else {
                    // Regular text chunk - stream to frontend
                    const chunkText = chunk.text();
                    if (chunkText) {
                        res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
                    }
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

  // Allow simulation mode even without workstationId for testing
  const simulationMode = !workstationId;

  try {
    if (simulationMode) {
      console.log('🧪 Running in simulation mode (no workstation)');
    } else {
      console.log(`⚡ Executing command on workstation ${workstationId}...`);
    }

    // Execute command on workstation (or simulate if no workstationId)
    const output = await executeCommandOnWorkstation(command, workstationId || 'simulation');

    console.log('✅ Command executed successfully');

    const previewUrl = detectPreviewUrl(output.stdout, command);
    if (previewUrl) {
      console.log('👁️  Preview URL detected:', previewUrl);
    }

    res.json({
      output: output.stdout,
      error: output.stderr,
      exitCode: output.exitCode,
      workstationId: workstationId || 'simulation',
      command,
      previewUrl
    });

  } catch (error) {
    console.error('❌ TERMINAL EXECUTE ERROR:', error);
    res.status(500).json({ error: error.message });
  }
});

// Execute command on workstation (simulated for now)
async function executeCommandOnWorkstation(command, workstationId) {
  console.log(`🔧 executeCommandOnWorkstation called:`);
  console.log(`   Command: ${command}`);
  console.log(`   Workstation: ${workstationId}`);
  
  // Simulate git clone
  if (command.includes('git clone')) {
    console.log('📦 Simulating git clone...');
    const repoUrl = command.split(' ').find(arg => arg.includes('github.com'));
    const repoName = repoUrl ? repoUrl.split('/').pop().replace('.git', '') : 'repository';
    
    console.log(`   Repository URL: ${repoUrl}`);
    console.log(`   Repository name: ${repoName}`);
    
    const result = {
      stdout: `Cloning into '${repoName}'...\nremote: Enumerating objects: 100, done.\nremote: Total 100 (delta 0), reused 0 (delta 0)\nReceiving objects: 100% (100/100), done.\nResolving deltas: 100% (50/50), done.\n✅ Repository cloned successfully on workstation ${workstationId}`,
      stderr: '',
      exitCode: 0
    };
    
    console.log('✅ Git clone simulation completed');
    return result;
  }
  
  // Simulate npm/yarn start
  if (command.includes('npm start') || command.includes('yarn start') || command.includes('npm run dev')) {
    console.log('🚀 Simulating npm start...');
    
    const result = {
      stdout: `> Starting development server...\n\nLocal:   http://localhost:3000\nNetwork: http://10.0.0.1:3000\n\n✨ Server ready in 2.1s\n🚀 Development server running on workstation ${workstationId}`,
      stderr: '',
      exitCode: 0
    };
    
    console.log('✅ npm start simulation completed');
    return result;
  }
  
  // Simulate Python server
  if (command.includes('python -m http.server') || command.includes('python3 -m http.server')) {
    console.log('🐍 Simulating Python server...');
    const port = command.match(/(\d+)/) ? command.match(/(\d+)/)[1] : '8000';
    
    const result = {
      stdout: `Serving HTTP on 0.0.0.0 port ${port} (http://0.0.0.0:${port}/) ...\n🐍 Python server running on workstation ${workstationId}`,
      stderr: '',
      exitCode: 0
    };
    
    console.log('✅ Python server simulation completed');
    return result;
  }
  
  // Simulate ls command (case-insensitive)
  const cmdLower = command.trim().toLowerCase();
  if (cmdLower === 'ls' || cmdLower === 'ls -la') {
    console.log('📁 Simulating ls command...');

    const result = {
      stdout: 'total 48\ndrwxr-xr-x  8 user user 4096 Oct 15 12:00 .\ndrwxr-xr-x  3 user user 4096 Oct 15 11:00 ..\n-rw-r--r--  1 user user  123 Oct 15 12:00 .gitignore\n-rw-r--r--  1 user user 1024 Oct 15 12:00 package.json\ndrwxr-xr-x  2 user user 4096 Oct 15 12:00 src\ndrwxr-xr-x  2 user user 4096 Oct 15 12:00 public\n-rw-r--r--  1 user user 2048 Oct 15 12:00 README.md',
      stderr: '',
      exitCode: 0
    };
    
    console.log('✅ ls command simulation completed');
    return result;
  }
  
  // Default simulation
  console.log('🔧 Default command simulation...');
  const result = {
    stdout: `Command executed: ${command}\nWorkstation: ${workstationId}\nTimestamp: ${new Date().toISOString()}`,
    stderr: '',
    exitCode: 0
  };
  
  console.log('✅ Default simulation completed');
  return result;
}

// Detect preview URL from command output
function detectPreviewUrl(output, command) {
  // Look for common development server patterns
  const urlPatterns = [
    /Local:\s+(https?:\/\/[^\s]+)/,
    /http:\/\/localhost:\d+/,
    /http:\/\/127\.0\.0\.1:\d+/,
    /http:\/\/0\.0\.0\.0:\d+/,
    /Server running on (https?:\/\/[^\s]+)/
  ];
  
  for (const pattern of urlPatterns) {
    const match = output.match(pattern);
    if (match) {
      return match[1] || match[0];
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

        // Execute command with timeout (30 seconds)
        const { stdout, stderr } = await execAsync(`cd "${repoPath}" && ${command}`, {
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Drape Backend running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Network access: http://YOUR_IP:${PORT}/health`);
  console.log(`☁️  Connected to Google Cloud Project: ${PROJECT_ID}`);
  console.log(`🌍 Location: ${LOCATION}`);
  console.log(`🖥️  Workstation Management: ENABLED`);
  console.log(`👁️  Preview URL Detection: ENABLED`);
});

// Get project files from workstation
