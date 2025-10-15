// Lambda Handler - Command Execution with Smart Routing
const UserManager = require('./user-manager');
const CommandExecutor = require('./command-executor');
const AIAgent = require('./ai-agent');
const { executeFlutterWebStart } = require('./flutter-web-helper');
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

    // Extract user info (handle case where headers might be undefined)
    const safeHeaders = headers || {};
    const userId = safeHeaders['X-User-ID'] || safeHeaders['x-user-id'] || 'anonymous';
    const sessionId = safeHeaders['X-Session-ID'] || safeHeaders['x-session-id'];

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
      
      case '/sessions':  // Add this route for API Gateway compatibility
        if (httpMethod === 'POST') {
          const userIdFromBody = requestBody.userId || userId;
          return await handleCreateSession(userIdFromBody, corsHeaders);
        } else {
          return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Method not allowed' })
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
        
      case '/execute':  // Add this route for API Gateway compatibility
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
    
    // PRAGMATIC SOLUTION: For ALL Flutter commands, try Flutter Web endpoint first
    // If the command is Flutter-related and could benefit from web server, try specialized endpoint
    if (command.toLowerCase().startsWith('flutter') && ECS_ENDPOINT) {
      console.log(`🚀 Trying Flutter Web endpoint first for: ${command}`);
      
      try {
        // Ensure ECS task is running
        await ensureECSTaskRunning();
        
        // Try specialized Flutter Web endpoint first
        const flutterWebResult = await executeFlutterWebStart(session, { repository, workingDir }, ECS_ENDPOINT);
        
        // If it returns a URL, it's a web command - return immediately with webUrl!
        if (flutterWebResult && flutterWebResult.url) {
          console.log(`✅ Flutter Web endpoint succeeded with URL: ${flutterWebResult.url}`);
          return {
            statusCode: 200,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              success: true,
              output: flutterWebResult.message || flutterWebResult.startupOutput || 'Flutter web server started',
              webUrl: flutterWebResult.url, // This is the key field the Flutter app is looking for!
              port: flutterWebResult.port || 8080,
              repository: flutterWebResult.repository || repository || 'flutter-app',
              environment: 'ecs-fargate',
              executor: 'ecs-flutter-web-specialized',
              routing: 'flutter-web-specialized'
            })
          };
        }
        
        // If no URL returned, fall through to normal execution
        console.log(`⚡ Flutter Web endpoint returned no URL, falling back to normal execution`);
      } catch (flutterWebError) {
        console.log(`⚡ Flutter Web endpoint failed (${flutterWebError.message}), falling back to normal execution`);
        // Fall through to normal execution
      }
    }
    
    // FLUTTER STOP COMMAND - Stop running Flutter process
    if (command.toLowerCase().trim() === 'flutter stop' && ECS_ENDPOINT) {
      console.log(`🛑 Detected 'flutter stop' command - stopping Flutter process...`);
      
      try {
        // Ensure ECS task is running
        await ensureECSTaskRunning();
        
        // Call dedicated /flutter/stop endpoint
        const result = await executeFlutterStop(session, { repository, workingDir });
        
        return {
          statusCode: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: result.success || true,
            output: result.message || 'Flutter process stopped',
            repository: repository || 'flutter-app',
            executor: 'ecs-fargate-background',
            routing: 'flutter-stop-background'
          })
        };
      } catch (flutterStopError) {
        console.error('⚠️  Flutter stop execution failed:', flutterStopError.message);
        
        return {
          statusCode: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: false,
            output: `Failed to stop Flutter process: ${flutterStopError.message}`,
            executor: 'ecs-fargate-background',
            routing: 'flutter-stop-error',
            error: flutterStopError.message
          })
        };
      }
    }
    
    // FLUTTER RUN SPECIFIC DETECTION - Use dedicated long-running endpoint
    if (command.toLowerCase().trim() === 'flutter run' && ECS_ENDPOINT) {
      console.log(`🚀 Detected 'flutter run' command - using long-running process endpoint...`);
      
      try {
        // Ensure ECS task is running
        await ensureECSTaskRunning();
        
        // Call dedicated /flutter/run endpoint for long-running process
        const result = await executeFlutterRun(command, session, { repository, workingDir });
        
        return {
          statusCode: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: result.success || true,
            output: result.message || result.output || 'Flutter run started in background',
            webUrl: result.webUrl, // CRUCIAL: This enables preview button!
            port: result.port || 8080,
            repository: repository || 'flutter-app',
            executor: result.executor || 'ecs-fargate-background',
            routing: result.routing || 'flutter-run-background',
            status: result.status || 'running'
          })
        };
      } catch (flutterRunError) {
        console.error('⚠️  Flutter run execution failed:', flutterRunError.message);
        
        // Fallback to regular ECS execution if flutter/run endpoint fails
        const result = await executeOnECS(command, session, { repository, workingDir });
        return {
          statusCode: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...result,
            executor: 'ecs-fargate-fallback',
            routing: 'flutter-run-fallback',
            flutterRunError: flutterRunError.message
          })
        };
      }
    }
    
    // Smart routing decision
    const useECS = forceECS || shouldUseECS(command);
    
    if (useECS && ECS_ENDPOINT) {
      console.log(`🚀 Routing to ECS: ${command}`);
      
      try {
        // Ensure ECS task is running
        await ensureECSTaskRunning();
        
        // Execute on ECS
        const result = await executeOnECS(command, session, { repository, workingDir });
        
        // Fix success determination: check exitCode instead of always assuming success
        const isSuccess = result.exitCode === 0;
        const combinedOutput = combineOutputAndError(result.output, result.error);
        
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

async function executeFlutterRun(command, session, options = {}) {
  console.log('🔍 DEBUG executeFlutterRun: Starting Flutter run execution');
  console.log('🔍 DEBUG executeFlutterRun: Command:', command);
  console.log('🔍 DEBUG executeFlutterRun: ECS_ENDPOINT:', ECS_ENDPOINT);
  console.log('🔍 DEBUG executeFlutterRun: Session:', JSON.stringify(session, null, 2));
  console.log('🔍 DEBUG executeFlutterRun: Options:', JSON.stringify(options, null, 2));
  
  if (!ECS_ENDPOINT) {
    console.error('❌ DEBUG executeFlutterRun: ECS endpoint not configured');
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
  console.log('🔍 DEBUG executeFlutterRun: Using ecsWorkspaceDir:', ecsWorkspaceDir);
  
  const payload = {
    command,
    workingDir: ecsWorkspaceDir,
    repository: options.repository || 'flutter-app'
  };
  console.log('🔍 DEBUG executeFlutterRun: Request payload:', JSON.stringify(payload, null, 2));
  
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    console.log('🔍 DEBUG executeFlutterRun: PostData:', postData);
    
    const url = new URL(ECS_ENDPOINT + '/flutter/run');
    console.log('🔍 DEBUG executeFlutterRun: Full URL:', url.toString());
    
    const requestOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 60 * 1000 // 1 minute timeout for startup
    };
    console.log('🔍 DEBUG executeFlutterRun: Request options:', JSON.stringify(requestOptions, null, 2));
    
    const client = url.protocol === 'https:' ? https : http;
    console.log('🔍 DEBUG executeFlutterRun: Using client:', url.protocol === 'https:' ? 'HTTPS' : 'HTTP');
    
    const req = client.request(requestOptions, (res) => {
      console.log('🔍 DEBUG executeFlutterRun: Response received');
      console.log('🔍 DEBUG executeFlutterRun: Response status:', res.statusCode);
      console.log('🔍 DEBUG executeFlutterRun: Response headers:', JSON.stringify(res.headers, null, 2));
      
      let data = '';
      
      res.on('data', (chunk) => {
        console.log('🔍 DEBUG executeFlutterRun: Received chunk length:', chunk.length);
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('🔍 DEBUG executeFlutterRun: Response complete');
        console.log('🔍 DEBUG executeFlutterRun: Raw response data:', data);
        
        try {
          const result = JSON.parse(data);
          console.log('🔍 DEBUG executeFlutterRun: Parsed result:', JSON.stringify(result, null, 2));
          resolve(result);
        } catch (parseError) {
          console.error('❌ DEBUG executeFlutterRun: Parse error:', parseError.message);
          console.error('❌ DEBUG executeFlutterRun: Raw data that failed to parse:', data);
          reject(new Error(`Failed to parse Flutter run response: ${parseError.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ DEBUG executeFlutterRun: Request error:', error.message);
      reject(new Error(`Flutter run request failed: ${error.message}`));
    });
    
    req.on('timeout', () => {
      console.error('❌ DEBUG executeFlutterRun: Request timeout');
      req.destroy();
      reject(new Error('Flutter run request timeout'));
    });
    
    req.write(postData);
    req.end();
    console.log('🔍 DEBUG executeFlutterRun: Request sent, waiting for response...');
  });
}

// Execute Flutter stop on ECS backend
async function executeFlutterStop(session, context = {}) {
  console.log('🔍 DEBUG executeFlutterStop: Starting Flutter stop execution');
  console.log('🔍 DEBUG executeFlutterStop: ECS_ENDPOINT:', ECS_ENDPOINT);
  console.log('🔍 DEBUG executeFlutterStop: Session:', JSON.stringify(session, null, 2));
  console.log('🔍 DEBUG executeFlutterStop: Context:', JSON.stringify(context, null, 2));
  
  if (!ECS_ENDPOINT) {
    console.error('❌ DEBUG executeFlutterStop: ECS endpoint not configured');
    throw new Error('ECS endpoint not configured');
  }
  
  const { repository, workingDir } = context;
  const payload = {
    sessionId: session,
    repository: repository || 'flutter-app',
    workingDir: workingDir || '/' 
  };
  console.log('🔍 DEBUG executeFlutterStop: Request payload:', JSON.stringify(payload, null, 2));
  
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    console.log('🔍 DEBUG executeFlutterStop: PostData:', postData);
    
    const url = new URL(ECS_ENDPOINT + '/flutter/stop');
    console.log('🔍 DEBUG executeFlutterStop: Full URL:', url.toString());
    
    const requestOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 15 * 1000 // 15 seconds timeout for stop
    };
    console.log('🔍 DEBUG executeFlutterStop: Request options:', JSON.stringify(requestOptions, null, 2));
    
    const client = url.protocol === 'https:' ? https : http;
    console.log('🔍 DEBUG executeFlutterStop: Using client:', url.protocol === 'https:' ? 'HTTPS' : 'HTTP');
    
    const req = client.request(requestOptions, (res) => {
      console.log('🔍 DEBUG executeFlutterStop: Response received');
      console.log('🔍 DEBUG executeFlutterStop: Response status:', res.statusCode);
      console.log('🔍 DEBUG executeFlutterStop: Response headers:', JSON.stringify(res.headers, null, 2));
      
      let data = '';
      
      res.on('data', (chunk) => {
        console.log('🔍 DEBUG executeFlutterStop: Received chunk length:', chunk.length);
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('🔍 DEBUG executeFlutterStop: Response complete');
        console.log('🔍 DEBUG executeFlutterStop: Raw response data:', data);
        
        try {
          const result = JSON.parse(data);
          console.log('🔍 DEBUG executeFlutterStop: Parsed result:', JSON.stringify(result, null, 2));
          resolve(result);
        } catch (parseError) {
          console.error('❌ DEBUG executeFlutterStop: Parse error:', parseError.message);
          console.error('❌ DEBUG executeFlutterStop: Raw data that failed to parse:', data);
          reject(new Error(`Failed to parse Flutter stop response: ${parseError.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ DEBUG executeFlutterStop: Request error:', error.message);
      reject(new Error(`Flutter stop request failed: ${error.message}`));
    });
    
    req.on('timeout', () => {
      console.error('❌ DEBUG executeFlutterStop: Request timeout');
      req.destroy();
      reject(new Error('Flutter stop request timeout'));
    });
    
    req.write(postData);
    req.end();
    console.log('🔍 DEBUG executeFlutterStop: Request sent, waiting for response...');
  });
}

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
    repository: options.repository || null
  };
  console.log('🔍 DEBUG executeOnECS: Request payload:', JSON.stringify(payload, null, 2));
  
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    console.log('🔍 DEBUG executeOnECS: PostData:', postData);
    
    const url = new URL(ECS_ENDPOINT + '/execute-heavy');
    console.log('🔍 DEBUG executeOnECS: Full URL:', url.toString());
    console.log('🔍 DEBUG executeOnECS: URL hostname:', url.hostname);
    console.log('🔍 DEBUG executeOnECS: URL port:', url.port);
    console.log('🔍 DEBUG executeOnECS: URL pathname:', url.pathname);
    
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
    console.log('🔍 DEBUG executeOnECS: Request options:', JSON.stringify(options, null, 2));
    
    const client = url.protocol === 'https:' ? https : http;
    console.log('🔍 DEBUG executeOnECS: Using client:', url.protocol === 'https:' ? 'HTTPS' : 'HTTP');
    
    const req = client.request(options, (res) => {
      console.log('🔍 DEBUG executeOnECS: Response received');
      console.log('🔍 DEBUG executeOnECS: Response status:', res.statusCode);
      console.log('🔍 DEBUG executeOnECS: Response headers:', JSON.stringify(res.headers, null, 2));
      
      let data = '';
      
      res.on('data', (chunk) => {
        console.log('🔍 DEBUG executeOnECS: Received chunk length:', chunk.length);
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('🔍 DEBUG executeOnECS: Response complete');
        console.log('🔍 DEBUG executeOnECS: Raw response data:', data);
        console.log('🔍 DEBUG executeOnECS: Raw response length:', data.length);
        
        try {
          const result = JSON.parse(data);
          console.log('🔍 DEBUG executeOnECS: Parsed result:', JSON.stringify(result, null, 2));
          resolve(result);
        } catch (parseError) {
          console.error('❌ DEBUG executeOnECS: Parse error:', parseError.message);
          console.error('❌ DEBUG executeOnECS: Raw data that failed to parse:', data);
          reject(new Error(`Failed to parse ECS response: ${parseError.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ DEBUG executeOnECS: Request error:', error.message);
      console.error('❌ DEBUG executeOnECS: Request error details:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      reject(new Error(`ECS request failed: ${error.message}`));
    });
    
    req.on('timeout', () => {
      console.error('❌ DEBUG executeOnECS: Request timeout');
      req.destroy();
      reject(new Error('ECS request timeout'));
    });
    
    console.log('🔍 DEBUG executeOnECS: Writing request data and ending request');
    req.write(postData);
    req.end();
    console.log('🔍 DEBUG executeOnECS: Request sent, waiting for response...');
  });
}
