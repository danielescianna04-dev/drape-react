/**
 * Workspace Routes
 * API endpoints for Docker container workspaces on Hetzner.
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
const containerService = require('../services/container-service');
const metricsService = require('../services/metrics-service');
const errorTracker = require('../services/error-tracking-service');
const redisService = require('../services/redis-service');
const { asyncHandler } = require('../middleware/errorHandler');
const { analyzeProjectWithAI, analyzeEnvVars } = require('../services/project-analyzer');

const withTimeout = async (promise, timeoutMs, label) => {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs)
    );
    return Promise.race([promise, timeout]);
};


/**
 * GET /fly/project/:id/env
 */
router.get('/project/:id/env', asyncHandler(async (req, res) => {
    const { id: projectId } = req.params;
    const result = await orchestrator.readFile(projectId, '.env');
    let variables = [];

    if (result.success && result.content) {
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
 */
router.post('/project/:id/env', asyncHandler(async (req, res) => {
    const { id: projectId } = req.params;
    const { variables } = req.body;

    if (!Array.isArray(variables)) {
        return res.status(400).json({ error: 'variables must be an array' });
    }

    const content = variables.map(v => `${v.key}=${v.value}`).join('\n');
    await orchestrator.writeFile(projectId, '.env', content);
    res.json({ success: true, message: 'Environment variables saved' });
}));

/**
 * POST /fly/project/:id/env/analyze
 */
router.post('/project/:id/env/analyze', asyncHandler(async (req, res) => {
    const { id: projectId } = req.params;
    console.log(`🧪 [API] Analyzing env vars for: ${projectId}`);

    const { files } = await orchestrator.listFiles(projectId);
    const fileNames = files.map(f => f.path);

    let configFiles = {};
    for (const configName of ['package.json', 'next.config.js', 'vite.config.js', 'docker-compose.yml', 'app.py', 'settings.py', 'config.js']) {
        try {
            const result = await orchestrator.readFile(projectId, configName);
            if (result.success) configFiles[configName] = result.content;
        } catch { }
    }

    const variables = await analyzeEnvVars(fileNames, configFiles);
    res.json({ success: true, variables });
}));

/**
 * POST /fly/project/create
 */
router.post('/project/create', asyncHandler(async (req, res) => {
    const { projectId, repositoryUrl, githubToken, userId } = req.body;
    const startTime = Date.now();

    console.log(`\n🚀 [API] Creating project: ${projectId}`);
    console.log(`   📦 Repository: ${repositoryUrl || '(none)'}`);

    if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
    }

    const vmPoolManager = require('../services/vm-pool-manager');
    vmPoolManager.trackProjectCreation(projectId);

    try {
        let filesCount = 0;
        let result = null;

        if (repositoryUrl) {
            result = await orchestrator.cloneRepository(projectId, repositoryUrl, githubToken);
            filesCount = result.filesCount;

            setImmediate(async () => {
                try {
                    console.log(`🚀 [Parallel] Starting proactive warming for ${projectId}...`);
                    await orchestrator.prewarmProjectServer(projectId);
                    console.log(`✅ [Parallel] Background warming completed for ${projectId}`);
                } catch (e) {
                    console.warn(`⚠️ [Parallel] Background warming failed: ${e.message}`);
                }
            });
        }

        const elapsed = Date.now() - startTime;
        console.log(`✅ [API] Project created in ${elapsed}ms`);

        if (userId && repositoryUrl) {
            const notificationService = require('../services/notification-service');
            const repoName = repositoryUrl.split('/').pop()?.replace('.git', '') || 'repository';
            notificationService.sendToUser(userId, {
                title: 'Progetto pronto!',
                body: `Il clone di ${repoName} e' completato.`,
                type: 'clone_complete',
            }, {
                projectId,
                action: 'open_project',
            }).catch(err => console.warn('[Notify] Clone notification failed:', err.message));
        }

        res.json({
            success: true,
            projectId,
            filesCount,
            files: (result && result.files) ? result.files.map(f => typeof f === 'string' ? f : f.path) : [],
            timing: { totalMs: elapsed }
        });
    } finally {
        vmPoolManager.removeProjectCreation(projectId);
    }
}));

/**
 * GET /fly/project/:id/files
 */
router.get('/project/:id/files', asyncHandler(async (req, res) => {
    const { id: projectId } = req.params;
    const { repositoryUrl, githubToken } = req.query;

    console.log(`📂 [API] Listing files for: ${projectId}`);

    let result = await orchestrator.listFiles(projectId);

    if ((!result.files || result.files.length === 0) && repositoryUrl) {
        console.log(`📦 [API] Project empty, attempting auto-clone from: ${repositoryUrl}`);

        const vmPoolManager = require('../services/vm-pool-manager');
        vmPoolManager.trackProjectCreation(projectId);

        try {
            const cloneResult = await orchestrator.cloneRepository(projectId, repositoryUrl, githubToken);
            if (cloneResult.success) {
                result = await orchestrator.listFiles(projectId);
            }
        } catch (cloneError) {
            console.error(`❌ [API] Auto-clone failed:`, cloneError.message);
            if (cloneError.statusCode === 401) throw cloneError;
        } finally {
            vmPoolManager.removeProjectCreation(projectId);
        }
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.removeHeader('ETag');
    res.removeHeader('Last-Modified');

    res.json({
        success: true,
        files: result.files || [],
        count: result.files?.length || 0,
        timestamp: Date.now()
    });
}));

/**
 * GET /fly/project/:id/file
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

    res.json({ success: true, path: filePath, content: result.content });
}));

/**
 * POST /fly/project/:id/file
 */
router.post('/project/:id/file', asyncHandler(async (req, res) => {
    const { id: projectId } = req.params;
    const { path: filePath, content } = req.body;

    if (!filePath) {
        return res.status(400).json({ error: 'path is required' });
    }

    await orchestrator.writeFile(projectId, filePath, content || '');
    res.json({ success: true, path: filePath, message: 'File saved' });
}));

/**
 * POST /fly/project/:id/exec
 */
router.post('/project/:id/exec', asyncHandler(async (req, res) => {
    const { id: projectId } = req.params;
    const { command, cwd } = req.body;

    if (!command) {
        return res.status(400).json({ error: 'command is required' });
    }

    console.log(`🔗 [API] Exec for ${projectId}: ${command.substring(0, 50)}...`);
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
 * Quick warmup - ensures container is running and files are synced
 */
router.post('/clone', asyncHandler(async (req, res) => {
    const { workstationId, repositoryUrl, githubToken } = req.body;
    const projectId = workstationId;

    console.log(`\n🔥 [API] Quick clone/warmup for: ${projectId}`);
    if (repositoryUrl) console.log(`   📎 Repo: ${repositoryUrl}`);

    if (!projectId) {
        return res.status(400).json({ error: 'workstationId is required' });
    }

    try {
        const existingSession = await redisService.getVMSession(projectId);
        if (existingSession && existingSession.lastUsed && (Date.now() - existingSession.lastUsed < 30000)) {
            console.log(`⚡ [Clone] Project already warmed ${Math.round((Date.now() - existingSession.lastUsed) / 1000)}s ago`);

            const projectInfo = existingSession.projectInfo || await orchestrator.detectProjectMetadata(projectId);
            return res.json({
                success: true,
                machineId: existingSession.machineId,
                projectInfo
            });
        }

        if (repositoryUrl) {
            await storageService.saveProjectMetadata(projectId, { repositoryUrl });
        }

        const result = await orchestrator.prewarmProjectServer(projectId);
        if (!result.success) throw new Error(result.error);

        console.log(`   ✅ Container warmed up: ${result.machineId}`);

        try {
            if (result.agentUrl) await orchestrator.ensureGitRepo(projectId, result.agentUrl, result.machineId);
            console.log(`   ✅ Git repo initialized`);
        } catch (e) {
            console.warn(`   ⚠️ ensureGitRepo failed: ${e.message}`);
        }

        const projectInfo = await orchestrator.detectProjectMetadata(projectId);

        res.json({
            success: true,
            machineId: result.machineId,
            projectInfo
        });
    } catch (error) {
        console.error(`❌ [API] Clone warmup failed:`, error.message);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ success: false, error: error.message });
    }
}));

/**
 * ALL /fly/preview/start
 * Start the preview/dev server for a project (SSE stream)
 */
router.all('/preview/start', asyncHandler(async (req, res) => {
    const projectId = req.body?.projectId || req.query?.projectId;
    const repositoryUrl = req.body?.repositoryUrl || req.query?.repositoryUrl;
    const startTime = Date.now();

    console.log(`\n🚀 [API] Starting preview for: ${projectId}`);

    if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
    }

    // Set cookie before SSE headers
    const existingSession = await redisService.getVMSession(projectId);
    if (existingSession && existingSession.machineId) {
        res.cookie('drape_vm_id', existingSession.machineId, {
            httpOnly: false,
            sameSite: 'Lax',
            path: '/'
        });
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.flushHeaders) res.flushHeaders();
    res.write(' '.repeat(2048) + '\n');
    if (res.flush) res.flush();

    const sendStep = (step, message, data = {}) => {
        const payload = JSON.stringify({ type: 'step', step, message, ...data });
        res.write(`data: ${payload}\n\n`);
        if (res.flush) res.flush();
    };

    const heartbeat = setInterval(() => {
        res.write(`: ping\n\n`);
        if (res.flush) res.flush();
    }, 5000);

    let projectInfo = null;

    try {
        // FAST PATH: Check if dev server already running
        if (existingSession && existingSession.machineId && existingSession.agentUrl) {
            try {
                console.log(`🔍 [API] Checking if dev server already running for ${projectId}...`);

                // Verify correct project
                const projectIdCheck = await containerService.exec(
                    existingSession.agentUrl,
                    'cat /home/coder/project/.drape-project-id 2>/dev/null || echo ""',
                    '/home/coder',
                    existingSession.machineId,
                    3000,
                    true
                );
                const vmProjectId = projectIdCheck.stdout?.trim() || '';

                if (vmProjectId !== projectId) {
                    throw new Error('Project mismatch - Fast Path not available');
                }

                // Check dev server via agent exec (curl localhost:3000 inside container)
                const devCheck = await containerService.exec(
                    existingSession.agentUrl,
                    'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000"',
                    '/home/coder',
                    existingSession.machineId,
                    5000,
                    true
                );
                const statusCode = parseInt(devCheck.stdout?.trim() || '000');

                if (statusCode >= 200 && statusCode < 400) {
                    console.log(`✅ [API] Dev server already running (${statusCode}) - FAST PATH`);

                    projectInfo = existingSession.projectInfo || await orchestrator.detectProjectMetadata(projectId);

                    const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
                    const host = req.headers.host;
                    const gatewayPreviewUrl = `${protocol}://${host}`;

                    sendStep('ready', 'Preview pronta!', {
                        previewUrl: gatewayPreviewUrl,
                        coderToken: existingSession.coderToken,
                        agentUrl: existingSession.agentUrl,
                        machineId: existingSession.machineId,
                        projectType: projectInfo?.description || projectInfo?.type || 'unknown',
                        hasWebUI: projectInfo?.hasWebUI !== false,
                        timing: { totalMs: 50 },
                        fastPath: true
                    });

                    console.log(`✅ [API] Preview reconnected in <100ms (Fast Path)`);
                    clearInterval(heartbeat);
                    res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
                    return res.end();
                }
            } catch (e) {
                console.log(`   ℹ️ [API] Dev server not responding (${e.message}) - using normal path`);
            }
        }

        console.log(`   [1/3] Analyzing project...`);
        sendStep('analyzing', 'Analisi del progetto...');

        projectInfo = await orchestrator.detectProjectMetadata(projectId);
        await orchestrator.patchConfigFiles(projectId, projectInfo);

        if (projectInfo.nextJsVersionWarning) {
            sendStep('warning', projectInfo.nextJsVersionWarning.recommendation || projectInfo.nextJsVersionWarning.message, {
                warningType: 'nextjs-version',
                warningData: projectInfo.nextJsVersionWarning
            });
        }

        console.log(`   [2/3] Starting container...`);
        sendStep('booting', 'Avvio del container...');

        const result = await withTimeout(
            orchestrator.startPreview(projectId, projectInfo, (step, message) => {
                sendStep(step, message);
            }),
            480000,
            'startPreview'
        );

        const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
        const host = req.headers.host;
        const gatewayPreviewUrl = `${protocol}://${host}`;

        const elapsed = Date.now() - startTime;
        console.log(`✅ [API] Preview ready in ${elapsed}ms (Gateway: ${gatewayPreviewUrl})`);

        metricsService.trackPreviewCreation({
            projectId,
            duration: elapsed,
            success: true,
            vmSource: result.vmSource || 'docker-pool',
            skipInstall: result.skipInstall || false,
            projectType: projectInfo.type,
            phases: result.phases || {}
        }).catch(e => console.warn(`Metrics error: ${e.message}`));

        sendStep('ready', 'Preview pronta!', {
            success: true,
            previewUrl: gatewayPreviewUrl,
            coderToken: CODER_SESSION_TOKEN,
            agentUrl: result.agentUrl,
            machineId: result.machineId,
            projectType: projectInfo.description || projectInfo.type,
            hasWebUI: projectInfo.hasWebUI !== false,
            timing: { totalMs: elapsed }
        });

    } catch (error) {
        console.error('❌ Preview start failed:', error);

        errorTracker.trackError({
            operation: 'preview_creation',
            error,
            projectId,
            severity: 'critical',
            context: { projectType: projectInfo?.type, repositoryUrl }
        }).catch(e => console.warn(`Error tracker failed: ${e.message}`));

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
        res.end();
    }
}));

/**
 * POST /fly/error-report
 */
router.post('/error-report', asyncHandler(async (req, res) => {
    const { projectId, userId, errorMessage, errorStack, deviceInfo, logs, timestamp } = req.body;

    console.log(`\n🐛 ========== ERROR REPORT ==========`);
    console.log(`📅 Time: ${timestamp || new Date().toISOString()}`);
    console.log(`👤 User: ${userId || 'anonymous'}`);
    console.log(`📁 Project: ${projectId || 'unknown'}`);
    console.log(`❌ Error: ${errorMessage}`);
    if (errorStack) console.log(`📚 Stack:\n${errorStack}`);
    if (deviceInfo) console.log(`📱 Device: ${JSON.stringify(deviceInfo)}`);
    if (logs && logs.length > 0) {
        console.log(`📋 Recent Logs:`);
        logs.slice(-20).forEach((log, i) => console.log(`   ${i + 1}. ${log}`));
    }
    console.log(`🐛 ====================================\n`);

    res.json({ success: true, message: 'Error report received.' });
}));

/**
 * POST /fly/preview/stop
 */
router.post('/preview/stop', asyncHandler(async (req, res) => {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    console.log(`⏹️ [API] Stopping preview for: ${projectId}`);
    const result = await orchestrator.stopVM(projectId);
    res.json(result);
}));

/**
 * POST /fly/release
 */
router.post('/release', asyncHandler(async (req, res) => {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    console.log(`🔄 [API] Releasing container for project: ${projectId}`);
    const result = await orchestrator.releaseProjectVM(projectId);
    res.json(result);
}));

/**
 * GET /fly/status
 */
router.get('/status', asyncHandler(async (req, res) => {
    const activeVMs = await orchestrator.getActiveVMs();
    const health = await containerService.healthCheck();

    res.json({
        backend: 'docker',
        status: health.healthy ? 'operational' : 'degraded',
        docker: health,
        activeContainers: activeVMs.length,
        containers: activeVMs.map(vm => ({
            projectId: vm.projectId,
            containerId: vm.vmId || vm.machineId,
            idleMinutes: Math.round(vm.idleTime / 60000)
        }))
    });
}));

/**
 * GET /fly/health
 */
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        backend: 'docker',
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /fly/vms
 */
router.get('/vms', asyncHandler(async (req, res) => {
    const vms = await orchestrator.getActiveVMs();
    res.json({ success: true, vms });
}));

/**
 * GET /fly/diagnostics
 */
router.get('/diagnostics', asyncHandler(async (req, res) => {
    const vmPoolManager = require('../services/vm-pool-manager');
    const metricsService = require('../services/metrics-service');
    const errorTracker = require('../services/error-tracking-service');

    const poolStats = vmPoolManager.getStats();
    const errorStats = errorTracker.getStats();
    const metrics = metricsService.getAggregatedMetrics ? await metricsService.getAggregatedMetrics(24 * 60 * 60 * 1000) : null;

    const containers = await containerService.listContainers();
    const runningContainers = containers.filter(c => c.state === 'running');

    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        backend: 'docker',
        containerPool: {
            ...poolStats,
            description: `${poolStats.workers?.availableRunning || 0} containers ready for instant allocation`
        },
        runningContainers: {
            total: runningContainers.length,
            containers: runningContainers.map(c => ({
                id: c.id?.substring(0, 12),
                name: c.name,
                state: c.state,
                project: c.labels?.['drape.project'],
                created: c.created_at
            }))
        },
        errors: errorStats,
        metrics: metrics || { message: 'No metrics available yet' }
    });
}));

/**
 * POST /fly/pool/recycle - Destroy all unallocated containers and recreate with current config
 */
router.post('/pool/recycle', asyncHandler(async (req, res) => {
    const vmPoolManager = require('../services/vm-pool-manager');
    const result = await vmPoolManager.recycleAll();
    res.json({ success: true, ...result });
}));

/**
 * POST /fly/heartbeat
 */
router.post('/heartbeat', asyncHandler(async (req, res) => {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId required' });

    const activeVMs = await orchestrator.getActiveVMs();
    const vm = activeVMs.find(v => v.projectId === projectId);
    if (vm) vm.lastUsed = Date.now();

    const session = await redisService.getVMSession(projectId);
    if (session) {
        session.lastUsed = Date.now();
        await redisService.saveVMSession(projectId, session);
        console.log(`💓 [Heartbeat] ${projectId} - container kept alive`);
        res.json({ success: true, machineId: session.machineId, status: 'alive' });
    } else if (vm) {
        console.log(`💓 [Heartbeat] ${projectId} - container alive (memory only)`);
        res.json({ success: true, machineId: vm.machineId, status: 'alive' });
    } else {
        console.log(`💔 [Heartbeat] ${projectId} - No active container`);
        res.json({ success: true, status: 'no_vm' });
    }
}));

/**
 * POST /fly/session
 */
router.post('/session', asyncHandler(async (req, res) => {
    let { machineId, projectId } = req.body;

    if (projectId) {
        const activeVMs = await orchestrator.getActiveVMs();
        const projectVM = activeVMs.find(v => v.projectId === projectId);

        if (projectVM) {
            const currentMachineId = projectVM.vmId || projectVM.machineId;
            if (machineId && machineId !== currentMachineId) {
                console.log(`🔄 [API] Session: stale machineId ${machineId}, current is ${currentMachineId}`);
            }
            machineId = currentMachineId;
        } else if (!machineId) {
            console.log(`🔄 [API] Session: No active container for ${projectId}, auto-creating...`);
            try {
                const vmSession = await orchestrator.getOrCreateVM(projectId, { skipSync: true });
                if (vmSession && vmSession.machineId) machineId = vmSession.machineId;
            } catch (vmError) {
                return res.status(503).json({
                    error: 'VM_STARTING',
                    message: 'Starting workspace, please retry in a few seconds',
                    details: vmError.message
                });
            }
        } else {
            console.log(`⚠️ [API] Session: machineId ${machineId} is stale, auto-creating...`);
            try {
                const vmSession = await orchestrator.getOrCreateVM(projectId, { skipSync: true });
                if (vmSession && vmSession.machineId) machineId = vmSession.machineId;
            } catch (vmError) {
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

    res.cookie('drape_vm_id', machineId, {
        httpOnly: false,
        sameSite: 'Lax',
        path: '/'
    });

    res.json({ success: true, message: 'Session set', machineId });
}));

/**
 * POST /fly/inspect
 */
router.post('/inspect', asyncHandler(async (req, res) => {
    const { description, userPrompt, elementInfo, projectId, selectedModel } = req.body;

    if (!projectId) return res.status(400).json({ error: 'projectId required' });

    console.log(`\n🔍 [API] AI Inspect: "${description?.substring(0, 50)}"`);
    const { streamInspectElementHolyGrail } = require('../services/ai-inspect-holygrail');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
        for await (const chunk of streamInspectElementHolyGrail({
            description, userPrompt, elementInfo, projectId, selectedModel
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
 */
router.post('/reload', asyncHandler(async (req, res) => {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId required' });

    console.log(`🔄 [API] Reloading project: ${projectId}`);
    const activeVMs = await orchestrator.getActiveVMs();
    const vm = activeVMs.find(v => v.projectId === projectId);

    if (vm) {
        const result = await storageService.syncToVM(projectId, vm.agentUrl);
        res.json({ success: true, message: 'Files synced to container', syncedCount: result.syncedCount });
    } else {
        res.json({ success: true, message: 'No active container - files will sync on next preview start' });
    }
}));

/**
 * GET /fly/logs/:projectId
 * Stream live terminal output via SSE proxy
 */
router.get('/logs/:projectId', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const since = req.query.since || '0';

    console.log(`📺 [API] Streaming logs for: ${projectId}`);

    let activeVMs = await orchestrator.getActiveVMs();
    let vm = activeVMs.find(v => v.projectId === projectId);

    if (!vm) {
        console.log(`🔄 [API] No active container for ${projectId}, auto-creating...`);
        try {
            const vmSession = await orchestrator.getOrCreateVM(projectId, { skipSync: true });
            if (vmSession && vmSession.machineId) {
                vm = { projectId, agentUrl: vmSession.agentUrl, machineId: vmSession.machineId };
            }
        } catch (vmError) {
            return res.status(503).json({
                error: 'VM_STARTING',
                message: 'Starting workspace, please retry in a few seconds'
            });
        }
    }

    if (!vm || !vm.agentUrl) {
        return res.status(503).json({
            error: 'VM_UNAVAILABLE',
            message: 'Workspace is not available. Please start the preview first.'
        });
    }

    const machineId = vm.machineId || vm.vmId;

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Proxy SSE stream from agent - direct HTTP (no Fly headers needed)
    const http = require('http');
    const agentUrl = new URL(vm.agentUrl);

    const proxyReq = http.request({
        hostname: agentUrl.hostname,
        port: agentUrl.port || 13338,
        path: `/logs?since=${since}`,
        method: 'GET',
        headers: { 'Accept': 'text/event-stream' }
    }, (proxyRes) => {
        console.log(`📺 [API] Connected to agent logs stream`);

        proxyRes.on('data', (chunk) => {
            try {
                if (!res.destroyed && !res.writableEnded) {
                    res.write(chunk);
                    if (res.flush) res.flush();
                }
            } catch (e) {}
        });

        proxyRes.on('end', () => {
            try { if (!res.destroyed && !res.writableEnded) res.end(); } catch (e) {}
        });

        proxyRes.on('error', (err) => {
            if (err.message !== 'aborted' && err.code !== 'ECONNRESET') {
                console.error(`📺 [API] Proxy stream error:`, err.message);
            }
            try { if (!res.destroyed && !res.writableEnded) res.end(); } catch (e) {}
        });
    });

    proxyReq.on('error', (err) => {
        if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
            console.error(`📺 [API] Failed to connect to agent:`, err.message);
        }
        try {
            if (!res.destroyed && !res.writableEnded) {
                res.write(`data: ${JSON.stringify({ type: 'error', message: 'Connection to container lost' })}\n\n`);
                res.end();
            }
        } catch (e) {}
    });

    res.on('error', (err) => {
        if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
            console.error(`📺 [API] Response error:`, err.message);
        }
        proxyReq.destroy();
    });

    proxyReq.end();

    req.on('close', () => {
        proxyReq.destroy();
    });
}));

module.exports = router;
