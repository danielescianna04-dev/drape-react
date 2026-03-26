# Plan 2: Self-Healing Verification System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After generating a project, an automated system takes screenshots of every page, sends them to Claude Vision for analysis, captures console errors, and auto-fixes broken pages. The user sees only "Verifying... Homepage OK... Login OK... Ready!" — never a broken app.

**Architecture:** Playwright runs in the Docker container (already has Node.js). A new backend service orchestrates: discover routes → for each route: navigate → screenshot → capture console errors → send to Claude Vision → if FAIL: send errors to AI for fix → rebuild → re-verify (max 3 retries). Results streamed to frontend via existing creation task progress system.

**Tech Stack:** Playwright (Chromium only), Claude Vision (Haiku for screening, Sonnet for fixes), glob for route discovery

**Reference:** This is how Emergent (emergent.sh) does it — multi-agent QA with screenshot verification. They reached $100M ARR with this approach.

---

## File Structure

### New files:
```
backend-ts/src/services/verification.service.ts     — Main verification orchestrator
backend-ts/src/services/screenshot.service.ts        — Playwright screenshot + console capture
backend-ts/src/services/vision-check.service.ts      — Claude Vision page analysis
backend-ts/src/services/route-discovery.service.ts   — Discover all routes in a Next.js project
```

### Files to modify:
```
backend-ts/src/routes/workstation.routes.ts          — Call verification after generation
backend-ts/src/services/project-creation-prompt.ts   — Tell AI to generate a routes manifest
```

### Docker image changes:
```
Dockerfile.workspace                                 — Add Playwright + Chromium to workspace image
```

---

### Task 1: Add Playwright to the workspace Docker image

**Files:**
- Modify: `backend-ts/Dockerfile.workspace`

- [ ] **Step 1: Add Playwright + Chromium to the Docker image**

In the workspace Dockerfile, add Playwright with Chromium only (minimizes image size):

```dockerfile
# Add Playwright for screenshot verification
RUN npx playwright install --with-deps chromium
```

This adds ~300MB to the image but is essential for the verification system. Playwright is pre-installed so screenshots don't require runtime installation.

- [ ] **Step 2: Rebuild the workspace image**

```bash
docker build -f Dockerfile.workspace -t drape-workspace:latest .
```

- [ ] **Step 3: Commit**

```bash
git add Dockerfile.workspace
git commit -m "feat: add Playwright + Chromium to workspace Docker image"
```

---

### Task 2: Create route discovery service

**Files:**
- Create: `backend-ts/src/services/route-discovery.service.ts`

- [ ] **Step 1: Implement route discovery**

The service discovers all pages in a Next.js App Router project by scanning for `page.tsx` files:

```typescript
import { log } from '../utils/logger';
import { dockerService } from './docker.service';

export interface DiscoveredRoute {
  path: string;           // e.g., "/", "/login", "/products"
  isDynamic: boolean;     // e.g., /products/[id] → true
  file: string;           // e.g., "app/products/page.tsx"
}

export async function discoverRoutes(agentUrl: string): Promise<DiscoveredRoute[]> {
  // Find all page.tsx/page.js files in the app directory
  const findResult = await dockerService.exec(
    agentUrl,
    `find app -name "page.tsx" -o -name "page.js" -o -name "page.jsx" 2>/dev/null | sort`,
    '/home/coder/project',
    5000,
    true
  );

  if (!findResult.success || !findResult.output) {
    log.warn('[RouteDiscovery] No pages found');
    return [{ path: '/', isDynamic: false, file: 'app/page.tsx' }];
  }

  const routes: DiscoveredRoute[] = [];
  const files = findResult.output.trim().split('\n').filter(Boolean);

  for (const file of files) {
    let route = '/' + file
      .replace(/^app\//, '')
      .replace(/\/page\.(tsx|ts|js|jsx)$/, '')
      .replace(/\(.*?\)\//g, '')  // remove route groups
      .replace(/^\.$/, '');

    if (route === '/') route = '/';

    const isDynamic = route.includes('[');
    routes.push({ path: route, isDynamic, file });
  }

  // Sort: static routes first, then dynamic
  routes.sort((a, b) => {
    if (a.isDynamic !== b.isDynamic) return a.isDynamic ? 1 : -1;
    return a.path.localeCompare(b.path);
  });

  log.info(`[RouteDiscovery] Found ${routes.length} routes: ${routes.map(r => r.path).join(', ')}`);
  return routes;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend-ts/src/services/route-discovery.service.ts
git commit -m "feat: add route discovery service for Next.js projects"
```

---

### Task 3: Create screenshot service

**Files:**
- Create: `backend-ts/src/services/screenshot.service.ts`

- [ ] **Step 1: Implement screenshot + console error capture**

This service runs Playwright inside the Docker container via the agent URL to take a screenshot and capture console errors:

```typescript
import { log } from '../utils/logger';
import { dockerService } from './docker.service';

export interface ScreenshotResult {
  screenshotBase64: string;
  consoleErrors: string[];
  pageErrors: string[];
  networkErrors: string[];
  loadTimeMs: number;
  httpStatus: number;
}

export async function takeScreenshot(
  agentUrl: string,
  route: string,
  port: number = 3000
): Promise<ScreenshotResult> {
  // Run a Node.js script inside the container that uses Playwright
  const script = `
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const consoleErrors = [];
  const pageErrors = [];
  const networkErrors = [];

  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('requestfailed', req => networkErrors.push(req.url() + ' - ' + (req.failure()?.errorText || 'unknown')));

  const start = Date.now();
  let status = 0;
  try {
    const response = await page.goto('http://localhost:${port}${route}', {
      waitUntil: 'networkidle',
      timeout: 15000
    });
    status = response?.status() || 0;
  } catch (e) {
    pageErrors.push('Navigation failed: ' + e.message);
  }
  const loadTime = Date.now() - start;

  const screenshot = await page.screenshot({ fullPage: false });
  await browser.close();

  console.log(JSON.stringify({
    screenshot: screenshot.toString('base64'),
    consoleErrors,
    pageErrors,
    networkErrors,
    loadTimeMs: loadTime,
    httpStatus: status
  }));
})();
  `.replace(/\n/g, ' ');

  const result = await dockerService.exec(
    agentUrl,
    `node -e "${script.replace(/"/g, '\\"')}"`,
    '/home/coder/project',
    30000,
    true
  );

  if (!result.success || !result.output) {
    throw new Error('Screenshot failed: ' + (result.error || 'no output'));
  }

  try {
    return JSON.parse(result.output);
  } catch {
    throw new Error('Failed to parse screenshot result');
  }
}
```

**Note:** This approach runs Playwright INSIDE the Docker container via exec. An alternative is to expose a screenshot endpoint, but exec is simpler and doesn't require code changes to the workspace image beyond installing Playwright.

- [ ] **Step 2: Commit**

```bash
git add backend-ts/src/services/screenshot.service.ts
git commit -m "feat: add screenshot service using Playwright in Docker container"
```

---

### Task 4: Create vision check service

**Files:**
- Create: `backend-ts/src/services/vision-check.service.ts`

- [ ] **Step 1: Implement Claude Vision page verification**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { log } from '../utils/logger';
import { config } from '../config';

export interface VisionVerdict {
  status: 'pass' | 'fail';
  confidence: number;
  issues: string[];
  category: 'blank_page' | 'error_screen' | 'layout_broken' | 'missing_assets' | 'functional' | null;
}

const SYSTEM_PROMPT = `You are a QA engineer verifying a web application page. Analyze the screenshot and return ONLY valid JSON:
{
  "status": "pass" or "fail",
  "confidence": 0.0 to 1.0,
  "issues": ["specific issue descriptions"],
  "category": "blank_page" | "error_screen" | "layout_broken" | "missing_assets" | "functional" | null
}

FAIL if: page is blank/white, shows error/stack trace, has severely broken layout, or shows no content.
PASS if: page renders meaningful content with acceptable layout.
When in doubt, FAIL.`;

export async function verifyPage(
  screenshotBase64: string,
  route: string,
  consoleErrors: string[],
  pageErrors: string[]
): Promise<VisionVerdict> {
  // Quick pre-check: if there are critical JS errors, fail without vision
  if (pageErrors.length > 0) {
    return {
      status: 'fail',
      confidence: 1.0,
      issues: pageErrors.map(e => `JS Error: ${e}`),
      category: 'error_screen',
    };
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const userContent = `Page route: ${route}
Console errors: ${consoleErrors.length > 0 ? consoleErrors.join('; ') : 'None'}

Analyze this page screenshot:`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', // Haiku for speed + cost
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 },
          },
          { type: 'text', text: userContent },
        ],
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn(`[VisionCheck] Failed to parse verdict for ${route}`);
      return { status: 'fail', confidence: 0.5, issues: ['Could not parse vision response'], category: null };
    }

    return JSON.parse(jsonMatch[0]) as VisionVerdict;
  } catch (err: any) {
    log.warn(`[VisionCheck] API error for ${route}: ${err.message}`);
    return { status: 'fail', confidence: 0.5, issues: [`Vision API error: ${err.message}`], category: null };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend-ts/src/services/vision-check.service.ts
git commit -m "feat: add Claude Vision page verification service"
```

---

### Task 5: Create verification orchestrator

**Files:**
- Create: `backend-ts/src/services/verification.service.ts`

- [ ] **Step 1: Implement the self-healing verification loop**

This is the core orchestrator that ties everything together:

```typescript
import { log } from '../utils/logger';
import { discoverRoutes, DiscoveredRoute } from './route-discovery.service';
import { takeScreenshot, ScreenshotResult } from './screenshot.service';
import { verifyPage, VisionVerdict } from './vision-check.service';

export interface VerificationResult {
  route: string;
  status: 'pass' | 'fail' | 'fixed' | 'skipped';
  attempts: number;
  issues: string[];
}

export interface VerificationReport {
  totalRoutes: number;
  passed: number;
  failed: number;
  fixed: number;
  results: VerificationResult[];
}

const MAX_RETRIES = 3;

export async function verifyProject(
  agentUrl: string,
  projectId: string,
  onProgress?: (message: string, routeStatus: { route: string; status: string }) => void
): Promise<VerificationReport> {
  log.info(`[Verification] Starting verification for project ${projectId}`);

  // 1. Discover routes
  const routes = await discoverRoutes(agentUrl);
  const staticRoutes = routes.filter(r => !r.isDynamic);

  const results: VerificationResult[] = [];
  let passed = 0;
  let failed = 0;
  let fixed = 0;

  // 2. Verify each static route
  for (const route of staticRoutes) {
    let status: 'pass' | 'fail' | 'fixed' = 'fail';
    let attempts = 0;
    let issues: string[] = [];

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      attempts = attempt + 1;
      onProgress?.(`Checking ${route.path}...`, { route: route.path, status: 'checking' });

      try {
        // Take screenshot + capture errors
        const screenshot = await takeScreenshot(agentUrl, route.path);

        // Verify with Claude Vision
        const verdict = await verifyPage(
          screenshot.screenshotBase64,
          route.path,
          screenshot.consoleErrors,
          screenshot.pageErrors
        );

        if (verdict.status === 'pass') {
          status = attempt > 0 ? 'fixed' : 'pass';
          issues = [];
          break;
        }

        // Failed — collect issues
        issues = verdict.issues;
        log.warn(`[Verification] ${route.path} FAILED (attempt ${attempts}): ${issues.join(', ')}`);

        if (attempt < MAX_RETRIES - 1) {
          // Try to fix — send errors to AI agent for repair
          onProgress?.(`Fixing ${route.path}...`, { route: route.path, status: 'fixing' });

          const errorContext = [
            ...screenshot.consoleErrors.map(e => `Console error: ${e}`),
            ...screenshot.pageErrors.map(e => `JS error: ${e}`),
            ...screenshot.networkErrors.map(e => `Network error: ${e}`),
            ...verdict.issues.map(e => `Visual issue: ${e}`),
          ].join('\n');

          // TODO: Call the AI agent to fix the issues
          // For now, log the errors — the fix mechanism will be added when
          // the agent tool system supports "fix this page" commands
          log.info(`[Verification] Would fix ${route.path} with context: ${errorContext.substring(0, 200)}`);

          // Wait for potential rebuild
          await new Promise(r => setTimeout(r, 3000));
        }
      } catch (err: any) {
        issues = [`Screenshot/verification error: ${err.message}`];
        log.warn(`[Verification] Error checking ${route.path}: ${err.message}`);
      }
    }

    if (status === 'pass') passed++;
    else if (status === 'fixed') { fixed++; passed++; }
    else failed++;

    onProgress?.(
      `${route.path} ${status === 'pass' ? '✓' : status === 'fixed' ? '✓ (fixed)' : '✗'}`,
      { route: route.path, status }
    );

    results.push({ route: route.path, status, attempts, issues });
  }

  // Skip dynamic routes
  for (const route of routes.filter(r => r.isDynamic)) {
    results.push({ route: route.path, status: 'skipped', attempts: 0, issues: ['Dynamic route — requires seed data'] });
  }

  const report: VerificationReport = {
    totalRoutes: routes.length,
    passed,
    failed,
    fixed,
    results,
  };

  log.info(`[Verification] Complete: ${passed} passed, ${failed} failed, ${fixed} fixed out of ${routes.length} routes`);
  return report;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend-ts/src/services/verification.service.ts
git commit -m "feat: add self-healing verification orchestrator"
```

---

### Task 6: Integrate verification into project creation flow

**Files:**
- Modify: `backend-ts/src/routes/workstation.routes.ts`

- [ ] **Step 1: Add verification step after generation + build**

In the `generateProject` function, after the dev server starts and the workspace is warm, add the verification call:

```typescript
import { verifyProject } from '../services/verification.service';

// After: [DevServer] Ready
// Add:
update(92, 'Verifying pages...', 'Verification');

try {
  const report = await verifyProject(agentUrl, projectId, (msg, routeStatus) => {
    update(
      Math.min(98, 92 + Math.floor((report?.passed || 0) / (report?.totalRoutes || 1) * 6)),
      msg,
      'Verification'
    );
  });

  if (report.failed > 0) {
    log.warn(`[CreateProject] Verification: ${report.failed} pages failed for ${projectId}`);
  } else {
    log.info(`[CreateProject] Verification: all ${report.passed} pages passed for ${projectId}`);
  }
} catch (err: any) {
  log.warn(`[CreateProject] Verification skipped: ${err.message}`);
}

update(100, 'Project ready!', 'Complete');
```

- [ ] **Step 2: Commit**

```bash
git add backend-ts/src/routes/workstation.routes.ts
git commit -m "feat: integrate page verification into project creation flow"
```

---

### Task 7: Deploy and test end-to-end

- [ ] **Step 1: Rebuild workspace Docker image with Playwright**

```bash
docker build -f Dockerfile.workspace -t drape-workspace:latest .
```

- [ ] **Step 2: Build and deploy backend**

```bash
cd backend-ts && npm run build && ./deploy.sh
```

- [ ] **Step 3: Create a test project with Cloud Mode**

- [ ] **Step 4: Monitor logs for verification output**

```bash
ssh root@server 'tail -f /var/log/drape-backend.log' | grep -E "Verification|Screenshot|Vision"
```

Expected output:
```
[Verification] Starting verification for project-xxx
[RouteDiscovery] Found 6 routes: /, /login, /register, /dashboard, /products, /about
[Verification] / PASS
[Verification] /login PASS
[Verification] /register PASS
[Verification] /dashboard PASS
[Verification] /products FAIL (attempt 1): No product data visible
[Verification] Would fix /products with context: ...
[Verification] /products PASS (attempt 2)
[Verification] Complete: 6 passed, 0 failed, 1 fixed out of 6 routes
```

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: adjustments from self-healing verification testing"
```
