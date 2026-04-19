/**
 * Creation pipeline state machine.
 *
 * The pipeline drives a project from user prompt to verified preview.
 * Transitions are explicit so the path is testable and observable:
 *
 *   generation → ts_fix → preview_start ⇄ preview_fix
 *                              ↓              (exhausted or healthy)
 *                          full_verify ──→ finalize ──→ done
 *
 * Two invariants enforced by construction:
 * 1. full_verify runs at most once per pipeline (fullVerifyDone guard).
 * 2. finalize is the only path to done — the report is always written.
 */

import type { BuildReportTracker } from '../build-report.service';
import type { ProjectComplexity } from '../project-complexity.service';
import type { ProjectTechnology } from '../project-technology';

export type PipelinePhase =
  | 'generation'
  | 'ts_fix'
  | 'preview_start'
  | 'preview_fix'
  | 'full_verify'
  | 'finalize'
  | 'done';

/** Side-effect dependencies + request-scoped identifiers. */
export interface PipelineContext {
  projectId: string;
  userId: string;
  userPlan: string;
  prompt: string;
  projectName?: string;
  sessionProjectType?: string;
  isClientConnected: () => boolean;
  writeSseEvent: (eventType: string, payload: { type: string; [key: string]: unknown }) => void;
}

/** Diagnostics collected from preview_start, fed into preview_fix. */
export interface PreviewStartupDiagnostics {
  issues: string[];
  context: string;
  actionable: boolean;
  cause: 'deps' | 'imports' | 'hydration' | 'generic';
}

export interface PipelineState {
  phase: PipelinePhase;

  // — generation outputs —
  filesCreated: number;
  generatedFiles: Set<string>;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostEur: number;
  generationError: string | null;
  modelUsed: string;
  projectComplexity: ProjectComplexity;
  /**
   * Canonical technology for this project, resolved once at pipeline start.
   * Prefers `.drape/creation-input.json` (user intent) over the detector label.
   */
  resolvedTechnology: ProjectTechnology;

  /**
   * When true, this project uses the multi-tenant Drape Cloud backend.
   * The AI is instructed to use the drape-cloud SDK (no SQL / no API routes).
   * When false/absent the legacy Neon+Drizzle path remains in effect.
   */
  useDrapeCloud: boolean;

  // — verify sub-phase state —
  tsFixAttempt: number;
  previewStartAttempt: number;
  depRepairAttempted: boolean;
  targetedCodeFixAttempted: boolean;
  /** Diagnostics from the latest preview_start failure, consumed by preview_fix. */
  lastPreviewDiagnostics: PreviewStartupDiagnostics | null;
  /** Ensures full_verify runs at most once. */
  fullVerifyDone: boolean;
  previewOk: boolean;

  // — shared tracking —
  tracker: BuildReportTracker;
  generationActionId: string;
}
