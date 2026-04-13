/**
 * Preview state machine — pure reducer with explicit phase transitions.
 *
 * Every transition is guarded by the current phase so impossible
 * state combinations are rejected at the type level.
 */
import { useReducer } from 'react';
import type { PreviewState, PreviewEvent } from './previewMachine.types';

// ── Initial state ───────────────────────────────────────────

export const INITIAL_PREVIEW_STATE: PreviewState = {
  phase: 'idle',
  projectId: null,
  previewUrl: null,
  machineId: null,
  accessToken: null,
  hasWebUi: true,
  currentStep: null,
  progress: 0,
  displayedMessage: '',
  startupLogs: [],
  terminalOutput: [],
  envVarsRequired: null,
  error: null,
  sessionExpiredMessage: null,
  webViewReady: false,
  canGoBack: false,
  canGoForward: false,
  viewportMode: 'mobile',
  autoFix: { active: false, attempt: 0, maxAttempts: 3, statusMessage: null },
};

// ── Reducer ─────────────────────────────────────────────────

export function previewReducer(state: PreviewState, event: PreviewEvent): PreviewState {
  // ── Global events (valid from any phase) ──────────────────

  switch (event.type) {
    case 'RESET':
      return { ...INITIAL_PREVIEW_STATE };

    case 'STOP_REQUESTED':
      return {
        ...INITIAL_PREVIEW_STATE,
        viewportMode: state.viewportMode,
      };

    case 'SESSION_EXPIRED':
      return {
        ...state,
        phase: 'session_expired',
        sessionExpiredMessage: event.message,
        error: null,
        autoFix: { ...state.autoFix, active: false, statusMessage: null },
      };

    case 'FATAL_ERROR':
      return {
        ...state,
        phase: 'fatal_error',
        error: event.error,
        autoFix: { ...state.autoFix, active: false, statusMessage: null },
      };

    case 'NAV_STATE_CHANGED':
      return {
        ...state,
        canGoBack: event.canGoBack,
        canGoForward: event.canGoForward,
        previewUrl: event.url ?? state.previewUrl,
      };

    case 'VIEWPORT_MODE_CHANGED':
      return {
        ...state,
        viewportMode: event.mode,
      };

    default:
      break;
  }

  // ── Phase-specific transitions ────────────────────────────

  switch (state.phase) {
    // ── idle ─────────────────────────────────────────────────
    case 'idle': {
      if (event.type === 'START_REQUESTED') {
        return {
          ...state,
          phase: 'starting',
          projectId: event.projectId,
          error: null,
          currentStep: 'analyzing',
          progress: 0,
          displayedMessage: 'Starting preview...',
          startupLogs: [],
          terminalOutput: [],
          webViewReady: false,
          sessionExpiredMessage: null,
        };
      }
      return state;
    }

    // ── preflight_env ────────────────────────────────────────
    case 'preflight_env': {
      if (event.type === 'PREFLIGHT_OK') {
        return {
          ...state,
          phase: 'starting',
          envVarsRequired: null,
          currentStep: 'booting',
          displayedMessage: 'Environment ready, starting server...',
        };
      }
      return state;
    }

    // ── starting ─────────────────────────────────────────────
    case 'starting': {
      switch (event.type) {
        case 'PREFLIGHT_ENV_MISSING':
          return {
            ...state,
            phase: 'preflight_env',
            envVarsRequired: event.vars,
            displayedMessage: 'Environment variables required',
          };

        case 'STARTUP_STEP':
          return {
            ...state,
            currentStep: event.step,
            progress: event.progress ?? state.progress,
            displayedMessage: event.message ?? state.displayedMessage,
          };

        case 'STARTUP_LOG':
          return {
            ...state,
            startupLogs: [...state.startupLogs, event.log],
          };

        case 'HEALTH_OK':
          return {
            ...state,
            phase: 'loading_webview',
            previewUrl: event.url,
            machineId: event.machineId ?? state.machineId,
            accessToken: event.accessToken ?? state.accessToken,
            progress: 90,
            displayedMessage: 'Loading preview...',
          };

        case 'HEALTH_RETRY':
          return {
            ...state,
            phase: 'waiting_health',
            displayedMessage: event.message ?? 'Waiting for server...',
          };

        case 'ENV_ERROR':
          return {
            ...state,
            phase: 'preflight_env',
            envVarsRequired: event.vars?.map((key) => ({ key, required: true })) ?? null,
            displayedMessage: event.message,
          };

        default:
          return state;
      }
    }

    // ── waiting_health ───────────────────────────────────────
    case 'waiting_health': {
      switch (event.type) {
        case 'HEALTH_OK':
          return {
            ...state,
            phase: 'loading_webview',
            previewUrl: event.url,
            machineId: event.machineId ?? state.machineId,
            accessToken: event.accessToken ?? state.accessToken,
            progress: 90,
            displayedMessage: 'Loading preview...',
          };

        case 'HEALTH_RETRY':
          return {
            ...state,
            displayedMessage: event.message ?? state.displayedMessage,
          };

        case 'STARTUP_LOG':
          return {
            ...state,
            startupLogs: [...state.startupLogs, event.log],
          };

        default:
          return state;
      }
    }

    // ── loading_webview ──────────────────────────────────────
    case 'loading_webview': {
      switch (event.type) {
        case 'WEBVIEW_READY':
          return {
            ...state,
            phase: 'ready',
            webViewReady: true,
            progress: 100,
            displayedMessage: '',
            error: null,
          };

        case 'WEBVIEW_BUILD_ERROR': {
          const recoverable = state.autoFix.attempt < state.autoFix.maxAttempts;
          if (recoverable) {
            return {
              ...state,
              phase: 'fixing',
              error: { kind: 'build_failure', message: event.message, recoverable: true },
              autoFix: {
                ...state.autoFix,
                active: true,
                attempt: state.autoFix.attempt + 1,
                statusMessage: 'Analyzing build error...',
              },
            };
          }
          return {
            ...state,
            phase: 'fatal_error',
            error: { kind: 'build_failure', message: event.message, recoverable: false },
            autoFix: { ...state.autoFix, active: false },
          };
        }

        case 'WEBVIEW_RUNTIME_ERROR': {
          const recoverable = state.autoFix.attempt < state.autoFix.maxAttempts;
          if (recoverable) {
            return {
              ...state,
              phase: 'fixing',
              error: { kind: 'runtime_failure', message: event.message, recoverable: true },
              autoFix: {
                ...state.autoFix,
                active: true,
                attempt: state.autoFix.attempt + 1,
                statusMessage: 'Analyzing runtime error...',
              },
            };
          }
          return {
            ...state,
            phase: 'fatal_error',
            error: { kind: 'runtime_failure', message: event.message, recoverable: false },
            autoFix: { ...state.autoFix, active: false },
          };
        }

        default:
          return state;
      }
    }

    // ── ready ────────────────────────────────────────────────
    case 'ready': {
      switch (event.type) {
        case 'WEBVIEW_BUILD_ERROR': {
          const recoverable = state.autoFix.attempt < state.autoFix.maxAttempts;
          if (recoverable) {
            return {
              ...state,
              phase: 'fixing',
              error: { kind: 'build_failure', message: event.message, recoverable: true },
              autoFix: {
                ...state.autoFix,
                active: true,
                attempt: state.autoFix.attempt + 1,
                statusMessage: 'Fixing build error...',
              },
            };
          }
          return {
            ...state,
            phase: 'fatal_error',
            error: { kind: 'build_failure', message: event.message, recoverable: false },
            autoFix: { ...state.autoFix, active: false },
          };
        }

        case 'WEBVIEW_RUNTIME_ERROR': {
          const recoverable = state.autoFix.attempt < state.autoFix.maxAttempts;
          if (recoverable) {
            return {
              ...state,
              phase: 'fixing',
              error: { kind: 'runtime_failure', message: event.message, recoverable: true },
              autoFix: {
                ...state.autoFix,
                active: true,
                attempt: state.autoFix.attempt + 1,
                statusMessage: 'Fixing runtime error...',
              },
            };
          }
          return {
            ...state,
            phase: 'fatal_error',
            error: { kind: 'runtime_failure', message: event.message, recoverable: false },
            autoFix: { ...state.autoFix, active: false },
          };
        }

        default:
          return state;
      }
    }

    // ── fixing ───────────────────────────────────────────────
    case 'fixing': {
      switch (event.type) {
        case 'AUTOFIX_STARTED':
          return {
            ...state,
            autoFix: {
              ...state.autoFix,
              active: true,
              attempt: event.attempt,
              statusMessage: event.message ?? `Auto-fix attempt ${event.attempt}...`,
            },
          };

        case 'AUTOFIX_SUCCEEDED':
          return {
            ...state,
            phase: 'loading_webview',
            error: null,
            webViewReady: false,
            displayedMessage: 'Reloading after fix...',
            autoFix: { ...state.autoFix, active: false, statusMessage: null },
          };

        case 'AUTOFIX_FAILED': {
          const exhausted = state.autoFix.attempt >= state.autoFix.maxAttempts;
          if (exhausted) {
            return {
              ...state,
              phase: 'fatal_error',
              error: {
                kind: state.error?.kind ?? 'unknown',
                message: event.message,
                recoverable: false,
                raw: state.error?.raw,
              },
              autoFix: { ...state.autoFix, active: false, statusMessage: null },
            };
          }
          // Not exhausted yet — stay in fixing, allow another attempt
          return {
            ...state,
            autoFix: {
              ...state.autoFix,
              active: false,
              statusMessage: event.message,
            },
          };
        }

        default:
          return state;
      }
    }

    // ── session_expired ──────────────────────────────────────
    case 'session_expired': {
      if (event.type === 'RETRY_REQUESTED' || event.type === 'START_REQUESTED') {
        return {
          ...INITIAL_PREVIEW_STATE,
          phase: 'starting',
          projectId: state.projectId,
          viewportMode: state.viewportMode,
          currentStep: 'analyzing',
          displayedMessage: 'Restarting preview...',
        };
      }
      return state;
    }

    // ── fatal_error ──────────────────────────────────────────
    case 'fatal_error': {
      if (event.type === 'RETRY_REQUESTED') {
        return {
          ...INITIAL_PREVIEW_STATE,
          phase: 'starting',
          projectId: state.projectId,
          viewportMode: state.viewportMode,
          currentStep: 'analyzing',
          displayedMessage: 'Retrying preview...',
        };
      }
      return state;
    }

    default:
      return state;
  }
}

// ── Hook ────────────────────────────────────────────────────

export function usePreviewMachine() {
  const [state, dispatch] = useReducer(previewReducer, INITIAL_PREVIEW_STATE);
  return { state, dispatch } as const;
}
