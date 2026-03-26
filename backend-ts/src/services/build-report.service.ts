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
   * Get the current report
   */
  getReport(): BuildReport {
    return this.report;
  }

  /**
   * Save report to .drape/build-report.json in the project directory
   */
  private async save() {
    try {
      await fileService.writeFile(this.projectId, '.drape/build-report.json', JSON.stringify(this.report, null, 2));
    } catch (err: any) {
      // Don't let report saving errors break the creation flow
      log.warn(`[BuildReport] Failed to save report for ${this.projectId}: ${err.message}`);
    }
  }
}
