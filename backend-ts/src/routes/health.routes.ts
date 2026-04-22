import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { optionalAuth, requireAuth, getUserPlan, getPlanProjectLimits, getUserStorageMb, countUserProjects } from '../middleware/auth';
import { log } from '../utils/logger';
import { dockerService } from '../services/docker.service';
import { metricsService } from '../services/metrics.service';
import { firebaseService } from '../services/firebase.service';
import { sessionService } from '../services/session.service';
import { buildProjectAIAnalytics } from '../services/project-ai-analytics.service';
import { fileService } from '../services/file.service';
import { planAiBudgets } from '../config';

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
  // Min version kept at 2.0.2 so existing installs are not force-updated
  // by a bump in the `currentVersion` marker.
  const minVersion = '2.0.2';

  const forceUpdate = appVersion ? compareVersions(appVersion, minVersion) < 0 : false;

  res.json({
    minVersion,
    currentVersion: '2.1.0',
    forceUpdate,
    storeUrl: 'https://apps.apple.com/app/id6758354741',
  });
});

// GET /health
healthRouter.get('/health', asyncHandler(async (req, res) => {
  const health = await dockerService.healthCheck();
  res.json({
    status: health.healthy ? 'ok' : 'degraded',
    version: '2.1.0',
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

    // Plan usage-summary limits. Not a source of truth for AI budgets (see planAiBudgets)
    // nor project counts (see resolvePlanEntitlements) — this is a display-side summary
    // for the tokens/usage endpoint. Previews here is per-project cap.
    const planLimits: Record<string, { tokens: number; previews: number; projects: number; search: number }> = {
      free: { tokens: 50000, previews: 20, projects: 3, search: 999999 },
      go: { tokens: 500000, previews: 300, projects: 15, search: 999999 },
      pro: { tokens: 2000000, previews: 300, projects: 75, search: 999999 },
    };

    const normalizedPlan = planId === 'starter' ? 'free' : planId === 'team' ? 'pro' : planId;
    const limits = planLimits[normalizedPlan] || planLimits.free;

    // Get real AI usage from metrics
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const aiSummary = metricsService.getAIUsageSummary(userId, monthStart.getTime(), ['generation', 'verify']);
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
    const projectCounts = await countUserProjects(userId);
    const totalProjects = projectCounts.created + projectCounts.cloned + projectCounts.local;
    const userSessions = await sessionService.getByUserId(userId);
    const activePreviewProjectIds = new Set(userSessions.map((session) => session.projectId));
    const previewsByProject: { name: string; used: number; limit: number; isActive: boolean }[] = [];
    const fbDb = firebaseService.getFirestore();
    if (fbDb) {
      const projSnap = await fbDb.collection('user_projects').where('userId', '==', userId).get();
      projSnap.docs.forEach(d => {
        const data = d.data();
        previewsByProject.push({
          name: data.name || d.id.substring(0, 15),
          used: data.previewCount || 0,
          limit: limits.previews,
          isActive: activePreviewProjectIds.has(d.id),
        });
      });
    }

    const totalPreviewStarts = previewsByProject.reduce((sum, project) => sum + (project.used || 0), 0);
    const maxPreviewStartsOnProject = previewsByProject.reduce((max, project) => Math.max(max, project.used || 0), 0);
    const activePreviewSessions = userSessions.length;

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
        limitPerProject: limits.previews,
        totalStarts: totalPreviewStarts,
        maxUsedOnProject: maxPreviewStartsOnProject,
        activeSessions: activePreviewSessions,
        activeProjects: activePreviewProjectIds.size,
        byProject: previewsByProject,
      },
      projects: {
        active: totalProjects,
        used: totalProjects,
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

const handleAiBudgetStatus = asyncHandler(async (req, res) => {
  try {
    const userId = req.userId!;
    // Always read plan from Firestore — never trust client-provided planId
    const planId = await getUserPlan(userId);

    const plan = planAiBudgets[planId as keyof typeof planAiBudgets] || planAiBudgets.free;

    // Get this month's AI spending from metrics
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const aiSummary = metricsService.getAIUsageSummary(userId, monthStart.getTime(), ['generation', 'verify']);

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
});

// GET /ai/budget — AI budget status for the authenticated user
healthRouter.get('/ai/budget', requireAuth, handleAiBudgetStatus);

// GET /ai/budget/:userId — backward-compatible alias; ignores the path userId
healthRouter.get('/ai/budget/:userId', requireAuth, handleAiBudgetStatus);

// GET /stats/opencode-optimizer — OpenCode context optimization metrics
healthRouter.get('/stats/opencode-optimizer', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.userId!;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const summary = metricsService.getOpenCodeOptimizationSummary(userId, monthStart.getTime());
    const entries = metricsService.getOpenCodeOptimizationEntries(userId, 200)
      .filter((entry) => entry.timestamp >= monthStart.getTime());

    res.json({
      success: true,
      optimizer: summary,
      recentRuns: entries.slice(-30),
    });
  } catch (error: any) {
    log.error('[Stats] opencode-optimizer error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve OpenCode optimizer stats' });
  }
}));

// GET /stats/conversation-optimizer — AgentLoop context optimizer metrics
healthRouter.get('/stats/conversation-optimizer', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.userId!;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const entries = metricsService.getOperationEntries('conversation_optimizer_run', 5000)
      .filter((entry) => entry.timestamp >= monthStart.getTime())
      .filter((entry) => !entry.metadata?.userId || entry.metadata.userId === userId);

    const totalRuns = entries.length;
    const totalSavedTokens = entries.reduce((sum, entry) => sum + Number(entry.metadata?.savedTokens || 0), 0);
    const totalOriginalTokens = entries.reduce((sum, entry) => sum + Number(entry.metadata?.originalEstimatedTokens || 0), 0);
    const totalOptimizedTokens = entries.reduce((sum, entry) => sum + Number(entry.metadata?.optimizedEstimatedTokens || 0), 0);
    const totalDigestedToolResults = entries.reduce((sum, entry) => sum + Number(entry.metadata?.digestedToolResults || 0), 0);
    const summaryRuns = entries.filter((entry) => Boolean(entry.metadata?.summaryUsed)).length;

    res.json({
      success: true,
      optimizer: {
        totalRuns,
        totalSavedTokens,
        totalOriginalTokens,
        totalOptimizedTokens,
        totalDigestedToolResults,
        summaryRuns,
        averageSavedTokens: totalRuns > 0 ? Math.round(totalSavedTokens / totalRuns) : 0,
      },
      recentRuns: entries.slice(-30),
    });
  } catch (error: any) {
    log.error('[Stats] conversation-optimizer error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve conversation optimizer stats' });
  }
}));

// GET /stats/project-ai-analytics — Monthly per-project AI spend analytics
healthRouter.get('/stats/project-ai-analytics', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.userId!;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const sinceTs = monthStart.getTime();

    const entries = metricsService.getAIUsageEntries(userId, 10000)
      .filter((entry) => entry.timestamp >= sinceTs)
      .filter((entry) => Boolean(entry.projectId));

    const uniqueProjectIds = [...new Set(entries.map((entry) => entry.projectId).filter(Boolean) as string[])];
    const projectComplexityById: Record<string, 'simple' | 'medium' | 'complex' | 'unknown'> = {};
    await Promise.all(uniqueProjectIds.map(async (projectId) => {
      try {
        const read = await fileService.readFile(projectId, '.drape/build-report.json');
        if (!read.success || !read.data?.content) return;
        const parsed = JSON.parse(read.data.content);
        const complexity = parsed?.summary?.projectComplexity;
        projectComplexityById[projectId] =
          complexity === 'simple' || complexity === 'medium' || complexity === 'complex'
            ? complexity
            : 'unknown';
      } catch {}
    }));

    const analytics = buildProjectAIAnalytics(entries, { projectComplexityById });
    const topProjects = analytics.projects.slice(0, 5);

    const projectNamesById: Record<string, string> = {};
    const fbDb = firebaseService.getFirestore();
    if (fbDb && topProjects.length > 0) {
      const topProjectIds = [...new Set(topProjects.map((project) => project.projectId))];
      await Promise.all(topProjectIds.map(async (projectId) => {
        try {
          const doc = await fbDb.collection('user_projects').doc(projectId).get();
          if (!doc.exists) return;
          const data = doc.data();
          if (data?.userId !== userId) return;
          if (typeof data.name === 'string' && data.name.trim()) {
            projectNamesById[projectId] = data.name.trim();
          }
        } catch (error: any) {
          log.warn(`[Stats] Failed loading project name for AI analytics ${projectId}: ${error.message}`);
        }
      }));
    }

    res.json({
      success: true,
      period: {
        start: new Date(sinceTs).toISOString(),
        end: new Date().toISOString(),
      },
      overview: analytics.summary,
      byModel: analytics.byModel.slice(0, 6),
      byComplexity: analytics.byComplexity,
      topProjects: topProjects.map((project) => ({
        ...project,
        projectName: projectNamesById[project.projectId] || null,
      })),
    });
  } catch (error: any) {
    log.error('[Stats] project-ai-analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve project AI analytics' });
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

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const sinceTs = monthStart.getTime();

    const results: Record<string, any> = {};

    await Promise.all(limitedUids.map(async (uid: string) => {
      try {
        const planId = await getUserPlan(uid);
        const plan = planAiBudgets[planId as keyof typeof planAiBudgets] || planAiBudgets.free;
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
