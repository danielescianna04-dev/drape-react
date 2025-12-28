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

const orchestrator = require('../services/workspace-orchestrator');
const storageService = require('../services/storage-service');
const flyService = require('../services/fly-service');
const { asyncHandler } = require('../middleware/errorHandler');
const { analyzeProjectWithAI } = require('../services/project-analyzer');

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

    // Clone repository if provided
    if (repositoryUrl) {
        const result = await orchestrator.cloneRepository(projectId, repositoryUrl, githubToken);
        filesCount = result.filesCount;
    }

    const elapsed = Date.now() - startTime;
    console.log(`✅ [Fly] Project created in ${elapsed}ms`);

    res.json({
        success: true,
        projectId,
        filesCount,
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

    // Clone repo if needed
    if (repositoryUrl) {
        const filesList = await orchestrator.listFiles(projectId);
        if (!filesList.files || filesList.files.length === 0) {
            console.log(`   📥 Cloning repository first...`);
            await orchestrator.cloneRepository(projectId, repositoryUrl, githubToken);
        }
    }

    // Get file list for project detection
    const { files } = await orchestrator.listFiles(projectId);
    const fileNames = files.map(f => f.path);

    // Read config files for detection
    let configFiles = {};
    for (const configName of ['package.json', 'requirements.txt', 'go.mod']) {
        try {
            const result = await orchestrator.readFile(projectId, configName);
            if (result.success) {
                configFiles[configName] = result.content;
            }
        } catch { }
    }

    // Detect project type with AI
    let projectInfo = { type: 'static', startCommand: 'python3 -m http.server 3000 --bind 0.0.0.0' };
    try {
        const detected = await analyzeProjectWithAI(fileNames, configFiles);
        if (detected) {
            projectInfo = detected;
            console.log(`🧠 [Fly] Detected: ${projectInfo.description}`);
        }
    } catch (e) {
        console.log(`   Detection failed, using static fallback`);
    }

    // Start the preview
    const result = await orchestrator.startPreview(projectId, projectInfo);

    const elapsed = Date.now() - startTime;
    console.log(`✅ [Fly] Preview ready in ${elapsed}ms`);

    // Use local backend as proxy for preview (enables proper cookie-based routing)
    const { getLocalIP } = require('../utils/helpers');
    const LOCAL_IP = getLocalIP();
    const PORT = process.env.PORT || 3000;
    const localPreviewUrl = `http://${LOCAL_IP}:${PORT}/`;

    res.json({
        success: true,
        previewUrl: localPreviewUrl, // Use local proxy URL
        agentUrl: result.agentUrl,
        machineId: result.machineId,
        projectType: projectInfo.description || projectInfo.type,
        timing: { totalMs: elapsed },
        architecture: 'holy-grail'
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
