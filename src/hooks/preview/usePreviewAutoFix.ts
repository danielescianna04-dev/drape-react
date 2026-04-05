/**
 * usePreviewAutoFix — Dedicated SSE agent stream for auto-fixing preview errors.
 *
 * Runs independently from the user's chat. Opens its own SSE connection to
 * /agent/run/fast, sends screenshot + errors, and tracks fix progress via
 * granular status messages. Loops until the preview works.
 */

import { useCallback, useRef, useState } from 'react';
import EventSource from 'react-native-sse';
import { config } from '../../config/config';
import { useAuthStore } from '../../core/auth/authStore';
import { getAuthToken } from '../../core/api/getAuthToken';

// ── Types ────────────────────────────────────────────────────────────

export type PreflightState =
  | 'idle'        // Not started
  | 'loading'     // WebView loading
  | 'checking'    // Checking for errors
  | 'fixing'      // AI is fixing
  | 'rechecking'  // Re-checking after fix
  | 'verified';   // All good — show preview

export type FixStatus =
  | 'error_found'
  | 'analyzing'
  | 'sending'
  | 'ai_thinking'
  | 'ai_writing'
  | 'files_updated'
  | 'hot_reloading'
  | 'rechecking'
  | 'still_broken';

const STATUS_MESSAGES: Record<string, string> = {
  idle: '',
  loading: 'Caricamento pagina...',
  checking: 'Verifico che tutto funzioni...',
  error_found: 'Ho trovato un problema...',
  analyzing: 'Analizzo l\'errore...',
  sending: 'Invio il problema all\'AI...',
  ai_thinking: 'L\'AI sta ragionando sulla soluzione...',
  ai_writing: 'Scrittura codice correttivo...',
  files_updated: 'File aggiornati, riavvio...',
  hot_reloading: 'Applico le modifiche...',
  rechecking: 'Verifico la correzione...',
  still_broken: 'Non ancora risolto, riprovo con un approccio diverso...',
  verified: 'Tutto pronto!',
};

export interface PreviewAutoFixReturn {
  state: PreflightState;
  statusMessage: string;
  fixAttempt: number;
  isFixing: boolean;

  /** Call after WebView finishes loading. Transitions to 'checking'. */
  onWebViewLoaded: () => void;

  /** Call with check results. Triggers fix if errors found. */
  reportCheckResult: (result: CheckResult) => void;

  /** Reset to idle (e.g. when preview is closed). */
  reset: () => void;
}

export interface CheckResult {
  rootChildren: number;
  jsErrors: string[];
  screenshotBase64: string | null;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function usePreviewAutoFix(projectId: string | undefined): PreviewAutoFixReturn {
  const [state, setState] = useState<PreflightState>('idle');
  const [fixStatus, setFixStatus] = useState<FixStatus | null>(null);
  const [fixAttempt, setFixAttempt] = useState(0);

  const esRef = useRef<EventSource | null>(null);
  const conversationRef = useRef<any[]>([]); // Accumulate fix conversation for context
  const reportRef = useRef<{
    attempts: Array<{
      attemptNumber: number;
      timestamp: string;
      status: string;
      jsErrors: string[];
      rootChildren: number;
      screenshotBase64: string | null;
    }>;
  }>({ attempts: [] });
  const isMountedRef = useRef(true);

  // Derive display message from state + fixStatus
  const statusMessage =
    state === 'fixing' && fixStatus
      ? (fixAttempt > 1 && fixStatus === 'rechecking'
          ? `${STATUS_MESSAGES.rechecking} (tentativo ${fixAttempt})`
          : STATUS_MESSAGES[fixStatus] || STATUS_MESSAGES.fixing || '')
      : state === 'rechecking'
        ? `${STATUS_MESSAGES.rechecking} (tentativo ${fixAttempt})`
        : STATUS_MESSAGES[state] || '';

  // ── Cleanup ──────────────────────────────────────────────────────

  const closeStream = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    closeStream();
    setState('idle');
    setFixStatus(null);
    setFixAttempt(0);
    conversationRef.current = [];
    reportRef.current = { attempts: [] };
  }, [closeStream]);

  // ── WebView loaded → start checking ──────────────────────────────

  const onWebViewLoaded = useCallback(() => {
    setState('checking');
  }, []);

  // ── Fix via SSE ──────────────────────────────────────────────────

  const startFix = useCallback(async (result: CheckResult) => {
    if (!projectId) return;

    const attempt = fixAttempt + 1;
    setFixAttempt(attempt);
    setState('fixing');
    setFixStatus('error_found');

    // Build prompt
    const errorLines = result.jsErrors.length > 0
      ? `Errori JavaScript:\n${result.jsErrors.map(e => `- ${e}`).join('\n')}`
      : 'Nessun errore JS catturato.';

    const domInfo = `Info DOM:\n- Root children: ${result.rootChildren}\n- Schermo bianco: ${result.rootChildren === 0 ? 'SI' : 'NO'}`;

    const attemptNote = attempt > 1
      ? `\n\nQUESTO E\' IL TENTATIVO ${attempt}. I fix precedenti NON hanno funzionato. Prova un approccio DIVERSO. Controlla bene imports, 'use client', e dipendenze.`
      : '';

    const prompt = `La preview del progetto ha dei problemi. Analizza lo screenshot e gli errori, poi fixa il codice.

${errorLines}

${domInfo}${attemptNote}

REGOLE:
- Fixa SOLO i file necessari, non riscrivere tutto
- Assicurati che tutti i componenti abbiano 'use client' se usano hooks React
- Non accedere a window/document/localStorage durante il render, usa useEffect
- Se manca una dipendenza, aggiungila al package.json
- Il fix deve risolvere il problema al primo colpo`;

    // Build images array (screenshot)
    const images = result.screenshotBase64
      ? [{ type: 'base64', media_type: 'image/png', data: result.screenshotBase64 }]
      : [];

    // Add to conversation history for context across attempts
    conversationRef.current.push({ role: 'user', content: prompt });

    setTimeout(() => isMountedRef.current && setFixStatus('analyzing'), 500);
    setTimeout(() => isMountedRef.current && setFixStatus('sending'), 1200);

    try {
      const authToken = await getAuthToken(true);
      const url = `${config.apiUrl}/agent/run/fast`;

      closeStream();

      const es = new EventSource(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          prompt,
          projectId,
          model: 'gemini-3-flash',
          conversationHistory: conversationRef.current,
          images,
          thinkingLevel: 'low',
          userId: useAuthStore.getState().user?.uid || null,
          userPlan: useAuthStore.getState().user?.plan || 'free',
        }),
      });

      esRef.current = es;

      // Track SSE events for status updates
      const handleEvent = (eventType: string) => (event: any) => {
        if (!isMountedRef.current) return;
        try {
          const data = event?.data ? JSON.parse(event.data) : {};

          switch (eventType) {
            case 'thinking_start':
            case 'thinking':
              setFixStatus('ai_thinking');
              break;
            case 'tool_start':
              setFixStatus('ai_writing');
              break;
            case 'tool_complete':
              setFixStatus('files_updated');
              break;
            case 'text_delta':
            case 'message':
              // AI is responding with text — still processing
              break;
            case 'complete':
            case 'done':
              // AI finished — wait for hot reload then re-check
              setFixStatus('hot_reloading');
              conversationRef.current.push({
                role: 'assistant',
                content: data.message || data.summary || 'Fix applied.',
              });
              closeStream();
              // Give hot reload time to apply
              setTimeout(() => {
                if (isMountedRef.current) {
                  setFixStatus('rechecking');
                  setState('rechecking');
                }
              }, 3000);
              break;
            case 'error':
            case 'fatal_error':
              // AI stream error — retry after delay
              console.warn('[AutoFix] Stream error:', data);
              closeStream();
              setTimeout(() => {
                if (isMountedRef.current) {
                  setFixStatus('still_broken');
                  setState('rechecking');
                }
              }, 2000);
              break;
          }
        } catch (e) {
          // Parse error — ignore
        }
      };

      const eventTypes = [
        'processing', 'thinking_start', 'thinking', 'thinking_end',
        'tool_start', 'tool_input', 'tool_complete', 'tool_error',
        'text_delta', 'message', 'complete', 'done',
        'error', 'fatal_error',
      ];

      for (const type of eventTypes) {
        (es as any).addEventListener(type, handleEvent(type));
      }

      (es as any).addEventListener('error', (err: any) => {
        console.warn('[AutoFix] EventSource error:', err);
        closeStream();
        // Retry after delay
        setTimeout(() => {
          if (isMountedRef.current) {
            setState('rechecking');
          }
        }, 3000);
      });

    } catch (err) {
      console.error('[AutoFix] Failed to start fix stream:', err);
      // Retry after delay
      setTimeout(() => {
        if (isMountedRef.current) {
          setState('rechecking');
        }
      }, 3000);
    }
  }, [projectId, fixAttempt, closeStream]);

  // ── Report check result ──────────────────────────────────────────

  const reportCheckResult = useCallback((result: CheckResult) => {
    const hasErrors = result.jsErrors.length > 0;
    const isBlankScreen = result.rootChildren === 0;

    reportRef.current.attempts.push({
      attemptNumber: fixAttempt + (hasErrors || isBlankScreen ? 1 : 0),
      timestamp: new Date().toISOString(),
      status: (!hasErrors && !isBlankScreen) ? 'passed' : 'failed',
      jsErrors: result.jsErrors,
      rootChildren: result.rootChildren,
      screenshotBase64: result.screenshotBase64,
    });

    if (!hasErrors && !isBlankScreen) {
      // All good!
      setState('verified');
      setFixStatus(null);
      closeStream();

      // Send preview verification data to backend (fire and forget)
      if (projectId) {
        getAuthToken(true).then(authToken => {
          fetch(`${config.apiUrl}/workstation/${projectId}/verification-report`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
            body: JSON.stringify({
              previewVerification: {
                attempts: reportRef.current.attempts,
                totalDuration: reportRef.current.attempts.length > 0
                  ? Date.now() - new Date(reportRef.current.attempts[0].timestamp).getTime()
                  : 0,
              },
            }),
          }).catch(err => console.warn('[AutoFix] Failed to save report:', err));
        }).catch(() => {});
      }
    } else {
      // Needs fix
      startFix(result);
    }
  }, [startFix, closeStream, fixAttempt, projectId]);

  return {
    state,
    statusMessage,
    fixAttempt,
    isFixing: state === 'fixing' || state === 'rechecking',
    onWebViewLoaded,
    reportCheckResult,
    reset,
  };
}
