/**
 * Drape Agent - Fly.io Edition
 * Runs inside MicroVM to handle file operations, command execution, and terminal
 * 
 * Endpoints:
 * - GET  /health       - Health check
 * - POST /exec         - Execute command
 * - GET  /files        - List files
 * - GET  /file         - Read file content
 * - POST /file         - Write file content
 * - POST /terminal     - Interactive terminal (WebSocket upgrade)
 */

const http = require('http');
const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const PORT = process.env.DRAPE_AGENT_PORT || 13338;
const PROJECT_DIR = '/home/coder/project';

console.log('🚀 Drape Agent v2.3 - With Bulk Extract Support');

// ============ LIVE LOGS STREAMING ============
// Circular buffer for log lines (keeps last 1000 lines)
const LOG_BUFFER_SIZE = 1000;
const logBuffer = [];
let logSequence = 0;
const logSubscribers = new Set(); // SSE clients

// Add line to log buffer and notify subscribers
function appendLog(line, stream = 'stdout') {
    const entry = {
        id: ++logSequence,
        timestamp: Date.now(),
        stream, // 'stdout' | 'stderr' | 'system'
        text: line
    };

    logBuffer.push(entry);
    if (logBuffer.length > LOG_BUFFER_SIZE) {
        logBuffer.shift();
    }

    // Notify all SSE subscribers
    const data = JSON.stringify(entry);
    for (const subscriber of logSubscribers) {
        try {
            subscriber.write(`data: ${data}\n\n`);
        } catch (e) {
            logSubscribers.delete(subscriber);
        }
    }
}

// Reference to running dev server process
let devServerProcess = null;

// Simple JSON body parser
async function parseBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(JSON.parse(body || '{}'));
            } catch {
                resolve({});
            }
        });
    });
}

// Send JSON response
function sendJson(req, res, data, status = 200) {
    const origin = req.headers.origin || '*';
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Credentials': 'true'
    });
    res.end(JSON.stringify(data));
}

// Execute command and return result
function execCommand(command, cwd = PROJECT_DIR) {
    return new Promise((resolve) => {
        exec(command, {
            cwd,
            timeout: 60000,
            maxBuffer: 10 * 1024 * 1024, // 10MB
            shell: '/bin/bash'
        }, (error, stdout, stderr) => {
            resolve({
                exitCode: error ? error.code || 1 : 0,
                stdout: stdout || '',
                stderr: stderr || ''
            });
        });
    });
}

// List files in directory
async function listFiles(dir = PROJECT_DIR, maxDepth = 3) {
    const result = await execCommand(
        `find "${dir}" -maxdepth ${maxDepth} -type f -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | head -500`
    );

    const files = result.stdout.split('\n')
        .filter(f => f.trim())
        .map(f => f.replace(PROJECT_DIR + '/', ''));

    return files;
}

// Read file content
async function readFile(filePath) {
    const fullPath = path.join(PROJECT_DIR, filePath);
    try {
        const content = await fs.readFile(fullPath, 'utf-8');
        return { success: true, content };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Write file content
async function writeFile(filePath, content) {
    const fullPath = path.join(PROJECT_DIR, filePath);
    try {
        // Ensure directory exists
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Create folder
async function createFolder(folderPath) {
    const fullPath = path.join(PROJECT_DIR, folderPath);
    try {
        await fs.mkdir(fullPath, { recursive: true });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Delete file or folder
async function deleteFile(filePath) {
    const fullPath = path.join(PROJECT_DIR, filePath);
    try {
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
            await fs.rm(fullPath, { recursive: true, force: true });
        } else {
            await fs.unlink(fullPath);
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// HTTP Server
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
        const origin = req.headers.origin || '*';
        res.writeHead(204, {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Credentials': 'true'
        });
        res.end();
        return;
    }

    console.log(`[Agent] ${req.method} ${pathname}`);

    try {
        // API routes (start with /health, /exec, /files, /file, /clone, /logs, /extract)
        const isApiRoute = ['/health', '/exec', '/files', '/file', '/clone', '/setup', '/logs', '/extract', '/folder', '/delete'].some(route => pathname.startsWith(route));

        // Health check (explicit)
        if (pathname === '/health') {
            return sendJson(req, res, {
                status: 'ok',
                agent: 'drape-fly',
                projectDir: PROJECT_DIR,
                timestamp: new Date().toISOString()
            });
        }

        // ============ LOGS SSE ENDPOINT ============
        // Stream live terminal output to clients
        if (pathname === '/logs' && req.method === 'GET') {
            const origin = req.headers.origin || '*';
            const sinceId = parseInt(url.searchParams.get('since')) || 0;

            // Set SSE headers
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Credentials': 'true',
                'X-Accel-Buffering': 'no'
            });

            // Send initial buffer (logs since requested ID)
            const initialLogs = logBuffer.filter(entry => entry.id > sinceId);
            for (const entry of initialLogs) {
                res.write(`data: ${JSON.stringify(entry)}\n\n`);
            }

            // Send connection established message
            res.write(`data: ${JSON.stringify({ type: 'connected', bufferedLines: initialLogs.length })}\n\n`);

            // Add to subscribers for live updates
            logSubscribers.add(res);

            // Heartbeat every 15 seconds
            const heartbeat = setInterval(() => {
                try {
                    res.write(`: ping\n\n`);
                } catch (e) {
                    clearInterval(heartbeat);
                    logSubscribers.delete(res);
                }
            }, 15000);

            // Cleanup on close
            req.on('close', () => {
                clearInterval(heartbeat);
                logSubscribers.delete(res);
                console.log('[Agent] Log subscriber disconnected');
            });

            return; // Keep connection open
        }

        // PROXY: Forward non-API requests to preview server on port 3000
        if (!isApiRoute) {
            const proxyHeaders = { ...req.headers };
            // Force host to localhost to bypass Vite's host-check (Vite 5/6)
            proxyHeaders['host'] = 'localhost:3000';

            const proxyReq = http.request({
                hostname: '127.0.0.1',
                port: 3000,
                path: req.url,
                method: req.method,
                headers: proxyHeaders
            }, (proxyRes) => {
                // console.log(`[Agent] Proxy: ${req.method} ${pathname} -> Status ${proxyRes.statusCode}`);

                // Inject CORS headers into proxied response
                const headers = { ...proxyRes.headers };
                const origin = req.headers.origin || '*';
                headers['Access-Control-Allow-Origin'] = origin;
                headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
                headers['Access-Control-Allow-Headers'] = '*';
                headers['Access-Control-Allow-Credentials'] = 'true';

                res.writeHead(proxyRes.statusCode, headers);
                proxyRes.pipe(res);
            });

            proxyReq.on('error', (err) => {
                // console.log(`[Agent] Proxy error: ${err.message}`);
                // Serve friendly loading page
                const origin = req.headers.origin || '*';
                res.writeHead(503, {
                    'Content-Type': 'text/html',
                    'Access-Control-Allow-Origin': origin,
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': '*',
                    'Access-Control-Allow-Credentials': 'true',
                    'X-Drape-Agent-Status': 'waiting',
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                });
                res.end(`
<!DOCTYPE html>
<html id="drape-boot-page">
<head>
    <title>Drape | Booting Environment...</title>
    <meta http-equiv="refresh" content="3">
    <style>
        body { background: #0b0e14; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
        .container { text-align: center; max-width: 400px; padding: 20px; }
        .spinner { border: 3px solid rgba(99, 102, 241, 0.1); border-top: 3px solid #6366f1; border-radius: 50%; width: 48px; height: 48px; animation: spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite; margin: 0 auto 24px; }
        h1 { font-size: 20px; font-weight: 600; margin-bottom: 12px; color: #f8fafc; }
        p { color: #94a3b8; font-size: 15px; line-height: 1.5; }
        .log-tip { margin-top: 32px; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 8px; font-size: 13px; color: #64748b; border: 1px solid rgba(255,255,255,0.05); }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="container">
        <div class="spinner"></div>
        <h1>Preparing Workstation</h1>
        <p>We are installing dependencies and starting the dev server. This usually takes 30-60 seconds for React projects.</p>
        <div class="log-tip">
            Tip: You can watch the real-time progress in the Terminal tab.
        </div>
    </div>
</body>
</html>
                `);
            });

            req.pipe(proxyReq);
            return;
        }

        // Setup (Install + Start) - With Live Output Streaming
        if (pathname === '/setup' && req.method === 'POST') {
            const body = await parseBody(req);
            const { command } = body;

            if (!command) return sendJson(req, res, { error: 'command required' }, 400);

            // Kill existing process if running
            if (devServerProcess) {
                try {
                    appendLog('🔄 Stopping previous server...', 'system');
                    process.kill(-devServerProcess.pid, 'SIGTERM');
                } catch (e) {
                    // Process might already be dead
                }
                devServerProcess = null;
            }

            appendLog(`🚀 Starting: ${command}`, 'system');
            console.log(`[Agent] Starting setup with live output: ${command}`);

            // Spawn with piped stdio to capture output
            devServerProcess = spawn('/bin/bash', ['-c', command], {
                cwd: PROJECT_DIR,
                detached: true,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env, FORCE_COLOR: '1' } // Enable colors
            });

            // Stream stdout to log buffer
            devServerProcess.stdout.on('data', (data) => {
                const lines = data.toString().split('\n').filter(l => l.trim());
                for (const line of lines) {
                    appendLog(line, 'stdout');
                }
            });

            // Stream stderr to log buffer
            devServerProcess.stderr.on('data', (data) => {
                const lines = data.toString().split('\n').filter(l => l.trim());
                for (const line of lines) {
                    appendLog(line, 'stderr');
                }
            });

            // Handle process exit
            devServerProcess.on('exit', (code, signal) => {
                appendLog(`⏹️ Process exited (code: ${code}, signal: ${signal})`, 'system');
                devServerProcess = null;
            });

            devServerProcess.on('error', (err) => {
                appendLog(`❌ Process error: ${err.message}`, 'system');
            });

            // Unref so it doesn't block shutdown
            devServerProcess.unref();

            return sendJson(req, res, {
                status: 'started',
                pid: devServerProcess.pid,
                message: 'Setup started with live output streaming'
            });
        }

        // Execute command
        if (pathname === '/exec' && req.method === 'POST') {
            const body = await parseBody(req);
            const { command, cwd } = body;

            if (!command) {
                return sendJson(req, res, { error: 'command required' }, 400);
            }

            const result = await execCommand(command, cwd || PROJECT_DIR);
            return sendJson(req, res, result);
        }

        // List files
        if (pathname === '/files' && req.method === 'GET') {
            const maxDepth = parseInt(url.searchParams.get('depth')) || 3;
            const files = await listFiles(PROJECT_DIR, maxDepth);
            return sendJson(req, res, { files, count: files.length });
        }

        // Read file
        if (pathname === '/file' && req.method === 'GET') {
            const filePath = url.searchParams.get('path');
            if (!filePath) {
                return sendJson(req, res, { error: 'path required' }, 400);
            }
            const result = await readFile(filePath);
            return sendJson(req, res, result, result.success ? 200 : 404);
        }

        // Write file
        if (pathname === '/file' && req.method === 'POST') {
            const body = await parseBody(req);
            const { path: filePath, content } = body;

            if (!filePath) {
                return sendJson(req, res, { error: 'path required' }, 400);
            }

            const result = await writeFile(filePath, content || '');
            return sendJson(req, res, result);
        }

        // Create folder
        if (pathname === '/folder' && req.method === 'POST') {
            const body = await parseBody(req);
            const { path: folderPath } = body;

            if (!folderPath) {
                return sendJson(req, res, { error: 'path required' }, 400);
            }

            const result = await createFolder(folderPath);
            return sendJson(req, res, result);
        }

        // Delete file or folder
        if (pathname === '/delete' && req.method === 'POST') {
            const body = await parseBody(req);
            const { path: filePath } = body;

            if (!filePath) {
                return sendJson(req, res, { error: 'path required' }, 400);
            }

            const result = await deleteFile(filePath);
            return sendJson(req, res, result);
        }

        // BULK EXTRACT: Extract tar.gz archive to project directory
        // This is 10-20x faster than individual file writes
        if (pathname === '/extract' && req.method === 'POST') {
            const body = await parseBody(req);
            const { archive } = body; // base64-encoded tar.gz

            if (!archive) {
                return sendJson(req, res, { error: 'archive required (base64 tar.gz)' }, 400);
            }

            const startTime = Date.now();
            const tempFile = path.join(os.tmpdir(), `drape-sync-${Date.now()}.tar.gz`);

            try {
                // Decode base64 and write to temp file
                const buffer = Buffer.from(archive, 'base64');
                await fs.writeFile(tempFile, buffer);

                // Ensure project directory exists
                await fs.mkdir(PROJECT_DIR, { recursive: true });

                // Extract tar.gz to project directory
                const extractResult = await execCommand(
                    `tar -xzf "${tempFile}" -C "${PROJECT_DIR}"`,
                    PROJECT_DIR
                );

                // Cleanup temp file
                await fs.unlink(tempFile).catch(() => {});

                if (extractResult.exitCode !== 0) {
                    return sendJson(req, res, {
                        success: false,
                        error: extractResult.stderr || 'Extract failed',
                        elapsed: Date.now() - startTime
                    }, 500);
                }

                // Count extracted files
                const countResult = await execCommand(
                    `find "${PROJECT_DIR}" -type f -not -path "*/node_modules/*" -not -path "*/.git/*" | wc -l`,
                    PROJECT_DIR
                );
                const fileCount = parseInt(countResult.stdout.trim()) || 0;

                console.log(`[Agent] Extracted ${fileCount} files in ${Date.now() - startTime}ms`);

                return sendJson(req, res, {
                    success: true,
                    filesExtracted: fileCount,
                    elapsed: Date.now() - startTime
                });
            } catch (error) {
                // Cleanup on error
                await fs.unlink(tempFile).catch(() => {});
                return sendJson(req, res, {
                    success: false,
                    error: error.message,
                    elapsed: Date.now() - startTime
                }, 500);
            }
        }

        // Clone repository
        if (pathname === '/clone' && req.method === 'POST') {
            const body = await parseBody(req);
            const { url: repoUrl, token } = body;

            if (!repoUrl) {
                return sendJson(res, { error: 'url required' }, 400);
            }

            // Prepare clone URL with token if provided
            let cloneUrl = repoUrl;
            if (token && repoUrl.includes('github.com') && !repoUrl.includes('@')) {
                cloneUrl = repoUrl.replace('https://', `https://${token}@`);
            }

            // Clear and clone
            const cloneCmd = `rm -rf ${PROJECT_DIR}/* ${PROJECT_DIR}/.[!.]* 2>/dev/null; git clone ${cloneUrl} ${PROJECT_DIR}`;
            const result = await execCommand(cloneCmd, '/home/coder');

            return sendJson(req, res, {
                success: result.exitCode === 0,
                ...result
            });
        }

        // 404 for unknown routes
        sendJson(req, res, { error: 'Not found' }, 404);

    } catch (error) {
        console.error('[Agent] Error:', error);
        sendJson(req, res, { error: error.message }, 500);
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Drape Agent (Fly.io) running on port ${PORT}`);
    console.log(`   Project directory: ${PROJECT_DIR}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    server.close(() => {
        process.exit(0);
    });
});
