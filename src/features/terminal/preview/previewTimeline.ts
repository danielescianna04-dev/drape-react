/**
 * Unified timeline model for preview startup.
 *
 * Merges progress steps, logs, warnings, and errors into a single
 * ordered list so the UI only needs one data source.
 */

// ── Entry types ────────────────────────────────────────────────

export type TimelineEntryType = 'step' | 'log' | 'warning' | 'error' | 'system';

export type PreviewStep =
  | 'analyzing'
  | 'cloning'
  | 'detecting'
  | 'booting'
  | 'installing'
  | 'starting'
  | 'ready';

export interface PreviewTimelineEntry {
  type: TimelineEntryType;
  step?: PreviewStep;
  message: string;
  timestamp: number;
}

// ── Timeline state ─────────────────────────────────────────────

export interface PreviewTimeline {
  entries: PreviewTimelineEntry[];
  currentStep: PreviewStep | null;
  progress: number;
  displayedMessage: string;
}

// ── Step → progress mapping ────────────────────────────────────

const STEP_PROGRESS: Record<PreviewStep, number> = {
  analyzing: 5,
  cloning: 15,
  detecting: 30,
  booting: 45,
  installing: 60,
  starting: 80,
  ready: 100,
};

export function getProgressForStep(step: PreviewStep): number {
  return STEP_PROGRESS[step] ?? 0;
}

// ── Factories ──────────────────────────────────────────────────

export function createTimeline(): PreviewTimeline {
  return {
    entries: [],
    currentStep: null,
    progress: 0,
    displayedMessage: '',
  };
}

export function addTimelineEntry(
  timeline: PreviewTimeline,
  entry: Omit<PreviewTimelineEntry, 'timestamp'>,
): PreviewTimeline {
  const full: PreviewTimelineEntry = { ...entry, timestamp: Date.now() };
  return {
    ...timeline,
    entries: [...timeline.entries, full],
    displayedMessage: full.message,
  };
}

export function advanceStep(
  timeline: PreviewTimeline,
  step: PreviewStep,
  message?: string,
): PreviewTimeline {
  const progress = getProgressForStep(step);
  const displayedMessage = message ?? step;
  const entry: PreviewTimelineEntry = {
    type: 'step',
    step,
    message: displayedMessage,
    timestamp: Date.now(),
  };
  return {
    ...timeline,
    entries: [...timeline.entries, entry],
    currentStep: step,
    progress,
    displayedMessage,
  };
}
