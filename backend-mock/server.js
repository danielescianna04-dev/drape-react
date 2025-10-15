const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Docker = require('dockerode');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const PreviewManager = require('./preview-proxy');
const AIAgent = require('./ai-agent');
const helmet = require('helmet');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
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
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Necessario per development
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

// AI Routes
const aiRoutes = require('./ai-routes');
app.set('aiAgent', aiAgent);
app.use('/ai', aiRoutes);

// Serve static files from React build
const reactBuildPath = path.join(__dirname, '../unsplash-gallery/dist');
if (require('fs').existsSync(reactBuildPath)) {
  app.use('/unsplash', express.static(reactBuildPath));
  console.log('📱 Serving Unsplash Gallery at /unsplash');
}

// Session management
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
      
      // Create container with complete development environment
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
          '3000/tcp': {},  // Node.js/React
          '3001/tcp': {},  // Alternative React
          '4200/tcp': {},  // Angular
          '5000/tcp': {},  // Flask/Python
          '8000/tcp': {},  // Django/Python
          '8080/tcp': {},  // Java/Tomcat
          '8888/tcp': {},  // Jupyter Notebook
          '9000/tcp': {},  // Go/PHP
          '6006/tcp': {},  // TensorBoard
          '4000/tcp': {},  // Ruby/Jekyll
          '3333/tcp': {},  // Flutter web
        },
        HostConfig: {
          PortBindings: {
            '3000/tcp': [{ HostPort: '0' }],
            '3001/tcp': [{ HostPort: '0' }],
            '4200/tcp': [{ HostPort: '0' }],
            '5000/tcp': [{ HostPort: '0' }],
            '8000/tcp': [{ HostPort: '0' }],
            '8080/tcp': [{ HostPort: '0' }],
            '8888/tcp': [{ HostPort: '0' }],
            '9000/tcp': [{ HostPort: '0' }],
            '6006/tcp': [{ HostPort: '0' }],
            '4000/tcp': [{ HostPort: '0' }],
            '3333/tcp': [{ HostPort: '0' }],
          },
          Memory: 2 * 1024 * 1024 * 1024, // 2GB per container
          CpuShares: 1024, // Aumentato per supportare compilation
          NetworkMode: 'bridge',
          // Privileged per Docker-in-Docker se necessario
          Privileged: false
        },
        Labels: {
          'warp.session': this.sessionId,
          'warp.user': this.userId,
          'warp.type': 'development-environment'
        }
      });

      await this.container.start();
      this.containerId = this.container.id;
      
      // Get container info for port mappings
      const containerInfo = await this.container.inspect();
      this.exposedPorts = this.extractExposedPorts(containerInfo);

      // Setup workspace and install development tools
      await this.setupWorkspace();
      
      console.log(`✅ Container ports:`, this.exposedPorts);

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

  async setupWorkspace() {
    try {
      // Create workspace and install basic tools
      const setupCommands = [
        'mkdir -p /workspace',
        'apk add --no-cache git curl vim nano python3 py3-pip',
        'npm install -g create-react-app @angular/cli vue-cli nodemon',
        'echo "Welcome to Warp Mobile AI IDE!" > /workspace/README.md'
      ];

      for (const cmd of setupCommands) {
        try {
          await this.executeCommand(cmd, false);
        } catch (error) {
          console.log(`Setup command failed: ${cmd}`, error.message);
        }
      }
    } catch (error) {
      console.error('Error setting up workspace:', error);
    }
  }

  updateActivity() {
    this.lastActivity = Date.now();
  }

  async executeCommand(command, updateDir = true) {
    if (!this.container) {
      throw new Error('Container not initialized');
    }

    try {
      // Handle special commands
      if (command.trim() === 'clear') {
        return { output: '', success: true, clearTerminal: true };
      }

      // Execute command in current working directory
      // Try with TTY first, fallback to non-TTY if it fails
      let exec, stream;
      const safeWorkdir = this.workingDir || '/workspace';
      
      try {
        exec = await this.container.exec({
          Cmd: ['/bin/bash', '-lc', `cd "${safeWorkdir}" && ${command}`],
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
          Env: ['TERM=xterm-256color']
        });
        stream = await exec.start({ hijack: true, stdin: false });
      } catch (ttyError) {
        console.log(`TTY exec failed, trying without TTY for command: ${command}`);
        exec = await this.container.exec({
          Cmd: ['/bin/bash', '-lc', `cd "${safeWorkdir}" && ${command}`],
          AttachStdout: true,
          AttachStderr: true,
          Tty: false,
          Env: ['TERM=xterm-256color']
        });
        stream = await exec.start({ hijack: true, stdin: false });
      }
      
      let output = '';
      let isWebServer = false;

      return new Promise((resolve, reject) => {
        let commandTimeout;
        let isResolved = false;
        
        // Set timeout for long-running commands (5 minutes)
        const timeoutMs = 5 * 60 * 1000;
        commandTimeout = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            console.log(`⏰ Command timeout after ${timeoutMs/1000}s: ${command}`);
            resolve({
              output: output + '\n\n⏰ Command timed out after 5 minutes. Use Ctrl+C to stop long-running processes.',
              success: false,
              clearTerminal: false,
              timeout: true
            });
          }
        }, timeoutMs);
        
        stream.on('data', async (chunk) => {
          try {
            const data = chunk.toString();
            output += data;
            
            // Limit output size to prevent memory issues (max 1MB)
            if (output.length > 1024 * 1024) {
              output = output.substring(output.length - 1024 * 1024) + '\n\n[... Output truncated due to size limit ...]\n';
            }
            
            // Check if a web server is starting
            const serverDetection = this.detectWebServer(data);
            if (serverDetection.detected) {
              isWebServer = true;
              if (serverDetection.port) {
                console.log(`🌐 Web server detected on port ${serverDetection.port} for session ${this.sessionId}`);
                
                try {
                  // Trova la porta host mappata per questo container port
                  const containerInfo = await this.container.inspect();
                  const portBindings = containerInfo.NetworkSettings.Ports;
                  const containerPortKey = `${serverDetection.port}/tcp`;
                  const hostBinding = portBindings[containerPortKey];
                  
                  if (hostBinding && hostBinding.length > 0) {
                    const hostPort = hostBinding[0].HostPort;
                    
                    // Determina il tipo di server dal comando o output
                    const serverType = this.detectServerType(data, command || 'unknown');
                    
                    // Registra nel PreviewManager  
                    const serverInfo = previewManager.registerServer(
                      this.sessionId,
                      serverDetection.port,
                      hostPort,
                      serverType
                    );
                    
                    // Notifica il client
                    this.webSockets.forEach(ws => {
                      if (ws.readyState === 1) { // WebSocket.OPEN
                        ws.send(JSON.stringify({
                          type: 'server_detected',
                          port: serverDetection.port,
                          hostPort: hostPort,
                          sessionId: this.sessionId,
                          serverType: serverType,
                          previewUrl: `/preview/${this.sessionId}/`,
                          timestamp: Date.now()
                        }));
                      }
                    });
                    
                    console.log(`📡 Preview registered: ${this.sessionId} -> ${serverType} on :${hostPort}`);
                  } else {
                    console.log(`⚠️ Port ${serverDetection.port} detected but no host mapping found`);
                  }
                } catch (portError) {
                  console.error('Error processing server detection:', portError);
                }
              }
            }
          } catch (dataError) {
            console.error('Error processing command output:', dataError);
          }
        });

        stream.on('end', async () => {
          if (isResolved) return;
          isResolved = true;
          clearTimeout(commandTimeout);
          
          try {
            const execInfo = await exec.inspect();
            const success = execInfo.ExitCode === 0;

            // Update current directory if cd command
            if (updateDir && command.trim().startsWith('cd ')) {
              try {
                await this.updateCurrentDirectory();
              } catch (dirError) {
                console.error('Error updating directory:', dirError);
              }
            }

            // Check for exposed ports if web server detected
            if (isWebServer) {
              try {
                const containerInfo = await this.container.inspect();
                this.exposedPorts = this.extractExposedPorts(containerInfo);
              } catch (portError) {
                console.error('Error updating exposed ports:', portError);
              }
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
            console.error('Error in command end handler:', error);
            resolve({ 
              output: output + `\n\nError processing command result: ${error.message}`, 
              success: false, 
              clearTerminal: false 
            });
          }
        });

        stream.on('error', (error) => {
          if (isResolved) return;
          isResolved = true;
          clearTimeout(commandTimeout);
          
          console.error('Stream error:', error);
          reject(new Error(`Command execution failed: ${error.message}`));
        });
      });
    } catch (error) {
      throw error;
    }
  }

  detectWebServer(output) {
    const webServerPatterns = [
      // Generic server patterns
      /server.*running.*(?:port|on).*([0-9]{4,5})/i,
      /listening.*(?:port|on).*([0-9]{4,5})/i,
      /started.*server.*([0-9]{4,5})/i,
      /serving.*(?:port|on).*([0-9]{4,5})/i,
      /available.*(?:port|on).*([0-9]{4,5})/i,
      
      // Framework specific patterns
      // React/Next.js
      /local:.*http:\/\/localhost:([0-9]{4,5})/i,
      /webpack.*compiled.*successfully/i,
      /react.*app.*available/i,
      /next.*ready.*http:\/\/localhost:([0-9]{4,5})/i,
      
      // Vue.js
      /vue.*app.*running.*([0-9]{4,5})/i,
      /dev server running at.*([0-9]{4,5})/i,
      
      // Angular
      /angular.*live.*development.*server.*([0-9]{4,5})/i,
      /ng serve.*([0-9]{4,5})/i,
      
      // Python frameworks
      /django.*development server.*([0-9]{4,5})/i,
      /flask.*running.*([0-9]{4,5})/i,
      /fastapi.*uvicorn.*([0-9]{4,5})/i,
      /jupyter.*token.*([0-9]{4,5})/i,
      
      // Go
      /gin.*listening.*([0-9]{4,5})/i,
      /echo.*server started.*([0-9]{4,5})/i,
      
      // Java/Spring
      /tomcat.*started.*([0-9]{4,5})/i,
      /spring.*started.*([0-9]{4,5})/i,
      
      // Ruby/Rails
      /puma.*starting.*([0-9]{4,5})/i,
      /rails.*server.*([0-9]{4,5})/i,
      
      // PHP
      /php.*development server.*([0-9]{4,5})/i,
      /laravel.*development server.*([0-9]{4,5})/i,
      
      // Rust
      /actix.*starting.*([0-9]{4,5})/i,
      /rocket.*listening.*([0-9]{4,5})/i,
      
      // Flutter Web
      /flutter.*web.*server.*([0-9]{4,5})/i,
      /flutter.*run.*web.*([0-9]{4,5})/i,
      
      // Development tools
      /webpack.*dev.*server.*([0-9]{4,5})/i,
      /vite.*local.*([0-9]{4,5})/i,
      /parcel.*server.*([0-9]{4,5})/i
    ];

    // Cerca pattern che matchano e estrai la porta
    for (const pattern of webServerPatterns) {
      const match = output.match(pattern);
      if (match) {
        // Se la regex ha un gruppo di cattura per la porta, usalo
        if (match[1]) {
          const port = parseInt(match[1]);
          if (port >= 1000 && port <= 65535) {
            console.log(`🌐 Web server detected on port ${port}`);
            return { detected: true, port };
          }
        }
        // Altrimenti, cerca la porta nell'output con una regex generica
        const portMatch = output.match(/:([0-9]{4,5})/);
        if (portMatch) {
          const port = parseInt(portMatch[1]);
          if (port >= 1000 && port <= 65535) {
            console.log(`🌐 Web server detected on port ${port}`);
            return { detected: true, port };
          }
        }
        // Fallback: server rilevato ma porta non trovata
        console.log(`🌐 Web server detected but port not found`);
        return { detected: true, port: null };
      }
    }

    return { detected: false, port: null };
  }

  detectServerType(output, command = '') {
    const combined = (output + ' ' + command).toLowerCase();
    
    // Framework detection based on output patterns and commands
    if (combined.includes('react') || combined.includes('create-react-app') || combined.includes('react-scripts')) {
      return 'React';
    }
    if (combined.includes('next') || combined.includes('next.js')) {
      return 'Next.js';
    }
    if (combined.includes('vue') || combined.includes('@vue/cli') || combined.includes('vite')) {
      return 'Vue.js';
    }
    if (combined.includes('angular') || combined.includes('@angular/cli') || combined.includes('ng serve')) {
      return 'Angular';
    }
    if (combined.includes('django') || combined.includes('manage.py')) {
      return 'Django';
    }
    if (combined.includes('flask') || combined.includes('python') && combined.includes('app.py')) {
      return 'Flask';
    }
    if (combined.includes('fastapi') || combined.includes('uvicorn')) {
      return 'FastAPI';
    }
    if (combined.includes('jupyter') || combined.includes('notebook')) {
      return 'Jupyter';
    }
    if (combined.includes('streamlit')) {
      return 'Streamlit';
    }
    if (combined.includes('express') || combined.includes('node') && combined.includes('server')) {
      return 'Express.js';
    }
    if (combined.includes('flutter') && combined.includes('web')) {
      return 'Flutter Web';
    }
    if (combined.includes('rails') || combined.includes('puma')) {
      return 'Ruby on Rails';
    }
    if (combined.includes('laravel') || combined.includes('artisan')) {
      return 'Laravel';
    }
    if (combined.includes('spring') || combined.includes('tomcat')) {
      return 'Spring Boot';
    }
    if (combined.includes('gin') || combined.includes('echo') || combined.includes('go run')) {
      return 'Go Web Server';
    }
    if (combined.includes('rocket') || combined.includes('actix') || combined.includes('cargo run')) {
      return 'Rust Web Server';
    }
    if (combined.includes('webpack') || combined.includes('dev-server')) {
      return 'Webpack Dev Server';
    }
    if (combined.includes('vite')) {
      return 'Vite';
    }
    if (combined.includes('parcel')) {
      return 'Parcel';
    }
    if (combined.includes('gatsby')) {
      return 'Gatsby';
    }
    if (combined.includes('nuxt')) {
      return 'Nuxt.js';
    }
    
    return 'Web Server';
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

// Enhanced logging utility
class Logger {
  static info(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ℹ️  ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
  
  static error(message, error = null) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ ${message}`, error ? (error.stack || error.message || error) : '');
  }
  
  static warn(message, data = null) {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] ⚠️  ${message}`, data || '');
  }
  
  static success(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ✅ ${message}`, data || '');
  }
}

// Enhanced WebSocket connection handler with better error handling
wss.on('connection', (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  Logger.info(`New WebSocket connection from ${clientIP}`);
  let session = null;
  let connectionId = uuidv4();

  // Add WebSocket to session for notifications
  const addToSession = (targetSession) => {
    if (targetSession && targetSession.webSockets) {
      targetSession.webSockets.add(ws);
    }
  };

  // Remove WebSocket from session
  const removeFromSession = (targetSession) => {
    if (targetSession && targetSession.webSockets) {
      targetSession.webSockets.delete(ws);
    }
  };

  ws.on('message', async (data) => {
    try {
      // Validate message size (max 1MB)
      if (data.length > 1024 * 1024) {
        throw new Error('Message too large');
      }

      const message = JSON.parse(data.toString());
      
      // Validate required fields
      if (!message.type) {
        throw new Error('Message type is required');
      }
      
      Logger.info(`Received message: ${message.type}`, { connectionId, userId: session?.userId });
      
      switch (message.type) {
        case 'init':
          try {
            const userId = message.userId || `anonymous-${connectionId.substring(0, 8)}`;
            
            // Check if user already has a session
            if (sessions.has(userId)) {
              const existingSession = sessions.get(userId);
              // Reuse existing session if it's still healthy
              if (existingSession.container && existingSession.isInitialized) {
                session = existingSession;
                addToSession(session);
                Logger.info(`Reusing existing session for user: ${userId}`);
                
                ws.send(JSON.stringify({
                  type: 'init_result',
                  success: true,
                  containerId: session.containerId,
                  sessionId: session.sessionId,
                  exposedPorts: session.exposedPorts,
                  reused: true
                }));
                break;
              } else {
                // Cleanup invalid session
                await existingSession.destroy().catch(err => Logger.error('Cleanup error', err));
                sessions.delete(userId);
              }
            }
            
            session = new TerminalSession(userId);
            sessions.set(userId, session);
            addToSession(session);
            
            const initResult = await session.initialize();
            
            if (initResult.success) {
              Logger.success(`Session initialized for user: ${userId}`, {
                containerId: initResult.containerId,
                sessionId: initResult.sessionId
              });
            } else {
              Logger.error(`Session initialization failed for user: ${userId}`, initResult.error);
            }
            
            ws.send(JSON.stringify({
              type: 'init_result',
              ...initResult
            }));
          } catch (error) {
            Logger.error('Init error', error);
            ws.send(JSON.stringify({
              type: 'init_result',
              success: false,
              error: `Initialization failed: ${error.message}`
            }));
          }
          break;

        case 'command':
          if (!session) {
            Logger.warn('Command received without session', { connectionId });
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Session not initialized. Please send init message first.'
            }));
            return;
          }

          if (!message.command || typeof message.command !== 'string') {
            Logger.warn('Invalid command received', { command: message.command });
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Command must be a non-empty string'
            }));
            return;
          }

          // Sanitize command (basic protection)
          const command = message.command.trim();
          if (command.length > 1000) {
            Logger.warn('Command too long', { length: command.length });
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Command too long (max 1000 characters)'
            }));
            return;
          }

          try {
            Logger.info(`Executing command: ${command}`, { userId: session.userId, sessionId: session.sessionId });
            const startTime = Date.now();
            
            const result = await session.executeCommand(command);
            const executionTime = Date.now() - startTime;
            
            Logger.info(`Command completed in ${executionTime}ms`, { 
              success: result.success,
              outputLength: result.output?.length || 0
            });
            
            ws.send(JSON.stringify({
              type: 'command_result',
              command: command,
              output: result.output,
              success: result.success,
              clearTerminal: result.clearTerminal || false,
              exposedPorts: result.exposedPorts,
              webServerDetected: result.webServerDetected || false,
              executionTime: executionTime
            }));
          } catch (error) {
            Logger.error(`Command execution error: ${command}`, error);
            ws.send(JSON.stringify({
              type: 'command_result',
              command: command,
              output: `💥 Execution Error: ${error.message}\n\nThis might be due to:\n• Container connection lost\n• Resource limitations\n• Invalid command syntax\n\nTry reconnecting or check your command.`,
              success: false,
              clearTerminal: false,
              error: true
            }));
          }
          break;

        case 'ping':
          ws.send(JSON.stringify({ 
            type: 'pong',
            timestamp: Date.now(),
            sessionId: session?.sessionId
          }));
          if (session) session.updateActivity();
          break;

        case 'get_status':
          if (!session) {
            ws.send(JSON.stringify({
              type: 'status',
              connected: false,
              message: 'No active session'
            }));
            return;
          }
          
          try {
            // Check container health
            const containerInfo = await session.container?.inspect();
            const isHealthy = containerInfo?.State?.Running === true;
            
            ws.send(JSON.stringify({
              type: 'status',
              connected: true,
              healthy: isHealthy,
              sessionId: session.sessionId,
              containerId: session.containerId,
              workingDir: session.workingDir,
              exposedPorts: session.exposedPorts,
              uptime: Date.now() - session.createdAt,
              aiAgent: aiAgent.getStats()
            }));
          } catch (error) {
            Logger.error('Status check error', error);
            ws.send(JSON.stringify({
              type: 'status',
              connected: true,
              healthy: false,
              error: 'Container status check failed'
            }));
          }
          break;

        case 'ai_chat':
          if (!session) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Session not initialized'
            }));
            return;
          }

          try {
            Logger.info(`AI Chat request: ${message.prompt}`, { userId: session.userId });
            
            const aiResponse = await aiAgent.generateResponse(message.prompt, {
              workingDir: session.workingDir,
              model: message.model,
              temperature: message.temperature
            });
            
            ws.send(JSON.stringify({
              type: 'ai_chat_response',
              response: aiResponse,
              timestamp: Date.now()
            }));
          } catch (error) {
            Logger.error('AI Chat error', error);
            ws.send(JSON.stringify({
              type: 'ai_chat_error',
              error: error.message,
              timestamp: Date.now()
            }));
          }
          break;

        case 'agent_execute_task':
          if (!session) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Session not initialized'
            }));
            return;
          }

          try {
            Logger.info(`Agent autonomous task: ${message.task}`, { userId: session.userId });
            
            // Esegui il task autonomo in background
            aiAgent.executeAutonomousTask(message.task, session, ws)
              .then(result => {
                Logger.success(`Agent task completed: ${message.task}`, { 
                  duration: result.duration, 
                  steps: result.stepsCount 
                });
              })
              .catch(error => {
                Logger.error(`Agent task failed: ${message.task}`, error);
              });
            
            // Risposta immediata che il task è iniziato
            ws.send(JSON.stringify({
              type: 'agent_task_acknowledged',
              task: message.task,
              timestamp: Date.now()
            }));
          } catch (error) {
            Logger.error('Agent task error', error);
            ws.send(JSON.stringify({
              type: 'agent_task_error',
              error: error.message,
              timestamp: Date.now()
            }));
          }
          break;

        case 'agent_get_providers':
          try {
            const providers = aiAgent.getAvailableProviders();
            ws.send(JSON.stringify({
              type: 'agent_providers',
              providers: providers,
              currentProvider: aiAgent.activeProvider,
              timestamp: Date.now()
            }));
          } catch (error) {
            Logger.error('Agent providers error', error);
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Failed to get AI providers'
            }));
          }
          break;

        case 'agent_switch_provider':
          try {
            aiAgent.setActiveProvider(message.provider);
            Logger.info(`AI provider switched to: ${message.provider}`);
            
            ws.send(JSON.stringify({
              type: 'agent_provider_switched',
              provider: message.provider,
              timestamp: Date.now()
            }));
          } catch (error) {
            Logger.error('Agent provider switch error', error);
            ws.send(JSON.stringify({
              type: 'error',
              message: `Failed to switch provider: ${error.message}`
            }));
          }
          break;

        default:
          Logger.warn(`Unknown message type: ${message.type}`, { connectionId });
          ws.send(JSON.stringify({
            type: 'error',
            message: `Unknown message type: ${message.type}`,
            availableTypes: ['init', 'command', 'ping', 'get_status']
          }));
      }
    } catch (error) {
      Logger.error('WebSocket message processing error', error);
      
      // Try to send error response if WebSocket is still open
      if (ws.readyState === 1) { // WebSocket.OPEN
        try {
          ws.send(JSON.stringify({
            type: 'error',
            message: error.message.includes('JSON') ? 'Invalid JSON format' : 'Message processing failed',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
          }));
        } catch (sendError) {
          Logger.error('Failed to send error response', sendError);
        }
      }
    }
  });

  ws.on('close', async (code, reason) => {
    Logger.info(`WebSocket connection closed`, { 
      connectionId, 
      code, 
      reason: reason?.toString(), 
      userId: session?.userId 
    });
    
    // Remove WebSocket from session
    if (session) {
      removeFromSession(session);
      
      // Only destroy session if no other WebSockets are connected
      if (session.webSockets.size === 0) {
        Logger.info(`No more connections for session ${session.sessionId}, scheduling cleanup`);
        
        // Schedule session cleanup after 5 minutes of inactivity
        setTimeout(async () => {
          if (session.webSockets.size === 0 && Date.now() - session.lastActivity > 5 * 60 * 1000) {
            Logger.info(`Cleaning up inactive session: ${session.sessionId}`);
            await session.destroy().catch(err => Logger.error('Session cleanup error', err));
            sessions.delete(session.userId);
          }
        }, 5 * 60 * 1000); // 5 minutes
      }
    }
  });

  ws.on('error', (error) => {
    Logger.error(`WebSocket error for connection ${connectionId}`, error);
    
    // Clean up session reference
    if (session) {
      removeFromSession(session);
    }
  });
  
  // Send initial connection acknowledgment
  ws.send(JSON.stringify({
    type: 'connection_established',
    connectionId: connectionId,
    timestamp: Date.now(),
    message: 'Welcome to Warp Mobile AI IDE! Send an "init" message to start.'
  }));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    activeSessions: sessions.size,
    unsplashGallery: require('fs').existsSync(path.join(__dirname, '../unsplash-gallery/dist'))
  });
});

// Serve React app at root for /unsplash route
app.get('/unsplash/*', (req, res) => {
  const reactBuildPath = path.join(__dirname, '../unsplash-gallery/dist');
  if (require('fs').existsSync(reactBuildPath)) {
    res.sendFile(path.join(reactBuildPath, 'index.html'));
  } else {
    res.status(404).json({ error: 'Unsplash Gallery not built. Run: npm run build in unsplash-gallery/' });
  }
});

// Container list endpoint
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

// Preview management API
app.get('/api/preview/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const serverInfo = previewManager.getServerInfo(sessionId);
  
  if (!serverInfo) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json({
    sessionId,
    ...serverInfo,
    previewUrl: previewManager.getPreviewUrl(sessionId, `${req.protocol}://${req.get('host')}`)
  });
});

app.get('/api/preview', (req, res) => {
  res.json({
    servers: previewManager.getAllServers(),
    stats: previewManager.getStats()
  });
});

app.post('/api/preview/:sessionId/health', async (req, res) => {
  const { sessionId } = req.params;
  const healthResult = await previewManager.healthCheck(sessionId);
  res.json({ sessionId, ...healthResult });
});

app.delete('/api/preview/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  previewManager.removeServer(sessionId);
  res.json({ message: 'Preview server removed', sessionId });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log('🚀 Terminal Backend Server started');
  console.log(`📡 WebSocket server running on ws://localhost:${PORT}`);
  console.log(`🌐 HTTP server running on http://localhost:${PORT}`);
  console.log(`🎭 Preview server available at http://localhost:${PORT}/preview/:sessionId/`);
  console.log('📊 Health check: http://localhost:' + PORT + '/health');
  
  // Cleanup automatico ogni 5 minuti
  setInterval(() => {
    console.log('🧹 Running cleanup tasks...');
    
    // Cleanup preview servers inattivi
    const cleanedPreviews = previewManager.cleanupInactiveServers(30 * 60 * 1000); // 30 minuti
    if (cleanedPreviews > 0) {
      console.log(`🧹 Cleaned ${cleanedPreviews} inactive preview servers`);
    }
    
    // Cleanup sessioni inattive
    let cleanedSessions = 0;
    const now = Date.now();
    const sessionTimeout = 30 * 60 * 1000; // 30 minuti
    
    for (const [userId, session] of sessions.entries()) {
      if (now - session.lastActivity > sessionTimeout) {
        console.log(`🧹 Cleaning up inactive session: ${userId}`);
        session.destroy().catch(err => console.error('Cleanup error:', err));
        sessions.delete(userId);
        cleanedSessions++;
      }
    }
    
    if (cleanedSessions > 0) {
      console.log(`🧹 Cleaned ${cleanedSessions} inactive sessions`);
    }
    
    // Log statistiche
    const stats = previewManager.getStats();
    console.log(`📊 Active: ${sessions.size} sessions, ${stats.activeServers} preview servers`);
  }, 5 * 60 * 1000); // Ogni 5 minuti
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down server...');
  
  // Cleanup preview servers
  console.log('🧹 Cleaning up preview servers...');
  for (const sessionId of previewManager.activeServers.keys()) {
    previewManager.removeServer(sessionId);
  }
  
  // Destroy all sessions
  console.log('🧹 Destroying container sessions...');
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
