const express = require('express');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// Configuration
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Mock session management for demo (without Docker)
class DemoSessionManager {
  constructor() {
    this.sessions = new Map();
  }

  async createSession(sessionId) {
    console.log(`Creating demo session: ${sessionId}`);
    
    const session = {
      id: sessionId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      isActive: true,
      webSockets: new Set(),
      currentDirectory: process.cwd(),
      exposedPorts: {
        '3000/tcp': 'http://localhost:3000',
        '8000/tcp': 'http://localhost:8000',
        '5000/tcp': 'http://localhost:5000'
      }
    };

    this.sessions.set(sessionId, session);
    console.log(`✅ Demo session created: ${sessionId}`);
    
    return {
      success: true,
      sessionId: sessionId,
      exposedPorts: session.exposedPorts
    };
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  updateActivity(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  async destroySession(sessionId) {
    console.log(`Destroying demo session: ${sessionId}`);
    this.sessions.delete(sessionId);
  }
}

const sessionManager = new DemoSessionManager();

// WebSocket Server
wss.on('connection', (ws, req) => {
  let sessionId = null;
  let session = null;

  console.log('🔌 New WebSocket connection');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'init':
          sessionId = data.userId || uuidv4();
          const result = await sessionManager.createSession(sessionId);
          session = sessionManager.getSession(sessionId);
          session.webSockets.add(ws);
          
          ws.send(JSON.stringify({
            type: 'session_ready',
            sessionId: sessionId,
            exposedPorts: result.exposedPorts,
            currentDirectory: '/workspace'
          }));
          break;

        case 'command':
          if (!session) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'No active session'
            }));
            return;
          }

          await executeDemoCommand(session, data.command, ws);
          sessionManager.updateActivity(sessionId);
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          if (sessionId) sessionManager.updateActivity(sessionId);
          break;

        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    if (session && sessionId) {
      session.webSockets.delete(ws);
    }
  });
});

async function executeDemoCommand(session, command, ws) {
  try {
    console.log(`Executing demo command: ${command}`);
    
    // Handle special commands
    if (command.trim() === 'clear') {
      ws.send(JSON.stringify({
        type: 'command_result',
        output: '',
        success: true,
        clearTerminal: true
      }));
      return;
    }

    // Mock some common commands with demo responses
    let output = '';
    let isWebServer = false;
    let success = true;

    switch (command.trim()) {
      case 'ls':
      case 'ls -la':
        output = 'README.md\npackage.json\nsrc/\nnode_modules/\n.env\n.git/\n';
        break;
      
      case 'pwd':
        output = '/workspace\n';
        break;
        
      case 'whoami':
        output = 'warp-user\n';
        break;
        
      case 'node --version':
        output = 'v18.17.0\n';
        break;
        
      case 'npm --version':
        output = '9.6.7\n';
        break;
        
      case 'flutter --version':
        output = 'Flutter 3.16.0 • channel stable\nDart 3.2.6 • DevTools 2.28.4\n';
        break;
        
      case 'npm start':
      case 'npm run dev':
        output = '> demo-app@1.0.0 start\n> node server.js\n\n🚀 Server running at http://localhost:3000\n✨ Hot reload enabled\n';
        isWebServer = true;
        break;
        
      case 'flutter run -d web':
      case 'flutter run --web':
        output = 'Launching lib/main.dart on Chrome in debug mode...\n🌐 Flutter web server started\n📱 App running at http://localhost:8000\n';
        isWebServer = true;
        break;
        
      case 'python -m http.server':
      case 'python3 -m http.server':
        output = 'Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/) ...\n';
        isWebServer = true;
        break;
        
      default:
        // For other commands, try to execute them locally (with caution)
        if (command.includes('rm -rf') || command.includes('sudo') || command.includes('chmod 777')) {
          output = `Permission denied: ${command}\n`;
          success = false;
        } else {
          try {
            const child = spawn('sh', ['-c', command], { 
              timeout: 5000,
              stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let stdout = '';
            let stderr = '';
            
            child.stdout.on('data', (data) => {
              stdout += data.toString();
            });
            
            child.stderr.on('data', (data) => {
              stderr += data.toString();
            });
            
            await new Promise((resolve) => {
              child.on('close', (code) => {
                output = stdout + stderr;
                success = code === 0;
                resolve();
              });
              
              child.on('error', () => {
                output = `Command not found: ${command}\n`;
                success = false;
                resolve();
              });
            });
          } catch (error) {
            output = `Error executing command: ${error.message}\n`;
            success = false;
          }
        }
    }

    ws.send(JSON.stringify({
      type: 'command_result',
      output: output,
      success: success,
      clearTerminal: false,
      exposedPorts: session.exposedPorts,
      webServerDetected: isWebServer
    }));

  } catch (error) {
    console.error('Demo execute command error:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: error.message
    }));
  }
}

// REST API endpoints
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy (demo mode)',
    activeSessions: sessionManager.sessions.size,
    timestamp: new Date().toISOString()
  });
});

app.get('/sessions', (req, res) => {
  const sessions = Array.from(sessionManager.sessions.entries()).map(([id, session]) => ({
    id,
    createdAt: session.createdAt,
    lastActivity: session.lastActivity,
    isActive: session.isActive,
    exposedPorts: session.exposedPorts,
    currentDirectory: session.currentDirectory
  }));

  res.json({ sessions });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  wss.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  wss.close();
  process.exit(0);
});

// Start server
server.listen(PORT, () => {
  console.log('🚀 Demo Terminal Backend Server started');
  console.log(`📡 WebSocket server running on ws://localhost:${PORT}`);
  console.log(`🌐 HTTP server running on http://localhost:${PORT}`);
  console.log('📊 Health check: http://localhost:' + PORT + '/health');
  console.log('⚠️  Running in DEMO mode (no Docker required)');
});

module.exports = { app, wss, sessionManager };