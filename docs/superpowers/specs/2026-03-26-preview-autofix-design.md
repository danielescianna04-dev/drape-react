# Preview Auto-Fix System — Design Spec

## Overview

When a user starts a preview, the system verifies the page works before showing it. If errors are found (white screen, JS errors, broken rendering), the system automatically sends a screenshot + error details to the AI agent, which fixes the code. The loop continues until the preview works. The user never sees a broken page.

## Architecture

### Flow

```
"Avvia Anteprima" → Server start → WebView loads (hidden) → Check → OK? → Show preview
                                                              ↓ NO
                                                    Show "Fixing..." status
                                                              ↓
                                                    Screenshot + errors → AI agent (SSE)
                                                              ↓
                                                    AI fixes files → Hot reload
                                                              ↓
                                                    Wait → Re-check → Loop until OK
```

### Key Decisions

- **Location**: Everything inside PreviewPanel — no new screens
- **Agent**: Dedicated SSE stream (same backend endpoint), NOT the user's chat
- **Screenshot**: Real image via react-native-view-shot, sent as base64 to AI
- **Retries**: Unlimited — keeps fixing until resolved
- **Visibility**: User sees loading messages inside PreviewPanel, chat stays clean

## Components

### 1. `usePreviewAutoFix` hook (NEW)

Location: `src/hooks/preview/usePreviewAutoFix.ts`

Responsibilities:
- Manages preflight state machine: `idle` → `checking` → `fixing` → `rechecking` → `verified` | `fixing`
- Opens a dedicated SSE stream to `/api/workstation/:id/agent` for fix requests
- Sends screenshot (base64) + JS errors + DOM info as the fix prompt
- Tracks fix attempt count and current status message
- Listens to SSE events to update status messages in real-time

State machine:
```
idle → checking → verified (show preview)
                → fixing → rechecking → verified
                                      → fixing (loop)
```

Interface:
```typescript
interface UsePreviewAutoFixReturn {
  preflightState: 'idle' | 'checking' | 'fixing' | 'rechecking' | 'verified';
  statusMessage: string;
  fixAttempt: number;
  startPreflight: (errors: string[], screenshot: string | null, domInfo: { rootChildren: number }) => void;
  reset: () => void;
}
```

### 2. PreviewPanel modifications

Changes to existing `src/features/terminal/components/PreviewPanel.tsx`:

- WebView renders with `opacity: 0` until preflight passes
- After WebView first load completes (PAGE_INFO received), trigger preflight check
- Capture screenshot via ViewShot ref on the WebView container
- Collect JS errors from the existing onMessage handler
- Pass errors + screenshot to `usePreviewAutoFix`
- Show status messages in the existing loading screen UI
- On `verified` → animate opacity to 1, show preview

### 3. Status Messages (granular)

| State | Event | Message |
|-------|-------|---------|
| checking | Start | "Verifico che tutto funzioni..." |
| fixing | Error found | "Ho trovato un problema..." |
| fixing | Analyzing | "Analizzo l'errore..." |
| fixing | SSE opened | "Invio il problema all'AI..." |
| fixing | AI thinking | "L'AI sta ragionando sulla soluzione..." |
| fixing | AI tool_start | "Scrittura codice correttivo..." |
| fixing | AI tool_complete | "File aggiornati, riavvio..." |
| fixing | Hot reload | "Applico le modifiche..." |
| rechecking | Re-check | "Verifico la correzione... (tentativo N)" |
| fixing | Still broken | "Non ancora risolto, riprovo con un approccio diverso..." |
| verified | OK | "Tutto pronto!" |

### 4. Fix Prompt Template

```
La preview del progetto ha dei problemi. Analizza lo screenshot e gli errori, poi fixa il codice.

Errori JavaScript:
{jsErrors.join('\n')}

Info DOM:
- Root children: {rootChildren}
- Schermo bianco: {rootChildren === 0 ? 'SI' : 'NO'}

[screenshot allegato come immagine base64]

REGOLE:
- Fixa SOLO i file necessari, non riscrivere tutto
- Assicurati che tutti i componenti abbiano 'use client' se usano hooks
- Non accedere a window/document/localStorage durante il render
- Se manca una dipendenza, aggiungila al package.json
```

## Files

| File | Action |
|------|--------|
| `src/hooks/preview/usePreviewAutoFix.ts` | CREATE |
| `src/features/terminal/components/PreviewPanel.tsx` | MODIFY |

## Dependencies

- `react-native-view-shot` — for WebView screenshot capture (check if already installed)
