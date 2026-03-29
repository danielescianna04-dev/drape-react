# Project Creation Pipeline Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract verification into a single `verifyProject` service that uses Puppeteer as source of truth, ensure it always runs, and gate the preview behind it.

**Architecture:** Create `verify-project.service.ts` containing all verification + auto-fix logic. Replace the 200-line inline BuildCheck in `workstation.routes.ts` with a single function call. The service runs Puppeteer E2E inside the container, collects all errors, auto-fixes via AI, and returns pass/fail.

**Tech Stack:** Node.js/TypeScript, Puppeteer (in container), Gemini AI for auto-fix

---

### Task 1: Create `verify-project.service.ts` — verification function

**Files:**
- Create: `backend-ts/src/services/verify-project.service.ts`

This is the core of the refactor — a single function that answers "is this project working?"

- [ ] **Step 1: Create the service file with types and skeleton**

```typescript
// backend-ts/src/services/verify-project.service.ts
import { log } from '../utils/logger';
import { workspaceService } from './workspace.service';
import { fileService } from './file.service';
import { aiProviderService } from './ai-provider.service';

export interface VerifyResult {
  passed: boolean;
  errors: string[];
  screenshots: Map<string, string>; // page path → base64 screenshot
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

    // Wait for server to compile (longer on first attempt)
    await new Promise(r => setTimeout(r, isRetry ? 3000 : 5000));

    const result = await verify(projectId, userId);

    if (result.passed) {
      log.info(`[Verify] Project ${projectId} passed on attempt ${attempt + 1}`);
      onProgress?.(98, 'Preview verified!', 'Verified');
      return result;
    }

    log.info(`[Verify] Project ${projectId} failed on attempt ${attempt + 1}: ${result.errors.length} errors`);

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

  // Should not reach here, but satisfy TypeScript
  return { passed: false, errors: ['Max attempts exhausted'], screenshots: new Map(), serverLog: '' };
}
```

- [ ] **Step 2: Implement the `verify` function**

```typescript
async function verify(projectId: string, userId: string): Promise<VerifyResult> {
  const errors: string[] = [];
  const screenshots = new Map<string, string>();

  // 1. Server health check
  const curlResult = await workspaceService.exec(projectId, userId,
    'curl -s -w "\\n%{http_code}" http://localhost:3000 2>/dev/null || echo "\\n000"'
  );
  const curlLines = (curlResult.stdout || '').split('\n');
  const httpCode = curlLines[curlLines.length - 1]?.trim() || '000';
  const htmlBody = curlLines.slice(0, -1).join('\n');

  if (httpCode === '000') {
    errors.push('Server not running — HTTP 000');
  } else if (httpCode === '500') {
    // Extract error from response body
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

      // Collect screenshots from E2E pages (if available)
      if (e2e.pages) {
        for (const page of e2e.pages) {
          if (page.screenshot) screenshots.set(page.path, page.screenshot);
        }
      }
    } catch (e2eErr: any) {
      log.warn(`[Verify] E2E check failed: ${e2eErr.message}`);
      // If E2E crashes but server returns 200 with content, still try screenshot
      if (httpCode === '200') {
        try {
          const ssResult = await workspaceService.exec(projectId, userId,
            'timeout 25 node /usr/local/bin/screenshot.js 2>/tmp/ss-err.txt'
          );
          const ss = (ssResult.stdout || '').trim();
          if (ss) {
            screenshots.set('/', ss);
            // Check if blank
            if (ss.length < 7000) errors.push('Page renders as blank/white screen');
          }
          // Read Puppeteer JS errors
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

  // Check HTML body for error indicators
  if (httpCode === '200') {
    const bodyErrors = [
      { test: "Can't resolve", msg: "Module resolution error in page" },
      { test: 'CssSyntaxError', msg: 'CSS syntax error' },
      { test: 'Application error', msg: 'Application error on page' },
      { test: 'Internal Server Error', msg: 'Internal server error' },
    ];
    for (const { test, msg } of bodyErrors) {
      if (htmlBody.includes(test) && !errors.some(e => e.includes(msg))) {
        errors.push(msg);
      }
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    screenshots,
    serverLog,
  };
}
```

- [ ] **Step 3: Implement `extractLogErrors` helper**

```typescript
function extractLogErrors(log: string): string[] {
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
    while ((m = pattern.exec(log)) !== null) {
      const err = (m[1] || m[0]).trim();
      if (err.length > 10 && !errors.some(e => e.includes(err.substring(0, 40))) && errors.length < 10) {
        errors.push(err);
      }
    }
  }

  return errors;
}
```

- [ ] **Step 4: Implement `autoFix` function**

```typescript
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
        if (PROTECTED_FILES.has(relPath)) continue; // Don't read protected files for fixing
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
      e.includes('blank') || e.includes('white') || e.includes('CSS') || e.includes('styles')
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
    for await (const chunk of fixStream) { fixText += chunk; }

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
```

- [ ] **Step 5: Implement `restartDevServer` helper**

```typescript
async function restartDevServer(projectId: string, userId: string): Promise<void> {
  try {
    await workspaceService.exec(projectId, userId,
      'pkill -f "next dev\\|vite\\|astro\\|expo" 2>/dev/null; sleep 2'
    );
    await workspaceService.warmProject(projectId, userId);
  } catch (err: any) {
    log.warn(`[Verify] Dev server restart failed: ${err.message}`);
  }
}
```

- [ ] **Step 6: Build and verify compilation**

Run: `cd backend-ts && npm run build`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add backend-ts/src/services/verify-project.service.ts
git commit -m "feat: create verify-project service — single source of truth for project verification"
```

---

### Task 2: Replace inline BuildCheck in `workstation.routes.ts`

**Files:**
- Modify: `backend-ts/src/routes/workstation.routes.ts:1660-1908`

Replace ~200 lines of inline BuildCheck + auto-fix with a single function call.

- [ ] **Step 1: Add import at the top of workstation.routes.ts**

Find the imports section (around line 1-15) and add:

```typescript
import { verifyAndFixProject } from '../services/verify-project.service';
```

- [ ] **Step 2: Replace the warmProject + BuildCheck block**

Replace everything from the `// Pre-warm` comment (line ~1660) through the end of the BuildCheck loop (line ~1908) with:

```typescript
    // Pre-warm: create container + install deps + start dev server
    update(91, 'Installing dependencies...', 'Building');
    for (let warmAttempt = 0; warmAttempt < 3; warmAttempt++) {
      try {
        const warmTimeout = new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('warmProject timeout (90s)')), 90000)
        );
        await Promise.race([workspaceService.warmProject(projectId, userId), warmTimeout]);
        break;
      } catch (warmErr: any) {
        const errMsg = warmErr.message || '';
        log.warn(`[CreateProject] Warm attempt ${warmAttempt + 1} failed: ${errMsg}`);

        if (errMsg.includes('failed to resolve') || errMsg.includes('404') || errMsg.includes('ERESOLVE')) {
          update(91, `Fixing dependencies (attempt ${warmAttempt + 1})...`, 'Fixing');
          try {
            const pkgResult = await fileService.readFile(projectId, 'package.json');
            if (pkgResult.success && pkgResult.data?.content) {
              const pkg = JSON.parse(pkgResult.data.content);
              let fixed = false;
              for (const depType of ['dependencies', 'devDependencies']) {
                if (pkg[depType]) {
                  for (const [name] of Object.entries(pkg[depType])) {
                    if (name.startsWith('@/') || name === '@/app' || name === '@/lib' ||
                        name.startsWith('@app') || name.startsWith('@lib') ||
                        name.startsWith('@components') || name.startsWith('@utils')) {
                      delete pkg[depType][name];
                      fixed = true;
                      log.info(`[CreateProject] Removed bad dep: ${name}`);
                    }
                  }
                }
              }
              if (fixed) {
                await fileService.writeFile(projectId, 'package.json', JSON.stringify(pkg, null, 2));
              }
            }
          } catch (fixErr: any) {
            log.warn(`[CreateProject] Dep fix failed: ${fixErr.message}`);
          }
          continue;
        }
        break;
      }
    }

    // === VERIFY + AUTO-FIX ===
    const verifyResult = await verifyAndFixProject({
      projectId,
      userId,
      technology,
      onProgress: (pct, msg, stage) => update(pct, msg, stage),
    });

    if (!verifyResult.passed) {
      log.warn(`[CreateProject] Project ${projectId} has ${verifyResult.errors.length} unresolved errors after auto-fix`);
    }
```

- [ ] **Step 3: Build and verify compilation**

Run: `cd backend-ts && npm run build`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add backend-ts/src/routes/workstation.routes.ts
git commit -m "refactor: replace inline BuildCheck with verifyAndFixProject service call"
```

---

### Task 3: Deploy and test

**Files:**
- No file changes — deployment and manual testing

- [ ] **Step 1: Deploy to dev**

```bash
cd backend-ts && ./deploy-dev.sh
```
Expected: `✅ DEV deploy complete! Backend is healthy.`

- [ ] **Step 2: Deploy to prod**

```bash
cd backend-ts && ./deploy.sh
```
Expected: `✅ Deploy complete! Backend is healthy.`

- [ ] **Step 3: Monitor logs during test**

In a separate terminal, tail the dev logs:
```bash
ssh -p 49222 root@77.42.1.116 'tail -f /var/log/drape-backend-dev.log' 2>&1 | grep -E "Verify|CreateProject|E2E|auto-fix|Fixed|passed|failed"
```

- [ ] **Step 4: Create a test Next.js project on Drape Dev**

Create a project via the app. Watch the logs for:
- `[Verify] Project ... passed on attempt 1` → success, no errors
- `[Verify] Project ... failed on attempt 1: N errors` → auto-fix triggered
- `[Verify] Fixed: file.tsx` → AI applied fixes
- `[Verify] Project ... passed on attempt 2` → fixed and verified

- [ ] **Step 5: Verify the preview loads with CSS**

The preview should show styled content. No blank pages, no error screens, no unstyled HTML.

- [ ] **Step 6: Commit the plan completion**

```bash
git add docs/superpowers/plans/2026-03-29-project-creation-pipeline-refactor.md
git commit -m "docs: project creation pipeline refactor plan — complete"
```
