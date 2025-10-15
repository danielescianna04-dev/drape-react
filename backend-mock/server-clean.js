const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Docker = require('dockerode');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const PreviewManager = require('./preview-proxy');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Docker instance
const docker = new Docker();

// Store active sessions
const sessions = new Map();

// Initialize PreviewManager
const previewManager = new PreviewManager();

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

// Session management class
class TerminalSession {
  constructor(userId) {
    this.userId = userId;
    this.sessionId = uuidv4();
    this.containerId = null;
    this.container = null;
    this.workingDir = '/workspace';
    this.isInitialized = false;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.webSockets = new Set();
    this.exposedPorts = {};
  }

  async initialize() {
    try {
      console.log(`🚀 Initializing container for user ${this.userId}`);
      
      this.container = await docker.createContainer({
        Image: 'warp-dev-simple:latest',
        Cmd: ['/bin/bash', '-l'],
        Tty: true,
        OpenStdin: true,
        StdinOnce: false,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: this.workingDir,
        Env: [
          'TERM=xterm-256color',
          `WARP_USER_ID=${this.userId}`,
          `WARP_SESSION_ID=${this.sessionId}`,
          'DEBIAN_FRONTEND=noninteractive'
        ],
        ExposedPorts: {
          '3000/tcp': {},
          '5000/tcp': {},
          '8000/tcp': {},
          '8080/tcp': {},
          '8888/tcp': {},
        },
        HostConfig: {
          PortBindings: {
            '3000/tcp': [{ HostPort: '0' }],
            '5000/tcp': [{ HostPort: '0' }],
            '8000/tcp': [{ HostPort: '0' }],
            '8080/tcp': [{ HostPort: '0' }],
            '8888/tcp': [{ HostPort: '0' }],
          },
          Memory: 1 * 1024 * 1024 * 1024, // 1GB per testing
          CpuShares: 512,
          NetworkMode: 'bridge'
        },
        Labels: {
          'warp.session': this.sessionId,
          'warp.user': this.userId,
          'warp.type': 'development-environment'
        }
      });

      await this.container.start();
      this.containerId = this.container.id;
      
      const containerInfo = await this.container.inspect();
      this.exposedPorts = this.extractExposedPorts(containerInfo);
      
      this.isInitialized = true;
      console.log(`✅ Container ${this.containerId.substring(0, 12)} initialized`);
      
      return { 
        success: true, 
        containerId: this.containerId,
        sessionId: this.sessionId,
        exposedPorts: this.exposedPorts 
      };
    } catch (error) {
      console.error('❌ Failed to initialize container:', error);
      return { success: false, error: error.message };
    }
  }

  extractExposedPorts(containerInfo) {
    const ports = {};
    const portBindings = containerInfo.NetworkSettings.Ports;
    
    for (const [containerPort, hostBindings] of Object.entries(portBindings)) {
      if (hostBindings && hostBindings.length > 0) {
        const hostPort = hostBindings[0].HostPort;
        ports[containerPort] = `http://localhost:${hostPort}`;
      }
    }
    
    return ports;
  }

  updateActivity() {
    this.lastActivity = Date.now();
  }

  async executeCommand(command, updateDir = true) {
    if (!this.container) {
      throw new Error('Container not initialized');
    }

    try {
      if (command.trim() === 'clear') {
        return { output: '', success: true, clearTerminal: true };
      }

      const exec = await this.container.exec({
        Cmd: ['/bin/bash', '-c', `cd ${this.workingDir} && ${command}`],
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Env: ['TERM=xterm-256color']
      });

      const stream = await exec.start({ hijack: true, stdin: false });
      
      let output = '';
      let isWebServer = false;

      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => {
          const data = chunk.toString();
          output += data;
          
          // Check for web server
          const serverDetection = this.detectWebServer(data);
          if (serverDetection.detected) {
            isWebServer = true;
            console.log(`🌐 Web server detected: ${serverDetection.port || 'unknown port'}`);
          }
        });

        stream.on('end', async () => {
          try {
            const execInfo = await exec.inspect();
            const success = execInfo.ExitCode === 0;

            if (updateDir && command.trim().startsWith('cd ')) {
              await this.updateCurrentDirectory();
            }

            this.updateActivity();

            resolve({
              output: output,
              success: success,
              clearTerminal: false,
              exposedPorts: this.exposedPorts,
              webServerDetected: isWebServer
            });
          } catch (error) {
            resolve({ output: output, success: false, clearTerminal: false });
          }
        });

        stream.on('error', (error) => {
          reject(error);
        });
      });
    } catch (error) {
      throw error;
    }
  }

  detectWebServer(output) {
    const patterns = [
      /server.*running.*port.*([0-9]{4,5})/i,
      /listening.*port.*([0-9]{4,5})/i,
      /started.*server.*([0-9]{4,5})/i,
      /local.*http.*localhost:([0-9]{4,5})/i,
      /development server.*([0-9]{4,5})/i
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) {
        const port = match[1] ? parseInt(match[1]) : null;
        return { detected: true, port };
      }
    }

    return { detected: false, port: null };
  }

  async updateCurrentDirectory() {
    try {
      const exec = await this.container.exec({
        Cmd: ['pwd'],
        AttachStdout: true,
        AttachStderr: true
      });

      const stream = await exec.start();
      let pwd = '';
      
      stream.on('data', (chunk) => {
        pwd += chunk.toString();
      });

      stream.on('end', () => {
        this.workingDir = pwd.trim() || '/workspace';
      });
    } catch (error) {
      console.error('Error updating current directory:', error);
    }
  }

  async destroy() {
    if (this.container) {
      try {
        await this.container.kill();
        await this.container.remove();
        console.log(`🗑️ Container ${this.containerId?.substring(0, 12)} destroyed`);
      } catch (error) {
        console.error('Error destroying container:', error);
      }
    }
  }
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('🔌 New WebSocket connection');
  let session = null;

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'init':
          const userId = message.userId || 'anonymous';
          session = new TerminalSession(userId);
          sessions.set(userId, session);
          
          const initResult = await session.initialize();
          ws.send(JSON.stringify({
            type: 'init_result',
            ...initResult
          }));
          break;

        case 'command':
          if (!session) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Session not initialized'
            }));
            return;
          }

          try {
            const result = await session.executeCommand(message.command);
            ws.send(JSON.stringify({
              type: 'command_result',
              command: message.command,
              output: result.output,
              success: result.success,
              clearTerminal: result.clearTerminal || false,
              exposedPorts: result.exposedPorts,
              webServerDetected: result.webServerDetected || false
            }));
          } catch (error) {
            ws.send(JSON.stringify({
              type: 'command_result',
              command: message.command,
              output: `Error: ${error.message}`,
              success: false,
              clearTerminal: false
            }));
          }
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          if (session) session.updateActivity();
          break;

        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Unknown message type'
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

  ws.on('close', async () => {
    console.log('🔌 WebSocket connection closed');
    if (session) {
      await session.destroy();
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Routes
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    activeSessions: sessions.size 
  });
});

app.get('/containers', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    res.json(containers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Preview endpoints
app.use('/preview', previewManager.getPreviewMiddleware());

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log('🚀 Warp Terminal Backend Server started');
  console.log(`📡 WebSocket server running on ws://localhost:${PORT}`);
  console.log(`🌐 HTTP server running on http://localhost:${PORT}`);
  console.log(`🎭 Preview server available at http://localhost:${PORT}/preview/:sessionId/`);
  console.log('📊 Health check: http://localhost:' + PORT + '/health');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down server...');
  
  const destroyPromises = [];
  for (const [userId, session] of sessions) {
    destroyPromises.push(session.destroy());
  }
  
  try {
    await Promise.all(destroyPromises);
    console.log('✅ All sessions destroyed');
  } catch (error) {
    console.error('❌ Error destroying sessions:', error);
  }
  
  server.close(() => {
    console.log('✅ Server shut down gracefully');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  process.emit('SIGTERM');
});