# QA Verification Report & Preview Gate — Design Spec

## Obiettivo

L'utente deve avere la certezza al 100% che ogni progetto generato funzioni. La preview non deve mai mostrare bug. Tutto quello che gli agenti di verifica fanno deve essere visibile in un report QA completo dentro Project History.

## Scope

- Creazione progetto senza cloud mode
- Ambiente dev usa `claude-sonnet-4-6` per tutti gli agenti
- Due agenti: Backend E2E (creazione) + Preview Auto-Fix (apertura preview)

---

## 1. Preview Gate — Preview bloccata fino a verifica completata

### Comportamento attuale
La preview WebView si mostra immediatamente quando il server è pronto. L'utente vede bug per 5-8 secondi prima che il fix parta.

### Nuovo comportamento
La preview resta su una schermata di loading minimale ("Controllo qualità in corso..." con spinner) finché l'Agente 2 (Preview Auto-Fix) non conferma `state === 'verified'`. Solo allora la WebView diventa visibile.

### Modifiche

**File: `src/features/terminal/components/PreviewPanel.tsx`**
- Aggiungere un gate: la WebView viene montata internamente per il preflight check ma resta nascosta (`opacity: 0, position: absolute, pointerEvents: none`)
- Mostrare un componente `PreviewVerifyingScreen` al posto della WebView
- `PreviewVerifyingScreen`: sfondo scuro, spinner, testo "Controllo qualità in corso..."
- Condizione per mostrare la WebView: `autoFix.state === 'verified'`
- Se l'auto-fix fallisce dopo N tentativi, mostrare un messaggio "Verifica non completata" con bottone "Mostra comunque"

**File: `src/features/terminal/hooks/usePreviewServerLifecycle.ts`**
- Il flusso interno resta uguale (mount WebView → preflight → fix se serve)
- La differenza è solo visuale: l'utente non vede la WebView durante il processo

---

## 2. Modello AI — Claude Sonnet 4.6 in dev

### Comportamento attuale
`usePreviewAutoFix.ts` ha `model: 'gemini-3-flash'` hardcoded (riga 179).

### Nuovo comportamento
In ambiente dev (`EXPO_PUBLIC_ENV === 'development'`), usare `claude-sonnet-4-6`. In produzione, mantenere `gemini-3-flash` per costi.

### Modifiche

**File: `src/hooks/preview/usePreviewAutoFix.ts`**
- Riga 179: sostituire il model hardcoded con una selezione basata sull'ambiente:
  ```
  const IS_DEV = process.env.EXPO_PUBLIC_ENV === 'development' || process.env.EXPO_PUBLIC_ENV === 'preview';
  const model = IS_DEV ? 'claude-sonnet-4-6' : 'gemini-3-flash';
  ```

---

## 3. Persistenza dati verifica — Salvare TUTTO

### Comportamento attuale
- `e2e-check.js`: screenshot in-memory, scartati dopo il fix
- `usePreviewAutoFix`: screenshot inviati all'AI, scartati
- `verify-project.service.ts`: risultati parziali nel BuildReport, nessun screenshot

### Nuovo comportamento
Entrambi gli agenti salvano tutto in un `VerificationReport` persistente.

### Struttura dati

```typescript
interface VerificationReport {
  projectId: string;
  createdAt: string;
  completedAt: string;
  status: 'passed' | 'failed' | 'partial';
  
  // Agente 1: Backend E2E (creazione)
  backendVerification: {
    attempts: VerificationAttempt[];
    totalDuration: number;
  };
  
  // Agente 2: Preview Auto-Fix (apertura preview)
  previewVerification: {
    attempts: VerificationAttempt[];
    totalDuration: number;
  };
}

interface VerificationAttempt {
  attemptNumber: number;
  timestamp: string;
  duration: number;
  status: 'passed' | 'failed' | 'fixed';
  
  // Pagine testate
  pages: PageResult[];
  
  // Click testati
  navigation: ClickResult[];
  
  // Fix applicati (se status === 'fixed')
  fixes?: FixAction[];
}

interface PageResult {
  path: string;
  status: 'ok' | 'error' | 'blank' | 'broken_images';
  screenshot: string; // base64 PNG — salvato SEMPRE, anche per pagine OK
  errors: string[];
  checks: {
    hasContent: boolean;
    hasStyles: boolean;
    hasError: boolean;
    isBlank: boolean;
    brokenImages: string[];
    jsErrors: string[];
  };
  loadTime: number;
}

interface ClickResult {
  element: {
    type: 'link' | 'button' | 'nav';
    text: string;
    href?: string;
  };
  fromPage: string;
  toPage: string | null;
  result: 'ok' | 'redirect_loop' | 'blank_page' | 'error_page' | 'no_change' | 'js_error';
  screenshotBefore?: string; // base64 — solo se errore
  screenshotAfter?: string;  // base64 — solo se errore
  error?: string;
}

interface FixAction {
  model: string;
  prompt: string;
  filesModified: string[];
  duration: number;
  screenshot?: string; // screenshot inviato all'AI
}
```

### Storage

**Backend (Agente 1):**
- Salvare in `.drape/verification-report.json` nella directory del progetto
- Modificare `verify-project.service.ts` per accumulare `VerificationReport` e scriverlo a fine verifica
- Modificare `e2e-check.js` per restituire TUTTI gli screenshot (non solo quelli con errore)

**Frontend (Agente 2):**
- Salvare via nuovo endpoint `POST /workstation/:projectId/verification-report`
- `usePreviewAutoFix` accumula i risultati in un ref e li invia al backend quando `state === 'verified'`
- Il backend fa merge con il report esistente (Agente 1) aggiungendo la sezione `previewVerification`

---

## 4. UI — Sezione QA in BuildReportView

### Posizione
Nuova sezione espandibile "Verifica & Test QA" dentro `BuildReportView.tsx`, dopo le sezioni esistenti (Creation, Chat Sessions).

### Contenuto

**Header sezione:**
- Icona shield/checkmark
- "Verifica & Test QA"
- Badge: "X pagine • Y click • Z fix" 
- Stato: verde (tutto OK) / arancione (fix applicati) / rosso (problemi residui)

**Sottosezione: Pagine Testate**
- Griglia di card, una per pagina
- Ogni card mostra:
  - Thumbnail screenshot (tappabile per fullscreen)
  - Path della pagina (`/`, `/dashboard`, `/settings`)
  - Stato: check verde / X rosso
  - Tempo di caricamento
  - Se errore: messaggio di errore sotto il thumbnail

**Sottosezione: Test Navigazione**
- Lista di tutti i click testati
- Ogni entry mostra:
  - Tipo (link/bottone/nav) + testo dell'elemento
  - Da → A (pagine)
  - Risultato: OK / redirect loop / pagina bianca / bottone rotto
  - Se errore: screenshot before/after tappabili

**Sottosezione: Fix Applicati**
- Timeline dei fix (se ce ne sono stati)
- Per ogni fix:
  - Tentativo N
  - Errore originale
  - File modificati
  - Modello AI usato
  - Durata

**Sottosezione: Riepilogo**
- Pagine totali testate
- Click totali testati
- Errori trovati
- Fix applicati
- Durata totale verifica
- Modello AI utilizzato

---

## 5. Modifiche per file

| File | Modifica |
|------|----------|
| `src/features/terminal/components/PreviewPanel.tsx` | Preview gate: WebView nascosta fino a verified |
| `src/features/terminal/components/PreviewVerifyingScreen.tsx` | NUOVO: loading screen "Controllo qualità" |
| `src/hooks/preview/usePreviewAutoFix.ts` | Model env-based, accumula report, invia a backend |
| `src/features/terminal/hooks/usePreviewServerLifecycle.ts` | Integrazione con preview gate |
| `src/features/terminal/components/views/BuildReportView.tsx` | Nuova sezione QA con screenshot grid |
| `src/features/terminal/components/views/VerificationReportSection.tsx` | NUOVO: componente sezione QA |
| `src/features/terminal/components/views/ScreenshotViewer.tsx` | NUOVO: modal fullscreen per screenshot |
| `backend-ts/scripts/e2e-check.js` | Restituire TUTTI gli screenshot, non solo errori |
| `backend-ts/src/services/verify-project.service.ts` | Salvare VerificationReport completo |
| `backend-ts/src/routes/workstation.routes.ts` | Endpoint GET/POST verification-report |

---

## 6. Fuori scope

- Cloud mode
- Modifica del flusso di creazione (step 1-4)
- Agent System (SSE path)
- Cambio modello AI in produzione
- Persistenza screenshot cross-session (solo per il progetto corrente)
