import { describe, expect, it } from 'vitest';
import {
  assessProjectComplexity,
  getProjectGenerationRuntimePolicy,
} from '../../../backend-ts/src/services/project-complexity.service';

describe('assessProjectComplexity', () => {
  it('classifies a marketing landing page as simple', () => {
    const assessment = assessProjectComplexity({
      technology: 'html',
      description: 'Create a one-page landing page for a design studio with hero, testimonials, pricing, and contact form.',
      answers: {
        audience: 'small_business',
        style: 'marketing',
      },
      cloudMode: false,
    });

    expect(assessment.level).toBe('simple');
    expect(assessment.score).toBeLessThanOrEqual(1);
  });

  it('classifies a dashboard app with auth and database as complex', () => {
    const assessment = assessProjectComplexity({
      technology: 'nextjs',
      description: 'Build a SaaS dashboard with auth, role-based access, analytics, billing, database-backed projects, notifications, and admin area.',
      answers: {
        features: ['auth', 'billing', 'analytics', 'admin'],
        data: 'postgres',
      },
      cloudMode: true,
    });

    expect(assessment.level).toBe('complex');
    expect(assessment.score).toBeGreaterThanOrEqual(7);
  });

  it('keeps a standard app in the medium bucket', () => {
    const assessment = assessProjectComplexity({
      technology: 'react',
      description: 'Create a client portal with dashboard, profile settings, document list, search, and filters.',
      answers: {
        auth: 'email_login',
        sections: ['dashboard', 'documents'],
      },
      cloudMode: false,
    });

    expect(assessment.level).toBe('medium');
  });
});

describe('getProjectGenerationRuntimePolicy', () => {
  it('uses the tightest loop for simple projects', () => {
    expect(getProjectGenerationRuntimePolicy('simple')).toEqual({
      maxAttempts: 1,
      maxIterations: 48,
      retryRequiresNearEmptyOutput: true,
      retryMaxCostEur: 0.35,
      retryMaxGeneratedFiles: 1,
      taskBudgetTokens: 24000,
    });
  });

  it('uses the standard loop for medium projects', () => {
    expect(getProjectGenerationRuntimePolicy('medium')).toEqual({
      maxAttempts: 1,
      maxIterations: 64,
      retryRequiresNearEmptyOutput: true,
      retryMaxCostEur: 0.5,
      retryMaxGeneratedFiles: 2,
      taskBudgetTokens: 32000,
    });
  });

  it('allows one transient retry only for complex projects', () => {
    expect(getProjectGenerationRuntimePolicy('complex')).toEqual({
      maxAttempts: 2,
      maxIterations: 80,
      retryRequiresNearEmptyOutput: true,
      retryMaxCostEur: 1.25,
      retryMaxGeneratedFiles: 2,
      taskBudgetTokens: 40000,
    });
  });
});
