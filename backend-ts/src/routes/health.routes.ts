import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { requireAuth, getUserPlan } from '../middleware/auth';
import { log } from '../utils/logger';
import { dockerService } from '../services/docker.service';
import { sessionService } from '../services/session.service';
import { metricsService } from '../services/metrics.service';

export const healthRouter = Router();

// GET /health
healthRouter.get('/health', asyncHandler(async (req, res) => {
  const health = await dockerService.healthCheck();
  res.json({
    status: health.healthy ? 'ok' : 'degraded',
    version: '3.0.0',
    architecture: 'docker-ts',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
}));

// GET /logs/stream — SSE of backend logs
healthRouter.get('/logs/stream', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const remove = log.addListener((entry) => {
    res.write(`data: ${JSON.stringify({ type: 'backend_log', log: entry })}\n\n`);
  });

  req.on('close', remove);
});

// GET /logs/recent
healthRouter.get('/logs/recent', requireAuth, (req, res) => {
  const count = parseInt(req.query.count as string) || 100;
  res.json({ logs: log.getRecent(count), count });
});

// GET /stats/system-status — Per-user system status for iOS SettingsScreen
healthRouter.get('/stats/system-status', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.userId!;
    const planId = await getUserPlan(userId);

    // Plan limits
    const planLimits: Record<string, { tokens: number; previews: number; projects: number; search: number }> = {
      free:    { tokens: 50000, previews: 5, projects: 3, search: 50 },
      go:      { tokens: 500000, previews: 20, projects: 10, search: 200 },
      starter: { tokens: 500000, previews: 5, projects: 10, search: 200 },
      pro:     { tokens: 2000000, previews: 10, projects: 50, search: 1000 },
      team:    { tokens: 10000000, previews: 50, projects: 200, search: 5000 },
    };

    const limits = planLimits[planId] || planLimits.free;

    // Get real AI usage from metrics
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const aiSummary = metricsService.getAIUsageSummary(userId, monthStart.getTime());
    const tokensUsed = aiSummary.totalInputTokens + aiSummary.totalOutputTokens;

    // Get hourly token breakdown (last 24h)
    const hourly: number[] = [];
    const now = Date.now();
    for (let h = 23; h >= 0; h--) {
      const start = now - (h + 1) * 3600000;
      const end = now - h * 3600000;
      const hourEntries = metricsService.getAIUsageEntries(userId, 10000)
        .filter(e => e.timestamp >= start && e.timestamp < end);
      hourly.push(hourEntries.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0));
    }

    // Active sessions/previews
    const sessions = await sessionService.getAll();
    const activePreviews = sessions.filter(s => s.previewPort != null).length;
    const activeProjects = sessions.length;

    // Search usage (tracked as operation)
    const searchOps = metricsService.getOperationEntries('web_search', 10000)
      .filter(o => o.timestamp >= monthStart.getTime()).length;

    res.json({
      tokens: {
        used: tokensUsed,
        limit: limits.tokens,
        percent: limits.tokens > 0 ? Math.round((tokensUsed / limits.tokens) * 100) : 0,
        hourly,
      },
      previews: {
        active: activePreviews,
        limit: limits.previews,
        percent: limits.previews > 0 ? Math.round((activePreviews / limits.previews) * 100) : 0,
      },
      projects: {
        active: activeProjects,
        limit: limits.projects,
        percent: limits.projects > 0 ? Math.round((activeProjects / limits.projects) * 100) : 0,
      },
      search: {
        used: searchOps,
        limit: limits.search,
        percent: limits.search > 0 ? Math.round((searchOps / limits.search) * 100) : 0,
      },
    });
  } catch (error: any) {
    log.error('[Stats] system-status error:', error);
    res.status(500).json({ error: 'Failed to retrieve system status' });
  }
}));

// GET /ai/budget/:userId — AI budget status for iOS SettingsScreen
healthRouter.get('/ai/budget/:userId', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.params.userId;

    // Verify the authenticated user is requesting their own budget
    if (req.userId !== userId) {
      res.status(403).json({ success: false, error: 'Cannot view another user\'s budget' });
      return;
    }
    const planId = await getUserPlan(userId);

    const planBudgets: Record<string, { name: string; monthlyBudgetEur: number }> = {
      free:    { name: 'Free', monthlyBudgetEur: 2.00 },
      go:      { name: 'Go', monthlyBudgetEur: 7.50 },
      starter: { name: 'Starter', monthlyBudgetEur: 10.00 },
      pro:     { name: 'Pro', monthlyBudgetEur: 50.00 },
      team:    { name: 'Team', monthlyBudgetEur: 200.00 },
    };

    const plan = planBudgets[planId] || planBudgets.free;

    // Get this month's AI spending from metrics
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const aiSummary = metricsService.getAIUsageSummary(userId, monthStart.getTime());

    const spentEur = aiSummary.totalCostEur;
    const remainingEur = Math.max(0, plan.monthlyBudgetEur - spentEur);
    const percentUsed = plan.monthlyBudgetEur > 0
      ? Math.round((spentEur / plan.monthlyBudgetEur) * 100)
      : 0;

    res.json({
      success: true,
      plan: {
        id: planId,
        name: plan.name,
        monthlyBudgetEur: plan.monthlyBudgetEur,
      },
      usage: {
        spentEur,
        remainingEur,
        percentUsed,
      },
    });
  } catch (error: any) {
    log.error('[Budget] error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve budget status' });
  }
}));
