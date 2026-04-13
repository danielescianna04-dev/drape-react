/**
 * Preview state machine types.
 *
 * Defines the full type system for the preview lifecycle:
 * phases, errors, events, and the composite state shape.
 */

// ── Phases ──────────────────────────────────────────────────

export type PreviewPhase =
  | 'idle'
  | 'preflight_env'
  | 'starting'
  | 'waiting_health'
  | 'loading_webview'
  | 'ready'
  | 'fixing'
  | 'session_expired'
  | 'fatal_error';

// ── Errors ──────────────────────────────────────────────────

export type PreviewErrorKind =
  | 'missing_env'
  | 'build_failure'
  | 'runtime_failure'
  | 'server_unreachable'
  | 'session_expired'
  | 'missing_token'
  | 'transient_proxy'
  | 'unknown';

export interface PreviewError {
  kind: PreviewErrorKind;
  message: string;
  recoverable: boolean;
  raw?: string;
}

// ── Startup steps ───────────────────────────────────────────

export type PreviewStartupStep =
  | 'analyzing'
  | 'cloning'
  | 'detecting'
  | 'booting'
  | 'installing'
  | 'starting'
  | 'ready';

// ── Logs ────────────────────────────────────────────────────

export interface PreviewLog {
  message: string;
  timestamp: number;
  type: 'info' | 'warning' | 'error';
}

// ── Auto-fix ────────────────────────────────────────────────

export interface PreviewAutoFixState {
  active: boolean;
  attempt: number;
  maxAttempts: number;
  statusMessage: string | null;
}

// ── Composite state ─────────────────────────────────────────

export interface PreviewState {
  phase: PreviewPhase;
  projectId: string | null;
  previewUrl: string | null;
  machineId: string | null;
  accessToken: string | null;
  hasWebUi: boolean;
  currentStep: PreviewStartupStep | null;
  progress: number;
  displayedMessage: string;
  startupLogs: PreviewLog[];
  terminalOutput: string[];
  envVarsRequired: Array<{
    key: string;
    defaultValue?: string;
    required: boolean;
    description?: string;
  }> | null;
  error: PreviewError | null;
  sessionExpiredMessage: string | null;
  webViewReady: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  viewportMode: 'mobile' | 'desktop';
  autoFix: PreviewAutoFixState;
}

// ── Events ──────────────────────────────────────────────────

export type PreviewEvent =
  | { type: 'START_REQUESTED'; projectId: string }
  | { type: 'PREFLIGHT_ENV_MISSING'; vars: Array<{ key: string; defaultValue?: string; required: boolean; description?: string }> }
  | { type: 'PREFLIGHT_OK' }
  | { type: 'STARTUP_STEP'; step: PreviewStartupStep; message?: string; progress?: number }
  | { type: 'STARTUP_LOG'; log: PreviewLog }
  | { type: 'HEALTH_OK'; url: string; machineId?: string; accessToken?: string }
  | { type: 'HEALTH_RETRY'; message?: string }
  | { type: 'WEBVIEW_READY' }
  | { type: 'WEBVIEW_BUILD_ERROR'; message: string }
  | { type: 'WEBVIEW_RUNTIME_ERROR'; message: string }
  | { type: 'ENV_ERROR'; message: string; vars?: string[] }
  | { type: 'AUTOFIX_STARTED'; attempt: number; message?: string }
  | { type: 'AUTOFIX_SUCCEEDED' }
  | { type: 'AUTOFIX_FAILED'; message: string }
  | { type: 'SESSION_EXPIRED'; message: string }
  | { type: 'STOP_REQUESTED' }
  | { type: 'RETRY_REQUESTED' }
  | { type: 'FATAL_ERROR'; error: PreviewError }
  | { type: 'NAV_STATE_CHANGED'; canGoBack: boolean; canGoForward: boolean; url?: string }
  | { type: 'VIEWPORT_MODE_CHANGED'; mode: 'mobile' | 'desktop' }
  | { type: 'RESET' };
