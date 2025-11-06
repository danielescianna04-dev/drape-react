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
    res.json(response.data);
  } catch (error) {
    console.error('Device flow error:', error.message);
    res.status(500).json({ error: error.message });
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
    
    res.json(response.data);
  } catch (error) {
    console.error('Exchange code error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Import Gemini SDK
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// AI Chat endpoint - Using Gemini 2.0 Flash with native tool calling
app.post('/ai/chat', async (req, res) => {
    const { prompt, conversationHistory = [], workstationId, context, projectId, repositoryUrl } = req.body;
    // Force Gemini model (ignore model from frontend)
    const model = 'gemini-2.0-flash-exp';

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

            systemMessage += 'Esempio 1: READ\n';
            systemMessage += 'Utente: "Leggi il file app.js"\n';
            systemMessage += 'Tu: "Leggo il file app.js"\n';
            systemMessage += 'Tu: read_file(app.js)\n';
            systemMessage += 'Tu: "Il file contiene la configurazione principale dell\'app."\n\n';

            systemMessage += 'Esempio 2: EDIT ⭐ (PREFERITO per modifiche)\n';
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

            systemMessage += '⚠️ REGOLE CRITICHE per edit_file():\n';
            systemMessage += '1. SEMPRE chiama read_file() PRIMA di edit_file()\n';
            systemMessage += '2. Se read_file() FALLISCE (file non esiste) → USA write_file() invece!\n';
            systemMessage += '3. Nella chiamata edit_file(), COPIA ESATTAMENTE il testo che hai letto\n';
            systemMessage += '4. NON riassumere, NON parafrasare - USA IL TESTO IDENTICO!\n';
            systemMessage += '5. Se il file ha "ABC", scrivi edit_file(file, ABC, ABC + nuova riga)\n\n';
            systemMessage += '🎯 WORKFLOW CORRETTO:\n';
            systemMessage += 'read_file() → Leggi contenuto esatto → edit_file(file, contenuto_esatto, contenuto_esatto + modifica)\n';
        }

        // Initialize Gemini model with streaming (no function calling)
        const geminiModel = genAI.getGenerativeModel({
            model: model,
            systemInstruction: systemMessage
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

        // Send message and stream response (without function calling for now)
        const result = await chat.sendMessageStream(prompt);

        // Stream the response
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
                res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
            }
        }

        // Send done signal
        res.write('data: [DONE]\n\n');
        res.end();

    } catch (error) {
        console.error('AI Chat error:', error.response?.data || error.message);

        const errorMessage = error.response?.data?.error?.message || error.message;

        res.status(500).json({
            success: false,
            error: errorMessage
        });
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
        
        // If 404 and no token provided, it's likely a private repo
        if (error.response?.status === 404 && !githubToken) {
          console.log('🔒 Private repository detected, authentication required');
          return res.status(401).json({
            error: 'Authentication required',
            message: 'This repository is private or does not exist',
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

    // Read files from the cloned repository
    async function readDirectory(dirPath, basePath = '') {
        const files = [];
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                // Skip .git directory and node_modules
                if (entry.name === '.git' || entry.name === 'node_modules') continue;

                const fullPath = path.join(dirPath, entry.name);
                const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

                files.push({
                    name: entry.name,
                    type: entry.isDirectory() ? 'directory' : 'file',
                    path: relativePath
                });
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
