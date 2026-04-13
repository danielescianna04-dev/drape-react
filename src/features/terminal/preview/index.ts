/**
 * Preview module barrel — main public API.
 */

// ── State machine ────────────────────────────────────────────
export { previewReducer, INITIAL_PREVIEW_STATE, usePreviewMachine } from './previewMachine';

// ── Types (re-export consolidated barrel) ────────────────────
export type * from './types';

// ── Error classification ─────────────────────────────────────
export {
  classifyPreviewError,
  isTransientPreviewError,
  isRecoverableError,
  isMissingPreviewTokenError,
  isEnvRelatedError,
  isTransientProxyError,
  detectCriticalTerminalErrors,
  extractStartupErrorFromBody,
} from './errors/previewErrorClassifier';

export {
  extractMissingEnvVars,
  extractEnvVarDetails,
} from './errors/previewEnvVarExtractor';

// ── Navigation ───────────────────────────────────────────────
export {
  normalizePreviewUrl,
  isPreviewUrlRewrite,
  buildPreviewNavigationState,
} from './navigation/previewNavigationAdapter';

// ── Recovery policy ──────────────────────────────────────────
export {
  shouldAutoFix,
  getRecoveryAction,
  getFatalErrorCTAs,
  MAX_AUTOFIX_ATTEMPTS,
} from './previewRecoveryPolicy';

// ── Timeline ─────────────────────────────────────────────────
export {
  createTimeline,
  addTimelineEntry,
  advanceStep,
  getProgressForStep,
} from './previewTimeline';

// ── Capabilities ─────────────────────────────────────────────
export {
  getPreviewCapability,
  getPreviewDisplayInfo,
} from './previewCapabilities';

// ── Hooks ────────────────────────────────────────────────────
export { usePreviewSession } from './hooks/usePreviewSession';
export { usePreviewPreflight } from './hooks/usePreviewPreflight';
export { usePreviewHealth } from './hooks/usePreviewHealth';
export { usePreviewStartupFlow } from './hooks/usePreviewStartupFlow';
export { usePreviewRecovery } from './hooks/usePreviewRecovery';
export { usePreviewNavigation } from './hooks/usePreviewNavigation';

// ── Components ───────────────────────────────────────────────
export {
  PreviewStateStart,
  PreviewStateLoading,
  PreviewStateFixing,
  PreviewStateEnvRequired,
  PreviewStateSessionExpired,
  PreviewStateFatalError,
  PreviewSurfaceWeb,
  PreviewSurfaceConsole,
  techMaps,
} from './components';
