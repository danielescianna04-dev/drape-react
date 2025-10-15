// Lambda Handler - Command Execution with Smart Routing
const UserManager = require('./user-manager');
const CommandExecutor = require('./command-executor');
const AIAgent = require('./ai-agent');
const https = require('https');
const http = require('http');

// ECS Configuration
const ECS_ENDPOINT = process.env.ECS_ENDPOINT; // Set in CloudFormation
const ECS_SERVICE_NAME = process.env.ECS_SERVICE_NAME;
const AWS = require('aws-sdk');
const ecs = new AWS.ECS();

// Initialize managers (singleton pattern per Lambda container)
let userManager;
let commandExecutor; 
let aiAgent;

// Commands that require ECS (heavy/complex operations)
const HEAVY_COMMANDS = [
  'flutter', 'dart', 'build', 'compile', 'install', 'pod install',
  'npm install', 'yarn install', 'pip install', 'pip3', 'apt-get', 'brew',
  'python', 'python3', 'gradle', 'make', 'cmake', 'webpack', 'vite', 'rollup'
  // 'docker' removed for now - will be added in next iteration
];

// Check if command should run on ECS
function shouldUseECS(command) {
  const cmd = command.toLowerCase().trim();
  
  // PRIORITÀ ASSOLUTA: Tutti i comandi Flutter e Python vanno su ECS
  if (cmd.includes('flutter') || cmd.includes('dart') || cmd.startsWith('flutter') || cmd.startsWith('dart')) {
    return true;
  }
  
  if (cmd.includes('python') || cmd.includes('pip') || cmd.startsWith('python') || cmd.startsWith('pip')) {
    return true;
  }
  
  // Check for heavy commands
  if (HEAVY_COMMANDS.some(heavy => cmd.startsWith(heavy))) {
    return true;
  }
  
  // Check for build operations
  if (cmd.includes('build') || cmd.includes('compile') || cmd.includes('install')) {
    return true;
  }
  
  // Long running operations
  if (cmd.includes('download') || cmd.includes('upload') || cmd.includes('deploy')) {
    return true;
  }
  
  return false;
}

// Initialize on cold start
const initialize = async () => {
  if (!userManager) {
    userManager = new UserManager('/tmp'); // Temporary storage
    commandExecutor = new CommandExecutor();
    aiAgent = new AIAgent();
    await aiAgent.initialize();
    console.log('🚀 Lambda handlers initialized');
  }
};

exports.handler = async (event, context) => {
  try {
    // Initialize on cold start
    await initialize();

    // Parse event (from API Gateway)
    const { httpMethod, path: requestPath, body, headers } = event;
    const requestBody = body ? JSON.parse(body) : {};

    console.log(`📡 ${httpMethod} ${requestPath}`, requestBody);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-ID, X-Session-ID',
    };

    // Handle preflight OPTIONS
    if (httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'CORS preflight' })
      };
    }

    // Extract user info
    const userId = headers['X-User-ID'] || headers['x-user-id'] || 'anonymous';
    const sessionId = headers['X-Session-ID'] || headers['x-session-id'];

    // Route handlers
    switch (requestPath) {
      case '/session/create':
        return await handleCreateSession(userId, corsHeaders);
      
      case '/command/execute':
        return await handleExecuteCommand(requestBody, sessionId, corsHeaders);
        
      case '/ai/chat':
        return await handleAIChat(requestBody, sessionId, corsHeaders);
        
      case '/ai/agent':
        return await handleAIAgent(requestBody, sessionId, corsHeaders);
        
      case '/files/list':
        return await handleListFiles(requestBody, sessionId, corsHeaders);
        
      case '/files/read':
        return await handleReadFile(requestBody, sessionId, corsHeaders);
        
      case '/files/write':
        return await handleWriteFile(requestBody, sessionId, corsHeaders);

      case '/health':
        return await handleHealthCheck(corsHeaders);
        
      default:
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Route not found' })
        };
    }

  } catch (error) {
    console.error('❌ Lambda handler error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

// Handler functions
async function handleCreateSession(userId, headers) {
  try {
    const session = await userManager.createUserSession(userId);
    
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        session: {
          sessionId: session.sessionId,
          userId: session.userId,
          workspaceDir: session.workspaceDir,
          quotaRemaining: session.fileQuota
        }
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
}

async function handleExecuteCommand(requestBody, sessionId, headers) {
  try {
    if (!sessionId) {
      throw new Error('Session ID required');
    }

    const { command, streaming = false, forceECS = false } = requestBody;
    if (!command) {
      throw new Error('Command required');
    }

    const session = await userManager.getUserSession(sessionId);
    
    // Smart routing decision
    const useECS = forceECS || shouldUseECS(command);
    
    if (useECS && ECS_ENDPOINT) {
      console.log(`🚀 Routing to ECS: ${command}`);
      
      try {
        // Ensure ECS task is running
        await ensureECSTaskRunning();
        
        // Execute on ECS
        const result = await executeOnECS(command, session);
        
        return {
          statusCode: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...result,
            executor: 'ecs-fargate',
            routing: 'smart'
          })
        };
      } catch (ecsError) {
        console.error('⚠️  ECS execution failed, falling back to Lambda:', ecsError.message);
        
        // Fallback to Lambda if ECS fails
        const result = await commandExecutor.executeCommand(command, session, streaming);
        return {
          statusCode: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...result,
            executor: 'lambda-fallback',
            routing: 'fallback',
            ecsError: ecsError.message
          })
        };
      }
    } else {
      console.log(`⚡ Executing on Lambda: ${command}`);
      
      // Execute on Lambda (fast commands)
      const result = await commandExecutor.executeCommand(command, session, streaming);
      
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...result,
          executor: 'lambda',
          routing: 'smart'
        })
      };
    }
  } catch (error) {
    return {
      statusCode: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
}

async function handleAIChat(requestBody, sessionId, headers) {
  try {
    if (!sessionId) {
      throw new Error('Session ID required');
    }

    const { prompt, context } = requestBody;
    if (!prompt) {
      throw new Error('Prompt required');
    }

    const session = await userManager.getUserSession(sessionId);
    
    // Add session context to AI request
    const aiContext = {
      ...context,
      workingDir: session.workspaceDir,
      sessionId: session.sessionId,
      userId: session.userId
    };

    const response = await aiAgent.generateResponse(prompt, aiContext);
    
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        response: response.content,
        model: response.model,
        provider: response.provider,
        responseTime: response.responseTime
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
}

async function handleAIAgent(requestBody, sessionId, headers) {
  try {
    if (!sessionId) {
      throw new Error('Session ID required');
    }

    const { task } = requestBody;
    if (!task) {
      throw new Error('Task required');
    }

    const session = await userManager.getUserSession(sessionId);
    
    // AI Agent will use CommandExecutor to perform actions
    const agentExecutor = {
      executeCommand: async (command) => {
        return await commandExecutor.executeCommand(command, session, false);
      },
      readFile: async (filePath) => {
        return await commandExecutor.readFile(filePath, session);
      },
      writeFile: async (filePath, content) => {
        return await commandExecutor.writeFile(filePath, content, session);
      }
    };

    const execution = await aiAgent.executeAutonomousTask(task, agentExecutor, null);
    
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        task,
        status: execution.status,
        steps: execution.steps.length,
        duration: execution.duration,
        result: execution.result
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
}

async function handleListFiles(requestBody, sessionId, headers) {
  try {
    if (!sessionId) {
      throw new Error('Session ID required');
    }

    const { path: dirPath } = requestBody;
    const session = await userManager.getUserSession(sessionId);
    const result = await commandExecutor.listFiles(dirPath, session);
    
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
}

async function handleReadFile(requestBody, sessionId, headers) {
  try {
    if (!sessionId) {
      throw new Error('Session ID required');
    }

    const { path: filePath } = requestBody;
    if (!filePath) {
      throw new Error('File path required');
    }

    const session = await userManager.getUserSession(sessionId);
    const result = await commandExecutor.readFile(filePath, session);
    
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
}

async function handleWriteFile(requestBody, sessionId, headers) {
  try {
    if (!sessionId) {
      throw new Error('Session ID required');
    }

    const { path: filePath, content } = requestBody;
    if (!filePath || content === undefined) {
      throw new Error('File path and content required');
    }

    const session = await userManager.getUserSession(sessionId);
    const result = await commandExecutor.writeFile(filePath, content, session);
    
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
}

async function handleHealthCheck(headers) {
  const ecsStatus = ECS_ENDPOINT ? 'configured' : 'not-configured';
  
  return {
    statusCode: 200,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0-lambda-hybrid',
      environment: 'AWS Lambda + ECS Fargate',
      ecsStatus,
      uptime: process.uptime()
    })
  };
}

// ECS Helper Functions
async function ensureECSTaskRunning() {
  if (!ECS_SERVICE_NAME) {
    throw new Error('ECS service not configured');
  }
  
  try {
    // Check if service has running tasks
    const params = {
      cluster: process.env.ECS_CLUSTER_NAME || 'warp-mobile-cluster',
      services: [ECS_SERVICE_NAME]
    };
    
    const serviceData = await ecs.describeServices(params).promise();
    const service = serviceData.services[0];
    
    if (!service) {
      throw new Error('ECS service not found');
    }
    
    // If no running tasks, update service to ensure at least 1 task
    if (service.runningCount === 0) {
      console.log('🚀 Starting ECS task...');
      
      await ecs.updateService({
        cluster: params.cluster,
        service: ECS_SERVICE_NAME,
        desiredCount: 1
      }).promise();
      
      // Wait for task to be running (max 2 minutes)
      await waitForTaskRunning(params.cluster, ECS_SERVICE_NAME);
    }
    
    return true;
  } catch (error) {
    console.error('ECS task management error:', error);
    throw new Error(`Failed to ensure ECS task is running: ${error.message}`);
  }
}

async function waitForTaskRunning(cluster, serviceName, maxWaitTime = 120000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const serviceData = await ecs.describeServices({
        cluster,
        services: [serviceName]
      }).promise();
      
      const service = serviceData.services[0];
      if (service && service.runningCount > 0) {
        console.log('✅ ECS task is running');
        return true;
      }
      
      // Wait 5 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      console.error('Error checking ECS service status:', error);
      break;
    }
  }
  
  throw new Error('Timeout waiting for ECS task to start');
}

async function executeOnECS(command, session) {
  if (!ECS_ENDPOINT) {
    throw new Error('ECS endpoint not configured');
  }
  
  const payload = {
    command,
    workingDir: session.workspaceDir || '/workspace',
    repository: session.repository || 'warp-mobile-ai-ide'
  };
  
  console.log('🔍 Lambda DEBUG: Sending payload to ECS:', JSON.stringify(payload, null, 2));
  
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const url = new URL(ECS_ENDPOINT + '/execute-heavy');
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30 * 60 * 1000 // 30 minutes timeout
    };
    
    const client = url.protocol === 'https:' ? https : http;
    
    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          console.log('🔍 Lambda DEBUG: Raw ECS response:', data);
          const result = JSON.parse(data);
          console.log('🔍 Lambda DEBUG: Parsed ECS result:', JSON.stringify(result, null, 2));
          resolve(result);
        } catch (parseError) {
          console.error('❌ Lambda ERROR: Failed to parse ECS response:', parseError.message);
          console.error('❌ Lambda ERROR: Raw response was:', data);
          reject(new Error(`Failed to parse ECS response: ${parseError.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(new Error(`ECS request failed: ${error.message}`));
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('ECS request timeout'));
    });
    
    req.write(postData);
    req.end();
  });
}
