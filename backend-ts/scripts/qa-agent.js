#!/usr/bin/env node
/**
 * QA Agent: Functional Testing + AI Vision + Self-Healing
 *
 * Phase 1: Puppeteer functional testing (pages, clicks, forms) across viewports
 * Phase 2: Gemini Vision screenshot analysis (graceful skip if no key)
 * Phase 3: Self-healing auto-fix + full re-test (max 3 cycles)
 *
 * Output: JSON to stdout (stripped), full report to .drape/qa-report.json
 *
 * Env: GOOGLE_GENERATIVE_AI_API_KEY (optional — skip vision if missing)
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL = 'http://localhost:3000';
const CLICK_TIMEOUT = 3000;
const NAV_TIMEOUT = 12000;
// 2 cycles: verify → self-heal → reverify. Mobile-only viewport for speed.
// Outer verify loop (verify-project.service.ts MAX_ATTEMPTS=2) adds another layer.
const MAX_QA_CYCLES = 2;
const VISION_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
const PROJECT_DIR = '/home/coder/project';
const MAX_SCREENSHOTS_PER_BATCH = 4;
const MAX_SCREENSHOTS_TOTAL = 20; // Prevent OOM on large projects
const MAX_FIX_FILES = 8;

// Mobile-only for speed during creation gate. Multi-viewport is future deep QA.
const VIEWPORTS = [
  { name: 'mobile', width: 430, height: 932 },
];

const PROTECTED_FILES = new Set([
  'package.json', 'tsconfig.json',
  'next.config.ts', 'next.config.js', 'postcss.config.mjs', 'postcss.config.js',
  'tailwind.config.ts', 'tailwind.config.js', 'astro.config.mjs',
  'app/globals.css', 'app/layout.tsx', 'src/index.css',
  'vite.config.ts', 'vite.config.js', 'index.html',
]);

// ── Logging (no base64, no secrets) ────────────────────────────
const qaLog = [];
function logAction(phase, action, detail) {
  const entry = { phase, action, detail: typeof detail === 'string' ? detail.substring(0, 300) : JSON.stringify(detail).substring(0, 300), ts: new Date().toISOString() };
  qaLog.push(entry);
  console.error(`[QA:${phase}] ${action}: ${entry.detail}`);
}

// ── Page Detection ─────────────────────────────────────────────
function detectPages() {
  const pages = ['/'];

  for (const appDir of [path.join(PROJECT_DIR, 'app'), path.join(PROJECT_DIR, 'src', 'app')]) {
    if (!fs.existsSync(appDir)) continue;
    const scan = (dir, prefix) => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
          if (['api', 'components', 'lib', 'hooks', 'utils', 'ui', 'styles', 'types', 'constants'].includes(entry.name)) continue;
          const route = entry.name.startsWith('(') ? prefix : `${prefix}/${entry.name}`;
          const hasPage = ['page.tsx', 'page.jsx', 'page.ts', 'page.js'].some(f =>
            fs.existsSync(path.join(dir, entry.name, f)));
          if (hasPage && route !== '/') pages.push(route);
          scan(path.join(dir, entry.name), route);
        }
      } catch {}
    };
    scan(appDir, '');
  }

  const pagesDir = path.join(PROJECT_DIR, 'src', 'pages');
  if (fs.existsSync(pagesDir)) {
    try {
      for (const entry of fs.readdirSync(pagesDir, { withFileTypes: true })) {
        if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
          const name = entry.name.replace(/\.(tsx?|jsx?)$/, '').toLowerCase();
          if (!['index', 'home', 'app', '_app', '_document'].includes(name)) pages.push(`/${name}`);
        }
        if (entry.isDirectory()) {
          const hasIndex = ['index.tsx', 'index.jsx', 'index.ts', 'index.js'].some(f =>
            fs.existsSync(path.join(pagesDir, entry.name, f)));
          if (hasIndex) pages.push(`/${entry.name}`);
        }
      }
    } catch {}
  }

  try {
    for (const routerFile of ['src/App.tsx', 'src/App.jsx', 'src/router.tsx', 'src/routes.tsx']) {
      const fp = path.join(PROJECT_DIR, routerFile);
      if (!fs.existsSync(fp)) continue;
      const content = fs.readFileSync(fp, 'utf-8');
      for (const m of content.matchAll(/path[=:]\s*["']\/([a-zA-Z0-9_-]+)["']/g)) {
        const route = `/${m[1]}`;
        if (!pages.includes(route)) pages.push(route);
      }
    }
  } catch {}

  return [...new Set(pages)].slice(0, 15); // Cap at 15 pages
}

// ── Page Analysis ──────────────────────────────────────────────
async function analyzePage(page) {
  return page.evaluate(() => {
    const body = document.body;
    const text = (body?.innerText?.trim() || '');
    const hasContent = text.length > 30;

    let hasStyles = false;
    const els = body?.querySelectorAll('main, div, section, header, h1, nav, p') || [];
    for (const el of Array.from(els).slice(0, 10)) {
      const s = window.getComputedStyle(el);
      const bg = s.backgroundColor;
      if ((bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(255, 255, 255)') ||
          s.display === 'flex' || s.display === 'grid' ||
          parseFloat(s.paddingTop) > 8 || s.borderRadius !== '0px') {
        hasStyles = true;
        break;
      }
    }

    const hasError = text.includes('Application error') ||
      text.includes('Internal Server Error') ||
      text.includes('Unhandled Runtime Error') ||
      text.includes("Can't resolve") ||
      (text.includes('404') && text.length < 200) ||
      !!document.querySelector('[data-nextjs-dialog]');

    const bodyBg = window.getComputedStyle(body).backgroundColor;
    const isBlank = !hasContent && (bodyBg === 'rgb(255, 255, 255)' || bodyBg === 'rgba(0, 0, 0, 0)' || bodyBg === 'rgb(0, 0, 0)');

    const images = document.querySelectorAll('img');
    let brokenImages = 0;
    images.forEach(img => { if (!img.complete || img.naturalWidth === 0) brokenImages++; });

    return {
      hasContent, hasStyles, hasError, isBlank,
      textLength: text.length,
      elementCount: document.querySelectorAll('*').length,
      imageCount: images.length,
      brokenImages,
      buttonCount: document.querySelectorAll('button, [role="button"], a[href]').length,
      formCount: document.querySelectorAll('form, input, textarea, select').length,
      bodyBg,
      title: document.title,
    };
  });
}

// ── Clickable Elements (CSS selectors, not coordinates) ────────
async function getClickableElements(page) {
  return page.evaluate(() => {
    const results = [];
    const seen = new Set();

    function addEl(el, type, href) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      if (rect.top > window.innerHeight || rect.bottom < 0) return;

      const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().substring(0, 50);
      if (!text) return;

      const key = `${type}:${text}`;
      if (seen.has(key)) return;
      seen.add(key);

      let selector = '';
      if (el.id) selector = `#${CSS.escape(el.id)}`;
      else if (el.getAttribute('data-testid')) selector = `[data-testid="${el.getAttribute('data-testid')}"]`;
      else if (el.getAttribute('aria-label')) selector = `[aria-label="${el.getAttribute('aria-label')}"]`;

      results.push({
        type, href: href || null, text, selector,
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
      });
    }

    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
      addEl(a, 'link', href);
    }
    for (const btn of document.querySelectorAll('button, [role="button"]')) {
      if (btn.closest('form') && btn.type === 'submit') continue;
      addEl(btn, 'button', null);
    }
    for (const nav of document.querySelectorAll('nav a, nav button, [role="tab"], [role="menuitem"]')) {
      addEl(nav, 'nav', nav.getAttribute('href') || null);
    }

    return results.slice(0, 30); // Cap clickables per page
  });
}

// ── Form Detection & Fill ──────────────────────────────────────
async function detectAndFillForms(page, pagePath) {
  const results = [];

  const forms = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('form')).slice(0, 5).map((form, i) => {
      const inputs = Array.from(form.querySelectorAll('input, textarea, select')).map(inp => ({
        tag: inp.tagName.toLowerCase(),
        type: inp.getAttribute('type') || 'text',
        name: inp.getAttribute('name') || '',
        placeholder: inp.getAttribute('placeholder') || '',
        id: inp.id || '',
      }));
      const submit = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
      return { index: i, inputs, hasSubmit: !!submit };
    });
  });

  for (const form of forms) {
    if (form.inputs.length === 0) continue;
    logAction('functional', 'form-fill', `${pagePath} form[${form.index}] with ${form.inputs.length} inputs`);

    for (const input of form.inputs) {
      try {
        const selector = input.id ? `#${input.id}` : `form:nth-of-type(${form.index + 1}) ${input.tag}[name="${input.name}"]`;
        const testValue = getTestValue(input.type, input.name, input.placeholder);
        if (input.tag === 'select') {
          await page.select(selector, '').catch(() => {});
        } else if (input.type !== 'hidden' && input.type !== 'checkbox' && input.type !== 'radio') {
          await page.type(selector, testValue, { delay: 10 }).catch(() => {});
        }
      } catch {}
    }

    if (form.hasSubmit) {
      try {
        await page.click(`form:nth-of-type(${form.index + 1}) button[type="submit"], form:nth-of-type(${form.index + 1}) button:not([type])`).catch(() => {});
        await new Promise(r => setTimeout(r, 1500));
      } catch {}
    }

    results.push({ page: pagePath, form: form.index, inputCount: form.inputs.length, status: 'filled' });
  }
  return results;
}

function getTestValue(type, name, placeholder) {
  const hint = (name + placeholder).toLowerCase();
  if (type === 'email' || hint.includes('email')) return 'test@example.com';
  if (type === 'password' || hint.includes('password')) return 'Test123!';
  if (type === 'tel' || hint.includes('phone')) return '+1234567890';
  if (type === 'number') return '25';
  if (type === 'url') return 'https://example.com';
  if (hint.includes('name')) return 'John Doe';
  if (hint.includes('search')) return 'test';
  if (hint.includes('message') || hint.includes('comment')) return 'Test message.';
  return 'Test';
}

// ── DOM Snapshot for change detection ──────────────────────────
async function takeDomSnapshot(page) {
  return page.evaluate(() => ({
    url: window.location.href,
    text: (document.body?.innerText?.trim() || '').substring(0, 500),
    domStructure: document.body ? Array.from(document.body.children).slice(0, 20).map(c =>
      c.tagName + (c.id ? '#' + c.id : '')
    ).join('|') : '',
    modalCount: document.querySelectorAll('[role="dialog"], .modal, [aria-modal="true"], dialog').length,
  })).catch(() => ({ url: '', text: '', domStructure: '', modalCount: 0 }));
}

async function waitForChange(page, prevSnapshot, timeout = CLICK_TIMEOUT) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await new Promise(r => setTimeout(r, 300));
    const cur = await takeDomSnapshot(page);
    if (cur.url !== prevSnapshot.url) return { changed: true, type: 'navigation', url: cur.url };
    if (cur.text !== prevSnapshot.text && cur.text.length > 0) return { changed: true, type: 'content', url: cur.url };
    if (cur.domStructure !== prevSnapshot.domStructure) return { changed: true, type: 'dom-change', url: cur.url };
    if (cur.modalCount !== prevSnapshot.modalCount) return { changed: true, type: 'modal', url: cur.url };
  }
  return { changed: false, type: 'none', url: page.url() };
}

// ── Phase 1: Functional Testing ────────────────────────────────
async function functionalTest(browser) {
  const results = { pages: [], clicks: [], forms: [], issues: [], screenshots: {} };
  const jsErrors = [];
  const detectedPages = detectPages();
  logAction('functional', 'start', `Testing ${detectedPages.length} pages across ${VIEWPORTS.length} viewports`);

  let screenshotCount = 0;

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height });
    page.on('pageerror', err => jsErrors.push(err.message));

    for (const pagePath of detectedPages) {
      const url = `${BASE_URL}${pagePath}`;
      const pageResult = { path: pagePath, status: 0, errors: [], checks: {}, viewport: vp.name };
      jsErrors.length = 0;

      try {
        const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
        pageResult.status = response ? response.status() : 0;

        // Hydration wait
        for (let w = 0; w < 8; w++) {
          const textLen = await page.evaluate(() => (document.body?.innerText?.trim() || '').length);
          if (textLen > 30) break;
          await new Promise(r => setTimeout(r, 500));
        }

        if (pageResult.status === 200) {
          const analysis = await analyzePage(page);
          pageResult.checks = analysis;
          if (analysis.hasError) { pageResult.errors.push(`Error screen on ${pagePath}`); results.issues.push({ type: 'functional', severity: 'critical', page: pagePath, viewport: vp.name, description: 'Error screen detected' }); }
          if (analysis.isBlank) { pageResult.errors.push(`Blank page: ${pagePath}`); results.issues.push({ type: 'functional', severity: 'critical', page: pagePath, viewport: vp.name, description: 'Page is blank' }); }
          if (!analysis.hasContent) { results.issues.push({ type: 'functional', severity: 'high', page: pagePath, viewport: vp.name, description: 'No visible content' }); }
          if (!analysis.hasStyles && analysis.hasContent) { results.issues.push({ type: 'functional', severity: 'high', page: pagePath, viewport: vp.name, description: 'Content without CSS' }); }
          if (analysis.brokenImages > 0) { results.issues.push({ type: 'functional', severity: 'medium', page: pagePath, viewport: vp.name, description: `${analysis.brokenImages} broken images` }); }
        } else if (pageResult.status === 404) {
          pageResult.errors.push(`404: ${pagePath}`);
          results.issues.push({ type: 'functional', severity: 'critical', page: pagePath, viewport: vp.name, description: '404 page not found' });
        }

        // Screenshot (capped)
        if (screenshotCount < MAX_SCREENSHOTS_TOTAL) {
          try {
            const ss = await page.screenshot({ type: 'png', encoding: 'base64' });
            pageResult.screenshot = ss;
            results.screenshots[`${vp.name}:${pagePath}`] = ss;
            screenshotCount++;
          } catch {}
        }

        if (jsErrors.length > 0) {
          for (const e of jsErrors.slice(0, 3)) {
            pageResult.errors.push(`JS: ${e.substring(0, 150)}`);
            results.issues.push({ type: 'functional', severity: 'high', page: pagePath, viewport: vp.name, description: `JS error: ${e.substring(0, 100)}` });
          }
        }
      } catch (err) {
        pageResult.errors.push(err.message.substring(0, 150));
        results.issues.push({ type: 'functional', severity: 'critical', page: pagePath, viewport: vp.name, description: err.message.substring(0, 100) });
      }

      // Only push page results for mobile viewport (backward compat with e2e-check format)
      if (vp.name === 'mobile') {
        results.pages.push(pageResult);
      }

      logAction('functional', 'page', `${vp.name}:${pagePath} — ${pageResult.status} ${pageResult.errors.length ? 'ERRORS' : 'OK'}`);
    }

    // Click testing + form testing: only on mobile viewport (avoid tripling time)
    if (vp.name === 'mobile') {
      const testedClicks = new Set();
      for (const testPage of detectedPages) {
        // Skip dynamic routes with [params] — they cause navigation issues
        if (testPage.includes('[')) continue;

        try {
        await page.goto(`${BASE_URL}${testPage}`, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT }).catch(() => {});
        await new Promise(r => setTimeout(r, 800));

        const actualPath = new URL(page.url()).pathname;
        if (actualPath !== testPage && actualPath !== testPage + '/') continue;

        // Clicks
        const clickables = await getClickableElements(page).catch(() => []);
        logAction('functional', 'click-scan', `${testPage}: ${clickables.length} clickables`);

        for (const el of clickables) {
          const clickKey = `${testPage}:${el.type}:${el.text}`;
          if (testedClicks.has(clickKey)) continue;
          testedClicks.add(clickKey);

          if (new URL(page.url()).pathname !== testPage) {
            await page.goto(`${BASE_URL}${testPage}`, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT }).catch(() => {});
            await new Promise(r => setTimeout(r, 500));
          }

          const prevSnap = await takeDomSnapshot(page);
          jsErrors.length = 0;
          const clickResult = { element: { type: el.type, text: el.text, href: el.href }, fromPage: testPage, result: 'unknown', toPage: null, error: null };

          try {
            let screenshotBefore = null;
            if (screenshotCount < MAX_SCREENSHOTS_TOTAL) {
              screenshotBefore = await page.screenshot({ type: 'png', encoding: 'base64' }).catch(() => null);
              if (screenshotBefore) screenshotCount++;
            }

            // Click by selector first, fallback coordinates
            let clicked = false;
            if (el.selector) {
              try { await page.click(el.selector); clicked = true; } catch {}
            }
            if (!clicked) {
              await page.mouse.click(el.x, el.y);
            }

            const change = await waitForChange(page, prevSnap);

            if (change.changed) {
              clickResult.result = change.type;
              clickResult.toPage = change.url ? new URL(change.url).pathname : null;

              if (change.type === 'navigation') {
                const newAnalysis = await analyzePage(page).catch(() => null);
                if (newAnalysis?.hasError) {
                  clickResult.error = `Error screen after clicking "${el.text}"`;
                  results.issues.push({ type: 'functional', severity: 'critical', page: testPage, description: clickResult.error });
                }
                if (newAnalysis?.isBlank) {
                  clickResult.error = `Blank page after clicking "${el.text}"`;
                  results.issues.push({ type: 'functional', severity: 'critical', page: testPage, description: clickResult.error });
                }
              }

              if (jsErrors.length > 0) {
                clickResult.error = `JS error after click: ${jsErrors[0].substring(0, 100)}`;
                results.issues.push({ type: 'functional', severity: 'high', page: testPage, description: clickResult.error });
              }
            } else {
              clickResult.result = 'no-change';
              clickResult.error = `"${el.text}" (${el.type}) clicked but nothing happened`;
              results.issues.push({ type: 'functional', severity: 'high', page: testPage, description: clickResult.error });
            }

            let screenshotAfter = null;
            if (screenshotCount < MAX_SCREENSHOTS_TOTAL) {
              screenshotAfter = await page.screenshot({ type: 'png', encoding: 'base64' }).catch(() => null);
              if (screenshotAfter) screenshotCount++;
            }
            clickResult.screenshotBefore = screenshotBefore;
            clickResult.screenshotAfter = screenshotAfter;
          } catch (err) {
            clickResult.result = 'error';
            clickResult.error = err.message.substring(0, 150);
          }

          results.clicks.push(clickResult);
        }

        // Forms
        const formResults = await detectAndFillForms(page, testPage);
        results.forms.push(...formResults);
        } catch (pageErr) {
          // Catch detached frame, navigation errors — skip this page, continue testing
          logAction('functional', 'page-error', `${testPage}: ${(pageErr.message || '').substring(0, 80)}`);
        }
      }
    }

    await page.close();
  }

  logAction('functional', 'complete', `${results.pages.length} pages, ${results.clicks.length} clicks, ${results.forms.length} forms, ${results.issues.length} issues`);
  return results;
}

// ── Phase 2: Visual Testing (Gemini Vision) ────────────────────
async function visualTest(screenshots) {
  if (!VISION_API_KEY) {
    logAction('visual', 'skipped', 'No API key — visual analysis skipped');
    return { issues: [], skipped: true };
  }

  const entries = Object.entries(screenshots);
  if (entries.length === 0) return { issues: [], skipped: false };

  logAction('visual', 'start', `Analyzing ${entries.length} screenshots`);
  const allIssues = [];
  let qualityScoreSum = 0;
  let qualityCount = 0;

  for (let i = 0; i < entries.length; i += MAX_SCREENSHOTS_PER_BATCH) {
    const batch = entries.slice(i, i + MAX_SCREENSHOTS_PER_BATCH);

    const parts = [];
    parts.push({ text: `You are a senior QA engineer reviewing screenshots of a generated web application.
Analyze each screenshot for visual quality issues. Return JSON only:
{
  "issues": [
    { "page": "/path", "type": "layout|typography|color|spacing|overlap|empty", "severity": "critical|high|medium|low", "description": "What is wrong", "suggestion": "Code fix" }
  ],
  "quality_score": 8,
  "looks_professional": true
}
Check: overlapping elements, truncated text, broken layouts, inconsistent spacing, empty sections, unstyled elements, broken images. Only report REAL issues. Return ONLY valid JSON.` });

    for (const [key, base64] of batch) {
      parts.push({ inlineData: { mimeType: 'image/png', data: base64 } });
      parts.push({ text: `Screenshot: ${key}` });
    }

    try {
      const response = await callGeminiVision(parts);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.issues)) {
          for (const issue of parsed.issues) {
            allIssues.push({ ...issue, source: 'visual' });
          }
        }
        if (typeof parsed.quality_score === 'number') {
          qualityScoreSum += parsed.quality_score;
          qualityCount++;
        }
        logAction('visual', 'batch', `${parsed.issues?.length || 0} issues, quality: ${parsed.quality_score || '?'}/10`);
      }
    } catch (err) {
      logAction('visual', 'error', `Vision API: ${err.message.substring(0, 100)}`);
    }
  }

  const avgQuality = qualityCount > 0 ? Math.round(qualityScoreSum / qualityCount) : null;
  logAction('visual', 'complete', `${allIssues.length} visual issues, avg quality: ${avgQuality}/10`);
  return { issues: allIssues, skipped: false, qualityScore: avgQuality };
}

// ── Gemini Vision API (HTTPS, no npm deps) ─────────────────────
function callGeminiVision(parts) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
    });

    const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${VISION_API_KEY}`);

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) { reject(new Error(json.error.message || 'API error')); return; }
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
          resolve(text);
        } catch (e) { reject(new Error('Parse error')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Vision API timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Phase 3: Self-Healing ──────────────────────────────────────
async function selfHeal(issues) {
  if (!VISION_API_KEY) {
    logAction('fix', 'skipped', 'No API key');
    return { applied: false, filesModified: [] };
  }

  const toFix = issues.filter(i => i.severity === 'critical' || i.severity === 'high');
  if (toFix.length === 0) {
    logAction('fix', 'skipped', 'No critical/high issues');
    return { applied: false, filesModified: [] };
  }

  logAction('fix', 'start', `Fixing ${toFix.length} critical/high issues`);

  // Read source files
  const sourceFiles = [];
  const filesToRead = new Set();

  try {
    const found = require('child_process').execFileSync('find', [
      path.join(PROJECT_DIR, 'app'), '-name', 'page.tsx', '-o', '-name', 'page.jsx'
    ], { encoding: 'utf-8', timeout: 5000 }).trim().split('\n').filter(Boolean);
    for (const f of found.slice(0, 10)) filesToRead.add(f);
  } catch {}

  for (const f of ['app/layout.tsx', 'app/page.tsx', 'app/globals.css', 'src/App.tsx', 'src/index.css', 'src/main.tsx']) {
    const fp = path.join(PROJECT_DIR, f);
    if (fs.existsSync(fp)) filesToRead.add(fp);
  }

  for (const fp of filesToRead) {
    try {
      const content = fs.readFileSync(fp, 'utf-8');
      if (content.length < 50000) { // Skip huge files
        sourceFiles.push({ path: fp.replace(PROJECT_DIR + '/', ''), content });
      }
    } catch {}
  }

  const issueText = toFix.slice(0, 10).map((i, idx) =>
    `${idx + 1}. [${i.severity}] ${i.page || ''} (${i.viewport || 'all'}): ${i.description}${i.suggestion ? ' — ' + i.suggestion : ''}`
  ).join('\n');

  const fileText = sourceFiles.map(f => `--- ${f.path} ---\n${f.content}`).join('\n\n');

  const fixParts = [{ text: `Fix these web application issues:

ISSUES:
${issueText}

SOURCE FILES:
${fileText}

Return JSON array: [{"path": "relative/path", "content": "complete file content"}]
Rules: complete file content, don't modify protected files, fix root cause, use Tailwind CSS, return ONLY valid JSON array.` }];

  try {
    const response = await callGeminiVision(fixParts);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logAction('fix', 'failed', 'No valid JSON from AI');
      return { applied: false, filesModified: [] };
    }

    const fixes = JSON.parse(jsonMatch[0]);
    const filesModified = [];

    for (const fix of fixes.slice(0, MAX_FIX_FILES)) {
      if (!fix.path || !fix.content?.trim()) continue;
      if (PROTECTED_FILES.has(fix.path)) continue;
      // Path traversal protection
      const resolved = path.resolve(PROJECT_DIR, fix.path);
      if (!resolved.startsWith(PROJECT_DIR)) continue;

      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(resolved, fix.content);
      filesModified.push(fix.path);
      logAction('fix', 'written', fix.path);
    }

    logAction('fix', 'complete', `${filesModified.length} files modified`);
    return { applied: filesModified.length > 0, filesModified };
  } catch (err) {
    logAction('fix', 'error', err.message.substring(0, 100));
    return { applied: false, filesModified: [] };
  }
}

// ── Phase 3b: Regenerate broken pages ──────────────────────────
async function regenerateBrokenPages(brokenPages) {
  if (!VISION_API_KEY || brokenPages.length === 0) return { regenerated: [] };

  logAction('regenerate', 'start', `${brokenPages.length} pages to regenerate`);

  // Read project description if available
  let description = '';
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, '.drape', 'project-meta.json'), 'utf-8'));
    description = meta.description || meta.projectName || '';
  } catch {}

  const regenerated = [];

  for (const pagePath of brokenPages.slice(0, 3)) { // Max 3 regenerations
    const filePath = pagePath === '/' ? 'app/page.tsx' : `app${pagePath}/page.tsx`;

    const prompt = [{ text: `Generate a complete, working React page component for route "${pagePath}" in a Next.js app.
${description ? 'Project: ' + description : ''}

Requirements:
- Use "use client" if needed
- Use Tailwind CSS for styling
- Include realistic content (not Lorem ipsum)
- Must be visually polished and professional
- Export default function component
- Return ONLY the complete file content, no markdown` }];

    try {
      const response = await callGeminiVision(prompt);
      // Strip markdown code fences if present
      const code = response.replace(/^```[a-z]*\n?/gm, '').replace(/```$/gm, '').trim();
      if (code.length > 50) {
        const fullPath = path.resolve(PROJECT_DIR, filePath);
        if (fullPath.startsWith(PROJECT_DIR)) {
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(fullPath, code);
          regenerated.push(filePath);
          logAction('regenerate', 'written', filePath);
        }
      }
    } catch (err) {
      logAction('regenerate', 'error', `${pagePath}: ${err.message.substring(0, 80)}`);
    }
  }

  logAction('regenerate', 'complete', `${regenerated.length} pages regenerated`);
  return { regenerated };
}

// ── Main QA Loop ───────────────────────────────────────────────
async function main() {
  const report = {
    status: 'failed',
    qualityScore: 0,
    totalIssues: 0,
    attempts: [],
    log: qaLog,
  };

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/chromium',
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--max-old-space-size=512'],
      timeout: 15000,
    });

    for (let cycle = 1; cycle <= MAX_QA_CYCLES; cycle++) {
      logAction('qa', 'cycle-start', `Attempt ${cycle}/${MAX_QA_CYCLES}`);

      const functional = await functionalTest(browser);
      const visual = await visualTest(functional.screenshots);

      const allIssues = [...functional.issues, ...(visual.issues || [])];
      const criticalHigh = allIssues.filter(i => i.severity === 'critical' || i.severity === 'high');

      const attempt = {
        cycle,
        functionalIssues: functional.issues.length,
        visualIssues: (visual.issues || []).length,
        criticalHighCount: criticalHigh.length,
        pages: functional.pages,
        clicks: functional.clicks,
        forms: functional.forms,
        visualAnalysis: (visual.issues || []).slice(0, 20), // Cap for report size
        visualSkipped: visual.skipped || false,
      };

      if (criticalHigh.length === 0) {
        report.status = 'verified';
        report.qualityScore = visual.qualityScore || (10 - Math.min(5, allIssues.filter(i => i.severity === 'medium').length));
        attempt.fix = null;
        report.attempts.push(attempt);
        logAction('qa', 'verified', `Passed on cycle ${cycle}! Score: ${report.qualityScore}/10`);
        break;
      }

      logAction('qa', 'issues', `${criticalHigh.length} critical/high issues found`);

      if (cycle < MAX_QA_CYCLES) {
        // Self-heal
        const fixResult = await selfHeal(allIssues);
        attempt.fix = fixResult;
        report.attempts.push(attempt);

        if (fixResult.applied) {
          logAction('qa', 'reload', 'Waiting for hot reload...');
          await new Promise(r => setTimeout(r, 5000));
        }
      } else {
        // Last cycle failed — try regenerating broken pages
        const brokenPages = [...new Set(criticalHigh.filter(i => i.page).map(i => i.page))];
        const regenResult = await regenerateBrokenPages(brokenPages);
        attempt.fix = { applied: regenResult.regenerated.length > 0, filesModified: regenResult.regenerated, regenerated: true };
        report.attempts.push(attempt);

        if (regenResult.regenerated.length > 0) {
          logAction('qa', 'reload', 'Waiting for hot reload after regeneration...');
          await new Promise(r => setTimeout(r, 5000));

          // Final re-test
          logAction('qa', 'final-retest', 'Re-testing after regeneration');
          const finalFunctional = await functionalTest(browser);
          const finalVisual = await visualTest(finalFunctional.screenshots);
          const finalCritical = [...finalFunctional.issues, ...(finalVisual.issues || [])].filter(i => i.severity === 'critical' || i.severity === 'high');

          if (finalCritical.length === 0) {
            report.status = 'verified';
            report.qualityScore = finalVisual.qualityScore || 7;
            logAction('qa', 'verified', 'Passed after regeneration!');
          } else {
            logAction('qa', 'failed', `${finalCritical.length} issues remain after regeneration`);
          }
        }
      }
    }

    report.totalIssues = report.attempts.reduce((sum, a) => sum + a.criticalHighCount, 0);
  } catch (err) {
    logAction('qa', 'fatal', err.message.substring(0, 200));
    report.status = 'error';
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  // Save full report (cap size: remove screenshots from attempts)
  const drapeDir = path.join(PROJECT_DIR, '.drape');
  try {
    if (!fs.existsSync(drapeDir)) fs.mkdirSync(drapeDir, { recursive: true });
    const reportToSave = JSON.parse(JSON.stringify(report));
    // Strip screenshots from saved report to prevent huge files
    if (reportToSave.attempts) {
      for (const a of reportToSave.attempts) {
        if (a.pages) a.pages.forEach(p => delete p.screenshot);
        if (a.clicks) a.clicks.forEach(c => { delete c.screenshotBefore; delete c.screenshotAfter; });
      }
    }
    fs.writeFileSync(path.join(drapeDir, 'qa-report.json'), JSON.stringify(reportToSave));
    logAction('qa', 'saved', 'Report saved to .drape/qa-report.json');
  } catch (err) {
    console.error('[QA] Failed to save report:', err.message);
  }

  // Backward-compatible stdout output (same shape as e2e-check.js)
  const lastAttempt = report.attempts[report.attempts.length - 1];
  const backcompat = {
    passed: report.status === 'verified',
    pages: lastAttempt?.pages || [],
    navigation: lastAttempt?.clicks || [],
    errors: (lastAttempt?.pages || []).flatMap(p => p.errors || []),
    qaReport: {
      status: report.status,
      qualityScore: report.qualityScore,
      totalIssues: report.totalIssues,
      attempts: (report.attempts || []).map(a => ({
        cycle: a.cycle,
        functionalIssues: a.functionalIssues,
        visualIssues: a.visualIssues,
        criticalHighCount: a.criticalHighCount,
        visualAnalysis: a.visualAnalysis,
        visualSkipped: a.visualSkipped,
        fix: a.fix,
      })),
    },
  };

  // Strip screenshots from stdout
  if (backcompat.pages) backcompat.pages.forEach(p => delete p.screenshot);
  if (backcompat.navigation) backcompat.navigation.forEach(n => { delete n.screenshotBefore; delete n.screenshotAfter; });

  process.stdout.write(JSON.stringify(backcompat));
}

main().catch(err => {
  console.error('[QA] Fatal:', err);
  process.stdout.write(JSON.stringify({
    passed: false, errors: [err.message], qaReport: { status: 'error', qualityScore: 0, totalIssues: 0, attempts: [] }
  }));
  process.exit(1);
});
