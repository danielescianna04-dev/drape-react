/**
 * Single verify pass: wait for the server, run qa-agent.js or e2e-check.js
 * inside the container, parse the result, and enumerate/poke additional
 * routes to surface compile errors that only show up on deeper pages.
 *
 * Returns a VerifyResult that the outer orchestrator uses to decide whether
 * to auto-fix or stop.
 */

import { log } from '../../utils/logger';
import { workspaceService } from '../workspace.service';
import type { VerifyResult, VerifyRunOptions } from './types';
import {
  extractLogErrors,
  hasActionableFastErrors,
  shouldFallbackToQaForSimpleProject,
} from './error-classifier';
import { MAX_SERVER_ERROR_TAIL_LINES, waitForServerReady } from './server-wait';
import { readDeclared, extractTableRefsFromCode, findUnusedDeclaredTables } from '../drape-cloud/declared-tables.service';

const QA_AGENT_TIMEOUT_SEC = 45;
const E2E_TIMEOUT_SEC = 25;
const MAX_ROUTE_ENUMERATION = 12;
const ROUTE_FETCH_DELAY_MS = 120;
const ROUTE_SETTLE_DELAY_MS = 1000;
const MAX_ROUTE_SETTLE_TAIL_LINES = 80;

let cachedQaAgentAvailability: boolean | null = null;

export async function verify(projectId: string, userId: string, options: VerifyRunOptions): Promise<VerifyResult> {
  const errors: string[] = [];
  const screenshots = new Map<string, string>();
  let pages: VerifyResult['pages'];
  let navigation: VerifyResult['navigation'];
  let qaReport: VerifyResult['qaReport'];

  // 1. Wait for server to be ACTUALLY ready — event-based, not time-based.
  const serverWait = await waitForServerReady(projectId, userId);
  let { httpCode, htmlBody } = serverWait;

  if (!serverWait.reachable) {
    for (const e of serverWait.crashErrors) errors.push(e);
    return { passed: false, errors, screenshots, serverLog: '', pages: undefined, navigation: undefined };
  }
  if (httpCode === '500') {
    const errMatch = htmlBody.match(/(?:Error|error)[:\s]([^\n<]{10,200})/);
    errors.push(errMatch ? errMatch[0] : 'Server returned HTTP 500');
  }

  // 2. Read server logs for errors
  const logsResult = await workspaceService.exec(
    projectId,
    userId,
    `cat /home/coder/server.log 2>/dev/null | tail -${MAX_SERVER_ERROR_TAIL_LINES}`,
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
      const qaAgentExists = cachedQaAgentAvailability ?? await workspaceService.exec(
        projectId,
        userId,
        'test -f /usr/local/bin/qa-agent.js && echo "yes" || echo "no"',
      ).then(r => (r.stdout || '').trim() === 'yes').catch(() => false);
      cachedQaAgentAvailability = qaAgentExists;

      const qaScript = `NODE_PATH=/usr/local/lib/node_modules timeout ${QA_AGENT_TIMEOUT_SEC} node /usr/local/bin/qa-agent.js 2>/tmp/qa-stderr.txt`;
      const e2eScript = `NODE_PATH=/usr/local/lib/node_modules timeout ${E2E_TIMEOUT_SEC} node /usr/local/bin/e2e-check.js 2>/tmp/e2e-stderr.txt`;
      const shouldStartWithQa = qaAgentExists && options.preferQaAgent;
      const verifyScript = shouldStartWithQa ? qaScript : e2eScript;

      log.info(
        `[Verify] Using ${shouldStartWithQa ? 'qa-agent.js' : 'e2e-check.js'} (${shouldStartWithQa ? QA_AGENT_TIMEOUT_SEC : E2E_TIMEOUT_SEC}s timeout)`,
      );

      let e2eResult: any = { stdout: '', exitCode: -1 };
      let usedQaAgent = shouldStartWithQa;

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
          e2eResult = await workspaceService.exec(projectId, userId, e2eScript);
        } catch (fallbackErr: any) {
          log.warn(`[Verify] e2e-check.js fallback also failed: ${fallbackErr.message?.substring(0, 80)}`);
          e2eResult = { stdout: '' };
        }
      }

      let parsedVerification: any | null = null;
      const e2eRaw = (e2eResult.stdout || '').trim();
      if (e2eRaw && e2eRaw.startsWith('{')) {
        parsedVerification = JSON.parse(e2eRaw);
      } else {
        log.warn(`[Verify] Verification script produced no valid output (${e2eRaw.length} chars)`);
        if (!usedQaAgent && qaAgentExists && options.allowQaFallback) {
          log.warn('[Verify] e2e-check.js returned no valid output for simple verification — escalating once to qa-agent.js');
          try {
            const qaFallbackResult = await workspaceService.exec(projectId, userId, qaScript);
            const qaFallbackRaw = (qaFallbackResult.stdout || '').trim();
            if (qaFallbackRaw.startsWith('{')) {
              e2eResult = qaFallbackResult;
              usedQaAgent = true;
              parsedVerification = JSON.parse(qaFallbackRaw);
            }
          } catch (qaFallbackErr: any) {
            log.warn(`[Verify] qa-agent.js fallback also failed: ${qaFallbackErr.message?.substring(0, 80)}`);
          }
        }
      }

      if (!parsedVerification) {
        errors.push('E2E verification failed — could not analyze pages');
      } else {
        let e2e = parsedVerification;

        if (!usedQaAgent && qaAgentExists && options.allowQaFallback && shouldFallbackToQaForSimpleProject(e2e)) {
          log.info('[Verify] Simple project failed lightweight verification without enough confidence — running qa-agent.js once');
          try {
            const qaFallbackResult = await workspaceService.exec(projectId, userId, qaScript);
            const qaFallbackRaw = (qaFallbackResult.stdout || '').trim();
            if (qaFallbackRaw.startsWith('{')) {
              e2eResult = qaFallbackResult;
              usedQaAgent = true;
              e2e = JSON.parse(qaFallbackRaw);
            }
          } catch (qaFallbackErr: any) {
            log.warn(`[Verify] qa-agent.js fallback failed after e2e-check.js failure: ${qaFallbackErr.message?.substring(0, 80)}`);
          }
        }

        // Read full results (with screenshots) from bind-mounted file
        // qa-agent.js writes to qa-report.json; e2e-check.js writes to e2e-results.json
        try {
          const { config: appConfig } = require('../../config');
          const resultFile = usedQaAgent ? 'qa-report.json' : 'e2e-results.json';
          const fullResultPath = require('path').join(
            appConfig.projectsRoot, projectId, '.drape', resultFile,
          );
          if (require('fs').existsSync(fullResultPath)) {
            const fullData = require('fs').readFileSync(fullResultPath, 'utf8');
            const fullE2e = JSON.parse(fullData);
            // qa-report.json stores pages/navigation inside attempts; e2e-results.json at top level
            if (usedQaAgent && fullE2e.attempts?.length > 0) {
              const last = fullE2e.attempts[fullE2e.attempts.length - 1];
              if (last.pages && !e2e.pages?.length) e2e.pages = last.pages;
              if (last.clicks && !e2e.navigation?.length) e2e.navigation = last.clicks;
              // Surface Gemini Vision issues so the backend auto-fix prompt can see them.
              // qa-agent no longer self-heals — these issues would otherwise be ignored.
              if (Array.isArray(last.visualAnalysis) && last.visualAnalysis.length > 0) {
                const visualErrors = last.visualAnalysis
                  .filter((v: any) => v?.severity === 'critical' || v?.severity === 'high')
                  .slice(0, 6)
                  .map((v: any) => {
                    const where = v.page ? ` on ${v.page}` : '';
                    const hint = v.suggestion ? ` — ${v.suggestion}` : '';
                    return `[visual] ${v.description || 'visual issue'}${where}${hint}`;
                  });
                if (!Array.isArray(e2e.errors)) e2e.errors = [];
                for (const ve of visualErrors) {
                  if (!e2e.errors.some((ex: string) => ex.startsWith(ve.substring(0, 40)))) {
                    e2e.errors.push(ve);
                  }
                }
                // qa-agent reports "verified" only when there are no blocking issues,
                // but we still want to auto-fix visual-only regressions when they appear
                // as critical/high — so flip passed=false if visual errors were surfaced.
                if (visualErrors.length > 0 && e2e.passed !== false) {
                  e2e.passed = false;
                }
                log.info(`[Verify] Promoted ${visualErrors.length} visual issue(s) to auto-fix queue`);
              }
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
          const ssResult = await workspaceService.exec(
            projectId,
            userId,
            'timeout 25 node /usr/local/bin/screenshot.js 2>/tmp/ss-err.txt',
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

  const shouldSkipDeepVerification =
    hasActionableFastErrors(errors) &&
    !errors.some(error => /\[nav\]/i.test(error));

  if (shouldSkipDeepVerification) {
    log.info(
      `[Verify] Skipping deep QA for ${projectId} — fast diagnostics already found concrete errors: ${errors.slice(0, 3).join('; ')}`,
    );
    if (httpCode === '200') {
      try {
        const ssResult = await workspaceService.exec(
          projectId,
          userId,
          'timeout 12 node /usr/local/bin/screenshot.js 2>/tmp/ss-err.txt',
        );
        const ss = (ssResult.stdout || '').trim();
        if (ss) screenshots.set('/', ss);
      } catch {}
    }
    return { passed: false, errors, screenshots, serverLog, pages: undefined, navigation: undefined };
  }

  // 5. Multi-route verification — force webpack to compile every generated
  // route. Catches compile errors that only surface when a specific page is
  // requested (not just the homepage).
  const hasEnoughConcreteErrors =
    errors.length >= 2 ||
    errors.some(e => /\[nav\]|\[route |Server returned HTTP 500|Application error|Unhandled runtime error|Next\.js error overlay|Module resolution error/i.test(e));

  if ((httpCode === '200' || httpCode === '500') && !hasEnoughConcreteErrors) {
    try {
      const routes = await enumerateRoutes(projectId, userId);
      if (routes.length > 1) {
        log.info(`[Verify] Checking ${routes.length} routes: ${routes.slice(0, 10).join(', ')}`);
        for (const route of routes) {
          if (route === '/') continue; // already checked
          try {
            const r = await workspaceService.exec(
              projectId,
              userId,
              `curl -s -w "\\n%{http_code}" "http://localhost:3000${route}" 2>/dev/null || echo "\\n000"`,
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
          await new Promise(r => setTimeout(r, ROUTE_FETCH_DELAY_MS));
        }
      }

      // Settle wait — let async compilation errors land in the log buffer
      await new Promise(r => setTimeout(r, ROUTE_SETTLE_DELAY_MS));

      // Re-read log buffer after all fetches to catch async errors
      const settleLog = await workspaceService.exec(
        projectId,
        userId,
        `cat /home/coder/server.log 2>/dev/null | tail -${MAX_ROUTE_SETTLE_TAIL_LINES}`,
      );
      const settleErrors = extractLogErrors(settleLog.stdout || '');
      for (const e of settleErrors) {
        if (!errors.some(ex => ex.includes(e.substring(0, 40)))) errors.push(e);
      }
    } catch (routeErr: any) {
      log.warn(`[Verify] Multi-route check failed: ${routeErr.message}`);
    }
  } else if (httpCode === '200' || httpCode === '500') {
    log.info(`[Verify] Skipping multi-route verification for ${projectId} — enough concrete errors already collected`);
  }

  // QA Agent is the source of truth: if qaReport says not verified, mark as failed
  // even if errors array is empty (e.g. visual-only issues don't add to errors[])
  let passed = errors.length === 0;
  if (qaReport && qaReport.status !== 'verified') {
    passed = false;
    if (errors.length === 0) {
      // Prefer the fatalError string when qa-agent crashed — it names the
      // actual failure (Puppeteer launch fail, Chromium OOM, etc.) so the
      // auto-fix model can react to it instead of looping on a generic
      // "issues=0" message.
      const fatal = (qaReport as any).fatalError;
      if (qaReport.status === 'error' && typeof fatal === 'string' && fatal.trim()) {
        errors.push(`QA agent fatal error: ${fatal.trim()}`);
      } else {
        errors.push(`QA verification failed: status=${qaReport.status}, issues=${qaReport.totalIssues || 0}`);
      }
    }
  }

  // Drape Cloud post-check: log (but don't fail) when declared tables
  // have no `drape.table('name')` reference. The feature-to-tables
  // baseline is keyword-driven and overshoots by design; QA already
  // catches real missing features via navigation + content checks.
  try {
    const declared = await readDeclared(projectId);
    if (declared.tables.length > 0) {
      const grep = await workspaceService.exec(
        projectId,
        userId,
        `grep -rEho "drape\\.table[^)]*" /home/coder/project/app /home/coder/project/src /home/coder/project/lib 2>/dev/null | head -200`,
      );
      const refs: string[] = [];
      for (const line of (grep.stdout || '').split('\n')) {
        for (const ref of extractTableRefsFromCode(line)) refs.push(ref);
      }
      const unused = findUnusedDeclaredTables(declared.tables, refs);
      if (unused.length > 0) {
        log.info(`[Verify] data-model: declared but unused tables: ${unused.join(', ')}`);
      }
    }
  } catch (err: any) {
    log.warn(`[Verify] data-model post-check failed: ${err?.message || err}`);
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
    const nextPages = await workspaceService.exec(
      projectId,
      userId,
      `find /home/coder/project/app \\( -name 'page.tsx' -o -name 'page.jsx' -o -name 'page.ts' -o -name 'page.js' \\) 2>/dev/null | head -30`,
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
  return Array.from(routes).slice(0, MAX_ROUTE_ENUMERATION);
}
