export interface VerifyResult {
  passed: boolean;
  errors: string[];
  screenshots: Map<string, string>;
  serverLog: string;
  /** E2E page results (populated when e2e-check.js or qa-agent.js runs successfully) */
  pages?: { path: string; screenshot?: string; errors?: string[] }[];
  /** E2E navigation results (populated when e2e-check.js or qa-agent.js runs successfully) */
  navigation?: { element?: { text?: string }; error?: string; screenshot?: string }[];
  /** QA Agent report (populated when qa-agent.js runs) */
  qaReport?: {
    status?: string;
    qualityScore?: number;
    totalIssues?: number;
    attempts?: any[];
    log?: any[];
  };
}

export interface AutoFixResult {
  applied: boolean;
  filesModified: string[];
  duration: number;
  inputTokens: number;
  outputTokens: number;
  costEur: number;
}

export interface AutoFixOptions {
  model: string;
  thinkingLevel: string;
  escalated?: boolean;
  taskBudgetTokens?: number;
}

export interface VerifyOptions {
  projectId: string;
  userId: string;
  technology: string;
  onProgress?: (pct: number, msg: string, stage: string) => void;
}

export interface VerifyRunOptions {
  preferQaAgent: boolean;
  allowQaFallback: boolean;
}
