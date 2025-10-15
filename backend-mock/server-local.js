const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const AIAgent = require('./ai-agent');
const helmet = require('helmet');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store active sessions
const sessions = new Map();

// Initialize AI Agent
const aiAgent = new AIAgent();

// Initialize AI Agent on server start
aiAgent.initialize().then(() => {
  console.log('🤖 AI Agent initialization completed');
}).catch(err => {
  console.error('❌ AI Agent initialization failed:', err);
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      frameSrc: ["'self'"],
    },
  },
}));

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:8080', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Warp-Session']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from React build
const reactBuildPath = path.join(__dirname, '../unsplash-gallery/dist');
if (require('fs').existsSync(reactBuildPath)) {
  app.use('/unsplash', express.static(reactBuildPath));
  console.log('📱 Serving Unsplash Gallery at /unsplash');
}

// Local Terminal Session (without Docker)
class LocalTerminalSession {
  constructor(userId) {
    this.userId = userId;
    this.sessionId = uuidv4();
    this.workingDir = path.join(os.homedir(), 'warp-workspace');
    this.isInitialized = false;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.webSockets = new Set();
    this.processes = new Map(); // Track running processes
  }

  async initialize() {
    try {
      console.log(`🚀 Initializing local session for user ${this.userId}`);
      
      // Create workspace directory
      await fs.mkdir(this.workingDir, { recursive: true });
      
      // Create welcome file
      await fs.writeFile(
        path.join(this.workingDir, 'README.md'), 
        '# Welcome to Warp Mobile AI IDE!\n\n🚀 Local development environment ready!\n\n## Available:\n- Node.js, npm\n- Python 3\n- Git\n- System terminal access\n\nStart coding with AI assistance! 🤖'
      );
      
      this.isInitialized = true;
      console.log(`✅ Local session ${this.sessionId} initialized`);
      console.log(`📁 Working directory: ${this.workingDir}`);
      
      return { 
        success: true, 
        sessionId: this.sessionId,
        workingDir: this.workingDir
      };
    } catch (error) {
      console.error('❌ Failed to initialize local session:', error);
      return { success: false, error: error.message };
    }
  }

  async executeCommand(command, streaming = true) {
    return new Promise((resolve, reject) => {
      this.lastActivity = Date.now();
      
      const startTime = Date.now();
      console.log(`🔧 Executing locally: ${command}`);

      // Handle special commands
      if (command.startsWith('cd ')) {
        const newDir = command.substring(3).trim();
        const targetDir = path.resolve(this.workingDir, newDir);
        
        // Security check - stay within workspace or allow safe directories
        if (targetDir.startsWith(this.workingDir) || 
            targetDir.startsWith('/usr') || 
            targetDir.startsWith('/tmp') ||
            targetDir === os.homedir()) {
          this.workingDir = targetDir;
          return resolve({
            success: true,
            output: `Changed directory to: ${this.workingDir}`,
            executionTime: Date.now() - startTime
          });
        } else {
          return resolve({
            success: false,
            output: `Access denied: ${targetDir}`,
            executionTime: Date.now() - startTime
          });
        }
      }

      // Handle AI Agent commands
      if (command.startsWith('/ai ')) {
        const prompt = command.substring(4);
        return this.handleAICommand(prompt, resolve, reject);
      }

      if (command.startsWith('/agent ')) {
        const task = command.substring(7);
        return this.handleAgentCommand(task, resolve, reject);
      }

      // Execute regular commands
      const child = spawn('bash', ['-c', command], {
        cwd: this.workingDir,
        env: { 
          ...process.env,
          WARP_SESSION: this.sessionId,
          PATH: process.env.PATH + ':/usr/local/bin'
        }
      });

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        
        // Stream output in real-time if requested
        if (streaming) {
          this.broadcastToClients({
            type: 'command_output',
            sessionId: this.sessionId,
            data: chunk,
            timestamp: Date.now()
          });
        }
      });

      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        errorOutput += chunk;
        
        if (streaming) {
          this.broadcastToClients({
            type: 'command_error',
            sessionId: this.sessionId,
            data: chunk,
            timestamp: Date.now()
          });
        }
      });

      child.on('close', (code) => {
        const executionTime = Date.now() - startTime;
        const success = code === 0;
        
        console.log(`${success ? '✅' : '❌'} Command ${success ? 'completed' : 'failed'} in ${executionTime}ms`);
        
        resolve({
          success,
          output: success ? output : errorOutput,
          exitCode: code,
          executionTime,
          workingDir: this.workingDir
        });
      });

      child.on('error', (error) => {
        console.error('Command execution error:', error);
        reject({
          success: false,
          error: error.message,
          executionTime: Date.now() - startTime
        });
      });
    });
  }

  async handleAICommand(prompt, resolve, reject) {
    try {
      const response = await aiAgent.generateResponse(prompt, {
        workingDir: this.workingDir,
        sessionId: this.sessionId
      });
      
      resolve({
        success: true,
        output: `🤖 AI Response:\n\n${response.content}\n\n⚡ Model: ${response.model} | Provider: ${response.provider}`,
        executionTime: response.responseTime
      });
    } catch (error) {
      resolve({
        success: false,
        output: `❌ AI Error: ${error.message}`,
        executionTime: 100
      });
    }
  }

  async handleAgentCommand(task, resolve, reject) {
    try {
      // Broadcast start of agent task
      this.broadcastToClients({
        type: 'agent_task_start',
        sessionId: this.sessionId,
        task: task,
        timestamp: Date.now()
      });

      const execution = await aiAgent.executeAutonomousTask(task, this, this.getFirstWebSocket());
      
      resolve({
        success: true,
        output: `🤖 Agent Task Completed!\n\nTask: ${task}\nStatus: ${execution.status}\nSteps: ${execution.steps.length}\nDuration: ${execution.duration}ms\n\nResult: ${execution.result || 'Task completed successfully'}`,
        executionTime: execution.duration
      });
    } catch (error) {
      resolve({
        success: false,
        output: `❌ Agent Task Failed: ${error.message}`,
        executionTime: 100
      });
    }
  }

  getFirstWebSocket() {
    return this.webSockets.values().next().value;
  }

  broadcastToClients(message) {
    this.webSockets.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
  }

  addWebSocket(ws) {
    this.webSockets.add(ws);
  }

  removeWebSocket(ws) {
    this.webSockets.delete(ws);
  }

  async destroy() {
    // Kill any running processes
    for (const [pid, process] of this.processes) {
      try {
        process.kill();
      } catch (error) {
        console.log(`Failed to kill process ${pid}:`, error.message);
      }
    }
    this.processes.clear();
    
    console.log(`🗑️ Local session ${this.sessionId} destroyed`);
  }
}

// WebSocket connection handler
wss.on('connection', (ws, request) => {
  const clientIP = request.socket.remoteAddress;
  console.log(`[${new Date().toISOString()}] ℹ️  New WebSocket connection from ${clientIP}`);

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`[${new Date().toISOString()}] ℹ️  Received message: ${data.type}`, data);

      switch (data.type) {
        case 'init':
          await handleInitSession(ws, data);
          break;
        case 'command':
          await handleCommand(ws, data);
          break;
        case 'ai_chat':
          await handleAIChat(ws, data);
          break;
        case 'agent_task':
          await handleAgentTask(ws, data);
          break;
        case 'get_providers':
          await handleGetProviders(ws);
          break;
        case 'set_provider':
          await handleSetProvider(ws, data);
          break;
        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: `Unknown message type: ${data.type}`
          }));
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    // Remove from all sessions
    sessions.forEach(session => {
      session.removeWebSocket(ws);
    });
  });
});

// Handler functions
async function handleInitSession(ws, data) {
  const userId = data.connectionId || `local-user-${Date.now()}`;
  
  let session = sessions.get(userId);
  if (!session) {
    session = new LocalTerminalSession(userId);
    sessions.set(userId, session);
  }
  
  session.addWebSocket(ws);
  
  if (!session.isInitialized) {
    const result = await session.initialize();
    
    if (result.success) {
      ws.send(JSON.stringify({
        type: 'session_initialized',
        sessionId: session.sessionId,
        workingDir: session.workingDir,
        message: '🚀 Local development environment ready!'
      }));
    } else {
      ws.send(JSON.stringify({
        type: 'session_error',
        error: result.error
      }));
      console.log(`[${new Date().toISOString()}] ❌ Session initialization failed for user: ${userId}`, result.error);
    }
  } else {
    ws.send(JSON.stringify({
      type: 'session_ready',
      sessionId: session.sessionId,
      workingDir: session.workingDir
    }));
  }
}

async function handleCommand(ws, data) {
  const session = findSessionForWebSocket(ws);
  if (!session) {
    return ws.send(JSON.stringify({
      type: 'error',
      message: 'No active session found'
    }));
  }

  try {
    const result = await session.executeCommand(data.command, data.streaming !== false);
    
    ws.send(JSON.stringify({
      type: 'command_result',
      sessionId: session.sessionId,
      result: result,
      timestamp: Date.now()
    }));
  } catch (error) {
    ws.send(JSON.stringify({
      type: 'command_error',
      sessionId: session.sessionId,
      error: error.message,
      timestamp: Date.now()
    }));
  }
}

async function handleAIChat(ws, data) {
  try {
    const response = await aiAgent.generateResponse(data.message, {
      sessionId: data.sessionId || 'default'
    });

    ws.send(JSON.stringify({
      type: 'ai_response',
      content: response.content,
      model: response.model,
      provider: response.provider,
      timestamp: response.timestamp
    }));
  } catch (error) {
    ws.send(JSON.stringify({
      type: 'ai_error',
      error: error.message
    }));
  }
}

async function handleAgentTask(ws, data) {
  const session = findSessionForWebSocket(ws);
  if (!session) {
    return ws.send(JSON.stringify({
      type: 'error',
      message: 'No active session found'
    }));
  }

  try {
    await aiAgent.executeAutonomousTask(data.task, session, ws);
  } catch (error) {
    ws.send(JSON.stringify({
      type: 'agent_error',
      error: error.message
    }));
  }
}

async function handleGetProviders(ws) {
  const providers = aiAgent.getAvailableProviders();
  ws.send(JSON.stringify({
    type: 'available_providers',
    providers: providers,
    current: aiAgent.activeProvider
  }));
}

async function handleSetProvider(ws, data) {
  try {
    aiAgent.setActiveProvider(data.provider);
    ws.send(JSON.stringify({
      type: 'provider_changed',
      provider: data.provider
    }));
  } catch (error) {
    ws.send(JSON.stringify({
      type: 'error',
      message: error.message
    }));
  }
}

function findSessionForWebSocket(ws) {
  for (const session of sessions.values()) {
    if (session.webSockets.has(ws)) {
      return session;
    }
  }
  return null;
}

// REST API endpoints
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    sessions: sessions.size,
    aiAgent: aiAgent.isAvailable()
  });
});

app.get('/sessions', (req, res) => {
  const sessionData = Array.from(sessions.values()).map(session => ({
    sessionId: session.sessionId,
    userId: session.userId,
    workingDir: session.workingDir,
    isInitialized: session.isInitialized,
    createdAt: session.createdAt,
    lastActivity: session.lastActivity
  }));
  
  res.json({
    sessions: sessionData,
    count: sessions.size
  });
});

// Cleanup function
const cleanupSessions = () => {
  const now = Date.now();
  const timeout = 30 * 60 * 1000; // 30 minutes
  
  sessions.forEach(async (session, userId) => {
    if (now - session.lastActivity > timeout) {
      console.log(`🧹 Cleaning up inactive session: ${session.sessionId}`);
      await session.destroy();
      sessions.delete(userId);
    }
  });
  
  console.log(`🧹 Running cleanup tasks...`);
  console.log(`📊 Active: ${sessions.size} sessions`);
};

// Run cleanup every 5 minutes
setInterval(cleanupSessions, 5 * 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  await gracefulShutdown();
});

process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  await gracefulShutdown();
});

async function gracefulShutdown() {
  console.log('🛑 Shutting down server...');
  
  // Close WebSocket server
  wss.close();
  
  // Destroy all sessions
  console.log('🧹 Destroying local sessions...');
  const destroyPromises = Array.from(sessions.values()).map(session => session.destroy());
  await Promise.all(destroyPromises);
  console.log('✅ All sessions destroyed');
  
  // Close HTTP server
  server.close(() => {
    console.log('✅ Server shut down gracefully');
    process.exit(0);
  });
}

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log('🚀 Warp Mobile AI IDE - Local Mode Server');
  console.log('📡 WebSocket server running on ws://localhost:' + PORT);
  console.log('🌐 HTTP server running on http://localhost:' + PORT);
  console.log('📊 Health check: http://localhost:' + PORT + '/health');
  console.log('💻 Running in LOCAL mode (no Docker required)');
  console.log('🏠 Workspace: ~/warp-workspace');
});