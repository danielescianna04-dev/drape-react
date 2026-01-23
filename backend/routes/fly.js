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
const metricsService = require('../services/metrics-service');
const errorTracker = require('../services/error-tracking-service');
const { asyncHandler } = require('../middleware/errorHandler');
const { analyzeProjectWithAI, analyzeEnvVars } = require('../services/project-analyzer');

// Helper for robust timeouts
const withTimeout = async (promise, timeoutMs, label) => {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs)
    );
    return Promise.race([promise, timeout]);
};


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

    // Disable caching to ensure fresh file list
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.removeHeader('ETag');
    res.removeHeader('Last-Modified');

    res.json({
        success: true,
        files: result.files || [],
        count: result.files?.length || 0,
        timestamp: Date.now() // Force different response each time
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

        // Proactive Warming: Get/Create VM + Install deps in background
        const result = await orchestrator.prewarmProjectServer(projectId);

        if (!result.success) {
            throw new Error(result.error);
        }

        console.log(`   ✅ VM warmed up: ${result.machineId}`);

        res.json({
            success: true,
            machineId: result.machineId
        });

    } catch (error) {
        console.error(`❌ [Fly] Clone warmup failed:`, error.message);
        // Use error's statusCode if available (e.g., 503 for POOL_EXHAUSTED)
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ success: false, error: error.message });
    }
}));

/**
 * ALL /fly/preview/start
 * Start the preview/dev server for a project
 * Supports both POST (JSON) and GET (SSE)
 */
router.all('/preview/start', asyncHandler(async (req, res) => {
    // Support both body (POST) and query (GET) for projectId
    const projectId = req.body?.projectId || req.query?.projectId;
    const repositoryUrl = req.body?.repositoryUrl || req.query?.repositoryUrl;
    const githubToken = req.body?.githubToken || req.query?.githubToken;
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

    // Declare projectInfo outside try block so it's accessible in catch
    let projectInfo = null;

    try {
        console.log(`   [1/3] Analyzing project...`);
        sendStep('analyzing', 'Analisi del progetto...');

        // Detect project type (fast since it's cached in memory/Redis)
        projectInfo = await orchestrator.detectProjectMetadata(projectId);

        // Ensure config patching is done (sanity check)
        await orchestrator.patchConfigFiles(projectId, projectInfo);

        // Send Next.js version warning if detected
        if (projectInfo.nextJsVersionWarning) {
            sendStep('warning', JSON.stringify({
                type: 'nextjs-version',
                ...projectInfo.nextJsVersionWarning
            }));
        }

        console.log(`   [2/3] Booting MicroVM...`);
        sendStep('booting', 'Avvio della MicroVM su Fly.io...');


        // Start the preview with progress callback
        // Timeout: 8 minutes total (sufficient for heavy installs + dev server start)
        // Breakdown:
        // - VM allocation: ~1s
        // - File sync: ~1s
        // - npm install (first time): ~3min
        // - npm install (cached): ~5-10s
        // - Dev server start: ~2-10s
        // - Health check: up to 3min
        // - Buffer: 2min
        const result = await withTimeout(
            orchestrator.startPreview(projectId, projectInfo, (step, message) => {
                // Forward progress updates from orchestrator to SSE stream
                sendStep(step, message);
            }),
            480000, // 8 minutes
            'startPreview'
        );

        // Use the Gateway URL (this server) for preview routing.
        // This ensures all sub-resources (JS, CSS, WS) go through our proxy
        // where we can inject the routing headers and handle WebSockets.
        const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
        const host = req.headers.host;
        const gatewayPreviewUrl = `${protocol}://${host}`;

        const elapsed = Date.now() - startTime;
        console.log(`✅ [Fly] Preview ready in ${elapsed}ms (Routed via Gateway: ${gatewayPreviewUrl})`);

        // Track metrics (Phase 3.1)

        metricsService.trackPreviewCreation({
            projectId,
            duration: elapsed,
            success: true,
            vmSource: result.vmSource || 'unknown',
            skipInstall: result.skipInstall || false,
            projectType: projectInfo.type,
            phases: result.phases || {}
        }).catch(e => console.warn(`Metrics error: ${e.message}`));

        // Send final result
        console.log(`   [4/5] Ready!`);
        console.log(`   Preview URL: ${gatewayPreviewUrl}`);
        console.log(`   🔑 machineId: ${result.machineId} (client must call /session to set cookie)`);
        sendStep('ready', 'Preview pronta!', {
            success: true,
            previewUrl: gatewayPreviewUrl,
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

        // Track error (Phase 3.2)
        errorTracker.trackError({
            operation: 'preview_creation',
            error,
            projectId,
            severity: 'critical',
            context: {
                projectType: projectInfo?.type,
                repositoryUrl
            }
        }).catch(e => console.warn(`Error tracker failed: ${e.message}`));

        // Track metrics (Phase 3.1)
        const elapsed = Date.now() - startTime;
        metricsService.trackPreviewCreation({
            projectId,
            duration: elapsed,
            success: false,
            vmSource: 'unknown',
            skipInstall: false,
            projectType: projectInfo?.type || 'unknown',
            error: error.message
        }).catch(e => console.warn(`Metrics error: ${e.message}`));

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
 * POST /fly/release
 * Release a project's VM back to the pool (for project switching)
 * Lighter than /preview/stop - releases VM but keeps it in pool for reuse
 */
router.post('/release', asyncHandler(async (req, res) => {
    const { projectId } = req.body;

    if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
    }

    console.log(`🔄 [Fly] Releasing VM for project: ${projectId}`);

    const result = await orchestrator.releaseProjectVM(projectId);

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
 * GET /fly/vms
 * List all active VMs for debugging
 */
router.get('/vms', asyncHandler(async (req, res) => {
    const vms = await orchestrator.getActiveVMs();
    res.json({ success: true, vms });
}));

/**
 * GET /fly/diagnostics
 * System diagnostics and monitoring
 */
router.get('/diagnostics', asyncHandler(async (req, res) => {
    const vmPoolManager = require('../services/vm-pool-manager');
    const metricsService = require('../services/metrics-service');
    const errorTracker = require('../services/error-tracking-service');

    // Get VM pool stats
    const poolStats = vmPoolManager.getStats();

    // Get error stats
    const errorStats = errorTracker.getStats();

    // Get aggregated metrics (last 24 hours)
    const metrics = await metricsService.getAggregatedMetrics(24 * 60 * 60 * 1000);

    // Get running VMs from Fly
    const machines = await flyService.listMachines();
    const runningMachines = machines.filter(m => m.state === 'started');

    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        vmPool: {
            ...poolStats,
            description: `${poolStats.available} VMs ready for instant allocation`
        },
        runningVMs: {
            total: runningMachines.length,
            machines: runningMachines.map(m => ({
                id: m.id,
                name: m.name,
                state: m.state,
                region: m.region,
                created: m.created_at
            }))
        },
        errors: errorStats,
        metrics: metrics || { message: 'No metrics available yet' }
    });
}));

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
 * 🔑 FIX: Validates machineId is still active, returns current machineId for project
 */
router.post('/session', asyncHandler(async (req, res) => {
    let { machineId, projectId } = req.body;

    // 🔑 FIX: If projectId provided, ALWAYS get/verify the current VM for that project
    // This handles cases where the frontend has a stale machineId
    if (projectId) {
        const activeVMs = await orchestrator.getActiveVMs();
        const projectVM = activeVMs.find(v => v.projectId === projectId);

        if (projectVM) {
            // Project has an active VM
            const currentMachineId = projectVM.vmId || projectVM.machineId;

            // Check if frontend's machineId is stale
            if (machineId && machineId !== currentMachineId) {
                console.log(`🔄 [Fly] Session: Frontend has stale machineId ${machineId}, current is ${currentMachineId}`);
            }

            machineId = currentMachineId;
            console.log(`✅ [Fly] Session: Using active VM for ${projectId}: ${machineId}`);
        } else if (!machineId) {
            // No active VM and no machineId provided - auto-create
            console.log(`🔄 [Fly] Session: No active VM for ${projectId}, auto-creating...`);
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
        } else {
            // Frontend provided machineId but no active VM found - it's stale
            console.log(`⚠️ [Fly] Session: machineId ${machineId} is stale (VM destroyed), auto-creating...`);
            try {
                const vmSession = await orchestrator.getOrCreateVM(projectId);
                if (vmSession && vmSession.machineId) {
                    machineId = vmSession.machineId;
                    console.log(`✅ [Fly] Session: New VM created: ${machineId}`);
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
        httpOnly: false,
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

    // 🔑 FIX: Get machineId from vm (could be vmId or machineId depending on source)
    const machineId = vm.machineId || vm.vmId;
    if (!machineId) {
        console.error(`❌ [Fly] No machineId for project ${projectId}:`, JSON.stringify(vm));
        return res.status(503).json({
            error: 'VM_NOT_READY',
            message: 'VM is starting, machineId not available yet. Please retry.'
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
            'Accept': 'text/event-stream',
            'Fly-Force-Instance-Id': machineId
        }
    }, (proxyRes) => {
        console.log(`📺 [Fly] Connected to agent logs stream`);

        // Pipe the response
        proxyRes.on('data', (chunk) => {
            try {
                if (!res.destroyed && !res.writableEnded) {
                    res.write(chunk);
                    if (res.flush) res.flush();
                }
            } catch (e) {
                // Client disconnected, ignore
            }
        });

        proxyRes.on('end', () => {
            console.log(`📺 [Fly] Agent logs stream ended`);
            try {
                if (!res.destroyed && !res.writableEnded) res.end();
            } catch (e) { /* ignore */ }
        });

        proxyRes.on('error', (err) => {
            console.error(`📺 [Fly] Proxy stream error:`, err.message);
            try {
                if (!res.destroyed && !res.writableEnded) res.end();
            } catch (e) { /* ignore */ }
        });
    });

    proxyReq.on('error', (err) => {
        // 🔑 FIX: Handle ECONNRESET and other socket errors gracefully
        if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
            console.log(`📺 [Fly] Connection reset (client disconnected): ${err.code}`);
        } else {
            console.error(`📺 [Fly] Failed to connect to agent:`, err.message);
        }
        try {
            if (!res.destroyed && !res.writableEnded) {
                res.write(`data: ${JSON.stringify({ type: 'error', message: 'Connection to VM lost' })}\n\n`);
                res.end();
            }
        } catch (e) { /* ignore */ }
    });

    // 🔑 FIX: Handle socket errors on response to prevent crash
    res.on('error', (err) => {
        if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
            console.log(`📺 [Fly] Client socket error (normal): ${err.code}`);
        } else {
            console.error(`📺 [Fly] Response error:`, err.message);
        }
        proxyReq.destroy();
    });

    proxyReq.end();

    // Cleanup on client disconnect
    req.on('close', () => {
        console.log(`📺 [Fly] Client disconnected from logs`);
        proxyReq.destroy();
    });
}));

module.exports = router;
