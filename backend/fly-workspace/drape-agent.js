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
 * - GET  /download     - Download cache archive (for VM-to-VM cache sharing)
 * - POST /terminal     - Interactive terminal (WebSocket upgrade)
 */

const http = require('http');
const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const PORT = process.env.DRAPE_AGENT_PORT || 13338;
const PROJECT_DIR = '/home/coder/project';

console.log('🚀 Drape Agent v2.10 - Support pnpm 10.x store layout');

// Ensure PROJECT_DIR exists at startup (required for exec default cwd)
const fsSync = require('fs');
try {
    fsSync.mkdirSync(PROJECT_DIR, { recursive: true });
    console.log(`📁 Project directory ready: ${PROJECT_DIR}`);
} catch (e) {
    console.warn(`⚠️ Could not create project dir: ${e.message}`);
}

// ============ LIVE LOGS STREAMING ============
// Circular buffer for log lines (keeps last 1000 lines)
const LOG_BUFFER_SIZE = 1000;
const logBuffer = [];
let logSequence = 0;
const logSubscribers = new Set(); // SSE clients

const LOG_FILE = '/home/coder/server.log';

// Add line to log buffer and notify subscribers
async function appendLog(line, stream = 'stdout') {
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

    // Persist to file for Orchestrator tailing
    try {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] [${stream}] ${line}\n`;
        // Use fs.appendFile for persistent logs
        await fs.appendFile(LOG_FILE, logLine);
    } catch (e) {
        // console.error(`Failed to write to log file: ${e.message}`);
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
function execCommand(command, cwd = PROJECT_DIR, timeoutMs = 60000) {
    return new Promise((resolve) => {
        exec(command, {
            cwd,
            timeout: timeoutMs,
            maxBuffer: 50 * 1024 * 1024, // 50MB for larger outputs
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
async function writeFile(filePath, content, isBinary = false) {
    const fullPath = path.join(PROJECT_DIR, filePath);
    try {
        // Ensure directory exists
        await fs.mkdir(path.dirname(fullPath), { recursive: true });

        // Handle binary files (base64 encoded) vs text files
        if (isBinary) {
            // Decode base64 to Buffer for binary files
            const buffer = Buffer.from(content, 'base64');
            await fs.writeFile(fullPath, buffer);
        } else {
            // Write as UTF-8 for text files
            await fs.writeFile(fullPath, content, 'utf-8');
        }

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
        // API routes (start with /health, /exec, /files, /file, /clone, /logs, /extract, /download)
        const isApiRoute = ['/health', '/exec', '/files', '/file', '/clone', '/setup', '/logs', '/extract', '/folder', '/delete', '/download'].some(route => pathname.startsWith(route));

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
        // POST /exec { command, cwd?, timeout? }
        // timeout in ms (default 60000, max 600000 = 10 min)
        if (pathname === '/exec' && req.method === 'POST') {
            const body = await parseBody(req);
            const { command, cwd, timeout } = body;

            if (!command) {
                return sendJson(req, res, { error: 'command required' }, 400);
            }

            // Allow custom timeout up to 10 minutes
            const timeoutMs = Math.min(parseInt(timeout) || 60000, 600000);
            const result = await execCommand(command, cwd || PROJECT_DIR, timeoutMs);
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
            const { path: filePath, content, isBinary } = body;

            if (!filePath) {
                return sendJson(req, res, { error: 'path required' }, 400);
            }

            const result = await writeFile(filePath, content || '', isBinary || false);
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
                await fs.unlink(tempFile).catch(() => { });

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
                await fs.unlink(tempFile).catch(() => { });
                return sendJson(req, res, {
                    success: false,
                    error: error.message,
                    elapsed: Date.now() - startTime
                }, 500);
            }
        }

        // Download cache archive (for cache sharing between VMs)
        // GET /download?type=pnpm - Returns tar.gz of pnpm store
        // Optimized: uses pre-existing tar.gz if available, otherwise compresses only v10 store
        if (pathname === '/download' && req.method === 'GET') {
            const cacheType = url.searchParams.get('type') || 'pnpm';
            const startTime = Date.now();

            // For pnpm, we have a smarter strategy
            if (cacheType === 'pnpm') {
                const volumeDir = '/home/coder/volumes/pnpm-store';
                const preCachedTar = path.join(volumeDir, 'pnpm-cache.tar.gz');
                const v10Store = path.join(volumeDir, 'v10');

                try {
                    // Strategy 1: Use pre-existing tar.gz (fastest - just stream existing file)
                    try {
                        const tarStat = await fs.stat(preCachedTar);
                        if (tarStat.isFile() && tarStat.size > 0) {
                            console.log(`[Agent] Streaming pre-cached tar.gz (${(tarStat.size / 1024 / 1024).toFixed(1)}MB)...`);

                            const origin = req.headers.origin || '*';
                            res.writeHead(200, {
                                'Content-Type': 'application/gzip',
                                'Content-Disposition': 'attachment; filename="pnpm-cache.tar.gz"',
                                'Content-Length': tarStat.size,
                                'Access-Control-Allow-Origin': origin,
                                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                                'Access-Control-Allow-Headers': '*'
                            });

                            const fsStream = require('fs');
                            const readStream = fsStream.createReadStream(preCachedTar);
                            readStream.pipe(res);
                            readStream.on('end', () => {
                                const elapsed = Date.now() - startTime;
                                console.log(`[Agent] ✅ Streamed pre-cached tar.gz in ${elapsed}ms`);
                            });
                            readStream.on('error', (err) => {
                                console.error(`[Agent] Stream error: ${err}`);
                                if (!res.headersSent) res.end();
                            });
                            return;
                        }
                    } catch (e) {
                        // Pre-cached file doesn't exist, continue to strategy 2
                    }

                    // Strategy 2: Compress pnpm store (supports both old v10/ and new files/ layouts)
                    // pnpm 10.x uses: files/, index/, projects/ (no v10 subdirectory)
                    // Older pnpm used: v10/files/, v10/index/, etc.
                    try {
                        const filesDir = path.join(volumeDir, 'files');
                        let dirsToTar = [];
                        let layout = 'unknown';

                        // Check for new pnpm 10.x layout (files/, index/, projects/)
                        try {
                            const filesStat = await fs.stat(filesDir);
                            if (filesStat.isDirectory()) {
                                layout = 'pnpm10';
                                // Include all pnpm directories that exist
                                for (const dir of ['files', 'index', 'projects']) {
                                    try {
                                        const stat = await fs.stat(path.join(volumeDir, dir));
                                        if (stat.isDirectory()) dirsToTar.push(dir);
                                    } catch (e) { /* dir doesn't exist */ }
                                }
                            }
                        } catch (e) { /* files/ doesn't exist */ }

                        // Check for old v10 layout if new layout not found
                        if (dirsToTar.length === 0) {
                            try {
                                const v10Stat = await fs.stat(v10Store);
                                // Make sure it's a real directory, not a broken symlink
                                if (v10Stat.isDirectory()) {
                                    layout = 'v10';
                                    dirsToTar = ['v10'];
                                }
                            } catch (e) { /* v10 doesn't exist or broken symlink */ }
                        }

                        if (dirsToTar.length > 0) {
                            console.log(`[Agent] Compressing pnpm store (${layout} layout): ${dirsToTar.join(', ')}...`);

                            const origin = req.headers.origin || '*';
                            res.writeHead(200, {
                                'Content-Type': 'application/gzip',
                                'Content-Disposition': 'attachment; filename="pnpm-store.tar.gz"',
                                'X-Pnpm-Layout': layout,  // Tell receiver what layout this is
                                'Access-Control-Allow-Origin': origin,
                                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                                'Access-Control-Allow-Headers': '*',
                                'Transfer-Encoding': 'chunked'
                            });

                            const tarProcess = spawn('tar', [
                                '-czf', '-',
                                '-h',  // Dereference symlinks (CRITICAL for cache sharing!)
                                '-C', volumeDir,
                                ...dirsToTar
                            ], { stdio: ['ignore', 'pipe', 'pipe'] });

                            let bytesWritten = 0;
                            tarProcess.stdout.on('data', (chunk) => {
                                bytesWritten += chunk.length;
                                res.write(chunk);
                            });
                            tarProcess.stderr.on('data', (d) => console.error(`[Agent] tar: ${d}`));
                            tarProcess.on('close', (code) => {
                                const elapsed = Date.now() - startTime;
                                console.log(`[Agent] ${code === 0 ? '✅' : '❌'} pnpm store (${layout}): ${(bytesWritten/1024/1024).toFixed(1)}MB in ${elapsed}ms`);
                                res.end();
                            });
                            tarProcess.on('error', (e) => {
                                console.error(`[Agent] tar error: ${e}`);
                                if (!res.headersSent) sendJson(req, res, { error: e.message }, 500);
                                else res.end();
                            });
                            return;
                        }
                    } catch (e) {
                        console.error(`[Agent] Error checking pnpm store: ${e}`);
                    }

                    // No cache available
                    return sendJson(req, res, {
                        error: 'No pnpm cache available',
                        checked: [preCachedTar, v10Store]
                    }, 404);

                } catch (error) {
                    return sendJson(req, res, { error: error.message }, 500);
                }
            }

            // Fallback for other cache types
            return sendJson(req, res, { error: `Unknown cache type: ${cacheType}` }, 400);
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

// Listen on '::' for IPv6 (dual-stack: also accepts IPv4)
// This is required for Fly.io internal networking which uses IPv6
server.listen(PORT, '::', () => {
    console.log(`🚀 Drape Agent (Fly.io) running on port ${PORT} (IPv6 dual-stack)`);
    console.log(`   Project directory: ${PROJECT_DIR}`);

    // AUTO-FETCH CACHE: If CACHE_MASTER_ID is set, download cache from cache master
    // This bypasses Fly.io public proxy issues by using internal IPv6 network
    const cacheMasterId = process.env.CACHE_MASTER_ID;
    if (cacheMasterId) {
        console.log(`📦 [Auto-Cache] Cache master configured: ${cacheMasterId}`);
        autoFetchCache(cacheMasterId).catch(e => {
            console.warn(`⚠️ [Auto-Cache] Failed: ${e.message} (continuing without cache)`);
        });
    } else {
        console.log(`ℹ️ [Auto-Cache] No cache master configured (CACHE_MASTER_ID not set)`);
    }
});

/**
 * Auto-fetch cache from cache master on startup
 * Uses Fly.io internal IPv6 network (fast & reliable)
 */
async function autoFetchCache(cacheMasterId) {
    const startTime = Date.now();
    const cacheUrl = `http://${cacheMasterId}.vm.drape-workspaces.internal:13338`;
    const volumeDir = '/home/coder/volumes/pnpm-store';
    const pnpmDir = '/home/coder/.local/share/pnpm';

    console.log(`📦 [Auto-Cache] Downloading from ${cacheUrl}...`);

    // Setup directory structure
    await fs.mkdir(volumeDir, { recursive: true });
    await fs.mkdir(pnpmDir, { recursive: true });

    // Create symlink for pnpm store
    try {
        await fs.unlink(`${pnpmDir}/store`);
    } catch (e) { /* ignore if doesn't exist */ }
    await fs.symlink(volumeDir, `${pnpmDir}/store`);

    // Download cache using curl (more reliable than Node http for large files)
    const downloadCmd = `curl --max-time 120 -sS "${cacheUrl}/download?type=pnpm" -o /tmp/cache.tar.gz 2>&1`;
    const downloadResult = await execCommand(downloadCmd, '/tmp', 130000);

    if (downloadResult.exitCode !== 0) {
        throw new Error(`curl failed: ${downloadResult.stderr || downloadResult.stdout}`);
    }

    // Check if file was downloaded
    const fileStats = await fs.stat('/tmp/cache.tar.gz').catch(() => null);
    if (!fileStats || fileStats.size < 1000) {
        throw new Error(`Cache file too small or missing: ${fileStats?.size || 0} bytes`);
    }

    console.log(`📦 [Auto-Cache] Downloaded ${(fileStats.size / 1024 / 1024).toFixed(1)}MB, extracting...`);

    // Extract cache (tar contains v10/ folder, extract to pnpm-store/)
    // Increase timeout to 5 minutes for 1.4GB extraction
    const extractResult = await execCommand(
        'tar -xzf /tmp/cache.tar.gz -C /home/coder/volumes/pnpm-store/ 2>&1',
        '/tmp',
        300000
    );

    // Cleanup temp file
    await fs.unlink('/tmp/cache.tar.gz').catch(() => {});

    if (extractResult.exitCode !== 0) {
        throw new Error(`tar extract failed: ${extractResult.stderr || extractResult.stdout}`);
    }

    const elapsed = Date.now() - startTime;
    console.log(`✅ [Auto-Cache] Cache ready in ${elapsed}ms (${(fileStats.size / 1024 / 1024).toFixed(1)}MB)`);
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    server.close(() => {
        process.exit(0);
    });
});
