# Analisi Architetturale — Drape (Aprile 2026)

## 1. Sistema di Creazione Progetto

### Flusso a 4 step

| Step | Schermata | Cosa succede |
|------|-----------|--------------|
| 1 | **Descrivi idea** | 6 chip pre-compilati + TextInput (max 500 char). `fetchAiQuestions()` parte in parallelo |
| 2 | **AI Interview** | 4 domande generate da Gemini Flash con multi-select chips. Se API fallisce, skip silenzioso |
| 3 | **Scegli tecnologia** | Griglia 2 colonne (React, Next.js, HTML, Vue, Astro, RN). AI raccomanda con badge viola |
| 4 | **Nome + Conferma** | Summary card editabile. Le risposte interview vengono appendate alla descrizione via `getEnrichedDescription()` |

### Due path di creazione

- **Old Creation (attivo in prod)**: `useAgentSystem = false` hardcoded. Fire-and-forget + polling ogni 900ms
- **Agent System (futuro)**: SSE streaming via OpenCode dentro il container Docker

### Pipeline backend (`generateProject()`)

```
Template → Cloud DB (Neon/Supabase) → AI Architecture Plan → Full Code Generation (streaming)
→ File extraction/writing → Normalize deps → Warm container → Install deps → Dev server start
→ Next.js build loop (3 tentativi con auto-fix) → E2E Verify → SSR Capture → Done
```

### File chiave

- `src/features/projects/CreateProjectScreen.tsx` — Wizard UI
- `backend-ts/src/routes/workstation.routes.ts` — API endpoint + `generateProject()`
- `backend-ts/src/routes/ai.routes.ts` — Interview questions + tech recommendation
- `src/core/ai/useAgentStream.ts` — SSE client per Agent System
- `backend-ts/src/services/workspace.service.ts` — Container lifecycle

---

## 2. Sistema Auto-Fix Errori

### Due path di detection

| Path | Trigger | Screenshot | Restart |
|------|---------|------------|---------|
| **Path A** (build failure) | Terminale: 2+ righe con `error:` nelle ultime 30 | No | Full server restart |
| **Path B** (runtime error) | WebView: JS injection dopo 2.5s di preflight | Si (`react-native-view-shot`) | WebView reload |

### Flusso

```
Errore → usePreviewAutoFix.reportCheckResult()
→ Prompt con errori + screenshot + regole
→ SSE a /agent/run/fast (gemini-3-flash)
→ OpenCode nel container modifica file
→ 3s attesa hot reload → Re-check → Loop
```

### File chiave

- `src/hooks/preview/usePreviewAutoFix.ts` — State machine fix
- `src/features/terminal/hooks/usePreviewServerLifecycle.ts` — Orchestratore
- `src/features/terminal/components/PreviewPanel.tsx` — Coordinatore top-level
- `src/features/terminal/components/PreviewWebView.tsx` — JS injection per error detection
- `backend-ts/src/routes/agent.routes.ts` — `/agent/run/fast` endpoint

---

## 3. Sistema E2E Verification

### Architettura

Puppeteer gira dentro il container Docker, non nell'app mobile.

### Phase 1 — Page Loading

Per ogni pagina: navigazione, wait hydration, analisi contenuto/CSS/errori/immagini rotte.

### Phase 2 — Click-Through Testing

Trova tutti gli elementi interattivi (link, bottoni, nav items) e per ognuno:
- Click → aspetta 3s per cambiamento
- Detecta: redirect loop, pagina bianca, errore, bottone rotto in gruppo, JS errors post-click

### Auto-fix E2E

`claude-4-6-sonnet` con screenshot + file context. Max 3 tentativi.

### File chiave

- `backend-ts/scripts/e2e-check.js` — Script Puppeteer
- `backend-ts/src/services/verify-project.service.ts` — Orchestratore verify/fix
- `backend-ts/scripts/ssr-capture.js` — HTML statico post-verifica

---

## 4. Modelli AI usati

| Sistema | Modello |
|---------|---------|
| Domande interview | `gemini-3-flash` → `claude-3.5-haiku` |
| Raccomandazione tech | `gemini-3.1-flash-lite` |
| Generazione codice | `claude-4-6-sonnet` → `gemini-3-flash` |
| Auto-fix preview (frontend) | `gemini-3-flash` |
| Auto-fix E2E (backend) | `claude-4-6-sonnet` |
| Auto-fix Next.js build | `claude-4-6-sonnet` |

---

## 5. Bug e Problemi Trovati

- **Nessun limite hard di retry** in `usePreviewAutoFix` — loop infinito su errori non risolvibili
- **`isMountedRef` dead code** — mai settato a false su unmount
- **Errori env non catchati da Path A** — `isEnvRelatedMessage` gira solo nel WebView handler
- **Task in-memory** — server restart = task perso, client fa polling infinito
- **Step numbering invertita** in CreateProjectScreen — confusione nel codice
- **Rate limit 10 req/min** su `/agent/run` — fix multipli rapidi possono hitare il limit
