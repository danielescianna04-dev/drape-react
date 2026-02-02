import { log } from '../utils/logger';
import { config } from '../config';
import fs from 'fs';
import path from 'path';

interface AIUsageEntry {
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  costEur: number;
  timestamp: number;
}

interface OperationMetric {
  operation: string;
  durationMs: number;
  success: boolean;
  metadata?: Record<string, any>;
  timestamp: number;
}

interface AIUsageSummary {
  totalCostEur: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  byModel: Record<string, {
    costEur: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    count: number;
  }>;
}

interface OperationStats {
  count: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  successRate: number;
}

class MetricsService {
  private aiUsage: AIUsageEntry[] = [];
  private operations: OperationMetric[] = [];
  private readonly maxEntries = 10000;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly persistPath: string;

  constructor() {
    this.persistPath = path.join(config.cacheRoot, 'ai-usage.json');

    // Load persisted data
    this.loadFromDisk();

    // Auto-cleanup every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 3600000);
  }

  /**
   * Load AI usage from disk
   */
  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.persistPath)) {
        const data = JSON.parse(fs.readFileSync(this.persistPath, 'utf-8'));
        if (Array.isArray(data)) {
          this.aiUsage = data;
          log.info(`[Metrics] Loaded ${this.aiUsage.length} AI usage entries from disk`);
        }
      }
    } catch (error: any) {
      log.warn(`[Metrics] Failed to load AI usage from disk: ${error.message}`);
    }
  }

  /**
   * Save AI usage to disk (debounced)
   */
  private saveToDisk(): void {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      try {
        const dir = path.dirname(this.persistPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(this.persistPath, JSON.stringify(this.aiUsage), 'utf-8');
      } catch (error: any) {
        log.warn(`[Metrics] Failed to save AI usage to disk: ${error.message}`);
      }
    }, 2000); // debounce 2s
  }

  /**
   * Track AI usage (tokens and cost)
   */
  trackAIUsage(entry: Omit<AIUsageEntry, 'timestamp'>): void {
    const fullEntry: AIUsageEntry = {
      ...entry,
      timestamp: Date.now(),
    };

    this.aiUsage.push(fullEntry);

    // Trim if exceeding max entries
    if (this.aiUsage.length > this.maxEntries) {
      this.aiUsage = this.aiUsage.slice(-Math.floor(this.maxEntries / 2));
    }

    const cachedInfo = entry.cachedTokens ? ` cached=${entry.cachedTokens}` : '';
    log.info(
      `[Metrics] AI: ${entry.model} in=${entry.inputTokens} out=${entry.outputTokens}${cachedInfo} cost=€${entry.costEur.toFixed(4)}`
    );

    this.saveToDisk();
  }

  /**
   * Track operation performance
   */
  trackOperation(op: Omit<OperationMetric, 'timestamp'>): void {
    const fullOp: OperationMetric = {
      ...op,
      timestamp: Date.now(),
    };

    this.operations.push(fullOp);

    // Trim if exceeding max entries
    if (this.operations.length > this.maxEntries) {
      this.operations = this.operations.slice(-Math.floor(this.maxEntries / 2));
    }

    const status = op.success ? 'SUCCESS' : 'FAILED';
    log.debug(`[Metrics] Op: ${op.operation} ${op.durationMs}ms ${status}`);
  }

  /**
   * Get AI usage summary
   */
  getAIUsageSummary(userId?: string, since?: number): AIUsageSummary {
    let entries = this.aiUsage;

    // Filter by user if specified
    if (userId) {
      entries = entries.filter(e => e.userId === userId);
    }

    // Filter by time if specified
    if (since) {
      entries = entries.filter(e => e.timestamp >= since);
    }

    const byModel: Record<string, {
      costEur: number;
      inputTokens: number;
      outputTokens: number;
      cachedTokens: number;
      count: number;
    }> = {};

    let totalCost = 0;
    let totalIn = 0;
    let totalOut = 0;
    let totalCached = 0;

    for (const e of entries) {
      totalCost += e.costEur;
      totalIn += e.inputTokens;
      totalOut += e.outputTokens;
      totalCached += e.cachedTokens || 0;

      if (!byModel[e.model]) {
        byModel[e.model] = {
          costEur: 0,
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          count: 0,
        };
      }

      byModel[e.model].costEur += e.costEur;
      byModel[e.model].inputTokens += e.inputTokens;
      byModel[e.model].outputTokens += e.outputTokens;
      byModel[e.model].cachedTokens += e.cachedTokens || 0;
      byModel[e.model].count++;
    }

    return {
      totalCostEur: totalCost,
      totalInputTokens: totalIn,
      totalOutputTokens: totalOut,
      totalCachedTokens: totalCached,
      byModel,
    };
  }

  /**
   * Get operation statistics
   */
  getOperationStats(operation?: string, since?: number): Record<string, OperationStats> {
    let ops = this.operations;

    // Filter by operation if specified
    if (operation) {
      ops = ops.filter(o => o.operation === operation);
    }

    // Filter by time if specified
    if (since) {
      ops = ops.filter(o => o.timestamp >= since);
    }

    const stats: Record<string, {
      total: number;
      success: number;
      durations: number[];
    }> = {};

    for (const op of ops) {
      if (!stats[op.operation]) {
        stats[op.operation] = {
          total: 0,
          success: 0,
          durations: [],
        };
      }

      stats[op.operation].total++;
      if (op.success) {
        stats[op.operation].success++;
      }
      stats[op.operation].durations.push(op.durationMs);
    }

    const result: Record<string, OperationStats> = {};

    for (const [k, v] of Object.entries(stats)) {
      const durations = v.durations;
      const sortedDurations = [...durations].sort((a, b) => a - b);

      result[k] = {
        count: v.total,
        avgMs: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
        minMs: Math.min(...durations),
        maxMs: Math.max(...durations),
        successRate: v.total > 0 ? v.success / v.total : 0,
      };
    }

    return result;
  }

  /**
   * Get raw AI usage entries
   */
  getAIUsageEntries(userId?: string, limit = 100): AIUsageEntry[] {
    let entries = this.aiUsage;

    if (userId) {
      entries = entries.filter(e => e.userId === userId);
    }

    return entries.slice(-limit);
  }

  /**
   * Get raw operation entries
   */
  getOperationEntries(operation?: string, limit = 100): OperationMetric[] {
    let ops = this.operations;

    if (operation) {
      ops = ops.filter(o => o.operation === operation);
    }

    return ops.slice(-limit);
  }

  /**
   * Get metrics for a specific time range
   */
  getMetricsForTimeRange(
    startTime: number,
    endTime: number
  ): {
    aiUsage: AIUsageSummary;
    operations: Record<string, OperationStats>;
    timeRange: { start: string; end: string };
  } {
    const aiUsage = this.getAIUsageSummary(undefined, startTime);
    const operations = this.getOperationStats(undefined, startTime);

    // Filter by end time
    const filteredAI = this.aiUsage.filter(
      e => e.timestamp >= startTime && e.timestamp <= endTime
    );
    const filteredOps = this.operations.filter(
      o => o.timestamp >= startTime && o.timestamp <= endTime
    );

    return {
      aiUsage: this.summarizeAIEntries(filteredAI),
      operations: this.summarizeOperations(filteredOps),
      timeRange: {
        start: new Date(startTime).toISOString(),
        end: new Date(endTime).toISOString(),
      },
    };
  }

  /**
   * Clean up old entries (keep last 24 hours)
   */
  cleanup(): void {
    // Keep AI usage for current month (needed for budget tracking)
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const cutoffAI = monthStart.getTime();

    const cutoff = Date.now() - 86400000; // 24 hours for operations
    const beforeAI = this.aiUsage.length;
    const beforeOps = this.operations.length;

    this.aiUsage = this.aiUsage.filter(e => e.timestamp > cutoffAI);
    this.operations = this.operations.filter(e => e.timestamp > cutoff);

    const removedAI = beforeAI - this.aiUsage.length;
    const removedOps = beforeOps - this.operations.length;

    if (removedAI > 0 || removedOps > 0) {
      log.info(`[Metrics] Cleanup: removed ${removedAI} AI entries, ${removedOps} operation entries`);
      if (removedAI > 0) this.saveToDisk();
    }
  }

  /**
   * Get overall system health metrics
   */
  getSystemHealth(): {
    metrics: {
      aiRequests: number;
      totalOperations: number;
      avgOperationMs: number;
      successRate: number;
    };
    topOperations: Array<{ operation: string; count: number; avgMs: number }>;
    recentErrors: Array<{ operation: string; timestamp: string; metadata?: any }>;
  } {
    const cutoff = Date.now() - 3600000; // Last hour
    const recentOps = this.operations.filter(o => o.timestamp > cutoff);
    const recentAI = this.aiUsage.filter(e => e.timestamp > cutoff);

    const totalOps = recentOps.length;
    const successfulOps = recentOps.filter(o => o.success).length;
    const avgMs = recentOps.length > 0
      ? recentOps.reduce((sum, o) => sum + o.durationMs, 0) / recentOps.length
      : 0;

    // Get top operations
    const opCounts: Record<string, { count: number; totalMs: number }> = {};
    for (const op of recentOps) {
      if (!opCounts[op.operation]) {
        opCounts[op.operation] = { count: 0, totalMs: 0 };
      }
      opCounts[op.operation].count++;
      opCounts[op.operation].totalMs += op.durationMs;
    }

    const topOperations = Object.entries(opCounts)
      .map(([operation, data]) => ({
        operation,
        count: data.count,
        avgMs: Math.round(data.totalMs / data.count),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Get recent errors
    const recentErrors = recentOps
      .filter(o => !o.success)
      .slice(-20)
      .map(o => ({
        operation: o.operation,
        timestamp: new Date(o.timestamp).toISOString(),
        metadata: o.metadata,
      }));

    return {
      metrics: {
        aiRequests: recentAI.length,
        totalOperations: totalOps,
        avgOperationMs: Math.round(avgMs),
        successRate: totalOps > 0 ? successfulOps / totalOps : 1,
      },
      topOperations,
      recentErrors,
    };
  }

  /**
   * Helper: Summarize AI entries
   */
  private summarizeAIEntries(entries: AIUsageEntry[]): AIUsageSummary {
    const byModel: Record<string, any> = {};
    let totalCost = 0, totalIn = 0, totalOut = 0, totalCached = 0;

    for (const e of entries) {
      totalCost += e.costEur;
      totalIn += e.inputTokens;
      totalOut += e.outputTokens;
      totalCached += e.cachedTokens || 0;

      if (!byModel[e.model]) {
        byModel[e.model] = { costEur: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, count: 0 };
      }

      byModel[e.model].costEur += e.costEur;
      byModel[e.model].inputTokens += e.inputTokens;
      byModel[e.model].outputTokens += e.outputTokens;
      byModel[e.model].cachedTokens += e.cachedTokens || 0;
      byModel[e.model].count++;
    }

    return { totalCostEur: totalCost, totalInputTokens: totalIn, totalOutputTokens: totalOut, totalCachedTokens: totalCached, byModel };
  }

  /**
   * Helper: Summarize operations
   */
  private summarizeOperations(ops: OperationMetric[]): Record<string, OperationStats> {
    const stats: Record<string, any> = {};

    for (const op of ops) {
      if (!stats[op.operation]) {
        stats[op.operation] = { total: 0, success: 0, durations: [] };
      }
      stats[op.operation].total++;
      if (op.success) stats[op.operation].success++;
      stats[op.operation].durations.push(op.durationMs);
    }

    const result: Record<string, OperationStats> = {};
    for (const [k, v] of Object.entries(stats)) {
      result[k] = {
        count: v.total,
        avgMs: Math.round(v.durations.reduce((a: number, b: number) => a + b, 0) / v.durations.length),
        minMs: Math.min(...v.durations),
        maxMs: Math.max(...v.durations),
        successRate: v.total > 0 ? v.success / v.total : 0,
      };
    }

    return result;
  }

  /**
   * Stop the cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

export const metricsService = new MetricsService();
