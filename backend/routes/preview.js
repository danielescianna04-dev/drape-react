/**
 * Preview Routes
 * Project preview and dev server management
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

const { asyncHandler } = require('../middleware/errorHandler');
const { cleanWorkspaceName, cleanProjectId, getRepoPath, detectPreviewUrl, isDevServerCommand, execAsync } = require('../utils/helpers');
const { CODER_API_URL, CODER_WILDCARD_DOMAIN } = require('../utils/constants');
const { detectProjectType } = require('../projectDetector');
const { streamInspectElement } = require('../services/ai-inspect');

// Import Coder service (already instantiated)
const coderService = require('../coder-service');
const agentClient = require('../services/agent-client');


// Server logs storage for SSE
const serverLogsMap = new Map();

/**
 * POST /preview/start
 * Start project preview
 */
router.post('/start', asyncHandler(async (req, res) => {
    const startTime = Date.now();
    // Extract user info from request, fallback to defaults
    const { workstationId, forceRefresh, githubToken, repositoryUrl, userEmail, username } = req.body;

    console.log(`\n🚀 Preview Start: ${workstationId}`);

    // User Identity Logic
    let targetEmail = userEmail || 'daniele.scianna04@gmail.com';

    // Fix: If userEmail is an ID (no @), create a fake email for Coder
    if (!targetEmail.includes('@')) {
        targetEmail = `${targetEmail}@drape.ide`;
    }

    // Generate valid username from email (or ID)
    const rawName = username || targetEmail.split('@')[0];
    const targetUsername = rawName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();

    if (!workstationId) {
        return res.status(400).json({ error: 'workstationId is required' });
    }

    // Use the raw workstationId (e.g. "ws-abc123") as the workspace name directly
    // This matches what is stored in Firestore by /workstation/create
    const wsName = workstationId;

    // Ensure Coder user exists (Multi-User Support)
    console.log(`   User: ${targetEmail} (${targetUsername})`);
    const coderUser = await coderService.ensureUser(targetEmail, targetUsername);

    // Create or get workspace FOR THIS USER
    console.log(`   Creating/getting workspace: ${wsName} for user ${coderUser.username}`);
    const workspace = await coderService.createWorkspace(coderUser.id, wsName, repositoryUrl);
    console.log(`   Workspace ID: ${workspace.id}`);

    // Start if stopped or build not succeeded
    const buildStatus = workspace.latest_build?.job?.status;

    // Define wsOwner early (needed for agent calls)
    const wsOwner = coderUser.username;

    if (buildStatus !== 'succeeded') {
        if (buildStatus !== 'running' && buildStatus !== 'pending') {
            console.log('   Starting workspace...');
            await coderService.startWorkspace(workspace.id);
        } else {
            console.log(`   ⏳ Workspace build already in progress (${buildStatus})...`);
        }

        // Wait for workspace to be FULLY READY by checking the Agent
        console.log('   ⏳ Waiting for workspace to be fully ready...');
        const agentReady = await agentClient.waitForAgent(wsOwner, wsName, coderUser.id, 180000); // 3 min
        if (!agentReady) {
            console.warn('   ⚠️ Agent not ready after 3 minutes, proceeding with caution...');
        } else {
            console.log('   ✅ Workspace agent is ready!');
        }
    }


    // Get local IP for URLs
    const { getLocalIP } = require('../utils/helpers');
    const LOCAL_IP = getLocalIP();
    const PORT = process.env.PORT || 3000;

    // Build URLs with CORRECT USERNAME
    const apiBase = `http://${LOCAL_IP}:${PORT}`;
    const wildcardDomain = CODER_WILDCARD_DOMAIN;

    // wsOwner already defined above

    const vscodeUrl = `${CODER_API_URL}/@${wsOwner}/${wsName}/apps/vscode/?folder=/home/coder`;

    const devUrl = `${CODER_API_URL}/@${wsOwner}/${wsName}/apps/dev/`;
    const previewUrl = `${CODER_API_URL}/@${wsOwner}/${wsName}/apps/preview/`;

    // Try to detect project type
    let projectInfo = { type: 'unknown', defaultPort: 3000 };

    // Clone repo if needed
    if (repositoryUrl) {
        try {
            let cloneUrl = repositoryUrl;
            if (githubToken && repositoryUrl.includes('github.com') && !repositoryUrl.includes('@')) {
                // Inject token for private repos: https://token@github.com/...
                cloneUrl = repositoryUrl.replace('https://', `https://${githubToken}@`);
            }

            console.log(`   Preparing workspace project: ${wsName}...`);

            // Clone via Drape Agent (NO SSH FALLBACK)
            console.log('   🚀 Executing clone via Drape Agent...');
            const prepareCmd = `if [ ! -d "/home/coder/project/.git" ]; then rm -rf /home/coder/project && git clone ${cloneUrl} /home/coder/project; else cd /home/coder/project && (git pull || echo "Pull skipped"); fi`;

            const result = await agentClient.exec(wsOwner, wsName, coderUser.id, prepareCmd);
            if (result.exitCode === 0) {
                console.log('   ✅ Repository ready.');
            } else {
                console.warn('   ⚠️ Clone issue:', result.stderr || result.stdout);
            }

        } catch (e) {
            console.error('   Clone error:', e.message);
        }
    }

    // LIST FILES RECURSIVELY (Depth 2) to give context
    let files = [];
    let configFilesContent = {};
    try {
        // List files via Agent (NO SSH)
        const lsResult = await agentClient.exec(wsOwner, wsName, coderUser.id, 'find /home/coder/project -maxdepth 2 -not -path "*/.*" -not -path "*/node_modules/*"');

        if (lsResult.stdout) {
            files = lsResult.stdout.split('\n')
                .map(f => f.replace('/home/coder/project/', ''))
                .filter(f => f.trim() && f !== '/home/coder/project');
        }

        // FALLBACK: If no files found in workspace, try Firestore
        if (files.length === 0 && workstationId) {
            console.log('   ⚠️ No files in workspace, trying Firestore fallback...');
            try {
                const admin = require('firebase-admin');
                const db = admin.firestore();
                // Query by workstationId field since document ID (projectId) might be case-sensitive
                const snapshot = await db.collection('workstation_files')
                    .where('workstationId', '==', workstationId)
                    .limit(1)
                    .get();

                if (!snapshot.empty) {
                    const doc = snapshot.docs[0];
                    if (doc.data().files) {
                        files = doc.data().files;
                        console.log(`   📂 Loaded ${files.length} files from Firestore (via workstationId query)`);
                    }
                } else {
                    // Legacy fallback: try ID directly (just in case)
                    const projectId = workstationId.replace(/^ws-/, '');
                    const doc = await db.collection('workstation_files').doc(projectId).get();
                    if (doc.exists && doc.data().files) {
                        files = doc.data().files;
                        console.log(`   📂 Loaded ${files.length} files from Firestore (via ID)`);
                    }
                }

            } catch (fsError) {
                console.error('   Firestore fallback failed:', fsError.message);
            }
        }

        // Read key config files for AI
        const configFiles = ['package.json', 'requirements.txt', 'go.mod', 'Cargo.toml', 'pom.xml', 'compose.yml', 'Dockerfile', 'app.json'];
        for (const file of configFiles) {
            if (files.includes(file) || files.some(f => f.endsWith(file))) {
                const content = await agentClient.exec(wsOwner, wsName, coderUser.id, `cat /home/coder/project/${file} 2>/dev/null | head -n 50`);
                if (content.stdout) {
                    configFilesContent[file] = content.stdout;
                }
            }
        }

        console.log(`   📂 Files found: ${files.length}, configs: ${Object.keys(configFilesContent).join(', ') || 'none'}`);

        // 1. Try AI Analysis first (It's 2025, let's trust AI)
        const { analyzeProjectWithAI } = require('../services/project-analyzer');

        const aiResult = await analyzeProjectWithAI(files, configFilesContent);


        if (aiResult) {
            projectInfo = aiResult;
            console.log(`🧠 AI Detected: ${projectInfo.description}`);
            console.log(`   CMD: ${projectInfo.startCommand}`);
        } else {
            // 2. Fallback to static rules
            try {
                const packageJson = configFilesContent['package.json'] ? JSON.parse(configFilesContent['package.json']) : null;
                const detected = detectProjectType(files, packageJson);
                if (detected) {
                    projectInfo = detected;
                    console.log(`📦 Static Detected: ${detected.description}`);
                }
            } catch (e) {
                console.log('   Static detection failed:', e.message);
            }
        }

    } catch (e) {
        console.log('   Detection failed:', e.message);
    }

    const isStatic = projectInfo.type === 'static' || projectInfo.type === 'html';

    // AUTO-START SERVER LOGIC
    if (!isStatic && projectInfo.startCommand) {
        console.log(`🚀 Starting server for ${wsName}...`);

        // 1. Run install command if needed (e.g., node_modules missing)
        if (projectInfo.type === 'node' || configFilesContent['package.json']) {
            try {
                const checkNodeModules = await agentClient.exec(wsOwner, wsName, coderUser.id, 'ls /home/coder/project/node_modules');

                if (checkNodeModules.exitCode !== 0) {
                    console.log('   Dependencies missing. Installing...');
                    // Add a system log for the UI
                    if (serverLogsMap.has(workstationId)) {
                        serverLogsMap.get(workstationId).logs.push({
                            id: `install-${Date.now()}`,
                            content: 'Dependencies missing. Running install...',
                            type: 'system',
                            timestamp: new Date()
                        });
                    }

                    const installCmd = `cd /home/coder/project && ${projectInfo.installCommand || 'npm install'}`;
                    await agentClient.exec(wsOwner, wsName, coderUser.id, installCmd);
                }
            } catch (e) {
                console.log('   Install step failed/skipped:', e.message);
            }
        }

        // 2. Start the server in background
        // We use nohup and & to detach the process
        // IMPORTANT: Always use port 3000 to match Coder template's "dev" app configuration
        const port = 3000; // Force port 3000 regardless of AI detection

        // Kill any existing server processes first to avoid port conflicts
        console.log('   Cleaning up old server processes...');
        const cleanupCmd = 'pkill -f "http.server" || true; pkill -f "node.*dev" || true; sleep 1';
        await agentClient.exec(wsOwner, wsName, coderUser.id, cleanupCmd);

        // Modify startCommand to use port 3000 if it's a static server
        let startCmd = projectInfo.startCommand || 'npm run dev';
        if (startCmd.includes('http.server')) {
            // Python http.server - replace any port with 3000 and bind to all interfaces
            startCmd = 'python3 -m http.server 3000 --bind 0.0.0.0';
        } else if (startCmd.includes('serve')) {
            // serve package - add port flag
            startCmd = startCmd.replace(/(-p|--port)\s*\d+/g, '') + ' -l 3000';
        }

        // SMART CWD: Check if the project is inside a subdirectory (common with git clone)
        let projectDir = '/home/coder/project';
        try {
            const lsCmd = 'ls -F /home/coder/project | grep "/" | head -n 2';
            const lsOut = await agentClient.exec(wsOwner, wsName, coderUser.id, lsCmd);

            const dirs = lsOut.stdout ? lsOut.stdout.trim().split('\n').filter(Boolean) : [];
            // If we have exactly one directory and it's not hidden
            if (dirs.length === 1) {
                const subDir = dirs[0].replace('/', ''); // remove trailing slash
                console.log(`   📂 Smart CWD: Detected subdirectory '${subDir}'. Entering...`);
                projectDir = `/home/coder/project/${subDir}`;
            }
        } catch (e) {
            console.warn('   Smart CWD check failed, staying in root:', e.message);
        }

        const fullStartCmd = `cd "${projectDir}" && export HOST=0.0.0.0 && export PORT=${port} && nohup ${startCmd} > /home/coder/server.log 2>&1 &`;
        console.log(`   Executing: ${fullStartCmd}`);
        await agentClient.exec(wsOwner, wsName, coderUser.id, fullStartCmd);



        // 3. Start log tailing in background
        const tailLogs = async () => {
            let lastSize = 0;
            const logFile = '/home/coder/server.log';

            // Wait a bit for the file to be created
            await new Promise(resolve => setTimeout(resolve, 2000));

            for (let i = 0; i < 100; i++) { // Tail for 5 minutes (100 * 3s)
                try {
                    const result = await agentClient.exec(wsOwner, wsName, coderUser.id, `tail -c +${lastSize + 1} ${logFile}`);
                    if (result.stdout) {
                        const newLogs = result.stdout.split('\n').filter(l => l.trim());
                        if (serverLogsMap.has(workstationId)) {
                            const entry = serverLogsMap.get(workstationId);
                            newLogs.forEach(line => {
                                const logItem = {
                                    id: `app-${Date.now()}-${Math.random()}`,
                                    content: line,
                                    type: 'output',
                                    timestamp: new Date()
                                };
                                entry.logs.push(logItem);
                                // Notify listeners
                                entry.listeners.forEach(res => {
                                    res.write(`data: ${JSON.stringify(logItem)}\n\n`);
                                });
                            });
                        }
                        // Update lastSize based on what we read
                        const sizeResult = await agentClient.exec(wsOwner, wsName, coderUser.id, `wc -c < ${logFile}`);
                        lastSize = parseInt(sizeResult.stdout) || lastSize;
                    }
                } catch (e) { }
                await new Promise(resolve => setTimeout(resolve, 3000));
                if (!serverLogsMap.has(workstationId)) break;
            }
        };
        tailLogs();

        // Add a system log for the UI
        if (serverLogsMap.has(workstationId)) {
            serverLogsMap.get(workstationId).logs.push({
                id: `start-${Date.now()}`,
                content: `Starting server with: ${projectInfo.startCommand}`,
                type: 'system',
                timestamp: new Date()
            });
        }
    }

    // Wait for server to be actually ready (avoid 502 in frontend)
    const targetUrl = isStatic ? previewUrl : devUrl;
    console.log(`   ⏳ Waiting for server to be ready at ${targetUrl}...`);

    let serverReady = false;
    for (let i = 0; i < 15; i++) { // Try for 30 seconds (15 * 2s)
        try {
            const axios = require('axios');
            const response = await axios.get(targetUrl, {
                timeout: 5000,
                validateStatus: (status) => status < 500 // Accept anything that isn't 5xx
            });
            if (response.status < 500) {
                serverReady = true;
                console.log(`   ✅ Server ready! Status: ${response.status}`);
                break;
            }
        } catch (e) {
            // Server not ready yet, continue waiting
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (!serverReady) {
        console.log('   ⚠️ Server health check timeout, returning anyway');
    }

    res.json({
        success: true,
        previewUrl: isStatic ? previewUrl : devUrl,
        vscodeUrl,
        projectPreviewUrl: isStatic ? previewUrl : devUrl,
        port: projectInfo.defaultPort || 3000,
        projectType: projectInfo.description || 'Unknown',
        isStaticSite: isStatic,
        workspaceId: workspace.id,
        workspaceName: wsName,
        commands: {
            install: projectInfo.installCommand || 'npm install',
            start: projectInfo.startCommand || 'npm run dev'
        },
        timing: { totalMs: Date.now() - startTime },
        isCloudWorkstation: true,
        coderToken: await coderService.createUserToken(coderUser.id)
    });
}));
// SSH fallback removed - using Agent-only architecture for performance
/**
 * GET /preview/logs/:workstationId
 * SSE stream for server logs
 */
router.get('/logs/:workstationId', (req, res) => {
    const { workstationId } = req.params;

    console.log(`📺 SSE logs connection: ${workstationId}`);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    if (!serverLogsMap.has(workstationId)) {
        serverLogsMap.set(workstationId, { logs: [], listeners: new Set() });
    }

    const entry = serverLogsMap.get(workstationId);

    // Send existing logs
    entry.logs.forEach(log => {
        res.write(`data: ${JSON.stringify(log)}\n\n`);
    });

    entry.listeners.add(res);

    req.on('close', () => {
        console.log(`📺 SSE disconnected: ${workstationId}`);
        entry.listeners.delete(res);
    });
});

/**
 * POST /preview/clear-cache
 * Clear preview cache
 */
router.post('/clear-cache', (req, res) => {
    const { workstationId } = req.body;

    if (workstationId) {
        const repoPath = getRepoPath(workstationId);
        console.log(`🗑️ Cache cleared for: ${workstationId}`);
    } else {
        console.log('🗑️ All preview cache cleared');
    }

    res.json({ success: true });
});

/**
 * POST /preview/env
 * Save environment variables
 */
router.post('/env', asyncHandler(async (req, res) => {
    const { workstationId, envVars, targetFile } = req.body;

    if (!workstationId || !envVars) {
        return res.status(400).json({ error: 'workstationId and envVars required' });
    }

    console.log(`📝 Saving env vars for: ${workstationId}`);

    const repoPath = getRepoPath(cleanProjectId(workstationId));
    const envFileName = targetFile || '.env';
    const envFilePath = path.join(repoPath, envFileName);

    // Read existing
    let existingVars = {};
    try {
        const content = await fs.readFile(envFilePath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
            const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
            if (match) existingVars[match[1]] = match[2];
        }
    } catch { }

    // Merge
    const merged = { ...existingVars, ...envVars };

    // Build content
    let content = '# Environment variables\n# Generated by Drape IDE\n\n';
    for (const [key, value] of Object.entries(merged)) {
        const needsQuotes = /[\s#=]/.test(value);
        content += `${key}=${needsQuotes ? `"${value}"` : value}\n`;
    }

    await fs.writeFile(envFilePath, content, 'utf8');

    res.json({
        success: true,
        file: envFileName,
        varsCount: Object.keys(merged).length
    });
}));

/**
 * POST /preview/inspect
 * AI-powered element inspection with SSE streaming
 */
router.post('/inspect', asyncHandler(async (req, res) => {
    const {
        description,
        userPrompt,
        elementInfo,
        projectId,
        workstationId,
        selectedModel,
        userEmail, // Extract user info
        username
    } = req.body;

    const effectiveProjectId = projectId || workstationId;

    // User Identity Logic
    const targetEmail = userEmail || 'daniele.scianna04@gmail.com';
    const targetUsername = username || targetEmail.split('@')[0].replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();

    if (!effectiveProjectId) {
        return res.status(400).json({ error: 'projectId or workstationId required' });
    }

    console.log(`\n🔍 Inspect: "${description?.substring(0, 50)}"`);
    console.log(`   User: ${targetUsername}`);

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
        for await (const chunk of streamInspectElement({
            description,
            userPrompt,
            elementInfo,
            projectId: effectiveProjectId,
            selectedModel,
            username: targetUsername // Pass owner
        })) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
    } catch (error) {
        console.error('Inspect error:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
}));

/**
 * GET /preview/expo-qr/:workstationId
 * Generate Expo Go QR code for React Native projects
 */
router.get('/expo-qr/:workstationId', asyncHandler(async (req, res) => {
    const { workstationId } = req.params;
    const { userId, username } = req.query;

    if (!userId || !username) {
        return res.status(400).json({ error: 'userId and username required' });
    }

    const wsName = cleanWorkspaceName(workstationId);
    const wsOwner = username.toLowerCase();

    // Expo typically runs on port 8081
    const expoUrl = `exp://${CODER_API_URL.replace(/https?:\/\//, '')}/@${wsOwner}/${wsName}/apps/expo`;
    const expoLanUrl = `exp://192.168.1.1:8081`; // LAN fallback

    // Generate QR code as data URL (simple implementation)
    // In production, use a QR library like 'qrcode'
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(expoUrl)}`;

    res.json({
        success: true,
        expoUrl,
        expoLanUrl,
        qrCodeUrl: qrApiUrl,
        instructions: [
            '1. Install Expo Go on your phone',
            '2. Scan this QR code with Expo Go',
            '3. The app will load on your device'
        ]
    });
}));

/**
 * GET /preview/context/:workstationId
 * Get full project context for AI
 */
router.get('/context/:workstationId', asyncHandler(async (req, res) => {
    const { workstationId } = req.params;
    const { userId, username } = req.query;

    if (!userId || !username) {
        return res.status(400).json({ error: 'userId and username required' });
    }

    const wsName = cleanWorkspaceName(workstationId);
    const wsOwner = username.toLowerCase();

    // Get user
    const sanitizedEmail = `${userId}@drape.ide`;
    const coderUser = await coderService.ensureUser(sanitizedEmail, wsOwner);

    // Get project context
    const context = await agentClient.getProjectContext(wsOwner, wsName, coderUser.id);

    res.json({
        success: true,
        projectContext: context
    });
}));

module.exports = router;

