# Session Notes — 3 Aprile 2026

## Obiettivo
Fix 4 problemi critici della preview + setup completo Claude Sonnet 4.6 per tutta la pipeline di creazione in dev.

---

## Fix Implementati

### 1. CSS Flash/Zoom sulle transizioni di pagina
**File:** `src/features/terminal/components/PreviewWebView.tsx`
- Aggiunto guard `window.__drapeInit` nel `injectedJavaScriptBeforeContentLoaded` — lo script si esegue UNA sola volta per sessione WebView, non ad ogni navigazione SPA
- Cambiato `style.innerHTML` a `style.textContent` (piu sicuro)
- Aggiunto CSS anti-flash: `-webkit-tap-highlight-color: transparent` e `* { touch-action: pan-x pan-y; }`

### 2. Pinch-to-Zoom disabilitato
**File:** `src/features/terminal/components/PreviewWebView.tsx`
- Viewport mobile: `maximum-scale=1.0, user-scalable=no` (era `5.0, yes`)
- Viewport desktop: `maximum-scale=1.0, user-scalable=no` (era `5.0, yes`)
- Rimosso `scalesPageToFit={true}` dal WebView (abilitava zoom nativo)
- CSS `touch-action: pan-x pan-y` come fallback se l'app generata sovrascrive il viewport

### 3. E2E Detection Aggressiva + Deep DOM Analysis
**File:** `backend-ts/scripts/e2e-check.js`

**getClickableElements() espanso:**
- Rileva elementi con `cursor: pointer` (computed style — copre Tailwind `cursor-pointer`)
- Rileva `tabindex`, `data-action`, `input[type=button]`
- Rileva broken links (`<a>` senza href, `<a href="#">`)
- Deduplicazione bounding box (evita contare parent+child)
- Filtro viewport PRIMA dello slice (200 elementi visibili, non 200 nel DOM)
- Filtro dimensione minima 10x10px

**waitForChange() con DOM snapshot:**
- `takeDomSnapshot()` cattura 6 segnali: URL, testo, struttura DOM (top 50 children), scroll position, conteggio modali, conteggio elementi
- Rileva: navigazione, cambio contenuto, cambio DOM, apertura modale, scroll, cambio numero elementi

**Zero-tolerance:**
- OGNI elemento interattivo che non produce cambiamenti dopo il click = errore
- Rimossa la vecchia logica "isSuspicious" che controllava solo bottoni in gruppo
- `broken-link` tipo riportato come errore strutturale senza tentare il click

**Fix qualita post-review:**
- Guard `new URL(change.url)` contro crash su URL vuoto
- `testedClicks` key include `fromPage` (evita skip cross-pagina)
- `page.waitForTimeout` deprecato sostituito con `Promise`

### 4. Screenshot QA Report per TUTTE le pagine
**File:** `backend-ts/src/services/verify-project.service.ts`
- Rimossa condizione `pg.errors?.length > 0` — screenshot raccolti per TUTTE le pagine
- Fix campo navigazione: legge `screenshotBefore`/`screenshotAfter` (non `screenshot` che non esisteva)
- Chiavi navigation con suffisso `:before`/`:after`

---

## Fix Aggiuntivi (scoperti durante testing)

### 5. Model ID auto-fix frontend
**File:** `src/hooks/preview/usePreviewAutoFix.ts`
- Fix: `claude-sonnet-4-6` (ID Anthropic) -> `claude-4-6-sonnet` (chiave interna backend)
- Il backend mappa `claude-4-6-sonnet` -> `claude-sonnet-4-6` internamente
- L'ID sbagliato causava `ProviderModelNotFoundError` e loop infinito auto-fix

### 6. Console.error -> console.warn per proxy error
**File:** `src/features/terminal/components/PreviewWebView.tsx`
- `console.error('WebView detected proxy error:')` cambiato a `console.warn`
- Evita la LogBox rossa di React Native per errori proxy transient

### 7. Tutta la creazione usa Claude Sonnet 4.6 in dev
**File:** `backend-ts/src/routes/workstation.routes.ts`
- Architettura (step 1): `gemini-3-flash` -> `claude-4-6-sonnet`
- Generazione codice (step 2): fallback da `gemini-3-flash` x2 -> `claude-4-6-sonnet` x3
- Ora l'intera pipeline (architettura, codice, build-fix, verify-fix, preview-fix) usa Claude

### 8. Fix copia e2e-check.js nel container Docker
**File:** `backend-ts/src/services/workspace.service.ts`
- **Problema 1:** `fileService.writeFile` troncava il file (23166 vs 23724 bytes)
  - Fix: usa `fs.copyFileSync` sul bind mount host
- **Problema 2:** `coder` user non ha permessi su `/usr/local/bin/`
  - Fix: usa `docker cp` (esegue come root) invece di `exec cp` dentro il container
- Aggiunto logging con byte count per debug

---

## Problemi Aperti

### Crediti Anthropic esauriti
- L'API key Anthropic sul server dev ha crediti insufficienti
- Errore: `"Your credit balance is too low to access the Anthropic API"`
- **Azione:** ricaricare crediti su console.anthropic.com
- Senza crediti: la creazione, auto-fix backend, e auto-fix preview non funzionano

### Click testing (0 Click nel QA)
- Lo script e2e-check.js nuovo e stato deployato e il `docker cp` dovrebbe copiarlo nel container
- Non ancora verificato su un progetto nuovo (blocked dai crediti Anthropic)
- Il fix del `docker cp` (permessi root) dovrebbe risolvere il problema
- Da verificare alla prossima creazione

### Bottoni non funzionanti nelle app generate
- Cuore, stella, impostazioni — non funzionano nelle dating app generate
- L'E2E migliorato (zero-tolerance) dovrebbe rilevarli
- L'auto-fix (Claude) dovrebbe poi correggerli
- Non verificato end-to-end (blocked dai crediti)

---

## File Modificati (riepilogo)

| File | Modifiche |
|------|-----------|
| `src/features/terminal/components/PreviewWebView.tsx` | Fix 1, 2, 6 |
| `backend-ts/scripts/e2e-check.js` | Fix 3 |
| `backend-ts/src/services/verify-project.service.ts` | Fix 4 |
| `src/hooks/preview/usePreviewAutoFix.ts` | Fix 5 |
| `backend-ts/src/routes/workstation.routes.ts` | Fix 7 |
| `backend-ts/src/services/workspace.service.ts` | Fix 8 |

## Commits
- `a65704d` — fix: preview quality hardening (4 fix principali)
- `e926901` — docs: spec e piano implementazione
- Uncommitted: fix 5, 6, 7, 8 (da committare)
