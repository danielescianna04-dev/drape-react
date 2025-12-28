const fs = require('fs');
const content = `
const http = require('http');
const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const PORT = 13338;
const PROJECT_DIR = '/home/coder/project';

console.log('🚀 Drape Agent v2.2 - Robust Edition');

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

function sendJson(req, res, data, status = 200) {
    const origin = req.headers.origin || '*';
    const body = JSON.stringify(data);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Credentials': 'true'
    });
    res.end(body);
}

function execCommand(command, cwd = PROJECT_DIR) {
    return new Promise((resolve) => {
        console.log(\`[Agent] Executing: \${command}\`);
        exec(command, {
            cwd,
            timeout: 60000,
            maxBuffer: 5 * 1024 * 1024, // 5MB limit
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

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
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

    // IMMEDIATE HEALTH CHECK (Bypass everything)
    if (pathname === '/health') {
        return sendJson(req, res, { status: 'ok', time: Date.now() });
    }

    console.log(\`[Agent] \${req.method} \${pathname}\`);

    try {
        const isApiRoute = ['/exec', '/files', '/file', '/clone', '/setup'].some(r => pathname.startsWith(r));

        if (!isApiRoute) {
            const proxyHeaders = { ...req.headers };
            proxyHeaders['host'] = 'localhost:3000';

            const proxyReq = http.request({
                hostname: '127.0.0.1',
                port: 3000,
                path: req.url,
                method: req.method,
                headers: proxyHeaders
            }, (proxyRes) => {
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
                const origin = req.headers.origin || '*';
                res.writeHead(503, {
                    'Content-Type': 'text/html',
                    'Access-Control-Allow-Origin': origin,
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': '*',
                    'Access-Control-Allow-Credentials': 'true'
                });
                res.end('<html><head><meta http-equiv="refresh" content="2"></head><body style="background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif"><div><h1>Server Starting...</h1><p>Vite is booting up, please wait.</p></div></body></html>');
            });

            req.pipe(proxyReq);
            return;
        }

        if (pathname === '/setup' && req.method === 'POST') {
            const { command } = await parseBody(req);
            console.log(\`[Agent] Setup triggered: \${command}\`);
            const child = spawn('/bin/bash', ['-c', \`nohup \${command} > /home/coder/server.log 2>&1 &\`], {
                cwd: PROJECT_DIR,
                detached: true,
                stdio: 'ignore'
            });
            child.unref();
            return sendJson(req, res, { status: 'started', pid: child.pid });
        }

        if (pathname === '/exec' && req.method === 'POST') {
            const { command, cwd } = await parseBody(req);
            const result = await execCommand(command, cwd);
            return sendJson(req, res, result);
        }

        if (pathname === '/files') {
            const result = await execCommand(\`find . -maxdepth 3 -not -path "*/.*" -not -path "*/node_modules/*"\`);
            return sendJson(req, res, { files: result.stdout.split('\\n').filter(Boolean) });
        }

        sendJson(req, res, { error: 'Not found' }, 404);

    } catch (error) {
        console.error('[Agent] Fatal Error:', error);
        sendJson(req, res, { error: error.message }, 500);
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(\`🚀 Drape Agent running on port \${PORT}\`);
});
\`;

fs.writeFileSync('/home/coder/drape-agent.js', content);
console.log('✅ Agent updated. Restarting...');
process.exit(0);
`;

fs.writeFileSync('nuke-fix.js', content);
console.log('nuke-fix.js written locally.');
