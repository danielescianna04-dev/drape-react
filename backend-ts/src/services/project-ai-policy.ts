import type { ProjectComplexity } from './project-complexity.service';

export interface ProjectAICostSummary {
  generationCostEur: number;
  verifyCostEur: number;
  verifyEscalationCostEur: number;
  totalCostEur: number;
}

export interface PremiumEscalationDecisionInput {
  summary: ProjectAICostSummary;
  alreadyAttempted: boolean;
  hasEligibleErrors: boolean;
  maxProjectCostEur: number;
  maxEscalationCostEur: number;
  isProjectNearlyWorking: boolean;
  impactedFilesCount: number;
  maxImpactedFiles: number;
  cheapFixOnly: boolean;
  requiresBudgetHeadroom?: boolean;
}

export interface PremiumEscalationDecision {
  allowed: boolean;
  reason:
    | 'allowed'
    | 'already_attempted'
    | 'no_eligible_errors'
    | 'project_not_near_working'
    | 'too_many_impacted_files'
    | 'cheap_fix_only'
    | 'insufficient_budget_headroom'
    | 'project_budget_exceeded'
    | 'escalation_budget_exceeded';
}

export interface ProjectAIBudgetCaps {
  maxProjectCostEur: number;
  maxEscalationCostEur: number;
}

export function getProjectAIBudgetCaps(
  _technology: string,
  _complexity: ProjectComplexity,
  defaults: ProjectAIBudgetCaps,
): ProjectAIBudgetCaps {
  return {
    maxProjectCostEur: Number(Math.min(defaults.maxProjectCostEur, 2.2).toFixed(2)),
    maxEscalationCostEur: Number(Math.min(defaults.maxEscalationCostEur, 0.35).toFixed(2)),
  };
}

export function shouldAllowPremiumEscalation(
  input: PremiumEscalationDecisionInput,
): PremiumEscalationDecision {
  const {
    summary,
    alreadyAttempted,
    hasEligibleErrors,
    maxProjectCostEur,
    maxEscalationCostEur,
    isProjectNearlyWorking,
    impactedFilesCount,
    maxImpactedFiles,
    cheapFixOnly,
    requiresBudgetHeadroom = true,
  } = input;

  if (alreadyAttempted) {
    return { allowed: false, reason: 'already_attempted' };
  }

  if (!hasEligibleErrors) {
    return { allowed: false, reason: 'no_eligible_errors' };
  }

  if (!isProjectNearlyWorking) {
    return { allowed: false, reason: 'project_not_near_working' };
  }

  if (impactedFilesCount > maxImpactedFiles) {
    return { allowed: false, reason: 'too_many_impacted_files' };
  }

  if (cheapFixOnly) {
    return { allowed: false, reason: 'cheap_fix_only' };
  }

  if (summary.totalCostEur >= maxProjectCostEur) {
    return { allowed: false, reason: 'project_budget_exceeded' };
  }

  if (summary.verifyEscalationCostEur >= maxEscalationCostEur) {
    return { allowed: false, reason: 'escalation_budget_exceeded' };
  }

  if (
    requiresBudgetHeadroom &&
    (summary.totalCostEur >= maxProjectCostEur * 0.8 ||
      summary.verifyEscalationCostEur >= maxEscalationCostEur * 0.5)
  ) {
    return { allowed: false, reason: 'insufficient_budget_headroom' };
  }

  return { allowed: true, reason: 'allowed' };
}
