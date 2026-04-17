import { describe, expect, it } from 'vitest';
import { buildProjectAIAnalytics } from '../../../backend-ts/src/services/project-ai-analytics.service';

describe('buildProjectAIAnalytics', () => {
  it('aggregates monthly spend by project, phase, and model', () => {
    const analytics = buildProjectAIAnalytics([
      {
        projectId: 'project-1',
        phase: 'generation',
        model: 'claude-4-6-opus',
        inputTokens: 1000,
        outputTokens: 500,
        costEur: 2.4,
        timestamp: Date.parse('2026-04-16T10:00:00.000Z'),
      },
      {
        projectId: 'project-1',
        phase: 'verify',
        model: 'gemini-3-flash',
        inputTokens: 300,
        outputTokens: 150,
        costEur: 0.12,
        timestamp: Date.parse('2026-04-16T10:05:00.000Z'),
      },
      {
        projectId: 'project-1',
        phase: 'verify_escalation',
        model: 'claude-4-6-opus',
        inputTokens: 250,
        outputTokens: 120,
        costEur: 0.85,
        timestamp: Date.parse('2026-04-16T10:07:00.000Z'),
      },
      {
        projectId: 'project-2',
        phase: 'generation',
        model: 'claude-4-6-opus',
        inputTokens: 600,
        outputTokens: 300,
        costEur: 1.3,
        timestamp: Date.parse('2026-04-16T09:00:00.000Z'),
      },
    ], {
      projectComplexityById: {
        'project-1': 'complex',
        'project-2': 'simple',
      },
    });

    expect(analytics.summary.projectCount).toBe(2);
    expect(analytics.summary.generationCostEur).toBeCloseTo(3.7, 6);
    expect(analytics.summary.verifyCostEur).toBeCloseTo(0.12, 6);
    expect(analytics.summary.verifyEscalationCostEur).toBeCloseTo(0.85, 6);
    expect(analytics.summary.totalCostEur).toBeCloseTo(4.67, 6);
    expect(analytics.summary.premiumEscalationProjects).toBe(1);
    expect(analytics.summary.totalTokens).toBe(3220);
    expect(analytics.summary.averageCostPerProjectEur).toBeCloseTo(2.335, 6);

    expect(analytics.projects[0]).toMatchObject({
      projectId: 'project-1',
      complexity: 'complex',
      totalCostEur: 3.37,
      generationCostEur: 2.4,
      verifyCostEur: 0.12,
      verifyEscalationCostEur: 0.85,
      totalTokens: 2320,
      requestCount: 3,
      lastActivityAt: '2026-04-16T10:07:00.000Z',
    });
    expect(analytics.projects[1]).toMatchObject({
      projectId: 'project-2',
      complexity: 'simple',
      totalCostEur: 1.3,
    });

    expect(analytics.byModel).toEqual([
      {
        model: 'claude-4-6-opus',
        costEur: 4.55,
        inputTokens: 1850,
        outputTokens: 920,
        count: 3,
      },
      {
        model: 'gemini-3-flash',
        costEur: 0.12,
        inputTokens: 300,
        outputTokens: 150,
        count: 1,
      },
    ]);
    expect(analytics.byComplexity).toEqual([
      {
        complexity: 'complex',
        projectCount: 1,
        totalCostEur: 3.37,
        averageCostPerProjectEur: 3.37,
        generationCostEur: 2.4,
        verifyCostEur: 0.12,
        verifyEscalationCostEur: 0.85,
      },
      {
        complexity: 'simple',
        projectCount: 1,
        totalCostEur: 1.3,
        averageCostPerProjectEur: 1.3,
        generationCostEur: 1.3,
        verifyCostEur: 0,
        verifyEscalationCostEur: 0,
      },
    ]);
  });

  it('ignores entries without a project id and normalizes unknown phases', () => {
    const analytics = buildProjectAIAnalytics([
      {
        projectId: undefined,
        phase: 'generation',
        model: 'claude-4-6-opus',
        inputTokens: 100,
        outputTokens: 50,
        costEur: 1,
        timestamp: 1,
      },
      {
        projectId: 'project-3',
        phase: undefined,
        model: 'gemini-3-flash',
        inputTokens: 50,
        outputTokens: 25,
        costEur: 0.02,
        timestamp: 2,
      },
    ]);

    expect(analytics.summary).toMatchObject({
      projectCount: 1,
      totalCostEur: 0.02,
      generationCostEur: 0,
      verifyCostEur: 0,
      verifyEscalationCostEur: 0,
    });
    expect(analytics.projects[0]).toMatchObject({
      projectId: 'project-3',
      complexity: 'unknown',
      totalTokens: 75,
    });
  });
});
