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
    // Extract user info from request, fallback to defaults
    const { workstationId, forceRefresh, githubToken, repositoryUrl, userEmail, username } = req.body;

    console.log(`\n🚀 Preview Start: ${workstationId}`);

    // User Identity Logic
    const targetEmail = userEmail || 'daniele.scianna04@gmail.com';
    // Generate valid username from email if not provided
    const targetUsername = username || targetEmail.split('@')[0].replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();

    if (!workstationId) {
        return res.status(400).json({ error: 'workstationId is required' });
    }

    // Clean workspace name
    const wsName = cleanWorkspaceName(workstationId);

    // Ensure Coder user exists (Multi-User Support)
    console.log(`   User: ${targetEmail} (${targetUsername})`);
    const coderUser = await coderService.ensureUser(targetEmail, targetUsername);

    // Create or get workspace FOR THIS USER
    console.log(`   Creating/getting workspace: ${wsName} for user ${coderUser.username}`);
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

    // Build URLs with CORRECT USERNAME
    const apiBase = `http://${LOCAL_IP}:${PORT}`;
    const wildcardDomain = CODER_WILDCARD_DOMAIN;

    // Use the actual username from Coder (might differ if sanitized)
    const wsOwner = coderUser.username;

    const vscodeUrl = `${CODER_API_URL}/@${wsOwner}/${wsName}/apps/vscode/?folder=/home/coder`;
    const previewUrl = `${CODER_API_URL}/@${wsOwner}/${wsName}/apps/preview/`;
    const devUrl = `${CODER_API_URL}/@${wsOwner}/${wsName}/apps/dev/`;

    // Try to detect project type
    let projectInfo = { type: 'unknown', defaultPort: 3000 };

    // Clone repo if needed
    if (repositoryUrl) {
        try {
            await runInWorkspace(wsName, `test -d /home/coder/project/.git || git clone ${repositoryUrl} /home/coder/project`);
        } catch (e) {
            console.log('   Clone warning:', e.message);
        }
    }

    // LIST FILES RECURSIVELY (Depth 2) to give context
    let files = [];
    let configFilesContent = {};
    try {
        const lsResult = await runInWorkspace(wsName, 'find /home/coder/project -maxdepth 2 -not -path "*/.*" -not -path "*/node_modules/*"');
        if (lsResult.stdout) {
            files = lsResult.stdout.split('\n')
                .map(f => f.replace('/home/coder/project/', ''))
                .filter(f => f.trim() && f !== '/home/coder/project');
        }

        // Read key config files for AI
        const configFiles = ['package.json', 'requirements.txt', 'go.mod', 'Cargo.toml', 'pom.xml', 'compose.yml', 'Dockerfile', 'app.json'];
        for (const file of configFiles) {
            if (files.includes(file) || files.some(f => f.endsWith(file))) {
                const content = await runInWorkspace(wsName, `cat /home/coder/project/${file} 2>/dev/null | head -n 50`);
                if (content.stdout) {
                    configFilesContent[file] = content.stdout;
                }
            }
        }

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

module.exports = router;

