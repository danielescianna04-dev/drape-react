import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { optionalAuth, requireAuth, getUserPlan, getPlanProjectLimits, getUserStorageMb } from '../middleware/auth';
import { log } from '../utils/logger';
import { dockerService } from '../services/docker.service';
import { metricsService } from '../services/metrics.service';
import { firebaseService } from '../services/firebase.service';

export const healthRouter = Router();

/** Compare semver strings: returns -1 if a < b, 0 if equal, 1 if a > b */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

// GET /version-check — Check if app needs native update
healthRouter.get('/version-check', (req, res) => {
  const appVersion = req.query.appVersion as string;
  const minVersion = '2.0.2';

  const forceUpdate = appVersion ? compareVersions(appVersion, minVersion) < 0 : false;

  res.json({
    minVersion,
    currentVersion: '2.0.2',
    forceUpdate,
    storeUrl: 'https://apps.apple.com/app/id6758354741',
  });
});

// GET /health
healthRouter.get('/health', asyncHandler(async (req, res) => {
  const health = await dockerService.healthCheck();
  res.json({
    status: health.healthy ? 'ok' : 'degraded',
    version: '2.0.2',
    architecture: 'docker-ts',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
}));

// GET /logs/stream — SSE of backend logs
healthRouter.get('/logs/stream', optionalAuth, (req, res) => {
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
healthRouter.get('/logs/recent', optionalAuth, (req, res) => {
  const count = parseInt(req.query.count as string) || 100;
  res.json({ logs: log.getRecent(count), count });
});

// GET /stats/system-status — Per-user system status for iOS SettingsScreen
healthRouter.get('/stats/system-status', requireAuth, asyncHandler(async (req, res) => {
  try {
    // Always use authenticated userId — never accept from query params
    const userId = req.userId!;
    // Always read plan from Firestore — never trust client-provided planId
    const planId = await getUserPlan(userId);

    // Plan limits
    const planLimits: Record<string, { tokens: number; previews: number; projects: number; search: number }> = {
      free:    { tokens: 50000, previews: 5, projects: 3, search: 999999 },
      go:      { tokens: 500000, previews: 20, projects: 15, search: 999999 },
      pro:     { tokens: 2000000, previews: 75, projects: 75, search: 999999 },
      team:    { tokens: 10000000, previews: 300, projects: 300, search: 999999 },
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

    // Total projects from Firestore (real count, not in-memory sessions)
    let totalProjects = 0;
    const previewsByProject: { name: string; used: number; limit: number }[] = [];
    const fbDb = firebaseService.getFirestore();
    if (fbDb) {
      const projSnap = await fbDb.collection('user_projects').where('userId', '==', userId).get();
      totalProjects = projSnap.size;
      projSnap.docs.forEach(d => {
        const data = d.data();
        previewsByProject.push({
          name: data.name || d.id.substring(0, 15),
          used: data.previewCount || 0,
          limit: limits.previews,
        });
      });
    }

    // Search usage (tracked as operation)
    const searchOps = metricsService.getOperationEntries('web_search', 10000)
      .filter(o => o.timestamp >= monthStart.getTime()).length;

    // Storage usage
    const storageLimits = getPlanProjectLimits(planId);
    const storageMb = await getUserStorageMb(userId);

    res.json({
      tokens: {
        used: tokensUsed,
        limit: limits.tokens,
        percent: limits.tokens > 0 ? Math.round((tokensUsed / limits.tokens) * 100) : 0,
        hourly,
      },
      previews: {
        limit: limits.previews,
        byProject: previewsByProject,
      },
      projects: {
        active: totalProjects,
        limit: limits.projects,
        percent: limits.projects > 0 ? Math.round((totalProjects / limits.projects) * 100) : 0,
      },
      search: {
        used: searchOps,
        limit: limits.search,
        percent: limits.search > 0 ? Math.round((searchOps / limits.search) * 100) : 0,
      },
      storage: {
        usedMb: storageMb,
        limitMb: storageLimits.maxStorageMb,
        percent: storageLimits.maxStorageMb > 0 ? Math.round((storageMb / storageLimits.maxStorageMb) * 100) : 0,
      },
    });
  } catch (error: any) {
    log.error('[Stats] system-status error:', error);
    res.status(500).json({ error: 'Failed to retrieve system status' });
  }
}));

// GET /ai/budget/:userId — AI budget status for iOS SettingsScreen
healthRouter.get('/ai/budget/:userId', optionalAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.params.userId;
    // Always read plan from Firestore — never trust client-provided planId
    const planId = await getUserPlan(userId);

    const planBudgets: Record<string, { name: string; monthlyBudgetEur: number }> = {
      free:    { name: 'Free', monthlyBudgetEur: 1.00 },
      go:      { name: 'Go', monthlyBudgetEur: 7.50 },
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
    const rawPercent = plan.monthlyBudgetEur > 0
      ? (spentEur / plan.monthlyBudgetEur) * 100
      : 0;
    const percentUsed = rawPercent > 0 ? Math.max(1, Math.round(rawPercent)) : 0;

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

// POST /ai/budgets — Batch AI budget status (for admin dashboard)
healthRouter.post('/ai/budgets', optionalAuth, asyncHandler(async (req, res) => {
  try {
    const { uids } = req.body;
    if (!Array.isArray(uids) || uids.length === 0) {
      return res.status(400).json({ success: false, error: 'uids must be a non-empty array' });
    }
    // Cap at 500 to prevent abuse
    const limitedUids = uids.slice(0, 500);

    const planBudgets: Record<string, { name: string; monthlyBudgetEur: number }> = {
      free:    { name: 'Free', monthlyBudgetEur: 1.00 },
      go:      { name: 'Go', monthlyBudgetEur: 7.50 },
      pro:     { name: 'Pro', monthlyBudgetEur: 50.00 },
      team:    { name: 'Team', monthlyBudgetEur: 200.00 },
    };

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const sinceTs = monthStart.getTime();

    const results: Record<string, any> = {};

    await Promise.all(limitedUids.map(async (uid: string) => {
      try {
        const planId = await getUserPlan(uid);
        const plan = planBudgets[planId] || planBudgets.free;
        const aiSummary = metricsService.getAIUsageSummary(uid, sinceTs);

        const spentEur = aiSummary.totalCostEur;
        const remainingEur = Math.max(0, plan.monthlyBudgetEur - spentEur);
        const rawPercent = plan.monthlyBudgetEur > 0
          ? (spentEur / plan.monthlyBudgetEur) * 100
          : 0;
        const percentUsed = rawPercent > 0 ? Math.max(1, Math.round(rawPercent)) : 0;

        results[uid] = {
          success: true,
          plan: { id: planId, name: plan.name, monthlyBudgetEur: plan.monthlyBudgetEur },
          usage: { spentEur, remainingEur, percentUsed },
        };
      } catch (err: any) {
        results[uid] = { success: false, error: err.message || 'Failed to retrieve budget' };
      }
    }));

    res.json(results);
  } catch (error: any) {
    log.error('[Budget Batch] error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve batch budget status' });
  }
}));
