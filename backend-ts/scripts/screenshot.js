#!/usr/bin/env node
/**
 * Take a screenshot of http://localhost:3000 using Puppeteer.
 * Captures console errors, network failures, and CSS issues.
 * Usage: node screenshot.js [output.png]
 * Outputs base64 to stdout if no output path given.
 * Errors are written to stderr as JSON: { errors: [...] }
 */
const puppeteer = require('puppeteer-core');

(async () => {
  const outputPath = process.argv[2] || null;
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      timeout: 15000,
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    // Collect errors BEFORE navigating
    const errors = [];
    const failedRequests = [];

    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) {
        errors.push(msg.text());
      }
    });
    page.on('requestfailed', req => {
      const url = req.url();
      if (!url.includes('favicon') && !url.includes('__webpack_hmr') && !url.includes('hot-update')) {
        failedRequests.push(`${req.failure()?.errorText || 'failed'}: ${url}`);
      }
    });

    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 20000 });
    // Wait for client-side hydration + CSS injection
    await new Promise(r => setTimeout(r, 3000));

    const screenshot = await page.screenshot({ type: 'png', encoding: outputPath ? undefined : 'base64' });

    if (outputPath) {
      require('fs').writeFileSync(outputPath, screenshot);
      console.log(outputPath);
    } else {
      process.stdout.write(screenshot);
    }

    // Combine all errors
    const allErrors = [...errors, ...failedRequests.map(r => `[Network] ${r}`)];
    if (allErrors.length > 0) {
      process.stderr.write(JSON.stringify({ errors: allErrors }));
    }
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: err.message }));
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
