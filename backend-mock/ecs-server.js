const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const axios = require('axios');
const { VertexAI } = require('@google-cloud/vertexai');
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs').promises;

const app = express();
app.use(express.json());

const storage = new Storage();

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'drape-ai-backend' });
});

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'drape-mobile-ide';
const LOCATION = 'us-central1';

const vertex_ai = new VertexAI({ project: PROJECT_ID, location: LOCATION });

// Gemini AI endpoint with function calling
app.post('/ai/chat', async (req, res) => {
    const { prompt, conversationHistory = [], model = 'gemini-2.0-flash', workstationName } = req.body;
    
    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }
    
    // Map old Claude/GPT models to Gemini
    const modelMap = {
        'claude-3.5': 'gemini-2.0-flash-exp',
        'claude-4.5': 'gemini-2.0-flash-exp',
        'claude-opus': 'gemini-2.0-flash-exp',
        'claude-haiku': 'gemini-2.0-flash-exp',
        'gpt-4': 'gemini-2.0-flash-exp',
        'gpt-5': 'gemini-2.0-flash-exp'
    };
    
    const geminiModel = modelMap[model] || model;
    
    try {
        const systemInstruction = workstationName 
            ? `Sei un assistente AI per sviluppatori. Hai accesso a un workstation cloud dove puoi eseguire comandi. Il workstation è: ${workstationName}. Quando l'utente chiede di eseguire comandi, installare pacchetti, o fare operazioni di sviluppo, usa la funzione execute_command. Rispondi sempre in italiano.`
            : 'Sei un assistente AI intelligente e versatile. Rispondi sempre in italiano in modo naturale e conversazionale.';

        const generativeModel = vertex_ai.getGenerativeModel({
            model: geminiModel,
            systemInstruction,
        });

        // Define functions
        const tools = workstationName ? [
            {
                functionDeclarations: [{
                    name: 'execute_command',
                    description: 'Esegui un comando bash nel workstation cloud dello sviluppatore',
                    parameters: {
                        type: 'object',
                        properties: {
                            command: {
                                type: 'string',
                                description: 'Il comando bash da eseguire (es: npm install, git status, ls -la)'
                            }
                        },
                        required: ['command']
                    }
                }]
            }
        ] : [{ googleSearch: {} }];

        const chat = generativeModel.startChat({
            tools,
            history: conversationHistory.map((msg, i) => ({
                role: i % 2 === 0 ? 'user' : 'model',
                parts: [{ text: msg }]
            }))
        });

        let result = await chat.sendMessage(prompt);
        let response = result.response;
        
        console.log('🔍 Gemini response:', JSON.stringify(response, null, 2));

        // Extract function call from response
        let functionCall = null;
        if (response.candidates && response.candidates[0]) {
            const parts = response.candidates[0].content.parts;
            for (const part of parts) {
                if (part.functionCall) {
                    functionCall = part.functionCall;
                    break;
                }
            }
        }

        // Handle function calls
        if (functionCall) {
            let functionResult = '';

            if (functionCall.name === 'execute_command') {
                console.log(`⚡ Execute: ${functionCall.args.command}`);
                try {
                    const { command } = functionCall.args;
                    const parent = `projects/${PROJECT_ID}/locations/${LOCATION}/workstationClusters/${CLUSTER}/workstationConfigs/${CONFIG}`;
                    const workstationPath = `${parent}/workstations/${workstationName}`;
                    
                    // Per ora simula esecuzione - in produzione usare SSH/exec API
                    functionResult = `✅ Comando eseguito: ${command}\n(Output simulato - integrazione completa in sviluppo)`;
                } catch (error) {
                    functionResult = `❌ Errore: ${error.message}`;
                }
            }

            if (functionCall.name === 'web_search') {
                console.log(`🔍 Web search: ${functionCall.args.query}`);
                try {
                    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(functionCall.args.query)}&hl=it`;
                    const searchResponse = await axios.get(searchUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                        timeout: 10000
                    });
                    
                    const html = searchResponse.data;
                    const snippetMatches = html.match(/<div[^>]*class="[^"]*VwiC3b[^"]*"[^>]*>(.*?)<\/div>/gs);
                    const results = [];
                    
                    if (snippetMatches) {
                        for (let i = 0; i < Math.min(3, snippetMatches.length); i++) {
                            const snippet = snippetMatches[i]
                                .replace(/<[^>]*>/g, '')
                                .replace(/&nbsp;/g, ' ')
                                .replace(/&quot;/g, '"')
                                .trim();
                            if (snippet && snippet.length > 20) {
                                results.push(`• ${snippet}`);
                            }
                        }
                    }
                    
                    functionResult = results.length > 0 
                        ? `Risultati:\n${results.join('\n')}`
                        : `Nessun risultato per "${functionCall.args.query}"`;
                } catch (error) {
                    functionResult = 'Ricerca non disponibile';
                }
            }

            if (functionCall.name === 'github_operation') {
                console.log(`🐙 GitHub: ${functionCall.args.operation}`);
                const { promisify } = require('util');
                const execAsync = promisify(exec);
                
                try {
                    const { operation, repo_name, message, private: isPrivate } = functionCall.args;
                    
                    switch (operation) {
                        case 'create_repo':
                            const vis = isPrivate ? '--private' : '--public';
                            const r = await execAsync(`gh repo create ${repo_name} ${vis} --confirm`);
                            functionResult = `✅ Repository creato: ${repo_name}`;
                            break;
                        case 'status':
                            const s = await execAsync('git status');
                            functionResult = s.stdout;
                            break;
                        default:
                            functionResult = 'Operazione non supportata';
                    }
                } catch (error) {
                    functionResult = `❌ Errore: ${error.message}`;
                }
            }

            // Send function result back
            result = await chat.sendMessage([{
                functionResponse: {
                    name: functionCall.name,
                    response: { result: functionResult }
                }
            }]);
            response = result.response;
        }

        // Extract content from response
        let content = '';
        if (response.candidates && response.candidates[0]) {
            const parts = response.candidates[0].content.parts;
            for (const part of parts) {
                if (part.text) {
                    content += part.text;
                }
            }
        }
        
        if (!content) {
            content = 'Nessuna risposta disponibile';
        }
        
        res.json({
            success: true,
            content,
            model,
            usage: response.usageMetadata
        });
        
    } catch (error) {
        console.error('Gemini error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Cloud Run + Storage instant execution
const BUCKET_NAME = `${PROJECT_ID}-workspaces`;
const WORKSPACE_DIR = '/tmp/workspace';

// Initialize workspace for user
app.post('/workspace/init', async (req, res) => {
    const { userId, repoUrl, repoName } = req.body;
    const workspaceName = `user-${userId}`;
    const repoSlug = (repoName || repoUrl?.split('/').pop()?.replace('.git', '') || 'default').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    try {
        console.log(`🚀 Initializing workspace: ${workspaceName}, repo: ${repoSlug}`);
        
        // Create bucket if not exists
        try {
            await storage.createBucket(BUCKET_NAME, {
                location: LOCATION,
                storageClass: 'STANDARD',
            });
            console.log(`✅ Bucket created: ${BUCKET_NAME}`);
        } catch (err) {
            if (!err.message.includes('already exists') && !err.message.includes('already own it')) {
                console.log(`⚠️ Bucket error (ignoring): ${err.message}`);
            }
        }
        
        const bucket = storage.bucket(BUCKET_NAME);
        const workspacePrefix = `${workspaceName}/`;
        const repoPrefix = `${workspaceName}/${repoSlug}/`;
        
        // Check if this specific repo exists
        const [repoFiles] = await bucket.getFiles({ prefix: repoPrefix, maxResults: 1 });
        
        if (repoFiles.length === 0 && repoUrl) {
            // Clone repository into subdirectory
            console.log(`📦 Cloning ${repoSlug}...`);
            const localPath = path.join(WORKSPACE_DIR, workspaceName);
            const repoPath = path.join(localPath, repoSlug);
            
            // Cleanup any existing directory
            try {
                await execAsync(`rm -rf ${repoPath}`, { timeout: 30000 });
            } catch (e) {
                console.log(`⚠️ Cleanup warning: ${e.message}`);
            }
            
            await fs.mkdir(localPath, { recursive: true });
            
            await execAsync(`cd ${localPath} && git clone --depth 1 --progress ${repoUrl} ${repoSlug}`, {
                timeout: 600000, // 10 minutes for large repos
                maxBuffer: 100 * 1024 * 1024 // 100MB buffer
            });
            
            console.log(`✅ Clone complete`);
            
            // Upload to storage with progress
            console.log(`☁️ Uploading files to Cloud Storage...`);
            await uploadDirectory(localPath, bucket, workspacePrefix);
            
            // Cleanup
            await execAsync(`rm -rf ${localPath}`);
            
            console.log(`✅ Repository ready: ${repoSlug}`);
            
            res.json({
                success: true,
                workspaceName,
                repoName: repoSlug,
                message: 'Repository cloned and uploaded successfully'
            });
        } else {
            res.json({
                success: true,
                workspaceName,
                repoName: repoSlug,
                message: 'Repository already in workspace'
            });
        }
        
    } catch (error) {
        console.error('Workspace init error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get available AI tools
app.get('/ai/tools', (req, res) => {
    res.json({
        tools: [
            {
                name: 'readFile',
                description: 'Read the content of a file in the workspace',
                parameters: {
                    type: 'object',
                    properties: {
                        filePath: {
                            type: 'string',
                            description: 'Path to the file relative to repository root (e.g., "lib/main.dart")'
                        }
                    },
                    required: ['filePath']
                }
            },
            {
                name: 'writeFile',
                description: 'Create or modify a file in the workspace',
                parameters: {
                    type: 'object',
                    properties: {
                        filePath: {
                            type: 'string',
                            description: 'Path to the file relative to repository root'
                        },
                        content: {
                            type: 'string',
                            description: 'Content to write to the file'
                        }
                    },
                    required: ['filePath', 'content']
                }
            },
            {
                name: 'listFiles',
                description: 'List files and directories in a directory',
                parameters: {
                    type: 'object',
                    properties: {
                        directory: {
                            type: 'string',
                            description: 'Directory path relative to repository root (default: ".")'
                        }
                    }
                }
            },
            {
                name: 'executeCommand',
                description: 'Execute a terminal command in the workspace',
                parameters: {
                    type: 'object',
                    properties: {
                        command: {
                            type: 'string',
                            description: 'Command to execute (e.g., "flutter pub get", "git status")'
                        }
                    },
                    required: ['command']
                }
            }
        ]
    });
});

// Read file content (for AI)
app.post('/workspace/read-file', async (req, res) => {
    const { userId, repoName, filePath } = req.body;
    const workspaceName = `user-${userId}`;
    const repoSlug = (repoName || 'default').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    try {
        const bucket = storage.bucket(BUCKET_NAME);
        const workspacePrefix = `${workspaceName}/`;
        const localPath = path.join(WORKSPACE_DIR, workspaceName);
        
        await fs.mkdir(localPath, { recursive: true });
        await downloadDirectory(bucket, workspacePrefix, localPath);
        
        const fullPath = path.join(localPath, repoSlug, filePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        
        await execAsync(`rm -rf ${localPath}`);
        
        res.json({ success: true, content });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Write file content (for AI)
app.post('/workspace/write-file', async (req, res) => {
    const { userId, repoName, filePath, content } = req.body;
    const workspaceName = `user-${userId}`;
    const repoSlug = (repoName || 'default').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    try {
        const bucket = storage.bucket(BUCKET_NAME);
        const workspacePrefix = `${workspaceName}/`;
        const localPath = path.join(WORKSPACE_DIR, workspaceName);
        
        await fs.mkdir(localPath, { recursive: true });
        await downloadDirectory(bucket, workspacePrefix, localPath);
        
        const fullPath = path.join(localPath, repoSlug, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
        
        await uploadDirectory(localPath, bucket, workspacePrefix);
        await execAsync(`rm -rf ${localPath}`);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// List files in directory (for AI)
app.post('/workspace/list-files', async (req, res) => {
    const { userId, repoName, directory = '.' } = req.body;
    const workspaceName = `user-${userId}`;
    const repoSlug = (repoName || 'default').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    try {
        const bucket = storage.bucket(BUCKET_NAME);
        const workspacePrefix = `${workspaceName}/`;
        const localPath = path.join(WORKSPACE_DIR, workspaceName);
        
        await fs.mkdir(localPath, { recursive: true });
        await downloadDirectory(bucket, workspacePrefix, localPath);
        
        const fullPath = path.join(localPath, repoSlug, directory);
        const files = await fs.readdir(fullPath, { withFileTypes: true });
        
        const fileList = files.map(f => ({
            name: f.name,
            isDirectory: f.isDirectory()
        }));
        
        await execAsync(`rm -rf ${localPath}`);
        
        res.json({ success: true, files: fileList });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Analyze project for missing files
app.post('/workspace/analyze', async (req, res) => {
    const { userId, repoName } = req.body;
    const workspaceName = `user-${userId}`;
    const repoSlug = (repoName || 'default').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    try {
        console.log(`🔍 Analyzing project for ${workspaceName}/${repoSlug}`);
        
        const bucket = storage.bucket(BUCKET_NAME);
        const workspacePrefix = `${workspaceName}/`;
        const gitignorePath = `${workspacePrefix}${repoSlug}/.gitignore`;
        
        const missingFiles = [];
        
        // Download only .gitignore file (fast!)
        try {
            const file = bucket.file(gitignorePath);
            const [exists] = await file.exists();
            
            if (!exists) {
                console.log(`⚠️ No .gitignore found at ${gitignorePath}`);
                return res.json({
                    success: true,
                    missingFiles: [],
                    message: 'No .gitignore file found'
                });
            }
            
            const [gitignoreContent] = await file.download();
            const patterns = gitignoreContent.toString('utf-8').split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'));
            
            console.log(`📄 Found ${patterns.length} patterns in .gitignore`);
            
            // Check which files exist in Cloud Storage
            for (const pattern of patterns) {
                // Skip directories and wildcards for now
                if (pattern.endsWith('/') || pattern.includes('*')) continue;
                
                const filePath = `${workspacePrefix}${repoSlug}/${pattern}`;
                const [exists] = await bucket.file(filePath).exists();
                
                if (!exists) {
                    missingFiles.push({
                        path: pattern,
                        reason: 'gitignored'
                    });
                }
            }
            
            console.log(`✅ Analysis complete: ${missingFiles.length} missing files`);
            
        } catch (e) {
            console.log(`⚠️ Error reading .gitignore: ${e.message}`);
        }
        
        res.json({
            success: true,
            missingFiles,
            message: missingFiles.length > 0 
                ? `Found ${missingFiles.length} missing configuration files`
                : 'All configuration files present'
        });
        
    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Execute command in workspace
app.post('/workspace/execute', async (req, res) => {
    const { userId, command, repoName } = req.body;
    const workspaceName = `user-${userId}`;
    const repoSlug = (repoName || 'default').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    try {
        console.log(`⚡ Executing command for ${workspaceName}/${repoSlug}: ${command}`);
        
        const bucket = storage.bucket(BUCKET_NAME);
        const workspacePrefix = `${workspaceName}/`;
        const localPath = path.join(WORKSPACE_DIR, workspaceName);
        
        // Download workspace from storage
        await fs.mkdir(localPath, { recursive: true });
        await downloadDirectory(bucket, workspacePrefix, localPath);
        
        // Auto-cd into repository directory
        const repoPath = path.join(localPath, repoSlug);
        const workingDir = await fs.access(repoPath).then(() => repoPath).catch(() => localPath);
        
        // Check if command starts a server
        const serverPatterns = [
            { pattern: /python3?\s+-m\s+http\.server\s+(\d+)/, port: 8000 },
            { pattern: /npm\s+(run\s+)?start/, port: 3000 },
            { pattern: /npm\s+(run\s+)?dev/, port: 3000 },
            { pattern: /flutter\s+run/, port: 8080, isFlutter: true },
            { pattern: /node\s+.*server/, port: 3000 },
            { pattern: /http-server.*-p\s+(\d+)/, port: 8080 },
        ];
        
        let isServerCommand = false;
        let port = 8000;
        let isFlutter = false;
        let actualCommand = command;
        
        for (const { pattern, port: defaultPort, isFlutter: flutter } of serverPatterns) {
            const match = command.match(pattern);
            if (match) {
                isServerCommand = true;
                port = match[1] ? parseInt(match[1]) : defaultPort;
                isFlutter = flutter || false;
                
                // Transform flutter run to web server mode
                if (isFlutter) {
                    actualCommand = `flutter run -d web-server --web-port=${port} --web-hostname=0.0.0.0`;
                }
                break;
            }
        }
        
        if (isServerCommand) {
            // Start preview server
            console.log(`🌐 Server command detected, starting preview on port ${port}`);
            
            // For preview, use workspace from Cloud Storage (includes gitignored files)
            // instead of fresh git clone
            const previewUrl = await startPreviewServer(userId, localPath, repoSlug, port, actualCommand);
            
            res.json({
                success: true,
                stdout: `Server started successfully!\n\n🌐 Preview URL: ${previewUrl}\n\nServer is running on port ${port}`,
                stderr: '',
                exitCode: 0,
                previewUrl,
                isServerCommand: true
            });
            return;
        }
        
        // Execute command normally in repo directory
        const { stdout, stderr, error } = await execAsync(command, {
            cwd: workingDir,
            timeout: 300000, // 5 min
            maxBuffer: 10 * 1024 * 1024 // 10MB
        }).catch(err => ({
            stdout: err.stdout || '',
            stderr: err.stderr || '',
            error: err
        }));
        
        // Upload changes back to storage
        await uploadDirectory(localPath, bucket, workspacePrefix);
        
        // Cleanup
        await execAsync(`rm -rf ${localPath}`);
        
        res.json({
            success: !error,
            stdout: stdout || '',
            stderr: stderr || '',
            exitCode: error ? error.code : 0
        });
        
    } catch (error) {
        console.error('Command execution error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stdout: '',
            stderr: error.message
        });
    }
});

// Helper functions
async function startPreviewServer(userId, localPath, repoSlug, port, command = null) {
    const serviceName = `preview-user-${userId}`.toLowerCase();
    const imageUri = `gcr.io/${PROJECT_ID}/${serviceName}`;
    
    // Determine base image and command
    const isFlutter = command && command.includes('flutter');
    const baseImage = isFlutter ? 'ghcr.io/cirruslabs/flutter:stable' : 'python:3.11-slim';
    
    const cmd = command || `python3 -m http.server ${port}`;
    
    // Create Dockerfile for the preview
    const dockerfile = isFlutter 
        ? `FROM ${baseImage}
WORKDIR /app
COPY ${repoSlug}/ .
RUN flutter config --no-analytics && \
    find . -name "*.template" -type f | while read template; do \
        target="\${template%.template}"; \
        [ ! -f "\$target" ] && cp "\$template" "\$target" && echo "Created \$target from template"; \
    done && \
    [ ! -f .env ] && touch .env && \
    flutter pub get
EXPOSE ${port}
CMD ["sh", "-c", "${cmd}"]
`
        : `FROM ${baseImage}
WORKDIR /app
COPY ${repoSlug}/ .
EXPOSE ${port}
CMD ${JSON.stringify(cmd.split(' '))}
`;
    
    console.log(`🐳 Dockerfile:\n${dockerfile}`);
    
    await fs.writeFile(path.join(localPath, 'Dockerfile'), dockerfile);
    
    // Create tarball
    const tarballPath = `/tmp/${serviceName}.tar.gz`;
    await execAsync(`tar -czf ${tarballPath} -C ${localPath} .`, { timeout: 60000 });
    
    // Upload tarball to Cloud Storage
    const bucket = storage.bucket(BUCKET_NAME);
    const tarballName = `builds/${serviceName}.tar.gz`;
    await bucket.upload(tarballPath, {
        destination: tarballName,
        metadata: { cacheControl: 'no-cache' }
    });
    
    // Cleanup local tarball
    await fs.unlink(tarballPath);
    
    // Use Cloud Build API
    const { CloudBuildClient } = require('@google-cloud/cloudbuild').v1;
    const buildClient = new CloudBuildClient();
    
    try {
        console.log(`🔨 Starting Cloud Build for preview...`);
        
        // Create build
        const [operation] = await buildClient.createBuild({
            projectId: PROJECT_ID,
            build: {
                source: {
                    storageSource: {
                        bucket: BUCKET_NAME,
                        object: tarballName,
                    },
                },
                steps: [{
                    name: 'gcr.io/cloud-builders/docker',
                    args: ['build', '-t', imageUri, '.'],
                }],
                images: [imageUri],
            },
        });
        
        console.log(`⏳ Build started, waiting for completion...`);
        const [build] = await operation.promise();
        console.log(`✅ Build completed: ${build.status}`);
        
        // Deploy to Cloud Run using API
        const { ServicesClient } = require('@google-cloud/run').v2;
        const runClient = new ServicesClient();
        
        const parent = `projects/${PROJECT_ID}/locations/${LOCATION}`;
        const servicePath = `${parent}/services/${serviceName}`;
        
        console.log(`🚀 Deploying to Cloud Run...`);
        
        let isNewService = false;
        
        try {
            // Try to get existing service
            await runClient.getService({ name: servicePath });
            
            console.log(`♻️ Updating existing service...`);
            // Update existing service
            const [updateOp] = await runClient.updateService({
                service: {
                    name: servicePath,
                    template: {
                        containers: [{
                            image: imageUri,
                            ports: [{ containerPort: port }],
                            resources: {
                                limits: {
                                    memory: '4Gi',
                                    cpu: '2000m'
                                }
                            },
                            startupProbe: {
                                httpGet: {
                                    path: '/',
                                    port: port
                                },
                                timeoutSeconds: 10,
                                periodSeconds: 10,
                                failureThreshold: 24 // 24 * 10s = 4 minutes
                            }
                        }],
                    },
                },
            });
            await updateOp.promise();
        } catch (err) {
            // Create new service if doesn't exist
            if (err.code === 5 || err.message.includes('not found')) {
                console.log(`🆕 Creating new service...`);
                isNewService = true;
                const [createOp] = await runClient.createService({
                    parent,
                    serviceId: serviceName,
                    service: {
                        template: {
                            containers: [{
                                image: imageUri,
                                ports: [{ containerPort: port }],
                                resources: {
                                    limits: {
                                        memory: '4Gi',
                                        cpu: '2000m'
                                    }
                                },
                                startupProbe: {
                                    httpGet: {
                                        path: '/',
                                        port: port
                                    },
                                    timeoutSeconds: 10,
                                    periodSeconds: 10,
                                    failureThreshold: 24 // 24 * 10s = 4 minutes
                                }
                            }],
                        },
                        ingress: 'INGRESS_TRAFFIC_ALL',
                    },
                });
                await createOp.promise();
            } else {
                throw err;
            }
        }
        
        // Make service public if newly created
        if (isNewService) {
            console.log(`🔓 Making service public...`);
            await execAsync(
                `gcloud run services add-iam-policy-binding ${serviceName} --region=${LOCATION} --member="allUsers" --role="roles/run.invoker"`,
                { timeout: 30000 }
            );
        }
        
        // Get service URL
        const [service] = await runClient.getService({ name: servicePath });
        const url = service.uri;
        
        console.log(`✅ Preview available at: ${url}`);
        return url;
        
    } catch (error) {
        console.error('Preview server error:', error);
        throw new Error(`Failed to start preview: ${error.message}`);
    }
}

async function uploadDirectory(localPath, bucket, prefix) {
    const files = await fs.readdir(localPath, { recursive: true, withFileTypes: true });
    
    let uploadCount = 0;
    const totalFiles = files.filter(f => f.isFile()).length;
    console.log(`📤 Uploading ${totalFiles} files...`);
    
    for (const file of files) {
        if (file.isFile()) {
            const filePath = path.join(file.path || localPath, file.name);
            const relativePath = path.relative(localPath, filePath);
            const destination = path.join(prefix, relativePath).replace(/\\/g, '/');
            
            try {
                await bucket.upload(filePath, {
                    destination,
                    metadata: { cacheControl: 'no-cache' },
                    resumable: true, // Use resumable upload for large files
                    timeout: 300000 // 5 min per file
                });
                
                uploadCount++;
                if (uploadCount % 50 === 0) {
                    console.log(`📤 Uploaded ${uploadCount}/${totalFiles} files...`);
                }
            } catch (err) {
                console.error(`⚠️ Failed to upload ${relativePath}: ${err.message}`);
            }
        }
    }
    
    console.log(`✅ Upload complete: ${uploadCount}/${totalFiles} files`);
}

async function downloadDirectory(bucket, prefix, localPath) {
    const [files] = await bucket.getFiles({ prefix });
    
    for (const file of files) {
        const relativePath = file.name.substring(prefix.length);
        if (!relativePath) continue;
        
        const destination = path.join(localPath, relativePath);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await file.download({ destination });
    }
}

const PORT = process.env.PORT || 8080;

// Workstation management con API client
const { WorkstationsClient } = require('@google-cloud/workstations').v1;
const workstationsClient = new WorkstationsClient();

const CLUSTER = 'drape-dev-cluster';
const CONFIG = 'drape-custom-config'; // Container custom ottimizzato

app.post('/workstation/create', async (req, res) => {
    const { userId, repoName, repoUrl } = req.body;
    // Nome fisso per utente - riutilizzabile
    const workstationName = `ws-user-${userId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').substring(0, 63);
    
    try {
        const parent = `projects/${PROJECT_ID}/locations/${LOCATION}/workstationClusters/${CLUSTER}/workstationConfigs/${CONFIG}`;
        const workstationPath = `${parent}/workstations/${workstationName}`;
        
        let workstation;
        let isNew = false;
        
        // Check se workstation esiste già
        try {
            console.log(`🔍 Checking if workstation exists: ${workstationName}`);
            [workstation] = await workstationsClient.getWorkstation({ name: workstationPath });
            console.log(`✅ Workstation exists, state: ${workstation.state}`);
            
            // Se esiste ma è spento, avvialo (asincrono)
            if (workstation.state === 'STATE_STOPPED' || workstation.state === 'STOPPED') {
                console.log(`🚀 Starting existing workstation (async)...`);
                // Non aspettare il completamento - ritorna subito
                workstationsClient.startWorkstation({ name: workstationPath }).catch(err => {
                    console.error('Start error:', err);
                });
                
                // Ritorna subito con stato "starting"
                return res.json({
                    success: true,
                    workstationName,
                    url: `https://${workstation.host}`,
                    isNew: false,
                    state: 'starting'
                });
            }
        } catch (notFoundError) {
            // Workstation non esiste, crealo
            console.log(`📦 Creating new workstation: ${workstationName}`);
            isNew = true;
            
            const [operation] = await workstationsClient.createWorkstation({
                parent,
                workstationId: workstationName,
                workstation: {}
            });
            await operation.promise();
            
            // Avvia workstation (asincrono)
            console.log(`🚀 Starting new workstation (async)...`);
            workstationsClient.startWorkstation({ name: workstationPath }).catch(err => {
                console.error('Start error:', err);
            });
            
            [workstation] = await workstationsClient.getWorkstation({ name: workstationPath });
            
            // Clone repo in background (non aspettare)
            if (repoUrl) {
                console.log(`📂 Will clone repo when workstation is ready: ${repoUrl}`);
            }
            
            // Ritorna subito
            return res.json({
                success: true,
                workstationName,
                url: `https://${workstation.host}`,
                isNew: true,
                state: 'starting'
            });
        }
        
        // Workstation già running
        res.json({
            success: true,
            workstationName,
            url: `https://${workstation.host}`,
            isNew: false,
            state: 'running'
        });
    } catch (error) {
        console.error('Workstation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/workstation/execute', async (req, res) => {
    const { workstationName, command } = req.body;
    
    if (!workstationName || !command) {
        return res.status(400).json({ error: 'workstationName and command required' });
    }
    
    try {
        const parent = `projects/${PROJECT_ID}/locations/${LOCATION}/workstationClusters/${CLUSTER}/workstationConfigs/${CONFIG}`;
        const workstationPath = `${parent}/workstations/${workstationName}`;
        
        // Ottieni lo stato del workstation
        const [workstation] = await workstationsClient.getWorkstation({
            name: workstationPath
        });
        
        // Check se è running
        if (workstation.state !== 'STATE_RUNNING' && workstation.state !== 'RUNNING') {
            return res.json({ 
                success: true, 
                output: `⏳ Workstation is ${workstation.state}. Please wait a moment and try again.`
            });
        }
        
        const host = workstation.host;
        
        console.log(`⚡ Executing command in ${workstationName}: ${command}`);
        
        // Chiama exec server nel workstation (porta 80, path /exec)
        const execUrl = `https://${host}/exec`;
        
        const execResponse = await axios.post(execUrl, 
            { command },
            { 
                timeout: 30000,
                validateStatus: () => true, // Accetta qualsiasi status
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (execResponse.data && execResponse.data.success !== false) {
            res.json({ 
                success: true, 
                output: execResponse.data.output || execResponse.data.error || 'Command executed'
            });
        } else {
            res.json({ 
                success: true, 
                output: execResponse.data.error || 'Command executed with errors'
            });
        }
    } catch (error) {
        console.error('Execute error:', error.message);
        res.json({ 
            success: true, 
            output: `⏳ Workstation not ready yet. Please wait a moment and try again.\n\nError: ${error.message}`
        });
    }
});

async function executeInWorkstation(workstationName, command) {
    // Funzione helper per clonazione - usa approccio semplificato
    console.log(`Executing in workstation ${workstationName}: ${command}`);
    return 'Command executed';
}

app.post('/workstation/stop', async (req, res) => {
    const { workstationName } = req.body;
    
    try {
        const parent = `projects/${PROJECT_ID}/locations/${LOCATION}/workstationClusters/${CLUSTER}/workstationConfigs/${CONFIG}`;
        const workstationPath = `${parent}/workstations/${workstationName}`;
        
        const [operation] = await workstationsClient.stopWorkstation({
            name: workstationPath
        });
        
        await operation.promise();
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Gemini backend running on port ${PORT}`);
});
