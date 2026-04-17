import { describe, expect, it } from 'vitest';
import { getProjectAIBudgetCaps, shouldAllowPremiumEscalation } from '../../../backend-ts/src/services/project-ai-policy';

describe('shouldAllowPremiumEscalation', () => {
  const baseSummary = {
    generationCostEur: 1.8,
    verifyCostEur: 0.35,
    verifyEscalationCostEur: 0,
    totalCostEur: 2.15,
  };

  it('allows escalation when errors are eligible and budgets are still available', () => {
    expect(
      shouldAllowPremiumEscalation({
        summary: baseSummary,
        alreadyAttempted: false,
        hasEligibleErrors: true,
        maxProjectCostEur: 8,
        maxEscalationCostEur: 3,
        isProjectNearlyWorking: true,
        impactedFilesCount: 2,
        maxImpactedFiles: 4,
        cheapFixOnly: false,
      }),
    ).toEqual({
      allowed: true,
      reason: 'allowed',
    });
  });

  it('blocks escalation after a premium attempt already ran', () => {
    expect(
      shouldAllowPremiumEscalation({
        summary: baseSummary,
        alreadyAttempted: true,
        hasEligibleErrors: true,
        maxProjectCostEur: 8,
        maxEscalationCostEur: 3,
        isProjectNearlyWorking: true,
        impactedFilesCount: 2,
        maxImpactedFiles: 4,
        cheapFixOnly: false,
      }),
    ).toEqual({
      allowed: false,
      reason: 'already_attempted',
    });
  });

  it('blocks escalation when the project AI budget is exhausted', () => {
    expect(
      shouldAllowPremiumEscalation({
        summary: {
          ...baseSummary,
          totalCostEur: 12,
        },
        alreadyAttempted: false,
        hasEligibleErrors: true,
        maxProjectCostEur: 12,
        maxEscalationCostEur: 3,
        isProjectNearlyWorking: true,
        impactedFilesCount: 2,
        maxImpactedFiles: 4,
        cheapFixOnly: false,
      }),
    ).toEqual({
      allowed: false,
      reason: 'project_budget_exceeded',
    });
  });

  it('blocks escalation when premium verify spend is already at cap', () => {
    expect(
      shouldAllowPremiumEscalation({
        summary: {
          ...baseSummary,
          verifyEscalationCostEur: 3,
        },
        alreadyAttempted: false,
        hasEligibleErrors: true,
        maxProjectCostEur: 12,
        maxEscalationCostEur: 3,
        isProjectNearlyWorking: true,
        impactedFilesCount: 2,
        maxImpactedFiles: 4,
        cheapFixOnly: false,
      }),
    ).toEqual({
      allowed: false,
      reason: 'escalation_budget_exceeded',
    });
  });

  it('blocks escalation when errors are not eligible for premium handling', () => {
    expect(
      shouldAllowPremiumEscalation({
        summary: baseSummary,
        alreadyAttempted: false,
        hasEligibleErrors: false,
        maxProjectCostEur: 8,
        maxEscalationCostEur: 3,
        isProjectNearlyWorking: true,
        impactedFilesCount: 2,
        maxImpactedFiles: 4,
        cheapFixOnly: false,
      }),
    ).toEqual({
      allowed: false,
      reason: 'no_eligible_errors',
    });
  });

  it('blocks escalation when the project is still far from working', () => {
    expect(
      shouldAllowPremiumEscalation({
        summary: baseSummary,
        alreadyAttempted: false,
        hasEligibleErrors: true,
        maxProjectCostEur: 8,
        maxEscalationCostEur: 3,
        isProjectNearlyWorking: false,
        impactedFilesCount: 2,
        maxImpactedFiles: 4,
        cheapFixOnly: false,
      }),
    ).toEqual({
      allowed: false,
      reason: 'project_not_near_working',
    });
  });

  it('blocks escalation when too many files are likely impacted', () => {
    expect(
      shouldAllowPremiumEscalation({
        summary: baseSummary,
        alreadyAttempted: false,
        hasEligibleErrors: true,
        maxProjectCostEur: 8,
        maxEscalationCostEur: 3,
        isProjectNearlyWorking: true,
        impactedFilesCount: 5,
        maxImpactedFiles: 4,
        cheapFixOnly: false,
      }),
    ).toEqual({
      allowed: false,
      reason: 'too_many_impacted_files',
    });
  });

  it('blocks escalation for cheap-fix-only errors', () => {
    expect(
      shouldAllowPremiumEscalation({
        summary: baseSummary,
        alreadyAttempted: false,
        hasEligibleErrors: true,
        maxProjectCostEur: 8,
        maxEscalationCostEur: 3,
        isProjectNearlyWorking: true,
        impactedFilesCount: 2,
        maxImpactedFiles: 4,
        cheapFixOnly: true,
      }),
    ).toEqual({
      allowed: false,
      reason: 'cheap_fix_only',
    });
  });
});

describe('getProjectAIBudgetCaps', () => {
  it('caps all projects at the flat low-cost budget', () => {
    expect(getProjectAIBudgetCaps('nextjs', 'complex', { maxProjectCostEur: 12, maxEscalationCostEur: 3 })).toEqual({
      maxProjectCostEur: 2.5,
      maxEscalationCostEur: 0.35,
    });
  });

  it('still respects lower custom env caps if configured', () => {
    expect(getProjectAIBudgetCaps('react', 'medium', { maxProjectCostEur: 12, maxEscalationCostEur: 3 })).toEqual({
      maxProjectCostEur: 2.5,
      maxEscalationCostEur: 0.35,
    });
  });

  it('keeps stricter env caps unchanged', () => {
    expect(getProjectAIBudgetCaps('html', 'simple', { maxProjectCostEur: 1.9, maxEscalationCostEur: 0.2 })).toEqual({
      maxProjectCostEur: 1.9,
      maxEscalationCostEur: 0.2,
    });
  });
});
