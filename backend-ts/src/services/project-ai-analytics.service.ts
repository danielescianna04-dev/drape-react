import type { AIUsageEntry, AIUsagePhase } from './metrics.service';
import type { ProjectComplexity } from './project-complexity.service';

type AnalyticsComplexity = ProjectComplexity | 'unknown';

export interface ProjectAIAnalyticsProject {
  projectId: string;
  complexity: AnalyticsComplexity;
  totalCostEur: number;
  totalTokens: number;
  requestCount: number;
  generationCostEur: number;
  verifyCostEur: number;
  verifyEscalationCostEur: number;
  lastActivityAt: string;
}

export interface ProjectAIAnalyticsSummary {
  projectCount: number;
  totalCostEur: number;
  averageCostPerProjectEur: number;
  totalTokens: number;
  generationCostEur: number;
  verifyCostEur: number;
  verifyEscalationCostEur: number;
  premiumEscalationProjects: number;
}

export interface ProjectAIAnalyticsModelSummary {
  model: string;
  costEur: number;
  inputTokens: number;
  outputTokens: number;
  count: number;
}

export interface ProjectAIAnalyticsResult {
  summary: ProjectAIAnalyticsSummary;
  projects: ProjectAIAnalyticsProject[];
  byModel: ProjectAIAnalyticsModelSummary[];
  byComplexity: Array<{
    complexity: AnalyticsComplexity;
    projectCount: number;
    totalCostEur: number;
    averageCostPerProjectEur: number;
    generationCostEur: number;
    verifyCostEur: number;
    verifyEscalationCostEur: number;
  }>;
}

type AnalyticsEntry = Pick<
  AIUsageEntry,
  'projectId' | 'phase' | 'model' | 'inputTokens' | 'outputTokens' | 'costEur' | 'timestamp'
>;

const PHASES: AIUsagePhase[] = ['generation', 'verify', 'verify_escalation', 'other'];

function normalizePhase(phase?: AIUsagePhase): AIUsagePhase {
  return phase && PHASES.includes(phase) ? phase : 'other';
}

function normalizeComplexity(complexity?: string): AnalyticsComplexity {
  return complexity === 'simple' || complexity === 'medium' || complexity === 'complex'
    ? complexity
    : 'unknown';
}

export function buildProjectAIAnalytics(
  entries: AnalyticsEntry[],
  options?: { projectComplexityById?: Record<string, AnalyticsComplexity> },
): ProjectAIAnalyticsResult {
  const byProject = new Map<string, {
    projectId: string;
    complexity: AnalyticsComplexity;
    totalCostEur: number;
    totalTokens: number;
    requestCount: number;
    generationCostEur: number;
    verifyCostEur: number;
    verifyEscalationCostEur: number;
    lastActivityTs: number;
  }>();
  const byModel = new Map<string, ProjectAIAnalyticsModelSummary>();

  for (const entry of entries) {
    if (!entry.projectId) continue;

    const phase = normalizePhase(entry.phase);
    const totalTokens = entry.inputTokens + entry.outputTokens;

    const project =
      byProject.get(entry.projectId) ||
      {
        projectId: entry.projectId,
        complexity: normalizeComplexity(options?.projectComplexityById?.[entry.projectId]),
        totalCostEur: 0,
        totalTokens: 0,
        requestCount: 0,
        generationCostEur: 0,
        verifyCostEur: 0,
        verifyEscalationCostEur: 0,
        lastActivityTs: 0,
      };

    project.totalCostEur += entry.costEur;
    project.totalTokens += totalTokens;
    project.requestCount += 1;
    project.lastActivityTs = Math.max(project.lastActivityTs, entry.timestamp);

    if (phase === 'generation') project.generationCostEur += entry.costEur;
    if (phase === 'verify') project.verifyCostEur += entry.costEur;
    if (phase === 'verify_escalation') project.verifyEscalationCostEur += entry.costEur;

    byProject.set(entry.projectId, project);

    const model =
      byModel.get(entry.model) ||
      {
        model: entry.model,
        costEur: 0,
        inputTokens: 0,
        outputTokens: 0,
        count: 0,
      };
    model.costEur += entry.costEur;
    model.inputTokens += entry.inputTokens;
    model.outputTokens += entry.outputTokens;
    model.count += 1;
    byModel.set(entry.model, model);
  }

  const projects: ProjectAIAnalyticsProject[] = Array.from(byProject.values())
    .map((project) => ({
      projectId: project.projectId,
      complexity: project.complexity,
      totalCostEur: project.totalCostEur,
      totalTokens: project.totalTokens,
      requestCount: project.requestCount,
      generationCostEur: project.generationCostEur,
      verifyCostEur: project.verifyCostEur,
      verifyEscalationCostEur: project.verifyEscalationCostEur,
      lastActivityAt: new Date(project.lastActivityTs).toISOString(),
    }))
    .sort((a, b) => b.totalCostEur - a.totalCostEur);

  const summary = projects.reduce<ProjectAIAnalyticsSummary>((acc, project) => {
    acc.projectCount += 1;
    acc.totalCostEur += project.totalCostEur;
    acc.totalTokens += project.totalTokens;
    acc.generationCostEur += project.generationCostEur;
    acc.verifyCostEur += project.verifyCostEur;
    acc.verifyEscalationCostEur += project.verifyEscalationCostEur;
    if (project.verifyEscalationCostEur > 0) acc.premiumEscalationProjects += 1;
    return acc;
  }, {
    projectCount: 0,
    totalCostEur: 0,
    averageCostPerProjectEur: 0,
    totalTokens: 0,
    generationCostEur: 0,
    verifyCostEur: 0,
    verifyEscalationCostEur: 0,
    premiumEscalationProjects: 0,
  });

  summary.averageCostPerProjectEur = summary.projectCount > 0
    ? summary.totalCostEur / summary.projectCount
    : 0;

  const byComplexityMap = new Map<AnalyticsComplexity, {
    complexity: AnalyticsComplexity;
    projectCount: number;
    totalCostEur: number;
    generationCostEur: number;
    verifyCostEur: number;
    verifyEscalationCostEur: number;
  }>();

  for (const project of projects) {
    const bucket = byComplexityMap.get(project.complexity) || {
      complexity: project.complexity,
      projectCount: 0,
      totalCostEur: 0,
      generationCostEur: 0,
      verifyCostEur: 0,
      verifyEscalationCostEur: 0,
    };
    bucket.projectCount += 1;
    bucket.totalCostEur += project.totalCostEur;
    bucket.generationCostEur += project.generationCostEur;
    bucket.verifyCostEur += project.verifyCostEur;
    bucket.verifyEscalationCostEur += project.verifyEscalationCostEur;
    byComplexityMap.set(project.complexity, bucket);
  }

  return {
    summary,
    projects,
    byModel: Array.from(byModel.values()).sort((a, b) => b.costEur - a.costEur),
    byComplexity: Array.from(byComplexityMap.values())
      .map((bucket) => ({
        ...bucket,
        averageCostPerProjectEur: bucket.projectCount > 0 ? bucket.totalCostEur / bucket.projectCount : 0,
      }))
      .sort((a, b) => b.totalCostEur - a.totalCostEur),
  };
}
