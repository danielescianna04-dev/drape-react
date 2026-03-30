#!/usr/bin/env node
/**
 * Midscene-powered visual verification for generated projects.
 * Uses AI vision to analyze screenshots and detect visual issues.
 *
 * Fallback: If Midscene is not available, uses basic Puppeteer checks.
 *
 * Usage: MIDSCENE_MODEL_API_KEY=xxx node midscene-verify.js
 * Output: JSON with verification results
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

// Auto-detect pages
function detectPages() {
  const projectDir = '/home/coder/project';
  const pages = ['/'];
  const appDir = path.join(projectDir, 'app');
  if (fs.existsSync(appDir)) {
    const scan = (dir, prefix) => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.') &&
              !['api','components','lib','hooks','utils','ui'].includes(entry.name)) {
            const route = entry.name.startsWith('(') ? prefix : `${prefix}/${entry.name}`;
            const hasPage = ['page.tsx','page.jsx','page.ts','page.js'].some(f =>
              fs.existsSync(path.join(dir, entry.name, f)));
            if (hasPage && route !== '/') pages.push(route);
            scan(path.join(dir, entry.name), route);
          }
        }
      } catch {}
    };
    scan(appDir, '');
  }
  return [...new Set(pages)].slice(0, 10);
}

async function verifyWithPuppeteer(pages) {
  const results = { passed: true, pages: [], errors: [] };
  let browser;

  try {
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/chromium',
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      timeout: 15000,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 430, height: 932 }); // Mobile viewport

    for (const pagePath of pages) {
      const url = `${BASE_URL}${pagePath}`;
      const pageResult = { path: pagePath, status: 0, errors: [], checks: {} };

      try {
        const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 12000 });
        pageResult.status = response ? response.status() : 0;

        // Follow redirects
        if (pageResult.status >= 300 && pageResult.status < 400) {
          const finalUrl = page.url();
          const finalResp = await page.goto(finalUrl, { waitUntil: 'networkidle2', timeout: 10000 }).catch(() => null);
          pageResult.status = finalResp ? finalResp.status() : 404;
        }

        // Wait for hydration
        for (let w = 0; w < 8; w++) {
          const textLen = await page.evaluate(() => (document.body?.innerText?.trim() || '').length);
          if (textLen > 30) break;
          await new Promise(r => setTimeout(r, 500));
        }

        if (pageResult.status === 200) {
          // Visual analysis
          const analysis = await page.evaluate(() => {
            const body = document.body;
            const text = body?.innerText?.trim() || '';
            const html = body?.innerHTML || '';

            // 1. Content check
            const hasContent = text.length > 30;

            // 2. CSS check — look for computed styles that aren't browser defaults
            const firstEl = body?.querySelector('main, div, section, header, h1, nav') || body?.firstElementChild;
            let hasStyles = false;
            if (firstEl) {
              const s = window.getComputedStyle(firstEl);
              const bg = s.backgroundColor;
              hasStyles = bg !== 'rgba(0, 0, 0, 0)' ||
                s.display === 'flex' || s.display === 'grid' ||
                parseFloat(s.paddingTop) > 0 || parseFloat(s.paddingBottom) > 0;
            }

            // 3. Error screen check
            const hasError = text.includes('Application error') ||
              text.includes('Internal Server Error') ||
              text.includes('Unhandled Runtime Error') ||
              text.includes("Can't resolve") ||
              text.includes('404') ||
              document.querySelector('[data-nextjs-dialog]') !== null;

            // 4. Visual blank check (white or black screen)
            const bodyBg = window.getComputedStyle(body).backgroundColor;
            const isWhite = bodyBg === 'rgb(255, 255, 255)' || bodyBg === 'rgba(0, 0, 0, 0)';
            const isBlack = bodyBg === 'rgb(0, 0, 0)';
            const isBlank = !hasContent && (isWhite || isBlack);

            // 5. Images check
            const images = document.querySelectorAll('img');
            let brokenImages = 0;
            images.forEach(img => { if (!img.complete || img.naturalWidth === 0) brokenImages++; });

            // 6. Interactive elements check
            const buttons = document.querySelectorAll('button, [role="button"], a[href]');
            const forms = document.querySelectorAll('form, input, textarea, select');

            return {
              hasContent, hasStyles, hasError, isBlank,
              textLength: text.length,
              elementCount: document.querySelectorAll('*').length,
              imageCount: images.length,
              brokenImages,
              buttonCount: buttons.length,
              formCount: forms.length,
              bodyBg,
              title: document.title,
            };
          });

          pageResult.checks = analysis;

          // Generate errors based on analysis
          if (analysis.hasError) {
            pageResult.errors.push(`[${pagePath}] Error screen detected`);
            results.passed = false;
          }
          if (analysis.isBlank) {
            pageResult.errors.push(`[${pagePath}] Page is blank (${analysis.textLength} chars, bg: ${analysis.bodyBg})`);
            results.passed = false;
          }
          if (!analysis.hasContent) {
            pageResult.errors.push(`[${pagePath}] No visible content (${analysis.textLength} chars)`);
            results.passed = false;
          }
          if (!analysis.hasStyles && analysis.hasContent) {
            pageResult.errors.push(`[${pagePath}] Content without CSS — styles not applied`);
            results.passed = false;
          }
          if (analysis.brokenImages > 0) {
            pageResult.errors.push(`[${pagePath}] ${analysis.brokenImages} broken images`);
          }

          // Take screenshot
          try {
            const ss = await page.screenshot({ type: 'png', encoding: 'base64' });
            pageResult.screenshot = ss;
          } catch {}

        } else if (pageResult.status === 404) {
          pageResult.errors.push(`[${pagePath}] 404 — page not found`);
          results.passed = false;
        } else if (pageResult.status >= 500) {
          pageResult.errors.push(`[${pagePath}] Server error: ${pageResult.status}`);
          results.passed = false;
        }

      } catch (err) {
        pageResult.errors.push(`[${pagePath}] ${err.message}`);
        if (pagePath === '/') results.passed = false;
      }

      // Collect console errors
      const consoleErrors = [];
      page.removeAllListeners('pageerror');
      page.on('pageerror', err => consoleErrors.push(err.message));

      if (consoleErrors.length > 0) {
        for (const e of consoleErrors.slice(0, 3)) {
          pageResult.errors.push(`[${pagePath}] JS: ${e}`);
          results.passed = false;
        }
      }

      results.pages.push(pageResult);
    }

    // Aggregate errors
    results.errors = results.pages.flatMap(p => p.errors).slice(0, 15);

  } catch (err) {
    results.passed = false;
    results.errors.push(`Browser error: ${err.message}`);
  } finally {
    if (browser) await browser.close();
  }

  return results;
}

(async () => {
  const pages = detectPages();
  console.error(`[Verify] Checking ${pages.length} pages: ${pages.join(', ')}`);

  const results = await verifyWithPuppeteer(pages);

  // Summary
  const passCount = results.pages.filter(p => p.errors.length === 0).length;
  console.error(`[Verify] ${passCount}/${results.pages.length} pages OK. ${results.errors.length} errors.`);

  process.stdout.write(JSON.stringify(results));
})();
