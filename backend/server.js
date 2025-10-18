const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();
const { VertexAI } = require('@google-cloud/vertexai');

const app = express();
const PORT = process.env.PORT || 3000;

// Google Cloud Configuration
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'drape-93229';
const LOCATION = 'us-central1';

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
app.post('/ai/chat', async (req, res) => {
  try {
    const { message, model = 'gemini-pro', projectContext } = req.body;
    
    console.log('AI Chat request:', { message, model, projectContext });
    
    // Get Vertex AI model
    const generativeModel = vertex_ai.getGenerativeModel({ model });
    
    // Add project context to message
    const contextualMessage = projectContext ? 
      `Project Context: ${JSON.stringify(projectContext)}\n\nUser: ${message}` : 
      message;
    
    // Generate response
    const result = await generativeModel.generateContent(contextualMessage);
    const response = result.response;
    
    res.json({
      success: true,
      response: response.text(),
      model: model,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('AI Chat error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Terminal execute endpoint
app.post('/terminal/execute', async (req, res) => {
  try {
    const { command, workstationId, language = 'bash' } = req.body;
    
    console.log('Terminal execute:', { command, workstationId, language });
    
    // Simulate command execution
    // In production, this would execute in a container
    const output = `Executing: ${command}\n✅ Command completed successfully`;
    
    res.json({
      success: true,
      output: output,
      workstationId: workstationId,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Terminal execute error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Drape Backend running on port ${PORT}`);
  console.log(`📊 Project: ${PROJECT_ID}`);
  console.log(`🤖 Vertex AI: Ready`);
  console.log(`🔗 Health: http://localhost:${PORT}/health`);
});
const GITHUB_CLIENT_SECRET = '74afe739ecc6c19948178aca719bf006bec1dda7';

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'drape-backend' });
});

// GitHub OAuth Device Flow - Start
app.post('/github/device-flow', async (req, res) => {
  try {
    const response = await axios.post(
      'https://github.com/login/device/code',
      new URLSearchParams({
        client_id: req.body.client_id,
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
        client_id: req.body.client_id,
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

// AI Chat endpoint - Using REST API for better auth compatibility
app.post('/ai/chat', async (req, res) => {
    const { prompt, conversationHistory = [], model = 'gemini-2.0-flash', workstationId, context } = req.body;
    
    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }
    
    try {
        // Get access token
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        const { stdout: token } = await execAsync('gcloud auth print-access-token');
        const accessToken = token.trim();
        
        // Build system instruction with project context
        let systemInstruction = 'Sei un assistente AI intelligente e versatile. Rispondi sempre in italiano in modo naturale e conversazionale.';
        
        if (context) {
            systemInstruction += `\n\nContesto Progetto:\n- Nome: ${context.projectName}\n- Linguaggio: ${context.language}`;
            if (context.repositoryUrl) {
                systemInstruction += `\n- Repository: ${context.repositoryUrl}`;
            }
            systemInstruction += '\n\nPuoi analizzare e modificare i file del progetto. Quando l\'utente chiede di modificare un file, fornisci il codice completo aggiornato.';
        }
        
        // Prepare request to Vertex AI REST API
        const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.0-flash-exp:generateContent`;
        
        const requestBody = {
            contents: [
                // Add conversation history
                ...conversationHistory.map((msg, i) => ({
                    role: i % 2 === 0 ? 'user' : 'model',
                    parts: [{ text: msg }]
                })),
                // Add current prompt
                {
                    role: 'user',
                    parts: [{ text: prompt }]
                }
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048
            },
            systemInstruction: {
                parts: [{ text: systemInstruction }]
            }
        };
        
        const response = await axios.post(endpoint, requestBody, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const content = response.data.candidates?.[0]?.content?.parts?.[0]?.text || 'Nessuna risposta disponibile';
        
        res.json({
            success: true,
            content,
            model: 'gemini-2.0-flash-exp',
            usage: response.data.usageMetadata
        });
        
    } catch (error) {
        console.error('AI Chat error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.error?.message || error.message
        });
    }
});

// Terminal execute endpoint - Execute commands on workstation
app.post('/terminal/execute', async (req, res) => {
  const { command, workstationId } = req.body;
  
  console.log('🖥️  TERMINAL EXECUTE REQUEST:');
  console.log('Command:', command);
  console.log('Workstation ID:', workstationId);
  
  if (!workstationId) {
    console.error('❌ No workstation ID provided');
    return res.status(400).json({ error: 'workstationId is required' });
  }
  
  try {
    console.log(`⚡ Executing command on workstation ${workstationId}...`);
    
    // Execute command on workstation
    const output = await executeCommandOnWorkstation(command, workstationId);
    
    console.log('✅ Command executed successfully');
    console.log('Output:', output);
    
    const previewUrl = detectPreviewUrl(output.stdout, command);
    if (previewUrl) {
      console.log('👁️  Preview URL detected:', previewUrl);
    }

    res.json({
      output: output.stdout,
      error: output.stderr,
      exitCode: output.exitCode,
      workstationId,
      command,
      previewUrl
    });
    
  } catch (error) {
    console.error('❌ TERMINAL EXECUTE ERROR:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      workstationId,
      command
    });
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
  
  // Simulate ls command
  if (command.trim() === 'ls' || command.trim() === 'ls -la') {
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
  const { repositoryUrl, userId, projectId, projectType, projectName } = req.body;
  
  console.log('🚀 WORKSTATION CREATE REQUEST:');
  console.log('Project Type:', projectType);
  console.log('Repository URL:', repositoryUrl);
  console.log('Project Name:', projectName);
  console.log('User ID:', userId);
  console.log('Project ID:', projectId);
  
  try {
    const parent = `projects/${PROJECT_ID}/locations/${LOCATION}/workstationClusters/${CLUSTER}/workstationConfigs/${CONFIG}`;
    const workstationId = `ws-${userId}-${Date.now()}`;
    
    console.log('📍 Creating workstation:', workstationId);
    console.log('📁 Parent path:', parent);
    
    // Simulate workstation creation
    const workstation = {
      id: workstationId,
      status: 'creating',
      projectType,
      repositoryUrl,
      projectName,
      projectId,
      createdAt: new Date().toISOString(),
      userId
    };

    console.log('✅ Workstation created successfully:', workstation);

    // Different setup based on project type
    setTimeout(async () => {
      console.log(`🔄 Workstation ${workstationId} ready, starting setup...`);
      
      if (projectType === 'git' && repositoryUrl) {
        // Git project - clone repository
        console.log(`📦 Cloning Git repository: ${repositoryUrl}`);
        try {
          const cloneOutput = await executeCommandOnWorkstation(`git clone ${repositoryUrl}`, workstationId);
          console.log(`✅ Git repository cloned successfully on workstation ${workstationId}`);
          console.log('Clone output:', cloneOutput);
        } catch (cloneError) {
          console.error(`❌ Git clone failed on workstation ${workstationId}:`, cloneError);
        }
      } else if (projectType === 'personal' && projectName) {
        // Personal project - load from Cloud Storage or create new
        console.log(`📁 Setting up personal project: ${projectName}`);
        try {
          // Simulate loading from Cloud Storage
          const setupOutput = await setupPersonalProject(projectName, workstationId, userId, projectId);
          console.log(`✅ Personal project setup completed on workstation ${workstationId}`);
          console.log('Setup output:', setupOutput);
        } catch (setupError) {
          console.error(`❌ Personal project setup failed on workstation ${workstationId}:`, setupError);
        }
      }
    }, 2000);

    res.json({
      workstationId,
      status: 'creating',
      projectType,
      repositoryUrl,
      projectName,
      message: `Workstation creation started for ${projectType} project.`,
    });
  } catch (error) {
    console.error('❌ WORKSTATION CREATION ERROR:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    res.status(500).json({ error: error.message });
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

// Read file content from workstation
app.post('/workstation/read-file', async (req, res) => {
    const { workstationId, filePath } = req.body;
    
    try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        const { stdout } = await execAsync(`gcloud workstations ssh ${workstationId} --command="cat ${filePath}"`);
        
        res.json({ success: true, content: stdout });
    } catch (error) {
        console.error('Read file error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Modify file in workstation
app.post('/workstation/modify-file', async (req, res) => {
    const { workstationId, filePath, content } = req.body;
    
    try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        // Escape content for shell
        const escapedContent = content.replace(/'/g, "'\\''");
        
        await execAsync(`gcloud workstations ssh ${workstationId} --command="echo '${escapedContent}' > ${filePath}"`);
        
        res.json({ success: true, message: 'File modified successfully' });
    } catch (error) {
        console.error('Modify file error:', error);
        res.status(500).json({ success: false, error: error.message });
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
