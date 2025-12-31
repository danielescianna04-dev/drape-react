/**
 * Holy Grail Routes
 * New API endpoints using Fly.io MicroVMs instead of Coder
 * 
 * These routes provide the same functionality as the old Coder-based routes
 * but with instant VM spawning (< 3 seconds instead of 2-3 minutes).
 * 
 * Routes:
 * - POST /fly/project/create - Create a new project (clone repo)
 * - GET  /fly/project/:id/files - List project files
 * - GET  /fly/project/:id/file - Read a file
 * - POST /fly/project/:id/file - Write a file
 * - POST /fly/project/:id/exec - Execute command
 * - POST /fly/preview/start - Start preview server
 * - POST /fly/preview/stop - Stop preview
 * - GET  /fly/status - System status
 */

const express = require('express');
const router = express.Router();
const { CODER_SESSION_TOKEN } = require('../utils/constants');

const orchestrator = require('../services/workspace-orchestrator');
const storageService = require('../services/storage-service');
const flyService = require('../services/fly-service');
const { asyncHandler } = require('../middleware/errorHandler');
const { analyzeProjectWithAI, analyzeEnvVars } = require('../services/project-analyzer');

/**
 * GET /fly/project/:id/env
 * Get Environment Variables (.env)
 */
router.get('/project/:id/env', asyncHandler(async (req, res) => {
    const { id: projectId } = req.params;

    // Read .env file
    const result = await orchestrator.readFile(projectId, '.env');
    let variables = [];

    if (result.success && result.content) {
        // Parse .env content
        variables = result.content.split('\n')
            .filter(line => line.trim() && !line.startsWith('#'))
            .map(line => {
                const [key, ...parts] = line.split('=');
                const value = parts.join('=');
                return {
                    key: key.trim(),
                    value: value ? value.trim().replace(/^["']|["']$/g, '') : '',
                    isSecret: key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')
                };
            });
    }

    res.json({ success: true, variables });
}));

/**
 * POST /fly/project/:id/env
 * Save Environment Variables (.env)
 */
router.post('/project/:id/env', asyncHandler(async (req, res) => {
    const { id: projectId } = req.params;
    const { variables } = req.body; // Array of { key, value }

    if (!Array.isArray(variables)) {
        return res.status(400).json({ error: 'variables must be an array' });
    }

    const content = variables
        .map(v => `${v.key}=${v.value}`)
        .join('\n');

    await orchestrator.writeFile(projectId, '.env', content);

    res.json({ success: true, message: 'Environment variables saved' });
}));

/**
 * POST /fly/project/:id/env/analyze
 * Analyze project to find needed env vars
 */
router.post('/project/:id/env/analyze', asyncHandler(async (req, res) => {
    const { id: projectId } = req.params;
    console.log(`🧪 [Fly] Analyzing env vars for: ${projectId}`);

    // Get file list
    const { files } = await orchestrator.listFiles(projectId);
    const fileNames = files.map(f => f.path);

    // Read key config files
    let configFiles = {};
    for (const configName of ['package.json', 'next.config.js', 'vite.config.js', 'docker-compose.yml', 'app.py', 'settings.py', 'config.js']) {
        try {
            const result = await orchestrator.readFile(projectId, configName);
            if (result.success) configFiles[configName] = result.content;
        } catch { }
    }

    // Analyze
    const variables = await analyzeEnvVars(fileNames, configFiles);

    res.json({ success: true, variables });
}));

/**
 * POST /fly/project/create
 * Create a new project by cloning a repository
 */
router.post('/project/create', asyncHandler(async (req, res) => {
    const { projectId, repositoryUrl, githubToken } = req.body;
    const startTime = Date.now();

    console.log(`\n🚀 [Fly] Creating project: ${projectId}`);
    console.log(`   📦 Repository: ${repositoryUrl || '(none)'}`);

    if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
    }

    let filesCount = 0;
    let result = null;

    // Clone repository if provided
    if (repositoryUrl) {
        result = await orchestrator.cloneRepository(projectId, repositoryUrl, githubToken);
        filesCount = result.filesCount;
    }

    const elapsed = Date.now() - startTime;
    console.log(`✅ [Fly] Project created in ${elapsed}ms`);

    res.json({
        success: true,
        projectId,
        filesCount,
        files: (result && result.files) ? result.files.map(f => typeof f === 'string' ? f : f.path) : [],
        timing: { totalMs: elapsed },
        architecture: 'holy-grail'
    });
}));

/**
 * GET /fly/project/:id/files
 * List all files in a project
 */
router.get('/project/:id/files', asyncHandler(async (req, res) => {
    const { id: projectId } = req.params;

    console.log(`📂 [Fly] Listing files for: ${projectId}`);

    const result = await orchestrator.listFiles(projectId);

    res.json({
        success: true,
        files: result.files || [],
        count: result.files?.length || 0
    });
}));

/**
 * GET /fly/project/:id/file
 * Read a single file
 */
router.get('/project/:id/file', asyncHandler(async (req, res) => {
    const { id: projectId } = req.params;
    const { path: filePath } = req.query;

    if (!filePath) {
        return res.status(400).json({ error: 'path query parameter required' });
    }

    const result = await orchestrator.readFile(projectId, filePath);

    if (!result.success) {
        return res.status(404).json({ error: 'File not found' });
    }

    res.json({
        success: true,
        path: filePath,
        content: result.content
    });
}));

/**
 * POST /fly/project/:id/file
 * Write/update a file
 */
router.post('/project/:id/file', asyncHandler(async (req, res) => {
    const { id: projectId } = req.params;
    const { path: filePath, content } = req.body;

    if (!filePath) {
        return res.status(400).json({ error: 'path is required' });
    }

    await orchestrator.writeFile(projectId, filePath, content || '');

    res.json({
        success: true,
        path: filePath,
        message: 'File saved'
    });
}));

/**
 * POST /fly/project/:id/exec
 * Execute a command in the project's VM
 */
router.post('/project/:id/exec', asyncHandler(async (req, res) => {
    const { id: projectId } = req.params;
    const { command, cwd } = req.body;

    if (!command) {
        return res.status(400).json({ error: 'command is required' });
    }

    console.log(`🔗 [Fly] Exec for ${projectId}: ${command.substring(0, 50)}...`);

    const result = await orchestrator.exec(projectId, command, cwd);

    res.json({
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr
    });
}));

/**
 * POST /fly/preview/start
 * Start the preview/dev server for a project
 */
router.post('/preview/start', asyncHandler(async (req, res) => {
    const { projectId, repositoryUrl, githubToken } = req.body;
    const startTime = Date.now();

    console.log(`\n🚀 [Fly] Starting preview for: ${projectId}`);

    if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Flush headers immediately so the client knows we've started
    if (res.flushHeaders) res.flushHeaders();

    // Send 2KB of whitespace padding to bypass proxy/browser buffers
    // and force immediate delivery of the following events.
    res.write(' '.repeat(2048) + '\n');
    if (res.flush) res.flush();

    const sendStep = (step, message, data = {}) => {
        const payload = JSON.stringify({ type: 'step', step, message, ...data });
        res.write(`data: ${payload}\n\n`);
        if (res.flush) res.flush();
    };

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
        res.write(`: ping\n\n`);
        if (res.flush) res.flush();
    }, 5000);

    try {
        console.log(`   [1/5] Analyzing project...`);
        sendStep('analyzing', 'Analisi del progetto...');

        // Helper for robust timeouts
        const withTimeout = async (promise, timeoutMs, label) => {
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs)
            );
            return Promise.race([promise, timeout]);
        };

        // Clone repo if needed
        if (repositoryUrl) {
            console.log(`   Checking files for project: ${projectId}`);
            try {
                const filesList = await withTimeout(orchestrator.listFiles(projectId), 8000, 'listFiles');
                if (!filesList.files || filesList.files.length === 0) {
                    console.log(`   📥 Cloning repository...`);
                    sendStep('cloning', 'Download dei file dal repository...');
                    await withTimeout(orchestrator.cloneRepository(projectId, repositoryUrl, githubToken), 30000, 'cloneRepository');
                }
            } catch (e) {
                console.warn(`   ⚠️ Storage check failed: ${e.message}`);
                // Continue anyway if it's just a timeout/error on listing
            }
        }

        console.log(`   [2/5] Detecting stack...`);
        sendStep('detecting', 'Rilevamento stack tecnologico...');

        // Get file list for project detection
        let fileNames = [];
        let configFiles = {};
        try {
            const listResult = await withTimeout(orchestrator.listFiles(projectId), 5000, 'listFiles (detecting)');
            fileNames = (listResult.files || []).map(f => f.path);

            // Read config files for detection
            for (const configName of ['package.json', 'requirements.txt', 'go.mod']) {
                try {
                    const result = await withTimeout(orchestrator.readFile(projectId, configName), 3000, `readFile(${configName})`);
                    if (result.success) {
                        configFiles[configName] = result.content;
                    }
                } catch { }
            }
        } catch (e) {
            console.warn(`   ⚠️ Detection data gathering failed: ${e.message}`);
        }

        // Detect project type with AI
        // ... (existing detection logic)

        // 🚀 PATCH: Ensure Vite allows our proxy host
        try {
            // Check for js or ts config
            let configName = 'vite.config.js';
            let viteConfigResult = await withTimeout(orchestrator.readFile(projectId, configName), 3000, 'readViteConfigJS');

            if (!viteConfigResult.success) {
                configName = 'vite.config.ts';
                viteConfigResult = await withTimeout(orchestrator.readFile(projectId, configName), 3000, 'readViteConfigTS');
            }

            if (viteConfigResult.success && viteConfigResult.content) {
                let content = viteConfigResult.content;
                if (!content.includes('allowedHosts') && !content.includes('drape-workspaces.fly.dev')) {
                    console.log(`   🔧 Patching ${configName} for allowedHosts...`);
                    // Simple robust regex replacer for common vite configs
                    if (content.includes('server: {')) {
                        content = content.replace('server: {', `server: {\n    allowedHosts: ['drape-workspaces.fly.dev', 'all'],`);
                    } else if (content.includes('defineConfig({')) {
                        content = content.replace('defineConfig({', `defineConfig({\n  server: {\n    allowedHosts: ['drape-workspaces.fly.dev', 'all']\n  },`);
                    }

                    if (content !== viteConfigResult.content) {
                        await orchestrator.writeFile(projectId, configName, content);
                        console.log(`   ✅ ${configName} patched.`);
                    }
                }
            }
        } catch (e) {
            console.warn(`   ⚠️ Vite config patch warning: ${e.message}`);
        }

        let projectInfo = { type: 'static', startCommand: 'python3 -m http.server 3000 --bind 0.0.0.0' };
        try {
            if (fileNames.length > 0) {
                const detected = await analyzeProjectWithAI(fileNames, configFiles);
                if (detected) {
                    projectInfo = detected;
                    console.log(`🧠 [Fly] Detected: ${projectInfo.description}`);
                }
            }
        } catch (e) {
            console.log(`   Detection failed, using static fallback`);
        }

        console.log(`   [3/5] Booting MicroVM...`);
        sendStep('booting', 'Avvio della MicroVM su Fly.io...');

        // Start the preview
        const result = await withTimeout(orchestrator.startPreview(projectId, projectInfo), 60000, 'startPreview');

        const elapsed = Date.now() - startTime;
        console.log(`✅ [Fly] Preview ready in ${elapsed}ms`);

        // Use local backend as proxy for preview (enables proper cookie-based routing)
        const { getLocalIP } = require('../utils/helpers');
        const LOCAL_IP = getLocalIP();
        const PORT = process.env.PORT || 3000;
        const localPreviewUrl = `http://${LOCAL_IP}:${PORT}/`;

        // Send final result
        console.log(`   [4/5] Ready!`);
        sendStep('ready', 'Preview pronta!', {
            success: true,
            previewUrl: localPreviewUrl,
            coderToken: CODER_SESSION_TOKEN,
            agentUrl: result.agentUrl,
            machineId: result.machineId,
            projectType: projectInfo.description || projectInfo.type,
            timing: { totalMs: elapsed },
            architecture: 'holy-grail'
        });

    } catch (error) {
        console.error('❌ Preview start failed:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
        if (res.flush) res.flush();
    } finally {
        clearInterval(heartbeat);
        console.log(`   [5/5] Stream ending.`);
        res.end();
    }
}));

/**
 * POST /fly/preview/stop
 * Stop the preview and cleanup VM
 */
router.post('/preview/stop', asyncHandler(async (req, res) => {
    const { projectId } = req.body;

    if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
    }

    console.log(`⏹️ [Fly] Stopping preview for: ${projectId}`);

    const result = await orchestrator.stopVM(projectId);

    res.json(result);
}));

/**
 * GET /fly/status
 * Get system status and active VMs
 */
router.get('/status', asyncHandler(async (req, res) => {
    const activeVMs = await orchestrator.getActiveVMs();
    const flyHealth = await flyService.healthCheck();

    res.json({
        architecture: 'holy-grail',
        status: flyHealth.healthy ? 'operational' : 'degraded',
        flyio: flyHealth,
        activeVMs: activeVMs.length,
        vms: activeVMs.map(vm => ({
            projectId: vm.projectId,
            vmId: vm.vmId,
            idleMinutes: Math.round(vm.idleTime / 60000)
        }))
    });
}));

/**
 * GET /fly/health
 * Simple health check
 */
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        architecture: 'holy-grail',
        timestamp: new Date().toISOString()
    });
});

/**
 * POST /fly/session
 * Set routing cookie for the Gateway
 */
router.post('/session', (req, res) => {
    const { machineId } = req.body;
    if (!machineId) {
        return res.status(400).json({ error: 'machineId required' });
    }

    // Set cookie valid for session
    // SameSite=None; Secure required for iframes if cross-site, 
    // but here we are on same domain (sub paths), so Lax is fine.
    // However, if we move to subdomains later, we might need adjustments.
    // For now, simple cookie.
    res.cookie('drape_vm_id', machineId, {
        httpOnly: true, // Not accessible by JS (good for security)
        sameSite: 'Lax',
        path: '/'
    });

    res.json({ success: true, message: 'Session set' });
});

/**
 * POST /fly/inspect
 * AI-powered element inspection with SSE streaming (Holy Grail mode)
 */
router.post('/inspect', asyncHandler(async (req, res) => {
    const {
        description,
        userPrompt,
        elementInfo,
        projectId,
        selectedModel
    } = req.body;

    if (!projectId) {
        return res.status(400).json({ error: 'projectId required' });
    }

    console.log(`\n🔍 [Fly] AI Inspect: "${description?.substring(0, 50)}"`);
    console.log(`   Project: ${projectId}`);

    // Import Holy Grail inspect function
    const { streamInspectElementHolyGrail } = require('../services/ai-inspect-holygrail');

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
        for await (const chunk of streamInspectElementHolyGrail({
            description,
            userPrompt,
            elementInfo,
            projectId,
            selectedModel
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
 * POST /fly/reload
 * Reload/resync files to VM after AI modifications
 */
router.post('/reload', asyncHandler(async (req, res) => {
    const { projectId } = req.body;

    if (!projectId) {
        return res.status(400).json({ error: 'projectId required' });
    }

    console.log(`🔄 [Fly] Reloading project: ${projectId}`);

    // Get active VM and resync files
    const activeVMs = await orchestrator.getActiveVMs();
    const vm = activeVMs.find(v => v.projectId === projectId);

    if (vm) {
        // Sync files from storage to VM
        const storageService = require('../services/storage-service');
        const result = await storageService.syncToVM(projectId, vm.agentUrl);

        res.json({
            success: true,
            message: 'Files synced to VM',
            syncedCount: result.syncedCount
        });
    } else {
        res.json({
            success: true,
            message: 'No active VM - files will sync on next preview start'
        });
    }
}));

module.exports = router;
