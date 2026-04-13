/**
 * Pure recovery-policy logic for preview errors.
 *
 * Decides whether to auto-fix, show env-var screen, retry, or give up
 * based on the error kind and attempt count. No side effects, no hooks.
 */

import type { PreviewError, PreviewErrorKind } from './previewMachine.types';

// ── Constants ──────────────────────────────────────────────────

export const MAX_AUTOFIX_ATTEMPTS = 3;

// ── Recovery actions ───────────────────────────────────────────

export type RecoveryAction = 'autofix' | 'show_env' | 'show_error' | 'retry';

/** Kinds that the auto-fix agent can attempt to repair. */
const AUTOFIX_KINDS: ReadonlySet<PreviewErrorKind> = new Set([
  'build_failure',
  'runtime_failure',
]);

/** Transient errors that resolve with a simple retry. */
const TRANSIENT_KINDS: ReadonlySet<PreviewErrorKind> = new Set([
  'transient_proxy',
]);

// ── Decision functions ─────────────────────────────────────────

/**
 * Whether the auto-fix agent should be invoked for this error.
 */
export function shouldAutoFix(error: PreviewError, currentAttempt: number): boolean {
  if (currentAttempt >= MAX_AUTOFIX_ATTEMPTS) return false;
  if (!error.recoverable) return false;
  return AUTOFIX_KINDS.has(error.kind);
}

/**
 * Choose the appropriate recovery action for a given error.
 */
export function getRecoveryAction(error: PreviewError): RecoveryAction {
  switch (error.kind) {
    case 'missing_env':
    case 'missing_token':
      return 'show_env';

    case 'build_failure':
    case 'runtime_failure':
      return error.recoverable ? 'autofix' : 'show_error';

    case 'session_expired':
      return 'retry';

    case 'server_unreachable':
    case 'transient_proxy':
      return TRANSIENT_KINDS.has(error.kind) ? 'retry' : 'show_error';

    case 'unknown':
    default:
      return 'show_error';
  }
}

// ── Fatal-error CTAs ───────────────────────────────────────────

export interface RecoveryCTA {
  label: string;
  action: string;
}

/**
 * After max attempts or for non-recoverable errors, provide CTAs
 * so the user knows what to do next.
 */
export function getFatalErrorCTAs(error: PreviewError): RecoveryCTA[] {
  const ctas: RecoveryCTA[] = [];

  switch (error.kind) {
    case 'missing_env':
    case 'missing_token':
      ctas.push({ label: 'Configure environment', action: 'open_env' });
      break;

    case 'build_failure':
    case 'runtime_failure':
      ctas.push({ label: 'Send to AI chat', action: 'send_to_chat' });
      ctas.push({ label: 'View logs', action: 'show_logs' });
      break;

    case 'session_expired':
      ctas.push({ label: 'Restart preview', action: 'restart' });
      break;

    case 'server_unreachable':
      ctas.push({ label: 'Retry', action: 'retry' });
      ctas.push({ label: 'Restart preview', action: 'restart' });
      break;

    case 'transient_proxy':
      ctas.push({ label: 'Retry', action: 'retry' });
      break;

    case 'unknown':
    default:
      ctas.push({ label: 'Retry', action: 'retry' });
      ctas.push({ label: 'Send to AI chat', action: 'send_to_chat' });
      break;
  }

  return ctas;
}
