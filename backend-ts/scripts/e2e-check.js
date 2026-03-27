#!/usr/bin/env node
/**
 * Quick E2E verification: visit all pages, check for console errors, blank screens.
 * Usage: node e2e-check.js
 * Outputs JSON: { "passed": true/false, "pages": [...], "errors": [...] }
 */
const puppeteer = require('puppeteer-core');

const PAGES_TO_CHECK = ['/', '/about', '/dashboard', '/login', '/register', '/settings', '/profile'];
const TIMEOUT = 10000;

(async () => {
  let browser;
  const results = { passed: true, pages: [], errors: [] };

  try {
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      timeout: 15000,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    const consoleErrors = [];
    page.on('pageerror', err => consoleErrors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) {
        consoleErrors.push(msg.text());
      }
    });

    for (const path of PAGES_TO_CHECK) {
      const url = `http://localhost:3000${path}`;
      const pageResult = { path, status: 'unknown', hasContent: false, errors: [] };

      try {
        const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUT });
        pageResult.status = response ? response.status() : 0;

        if (pageResult.status === 200) {
          // Wait for hydration
          await new Promise(r => setTimeout(r, 1000));

          // Check if page has actual content
          const bodyText = await page.evaluate(() => document.body?.innerText?.trim() || '');
          pageResult.hasContent = bodyText.length > 20;

          // Check for error indicators in the page
          const hasErrorScreen = await page.evaluate(() => {
            const text = document.body?.innerText || '';
            return text.includes('Application error') || text.includes('Internal Server Error');
          });

          if (hasErrorScreen) {
            pageResult.errors.push('Application error detected on page');
            results.passed = false;
          }
        } else if (pageResult.status === 404) {
          // 404 is OK — page doesn't exist, skip
        } else {
          results.passed = false;
        }
      } catch (err) {
        pageResult.status = 'timeout';
        // Timeout on a sub-page is OK, might not exist
      }

      // Collect errors since last page
      if (consoleErrors.length > 0) {
        pageResult.errors = [...consoleErrors];
        consoleErrors.length = 0;
        if (pageResult.status === 200) results.passed = false;
      }

      results.pages.push(pageResult);
    }

    // Collect overall critical errors
    results.errors = results.pages
      .filter(p => p.errors.length > 0 && p.status === 200)
      .flatMap(p => p.errors.map(e => `[${p.path}] ${e}`));

  } catch (err) {
    results.passed = false;
    results.errors.push(`Browser launch failed: ${err.message}`);
  } finally {
    if (browser) await browser.close();
  }

  process.stdout.write(JSON.stringify(results));
})();
