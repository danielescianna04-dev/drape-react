# Zero-Bug Quality Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Zero errori grafici, logici o funzionali nei progetti generati — 5 layer quality pipeline.

**Architecture:** Incrementale — ogni step è testabile indipendentemente. Si parte dal più semplice (page loading) e si aggiunge un layer alla volta fino al sistema completo.

**Tech Stack:** Puppeteer (nel container), Gemini 2.5 Flash REST API, Node.js

---

## Ordine di implementazione

```
Step 1-3:   qa-agent.js base (page loading + screenshot)     ← TESTA QUI
Step 4:     Click testing con CSS selectors                   ← TESTA QUI
Step 5:     Form filling + submit                             ← TESTA QUI
Step 6:     Multi-viewport (mobile/tablet/desktop)            ← TESTA QUI
Step 7:     Gemini Vision analysis                            ← TESTA QUI
Step 8:     Self-healing fix loop                             ← TESTA QUI
Step 9:     Rigenerazione pagine rotte                        ← TESTA QUI
Step 10:    Wiring nel backend (sostituisce e2e-check.js)     ← TESTA QUI
Step 11:    Project history UI                                ← TESTA QUI
Step 12:    Quality gate + generation prompt migliorati        ← TESTA QUI
```

---

### Step 1: qa-agent.js — scaffolding + page detection

**Files:** Create `backend-ts/scripts/qa-agent.js`

Crea lo scheletro base: detectPages(), logging, output format. Niente Puppeteer ancora.

- [ ] Crea `backend-ts/scripts/qa-agent.js` con:
  - `detectPages()` — copia da e2e-check.js, rileva route Next.js/Vite/React
  - `logAction(phase, action, detail)` — log array per history
  - `main()` — chiama detectPages, stampa JSON su stdout
  - Output: `{ "passed": true, "pages": [], "errors": [], "qaReport": { "status": "pending", "log": [...] } }`
- [ ] Test: `node --check backend-ts/scripts/qa-agent.js`
- [ ] Commit

**Come testare:** Copia lo script in un container con un progetto Next.js esistente e lancia `node qa-agent.js`. Deve stampare le pagine rilevate.

---

### Step 2: Page loading + screenshot

**Files:** Modify `backend-ts/scripts/qa-agent.js`

Aggiungi Puppeteer: carica ogni pagina, analizza contenuto/CSS/errori, screenshot.

- [ ] Aggiungi `analyzePage(page)` — controlla hasContent, hasStyles, hasError, isBlank, brokenImages
- [ ] Aggiungi `functionalTest(browser)` con solo page loading:
  - Launch Puppeteer headless
  - Per ogni pagina: goto, wait hydration, analyzePage, screenshot base64
  - Raccogli errori JS via `page.on('pageerror')`
  - Return `{ pages: [...], issues: [...], screenshots: {...} }`
- [ ] Aggiungi output backward-compatible su stdout
- [ ] Commit

**Come testare:** Lancia in un container con dev server attivo. Verifica che:
- Ogni pagina ha uno screenshot base64
- Le pagine con errori vengono flaggate
- Le pagine blank vengono flaggate

---

### Step 3: Wire nel backend (primo test end-to-end)

**Files:**
- Modify `backend-ts/src/services/workspace.service.ts`
- Modify `backend-ts/src/services/verify-project.service.ts`

Collega qa-agent.js al pipeline di creazione, AFFIANCANDOLO a e2e-check.js (non sostituirlo ancora).

- [ ] In `workspace.service.ts`: aggiungi blocco copia `qa-agent.js` al container (dopo il blocco di e2e-check.js)
- [ ] In `verify-project.service.ts`: DOPO la chiamata a e2e-check.js, aggiungi una seconda chiamata a qa-agent.js in parallelo, logga il risultato senza influenzare il pass/fail
- [ ] Commit

**Come testare:** Crea un progetto. Nei log del backend devi vedere:
- `[Workspace] Copied qa-agent.js to container`
- Output del qa-agent.js nei log (pagine trovate, screenshot catturati)
- Il vecchio e2e-check.js continua a funzionare normalmente

---

### Step 4: Click testing

**Files:** Modify `backend-ts/scripts/qa-agent.js`

Aggiungi click testing con CSS selectors (non coordinate).

- [ ] Aggiungi `getClickableElements(page)` — ritorna array con `{ type, text, selector, href }`
  - Priorità selector: `#id` > `[data-testid]` > `[aria-label]` > CSS path
  - Filtra: solo elementi visibili, >= 10px, con testo
- [ ] In `functionalTest()`: dopo page loading, per ogni pagina:
  - Naviga alla pagina
  - Trova clickable elements
  - Per ognuno: snapshot DOM → click via selector (fallback coordinate) → waitForChange → verifica no errori
  - Screenshot before/after
  - Registra risultato: navigation, dom-change, modal, scroll, no-change (= bug)
- [ ] Commit

**Come testare:** Lancia in un container. Verifica che:
- Trova bottoni e link
- Li clicca (verifica nel log che il click ha effetto)
- "no-change" viene flaggato come issue
- Screenshot before/after salvati

---

### Step 5: Form filling

**Files:** Modify `backend-ts/scripts/qa-agent.js`

Aggiungi rilevamento e compilazione form.

- [ ] Aggiungi `detectAndFillForms(page)`:
  - Trova tutti i `<form>` nella pagina
  - Per ogni input: identifica tipo (email, password, name, tel, ecc.)
  - Riempi con `getTestValue(type, name, placeholder)` — dati realistici
  - Submit tramite click del bottone submit
  - Screenshot before/after
  - Verifica: no errore JS, pagina non si rompe
- [ ] `getTestValue()` — mappa tipo→valore (email→test@example.com, name→John Doe, ecc.)
- [ ] Integra in `functionalTest()` dopo il click testing
- [ ] Commit

**Come testare:** Crea un progetto con form (es. contact page). Verifica che:
- I form vengono trovati
- I campi vengono riempiti con dati appropriati
- Il submit viene eseguito
- Nessun crash dopo il submit

---

### Step 6: Multi-viewport testing

**Files:** Modify `backend-ts/scripts/qa-agent.js`

Testa su 3 viewport: mobile, tablet, desktop.

- [ ] Definisci viewport:
  ```javascript
  const VIEWPORTS = [
    { name: 'mobile', width: 430, height: 932 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 720 },
  ];
  ```
- [ ] Modifica `functionalTest()`: esegui page loading + screenshot per OGNI viewport
  - Click testing e form testing solo su mobile (per non triplicare il tempo)
  - Screenshot su tutti e 3
- [ ] Organizza screenshots per viewport: `screenshots['mobile:/'] = base64`
- [ ] Commit

**Come testare:** Verifica che il report contiene screenshot per ogni viewport × ogni pagina. Le dimensioni degli screenshot devono corrispondere ai viewport.

---

### Step 7: Gemini Vision analysis

**Files:** Modify `backend-ts/scripts/qa-agent.js`

Aggiungi Phase 2: invia screenshot a Gemini per analisi visiva.

- [ ] Aggiungi `callGeminiVision(parts)` — HTTP POST a `generativelanguage.googleapis.com` via modulo `https` nativo
  - Endpoint: `/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`
  - Body: `{ contents: [{ parts }], generationConfig: { temperature: 0.1, maxOutputTokens: 4096 } }`
- [ ] Aggiungi `visualTest(screenshots)`:
  - Batch max 4 screenshot per request
  - Prompt QA: analizza overlap, testo tagliato, layout rotto, colori, spacing, coerenza
  - Richiedi output JSON: `{ issues: [...], quality_score: N, looks_professional: bool }`
  - Parsifica risposta, raccogli issues
- [ ] Integra in `main()`: dopo functionalTest, chiama visualTest con gli screenshot
- [ ] Commit

**Come testare:** Serve `GEMINI_API_KEY` nel container. Verifica che:
- L'API viene chiamata
- Ricevi una risposta con quality_score
- Le issues visive vengono riportate (se presenti)
- Se no API key → skip graceful (non crash)

---

### Step 8: Self-healing fix loop

**Files:** Modify `backend-ts/scripts/qa-agent.js`

Aggiungi Phase 3: fix automatico + re-test completo.

- [ ] Aggiungi `selfHeal(functionalIssues, visualIssues)`:
  - Filtra solo critical + high severity
  - Leggi file sorgente del progetto (page files, layout, globals)
  - Invia a Gemini: issues + source files → fix JSON `[{ path, content }]`
  - Applica fix scrivendo i file
  - Return `{ applied: bool, filesModified: string[] }`
- [ ] Modifica `main()` — loop:
  ```
  for cycle 1..3:
    functional = functionalTest()
    visual = visualTest()
    if zero critical/high → VERIFIED, break
    selfHeal() → wait 5s hot reload → continue loop
  ```
- [ ] Commit

**Come testare:** Crea un progetto che ha un bug noto (es. bottone senza onClick). Verifica che:
- Il bug viene rilevato nel cycle 1
- Il fix viene applicato
- Il cycle 2 ri-testa e trova meno problemi
- Lo status finale è "verified" o "failed" con report

---

### Step 9: Rigenerazione pagine rotte

**Files:** Modify `backend-ts/scripts/qa-agent.js`

Se dopo 3 fix una pagina è ancora rotta, rigenerala da zero.

- [ ] Aggiungi `regeneratePage(pagePath, projectDescription)`:
  - Leggi la descrizione originale del progetto da `.drape/project-meta.json` (se esiste)
  - Invia a Gemini: "Rigenera questa pagina da zero per un progetto {technology} chiamato {name}: {description}"
  - Scrivi il nuovo file
- [ ] Modifica `main()`: dopo 3 cicli falliti, identifica pagine ancora rotte → chiama `regeneratePage()` per ognuna → re-test finale
- [ ] Commit

**Come testare:** Crea un progetto con una pagina volutamente rotta che resiste ai fix. Verifica che:
- Dopo 3 tentativi di fix, la pagina viene rigenerata
- La pagina rigenerata viene ri-testata
- Lo status finale migliora

---

### Step 10: Sostituzione completa di e2e-check.js

**Files:**
- Modify `backend-ts/src/services/verify-project.service.ts`

Ora qa-agent.js è maturo. Sostituisci e2e-check.js come script principale.

- [ ] In `verify-project.service.ts` line ~292: sostituisci la chiamata a `e2e-check.js` con `qa-agent.js`:
  ```
  GEMINI_API_KEY=${key} NODE_PATH=... timeout 180 node /usr/local/bin/qa-agent.js
  ```
- [ ] Aggiorna lettura stderr: `/tmp/qa-stderr.txt`
- [ ] Parsifica il `qaReport` dal risultato e aggiungilo al verification report
- [ ] Commit

**Come testare:** Crea un progetto. L'intero pipeline di verifica deve usare qa-agent.js. Verifica nei log:
- QA phases: functional → visual → fix (se necessario) → verified
- Il risultato determina pass/fail del progetto
- Il vecchio e2e-check.js non viene più chiamato

---

### Step 11: Project History UI

**Files:**
- Modify `backend-ts/src/services/build-report.service.ts`
- Modify `backend-ts/src/routes/workstation.routes.ts`
- Modify `src/features/terminal/components/views/VerificationSection.tsx`
- Modify `src/features/terminal/components/views/BuildReportView.tsx`

Mostra tutto il lavoro del QA Agent nella project history.

- [ ] `build-report.service.ts`: aggiungi metodi `qaAction()` e `updateQaSummary()`
- [ ] `workstation.routes.ts`: logga QA actions nel build report (prima/dopo verify)
- [ ] `VerificationSection.tsx`:
  - Aggiungi tipi `QAReport`, `VisualIssue`
  - Mostra quality score badge (verde/giallo/rosso)
  - Mostra lista tentativi con issues trovati
  - Mostra issues visivi con severity dots
  - Mostra file fixati per tentativo
- [ ] `BuildReportView.tsx`:
  - Aggiungi icone per step `qa-*` (shield icon, colori per stato)
  - Mostra quality score come badge
- [ ] Commit

**Come testare:** Crea un progetto e apri la pagina Project History nell'app. Verifica che:
- Appare la sezione "QA Verification"
- Mostra il quality score
- Mostra i tentativi e le issues trovate
- Le icone sono corrette per ogni fase

---

### Step 12: Quality gate + prompt generazione migliorati

**Files:**
- Modify `backend-ts/src/routes/workstation.routes.ts`

Layer 1 (prevenzione) + Layer 5 (gate).

- [ ] Nel system prompt di generazione (`getProjectCreationSystemPrompt`), aggiungi:
  - "Use shadcn/ui components (Button, Card, Input, Dialog, etc.) for all UI elements"
  - "Use Tailwind CSS exclusively for styling — no inline styles, no CSS modules"
  - "Every button must have a working onClick handler"
  - "Every link must navigate to an existing page"
  - "Every form must have proper validation and submit handling"
- [ ] Aggiungi quality gate: se `qaReport.status !== 'verified'` o `qaReport.qualityScore < 8`, logga warning e mantieni lo stato come "needs review" nel task
- [ ] Commit

**Come testare:** Crea un nuovo progetto Next.js. Verifica che:
- Il codice generato usa shadcn/ui (cerca import da @/components/ui)
- Tutti i bottoni hanno onClick
- Il quality score finale è >= 8/10
- Se score < 8, la preview mostra un avviso

---

## Riepilogo step

| # | Cosa fa | Puoi testare |
|---|---------|-------------|
| 1 | Scaffolding qa-agent.js + detectPages | Script gira, trova pagine |
| 2 | Page loading + screenshot | Screenshot di ogni pagina |
| 3 | Wire nel backend (parallelo a e2e) | Vedi output nei log del server |
| 4 | Click testing con selectors | Bottoni vengono cliccati, risultati loggati |
| 5 | Form filling + submit | Form compilati e submittati |
| 6 | Multi-viewport | Screenshot mobile + tablet + desktop |
| 7 | Gemini Vision analysis | Quality score e issues visivi |
| 8 | Self-healing fix loop | Bug auto-fixati, re-test |
| 9 | Rigenerazione pagine rotte | Pagina rotta → rigenerata → funziona |
| 10 | Sostituzione e2e-check.js | qa-agent.js è il principale |
| 11 | Project History UI | Tutto visibile nell'app |
| 12 | Quality gate + prompt migliori | Score >= 8, shadcn/ui nel codice |
