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
    const { repositoryUrl, githubToken } = req.query;

    console.log(`📂 [Fly] Listing files for: ${projectId}`);

    let result = await orchestrator.listFiles(projectId);

    // If no files found and we have a repository URL, try to clone it now
    // This is useful for retries or if the initial creation didn't clone
    if ((!result.files || result.files.length === 0) && repositoryUrl) {
        console.log(`📦 [Fly] Project empty, attempting auto-clone from: ${repositoryUrl}`);
        try {
            const cloneResult = await orchestrator.cloneRepository(projectId, repositoryUrl, githubToken);
            if (cloneResult.success) {
                // Refresh file list after clone
                result = await orchestrator.listFiles(projectId);
            }
        } catch (cloneError) {
            console.error(`❌ [Fly] Auto-clone failed:`, cloneError.message);
            // If it's an auth error, propagate it
            if (cloneError.statusCode === 401) throw cloneError;
        }
    }

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
 * POST /fly/clone
 * Quick VM warmup - ensures VM is running and files are synced
 * Called when project is opened (before preview start)
 */
router.post('/clone', asyncHandler(async (req, res) => {
    const { workstationId, repositoryUrl, githubToken } = req.body;
    const projectId = workstationId;

    console.log(`\n🔥 [Fly] Quick clone/warmup for: ${projectId}`);
    if (repositoryUrl) console.log(`   📎 Repo: ${repositoryUrl}`);

    if (!projectId) {
        return res.status(400).json({ error: 'workstationId is required' });
    }

    try {
        // Save repo URL so ensureGitRepo can find it (fixes "No repo URL" error)
        if (repositoryUrl) {
            await storageService.saveProjectMetadata(projectId, { repositoryUrl });
        }

        // Get or create VM (includes file sync + git setup)
        const vm = await orchestrator.getOrCreateVM(projectId);
        console.log(`   ✅ VM ready: ${vm.machineId}`);

        res.json({
            success: true,
            machineId: vm.machineId
        });
    } catch (error) {
        console.error(`❌ [Fly] Clone warmup failed:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
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

        // 🚀 PATCH: Ensure Vite/Next.js allow our proxy host
        try {
            // 1. Vite Patch
            let viteConfigJS = await withTimeout(orchestrator.readFile(projectId, 'vite.config.js'), 2000, 'readViteConfigJS');
            let viteConfigTS = !viteConfigJS.success ? await withTimeout(orchestrator.readFile(projectId, 'vite.config.ts'), 2000, 'readViteConfigTS') : { success: false };

            const viteConfig = viteConfigJS.success ? { name: 'vite.config.js', result: viteConfigJS } : (viteConfigTS.success ? { name: 'vite.config.ts', result: viteConfigTS } : null);

            if (viteConfig && viteConfig.result.content) {
                let content = viteConfig.result.content;
                if (!content.includes('allowedHosts') && !content.includes('drape-workspaces.fly.dev')) {
                    console.log(`   🔧 Patching ${viteConfig.name} for allowedHosts...`);
                    if (content.includes('server: {')) {
                        content = content.replace('server: {', `server: {\n    allowedHosts: ['drape-workspaces.fly.dev', 'all'],`);
                    } else if (content.includes('defineConfig({')) {
                        content = content.replace('defineConfig({', `defineConfig({\n  server: {\n    allowedHosts: ['drape-workspaces.fly.dev', 'all']\n  },`);
                    }

                    if (content !== viteConfig.result.content) {
                        await orchestrator.writeFile(projectId, viteConfig.name, content);
                        console.log(`   ✅ ${viteConfig.name} patched.`);
                    }
                }
            }

            // 2. Next.js Patch (experimental.allowedOrigins for Server Actions)
            let nextConfigJS = await withTimeout(orchestrator.readFile(projectId, 'next.config.js'), 2000, 'readNextConfigJS');
            let nextConfigMJS = !nextConfigJS.success ? await withTimeout(orchestrator.readFile(projectId, 'next.config.mjs'), 2000, 'readNextConfigMJS') : { success: false };

            const nextConfig = nextConfigJS.success ? { name: 'next.config.js', result: nextConfigJS } : (nextConfigMJS.success ? { name: 'next.config.mjs', result: nextConfigMJS } : null);

            if (nextConfig && nextConfig.result.content) {
                let content = nextConfig.result.content;
                if (!content.includes('allowedOrigins')) {
                    console.log(`   🔧 Patching ${nextConfig.name} for allowedOrigins...`);
                    // Simple injection for next.config
                    if (content.includes('const nextConfig = {')) {
                        content = content.replace('const nextConfig = {', `const nextConfig = {\n  experimental: { allowedOrigins: ['drape-workspaces.fly.dev', '*.fly.dev'] },`);
                    } else if (content.includes('module.exports = {')) {
                        content = content.replace('module.exports = {', `module.exports = {\n  experimental: { allowedOrigins: ['drape-workspaces.fly.dev', '*.fly.dev'] },`);
                    } else if (content.includes('export default {')) {
                        content = content.replace('export default {', `export default {\n  experimental: { allowedOrigins: ['drape-workspaces.fly.dev', '*.fly.dev'] },`);
                    }

                    if (content !== nextConfig.result.content) {
                        await orchestrator.writeFile(projectId, nextConfig.name, content);
                        console.log(`   ✅ ${nextConfig.name} patched.`);
                    }
                }
            }
        } catch (e) {
            console.warn(`   ⚠️ Config patch warning: ${e.message}`);
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

        // Start the preview (3 min timeout for large repos with many files)
        const result = await withTimeout(orchestrator.startPreview(projectId, projectInfo), 180000, 'startPreview');

        const elapsed = Date.now() - startTime;
        console.log(`✅ [Fly] Preview ready in ${elapsed}ms`);

        // Use Fly.io agent URL directly for preview (agent proxies to dev server on port 3000)
        // The agent handles: API routes (/health, /exec, etc.) + proxies all other routes to dev server
        const flyPreviewUrl = result.agentUrl;

        // Send final result
        console.log(`   [4/5] Ready!`);
        console.log(`   Preview URL: ${flyPreviewUrl}`);
        sendStep('ready', 'Preview pronta!', {
            success: true,
            previewUrl: flyPreviewUrl,
            coderToken: CODER_SESSION_TOKEN,
            agentUrl: result.agentUrl,
            machineId: result.machineId,
            projectType: projectInfo.description || projectInfo.type,
            hasWebUI: projectInfo.hasWebUI !== false, // Default true if not specified
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
 * POST /fly/error-report
 * Receive error reports from the app for debugging
 */
router.post('/error-report', asyncHandler(async (req, res) => {
    const {
        projectId,
        userId,
        errorMessage,
        errorStack,
        deviceInfo,
        logs,
        timestamp
    } = req.body;

    console.log(`\n🐛 ========== ERROR REPORT ==========`);
    console.log(`📅 Time: ${timestamp || new Date().toISOString()}`);
    console.log(`👤 User: ${userId || 'anonymous'}`);
    console.log(`📁 Project: ${projectId || 'unknown'}`);
    console.log(`❌ Error: ${errorMessage}`);
    if (errorStack) {
        console.log(`📚 Stack:\n${errorStack}`);
    }
    if (deviceInfo) {
        console.log(`📱 Device: ${JSON.stringify(deviceInfo)}`);
    }
    if (logs && logs.length > 0) {
        console.log(`📋 Recent Logs:`);
        logs.slice(-20).forEach((log, i) => {
            console.log(`   ${i + 1}. ${log}`);
        });
    }
    console.log(`🐛 ====================================\n`);

    // TODO: In production, send to a logging service (Sentry, LogRocket, etc.)
    // For now, we just log to console which will appear in Fly.io logs

    res.json({
        success: true,
        message: 'Error report received. Thank you for helping us improve!'
    });
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
 * POST /fly/heartbeat
 * 🔑 FIX 4: Keep VM alive while user has project open
 * Frontend sends this every 60 seconds to prevent VM timeout
 */
router.post('/heartbeat', asyncHandler(async (req, res) => {
    const { projectId } = req.body;

    if (!projectId) {
        return res.status(400).json({ error: 'projectId required' });
    }

    // Get active VMs and update lastUsed timestamp
    const activeVMs = await orchestrator.getActiveVMs();
    const vm = activeVMs.find(v => v.projectId === projectId);

    if (vm) {
        // Update lastUsed to keep VM alive
        vm.lastUsed = Date.now();
        console.log(`💓 [Heartbeat] ${projectId} - VM kept alive (${vm.machineId})`);
        res.json({ success: true, machineId: vm.machineId, status: 'alive' });
    } else {
        // VM not active - maybe stopped or never started
        console.log(`💔 [Heartbeat] ${projectId} - No active VM found`);
        res.json({ success: true, status: 'no_vm' });
    }
}));

/**
 * POST /fly/session
 * Set routing cookie for the Gateway
 * 🔑 FIX: Can auto-create VM if projectId is provided but machineId is not
 */
router.post('/session', asyncHandler(async (req, res) => {
    let { machineId, projectId } = req.body;

    // 🔑 AUTO-CREATE VM if machineId not provided but projectId is
    if (!machineId && projectId) {
        console.log(`🔄 [Fly] Session: No machineId, auto-creating VM for ${projectId}...`);
        try {
            const vmSession = await orchestrator.getOrCreateVM(projectId);
            if (vmSession && vmSession.machineId) {
                machineId = vmSession.machineId;
                console.log(`✅ [Fly] Session: VM auto-created: ${machineId}`);
            }
        } catch (vmError) {
            console.error(`❌ [Fly] Session: Auto-create VM failed:`, vmError.message);
            return res.status(503).json({
                error: 'VM_STARTING',
                message: 'Starting workspace, please retry in a few seconds',
                details: vmError.message
            });
        }
    }

    if (!machineId) {
        return res.status(400).json({ error: 'machineId or projectId required' });
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

    res.json({ success: true, message: 'Session set', machineId });
}));

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

/**
 * GET /fly/logs/:projectId
 * Stream live terminal output from VM via SSE proxy
 * 🔑 FIX: Auto-creates VM if not exists (Option A from VM_AUTO_CREATE_BUG.md)
 */
router.get('/logs/:projectId', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const since = req.query.since || '0';

    console.log(`📺 [Fly] Streaming logs for: ${projectId}`);

    // Get active VM for this project
    let activeVMs = await orchestrator.getActiveVMs();
    let vm = activeVMs.find(v => v.projectId === projectId);

    // 🔑 AUTO-CREATE VM if not exists
    if (!vm) {
        console.log(`🔄 [Fly] No active VM for ${projectId}, auto-creating...`);
        try {
            // Try to get or create VM
            const vmSession = await orchestrator.getOrCreateVM(projectId);
            if (vmSession && vmSession.machineId) {
                console.log(`✅ [Fly] VM auto-created: ${vmSession.machineId}`);
                vm = {
                    projectId,
                    agentUrl: vmSession.agentUrl,
                    machineId: vmSession.machineId
                };
            }
        } catch (vmError) {
            console.error(`❌ [Fly] Auto-create VM failed:`, vmError.message);
            return res.status(503).json({
                error: 'VM_STARTING',
                message: 'Starting workspace, please retry in a few seconds',
                details: vmError.message
            });
        }
    }

    // Final check - if still no VM, return 503 (not 404)
    if (!vm || !vm.agentUrl) {
        return res.status(503).json({
            error: 'VM_UNAVAILABLE',
            message: 'Workspace is not available. Please start the preview first.'
        });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Proxy the SSE stream from the agent
    // Use HTTPS for Fly.io URLs (they proxy to the agent internally)
    const https = require('https');
    const http = require('http');
    const agentUrl = new URL(vm.agentUrl);
    const isHttps = agentUrl.protocol === 'https:';
    const transport = isHttps ? https : http;

    const proxyReq = transport.request({
        hostname: agentUrl.hostname,
        port: isHttps ? 443 : (agentUrl.port || 13338),
        path: `/logs?since=${since}`,
        method: 'GET',
        headers: {
            'Accept': 'text/event-stream'
        }
    }, (proxyRes) => {
        console.log(`📺 [Fly] Connected to agent logs stream`);

        // Pipe the response
        proxyRes.on('data', (chunk) => {
            try {
                res.write(chunk);
                if (res.flush) res.flush();
            } catch (e) {
                // Client disconnected
            }
        });

        proxyRes.on('end', () => {
            console.log(`📺 [Fly] Agent logs stream ended`);
            res.end();
        });

        proxyRes.on('error', (err) => {
            console.error(`📺 [Fly] Proxy stream error:`, err.message);
            res.end();
        });
    });

    proxyReq.on('error', (err) => {
        console.error(`📺 [Fly] Failed to connect to agent:`, err.message);
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to connect to VM' })}\n\n`);
        res.end();
    });

    proxyReq.end();

    // Cleanup on client disconnect
    req.on('close', () => {
        console.log(`📺 [Fly] Client disconnected from logs`);
        proxyReq.destroy();
    });
}));

module.exports = router;
