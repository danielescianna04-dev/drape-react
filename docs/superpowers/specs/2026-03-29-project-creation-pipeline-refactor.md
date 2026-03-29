# Project Creation Pipeline Refactor

## Problem

The current project creation pipeline lets users see broken previews: CSS not loading, blank screens, build errors, hydration failures. The auto-fix system (BuildCheck) is fragile — it relies on regex matching server logs, runs only if prior steps succeed, and tests from inside the container (where things work) rather than through the proxy (where they break).

## Design Principle

**The user NEVER sees a broken preview.** The preview opens only after automated verification confirms every page loads correctly with styles, content, and zero errors.

## Architecture

### What the AI Controls vs What's Locked

**Locked (AI cannot modify):**
- `package.json` — template deps are final, AI deps are ADDED (template versions win on conflict)
- `tsconfig.json`, `next.config.ts`, `vite.config.ts`, `postcss.config.mjs`
- `app/globals.css` (Next.js), `src/index.css` (React/Vue)
- `app/layout.tsx` base structure (html/body tags, CSS import, suppressHydrationWarning)

**AI generates freely:**
- Pages (`app/*/page.tsx`, `src/pages/*.tsx`)
- Components (`app/components/*.tsx`, `src/components/*.tsx`)
- Tailwind classes, inline styles, CSS modules
- Images, mock data, text content
- Additional API routes

### Pipeline: 4 Stages

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  1. GENERATE │───▶│  2. BUILD    │───▶│  3. VERIFY   │───▶│  4. PRESENT  │
│  AI + Template│   │  Install+Start│   │  Puppeteer   │    │  User sees   │
│              │    │              │    │  all pages   │    │  preview     │
└─────────────┘    └──────────────┘    └──────┬───────┘    └──────────────┘
                                              │ fail
                                              ▼
                                       ┌──────────────┐
                                       │  3b. AUTO-FIX │
                                       │  AI fixes     │──── loop max 3x
                                       │  then re-verify│    back to step 3
                                       └──────────────┘
```

---

### Stage 1: GENERATE

No changes to the current AI generation flow, except:

1. **Protected files list** — expanded and enforced strictly:
   ```
   package.json, tsconfig.json, next.config.ts, next.config.js,
   vite.config.ts, vite.config.js, postcss.config.mjs, postcss.config.js,
   tailwind.config.ts, tailwind.config.js, astro.config.mjs,
   app/globals.css, app/layout.tsx (only html/body/head structure),
   src/index.css, index.html
   ```

2. **Package.json merge** — AI-generated deps are added, but template versions always win on conflict:
   ```typescript
   merged.dependencies = { ...aiGenerated.dependencies, ...templateDeps.dependencies };
   merged.devDependencies = { ...aiGenerated.devDependencies, ...templateDeps.devDependencies };
   ```

3. **Inline fixes during write** (existing, keep):
   - Auto-add `'use client'` when hooks detected
   - Remove `lucide-react` / `@heroicons` imports
   - Fix `better-sqlite3` imports

---

### Stage 2: BUILD

Sequential, with timeouts:

1. **Create container** (existing)
2. **Install deps** — timeout 90s, lock timeout 60s
   - If install fails → read error → fix package.json → retry (max 2x)
3. **Start dev server** — with turbopack fallback chain
   - `next dev --turbopack || next dev --turbo || next dev`
   - Wait for HTTP 200 on localhost:3000 — timeout 30s
   - If server crashes → read server.log → proceed to Stage 3 (which will catch the error)

**Key change:** Stage 2 NEVER blocks Stage 3. Even if the server returns 500 or crashes, we proceed to verification. The verification stage is the single source of truth.

---

### Stage 3: VERIFY (new — replaces fragile BuildCheck)

A single, comprehensive verification function: `verifyProject(projectId, userId)`.

**Returns:** `{ passed: boolean, errors: string[], screenshots: Map<string, string> }`

**Steps:**

1. **Server health check**
   - `curl -s -w "%{http_code}" http://localhost:3000`
   - If HTTP 000 → error: "Server not running"
   - If HTTP 500 → read response body for error message

2. **Run Puppeteer E2E** (enhanced `e2e-check.js`)
   - Auto-detect all pages from project structure
   - For EACH page:
     - Navigate with `networkidle2`, timeout 12s
     - Collect console errors (filter noise: favicon, DevTools)
     - Collect network failures (CSS/JS not loading)
     - Check for error overlays (Next.js error dialog, "Application error")
     - Check content: `body.innerText.length > 20`
     - Check styles: `getComputedStyle` on first meaningful element
     - Take screenshot (for AI context if fix needed)
   - Return structured result: `{ passed, pages[], errors[] }`

3. **Read server logs**
   - `cat /home/coder/server.log | tail -80`
   - Scan for ANY error pattern (broad match, not specific regex):
     ```
     /Error:|ERROR:|error:|CssSyntaxError|Can't resolve|Cannot find module|
      Module not found|ENOENT|SyntaxError|TypeError|ReferenceError|
      Unexpected token|error TS\d+|ERESOLVE|failed to resolve/
     ```

4. **Combine results**
   - Merge Puppeteer errors + server log errors
   - Deduplicate
   - If zero errors → `passed: true`

---

### Stage 3b: AUTO-FIX (on verify failure)

When `verifyProject` returns `passed: false`:

1. **Build AI fix prompt:**
   ```
   Fix these errors in a {technology} project:

   ERRORS:
   {combined errors from verify}

   BROKEN FILES:
   {read each file mentioned in errors}

   SCREENSHOTS:
   {base64 screenshots of broken pages}

   Return JSON: [{"path": "file.tsx", "content": "complete fixed content"}]
   Rules:
   - DO NOT modify: package.json, tsconfig.json, postcss.config, globals.css, layout.tsx structure
   - Return COMPLETE file content
   - Use react-icons, never lucide-react
   - Add 'use client' when using hooks
   ```

2. **Apply fixes** — write files to container

3. **Restart dev server** — kill + re-start

4. **Re-run `verifyProject`** — if still fails, loop (max 3 attempts)

5. **After 3 failed attempts** — proceed to Stage 4 anyway (user sees "Correggi con AI" button as fallback)

---

### Stage 4: PRESENT

- Send final SSE event: `{ step: 'ready', previewUrl, projectInfo }`
- App shows preview
- If verify passed → user sees working preview
- If verify failed after 3 attempts → user sees preview with "Correggi con AI" button (existing behavior, but now rare)

---

## Files to Modify

### Backend

| File | Change |
|------|--------|
| `backend-ts/src/routes/workstation.routes.ts` | Refactor `createProjectWithTemplate` — replace inline BuildCheck with `verifyProject` call |
| `backend-ts/src/services/verify-project.service.ts` | **NEW** — extracted verification logic |
| `backend-ts/scripts/e2e-check.js` | Already enhanced (keep current version) |
| `backend-ts/scripts/screenshot.js` | Already enhanced (keep current version) |
| `backend-ts/src/services/dependency.service.ts` | Already has 60s lock timeout (keep) |
| `backend-ts/src/services/project-detector.service.ts` | Already has turbopack fallback (keep) |

### Frontend (no changes needed)

The app already handles:
- Progress bar during creation
- Preview display when ready
- "Correggi con AI" fallback button
- Error screen as last resort

---

## Key Design Decisions

1. **Single `verifyProject` function** — all verification in one place, not scattered across the pipeline. Easy to test, easy to improve.

2. **Puppeteer is the source of truth** — not regex on server logs. If Puppeteer sees a working page with styles, it's working. If it sees errors, it's broken. Period.

3. **Stage 2 never blocks Stage 3** — even if install/server has issues, verification runs and catches everything. No more "BuildCheck never reached."

4. **Template infra is sacred** — the AI can make pages ugly, but it can't make them crash. Config/deps/CSS setup never change.

5. **3 fix attempts max** — prevents infinite loops. After 3, show the preview anyway with manual fix option.

---

## Success Criteria

- Zero "Preview non supportata" errors for supported stacks
- Zero CSS-not-loading errors for new projects
- Zero blank/white screen on project creation
- BuildCheck/verify runs for 100% of projects (never skipped due to deadlock/timeout)
- Auto-fix resolves 80%+ of generation errors without user intervention
