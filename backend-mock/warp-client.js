#!/usr/bin/env node

// Client per interfacciare il Backend AWS dal Container Warp
const https = require('https');
const http = require('http');

const API_BASE = 'https://o571gs6nb7.execute-api.us-east-1.amazonaws.com/prod';
let sessionId = null;

// Utility per fare richieste HTTP
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const req = protocol.request(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: result });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: { raw: data } });
        }
      });
    });
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

// Crea una sessione
async function createSession() {
  try {
    console.log('🔄 Creando sessione...');
    const response = await makeRequest(`${API_BASE}/session/create`, {
      method: 'POST',
      headers: { 'X-User-ID': 'warp-container-user' }
    });
    
    if (response.data.success) {
      sessionId = response.data.session.sessionId;
      console.log('✅ Sessione creata:', sessionId);
      console.log('📁 Workspace:', response.data.session.workspaceDir);
      return true;
    } else {
      console.error('❌ Errore creazione sessione:', response.data.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Errore di connessione:', error.message);
    return false;
  }
}

// Esegui un comando
async function executeCommand(command) {
  if (!sessionId) {
    console.log('⚠️  Sessione non trovata, creandone una nuova...');
    const created = await createSession();
    if (!created) return;
  }
  
  try {
    console.log(`\n🚀 Eseguendo: ${command}`);
    console.log('⏳ Attendere... (potrebbe richiedere tempo per ECS)');
    
    const startTime = Date.now();
    const response = await makeRequest(`${API_BASE}/command/execute`, {
      method: 'POST',
      headers: { 'X-Session-ID': sessionId },
      body: { command }
    });
    const duration = Date.now() - startTime;
    
    if (response.data.success) {
      console.log('✅ Comando completato:', `${duration}ms`);
      console.log('📋 Output:');
      console.log(response.data.output);
      console.log(`\n🔧 Eseguito su: ${response.data.executor}`);
      console.log(`🧠 Routing: ${response.data.routing}`);
    } else {
      console.log('❌ Comando fallito:', response.data.error);
      if (response.data.output) {
        console.log('📋 Output errore:');
        console.log(response.data.output);
      }
    }
  } catch (error) {
    if (error.code === 'ECONNRESET') {
      console.log('⏰ Timeout - Il comando è probabilmente in esecuzione su ECS...');
    } else {
      console.error('❌ Errore di connessione:', error.message);
    }
  }
}

// Health check
async function healthCheck() {
  try {
    console.log('🏥 Controllo stato backend...');
    const response = await makeRequest(`${API_BASE}/health`);
    console.log('✅ Backend Status:', response.data.status);
    console.log('🏷️  Versione:', response.data.version);
    console.log('🌍 Ambiente:', response.data.environment);
    console.log('📊 ECS Status:', response.data.ecsStatus);
  } catch (error) {
    console.error('❌ Backend non raggiungibile:', error.message);
  }
}

// Main CLI
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
🎯 Warp AI IDE - Client Backend AWS

Utilizzo:
  node warp-client.js health                 # Controlla stato backend
  node warp-client.js session               # Crea nuova sessione
  node warp-client.js exec "comando"         # Esegui comando
  node warp-client.js flutter --version     # Comando Flutter (diretto)
  node warp-client.js python --version      # Comando Python (diretto)

Esempi:
  node warp-client.js exec "pwd"
  node warp-client.js exec "flutter doctor"
  node warp-client.js exec "python3 --version"
  node warp-client.js exec "ls -la"
`);
    return;
  }
  
  const command = args[0];
  
  switch (command) {
    case 'health':
      await healthCheck();
      break;
      
    case 'session':
      await createSession();
      break;
      
    case 'exec':
      if (args[1]) {
        await executeCommand(args[1]);
      } else {
        console.log('❌ Specifica un comando: node warp-client.js exec "comando"');
      }
      break;
      
    default:
      // Tratta tutto il resto come un comando diretto
      const fullCommand = args.join(' ');
      await executeCommand(fullCommand);
      break;
  }
}

main().catch(console.error);