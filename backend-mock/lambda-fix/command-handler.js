// Lambda Handler - Command Execution with Smart Routing (fixed version)
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
  // Flutter & Dart
  'flutter', 'dart',
  
  // Node.js & JavaScript
  'npm', 'yarn', 'pnpm', 'node', 'webpack', 'vite', 'rollup', 'next', 'nuxt',
  
  // Python
  'python', 'python3', 'pip', 'pip3', 'pytest', 'uvicorn', 'gunicorn', 'django-admin',
  
  // Java & JVM
  'java', 'javac', 'maven', 'mvn', 'gradle', './gradlew', './mvnw', 'spring-boot',
  
  // Go
  'go',
  
  // Rust
  'cargo', 'rustc',
  
  // C/C++
  'gcc', 'g++', 'clang', 'clang++', 'make', 'cmake', 'ninja',
  
  // .NET
  'dotnet', 'msbuild',
  
  // PHP
  'php', 'composer',
  
  // Ruby
  'ruby', 'bundle', 'rails', 'rake',
  
  // Swift
  'swift', 'xcodebuild',
  
  // Angular & Vue
  'ng', 'vue', 'vue-cli-service',
  
  // Build & compilation operations
  'build', 'compile', 'install', 'test', 'deploy',
  
  // Package managers & system
  'apt-get', 'yum', 'brew', 'pod',
  
  // Docker (to be enabled later)
  // 'docker', 'docker-compose'
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

// Helper function to combine output and error streams
function combineOutputAndError(output, error) {
  if (!output && !error) return '';
  if (!error) return output;
  if (!output) return error;
  return output + '\n' + error;
}

// Helper function to validate repository context
function validateRepositoryContext(command, repository) {
  const cmdLower = command.toLowerCase().trim();
  
  // Define project-specific commands for different languages/frameworks
  const projectCommands = {
    flutter: {
      commands: ['flutter run', 'flutter build', 'flutter test', 'flutter pub get', 'flutter pub upgrade', 'flutter clean', 'flutter analyze'],
      projectType: 'Flutter project',
      files: ['pubspec.yaml']
    },
    dart: {
      commands: ['dart run', 'dart compile', 'dart test', 'dart pub get', 'dart pub upgrade'],
      projectType: 'Dart project',
      files: ['pubspec.yaml']
    },
    node: {
      commands: ['npm start', 'npm run', 'npm test', 'npm install', 'npm update', 'npm audit', 'yarn start', 'yarn run', 'yarn test', 'yarn install', 'yarn upgrade'],
      projectType: 'Node.js project',
      files: ['package.json']
    },
    python: {
      commands: ['python -m', 'python3 -m', 'pip install -r', 'pip3 install -r', 'pytest', 'python manage.py', 'python3 manage.py', 'uvicorn', 'gunicorn', 'flask run', 'django-admin'],
      projectType: 'Python project',
      files: ['requirements.txt', 'pyproject.toml', 'setup.py', 'manage.py']
    },
    java: {
      commands: ['mvn compile', 'mvn test', 'mvn package', 'mvn install', 'mvn spring-boot:run', 'gradle build', 'gradle test', 'gradle run', './gradlew', './mvnw'],
      projectType: 'Java project',
      files: ['pom.xml', 'build.gradle', 'build.gradle.kts']
    },
    go: {
      commands: ['go run', 'go build', 'go test', 'go mod tidy', 'go mod download', 'go install'],
      projectType: 'Go project',
      files: ['go.mod']
    },
    rust: {
      commands: ['cargo run', 'cargo build', 'cargo test', 'cargo check', 'cargo update', 'cargo install'],
      projectType: 'Rust project',
      files: ['Cargo.toml']
    },
    react: {
      commands: ['npm start', 'npm run build', 'npm run test', 'yarn start', 'yarn build', 'yarn test', 'next dev', 'next build', 'next start'],
      projectType: 'React/Next.js project',
      files: ['package.json']
    },
    vue: {
      commands: ['npm run serve', 'npm run build', 'yarn serve', 'yarn build', 'vue-cli-service'],
      projectType: 'Vue.js project',
      files: ['package.json', 'vue.config.js']
    },
    angular: {
      commands: ['ng serve', 'ng build', 'ng test', 'ng e2e', 'ng generate', 'ng add'],
      projectType: 'Angular project',
      files: ['angular.json', 'package.json']
    },
    spring: {
      commands: ['./gradlew bootRun', './mvnw spring-boot:run', 'gradle bootRun', 'mvn spring-boot:run'],
      projectType: 'Spring Boot project',
      files: ['pom.xml', 'build.gradle']
    },
    docker: {
      commands: ['docker-compose up', 'docker-compose build', 'docker-compose down', 'docker build .', 'docker run'],
      projectType: 'Docker project',
      files: ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml']
    }
  };
  
  // Check if command requires a project context
  for (const [langKey, config] of Object.entries(projectCommands)) {
    const requiresProject = config.commands.some(cmd => {
      if (cmd.includes(' ')) {
        // For multi-word commands, check if the input starts with the command
        return cmdLower.startsWith(cmd.toLowerCase());
      } else {
        // For single commands, check exact match or if it's followed by a space/option
        return cmdLower === cmd.toLowerCase() || cmdLower.startsWith(cmd.toLowerCase() + ' ');
      }
    });
    
    if (requiresProject && !repository) {
      throw new Error(`⚠️  Repository required: Command '${command}' requires a ${config.projectType}.\n\nExpected files: ${config.files.join(', ')}\nPlease select a repository first or create a new project.`);
    }
  }
  
  // Special cases for commands that might not be covered above
  const genericProjectCommands = [
    'make', 'make build', 'make test', 'make install',
    'cmake', 'cmake build',
    'dotnet run', 'dotnet build', 'dotnet test',
    'composer install', 'composer update', 'php artisan',
    'bundle install', 'bundle exec', 'rails server', 'rails console',
    'swift run', 'swift build', 'swift test'
  ];
  
  const isGenericProjectCommand = genericProjectCommands.some(cmd => 
    cmdLower.startsWith(cmd.toLowerCase())
  );
  
  if (isGenericProjectCommand && !repository) {
    throw new Error(`⚠️  Repository required: Command '${command}' typically requires a project context.\nPlease select a repository first or create a new project.`);
  }
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
    console.log('🔍 DEBUG: Event received:', JSON.stringify(event, null, 2));
    console.log('🔍 DEBUG: Context:', JSON.stringify(context, null, 2));
    
    // Initialize on cold start
    await initialize();

    // Parse event (from API Gateway)
    const { httpMethod, path: requestPath, body, headers } = event;
    console.log('🔍 DEBUG: Raw headers:', JSON.stringify(headers, null, 2));
    console.log('🔍 DEBUG: Raw body:', body);
    
    const requestBody = body ? JSON.parse(body) : {};
    console.log('🔍 DEBUG: Parsed requestBody:', JSON.stringify(requestBody, null, 2));

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
    const sessionId = headers['X-Session-ID'] || headers['x-session-id'] || requestBody.sessionId;

    // Route handlers
    switch (requestPath) {
      case '/session':
        if (requestBody.action === 'create') {
          const userIdFromBody = requestBody.userId || userId;
          return await handleCreateSession(userIdFromBody, corsHeaders);
        } else {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Unknown session action', received: requestBody.action })
          };
        }
      
      case '/session/create':
        return await handleCreateSession(userId, corsHeaders);
      
      case '/command':
        if (requestBody.action === 'execute') {
          return await handleExecuteCommand(requestBody, sessionId, corsHeaders);
        } else {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Unknown command action', received: requestBody.action })
          };
        }
      
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
    console.error('❌ Lambda handler error FULL DETAILS:');
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error cause:', error.cause);
    console.error('❌ Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
        stack: error.stack,
        name: error.name,
        timestamp: new Date().toISOString(),
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
      })
    };
  }
};

// Handler functions
async function handleCreateSession(userId, headers) {
  try {
    console.log('🔍 DEBUG: handleCreateSession called with userId:', userId);
    console.log('🔍 DEBUG: userManager exists:', !!userManager);
    
    const session = await userManager.createUserSession(userId);
    console.log('🔍 DEBUG: Session created successfully:', JSON.stringify(session, null, 2));
    
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
    console.error('❌ handleCreateSession error FULL DETAILS:');
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error name:', error.name);
    console.error('❌ Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false, 
        error: error.message,
        stack: error.stack,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
      })
    };
  }
}

async function handleExecuteCommand(requestBody, sessionId, headers) {
  try {
    console.log('🔍 DEBUG: handleExecuteCommand called with:');
    console.log('🔍 DEBUG: requestBody:', JSON.stringify(requestBody, null, 2));
    console.log('🔍 DEBUG: sessionId:', sessionId);
    console.log('🔍 DEBUG: headers:', JSON.stringify(headers, null, 2));
    
    if (!sessionId) {
      console.error('❌ DEBUG: No sessionId provided');
      throw new Error('Session ID required');
    }

    const { 
      command: rawCommand, 
      streaming = false, 
      forceECS = false,
      repository = null,
      workingDir = null 
    } = requestBody;
    console.log('🔍 DEBUG: Raw command received:', rawCommand, 'streaming:', streaming, 'forceECS:', forceECS);
    console.log('🔍 DEBUG: Repository:', repository, 'workingDir:', workingDir);
    
    // Normalize command: replace em-dash with double hyphen
    const command = rawCommand ? rawCommand.replace(/—/g, '--') : rawCommand;
    console.log('🔍 DEBUG: Normalized command:', command);
    
    if (!command) {
      console.error('❌ DEBUG: No command provided');
      throw new Error('Command required');
    }

    console.log('🔍 DEBUG: Getting user session for sessionId:', sessionId);
    const session = await userManager.getUserSession(sessionId);
    console.log('🔍 DEBUG: Retrieved session:', JSON.stringify(session, null, 2));
    
    // Validate repository context for commands that need it
    try {
      validateRepositoryContext(command, repository);
      console.log('🔍 DEBUG: Repository validation passed');
    } catch (repoError) {
      console.error('❌ DEBUG: Repository validation failed:', repoError.message);
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: repoError.message,
          exitCode: 1,
          executor: 'validation',
          routing: 'error'
        })
      };
    }
    
    // Special handling for Flutter Web Start command
    const cmdLower = command.toLowerCase();
    if (cmdLower.includes('flutter run -d web') || cmdLower.includes('flutter run -d chrome') || 
        cmdLower.includes('start flutter web app') || cmdLower.includes('flutter web') || 
        (cmdLower.includes('start') && cmdLower.includes('flutter') && cmdLower.includes('web'))) {
      console.log('📱 Flutter Web command detected: "' + command + '", routing directly to special ECS endpoint');
      
      // Use the direct Flutter Web start endpoint
      try {
        // Use the /flutter/web/start endpoint
        const flutterWebUrl = new URL(ECS_ENDPOINT + '/flutter/web/start');
        
        const flutterWebPayload = {
          sessionId,
          workingDir: workingDir || '/tmp',
          repository: repository || 'flutter-app'
        };
        console.log('📱 Flutter Web payload:', JSON.stringify(flutterWebPayload, null, 2));
        
        const flutterWebResult = await httpRequest(flutterWebUrl.toString(), 'POST', flutterWebPayload);
        console.log('📱 Flutter Web result:', JSON.stringify(flutterWebResult, null, 2));
        
        // Make sure to include webUrl in the response
        return {
          statusCode: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: true,
            output: flutterWebResult.startupOutput || "Flutter web app started",
            error: '',
            exitCode: 0,
            environment: 'ecs-flutter-web',
            executor: 'ecs-flutter-web',
            routing: 'flutter-web',
            webUrl: flutterWebResult.url || null,
            url: flutterWebResult.url || null,
            port: flutterWebResult.port || 8080
          })
        };
      } catch (flutterWebError) {
        console.error('❌ Flutter Web execution failed:', flutterWebError);
        return {
          statusCode: 200, // Still return 200 to client with error info
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: false,
            output: '',
            error: `Flutter web server failed: ${flutterWebError.message}`,
            exitCode: 1,
            environment: 'ecs-flutter-web',
            executor: 'ecs-flutter-web',
            routing: 'flutter-web',
            errorDetails: flutterWebError.stack
          })
        };
      }
    }
    
    // Smart routing decision
    const useECS = forceECS || shouldUseECS(command);
    
    if (useECS && ECS_ENDPOINT) {
      console.log(`🚀 Routing to ECS: ${command}`);
      
      try {
        // Skip ECS task check since we know it's running
        // This is the key fix to avoid the timeout
        
        // Execute on ECS
        const result = await executeOnECS(command, session, { repository, workingDir });
        
        // Fix success determination: check exitCode instead of always assuming success
        const isSuccess = result.exitCode === 0;
        const combinedOutput = combineOutputAndError(result.output, result.error);
        
        // Include webUrl in the response if it exists
        return {
          statusCode: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: isSuccess,
            output: combinedOutput,
            error: result.error || '',
            exitCode: result.exitCode,
            environment: result.environment || 'ecs-fargate',
            executionTime: result.executionTime,
            executor: 'ecs-fargate',
            routing: 'smart',
            webUrl: result.url || result.webUrl || null,
            url: result.url || result.webUrl || null,
            port: result.port || null
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
    console.error('❌ handleExecuteCommand error FULL DETAILS:');
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error name:', error.name);
    console.error('❌ Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    
    return {
      statusCode: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false, 
        error: error.message,
        stack: error.stack,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
      })
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
      })
    };
  } catch (error) {
    return {
      statusCode: 400,
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

    const { prompt, context, stream = false } = requestBody;
    if (!prompt) {
      throw new Error('Prompt required');
    }

    const session = await userManager.getUserSession(sessionId);
    
    // Add session context to AI agent request
    const agentContext = {
      ...context,
      workingDir: session.workspaceDir,
      sessionId: session.sessionId,
      userId: session.userId
    };

    // Execute agent action
    const result = await aiAgent.executeAgentAction(prompt, agentContext, stream);
    
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        ...result
      })
    };
  } catch (error) {
    return {
      statusCode: 400,
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

    const { directory = '.' } = requestBody;
    
    const session = await userManager.getUserSession(sessionId);
    const result = await commandExecutor.listFiles(directory, session);
    
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
      version: '1.0.0-lambda-hybrid-fixed',
      environment: 'AWS Lambda + ECS Fargate',
      ecsStatus,
      uptime: process.uptime()
    })
  };
}

// ECS Helper Functions - Fixed Version without task check
async function executeOnECS(command, session, options = {}) {
  console.log('🔍 DEBUG executeOnECS: Starting ECS execution');
  console.log('🔍 DEBUG executeOnECS: Command:', command);
  console.log('🔍 DEBUG executeOnECS: ECS_ENDPOINT:', ECS_ENDPOINT);
  console.log('🔍 DEBUG executeOnECS: Session:', JSON.stringify(session, null, 2));
  console.log('🔍 DEBUG executeOnECS: Options:', JSON.stringify(options, null, 2));
  
  if (!ECS_ENDPOINT) {
    console.error('❌ DEBUG executeOnECS: ECS endpoint not configured');
    throw new Error('ECS endpoint not configured');
  }
  
  // Determine working directory
  let ecsWorkspaceDir = '/tmp';
  if (options.workingDir) {
    ecsWorkspaceDir = options.workingDir;
  } else if (options.repository) {
    // Create a repository-specific directory
    ecsWorkspaceDir = `/tmp/projects/${options.repository.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  }
  console.log('🔍 DEBUG executeOnECS: Using ecsWorkspaceDir:', ecsWorkspaceDir);
  
  const payload = {
    command,
    workingDir: ecsWorkspaceDir,
    repository: options.repository || null,
    sessionId: session.sessionId
  };
  console.log('🔍 DEBUG executeOnECS: Request payload:', JSON.stringify(payload, null, 2));
  
  // Use the httpRequest helper function for cleaner code
  const url = `${ECS_ENDPOINT}/execute-heavy`;
  const result = await httpRequest(url, 'POST', payload);
  
  // Copy any url or webUrl from the result to ensure it's returned to the client
  if (result.url && !result.webUrl) {
    result.webUrl = result.url;
  }
  if (result.webUrl && !result.url) {
    result.url = result.webUrl;
  }
  
  console.log('🔍 DEBUG executeOnECS: Parsed result:', JSON.stringify(result, null, 2));
  return result;
}

// HTTP Request Helper
async function httpRequest(url, method = 'GET', data = null) {
  console.log('🔍 DEBUG httpRequest: Starting request to URL:', url);
  console.log('🔍 DEBUG httpRequest: Method:', method);
  console.log('🔍 DEBUG httpRequest: Data:', data ? JSON.stringify(data, null, 2) : 'none');
  
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(url);
      console.log('🔍 DEBUG httpRequest: URL parsed as:', urlObj.toString());
      console.log('🔍 DEBUG httpRequest: Protocol:', urlObj.protocol);
      console.log('🔍 DEBUG httpRequest: Hostname:', urlObj.hostname);
      console.log('🔍 DEBUG httpRequest: Port:', urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80));
      console.log('🔍 DEBUG httpRequest: Path:', urlObj.pathname);
      
      const postData = data ? JSON.stringify(data) : '';
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };
      
      if (postData) {
        options.headers['Content-Length'] = Buffer.byteLength(postData);
      }
      
      console.log('🔍 DEBUG httpRequest: Request options:', JSON.stringify(options, null, 2));
      
      const client = urlObj.protocol === 'https:' ? https : http;
      const req = client.request(options, (res) => {
        console.log('🔍 DEBUG httpRequest: Response status code:', res.statusCode);
        console.log('🔍 DEBUG httpRequest: Response headers:', JSON.stringify(res.headers, null, 2));
        
        let data = '';
        
        res.on('data', (chunk) => {
          console.log('🔍 DEBUG httpRequest: Received chunk length:', chunk.length);
          data += chunk;
        });
        
        res.on('end', () => {
          console.log('🔍 DEBUG httpRequest: Response complete');
          console.log('🔍 DEBUG httpRequest: Raw response data:', data);
          
          try {
            if (res.statusCode >= 400) {
              return reject(new Error(`HTTP Error ${res.statusCode}: ${data}`));
            }
            
            // For empty responses or non-JSON responses
            if (!data.trim()) {
              return resolve({});
            }
            
            const result = JSON.parse(data);
            console.log('🔍 DEBUG httpRequest: Parsed result:', JSON.stringify(result, null, 2));
            resolve(result);
          } catch (e) {
            console.error('🔍 DEBUG httpRequest: Error parsing response:', e);
            reject(new Error(`Failed to parse response: ${e.message}`));
          }
        });
      });
      
      req.on('error', (e) => {
        console.error('🔍 DEBUG httpRequest: Request error:', e);
        reject(e);
      });
      
      req.on('timeout', () => {
        console.error('🔍 DEBUG httpRequest: Request timed out');
        req.destroy();
        reject(new Error('Request timed out'));
      });
      
      if (postData) {
        console.log('🔍 DEBUG httpRequest: Writing data to request');
        req.write(postData);
      }
      
      req.end();
      console.log('🔍 DEBUG httpRequest: Request sent');
    } catch (e) {
      console.error('🔍 DEBUG httpRequest: Exception in request:', e);
      reject(e);
    }
  });
}