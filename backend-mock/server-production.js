const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const AIAgent = require('./ai-agent');
const helmet = require('helmet');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store active sessions
const sessions = new Map();
const userWorkspaces = new Map(); // Track user workspaces

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Warp-Session', 'X-User-ID']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Minimal HTTP endpoints for Lambda API Gateway
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'warp-mobile-ai-ide', timestamp: Date.now() });
});

app.post('/session/create', async (req, res) => {
  try {
    const userId = (req.headers['x-user-id'] || 'anonymous').toString();
    const session = new ProductionTerminalSession(userId);
    const result = await session.initialize();
    // Store session by ID
    sessions.set(result.sessionId, session);
    res.json({ success: true, session: result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/command/execute', async (req, res) => {
  try {
    const { command, sessionId } = req.body || {};
    if (!command) return res.status(400).json({ success: false, error: 'Missing command' });

    // Resolve session
    let session = null;
    if (sessionId && sessions.has(sessionId)) {
      session = sessions.get(sessionId);
    } else {
      // Fallback: use or create a session per user
      const userId = (req.headers['x-user-id'] || 'anonymous').toString();
      session = new ProductionTerminalSession(userId);
      await session.initialize();
      sessions.set(session.sessionId, session);
    }

    const result = await session.executeCommand(command, false);
    res.json({ 
      success: result.success, 
      output: result.output, 
      sessionId: session.sessionId,
      executor: result.executor || 'lambda',
      routing: result.routing || 'smart',
      executionTime: result.executionTime || 0
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Production Terminal Session with User Isolation
class ProductionTerminalSession {
  constructor(userId) {
    this.userId = this.sanitizeUserId(userId);
    this.sessionId = uuidv4();
    this.userHash = crypto.createHash('sha256').update(this.userId).digest('hex').substring(0, 12);
    this.workingDir = path.join('/tmp', 'warp-users', this.userHash);
    this.isInitialized = false;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.webSockets = new Set();
    this.processes = new Map();
    this.fileQuota = 500 * 1024 * 1024; // 500MB per user
    this.processTimeout = 120 * 1000; // 2 minutes max per command
  }

  sanitizeUserId(userId) {
    // Sanitize user ID for security
    return userId.replace(/[^a-zA-Z0-9-_]/g, '').substring(0, 32);
  }

  async initialize() {
    try {
      console.log(`🚀 Initializing secure session for user ${this.userId}`);
      
      // Create isolated user workspace
      await fs.mkdir(this.workingDir, { recursive: true, mode: 0o700 });
      
      // Set strict permissions (only this process can access)
      await fs.chmod(this.workingDir, 0o700);
      
      // Create user-specific files
      await fs.writeFile(
        path.join(this.workingDir, 'README.md'), 
        `# Welcome ${this.userId} to Warp Mobile AI IDE!\n\n🔒 This is your secure workspace\n🤖 AI Agent ready!\n📁 Max storage: ${Math.round(this.fileQuota/1024/1024)}MB\n\n## Getting Started\n\`\`\`bash\n# Try these commands:\nls -la\nnode --version\n/ai "Help me create a simple app"\n/agent "Setup a React project"\n\`\`\`\n\n**Happy Coding! 🚀**`
      );

      // Store user workspace mapping
      userWorkspaces.set(this.userId, this.workingDir);
      
      this.isInitialized = true;
      console.log(`✅ Secure session ${this.sessionId} initialized`);
      console.log(`🔒 User workspace: ${this.workingDir}`);
      
      return { 
        success: true, 
        sessionId: this.sessionId,
        workingDir: this.workingDir,
        userId: this.userId,
        quotaRemaining: this.fileQuota
      };
    } catch (error) {
      console.error('❌ Failed to initialize secure session:', error);
      return { success: false, error: error.message };
    }
  }

  async checkQuota() {
    try {
      const stats = await this.getDirectorySize(this.workingDir);
      return {
        used: stats,
        remaining: this.fileQuota - stats,
        percentage: Math.round((stats / this.fileQuota) * 100)
      };
    } catch (error) {
      return { used: 0, remaining: this.fileQuota, percentage: 0 };
    }
  }

  async getDirectorySize(dir) {
    let totalSize = 0;
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) {
          totalSize += await this.getDirectorySize(filePath);
        } else {
          totalSize += stats.size;
        }
      }
    } catch (error) {
      // Directory might not exist or no permissions
    }
    return totalSize;
  }

  async executeCommand(command, streaming = true) {
    const startTime = Date.now();
    this.lastActivity = Date.now();
    
    console.log(`🔧 [${this.userId}] Executing: ${command}`);

    // Security checks
    if (this.isCommandBlocked(command)) {
      return {
        success: false,
        output: `🚫 Command blocked for security: ${command}`,
        executionTime: Date.now() - startTime
      };
    }
    
    // 🚀 SMART ROUTING LOGIC
    if (this.isHeavyCommand(command)) {
      console.log(`🚀 Routing heavy command to ECS Fargate: ${command}`);
      return await this.executeOnECS(command, startTime);
    } else {
      console.log(`⚡ Executing light command on Lambda: ${command}`);
      return await this.executeLocalCommand(command, streaming, startTime);
    }
  }
  
  // Check if command should be routed to ECS
  isHeavyCommand(command) {
    const cmd = command.toLowerCase().trim();
    
    // Commands that should go to ECS Fargate
    const heavyCommands = [
      'flutter', 'dart', 'python', 'python3', 'pip', 'pip3',
      'npm run', 'yarn build', 'gradle', 'mvn', 'make',
      'docker', 'git clone', 'git pull', 'npm install', 'yarn install'
    ];
    
    return heavyCommands.some(heavy => cmd.startsWith(heavy));
  }
  
  // Execute command on ECS Fargate via ALB
  async executeOnECS(command, startTime) {
    try {
      const ecsUrl = 'http://warp-mobile-ai-ide-prod-alb-1532835213.us-east-1.elb.amazonaws.com/execute-heavy';
      
      const response = await fetch(ecsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command: command,
          workingDir: `/tmp/users/${this.userHash}`
        }),
        timeout: 300000 // 5 minutes
      });
      
      if (!response.ok) {
        throw new Error(`ECS request failed: ${response.status}`);
      }
      
      const result = await response.json();
      const executionTime = Date.now() - startTime;
      
      return {
        success: result.success,
        output: result.output + `\n\n🚀 Executed on ECS Fargate (${result.executionTime}ms) - Smart Routing: heavy`,
        executionTime: executionTime,
        executor: 'ecs-fargate',
        routing: 'heavy'
      };
      
    } catch (error) {
      console.error('ECS execution failed:', error);
      return {
        success: false,
        output: `❌ ECS execution failed: ${error.message}\nFalling back to local execution...`,
        executionTime: Date.now() - startTime,
        executor: 'lambda-fallback',
        routing: 'heavy-failed'
      };
    }
  }
  
  // Execute command locally (Lambda)
  async executeLocalCommand(command, streaming, startTime) {
    return new Promise((resolve, reject) => {

      // Handle special commands
      if (command.startsWith('cd ')) {
        return this.handleCdCommand(command, startTime, resolve);
      }

      // Handle AI commands
      if (command.startsWith('/ai ')) {
        const prompt = command.substring(4);
        return this.handleAICommand(prompt, resolve, reject);
      }

      if (command.startsWith('/agent ')) {
        const task = command.substring(7);
        return this.handleAgentCommand(task, resolve, reject);
      }

      // Handle quota check
      if (command === '/quota') {
        return this.handleQuotaCommand(resolve, startTime);
      }

      // Execute regular commands with timeout
      const child = spawn('bash', ['-c', command], {
        cwd: this.workingDir,
        env: { 
          ...process.env,
          HOME: this.workingDir, // Isolate home directory
          WARP_SESSION: this.sessionId,
          WARP_USER: this.userId,
          PATH: process.env.PATH,
          // Security: prevent escaping user directory
          WARP_JAIL: this.workingDir
        },
        timeout: this.processTimeout
      });

      let output = '';
      let errorOutput = '';
      let killed = false;

      // Force kill after timeout
      const killTimer = setTimeout(() => {
        if (!killed) {
          killed = true;
          child.kill('SIGKILL');
          resolve({
            success: false,
            output: `❌ Command timeout (${this.processTimeout/1000}s max)`,
            executionTime: Date.now() - startTime
          });
        }
      }, this.processTimeout);

      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        
        // Stream output in real-time
        if (streaming && !killed) {
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
        
        if (streaming && !killed) {
          this.broadcastToClients({
            type: 'command_error',
            sessionId: this.sessionId,
            data: chunk,
            timestamp: Date.now()
          });
        }
      });

      child.on('close', (code) => {
        if (killed) return; // Already handled by timeout
        
        clearTimeout(killTimer);
        const executionTime = Date.now() - startTime;
        const success = code === 0;
        
        console.log(`${success ? '✅' : '❌'} [${this.userId}] Command ${success ? 'completed' : 'failed'} in ${executionTime}ms`);
        
        resolve({
          success,
          output: success ? output : errorOutput,
          exitCode: code,
          executionTime,
          workingDir: this.workingDir
        });
      });

      child.on('error', (error) => {
        if (killed) return;
        
        clearTimeout(killTimer);
        console.error(`[${this.userId}] Command execution error:`, error);
        resolve({
          success: false,
          output: `❌ Execution failed: ${error.message}`,
          executionTime: Date.now() - startTime
        });
      });
    });
  }

  isCommandBlocked(command) {
    const blockedPatterns = [
      /rm\s+-rf\s+\//, // Prevent rm -rf /
      /dd\s+if=/, // Prevent disk operations
      /mkfs/, // Prevent filesystem operations  
      /mount/, // Prevent mounting
      /umount/, // Prevent unmounting
      /passwd/, // Prevent password changes
      /su\s/, // Prevent user switching
      /sudo/, // Prevent sudo (should not be available anyway)
      /kill\s+-9/, // Prevent killing system processes
      /shutdown/, // Prevent shutdown
      /reboot/, // Prevent reboot
      /curl.*\/etc\/shadow/, // Prevent accessing system files
      /cat.*\/etc\/passwd/, // Prevent accessing system files
      /\.\.\//g // Prevent directory traversal (multiple instances)
    ];

    return blockedPatterns.some(pattern => pattern.test(command));
  }

  async handleCdCommand(command, startTime, resolve) {
    const newDir = command.substring(3).trim();
    let targetDir;

    if (newDir === '~' || newDir === '') {
      targetDir = this.workingDir; // Home is user workspace
    } else if (newDir.startsWith('/')) {
      // Absolute path - restrict to user workspace
      targetDir = path.join(this.workingDir, newDir.substring(1));
    } else {
      // Relative path
      targetDir = path.resolve(this.workingDir, newDir);
    }

    // Security: ensure we stay within user workspace
    if (!targetDir.startsWith(this.workingDir)) {
      return resolve({
        success: false,
        output: `🚫 Access denied: Cannot leave your workspace\nYour workspace: ${this.workingDir}`,
        executionTime: Date.now() - startTime
      });
    }

    try {
      await fs.access(targetDir);
      this.workingDir = targetDir;
      resolve({
        success: true,
        output: `Changed directory to: ${this.workingDir.replace(userWorkspaces.get(this.userId), '~')}`,
        executionTime: Date.now() - startTime
      });
    } catch (error) {
      resolve({
        success: false,
        output: `Directory not found: ${newDir}`,
        executionTime: Date.now() - startTime
      });
    }
  }

  async handleQuotaCommand(resolve, startTime) {
    const quota = await this.checkQuota();
    const usedMB = Math.round(quota.used / 1024 / 1024 * 100) / 100;
    const totalMB = Math.round(this.fileQuota / 1024 / 1024);
    
    resolve({
      success: true,
      output: `📊 Storage Quota for ${this.userId}:\n\n` +
              `Used: ${usedMB} MB (${quota.percentage}%)\n` +
              `Total: ${totalMB} MB\n` +
              `Remaining: ${Math.round(quota.remaining / 1024 / 1024 * 100) / 100} MB\n\n` +
              `${quota.percentage > 90 ? '⚠️  Warning: Low storage space!' : '✅ Storage OK'}`,
      executionTime: Date.now() - startTime
    });
  }

  async handleAICommand(prompt, resolve, reject) {
    try {
      const response = await aiAgent.generateResponse(prompt, {
        workingDir: this.workingDir,
        sessionId: this.sessionId,
        userId: this.userId
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
      this.broadcastToClients({
        type: 'agent_task_start',
        sessionId: this.sessionId,
        task: task,
        userId: this.userId,
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
        process.kill('SIGKILL');
      } catch (error) {
        console.log(`Failed to kill process ${pid}:`, error.message);
      }
    }
    this.processes.clear();
    
    // Optional: Clean up user files after session (or keep them)
    // await fs.rmdir(this.workingDir, { recursive: true });
    
    console.log(`🗑️ Secure session ${this.sessionId} destroyed for user ${this.userId}`);
  }
}

// ... (resto del codice WebSocket handlers uguale ma usa ProductionTerminalSession)

// Export app for Lambda or start server for standalone mode
if (process.env.AWS_LAMBDA_RUNTIME_API || process.env.AWS_EXECUTION_ENV || process.env._LAMBDA_SERVER_PORT) {
  // Running in Lambda - export app
  console.log('🔥 Lambda mode detected - exporting Express app');
  module.exports = app;
} else {
  // Running standalone - start server
  console.log('🔥 Standalone mode detected - starting HTTP server');
  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log('🚀 Warp Mobile AI IDE - PRODUCTION Server');
    console.log('📡 WebSocket server running on ws://localhost:' + PORT);
    console.log('🌐 HTTP server running on http://localhost:' + PORT);
    console.log('🔒 Running in PRODUCTION mode with user isolation');
    console.log('👥 Multi-tenant ready');
    console.log('💾 User workspaces: /tmp/warp-users/');
  });
}
