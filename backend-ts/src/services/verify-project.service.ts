import { log } from '../utils/logger';
import { workspaceService } from './workspace.service';
import { fileService } from './file.service';
import { aiProviderService } from './ai-provider.service';
import { shellEscape } from '../utils/helpers';
// sessionService and http removed — proxy CSS check replaced by SSR capture

export interface VerifyResult {
  passed: boolean;
  errors: string[];
  screenshots: Map<string, string>;
  serverLog: string;
  /** E2E page results (populated when e2e-check.js or qa-agent.js runs successfully) */
  pages?: { path: string; screenshot?: string; errors?: string[] }[];
  /** E2E navigation results (populated when e2e-check.js or qa-agent.js runs successfully) */
  navigation?: { element?: { text?: string }; error?: string; screenshot?: string }[];
  /** QA Agent report (populated when qa-agent.js runs) */
  qaReport?: {
    status?: string;
    qualityScore?: number;
    totalIssues?: number;
    attempts?: any[];
    log?: any[];
  };
}

interface AutoFixResult {
  applied: boolean;
  filesModified: string[];
  duration: number;
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

  // ── Verification report accumulator ────────────────────────────────────────
  const verificationReport: any = {
    projectId,
    createdAt: new Date().toISOString(),
    completedAt: '',
    status: 'passed' as string,
    backendVerification: {
      attempts: [] as any[],
      totalDuration: 0,
    },
    qaReport: null as any,
  };
  const reportStartTime = Date.now();

  let lastResult: VerifyResult = { passed: false, errors: [], screenshots: new Map(), serverLog: '' };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const isRetry = attempt > 0;
    onProgress?.(92 + attempt * 2, isRetry ? `Auto-fixing (attempt ${attempt + 1})...` : 'Verifying preview...', isRetry ? 'Auto-Fix' : 'Verify');

    if (isRetry) await new Promise(r => setTimeout(r, 3000));

    const attemptStartTime = Date.now();
    lastResult = await verify(projectId, userId);
    const attemptDuration = Date.now() - attemptStartTime;

    // Build attempt record for the report
    const attemptRecord: any = {
      attemptNumber: attempt + 1,
      timestamp: new Date().toISOString(),
      duration: attemptDuration,
      status: lastResult.passed ? 'passed' : 'failed',
      pages: lastResult.pages || [],
      navigation: lastResult.navigation || [],
      errors: lastResult.errors || [],
    };

    // Persist qaReport at top level of verification report (latest wins)
    if (lastResult.qaReport) {
      verificationReport.qaReport = lastResult.qaReport;
    }

    if (lastResult.passed) {
      log.info(`[Verify] Project ${projectId} passed on attempt ${attempt + 1}`);
      verificationReport.backendVerification.attempts.push(attemptRecord);
      break;
    }

    log.info(`[Verify] Project ${projectId} failed on attempt ${attempt + 1}: ${lastResult.errors.length} errors — ${lastResult.errors.slice(0, 3).join('; ')}`);

    if (attempt >= MAX_ATTEMPTS - 1) {
      log.warn(`[Verify] Project ${projectId} failed after ${MAX_ATTEMPTS} attempts`);
      verificationReport.backendVerification.attempts.push(attemptRecord);
      break;
    }

    onProgress?.(93 + attempt * 2, `Fixing ${lastResult.errors.length} error(s)...`, 'Auto-Fix');
    const fixResult = await autoFix(projectId, userId, technology, lastResult);

    if (fixResult.applied) {
      attemptRecord.fixes = [{
        model: 'gemini-3-flash',
        filesModified: fixResult.filesModified,
        duration: fixResult.duration,
      }];
    }

    verificationReport.backendVerification.attempts.push(attemptRecord);

    if (!fixResult.applied) {
      log.warn(`[Verify] Auto-fix could not apply fixes for ${projectId} on attempt ${attempt + 1} — will retry`);
      continue;
    }

    await restartDevServer(projectId, userId);
  }

  // ── Finalize and persist verification report ─────────────────────────────
  verificationReport.completedAt = new Date().toISOString();
  verificationReport.status = lastResult.passed ? 'passed' : 'failed';
  verificationReport.backendVerification.totalDuration = Date.now() - reportStartTime;

  // Strip base64 screenshots from report to keep file size manageable (< 10MB)
  // Screenshots are already saved separately in e2e-results.json / qa-report.json
  const reportToSave = JSON.parse(JSON.stringify(verificationReport));
  if (reportToSave.backendVerification?.attempts) {
    for (const a of reportToSave.backendVerification.attempts) {
      if (a.pages) a.pages.forEach((p: any) => delete p.screenshot);
      if (a.navigation) a.navigation.forEach((n: any) => {
        delete n.screenshotBefore;
        delete n.screenshotAfter;
      });
    }
  }

  try {
    await fileService.writeFile(projectId, '.drape/verification-report.json',
      JSON.stringify(reportToSave, null, 2));
    log.info(`[Verify] Saved verification report for ${projectId}`);
  } catch (err) {
    log.warn('[Verify] Failed to save verification report:', err);
  }

  // SSR Capture: ALWAYS run after verify loop (regardless of pass/fail).
  // Puppeteer renders pages inside the container with CSS fully applied,
  // inlines all styles into <style> tags, and saves static HTML.
  // The proxy serves these SSR files — guaranteed CSS, zero dependencies.
  onProgress?.(96, 'Rendering preview...', 'Rendering');
  try {
    const ssrScriptSrc = require('path').join(__dirname, '../../scripts/ssr-capture.js');
    const { config: appConfig } = require('../config');
    const ssrScriptDst = require('path').join(appConfig.projectsRoot, projectId, '.ssr-capture.js');
    require('fs').copyFileSync(ssrScriptSrc, ssrScriptDst);

    const ssrResult = await workspaceService.exec(projectId, userId,
      'NODE_PATH=/usr/local/lib/node_modules timeout 60 node /home/coder/project/.ssr-capture.js 2>/dev/null'
    );
    const ssr = JSON.parse(ssrResult.stdout || '{}');
    if (ssr.pages?.length > 0) {
      log.info(`[Verify] SSR captured ${ssr.pages.length} pages for ${projectId}`);

      // Verify SSR quality — check that CSS is actually present
      const { config: appConfig2 } = require('../config');
      const ssrIndexPath = require('path').join(appConfig2.projectsRoot, projectId, '.ssr', 'index.html');
      try {
        const ssrHtml = require('fs').readFileSync(ssrIndexPath, 'utf-8');
        const hasTailwindCSS = ssrHtml.includes('.flex') || ssrHtml.includes('.min-h-screen') || ssrHtml.includes('background-color');
        const hasCDN = ssrHtml.includes('cdn.tailwindcss.com');
        const hasContent = ssrHtml.length > 2000;

        if (!hasTailwindCSS && !hasCDN) {
          log.warn(`[Verify] SSR HTML has no Tailwind CSS and no CDN fallback — injecting CDN`);
          // Inject CDN into the SSR file directly
          const fixed = ssrHtml.replace('</head>', '  <script src="https://cdn.tailwindcss.com"></script>\n</head>');
          require('fs').writeFileSync(ssrIndexPath, fixed);
          // Also fix other SSR pages
          const ssrDir = require('path').join(appConfig2.projectsRoot, projectId, '.ssr');
          for (const f of require('fs').readdirSync(ssrDir)) {
            if (f === 'index.html' || f === 'manifest.json') continue;
            const fp = require('path').join(ssrDir, f);
            const content = require('fs').readFileSync(fp, 'utf-8');
            if (!content.includes('cdn.tailwindcss.com') && !content.includes('.flex')) {
              require('fs').writeFileSync(fp, content.replace('</head>', '  <script src="https://cdn.tailwindcss.com"></script>\n</head>'));
            }
          }
          log.info(`[Verify] Injected CDN fallback into all SSR pages`);
        } else {
          log.info(`[Verify] SSR quality OK (tailwind=${hasTailwindCSS}, cdn=${hasCDN}, size=${ssrHtml.length})`);
        }

        if (!hasContent) {
          log.warn(`[Verify] SSR HTML too small (${ssrHtml.length} bytes) — may be empty`);
        }
      } catch (checkErr: any) {
        log.warn(`[Verify] SSR quality check failed: ${checkErr.message}`);
      }
    } else {
      log.warn(`[Verify] SSR capture returned no pages for ${projectId}`);
    }
  } catch (ssrErr: any) {
    log.warn(`[Verify] SSR capture failed: ${ssrErr.message} — preview will use proxy fallback`);
  }

  onProgress?.(98, lastResult.passed ? 'Preview verified!' : 'Preview ready', lastResult.passed ? 'Verified' : 'Ready');
  return lastResult;
}

// ── Verify ──────────────────────────────────────────────────────────────────

async function verify(projectId: string, userId: string): Promise<VerifyResult> {
  const errors: string[] = [];
  const screenshots = new Map<string, string>();
  let pages: VerifyResult['pages'];
  let navigation: VerifyResult['navigation'];
  let qaReport: VerifyResult['qaReport'];

  // 1. Wait for server to be ACTUALLY ready — not time-based, event-based.
  //    Check server.log for "Ready" / "Listening" signals, or build failure signals.
  let httpCode = '000';
  let htmlBody = '';
  const maxWaitMs = 180000; // 3 min absolute max
  const startTime = Date.now();

  for (let wait = 0; (Date.now() - startTime) < maxWaitMs; wait++) {
    // Check server.log for completion signals
    try {
      const buildLog = await workspaceService.exec(projectId, userId, 'cat /home/coder/server.log 2>/dev/null | tail -50');
      const buildText = buildLog.stdout || '';

      // Build/server READY signals
      const isReady = buildText.includes('Ready in') ||           // next dev/start
        buildText.includes('ready started server') ||              // next start
        buildText.includes('Local:') ||                            // vite, astro
        buildText.includes('listening on') ||                      // generic
        buildText.includes('started server on') ||                 // next
        buildText.includes('Server running');                      // custom

      // Build FAILED signals
      const hasFailed = buildText.includes('Failed to compile') ||
        buildText.includes('Build error') ||
        buildText.includes('Process exited with code: 1') ||
        buildText.includes('exited with code 1') ||
        buildText.includes('ELIFECYCLE') ||
        buildText.includes('falling back to dev mode');

      if (isReady || hasFailed) {
        if (hasFailed) log.info(`[Verify] Build failed — checking if fallback started`);
        // Give the server 3s to fully bind the port after logging "Ready"
        await new Promise(r => setTimeout(r, 3000));
        break;
      }
    } catch {}

    // Also try HTTP — if server responds, it's ready regardless of logs
    const curlResult = await workspaceService.exec(projectId, userId,
      'curl -s -w "\\n%{http_code}" http://localhost:3000 2>/dev/null || echo "\\n000"'
    );
    const curlLines = (curlResult.stdout || '').split('\n');
    httpCode = curlLines[curlLines.length - 1]?.trim() || '000';
    htmlBody = curlLines.slice(0, -1).join('\n');
    if (httpCode !== '000') break;

    log.info(`[Verify] Waiting for server... (${Math.round((Date.now() - startTime) / 1000)}s)`);
    await new Promise(r => setTimeout(r, 5000));
  }

  // Final HTTP check if we exited via log signals
  if (httpCode === '000') {
    const curlResult = await workspaceService.exec(projectId, userId,
      'curl -s -w "\\n%{http_code}" http://localhost:3000 2>/dev/null || echo "\\n000"'
    );
    const curlLines = (curlResult.stdout || '').split('\n');
    httpCode = curlLines[curlLines.length - 1]?.trim() || '000';
    htmlBody = curlLines.slice(0, -1).join('\n');
  }

  if (httpCode === '000') {
    errors.push('Server not running after 60s — check server.log for crash');
    // Read server log for crash reason
    try {
      const crashLog = await workspaceService.exec(projectId, userId, 'cat /home/coder/server.log 2>/dev/null | tail -20');
      const crashErrors = extractLogErrors(crashLog.stdout || '');
      for (const e of crashErrors) errors.push(e);
    } catch {}
    return { passed: false, errors, screenshots, serverLog: '', pages: undefined, navigation: undefined };
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
      // Use qa-agent.js (functional + vision + self-healing) if available, fallback to e2e-check.js
      const qaAgentExists = await workspaceService.exec(projectId, userId,
        'test -f /usr/local/bin/qa-agent.js && echo "yes" || echo "no"'
      ).then(r => (r.stdout || '').trim() === 'yes').catch(() => false);

      const verifyScript = qaAgentExists
        ? 'NODE_PATH=/usr/local/lib/node_modules timeout 360 node /usr/local/bin/qa-agent.js 2>/tmp/qa-stderr.txt'
        : 'NODE_PATH=/usr/local/lib/node_modules timeout 240 node /usr/local/bin/e2e-check.js 2>/tmp/e2e-stderr.txt';

      if (qaAgentExists) log.info(`[Verify] Using qa-agent.js for verification`);

      let e2eResult: any = { stdout: '', exitCode: -1 };
      let usedQaAgent = qaAgentExists;

      // Run primary verify script
      try {
        e2eResult = await workspaceService.exec(projectId, userId, verifyScript);
      } catch (scriptErr: any) {
        e2eResult = { stdout: '', exitCode: -1, error: scriptErr.message };
      }

      // Check if qa-agent produced valid output; if not, fallback to e2e-check.js
      const qaExitCode = e2eResult.exitCode ?? (e2eResult.error ? -1 : 0);
      const qaStdout = (e2eResult.stdout || '').trim();
      const qaOutputValid = qaStdout.length > 0 && qaStdout.startsWith('{');

      if (usedQaAgent && (qaExitCode !== 0 || !qaOutputValid)) {
        log.warn(`[Verify] qa-agent failed with exitCode ${qaExitCode}, falling back to e2e-check.js`);
        usedQaAgent = false;
        try {
          e2eResult = await workspaceService.exec(projectId, userId,
            'NODE_PATH=/usr/local/lib/node_modules timeout 240 node /usr/local/bin/e2e-check.js 2>/tmp/e2e-stderr.txt'
          );
        } catch (fallbackErr: any) {
          log.warn(`[Verify] e2e-check.js fallback also failed: ${fallbackErr.message?.substring(0, 80)}`);
          e2eResult = { stdout: '' };
        }
      }

      const e2eRaw = (e2eResult.stdout || '').trim();
      if (!e2eRaw || !e2eRaw.startsWith('{')) {
        log.warn(`[Verify] Verification script produced no valid output (${e2eRaw.length} chars)`);
        errors.push('E2E verification failed — could not analyze pages');
      } else {
        const e2e = JSON.parse(e2eRaw);

        // Read full results (with screenshots) from bind-mounted file
        // qa-agent.js writes to qa-report.json; e2e-check.js writes to e2e-results.json
        try {
          const { config: appConfig } = require('../config');
          const resultFile = usedQaAgent ? 'qa-report.json' : 'e2e-results.json';
          const fullResultPath = require('path').join(
            appConfig.projectsRoot, projectId, '.drape', resultFile
          );
          if (require('fs').existsSync(fullResultPath)) {
            const fullData = require('fs').readFileSync(fullResultPath, 'utf8');
            const fullE2e = JSON.parse(fullData);
            // qa-report.json stores pages/navigation inside attempts; e2e-results.json at top level
            if (usedQaAgent && fullE2e.attempts?.length > 0) {
              const last = fullE2e.attempts[fullE2e.attempts.length - 1];
              if (last.pages && !e2e.pages?.length) e2e.pages = last.pages;
              if (last.clicks && !e2e.navigation?.length) e2e.navigation = last.clicks;
              log.info(`[Verify] Loaded qa-report.json: ${last.pages?.length || 0} pages, ${last.clicks?.length || 0} clicks`);
            } else {
              if (fullE2e.pages) e2e.pages = fullE2e.pages;
              if (fullE2e.navigation) e2e.navigation = fullE2e.navigation;
              log.info(`[Verify] Loaded e2e-results.json: ${fullE2e.pages?.length || 0} pages, ${fullE2e.navigation?.length || 0} nav tests`);
            }
          }
        } catch (readErr: any) {
          // Not an error if file doesn't exist yet — stdout data is sufficient
          log.info(`[Verify] No full results file found — using stdout data`);
        }

        if (e2e.passed === false && e2e.errors?.length > 0) {
          for (const err of e2e.errors.slice(0, 8)) {
            if (!errors.some(ex => ex.includes(err.substring(0, 40)))) errors.push(err);
          }
        }

        // Capture pages and navigation for verification report
        if (e2e.pages) {
          pages = e2e.pages;
          // Collect screenshots for ALL pages (not just broken ones)
          for (const pg of e2e.pages) {
            if (pg.screenshot) {
              screenshots.set(pg.path, pg.screenshot);
            }
          }
        }

        // Capture navigation results for verification report
        if (e2e.navigation) {
          navigation = e2e.navigation;
          // Collect screenshots from navigation tests (field names: screenshotBefore/screenshotAfter)
          for (const nav of e2e.navigation) {
            if (nav.screenshotBefore) {
              const key = `click:${nav.element?.text || 'unknown'}:before`;
              screenshots.set(key, nav.screenshotBefore);
            }
            if (nav.error && nav.screenshotAfter) {
              const key = `click:${nav.element?.text || 'unknown'}:after`;
              screenshots.set(key, nav.screenshotAfter);
            }
          }
        }

        // Capture QA report if present (qa-agent.js adds this field)
        if (e2e.qaReport) {
          qaReport = e2e.qaReport;
          log.info(`[Verify] QA report: status=${e2e.qaReport.status}, score=${e2e.qaReport.qualityScore}, issues=${e2e.qaReport.totalIssues}`);
        }
      }

      // Log stderr for debugging (check both qa and e2e stderr)
      try {
        const stderrFile = usedQaAgent ? '/tmp/qa-stderr.txt' : '/tmp/e2e-stderr.txt';
        const stderrLog = await workspaceService.exec(projectId, userId, `cat ${stderrFile} 2>/dev/null`);
        if (stderrLog.stdout?.trim()) {
          log.info(`[Verify] QA stderr: ${stderrLog.stdout.trim().substring(0, 500)}`);
        }
      } catch {}
    } catch (e2eErr: any) {
      log.warn(`[Verify] E2E check failed: ${e2eErr.message}`);
      // Read stderr for diagnostic info
      try {
        const stderrLog = await workspaceService.exec(projectId, userId, 'cat /tmp/e2e-stderr.txt 2>/dev/null');
        if (stderrLog.stdout?.trim()) {
          log.warn(`[Verify] E2E stderr: ${stderrLog.stdout.trim().substring(0, 500)}`);
        }
      } catch {}
      // Fallback: take screenshots of homepage + any detected sub-pages
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
        } catch { /* screenshot not available */ }
      }
    }
  }

  // 3b. Verify home page has substantial content (not just empty shell)
  if (pages) {
    const homePage = pages.find((p: any) => p.path === '/');
    if (homePage && (homePage as any).checks) {
      const checks = (homePage as any).checks;
      if (checks.textLength < 50 || checks.elementCount < 5) {
        errors.push(`[content] Home page has minimal content (${checks.textLength} chars, ${checks.elementCount} elements) — may appear blank`);
      }
    }
  }

  // 4. Check HTML body for error indicators
  // (CSS is handled by SSR capture after verify — no proxy CSS check needed)
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

  // QA Agent is the source of truth: if qaReport says not verified, mark as failed
  // even if errors array is empty (e.g. visual-only issues don't add to errors[])
  let passed = errors.length === 0;
  if (qaReport && qaReport.status !== 'verified') {
    passed = false;
    if (errors.length === 0) {
      errors.push(`QA verification failed: status=${qaReport.status}, issues=${qaReport.totalIssues || 0}`);
    }
  }

  return { passed, errors, screenshots, serverLog, pages, navigation, qaReport };
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
): Promise<AutoFixResult> {
  const fixStartTime = Date.now();
  try {
    // Read broken files for AI context
    const brokenFiles: { path: string; content: string }[] = [];

    for (const err of result.errors) {
      const fileMatch = err.match(/(?:\/home\/coder\/project\/|\.\/)?([a-zA-Z0-9_\-/.]+\.(?:tsx?|jsx?|vue|svelte|astro|css))/);
      if (fileMatch) {
        const relPath = fileMatch[1].replace(/^\/home\/coder\/project\//, '');
        if (PROTECTED_FILES.has(relPath)) continue;
        try {
          const readResult = await workspaceService.exec(projectId, userId, `cat ${shellEscape(`/home/coder/project/${relPath}`)} 2>/dev/null`);
          if (readResult.stdout && !brokenFiles.some(f => f.path === relPath)) {
            brokenFiles.push({ path: relPath, content: readResult.stdout });
          }
        } catch {}
      }
    }

    // Always read key files for context
    for (const p of ['app/layout.tsx', 'app/page.tsx', 'app/globals.css', 'src/App.tsx', 'src/index.css', 'src/main.tsx']) {
      try {
        const lr = await workspaceService.exec(projectId, userId, `cat ${shellEscape(`/home/coder/project/${p}`)} 2>/dev/null`);
        if (lr.stdout && !brokenFiles.some(f => f.path === p)) {
          brokenFiles.push({ path: p, content: lr.stdout });
        }
      } catch {}
    }

    // For 404 errors: extract the missing route and read related files
    for (const err of result.errors) {
      const routeMatch = err.match(/\[\/([^\]]+)\]/);
      if (routeMatch) {
        const route = routeMatch[1];
        if (!/^[a-zA-Z0-9_/-]+$/.test(route)) continue;
        for (const ext of ['tsx', 'jsx', 'ts', 'js']) {
          try {
            const pg = await workspaceService.exec(projectId, userId, `cat ${shellEscape(`/home/coder/project/app/${route}/page.${ext}`)} 2>/dev/null`);
            if (pg.stdout && !brokenFiles.some(f => f.path === `app/${route}/page.${ext}`)) {
              brokenFiles.push({ path: `app/${route}/page.${ext}`, content: pg.stdout });
            }
          } catch {}
        }
      }
    }

    // For navigation errors: read pages involved + state/store/context files
    const hasNavErrors = result.errors.some(e => e.includes('[nav]'));
    if (hasNavErrors) {
      // Read all page files to understand navigation flow
      try {
        const findResult = await workspaceService.exec(projectId, userId,
          'find /home/coder/project/app \( -name "page.tsx" -o -name "page.jsx" \) 2>/dev/null | head -15'
        );
        for (const pagePath of (findResult.stdout || '').trim().split('\n').filter(Boolean)) {
          const relPath = pagePath.replace('/home/coder/project/', '');
          if (PROTECTED_FILES.has(relPath) || brokenFiles.some(f => f.path === relPath)) continue;
          try {
            const content = await workspaceService.exec(projectId, userId, `cat ${shellEscape(pagePath)} 2>/dev/null`);
            if (content.stdout) brokenFiles.push({ path: relPath, content: content.stdout });
          } catch {}
        }
      } catch {}

      // Read store/context/state files — often where navigation bugs live
      const statePatterns = [
        'find /home/coder/project/app -maxdepth 3 \( -name "store*" -o -name "context*" -o -name "provider*" -o -name "auth*" \) 2>/dev/null | head -10',
        'find /home/coder/project/src -maxdepth 3 \( -name "store*" -o -name "context*" -o -name "provider*" -o -name "auth*" \) 2>/dev/null | head -10',
      ];
      for (const cmd of statePatterns) {
        try {
          const stateFiles = await workspaceService.exec(projectId, userId, cmd);
          for (const sf of (stateFiles.stdout || '').trim().split('\n').filter(Boolean)) {
            const relPath = sf.replace('/home/coder/project/', '');
            if (brokenFiles.some(f => f.path === relPath)) continue;
            try {
              const content = await workspaceService.exec(projectId, userId, `cat ${shellEscape(sf)} 2>/dev/null`);
              if (content.stdout) brokenFiles.push({ path: relPath, content: content.stdout });
            } catch {}
          }
        } catch {}
      }
    }

    const fileContext = brokenFiles.map(f => `--- ${f.path} ---\n${f.content}`).join('\n\n');

    // Include screenshot info in prompt
    let screenshotContext = '';
    const screenshotImages: { page: string; base64: string }[] = [];
    if (result.screenshots.size > 0) {
      screenshotContext = '\n\nSCREENSHOTS OF BROKEN PAGES (what the user sees):\n';
      for (const [pagePath, base64] of result.screenshots) {
        screenshotContext += `- ${pagePath}: BROKEN — see screenshot below\n`;
        // Keep max 3 screenshots to avoid token limits
        if (screenshotImages.length < 3) {
          screenshotImages.push({ page: pagePath, base64 });
        }
      }
      screenshotContext += '\nAnalyze the screenshots. Fix ALL visual issues: blank pages, missing CSS, wrong layout, 404 errors, missing content.\n';
    }

    const fixPrompt = `Fix these ${technology} project errors:

ERRORS:
${result.errors.join('\n')}
${screenshotContext}
${fileContext ? `CURRENT FILES:\n${fileContext}\n` : ''}
Return a JSON array of fixed files: [{"path": "file/path", "content": "complete fixed content"}]

Rules:
- Return COMPLETE file content, not just changed lines
- DO NOT modify these files: ${[...PROTECTED_FILES].join(', ')}
- For 404 errors: CREATE the missing page file with real content (not redirect)
- For redirect errors: REPLACE redirect() with actual page content
- For 'use client' errors: add 'use client' at top of file
- For missing module: add the correct import
- For blank page: ensure components return visible JSX with Tailwind classes
- Use lucide-react for icons (it's installed in the template)
- All data must be hardcoded const arrays — NEVER use fetch() for mock data
- For "broken click handler" / "nothing happened" errors: the button's onClick doesn't work. Check the state management (store/context) — the state change may not trigger a re-render or navigation. Common fixes: use router.push() after state change, use localStorage/sessionStorage to persist state, ensure setState triggers re-render
- For redirect loops (page X redirects to page Y): the guard/redirect logic doesn't persist state. Fix by using localStorage or cookies to persist auth/profile state across navigations, not just React state
- For pages that redirect to a selection screen: ensure the selection state persists in localStorage so the guard check passes after page reload
- Return valid JSON only`;

    // Build messages — include screenshots as image content blocks (Anthropic format)
    const messages: any[] = [];
    if (screenshotImages.length > 0) {
      const content: any[] = [{ type: 'text', text: fixPrompt }];
      for (const img of screenshotImages) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: img.base64 }
        });
        content.push({ type: 'text', text: `Screenshot of ${img.page} — fix the issues visible here.` });
      }
      messages.push({ role: 'user', content });
    } else {
      messages.push({ role: 'user', content: fixPrompt });
    }

    const fixStream = aiProviderService.chatStream('gemini-3-flash',
      messages,
      undefined, 'Fix build errors. Return only valid JSON.', { temperature: 0.1, maxTokens: 30000 }
    );
    let fixText = '';
    for await (const chunk of fixStream) {
      fixText += typeof chunk === 'string' ? chunk : JSON.stringify(chunk);
    }

    const fixMatch = fixText.match(/\[[\s\S]*\]/);
    if (!fixMatch) {
      log.warn(`[Verify] AI returned no valid JSON`);
      return { applied: false, filesModified: [], duration: Date.now() - fixStartTime };
    }

    const fixes: { path: string; content: string }[] = JSON.parse(fixMatch[0]);
    const filesModified: string[] = [];
    for (const fix of fixes) {
      if (!fix.path || !fix.content?.trim()) continue;
      if (PROTECTED_FILES.has(fix.path)) {
        log.info(`[Verify] Skipping protected file: ${fix.path}`);
        continue;
      }
      await fileService.writeFile(projectId, fix.path, fix.content);
      log.info(`[Verify] Fixed: ${fix.path}`);
      filesModified.push(fix.path);
    }

    log.info(`[Verify] Applied ${filesModified.length} fixes`);
    return { applied: filesModified.length > 0, filesModified, duration: Date.now() - fixStartTime };
  } catch (err: any) {
    log.error(`[Verify] Auto-fix crashed: ${err.message}\n${err.stack || ''}`);
    return { applied: false, filesModified: [], duration: Date.now() - fixStartTime };
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
