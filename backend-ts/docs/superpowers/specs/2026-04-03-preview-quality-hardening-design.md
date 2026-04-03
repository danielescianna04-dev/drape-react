# Preview Quality Hardening — Design Spec

> **Goal:** Fix 4 critical preview quality issues: CSS flash/zoom on page transitions, pinch-to-zoom enabled, non-clickable buttons undetected by E2E, and missing screenshots in QA report.

**Architecture:** 4 independent fixes across 3 files. No new files needed. Each fix is isolated and can be deployed independently.

**Tech Stack:** React Native WebView (iOS/Android), Puppeteer (E2E in Docker), Express backend (verification service)

---

## Fix 1: CSS Flash/Zoom on Page Transitions

### Problem

`PreviewWebView.tsx:208-286` — `injectedJavaScriptBeforeContentLoaded` re-injects the viewport meta tag and a white background `<style>` on every SPA navigation. This causes a visible "flash" / zoom effect when switching pages.

Additionally, `scalesPageToFit={true}` (line 524) enables native WebView zoom which compounds the visual glitch.

### Root Cause Files

- `src/features/terminal/components/PreviewWebView.tsx:146-166` (runtime viewport switch)
- `src/features/terminal/components/PreviewWebView.tsx:208-286` (injected JS)
- `src/features/terminal/components/PreviewWebView.tsx:524` (`scalesPageToFit`)

### Solution

1. **Add guard flag in injected JS**: Wrap the entire `injectedJavaScriptBeforeContentLoaded` body with `if (window.__drapeInit) return; window.__drapeInit = true;` so it only executes once per WebView session, not on every SPA navigation.

2. **Remove `scalesPageToFit={true}`** (line 524): This native prop enables zoom behavior that causes visual glitches during page transitions. Remove it entirely.

3. **Add anti-flash CSS in the injected style block**:
   ```css
   html, body {
     background-color: #ffffff !important;
     -webkit-tap-highlight-color: transparent;
   }
   ```

4. **Add `touch-action: pan-x pan-y`** to the injected CSS to prevent zoom gestures even if the generated app overrides the viewport meta tag:
   ```css
   * { touch-action: pan-x pan-y; }
   ```

### Files Modified

- `src/features/terminal/components/PreviewWebView.tsx`

---

## Fix 2: Disable Pinch-to-Zoom in Mobile Mode

### Problem

`PreviewWebView.tsx:150-151` and `229-231` — The viewport meta tag uses `maximum-scale=5.0, user-scalable=yes` for BOTH mobile and desktop modes. In mobile preview mode, users accidentally zoom when trying to tap buttons.

### Root Cause Files

- `src/features/terminal/components/PreviewWebView.tsx:149-151` (runtime viewport switch effect)
- `src/features/terminal/components/PreviewWebView.tsx:228-231` (initial viewport in injected JS)

### Solution

1. **Mobile mode viewport**: Change to `width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no`

2. **Desktop mode viewport**: Change to `width=1280, initial-scale=0.3, minimum-scale=0.1, maximum-scale=1.0, user-scalable=no`

3. **CSS fallback**: The `touch-action: pan-x pan-y` from Fix 1 also prevents pinch-to-zoom at CSS level, providing defense-in-depth if the generated app overrides the viewport meta tag.

### Files Modified

- `src/features/terminal/components/PreviewWebView.tsx`

---

## Fix 3: E2E Aggressive Clickable Element Detection + Deep DOM Analysis

### Problem

`e2e-check.js:140-214` — `getClickableElements()` only finds `button, [role="button"], [onclick]`. AI-generated projects frequently use `<div>` with `cursor-pointer` Tailwind class, `<a>` without href, or `<span>` with click handlers that are semantically invisible to the current detection.

The "no-change" detection (`e2e-check.js:419-438`) only flags buttons "in a group" as suspicious. A single broken button that does nothing passes silently.

### Root Cause Files

- `backend-ts/scripts/e2e-check.js:140-214` (`getClickableElements` function)
- `backend-ts/scripts/e2e-check.js:416-438` (no-change detection logic)

### Solution

#### 3a. Expand `getClickableElements()` to find ALL interactive elements

Add detection for:
- Elements with `cursor: pointer` computed style (covers Tailwind `cursor-pointer`, inline styles, CSS classes)
- `<a>` tags without `href` or with `href="#"` that have text content (broken links)
- Elements with `tabindex="0"` or `tabindex` attribute (keyboard-accessible = intended interactive)
- `input[type="button"]`, `input[type="submit"]` outside forms
- Elements with `data-action`, `data-testid` containing "button"/"btn"/"click"

Deduplication: Use bounding box overlap detection — if a child element's bounding box is fully contained within a parent that's already captured, skip the child (avoids double-counting icon inside button).

#### 3b. Replace shallow `waitForChange()` with Deep DOM Analysis

Before click:
```
snapshot = {
  url: page.url(),
  bodyText: document.body.innerText.substring(0, 500),
  domHash: hash of outerHTML of top 50 elements,
  scrollY: window.scrollY,
  modalCount: document.querySelectorAll('[role="dialog"], .modal, [aria-modal="true"], dialog').length,
  visibleElementCount: visible elements count
}
```

After click (wait 500ms):
```
Compare each field. ANY change = click worked. NO change at all = BUG.
```

#### 3c. Zero-tolerance for no-change clicks

Remove the "isSuspicious" group check (lines 419-438). Replace with:

**In a freshly generated project, EVERY interactive element MUST produce an observable change when clicked.** If nothing changes after a click, report it as an error unconditionally:
```
`Button "${el.text}" clicked but nothing happened — non-functional interactive element`
```

This is valid because:
- AI-generated projects have no legitimate reason for dead buttons
- Clipboard operations, analytics events, etc. are not generated in these simple apps
- If a future project legitimately needs a "no-op" button, the E2E can be extended then (YAGNI)

### Files Modified

- `backend-ts/scripts/e2e-check.js`

---

## Fix 4: Screenshots for ALL Pages in QA Report

### Problem

`verify-project.service.ts:324-332` — Screenshots are collected only for pages WITH errors:
```typescript
if (pg.screenshot && pg.errors?.length > 0) {
  screenshots.set(pg.path, pg.screenshot);
}
```

Pages that pass get no screenshot in the report.

Additionally, navigation click screenshots use field `nav.screenshot` (line 339) but `e2e-check.js` saves them as `nav.screenshotBefore` / `nav.screenshotAfter`.

### Root Cause Files

- `backend-ts/src/services/verify-project.service.ts:324-332` (page screenshot collection)
- `backend-ts/src/services/verify-project.service.ts:336-344` (navigation screenshot collection)

### Solution

1. **Collect screenshots for ALL pages** (remove the `pg.errors?.length > 0` condition):
   ```typescript
   for (const pg of e2e.pages) {
     if (pg.screenshot) {
       screenshots.set(pg.path, pg.screenshot);
     }
   }
   ```

2. **Fix navigation screenshot field names** — read `screenshotBefore`/`screenshotAfter` instead of `screenshot`:
   ```typescript
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
   ```

3. **Include page screenshots in verification report** — the `pages` array is already passed to the report, but ensure the `screenshot` field is preserved (not stripped).

### Files Modified

- `backend-ts/src/services/verify-project.service.ts`

### Frontend Already Ready

`VerificationSection.tsx` already renders screenshots via `PageCard` and `NavItem` components. The `ScreenshotThumbnail` component handles base64 display. No frontend changes needed — once the data arrives correctly, screenshots will appear.

---

## Summary of Changes

| Fix | File | Lines Changed (approx) |
|-----|------|----------------------|
| 1. CSS Flash/Zoom | `PreviewWebView.tsx` | ~15 lines |
| 2. Pinch-to-Zoom | `PreviewWebView.tsx` | ~6 lines (same file as Fix 1) |
| 3. E2E Detection | `e2e-check.js` | ~80 lines |
| 4. QA Screenshots | `verify-project.service.ts` | ~15 lines |

**Total: 3 files, ~116 lines changed. No new files.**

## Testing Strategy

- **Fix 1+2**: Manual test — open preview, navigate between pages, verify no flash and no zoom possible
- **Fix 3**: Create a test project with intentionally broken buttons, run E2E, verify they're caught
- **Fix 4**: Create a project, check verification report shows screenshots for all pages

## Deployment Note

`e2e-check.js` runs inside Docker containers at `/usr/local/bin/e2e-check.js`. After modifying the local copy at `backend-ts/scripts/e2e-check.js`, it must be deployed to the server and copied into the Docker image (or bind-mounted). The backend server copies this script during container creation.

## Risk Assessment

- **Fix 1+2**: Low risk — viewport/CSS changes, easy to verify visually
- **Fix 3**: Medium risk — more aggressive click detection may produce false positives on legitimate non-interactive elements that happen to have `cursor: pointer`. Mitigated by bounding box deduplication and filtering out elements smaller than 10x10px.
- **Fix 4**: Low risk — expanding data collection, no logic change
