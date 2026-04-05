# Zero-Bug Quality Pipeline — 5 Layer Design

**Date**: 2026-04-05
**Status**: v2 — Complete pipeline
**Goal**: Zero errori grafici, logici o funzionali nei progetti generati. L'utente non vede MAI un progetto rotto.

---

## 5 Layer Architecture

```
┌─────────────────────────────────────────────────────┐
│ LAYER 1: GENERAZIONE (prevenzione)                  │
│ - Prompt migliorati con shadcn/ui obbligatorio      │
│ - Validazione struttura codice pre-write             │
├─────────────────────────────────────────────────────┤
│ LAYER 2: BUILD VERIFICATION                         │
│ - TypeScript compilation check                       │
│ - Build success check                                │
│ - Dev server startup verification                    │
├─────────────────────────────────────────────────────┤
│ LAYER 3: FUNCTIONAL TESTING (Puppeteer)             │
│ - Page loading (tutti i route)                       │
│ - Click testing (ogni bottone/link con CSS selector) │
│ - Form testing (fill + submit + verify)              │
│ - Multi-viewport: mobile / tablet / desktop          │
├─────────────────────────────────────────────────────┤
│ LAYER 4: VISUAL TESTING (Gemini Vision)             │
│ - Screenshot ogni pagina × ogni viewport             │
│ - AI analisi: layout, overlap, colori, spacing       │
│ - Coerenza cross-page (header/nav/footer)            │
├─────────────────────────────────────────────────────┤
│ LAYER 5: SELF-HEALING + QUALITY GATE                │
│ - Auto-fix funzionale + visivo                       │
│ - Se 3 fix falliscono → RIGENERA pagina da zero      │
│ - Re-test completo dopo ogni fix                     │
│ - Quality score >= 8/10 obbligatorio                 │
│ - BLOCCA preview finché non passa                    │
└─────────────────────────────────────────────────────┘
```

---

## Layer 1: Generation Quality

### Problema attuale
Il system prompt di generazione non forza componenti testati. L'AI genera HTML/CSS custom che spesso ha bug visivi.

### Soluzione
- Forzare shadcn/ui + Radix primitives nel prompt (per Next.js/React)
- Richiedere Tailwind CSS per tutti gli stili
- Vietare CSS custom inline e styled-components
- Validare struttura import/export prima di scrivere file

### File coinvolti
- `backend-ts/src/routes/workstation.routes.ts` — system prompt di generazione

---

## Layer 2: Build Verification

### Stato attuale
Già implementato in `verify-project.service.ts`:
- Aspetta dev server ready
- Controlla HTTP status
- Legge server log per errori
- Auto-fix build errors con AI

### Miglioramenti
- Nessun cambiamento necessario — funziona già

---

## Layer 3: Functional Testing

### Nuovo script: `qa-agent.js`

Sostituisce `e2e-check.js` con testing intelligente.

**3a. Page Loading**
- Carica ogni route rilevato
- Verifica: HTTP 200, contenuto visibile, CSS applicato, no errori JS
- Screenshot per ogni pagina

**3b. Click Testing**
- Trova elementi cliccabili via CSS selector (non coordinate)
- Clicca ognuno, verifica che succede qualcosa
- Dopo click: verifica no errori, no pagina bianca, no 404
- Screenshot before/after per ogni click

**3c. Form Testing**
- Rileva form nella pagina
- Compila con dati realistici (email, nome, password, ecc.)
- Submit e verifica risposta (no errore, cambio pagina o messaggio success)

**3d. Multi-Viewport**
- Test su 3 viewport: mobile (430×932), tablet (768×1024), desktop (1280×720)
- Ogni viewport: screenshot + analisi

### Output
```json
{
  "passed": true,
  "pages": [{ "path": "/", "status": 200, "screenshot": "base64...", "errors": [] }],
  "navigation": [{ "element": {...}, "fromPage": "/", "result": "navigation", "toPage": "/about" }],
  "errors": [],
  "qaReport": {
    "status": "verified",
    "qualityScore": 9,
    "attempts": [...]
  }
}
```

---

## Layer 4: Visual Testing

### Gemini Vision Analysis

Invia screenshot (tutti i viewport) a Gemini 2.5 Flash con prompt specifico.

**Cosa controlla:**
- Overlap di elementi
- Testo tagliato o illeggibile
- Layout rotto o disallineato
- Spacing incoerente
- Sezioni vuote
- Immagini rotte
- Coerenza header/nav/footer tra pagine
- Aspetto professionale generale

**Output:**
```json
{
  "issues": [
    { "page": "/", "type": "overlap", "severity": "critical", "description": "..." }
  ],
  "quality_score": 8,
  "looks_professional": true
}
```

---

## Layer 5: Self-Healing + Quality Gate

### Flusso

```
Issues trovati?
├─ NO → VERIFIED ✅ (quality >= 8/10)
└─ SÌ → Fix cycle:
    ├─ Attempt 1: AI fix → re-test completo
    ├─ Attempt 2: AI fix → re-test completo
    ├─ Attempt 3: AI fix → re-test completo
    └─ Ancora rotto? → RIGENERA pagine rotte da zero
        └─ Re-test finale → VERIFIED o FAILED con report
```

### Rigenerazione
Quando 3 fix non bastano per una pagina specifica:
- Leggi la descrizione del progetto originale
- Rigenera SOLO quella pagina con un nuovo prompt
- Non tocca le pagine che funzionano
- Re-testa tutto dopo rigenerazione

### Quality Gate
- Score minimo: 8/10
- Zero issue critical
- Zero issue high
- Preview bloccata finché non passa

---

## Project History Integration

Ogni azione del QA Agent viene loggata nel build report:

| Step | Icona | Cosa mostra |
|------|-------|-------------|
| `qa-functional` | 🛡️ | Pagine testate, click, form |
| `qa-visual` | 👁️ | Screenshot, issues visivi, quality score |
| `qa-fix` | 🔧 | File fixati, tentativo N |
| `qa-regenerate` | ♻️ | Pagine rigenerate da zero |
| `qa-verified` | ✅ | Score finale, tutto OK |
| `qa-failed` | ❌ | Issues rimanenti, report |

Tutto visibile nella pagina Project History dell'app.

---

## File Changes Summary

| File | Action | Layer |
|------|--------|-------|
| `backend-ts/scripts/qa-agent.js` | CREATE | 3,4,5 |
| `backend-ts/src/routes/workstation.routes.ts` | MODIFY | 1,5 |
| `backend-ts/src/services/verify-project.service.ts` | MODIFY | 3,4,5 |
| `backend-ts/src/services/workspace.service.ts` | MODIFY | 3 |
| `backend-ts/src/services/build-report.service.ts` | MODIFY | History |
| `src/features/terminal/components/views/VerificationSection.tsx` | MODIFY | History |
| `src/features/terminal/components/views/BuildReportView.tsx` | MODIFY | History |

---

## Success Criteria

1. ✅ Zero bottoni/link non funzionanti
2. ✅ Zero bug visivi critical/high
3. ✅ Layout corretto su mobile, tablet, desktop
4. ✅ Form funzionanti (fill + submit)
5. ✅ Quality score >= 8/10
6. ✅ Coerenza visiva tra pagine
7. ✅ Tutto visibile nella project history
8. ✅ Preview bloccata finché non verificato
