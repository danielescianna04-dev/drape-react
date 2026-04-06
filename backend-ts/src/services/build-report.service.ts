/**
 * Build Report Service
 * Tracks every action during project creation and stores a detailed report.
 * The report is saved as .drape/build-report.json in the project directory.
 *
 * The frontend displays this in a "Build Report" tab — compressed by default,
 * expandable to see full details of every step.
 */

import { fileService } from './file.service';
import { log } from '../utils/logger';

export interface BuildAction {
  id: string;
  step: string;           // e.g., "database", "auth", "generation", "verification"
  title: string;          // e.g., "Creating Neon database"
  status: 'running' | 'completed' | 'failed' | 'fixed' | 'skipped';
  startedAt: string;      // ISO timestamp
  completedAt?: string;
  durationMs?: number;
  details?: string;       // Human-readable description
  error?: string;         // Error message if failed
  fix?: string;           // What was done to fix it
  metadata?: Record<string, any>;  // Extra data (file list, table names, etc.)
  children?: BuildAction[];        // Sub-actions (e.g., individual file writes)
}

export interface BuildReport {
  projectId: string;
  projectName: string;
  technology: string;
  cloudMode: boolean;
  createdAt: string;
  completedAt?: string;
  totalDurationMs?: number;
  status: 'running' | 'completed' | 'failed';
  previewBlocked?: boolean;
  actions: BuildAction[];
  summary: {
    filesGenerated: number;
    filesProtected: number;
    tablesCreated: string[];
    seedRecords: number;
    pagesVerified: number;
    issuesFound: number;
    issuesFixed: number;
    aiModel: string;
    aiTokensUsed: number;
    generatedFiles?: string[];
    envVars?: string[];
    sqlExecuted?: string;
  };
}

let actionCounter = 0;

export class BuildReportTracker {
  private report: BuildReport;
  private projectId: string;

  constructor(projectId: string, projectName: string, technology: string, cloudMode: boolean) {
    this.projectId = projectId;
    actionCounter = 0;
    this.report = {
      projectId,
      projectName,
      technology,
      cloudMode,
      createdAt: new Date().toISOString(),
      status: 'running',
      actions: [],
      summary: {
        filesGenerated: 0,
        filesProtected: 0,
        tablesCreated: [],
        seedRecords: 0,
        pagesVerified: 0,
        issuesFound: 0,
        issuesFixed: 0,
        aiModel: '',
        aiTokensUsed: 0,
      },
    };
  }

  /**
   * Start a new action and return its ID
   */
  startAction(step: string, title: string, details?: string): string {
    const id = `action-${++actionCounter}`;
    const action: BuildAction = {
      id,
      step,
      title,
      status: 'running',
      startedAt: new Date().toISOString(),
      details,
    };
    this.report.actions.push(action);
    this.save(); // Save after each action start
    return id;
  }

  /**
   * Complete an action
   */
  completeAction(id: string, metadata?: Record<string, any>) {
    const action = this.report.actions.find(a => a.id === id);
    if (action) {
      action.status = 'completed';
      action.completedAt = new Date().toISOString();
      action.durationMs = new Date(action.completedAt).getTime() - new Date(action.startedAt).getTime();
      if (metadata) action.metadata = { ...action.metadata, ...metadata };
    }
    this.save();
  }

  /**
   * Mark an action as failed
   */
  failAction(id: string, error: string) {
    const action = this.report.actions.find(a => a.id === id);
    if (action) {
      action.status = 'failed';
      action.completedAt = new Date().toISOString();
      action.durationMs = new Date(action.completedAt).getTime() - new Date(action.startedAt).getTime();
      action.error = error;
    }
    this.save();
  }

  /**
   * Mark an action as fixed (was failed, then auto-repaired)
   */
  fixAction(id: string, fix: string) {
    const action = this.report.actions.find(a => a.id === id);
    if (action) {
      action.status = 'fixed';
      action.fix = fix;
    }
    this.save();
  }

  /**
   * Update summary fields
   */
  updateSummary(partial: Partial<BuildReport['summary']>) {
    Object.assign(this.report.summary, partial);
    this.save();
  }

  /**
   * Mark the entire report as complete
   */
  complete() {
    this.report.status = 'completed';
    this.report.completedAt = new Date().toISOString();
    this.report.totalDurationMs = new Date(this.report.completedAt).getTime() - new Date(this.report.createdAt).getTime();
    this.save();
  }

  /**
   * Mark the entire report as failed
   */
  fail() {
    this.report.status = 'failed';
    this.report.completedAt = new Date().toISOString();
    this.report.totalDurationMs = new Date(this.report.completedAt).getTime() - new Date(this.report.createdAt).getTime();
    this.save();
  }

  /**
   * Log a QA phase action
   */
  qaAction(phase: string, title: string, metadata?: Record<string, any>): string {
    const id = this.startAction(`qa-${phase}`, title);
    if (metadata) {
      const action = this.report.actions.find(a => a.id === id);
      if (action) action.metadata = metadata;
    }
    return id;
  }

  /**
   * Update summary with QA verification results
   */
  updateQaSummary(qaReport: any) {
    if (!qaReport) return;
    // Safely extract pages count from last attempt, or from top-level if available
    let pagesCount = 0;
    if (Array.isArray(qaReport.attempts) && qaReport.attempts.length > 0) {
      const lastAttempt = qaReport.attempts[qaReport.attempts.length - 1];
      pagesCount = Array.isArray(lastAttempt?.pages) ? lastAttempt.pages.length : 0;
    }
    this.updateSummary({
      pagesVerified: pagesCount,
      issuesFound: typeof qaReport.totalIssues === 'number' ? qaReport.totalIssues : 0,
      issuesFixed: qaReport.status === 'verified' ? (typeof qaReport.totalIssues === 'number' ? qaReport.totalIssues : 0) : 0,
    });
  }

  /**
   * Set preview blocked state (persisted in build-report.json)
   */
  setPreviewBlocked(blocked: boolean) {
    this.report.previewBlocked = blocked;
    this.save();
  }

  /**
   * Get the current report
   */
  getReport(): BuildReport {
    return this.report;
  }

  /**
   * Save report to .drape/build-report.json in the project directory
   */
  private savePromise: Promise<void> | null = null;

  private async save() {
    // Serialize a snapshot to avoid race conditions between concurrent saves
    const snapshot = JSON.stringify(this.report, null, 2);
    // Wait for any in-flight save to finish before writing
    if (this.savePromise) {
      try { await this.savePromise; } catch {}
    }
    this.savePromise = fileService.writeFile(this.projectId, '.drape/build-report.json', snapshot)
      .then(() => {}) // Normalize Result<void> → void
      .catch((err: any) => {
        log.warn(`[BuildReport] Failed to save report for ${this.projectId}: ${err.message}`);
      });
    await this.savePromise;
  }
}
