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

const PORT = process.env.DRAPE_AGENT_PORT || 13338;
const PROJECT_DIR = '/home/coder/project';

console.log('🚀 Drape Agent v2.1 - With Proxy Fix');

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
function sendJson(res, data, status = 200) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
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

// HTTP Server
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        res.end();
        return;
    }

    console.log(`[Agent] ${req.method} ${pathname}`);

    try {
        // API routes (start with /health, /exec, /files, /file, /clone)
        const isApiRoute = ['/health', '/exec', '/files', '/file', '/clone'].some(route => pathname.startsWith(route));

        // Health check (explicit)
        if (pathname === '/health') {
            return sendJson(res, {
                status: 'ok',
                agent: 'drape-fly',
                projectDir: PROJECT_DIR,
                timestamp: new Date().toISOString()
            });
        }

        // PROXY: Forward non-API requests to preview server on port 3000
        if (!isApiRoute) {
            const proxyReq = http.request({
                hostname: '127.0.0.1',
                port: 3000,
                path: req.url,
                method: req.method,
                headers: req.headers
            }, (proxyRes) => {
                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                proxyRes.pipe(res);
            });

            proxyReq.on('error', (err) => {
                console.log(`[Agent] Proxy error: ${err.message}`);
                sendJson(res, {
                    error: 'Preview server not running',
                    hint: 'Server starting...'
                }, 503);
            });

            req.pipe(proxyReq);
            return;
        }

        // Execute command
        if (pathname === '/exec' && req.method === 'POST') {
            const body = await parseBody(req);
            const { command, cwd } = body;

            if (!command) {
                return sendJson(res, { error: 'command required' }, 400);
            }

            const result = await execCommand(command, cwd || PROJECT_DIR);
            return sendJson(res, result);
        }

        // List files
        if (pathname === '/files' && req.method === 'GET') {
            const maxDepth = parseInt(url.searchParams.get('depth')) || 3;
            const files = await listFiles(PROJECT_DIR, maxDepth);
            return sendJson(res, { files, count: files.length });
        }

        // Read file
        if (pathname === '/file' && req.method === 'GET') {
            const filePath = url.searchParams.get('path');
            if (!filePath) {
                return sendJson(res, { error: 'path required' }, 400);
            }
            const result = await readFile(filePath);
            return sendJson(res, result, result.success ? 200 : 404);
        }

        // Write file
        if (pathname === '/file' && req.method === 'POST') {
            const body = await parseBody(req);
            const { path: filePath, content } = body;

            if (!filePath) {
                return sendJson(res, { error: 'path required' }, 400);
            }

            const result = await writeFile(filePath, content || '');
            return sendJson(res, result);
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

            return sendJson(res, {
                success: result.exitCode === 0,
                ...result
            });
        }

        // 404 for unknown routes
        sendJson(res, { error: 'Not found' }, 404);

    } catch (error) {
        console.error('[Agent] Error:', error);
        sendJson(res, { error: error.message }, 500);
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
