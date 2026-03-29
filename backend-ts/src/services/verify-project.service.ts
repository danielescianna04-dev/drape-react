import { log } from '../utils/logger';
import { workspaceService } from './workspace.service';
import { fileService } from './file.service';
import { aiProviderService } from './ai-provider.service';
import { sessionService } from './session.service';
import http from 'http';

export interface VerifyResult {
  passed: boolean;
  errors: string[];
  screenshots: Map<string, string>;
  serverLog: string;
}

interface VerifyOptions {
  projectId: string;
  userId: string;
  technology: string;
  onProgress?: (pct: number, msg: string, stage: string) => void;
}

const PROTECTED_FILES = new Set([
  'package.json', 'tsconfig.json',
  'next.config.ts', 'next.config.js', 'postcss.config.mjs', 'postcss.config.js',
  'tailwind.config.ts', 'tailwind.config.js', 'astro.config.mjs',
  'app/globals.css', 'src/index.css', 'index.html',
  'vite.config.ts', 'vite.config.js',
]);

/**
 * Verify a project is working correctly using Puppeteer E2E.
 * If verification fails, auto-fix with AI and re-verify (max 3 attempts).
 * Returns only when project is verified OR max attempts exhausted.
 */
export async function verifyAndFixProject(opts: VerifyOptions): Promise<VerifyResult> {
  const { projectId, userId, technology, onProgress } = opts;
  const MAX_ATTEMPTS = 3;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const isRetry = attempt > 0;
    onProgress?.(92 + attempt * 2, isRetry ? `Auto-fixing (attempt ${attempt + 1})...` : 'Verifying preview...', isRetry ? 'Auto-Fix' : 'Verify');

    // Short wait before verify (server readiness is checked inside verify())
    if (isRetry) await new Promise(r => setTimeout(r, 3000));

    const result = await verify(projectId, userId);

    if (result.passed) {
      log.info(`[Verify] Project ${projectId} passed on attempt ${attempt + 1}`);
      onProgress?.(98, 'Preview verified!', 'Verified');
      return result;
    }

    log.info(`[Verify] Project ${projectId} failed on attempt ${attempt + 1}: ${result.errors.length} errors — ${result.errors.slice(0, 3).join('; ')}`);

    // Don't try to fix on last attempt
    if (attempt >= MAX_ATTEMPTS - 1) {
      log.warn(`[Verify] Project ${projectId} failed after ${MAX_ATTEMPTS} attempts`);
      return result;
    }

    // Auto-fix
    onProgress?.(93 + attempt * 2, `Fixing ${result.errors.length} error(s)...`, 'Auto-Fix');
    const fixed = await autoFix(projectId, userId, technology, result);
    if (!fixed) {
      log.warn(`[Verify] Auto-fix failed for ${projectId} — stopping`);
      return result;
    }

    // Restart dev server after fixes
    await restartDevServer(projectId, userId);
  }

  return { passed: false, errors: ['Max attempts exhausted'], screenshots: new Map(), serverLog: '' };
}

// ── Verify ──────────────────────────────────────────────────────────────────

async function verify(projectId: string, userId: string): Promise<VerifyResult> {
  const errors: string[] = [];
  const screenshots = new Map<string, string>();

  // 1. Wait for server to be ready (warmProject runs in background via setImmediate)
  //    Check server.log for build errors while waiting — don't waste 60s if build failed
  let httpCode = '000';
  let htmlBody = '';
  // 24 attempts × 5s = 120s max wait (next build can take 60-90s)
  for (let wait = 0; wait < 24; wait++) {
    const curlResult = await workspaceService.exec(projectId, userId,
      'curl -s -w "\\n%{http_code}" http://localhost:3000 2>/dev/null || echo "\\n000"'
    );
    const curlLines = (curlResult.stdout || '').split('\n');
    httpCode = curlLines[curlLines.length - 1]?.trim() || '000';
    htmlBody = curlLines.slice(0, -1).join('\n');
    if (httpCode !== '000') break;

    // Check if build already failed (don't wait 60s for nothing)
    try {
      const buildLog = await workspaceService.exec(projectId, userId, 'cat /home/coder/server.log 2>/dev/null | tail -30');
      const buildText = buildLog.stdout || '';
      if (buildText.includes('Failed to compile') || buildText.includes('Build error') ||
          buildText.includes('Process exited with code: 1') || buildText.includes('exited with code 1')) {
        log.info(`[Verify] Build failed early — skipping remaining wait`);
        break;
      }
    } catch {}

    log.info(`[Verify] Waiting for server... (${wait + 1}/12)`);
    await new Promise(r => setTimeout(r, 5000));
  }

  if (httpCode === '000') {
    errors.push('Server not running after 60s — check server.log for crash');
    // Read server log for crash reason
    try {
      const crashLog = await workspaceService.exec(projectId, userId, 'cat /home/coder/server.log 2>/dev/null | tail -20');
      const crashErrors = extractLogErrors(crashLog.stdout || '');
      for (const e of crashErrors) errors.push(e);
    } catch {}
    return { passed: false, errors, screenshots, serverLog: '' };
  } else if (httpCode === '500') {
    const errMatch = htmlBody.match(/(?:Error|error)[:\s]([^\n<]{10,200})/);
    errors.push(errMatch ? errMatch[0] : 'Server returned HTTP 500');
  }

  // 2. Read server logs for errors
  const logsResult = await workspaceService.exec(projectId, userId,
    'cat /home/coder/server.log 2>/dev/null | tail -100'
  );
  const serverLog = logsResult.stdout || '';
  const logErrors = extractLogErrors(serverLog);
  for (const e of logErrors) {
    if (!errors.some(ex => ex.includes(e.substring(0, 40)))) errors.push(e);
  }

  // 3. Run Puppeteer E2E (only if server is responding)
  if (httpCode !== '000') {
    try {
      const e2eResult = await workspaceService.exec(projectId, userId,
        'timeout 60 node /usr/local/bin/e2e-check.js 2>/dev/null'
      );
      const e2e = JSON.parse(e2eResult.stdout || '{}');

      if (e2e.passed === false && e2e.errors?.length > 0) {
        for (const err of e2e.errors.slice(0, 8)) {
          if (!errors.some(ex => ex.includes(err.substring(0, 40)))) errors.push(err);
        }
      }
    } catch (e2eErr: any) {
      log.warn(`[Verify] E2E check failed: ${e2eErr.message}`);
      // Fallback: take a simple screenshot
      if (httpCode === '200') {
        try {
          const ssResult = await workspaceService.exec(projectId, userId,
            'timeout 25 node /usr/local/bin/screenshot.js 2>/tmp/ss-err.txt'
          );
          const ss = (ssResult.stdout || '').trim();
          if (ss) {
            screenshots.set('/', ss);
            if (ss.length < 7000) errors.push('Page renders as blank/white screen (screenshot too small)');
          }
          // Read Puppeteer JS errors from stderr
          const ssErr = await workspaceService.exec(projectId, userId, 'cat /tmp/ss-err.txt 2>/dev/null');
          if (ssErr.stdout?.includes('"errors"')) {
            const pageErrors = JSON.parse(ssErr.stdout).errors || [];
            for (const e of pageErrors.slice(0, 3)) {
              if (!errors.some(ex => ex.includes(e.substring(0, 30)))) errors.push(e);
            }
          }
        } catch { /* screenshot not available */ }
      }
    }
  }

  // 4. Verify through proxy (same path the user's WebView takes)
  if (httpCode === '200' && errors.length === 0) {
    try {
      const session = await sessionService.getByProjectId(projectId);
      if (session?.previewPort || session?.agentUrl) {
        const target = session.previewPort
          ? { host: '127.0.0.1', port: session.previewPort }
          : { host: '127.0.0.1', port: session.projectInfo?.port || 3000 };

        const proxyHtml = await new Promise<string>((resolve, reject) => {
          const req = http.get({
            hostname: target.host,
            port: target.port,
            path: '/',
            timeout: 10000,
            headers: { 'accept-encoding': 'identity' },
          }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
            res.on('error', reject);
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        });

        // Check if HTML through proxy has CSS (<link> tag or <style> tag)
        const hasCssLink = /<link[^>]+\.css/.test(proxyHtml);
        const hasStyleTag = /<style[\s>]/.test(proxyHtml);
        const hasInlineStyles = /style="[^"]*background|style="[^"]*color/.test(proxyHtml);

        if (!hasCssLink && !hasStyleTag && !hasInlineStyles) {
          log.warn(`[Verify] Proxy HTML has no CSS (no <link>, <style>, or inline styles)`);
          errors.push('Page has no CSS through proxy — styles not loading. Check that the project is running in production mode (next build + next start).');
        } else {
          log.info(`[Verify] Proxy CSS check passed (link=${hasCssLink}, style=${hasStyleTag}, inline=${hasInlineStyles})`);
        }

        // Check if page has actual content (not just loading spinner)
        const textContent = proxyHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '').trim();
        if (textContent.length < 50) {
          log.warn(`[Verify] Proxy HTML has very little text content (${textContent.length} chars)`);
          // Don't fail on this — client-side rendering may populate content after JS loads
        }
      }
    } catch (proxyErr: any) {
      log.warn(`[Verify] Proxy verification failed: ${proxyErr.message}`);
    }
  }

  // 5. Check HTML body for error indicators
  if (httpCode === '200') {
    const bodyChecks = [
      { test: "Can't resolve", msg: "Module resolution error in page" },
      { test: 'CssSyntaxError', msg: 'CSS syntax error' },
      { test: 'Application error', msg: 'Application error on page' },
      { test: 'Internal Server Error', msg: 'Internal server error' },
      { test: 'Unhandled Runtime Error', msg: 'Unhandled runtime error' },
    ];
    for (const { test, msg } of bodyChecks) {
      if (htmlBody.includes(test) && !errors.some(e => e.includes(msg))) {
        errors.push(msg);
      }
    }
  }

  return { passed: errors.length === 0, errors, screenshots, serverLog };
}

// ── Extract errors from server log ──────────────────────────────────────────

function extractLogErrors(serverLog: string): string[] {
  const errors: string[] = [];
  const patterns = [
    /(?:Error|ERROR):\s*(.*(?:Cannot find module|Module not found|is not defined|Unexpected token|SyntaxError|TypeError|ReferenceError|Cannot resolve|Can't resolve|Failed to resolve)[^\n]*)/gi,
    /CssSyntaxError[^\n]*/gi,
    /error\s+TS\d+:\s*([^\n]*)/gi,
    /(?:ENOENT):\s*([^\n]*no such file[^\n]*)/gi,
    /Hydration failed[^\n]*/gi,
    /Invalid src prop[^\n]*/gi,
    /Module build failed[^\n]*/gi,
  ];

  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(serverLog)) !== null) {
      const err = (m[1] || m[0]).trim();
      if (err.length > 10 && !errors.some(e => e.includes(err.substring(0, 40))) && errors.length < 10) {
        errors.push(err);
      }
    }
  }

  return errors;
}

// ── Auto-fix with AI ────────────────────────────────────────────────────────

async function autoFix(
  projectId: string,
  userId: string,
  technology: string,
  result: VerifyResult,
): Promise<boolean> {
  try {
    // Read broken files for AI context
    const brokenFiles: { path: string; content: string }[] = [];

    for (const err of result.errors) {
      const fileMatch = err.match(/(?:\/home\/coder\/project\/|\.\/)?([a-zA-Z0-9_\-/.]+\.(?:tsx?|jsx?|vue|svelte|astro|css))/);
      if (fileMatch) {
        const relPath = fileMatch[1].replace(/^\/home\/coder\/project\//, '');
        if (PROTECTED_FILES.has(relPath)) continue;
        try {
          const readResult = await workspaceService.exec(projectId, userId, `cat /home/coder/project/${relPath} 2>/dev/null`);
          if (readResult.stdout && !brokenFiles.some(f => f.path === relPath)) {
            brokenFiles.push({ path: relPath, content: readResult.stdout });
          }
        } catch {}
      }
    }

    // Always read layout + CSS for context on visual errors
    const hasVisualError = result.errors.some(e =>
      e.includes('blank') || e.includes('white') || e.includes('CSS') || e.includes('styles') || e.includes('screen')
    );
    if (hasVisualError) {
      for (const p of ['app/layout.tsx', 'app/globals.css', 'app/page.tsx', 'src/App.tsx', 'src/index.css', 'src/main.tsx']) {
        try {
          const lr = await workspaceService.exec(projectId, userId, `cat /home/coder/project/${p} 2>/dev/null`);
          if (lr.stdout && !brokenFiles.some(f => f.path === p)) {
            brokenFiles.push({ path: p, content: lr.stdout });
          }
        } catch {}
      }
    }

    const fileContext = brokenFiles.map(f => `--- ${f.path} ---\n${f.content}`).join('\n\n');

    const fixPrompt = `Fix these ${technology} project errors:

ERRORS:
${result.errors.join('\n')}

${fileContext ? `CURRENT FILES:\n${fileContext}\n` : ''}
Return a JSON array of fixed files: [{"path": "file/path", "content": "complete fixed content"}]

Rules:
- Return COMPLETE file content, not just changed lines
- DO NOT modify these files: ${[...PROTECTED_FILES].join(', ')}
- For 'use client' errors: add 'use client' at top of file
- For missing module: add the correct import
- For blank page: ensure components return visible JSX with Tailwind classes
- NEVER import from lucide-react, @heroicons, @fortawesome — use inline SVG or emoji
- Return valid JSON only`;

    const fixStream = aiProviderService.chatStream('gemini-3-flash',
      [{ role: 'user', content: fixPrompt }],
      undefined, 'Fix build errors. Return only valid JSON.', { temperature: 0.1, maxTokens: 30000 }
    );
    let fixText = '';
    for await (const chunk of fixStream) {
      fixText += typeof chunk === 'string' ? chunk : JSON.stringify(chunk);
    }

    const fixMatch = fixText.match(/\[[\s\S]*\]/);
    if (!fixMatch) {
      log.warn(`[Verify] AI returned no valid JSON`);
      return false;
    }

    const fixes: { path: string; content: string }[] = JSON.parse(fixMatch[0]);
    let fixCount = 0;
    for (const fix of fixes) {
      if (!fix.path || !fix.content?.trim()) continue;
      if (PROTECTED_FILES.has(fix.path)) {
        log.info(`[Verify] Skipping protected file: ${fix.path}`);
        continue;
      }
      await fileService.writeFile(projectId, fix.path, fix.content);
      log.info(`[Verify] Fixed: ${fix.path}`);
      fixCount++;
    }

    log.info(`[Verify] Applied ${fixCount} fixes`);
    return fixCount > 0;
  } catch (err: any) {
    log.warn(`[Verify] Auto-fix failed: ${err.message}`);
    return false;
  }
}

// ── Restart dev server ──────────────────────────────────────────────────────

async function restartDevServer(projectId: string, userId: string): Promise<void> {
  try {
    // Kill existing server/build processes
    await workspaceService.exec(projectId, userId,
      'pkill -f "next\\|vite\\|astro\\|expo" 2>/dev/null; sleep 2'
    );
    // Clear .next build cache so next build starts fresh with fixed files
    await workspaceService.exec(projectId, userId,
      'rm -rf /home/coder/project/.next 2>/dev/null'
    );
    const warmTimeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('restart timeout')), 120000)
    );
    await Promise.race([workspaceService.warmProject(projectId, userId), warmTimeout]);
  } catch (err: any) {
    log.warn(`[Verify] Dev server restart failed: ${err.message}`);
  }
}
