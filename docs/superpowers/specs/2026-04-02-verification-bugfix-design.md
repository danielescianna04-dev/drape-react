# Fix Sistema Verifica & Auto-Fix — Design Spec

## Problema

Il progetto T6inder creato, E2E ha trovato `/chat/[id]` bianca ma:
1. Auto-fix crashato al primo tentativo e smesso (0 fix applicati)
2. 0 click tests eseguiti (Phase 2 non ha trovato elementi)
3. Preview mostra schermata bianca all'avvio

## Root Cause Analysis

### Bug 1: Auto-fix si ferma al primo fallimento

**File:** `backend-ts/src/services/verify-project.service.ts:111-114`

Se `autoFix()` restituisce `applied: false` (AI crash, JSON invalido, eccezione), il loop fa `break`. Non riprova mai.

**Fix:** `break` diventa `continue`. Il loop riprova con il prossimo tentativo.

### Bug 2: 0 click tests

**File:** `backend-ts/scripts/e2e-check.js`

`getClickableElements()` ha `.catch(() => [])` — crasha silenziosamente. Nessun log per capire cosa succede. Possibile timeout sulla ri-navigazione o hydration incompleta.

**Fix:** Logging in getClickableElements, wait per hydration prima di cercare elementi, timeout aumentato.

### Bug 3: Preview bianca

Puppeteer testa localhost:3000, WebView testa via proxy. La pagina funziona in locale ma non via proxy.

**Fix:** Aggiungere proxy health check dopo E2E. Se la pagina non risponde via proxy, segnalarlo come errore.

## Modifiche per file

### verify-project.service.ts

1. **Riga 111-114**: `break` diventa `continue` quando auto-fix fallisce
2. **Riga 588-590**: Log con stack trace nel catch di autoFix
3. **Post-verify**: Proxy health check via curl al proxy URL

### e2e-check.js

1. **getClickableElements**: Log a stderr quanti elementi trovati
2. **Phase 2 pre-click**: `page.waitForTimeout(1000)` per hydration
3. **Phase 2 navigation timeout**: 8000ms diventa 12000ms
4. **Post-Phase 2**: Warning se 0 click ma pagine avevano bottoni
