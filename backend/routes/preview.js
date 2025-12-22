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

// Server logs storage for SSE
const serverLogsMap = new Map();

/**
 * POST /preview/start
 * Start project preview
 */
router.post('/start', asyncHandler(async (req, res) => {
    const startTime = Date.now();
    let { workstationId, forceRefresh, githubToken, repositoryUrl } = req.body;

    console.log(`\n🚀 Preview Start: ${workstationId}`);

    if (!workstationId) {
        return res.status(400).json({ error: 'workstationId is required' });
    }

    // Clean workspace name
    const wsName = cleanWorkspaceName(workstationId);

    // Ensure Coder user exists
    const coderUser = await coderService.ensureUser('daniele.scianna04@gmail.com', 'admin');

    // Create or get workspace
    console.log(`   Creating/getting workspace: ${wsName}`);
    const workspace = await coderService.createWorkspace(coderUser.id, wsName, repositoryUrl);
    console.log(`   Workspace ID: ${workspace.id}`);

    // Start if stopped
    if (workspace.latest_build?.job?.status !== 'running') {
        console.log('   Starting workspace...');
        await coderService.startWorkspace(workspace.id);
    }

    // Get local IP for URLs
    const { getLocalIP } = require('../utils/helpers');
    const LOCAL_IP = getLocalIP();
    const PORT = process.env.PORT || 3000;

    // Build URLs
    const apiBase = `http://${LOCAL_IP}:${PORT}`;
    const wildcardDomain = CODER_WILDCARD_DOMAIN;

    const vscodeUrl = `${apiBase}/@${coderUser.username}/${wsName}/apps/vscode/?folder=/home/coder`;
    const previewUrl = `${apiBase}/@${coderUser.username}/${wsName}/apps/preview/`;
    const devUrl = `${apiBase}/@${coderUser.username}/${wsName}/apps/dev/`;

    // Try to detect project type
    let projectInfo = { type: 'unknown', defaultPort: 3000 };

    // Clone repo if needed and detect project
    if (repositoryUrl) {
        try {
            await runInWorkspace(wsName, `test -d /home/coder/project/.git || git clone ${repositoryUrl} /home/coder/project`);

            // Get package.json
            const pkgResult = await runInWorkspace(wsName, 'cat /home/coder/project/package.json 2>/dev/null');
            if (pkgResult.stdout) {
                try {
                    const packageJson = JSON.parse(pkgResult.stdout);
                    const lsResult = await runInWorkspace(wsName, 'ls -1 /home/coder/project');
                    const files = lsResult.stdout.split('\n').filter(f => f.trim());

                    const detected = detectProjectType(files, packageJson);
                    if (detected) {
                        projectInfo = detected;
                        console.log(`   Detected: ${detected.description}`);
                    }
                } catch (e) {
                    console.log('   Could not parse package.json');
                }
            }
        } catch (e) {
            console.log('   Clone/detect warning:', e.message);
        }
    }

    const isStatic = projectInfo.type === 'static';

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
        isCloudWorkstation: true
    });
}));

/**
 * Run command in workspace helper
 */
async function runInWorkspace(wsName, command) {
    const CODER_CLI_PATH = process.env.CODER_CLI_PATH || 'coder';
    const escapedCmd = command.replace(/'/g, "'\\''");
    const sshCmd = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -o ProxyCommand="${CODER_CLI_PATH} ssh --stdio ${wsName}" coder.${wsName} '${escapedCmd}'`;

    try {
        const { stdout, stderr } = await execAsync(sshCmd, {
            env: { ...process.env },
            timeout: 30000,
            maxBuffer: 10 * 1024 * 1024
        });
        return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
    } catch (error) {
        return {
            stdout: error.stdout?.toString().trim() || '',
            stderr: error.stderr?.toString().trim() || error.message,
            exitCode: error.code || 1
        };
    }
}

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
        selectedModel
    } = req.body;

    const effectiveProjectId = projectId || workstationId;

    if (!effectiveProjectId) {
        return res.status(400).json({ error: 'projectId or workstationId required' });
    }

    console.log(`\n🔍 Inspect: "${description?.substring(0, 50)}"`);

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

module.exports = router;

