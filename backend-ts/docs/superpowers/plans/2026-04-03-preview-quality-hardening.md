# Preview Quality Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 critical preview quality issues: CSS flash/zoom, pinch-to-zoom, non-clickable buttons, missing QA screenshots.

**Architecture:** 4 independent fixes across 3 files. Fix 1+2 are in the same file (PreviewWebView.tsx), Fix 3 is in e2e-check.js, Fix 4 is in verify-project.service.ts. No new files.

**Tech Stack:** React Native WebView, Puppeteer (Node.js), Express/TypeScript backend

---

## File Structure

All modifications — no new files:

| File | Responsibility | Changes |
|------|---------------|---------|
| `src/features/terminal/components/PreviewWebView.tsx` | WebView preview rendering | Fix viewport zoom, CSS flash, remove scalesPageToFit |
| `backend-ts/scripts/e2e-check.js` | Puppeteer E2E verification | Expand clickable detection, deep DOM analysis, zero-tolerance |
| `backend-ts/src/services/verify-project.service.ts` | Backend verification orchestration | Collect ALL screenshots, fix field name mismatch |

---

### Task 1: Fix CSS Flash/Zoom and Disable Pinch-to-Zoom (PreviewWebView.tsx)

**Files:**
- Modify: `src/features/terminal/components/PreviewWebView.tsx:145-166` (viewport switch effect)
- Modify: `src/features/terminal/components/PreviewWebView.tsx:208-286` (injected JS)
- Modify: `src/features/terminal/components/PreviewWebView.tsx:521-533` (WebView props)

- [ ] **Step 1: Fix the runtime viewport switch effect (lines 145-166)**

Change the viewport values in the `useEffect` that fires when `viewportMode` changes. Disable zoom for both modes and add `touch-action` CSS injection.

In `src/features/terminal/components/PreviewWebView.tsx`, replace lines 145-166:

```typescript
  // Switch viewport at runtime when user toggles desktop/mobile
  React.useEffect(() => {
    if (!webViewRef.current || serverStatus !== 'running') return;
    const isDesktop = viewportMode === 'desktop';
    const content = isDesktop
      ? 'width=1280, initial-scale=0.3, minimum-scale=0.1, maximum-scale=1.0, user-scalable=no'
      : 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no';
    webViewRef.current.injectJavaScript(`
      (function() {
        var meta = document.querySelector('meta[name="viewport"]');
        if (meta) {
          meta.setAttribute('content', '${content}');
        } else {
          meta = document.createElement('meta');
          meta.name = 'viewport';
          meta.content = '${content}';
          document.head.appendChild(meta);
        }
      })();
      true;
    `);
  }, [viewportMode]);
```

- [ ] **Step 2: Fix the injectedJavaScriptBeforeContentLoaded (lines 208-286)**

Add a guard flag so the script only runs once per WebView session. Change viewport values to disable zoom. Add anti-flash and anti-zoom CSS.

In `src/features/terminal/components/PreviewWebView.tsx`, replace the entire `injectedJavaScriptBeforeContentLoaded` value (lines 208-286). The key changes are:
1. Add `if (window.__drapeInit) return; window.__drapeInit = true;` at the top
2. Change viewport `maximum-scale=5.0, user-scalable=yes` to `maximum-scale=1.0, user-scalable=no` in both modes
3. Replace the style block with anti-flash + anti-zoom CSS: `'html, body { background-color: #ffffff !important; -webkit-tap-highlight-color: transparent; } * { touch-action: pan-x pan-y; }'`

The complete replacement for lines 208-286:

```
              injectedJavaScriptBeforeContentLoaded={`
              (function() {
                if (window.__drapeInit) return;
                window.__drapeInit = true;

                var token = ${JSON.stringify(coderToken || '')};
                var vmId = ${JSON.stringify(globalFlyMachineId || '')};
                var previewToken = ${JSON.stringify(previewAccessToken || '')};

                if (token) {
                  document.cookie = "coder_session_token=" + token + "; path=/; SameSite=Lax";
                  document.cookie = "session_token=" + token + "; path=/; SameSite=Lax";
                }
                if (vmId) {
                  document.cookie = "drape_vm_id=" + vmId + "; path=/; SameSite=Lax";
                  document.cookie = "fly-force-instance-id=" + vmId + "; path=/; SameSite=Lax";
                }
                if (previewToken) {
                  document.cookie = "drape_preview_token=" + previewToken + "; path=/; SameSite=Lax";
                }

                var isDesktopMode = ${JSON.stringify(viewportMode === 'desktop')};
                var viewportContent = isDesktopMode
                  ? 'width=1280, initial-scale=0.3, minimum-scale=0.1, maximum-scale=1.0, user-scalable=no'
                  : 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no';
                var existingMeta = document.querySelector('meta[name="viewport"]');
                if (existingMeta) {
                  existingMeta.setAttribute('content', viewportContent);
                } else {
                  var meta = document.createElement('meta');
                  meta.name = 'viewport';
                  meta.content = viewportContent;
                  if (document.head) document.head.appendChild(meta);
                  else document.addEventListener('DOMContentLoaded', function() { document.head.appendChild(meta); });
                }

                if (document.head) {
                  var style = document.createElement('style');
                  style.textContent = 'html, body { background-color: #ffffff !important; -webkit-tap-highlight-color: transparent; } * { touch-action: pan-x pan-y; }';
                  document.head.appendChild(style);
                }

                if (window.visualViewport) {
                  window.visualViewport.addEventListener('resize', function() {
                    var vh = window.visualViewport.height;
                    document.documentElement.style.height = vh < window.innerHeight ? vh + 'px' : '';
                    document.body.style.height = vh < window.innerHeight ? vh + 'px' : '';
                  });
                }

                var readySent = false;
                function checkReady() {
                  if (readySent) return;
                  var root = document.getElementById('root') || document.getElementById('__next') ||
                             document.getElementById('__nuxt') || document.querySelector('[id^="app"]');
                  var isFlutter = !!document.querySelector('flutter-view, flt-glass-pane');
                  var hasContent = isFlutter || (root ? root.children.length > 0 && (root.innerText || '').trim().length > 0 : document.body && document.body.children.length > 2);
                  if (hasContent) {
                    readySent = true;
                    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'WEBVIEW_READY' }));
                  }
                }
                document.addEventListener('DOMContentLoaded', checkReady);
                window.addEventListener('load', checkReady);
                var rafCount = 0;
                function rafCheck() {
                  if (readySent || rafCount++ > 30) { if (!readySent) { readySent = true; window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'WEBVIEW_READY' })); } return; }
                  checkReady();
                  if (!readySent) requestAnimationFrame(rafCheck);
                }
                requestAnimationFrame(rafCheck);
                setTimeout(function() { if (!readySent) { readySent = true; window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'WEBVIEW_READY' })); } }, 5000);
              })();
              true;
            `}
```

- [ ] **Step 3: Remove scalesPageToFit and add scrollEnabled (lines 521-533)**

In `src/features/terminal/components/PreviewWebView.tsx`, replace lines 521-533:

```typescript
              javaScriptEnabled={true}
              domStorageEnabled={true}
              startInLoadingState={false}
              scrollEnabled={true}
              bounces={false}
              mixedContentMode="compatibility"
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
              // Preview loads user-created web apps on various origins - broad whitelist required
              originWhitelist={['https://', 'http://']}
              renderToHardwareTextureAndroid={true}
              shouldRasterizeIOS={true}
              cacheEnabled={true}
```

Key change: `scalesPageToFit={true}` removed (was enabling native zoom), `scrollEnabled={true}` added explicitly.

- [ ] **Step 4: Verify the changes compile**

Run: `cd /Users/leon/Desktop/nexbit/drape/drape-react && npx tsc --noEmit src/features/terminal/components/PreviewWebView.tsx 2>&1 | head -20`

Expected: No errors (or only pre-existing unrelated errors).

- [ ] **Step 5: Commit**

```bash
cd /Users/leon/Desktop/nexbit/drape/drape-react
git add src/features/terminal/components/PreviewWebView.tsx
git commit -m "fix: disable pinch-to-zoom, prevent CSS flash on page transitions

- Viewport: maximum-scale=1.0, user-scalable=no for both mobile and desktop
- Guard flag window.__drapeInit prevents re-injection on SPA navigation
- Anti-zoom CSS: touch-action: pan-x pan-y on all elements
- Removed scalesPageToFit prop that enabled native zoom"
```

---

### Task 2: Expand E2E Clickable Element Detection (e2e-check.js)

**Files:**
- Modify: `backend-ts/scripts/e2e-check.js:140-214` (getClickableElements function)

- [ ] **Step 1: Replace getClickableElements() with expanded version**

In `backend-ts/scripts/e2e-check.js`, replace lines 140-214 (the entire `getClickableElements` function):

```javascript
async function getClickableElements(page) {
  const elements = await page.evaluate(() => {
    const results = [];
    const seen = new Set();
    const rects = []; // For bounding box deduplication

    // Helper: check if a rect is fully contained in an already-captured rect
    function isContainedByExisting(rect) {
      for (const r of rects) {
        if (rect.x >= r.x && rect.y >= r.y &&
            rect.x + rect.width <= r.x + r.width &&
            rect.y + rect.height <= r.y + r.height) {
          return true;
        }
      }
      return false;
    }

    function addElement(el, type, href) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return; // Too small
      if (isContainedByExisting(rect)) return; // Child of already-captured parent

      const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().substring(0, 50);
      if (!text) return; // No text = can't identify in report

      const key = `${type}:${text}:${Math.round(rect.x)}:${Math.round(rect.y)}`;
      if (seen.has(key)) return;
      seen.add(key);

      rects.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
      results.push({
        type,
        href: href || null,
        text,
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
        selector: null,
      });
    }

    // 1. Internal links (a[href])
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      if (href.startsWith('http') || href.startsWith('javascript:') ||
          href.startsWith('mailto:') || href.startsWith('tel:') || href === '') continue;
      if (href === '#' || (href.startsWith('#') && href.length < 30)) {
        addElement(a, 'link', href);
        continue;
      }
      addElement(a, 'link', href);
    }

    // 2. Buttons and role="button"
    for (const btn of document.querySelectorAll('button, [role="button"], [onclick], input[type="button"], input[type="submit"]')) {
      if (btn.closest('form') && (btn.type === 'submit' || btn.tagName === 'INPUT')) continue;
      addElement(btn, 'button', null);
    }

    // 3. Nav items
    for (const nav of document.querySelectorAll('nav a, nav button, [role="navigation"] a, [role="tab"], [role="menuitem"]')) {
      const href = nav.getAttribute('href') || '';
      addElement(nav, 'nav', href || null);
    }

    // 4. Elements with cursor: pointer (Tailwind cursor-pointer, inline styles, CSS)
    const viewportEls = document.querySelectorAll('div, span, li, td, th, label, [tabindex]');
    for (const el of Array.from(viewportEls).slice(0, 200)) {
      if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'INPUT' ||
          el.getAttribute('role') === 'button' || el.getAttribute('role') === 'tab' ||
          el.getAttribute('role') === 'menuitem') continue;

      const rect = el.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

      const style = window.getComputedStyle(el);
      const hasCursorPointer = style.cursor === 'pointer';
      const hasTabindex = el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1';
      const hasDataAction = el.hasAttribute('data-action');

      if (hasCursorPointer || hasTabindex || hasDataAction) {
        addElement(el, 'interactive', null);
      }
    }

    // 5. Broken links (a without href or href="#")
    for (const a of document.querySelectorAll('a:not([href]), a[href=""], a[href="#"]')) {
      addElement(a, 'broken-link', null);
    }

    return results;
  });

  const counts = {};
  for (const e of elements) counts[e.type] = (counts[e.type] || 0) + 1;
  console.error('[e2e] getClickableElements on ' + page.url() + ': ' + JSON.stringify(counts) + ' (' + elements.length + ' total)');
  return elements;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/leon/Desktop/nexbit/drape/drape-react/backend-ts
git add scripts/e2e-check.js
git commit -m "feat(e2e): expand clickable element detection

- Add cursor:pointer detection (Tailwind cursor-pointer, CSS, inline)
- Add tabindex, data-action, input[type=button] detection
- Add broken link detection (a without href, a[href='#'])
- Bounding box deduplication (skip child inside captured parent)
- Min size filter (10x10px) to skip icons/hidden elements"
```

---

### Task 3: Deep DOM Analysis + Zero-Tolerance for No-Change Clicks (e2e-check.js)

**Files:**
- Modify: `backend-ts/scripts/e2e-check.js:216-229` (waitForChange function)
- Modify: `backend-ts/scripts/e2e-check.js:355-356` (prevUrl/prevText capture)
- Modify: `backend-ts/scripts/e2e-check.js:375` (waitForChange call)
- Modify: `backend-ts/scripts/e2e-check.js:416-438` (no-change handling)

- [ ] **Step 1: Replace waitForChange() with deep DOM snapshot comparison**

In `backend-ts/scripts/e2e-check.js`, replace lines 216-229 (the waitForChange function and its comment):

```javascript
// ── Deep DOM snapshot for change detection ────────────────────

async function takeDomSnapshot(page) {
  return page.evaluate(() => {
    const body = document.body;
    const text = (body?.innerText?.trim() || '').substring(0, 500);
    const topChildren = body ? Array.from(body.children).slice(0, 50).map(c =>
      c.tagName + (c.id ? '#' + c.id : '') + (c.className ? '.' + String(c.className).split(' ')[0] : '')
    ).join('|') : '';
    const modalCount = document.querySelectorAll(
      '[role="dialog"], .modal, [aria-modal="true"], dialog, [class*="modal"], [class*="popup"], [class*="overlay"], [class*="drawer"]'
    ).length;
    const visibleCount = document.querySelectorAll('*').length;
    return {
      url: window.location.href,
      text,
      domStructure: topChildren,
      scrollY: window.scrollY,
      modalCount,
      visibleCount,
    };
  }).catch(() => ({ url: '', text: '', domStructure: '', scrollY: 0, modalCount: 0, visibleCount: 0 }));
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
    if (Math.abs(cur.scrollY - prevSnapshot.scrollY) > 50) return { changed: true, type: 'scroll', url: cur.url };
    if (cur.visibleCount !== prevSnapshot.visibleCount) return { changed: true, type: 'elements-changed', url: cur.url };
  }
  return { changed: false, type: 'none', url: page.url() };
}
```

- [ ] **Step 2: Update the Phase 2 click loop to use deep snapshots**

In `backend-ts/scripts/e2e-check.js`, find lines 355-356 (the prevUrl/prevText capture before click):

Replace:
```javascript
        const prevUrl = page.url();
        const prevText = await page.evaluate(() => (document.body?.innerText?.trim() || '').substring(0, 200)).catch(() => '');
```

With:
```javascript
        const prevSnapshot = await takeDomSnapshot(page);
```

- [ ] **Step 3: Update the waitForChange call to use snapshot**

In `backend-ts/scripts/e2e-check.js`, find line 375:

Replace:
```javascript
          const change = await waitForChange(page, prevUrl, prevText);
```

With:
```javascript
          const change = await waitForChange(page, prevSnapshot);
```

- [ ] **Step 4: Replace the no-change handling with zero-tolerance (lines 416-438)**

In `backend-ts/scripts/e2e-check.js`, replace the entire `} else {` block at line 416 through the closing `}` at line 438:

Replace:
```javascript
          } else {
            clickResult.result = 'no-change';
            // Check if this button is in a group (profile selector, tabs, menu)
            if (el.type === 'button' || el.type === 'nav') {
              const isSuspicious = await page.evaluate((x, y) => {
                let target = document.elementFromPoint(x, y);
                if (!target) return false;
                const btn = target.closest('button, [role="button"]');
                if (!btn) return false;
                const parent = btn.parentElement;
                if (!parent) return false;
                const sibs = parent.querySelectorAll('button, [role="button"]').length;
                if (sibs >= 2) return true;
                const gp = parent.parentElement;
                return gp ? gp.querySelectorAll('button, [role="button"]').length >= 3 : false;
              }, el.x, el.y).catch(() => false);

              if (isSuspicious) {
                clickResult.error = `Button "${el.text}" in a group produced no change — broken click handler`;
                results.passed = false;
                results.errors.push(`[nav] Button "${el.text}" clicked but nothing happened — broken interaction`);
              }
            }
          }
```

With:
```javascript
          } else {
            clickResult.result = 'no-change';
            // Zero-tolerance: in a generated project, every interactive element MUST do something
            clickResult.error = `"${el.text}" (${el.type}) clicked but nothing happened — non-functional interactive element`;
            results.passed = false;
            results.errors.push(`[nav] "${el.text}" (${el.type}) clicked but nothing happened — broken interaction`);
          }
```

- [ ] **Step 5: Commit**

```bash
cd /Users/leon/Desktop/nexbit/drape/drape-react/backend-ts
git add scripts/e2e-check.js
git commit -m "feat(e2e): deep DOM analysis + zero-tolerance for dead buttons

- Replace shallow URL/text check with full DOM snapshot comparison
- Detect: URL change, text change, DOM structure change, modal open, scroll, element count
- Zero-tolerance: ANY interactive element that produces no change = error
- Remove old isSuspicious group-only check"
```

---

### Task 4: Fix QA Report Screenshots (verify-project.service.ts)

**Files:**
- Modify: `backend-ts/src/services/verify-project.service.ts:323-344`

- [ ] **Step 1: Collect screenshots for ALL pages and fix navigation field names**

In `backend-ts/src/services/verify-project.service.ts`, replace lines 323-344:

Replace:
```typescript
        // Capture pages and navigation for verification report
        if (e2e.pages) {
          pages = e2e.pages;
          // Collect screenshots from E2E — ALL pages (broken ones for auto-fix context)
          for (const pg of e2e.pages) {
            if (pg.screenshot && pg.errors?.length > 0) {
              screenshots.set(pg.path, pg.screenshot);
            }
          }
        }

        // Capture navigation results for verification report
        if (e2e.navigation) {
          navigation = e2e.navigation;
          // Collect screenshots from navigation test (click-through issues)
          for (const nav of e2e.navigation) {
            if (nav.error && nav.screenshot) {
              const key = `click:${nav.element?.text || 'unknown'}`;
              screenshots.set(key, nav.screenshot);
            }
          }
        }
```

With:
```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/leon/Desktop/nexbit/drape/drape-react/backend-ts && npx tsc --noEmit src/services/verify-project.service.ts 2>&1 | head -20`

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/leon/Desktop/nexbit/drape/drape-react/backend-ts
git add src/services/verify-project.service.ts
git commit -m "fix: collect screenshots for ALL pages in QA report

- Remove pg.errors?.length > 0 condition — screenshot every page
- Fix navigation field names: screenshotBefore/screenshotAfter (not screenshot)
- Add :before/:after suffix to nav screenshot keys for clarity"
```

---

### Task 5: Deploy to Server

**Files:**
- No code changes — deployment step

- [ ] **Step 1: Copy updated e2e-check.js to the server**

```bash
scp -P 49222 /Users/leon/Desktop/nexbit/drape/drape-react/backend-ts/scripts/e2e-check.js root@77.42.1.116:/usr/local/bin/e2e-check.js
```

The backend copies this script into containers during creation. Existing containers use the old version until recreated.

- [ ] **Step 2: Restart the backend to pick up verify-project.service.ts changes**

```bash
ssh -p 49222 root@77.42.1.116 'cd /opt/drape-backend && git pull && npm run build && pm2 restart drape-backend'
```

- [ ] **Step 3: Commit docs**

```bash
cd /Users/leon/Desktop/nexbit/drape/drape-react/backend-ts
git add docs/
git commit -m "docs: add preview quality hardening spec and plan"
```
