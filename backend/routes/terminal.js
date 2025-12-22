/**
 * Terminal Routes
 * Command execution with dev server support and health checks
 * 
 * IMPROVEMENTS over legacy:
 * - Cleaner async/await
 * - Better error handling
 * - Configurable health check
 * - Separated concerns
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');

const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody, schema, commonSchemas } = require('../middleware/validator');
const {
    cleanWorkspaceName,
    cleanProjectId,
    getRepoPath,
    isDevServerCommand,
    detectPreviewUrl,
    getLocalIP,
    execAsync,
    sleep
} = require('../utils/helpers');
const { FILE_LIMITS } = require('../utils/constants');
const { executeRemoteCommand } = require('../services/tool-executor');

const LOCAL_IP = getLocalIP();

/**
 * Health check configuration by project type
 */
const HEALTH_CHECK_CONFIG = {
    expo: { attempts: 45, delay: 1000, timeout: 5000 },
    react: { attempts: 45, delay: 1000, timeout: 5000 },
    nextjs: { attempts: 30, delay: 1000, timeout: 5000 },
    vite: { attempts: 20, delay: 500, timeout: 3000 },
    default: { attempts: 15, delay: 1000, timeout: 5000 }
};

/**
 * Detect project type from command
 */
function detectProjectTypeFromCommand(command) {
    if (command.includes('expo')) return 'expo';
    if (command.includes('react-scripts') || command.includes('create-react-app')) return 'react';
    if (command.includes('next')) return 'nextjs';
    if (command.includes('vite')) return 'vite';
    return 'default';
}

/**
 * Perform health check on URL with retries
 */
async function healthCheckUrl(url, config = HEALTH_CHECK_CONFIG.default) {
    const { attempts, delay, timeout } = config;

    console.log(`🔍 Health check: ${url} (${attempts} attempts, ${delay}ms delay)`);

    for (let i = 0; i < attempts; i++) {
        try {
            const response = await axios.get(url, {
                timeout,
                validateStatus: () => true // Accept any status
            });

            if (response.status < 500) {
                console.log(`✅ Health check passed (attempt ${i + 1}): status ${response.status}`);
                return { healthy: true, status: response.status, attempt: i + 1 };
            }
        } catch (error) {
            // Connection refused is expected while server starts
            if (!error.message.includes('ECONNREFUSED')) {
                console.log(`⚠️ Health check attempt ${i + 1}: ${error.message}`);
            }
        }

        if (i < attempts - 1) {
            await sleep(delay);
        }
    }

    console.log(`❌ Health check failed after ${attempts} attempts`);
    return { healthy: false, attempts };
}

/**
 * Convert localhost URL to network-accessible URL
 */
function convertToPublicUrl(url, workstationId) {
    if (!url) return null;

    // Already public
    if (url.includes(LOCAL_IP) || url.includes('.ngrok.') || url.includes('.exp.direct')) {
        return url;
    }

    // Convert localhost/127.0.0.1 to local IP
    return url
        .replace('localhost', LOCAL_IP)
        .replace('127.0.0.1', LOCAL_IP)
        .replace('0.0.0.0', LOCAL_IP);
}

/**
 * POST /terminal/execute
 * Execute command in project directory
 */
router.post('/execute',
    validateBody({
        command: commonSchemas.command()
    }),
    asyncHandler(async (req, res) => {
        const { command, workstationId, projectId } = req.body;

        const effectiveProjectId = projectId || workstationId;
        const isCloud = effectiveProjectId && !effectiveProjectId.startsWith('local');

        console.log(`\n💻 Terminal Execute`);
        console.log(`   Command: ${command}`);
        console.log(`   Project: ${effectiveProjectId || 'local'}`);
        console.log(`   Mode: ${isCloud ? 'Cloud' : 'Local'}`);

        let output;
        let previewUrl = null;
        let serverReady = false;
        let healthCheckResult = null;

        const isDevServer = isDevServerCommand(command);

        if (isCloud) {
            // Cloud execution via Coder SSH
            const wsName = cleanWorkspaceName(effectiveProjectId);
            let remoteCommand = command;

            // For dev servers, run in background
            if (isDevServer) {
                // Ensure host binding for network access
                let enhancedCmd = command;
                if (!command.includes('--host') && !command.includes('HOST=')) {
                    if (command.includes('vite') || command.includes('npm run dev')) {
                        enhancedCmd = `${command} -- --host 0.0.0.0`;
                    } else if (command.includes('next')) {
                        enhancedCmd = `HOST=0.0.0.0 ${command}`;
                    }
                }

                remoteCommand = `cd /home/coder/project && nohup ${enhancedCmd} > /tmp/server.log 2>&1 & echo $!`;
                console.log(`   Running in background: ${remoteCommand}`);
            } else {
                remoteCommand = `cd /home/coder/project && ${command}`;
            }

            output = await executeRemoteCommand(wsName, remoteCommand, {
                timeout: isDevServer ? 10000 : FILE_LIMITS.COMMAND_TIMEOUT
            });

            // Detect preview URL from output or use default port
            if (isDevServer && output.exitCode === 0) {
                // Wait a bit for server to start
                await sleep(2000);

                // Try to get server log
                const logResult = await executeRemoteCommand(wsName, 'cat /tmp/server.log 2>/dev/null | tail -50');
                const fullOutput = output.stdout + '\n' + (logResult.stdout || '');

                previewUrl = detectPreviewUrl(fullOutput, command);

                if (!previewUrl) {
                    // Use default port based on project type
                    const projectType = detectProjectTypeFromCommand(command);
                    const defaultPorts = {
                        expo: 8081,
                        react: 3000,
                        nextjs: 3000,
                        vite: 5173,
                        default: 3000
                    };
                    previewUrl = `http://localhost:${defaultPorts[projectType]}`;
                }

                // Convert to cloud URL
                const PORT = process.env.PORT || 3000;
                const coderUser = 'admin';
                const previewPort = previewUrl.match(/:(\d+)/)?.[1] || '3000';
                previewUrl = `http://${LOCAL_IP}:${PORT}/@${coderUser}/${wsName}/apps/dev/`;

                console.log(`   Preview URL: ${previewUrl}`);
            }
        } else {
            // Local execution
            const projectPath = effectiveProjectId ? getRepoPath(cleanProjectId(effectiveProjectId)) : process.cwd();

            let execCommand = command;

            // Add HOST env for dev servers
            if (isDevServer && !command.includes('HOST=')) {
                execCommand = `HOST=0.0.0.0 ${command}`;
            }

            try {
                if (isDevServer) {
                    // Run in background for dev servers
                    const bgCommand = `cd "${projectPath}" && nohup ${execCommand} > /tmp/server_${Date.now()}.log 2>&1 & echo $!`;
                    const { stdout, stderr } = await execAsync(bgCommand, {
                        timeout: 10000,
                        maxBuffer: 5 * 1024 * 1024
                    });
                    output = { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
                } else {
                    const { stdout, stderr } = await execAsync(`cd "${projectPath}" && ${execCommand}`, {
                        timeout: FILE_LIMITS.COMMAND_TIMEOUT,
                        maxBuffer: 10 * 1024 * 1024
                    });
                    output = { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
                }
            } catch (error) {
                output = {
                    stdout: error.stdout?.toString().trim() || '',
                    stderr: error.stderr?.toString().trim() || error.message,
                    exitCode: error.code || 1
                };
            }

            // Detect and verify preview URL for dev servers
            if (isDevServer && output.exitCode === 0) {
                await sleep(2000);

                previewUrl = detectPreviewUrl(output.stdout + output.stderr, command);

                if (!previewUrl) {
                    const projectType = detectProjectTypeFromCommand(command);
                    const defaultPorts = {
                        expo: 8081,
                        react: 3000,
                        nextjs: 3000,
                        vite: 5173,
                        default: 3000
                    };
                    previewUrl = `http://${LOCAL_IP}:${defaultPorts[projectType]}`;
                }

                // Health check
                const projectType = detectProjectTypeFromCommand(command);
                const config = HEALTH_CHECK_CONFIG[projectType] || HEALTH_CHECK_CONFIG.default;

                const checkUrl = convertToPublicUrl(previewUrl, effectiveProjectId);
                healthCheckResult = await healthCheckUrl(checkUrl, config);
                serverReady = healthCheckResult.healthy;

                if (serverReady) {
                    previewUrl = checkUrl;
                    console.log(`✅ Server verified: ${previewUrl}`);
                }
            }
        }

        res.json({
            output: output.stdout,
            error: output.stderr,
            exitCode: output.exitCode,
            workstationId: effectiveProjectId || 'local',
            command,
            previewUrl,
            serverReady,
            healthCheck: healthCheckResult
        });
    })
);

/**
 * POST /terminal/kill
 * Kill a running process
 */
router.post('/kill', asyncHandler(async (req, res) => {
    const { pid, workstationId } = req.body;

    if (!pid) {
        return res.status(400).json({ error: 'pid is required' });
    }

    console.log(`🛑 Killing process: ${pid}`);

    if (workstationId) {
        const wsName = cleanWorkspaceName(workstationId);
        await executeRemoteCommand(wsName, `kill -9 ${pid} 2>/dev/null || true`);
    } else {
        await execAsync(`kill -9 ${pid} 2>/dev/null || true`);
    }

    res.json({ success: true, killed: pid });
}));

/**
 * GET /terminal/logs/:workstationId
 * Stream server logs via SSE
 */
router.get('/logs/:workstationId', asyncHandler(async (req, res) => {
    const { workstationId } = req.params;
    const wsName = cleanWorkspaceName(workstationId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    // Poll for new log content
    let lastSize = 0;
    const interval = setInterval(async () => {
        try {
            const result = await executeRemoteCommand(wsName, 'wc -c < /tmp/server.log 2>/dev/null || echo 0');
            const currentSize = parseInt(result.stdout) || 0;

            if (currentSize > lastSize) {
                const tailResult = await executeRemoteCommand(wsName, `tail -c +${lastSize + 1} /tmp/server.log 2>/dev/null`);
                if (tailResult.stdout) {
                    res.write(`data: ${JSON.stringify({ type: 'log', content: tailResult.stdout })}\n\n`);
                }
                lastSize = currentSize;
            }
        } catch (error) {
            // Log file might not exist yet
        }
    }, 1000);

    req.on('close', () => {
        clearInterval(interval);
        console.log(`📺 Log stream closed: ${workstationId}`);
    });
}));

module.exports = router;
