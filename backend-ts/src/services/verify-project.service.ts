import { log } from '../utils/logger';
import { workspaceService } from './workspace.service';
import { fileService } from './file.service';
import { aiProviderService } from './ai-provider.service';
import { shellEscape } from '../utils/helpers';
import { appendRuntimeAction } from './build-report.service';
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

// Files that AI auto-fix must NEVER modify (secrets, core config)
const PROTECTED_FILES = new Set([
  'package.json', 'tsconfig.json',
  'next.config.ts', 'next.config.js',
  'astro.config.mjs',
  'vite.config.ts', 'vite.config.js',
  'index.html',
]);
// CSS plumbing files CAN be repaired by auto-fix (root cause of "Content without CSS"):
// - app/globals.css, src/index.css
// - postcss.config.mjs, postcss.config.js
// - tailwind.config.ts, tailwind.config.js
// - app/layout.tsx (for CSS import fixes)

/**
 * Verify a project is working correctly using Puppeteer E2E.
 * If verification fails, auto-fix with AI and re-verify (max 3 attempts).
 * Returns only when project is verified OR max attempts exhausted.
 */
export async function verifyAndFixProject(opts: VerifyOptions): Promise<VerifyResult> {
  const { projectId, userId, technology, onProgress } = opts;
  // Flow: verify → auto-fix → reverify (2 outer attempts).
  // qa-agent.js does internal fix cycles too, but the outer auto-fix handles
  // e2e-check.js fallback cases where qa-agent timed out.
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

  // CSS repair is now done in workspace.service.ts ensureCSSPipeline() before build

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

    await appendRuntimeAction(projectId, 'verify', `Verification attempt ${attempt + 1} failed`, {
      status: 'failed',
      error: lastResult.errors.slice(0, 5).join('\n').substring(0, 500),
      details: `${lastResult.errors.length} error(s) found`,
    }).catch(() => {});

    if (attempt >= MAX_ATTEMPTS - 1) {
      log.warn(`[Verify] Project ${projectId} failed after ${MAX_ATTEMPTS} attempts`);
      verificationReport.backendVerification.attempts.push(attemptRecord);
      await appendRuntimeAction(projectId, 'verify', 'Verification exhausted all attempts', {
        status: 'failed',
        error: `Failed after ${MAX_ATTEMPTS} attempts`,
      }).catch(() => {});
      break;
    }

    // Cache corruption (vendor-chunks, stale webpack) — clear .next cache and restart instead of AI fix
    const isCacheCorruption = lastResult.errors.some(e => /vendor-chunks|__webpack_modules__.*is not a function|Cannot find module '\.\/\d+\.js'|Loading chunk \d+ failed/.test(e));
    if (isCacheCorruption) {
      log.info(`[Verify] Cache corruption detected for ${projectId} — clearing .next and restarting`);
      try {
        // Use workspaceService.exec which safely runs inside the container
        await workspaceService.exec(projectId, userId, 'find /home/coder/project/.next -mindepth 1 -delete 2>/dev/null || true');
        await new Promise(r => setTimeout(r, 2000));
      } catch {}
      await appendRuntimeAction(projectId, 'verify', `Cache cleared + restart (attempt ${attempt + 1})`, {
        status: 'fixed',
        fix: 'Cleared .next cache and restarted dev server',
      }).catch(() => {});
      verificationReport.backendVerification.attempts.push(attemptRecord);
      continue;
    }

    onProgress?.(93 + attempt * 2, `Fixing ${lastResult.errors.length} error(s)...`, 'Auto-Fix');
    const fixResult = await autoFix(projectId, userId, technology, lastResult);

    if (fixResult.applied) {
      attemptRecord.fixes = [{
        model: 'gemini-3-flash',
        filesModified: fixResult.filesModified,
        duration: fixResult.duration,
      }];
      await appendRuntimeAction(projectId, 'verify', `Auto-fix applied (attempt ${attempt + 1})`, {
        status: 'fixed',
        fix: `Modified ${fixResult.filesModified.length} file(s): ${fixResult.filesModified.slice(0, 3).join(', ')}${fixResult.filesModified.length > 3 ? '...' : ''}`,
        metadata: { filesModified: fixResult.filesModified },
      }).catch(() => {});
    }

    verificationReport.backendVerification.attempts.push(attemptRecord);

    if (!fixResult.applied) {
      log.warn(`[Verify] Auto-fix could not apply fixes for ${projectId} on attempt ${attempt + 1} — will retry`);
      await appendRuntimeAction(projectId, 'verify', `Auto-fix could not apply (attempt ${attempt + 1})`, {
        status: 'failed',
        error: 'AI returned no valid fix — will retry',
      }).catch(() => {});
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
  const maxWaitMs = 30000; // 30s max — server should already be warm from warmProject()
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
      // qa-agent.js = functional + visual AI analysis; e2e-check.js = functional only (fallback)
      const qaAgentExists = await workspaceService.exec(projectId, userId,
        'test -f /usr/local/bin/qa-agent.js && echo "yes" || echo "no"'
      ).then(r => (r.stdout || '').trim() === 'yes').catch(() => false);

      const verifyScript = qaAgentExists
        ? 'NODE_PATH=/usr/local/lib/node_modules timeout 90 node /usr/local/bin/qa-agent.js 2>/tmp/qa-stderr.txt'
        : 'NODE_PATH=/usr/local/lib/node_modules timeout 60 node /usr/local/bin/e2e-check.js 2>/tmp/e2e-stderr.txt';

      if (qaAgentExists) log.info(`[Verify] Using qa-agent.js (90s timeout)`);

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
            'NODE_PATH=/usr/local/lib/node_modules timeout 60 node /usr/local/bin/e2e-check.js 2>/tmp/e2e-stderr.txt'
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
      // Next.js dev error overlay in HTML
      { test: '__next_error__', msg: 'Next.js error overlay detected' },
      { test: 'nextjs-portal', msg: 'Next.js error portal rendered' },
      { test: '__webpack_modules__', msg: 'Webpack runtime error in page HTML' },
    ];
    for (const { test, msg } of bodyChecks) {
      if (htmlBody.includes(test) && !errors.some(e => e.includes(msg))) {
        errors.push(msg);
      }
    }
  }

  // 5. Multi-route verification — force webpack to compile every generated
  // route. Catches compile errors that only surface when a specific page is
  // requested (not just the homepage).
  if (httpCode === '200' || httpCode === '500') {
    try {
      const routes = await enumerateRoutes(projectId, userId);
      if (routes.length > 1) {
        log.info(`[Verify] Checking ${routes.length} routes: ${routes.slice(0, 10).join(', ')}`);
        for (const route of routes) {
          if (route === '/') continue; // already checked
          try {
            const r = await workspaceService.exec(projectId, userId,
              `curl -s -w "\\n%{http_code}" "http://localhost:3000${route}" 2>/dev/null || echo "\\n000"`
            );
            const rLines = (r.stdout || '').split('\n');
            const code = rLines[rLines.length - 1]?.trim() || '000';
            const body = rLines.slice(0, -1).join('\n');

            if (code === '500') {
              const errMatch = body.match(/(?:Error|error)[:\s]([^\n<]{10,200})/);
              errors.push(`[route ${route}] ${errMatch ? errMatch[0] : 'HTTP 500'}`);
            } else if (code === '404') {
              errors.push(`[route ${route}] HTTP 404 — route declared but page missing`);
            } else if (code === '200') {
              // Check for error overlay / empty root in this route's HTML
              if (body.includes('__next_error__') || body.includes('nextjs-portal') || body.includes('__webpack_modules__')) {
                errors.push(`[route ${route}] Error overlay rendered in HTML`);
              }
              if (body.includes('<div id="root"></div>') || body.includes('<div id="__next"></div>')) {
                errors.push(`[route ${route}] Empty root div — no SSR content`);
              }
            }
          } catch { /* skip unreachable routes */ }
          // Small delay between fetches to avoid overwhelming dev server compile queue
          await new Promise(r => setTimeout(r, 200));
        }
      }

      // Settle wait — let async compilation errors land in the log buffer
      await new Promise(r => setTimeout(r, 2000));

      // Re-read log buffer after all fetches to catch async errors
      const settleLog = await workspaceService.exec(projectId, userId,
        'cat /home/coder/server.log 2>/dev/null | tail -150'
      );
      const settleErrors = extractLogErrors(settleLog.stdout || '');
      for (const e of settleErrors) {
        if (!errors.some(ex => ex.includes(e.substring(0, 40)))) errors.push(e);
      }
    } catch (routeErr: any) {
      log.warn(`[Verify] Multi-route check failed: ${routeErr.message}`);
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

/**
 * Enumerate all routes declared in the generated project.
 * Next.js: scan app folder recursively for page.tsx files.
 * React/Vite: parse App.tsx for Route path entries.
 * Returns deduped list, always includes the root path.
 */
async function enumerateRoutes(projectId: string, userId: string): Promise<string[]> {
  const routes = new Set<string>(['/']);
  try {
    // Next.js app router: find page files
    const nextPages = await workspaceService.exec(projectId, userId,
      `find /home/coder/project/app \\( -name 'page.tsx' -o -name 'page.jsx' -o -name 'page.ts' -o -name 'page.js' \\) 2>/dev/null | head -30`
    );
    for (const line of (nextPages.stdout || '').split('\n').filter(Boolean)) {
      // Strip /home/coder/project/app prefix and /page.tsx suffix → route path
      const route = line
        .replace('/home/coder/project/app', '')
        .replace(/\/page\.[tj]sx?$/, '')
        .replace(/\([^)]+\)\//g, '')           // strip route groups (auth)/...
        .replace(/\[([^\]]+)\]/g, '__PARAM__'); // placeholder for dynamic segments
      // Skip routes with dynamic segments (can't fetch without real data)
      if (route.includes('__PARAM__')) continue;
      if (route === '') routes.add('/');
      else routes.add(route);
    }

    // React/Vite: parse App.tsx for <Route path="...">
    const appFiles = ['src/App.tsx', 'src/App.jsx', 'src/app.tsx'];
    for (const f of appFiles) {
      try {
        const content = await workspaceService.exec(projectId, userId, `cat /home/coder/project/${f} 2>/dev/null`);
        const routeMatches = (content.stdout || '').matchAll(/<Route\s+path=["']([^"']+)["']/g);
        for (const m of routeMatches) {
          const p = m[1];
          if (p && !p.includes(':') && !p.includes('*')) routes.add(p.startsWith('/') ? p : `/${p}`);
        }
      } catch { /* skip */ }
    }
  } catch {}
  return Array.from(routes).slice(0, 20); // cap to 20 routes
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
    // Webpack runtime errors — usually caused by stale .next cache or HMR corruption
    /__webpack_modules__\[[^\]]+\] is not a function/g,
    /__webpack_require__\([^)]+\) is not a function/g,
    /Loading chunk \d+ failed[^\n]*/g,
    /ChunkLoadError[^\n]*/g,
    // Next.js specific
    /Cannot find module '\.\/\d+\.js'/g,
    /Cannot find module ['"]?.*vendor-chunks[^\n]*/g,
    /ENOENT[^\n]*routes-manifest\.json/g,
    /ENOENT[^\n]*middleware-manifest\.json/g,
    /next\/dist\/compiled\/[^\s'"]+' not found/g,
    // React runtime errors
    /Warning:\s*(Each child[^\n]*|React has detected[^\n]*)/g,
    /Objects are not valid as a React child[^\n]*/g,
    // Async errors that bubble up via SSE
    /Unhandled Runtime Error[^\n]*/g,
    /unhandledRejection[^\n]*/g,
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

    // For navigation errors, dead clicks, route failures, OR module resolution errors:
    // read all pages + state. Module errors rarely have file paths in them, so we
    // need to load everything to give the AI enough context.
    const hasNavErrors = result.errors.some(e => e.includes('[nav]'));
    const hasDeadClicks = result.errors.some(e => e.includes('Dead interactive element'));
    const hasRouteErrors = result.errors.some(e => e.match(/\[route \//));
    const hasModuleErrors = result.errors.some(e =>
      /Can't resolve|Cannot find module|Module not found|Module not resolved|next\/dist\/pages|next-flight-client-entry-loader/.test(e)
    );
    const hasRedirectErrors = result.errors.some(e => /redirect.*loop|redirect.*back to/i.test(e));

    // For redirect loops: load middleware.ts (common auth guard source) + involved pages
    if (hasRedirectErrors) {
      for (const f of ['middleware.ts', 'middleware.js']) {
        if (brokenFiles.some(bf => bf.path === f)) continue;
        try {
          const r = await workspaceService.exec(projectId, userId, `cat /home/coder/project/${f} 2>/dev/null`);
          if (r.stdout) brokenFiles.push({ path: f, content: r.stdout });
        } catch {}
      }
      // Extract page name from redirect error and load that page
      for (const err of result.errors) {
        const redirectMatch = err.match(/redirect.*(?:loop|back to).*\/([\w-]+)/i);
        if (redirectMatch) {
          const page = redirectMatch[1];
          for (const p of [`app/${page}/page.tsx`, `app/${page}/page.jsx`, `app/(${page})/page.tsx`]) {
            if (brokenFiles.some(f => f.path === p)) continue;
            try {
              const r = await workspaceService.exec(projectId, userId, `cat /home/coder/project/${p} 2>/dev/null`);
              if (r.stdout) { brokenFiles.push({ path: p, content: r.stdout }); break; }
            } catch {}
          }
        }
      }
    }

    // Extract module specifiers from "Can't resolve 'X'" errors and grep-find
    // which files are importing them — those files need the fix.
    for (const err of result.errors) {
      const specMatch = err.match(/Can't resolve ['"]([^'"]+)['"]|Cannot find module ['"]([^'"]+)['"]/);
      const spec = specMatch?.[1] || specMatch?.[2];
      if (!spec) continue;
      try {
        // Escape regex meta-chars in the spec for safe grep
        const safeSpec = spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const grep = await workspaceService.exec(projectId, userId,
          `grep -rln --include='*.tsx' --include='*.ts' --include='*.jsx' --include='*.js' ${shellEscape(safeSpec)} /home/coder/project/app /home/coder/project/src /home/coder/project/components 2>/dev/null | head -5`
        );
        for (const line of (grep.stdout || '').split('\n').filter(Boolean)) {
          const relPath = line.replace('/home/coder/project/', '');
          if (PROTECTED_FILES.has(relPath) || brokenFiles.some(f => f.path === relPath)) continue;
          try {
            const content = await workspaceService.exec(projectId, userId, `cat ${shellEscape(line)} 2>/dev/null`);
            if (content.stdout) brokenFiles.push({ path: relPath, content: content.stdout });
          } catch {}
        }
      } catch {}
    }
    // Also try to pull specific files referenced by [route /xxx] errors
    for (const err of result.errors) {
      const routeMatch = err.match(/\[route (\/[a-zA-Z0-9_/-]*)\]/);
      if (routeMatch) {
        const route = routeMatch[1];
        const candidates = route === '/'
          ? ['app/page.tsx', 'app/page.jsx', 'src/pages/Index.tsx', 'src/App.tsx']
          : [`app${route}/page.tsx`, `app${route}/page.jsx`, `src/pages${route}.tsx`, `src/pages${route}/index.tsx`];
        for (const cand of candidates) {
          if (brokenFiles.some(f => f.path === cand)) continue;
          try {
            const content = await workspaceService.exec(projectId, userId, `cat ${shellEscape(`/home/coder/project/${cand}`)} 2>/dev/null`);
            if (content.stdout) {
              brokenFiles.push({ path: cand, content: content.stdout });
              break;
            }
          } catch {}
        }
      }
    }
    if (hasNavErrors || hasDeadClicks || hasRouteErrors || hasModuleErrors) {
      // Read all page/component files to understand navigation flow + wiring
      try {
        const findResult = await workspaceService.exec(projectId, userId,
          'find /home/coder/project \( -path "*/node_modules" -o -path "*/.next" \) -prune -o \( -name "page.tsx" -o -name "page.jsx" -o -name "App.tsx" \) -print 2>/dev/null | head -20; find /home/coder/project/src/pages /home/coder/project/src/components 2>/dev/null -name "*.tsx" | head -20'
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
- For "Dead interactive element" / "nothing happened" errors: the button/link has no working handler. RULE: every visible clickable element MUST do something visible when tapped. Fixes:
  • Empty or missing onClick → add a real handler: useState toggle, router.push(), open modal via state, show toast, filter/sort state update
  • Link to nonexistent route → EITHER create the destination page file OR change the link to a real route
  • Card/div with cursor-pointer → add onClick that navigates or opens details
  • Icon button (heart/star/share/bell) → toggle local state, show toast, or open a panel
  • Tab/nav item → use router.push() or setActiveTab state
  NEVER leave onClick={() => {}} or onClick={()=>console.log()} — if you can't wire it, REMOVE the element from JSX entirely
- The error message format is: "Dead interactive element: <type> \"<text>\" on page <path> — ..." — read that page file and FIX the specific element by its text label
- For redirect loops (page X redirects to page Y): the guard/redirect logic doesn't persist state. Fix by using localStorage or cookies to persist auth/profile state across navigations, not just React state
- For "[route /xxx] HTTP 500" or "[route /xxx] Module not found": a sub-route page is broken. Common fix: the relative import path is wrong. If app/page.tsx uses './components/ui/button' (works from root), app/contatti/page.tsx needs '../components/ui/button' (go up one level) OR use the absolute alias '@/components/ui/button'. PREFER absolute imports with @/ for all pages — never mix relative paths across directory depths.
- For "FiCalendar is not defined" or any icon ReferenceError: the JSX uses a react-icons component that isn't in the import statement. Add it to the import: import { FiArrowRight, FiCalendar, ... } from 'react-icons/fi'
- For "Can't resolve '@/lib/store'" or similar missing user module: EITHER create the missing file (e.g., lib/store.ts with a proper zustand/context store) OR remove the import and inline the state with useState. Pick the simpler option.
- For "Can't resolve 'next/dist/pages/_app'" or any 'next/dist/pages/*' import: this is PAGES ROUTER syntax in an APP ROUTER project. REMOVE the import entirely. App router has no _app.tsx — use app/layout.tsx instead. If user code imports App from next/dist/pages/_app, delete that line and replace it with whatever the code actually needs from app/layout.tsx.
- For "Can't resolve 'next-flight-client-entry-loader'" or similar next.js internal loader errors: the project has a corrupt .next cache or invalid webpack config. The fix is NOT in user code — trust the backend to handle it via cache clear. DO NOT modify next.config.ts or webpack config. Instead, check if any user file imports from 'next/dist/build' or 'next/dist/compiled' — remove those imports.
- For 'use client' errors or "React hook used in server component": add 'use client' at the top of the file (line 1, before all imports).
- For JSON.parse SyntaxError "Unexpected end of JSON input": code is calling JSON.parse(localStorage.getItem('x')) without a fallback. The value is null or empty. Fix: JSON.parse(localStorage.getItem('x') || '[]') or JSON.parse(localStorage.getItem('x') || '{}'). Always provide a default for JSON.parse on localStorage/sessionStorage/fetch results.
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
      if (typeof chunk === 'string') fixText += chunk;
      else if (chunk.type === 'text' && chunk.text) fixText += chunk.text;
    }

    // Strip markdown fences if present
    let cleanJson = fixText.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const fixMatch = cleanJson.match(/\[[\s\S]*\]/);
    if (!fixMatch) {
      log.warn(`[Verify] AI returned no valid JSON (${fixText.length} chars): ${fixText.substring(0, 200)}`);
      return { applied: false, filesModified: [], duration: Date.now() - fixStartTime };
    }

    let fixes: { path: string; content: string }[];
    try {
      fixes = JSON.parse(fixMatch[0]);
    } catch (parseErr: any) {
      // AI sometimes returns JSON with unescaped control characters in file content
      // Try to recover by escaping literal newlines/tabs inside string values
      log.warn(`[Verify] JSON parse failed, attempting recovery: ${parseErr.message}`);
      try {
        // Replace literal control chars inside JSON strings (but not the structural ones)
        const recovered = fixMatch[0]
          .replace(/(?<=:\s*"(?:[^"\\]|\\.)*)(\r?\n)(?=(?:[^"\\]|\\.)*")/g, '\\n')
          .replace(/(?<=:\s*"(?:[^"\\]|\\.)*)(\t)/g, '\\t');
        fixes = JSON.parse(recovered);
      } catch {
        log.warn(`[Verify] JSON recovery also failed`);
        return { applied: false, filesModified: [], duration: Date.now() - fixStartTime };
      }
    }
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

// ── CSS Pipeline Repair ────────────────────────────────────────────────────

async function repairCSSPipeline(projectId: string, userId: string, technology: string): Promise<void> {
  if (technology !== 'nextjs') return; // Only Next.js needs this — React/Vue use CDN fallback

  // 1. Ensure globals.css exists and has Tailwind directives
  try {
    const globalsResult = await workspaceService.exec(projectId, userId, 'cat /home/coder/project/app/globals.css 2>/dev/null');
    const globals = globalsResult.stdout || '';
    if (!globals.includes('@tailwind') && !globals.includes('@import "tailwindcss"')) {
      log.info(`[CSS Repair] globals.css missing Tailwind directives — injecting`);
      const fixed = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n${globals}`;
      await fileService.writeFile(projectId, 'app/globals.css', fixed);
    }
  } catch {}

  // 2. Ensure layout.tsx imports globals.css
  try {
    const layoutResult = await workspaceService.exec(projectId, userId, 'cat /home/coder/project/app/layout.tsx 2>/dev/null');
    const layout = layoutResult.stdout || '';
    if (layout && !layout.includes('globals.css') && !layout.includes('global.css')) {
      log.info(`[CSS Repair] layout.tsx missing globals.css import — injecting`);
      const fixed = "import './globals.css';\n" + layout;
      await fileService.writeFile(projectId, 'app/layout.tsx', fixed);
    }
    // Remove CDN script if present (production build handles CSS)
    if (layout.includes('cdn.tailwindcss.com')) {
      log.info(`[CSS Repair] Removing CDN from layout.tsx`);
      let cleaned = layout
        .replace(/.*cdn\.tailwindcss\.com.*\n?/g, '')
        .replace(/import Script from ['"]next\/script['"];?\n?/g, '');
      await fileService.writeFile(projectId, 'app/layout.tsx', cleaned);
    }
  } catch {}

  // 3. Ensure postcss.config exists
  try {
    const pcResult = await workspaceService.exec(projectId, userId,
      'test -f /home/coder/project/postcss.config.mjs -o -f /home/coder/project/postcss.config.js && echo "exists" || echo "missing"'
    );
    if ((pcResult.stdout || '').trim() === 'missing') {
      log.info(`[CSS Repair] postcss.config.mjs missing — creating`);
      await fileService.writeFile(projectId, 'postcss.config.mjs',
        'const config = {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\nexport default config;\n');
    }
  } catch {}

  // 4. Ensure tailwind.config exists
  try {
    const twResult = await workspaceService.exec(projectId, userId,
      'test -f /home/coder/project/tailwind.config.ts -o -f /home/coder/project/tailwind.config.js && echo "exists" || echo "missing"'
    );
    if ((twResult.stdout || '').trim() === 'missing') {
      log.info(`[CSS Repair] tailwind.config.ts missing — creating`);
      await fileService.writeFile(projectId, 'tailwind.config.ts',
        `import type { Config } from "tailwindcss";\n\nconst config: Config = {\n  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],\n  theme: { extend: {} },\n  plugins: [],\n};\nexport default config;\n`);
    }
  } catch {}

  log.info(`[CSS Repair] Pipeline check complete for ${projectId}`);
}

// ── Restart dev server ──────────────────────────────────────────────────────

async function restartDevServer(projectId: string, userId: string): Promise<void> {
  try {
    // Kill existing server processes — next dev picks up changes via HMR,
    // but a full restart ensures clean state after fix attempts
    await workspaceService.exec(projectId, userId,
      'pkill -f "next\\|vite\\|astro\\|expo" 2>/dev/null; sleep 2'
    );
    const warmTimeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('restart timeout')), 120000)
    );
    await Promise.race([workspaceService.warmProject(projectId, userId), warmTimeout]);
  } catch (err: any) {
    log.warn(`[Verify] Dev server restart failed: ${err.message}`);
  }
}
