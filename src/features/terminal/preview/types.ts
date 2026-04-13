/**
 * Consolidated preview types barrel.
 * Re-exports all preview-related types from a single entry point.
 */
export type {
  PreviewPhase,
  PreviewErrorKind,
  PreviewError,
  PreviewStartupStep,
  PreviewLog,
  PreviewAutoFixState,
  PreviewState,
  PreviewEvent,
} from './previewMachine.types';

export type { PreviewNavigationState } from './navigation/previewNavigationAdapter';

export type {
  PreviewCapability,
  PreviewDisplayInfo,
} from './previewCapabilities';

export type {
  TimelineEntryType,
  PreviewStep,
  PreviewTimelineEntry,
  PreviewTimeline,
} from './previewTimeline';

export type { RecoveryAction, RecoveryCTA } from './previewRecoveryPolicy';
