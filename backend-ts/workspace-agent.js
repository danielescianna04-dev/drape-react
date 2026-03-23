#!/usr/bin/env node
// Minimal workspace agent for local dev — runs inside each container on port 13338
const http = require('http');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 13338;
const PROJECT_DIR = '/home/coder/project';

// Security: blocklist dangerous commands to prevent abuse
const BLOCKED_PATTERNS = [
  /\bxmrig\b/i, /\bcpuminer\b/i, /\bminerd?\b/i, /\bhashcat\b/i,
  /\bnmap\b/, /\bnetcat\b/, /\bnc\s+-[elpk]/, /\bsocat\b/,
  /\bcurl\b.*\|\s*(bash|sh|python)/,
  /\bwget\b.*\|\s*(bash|sh|python)/,
  /\bdd\b\s+.*of=\/dev/,
  /\brm\s+-rf\s+\/[^h]/,  // rm -rf /anything except /home
  /\b(apt|apk)\s+(install|add)\b/,
  /\bchmod\b.*[+]s\b/,
  /\btorify\b/, /\bproxychains\b/,
];

function isBlocked(cmd) {
  return BLOCKED_PATTERNS.some(p => p.test(cmd));
}

// Log buffer for /logs endpoint
const logLines = [];
const MAX_LOG_LINES = 5000;
let devProcess = null;

function addLog(text) {
  const ts = new Date().toISOString();
  const lines = text.split('\n').filter(l => l.trim());
  for (const line of lines) {
    logLines.push({ ts, text: line });
    if (logLines.length > MAX_LOG_LINES) logLines.shift();
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader('Content-Type', 'application/json');

  // GET /health
  if (req.method === 'GET' && url.pathname === '/health') {
    res.end(JSON.stringify({ status: 'ok', devServer: devProcess ? 'running' : 'stopped' }));
    return;
  }

  // POST /setup — start a dev server command
  if (req.method === 'POST' && url.pathname === '/setup') {
    const body = await readBody(req);
    const cmd = body.command || 'echo "No command"';
    const cwd = body.cwd || PROJECT_DIR;

    if (isBlocked(cmd)) {
      res.writeHead(403);
      res.end(JSON.stringify({ stdout: '', stderr: 'Command blocked by security policy', exitCode: 1 }));
      return;
    }

    // Kill previous dev process
    if (devProcess) {
      try { devProcess.kill('SIGTERM'); } catch {}
      devProcess = null;
    }

    addLog(`[agent] Running setup: ${cmd}`);
    const child = spawn('sh', ['-c', cmd], { cwd, env: { ...process.env, HOME: '/home/coder' } });
    devProcess = child;

    child.stdout.on('data', d => addLog(d.toString()));
    child.stderr.on('data', d => addLog(d.toString()));
    child.on('exit', (code) => {
      // Only log non-zero exits — code 0 triggers false crash detection in backend
      if (code !== 0) {
        addLog(`[agent] Process exited with code ${code}`);
      }
      if (devProcess === child) devProcess = null;
    });

    res.end(JSON.stringify({ ok: true, pid: child.pid }));
    return;
  }

  // POST /exec — run a command and return output
  if (req.method === 'POST' && url.pathname === '/exec') {
    const body = await readBody(req);
    const cmd = body.command || 'echo ok';
    const cwd = body.cwd || PROJECT_DIR;
    const timeout = body.timeout || 30000;

    if (isBlocked(cmd)) {
      res.writeHead(403);
      res.end(JSON.stringify({ stdout: '', stderr: 'Command blocked by security policy', exitCode: 1 }));
      return;
    }

    try {
      const stdout = execSync(cmd, { cwd, timeout, env: { ...process.env, HOME: '/home/coder' } }).toString();
      res.end(JSON.stringify({ stdout, stderr: '', exitCode: 0 }));
    } catch (e) {
      res.end(JSON.stringify({ stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || e.message, exitCode: e.status || 1 }));
    }
    return;
  }

  // GET /logs — return buffered logs (optionally since timestamp)
  if (req.method === 'GET' && url.pathname === '/logs') {
    const since = url.searchParams.get('since') || '0';
    const sinceDate = new Date(since === '0' ? 0 : since);
    const filtered = logLines.filter(l => new Date(l.ts) >= sinceDate);

    // SSE-style streaming
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    for (const line of filtered) {
      res.write(`data: ${JSON.stringify(line)}\n\n`);
    }

    // Keep connection open and stream new logs
    const interval = setInterval(() => {
      const newLines = logLines.filter(l => new Date(l.ts) > sinceDate);
      for (const line of newLines) {
        res.write(`data: ${JSON.stringify(line)}\n\n`);
      }
    }, 1000);

    req.on('close', () => clearInterval(interval));
    return;
  }

  // POST /file — notify about file change
  if (req.method === 'POST' && url.pathname === '/file') {
    const body = await readBody(req);
    addLog(`[agent] File updated: ${body.path}`);
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // 404
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[workspace-agent] Listening on port ${PORT}`);

  // Start OpenCode serve in background (AI coding agent)
  try {
    const opencodeServe = spawn('opencode', ['serve', '--port', '4096', '--hostname', '0.0.0.0'], {
      cwd: PROJECT_DIR,
      env: { ...process.env, HOME: '/home/coder' },
      stdio: 'ignore',
      detached: true,
    });
    opencodeServe.unref();
    addLog('[agent] OpenCode serve starting on port 4096');
  } catch (e) {
    addLog(`[agent] OpenCode serve failed to start: ${e.message}`);
  }
});
