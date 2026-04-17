import { config } from '../config';

export type ProjectComplexity = 'simple' | 'medium' | 'complex';

export interface ProjectComplexityAssessment {
  level: ProjectComplexity;
  score: number;
  reasons: string[];
}

export interface ProjectGenerationRuntimePolicy {
  maxAttempts: number;
  maxIterations: number;
  retryRequiresNearEmptyOutput: boolean;
  retryMaxCostEur: number;
  retryMaxGeneratedFiles: number;
  taskBudgetTokens: number;
}

interface AssessProjectComplexityInput {
  technology: string;
  description?: string;
  answers?: Record<string, string | string[]>;
  cloudMode?: boolean;
}

const SIMPLE_KEYWORDS = [
  'landing',
  'landing page',
  'portfolio',
  'brochure',
  'marketing site',
  'one page',
  'one-page',
  'single page',
  'static site',
  'vetrina',
  'sito statico',
];

const COMPLEX_KEYWORD_GROUPS: Array<{ weight: number; keywords: string[]; reason: string }> = [
  { weight: 3, keywords: ['auth', 'login', 'signup', 'session', 'user roles', 'multi-role', 'rbac'], reason: 'auth or roles' },
  { weight: 3, keywords: ['database', 'postgres', 'postgresql', 'supabase', 'neon', 'sql', 'prisma', 'orm'], reason: 'database layer' },
  { weight: 3, keywords: ['stripe', 'payment', 'billing', 'subscription', 'checkout'], reason: 'payments or subscriptions' },
  { weight: 2, keywords: ['dashboard', 'admin', 'analytics', 'crm', 'backoffice'], reason: 'dashboard or admin surface' },
  { weight: 2, keywords: ['chat', 'messaging', 'realtime', 'real-time', 'websocket', 'notifications'], reason: 'realtime or messaging features' },
  { weight: 2, keywords: ['marketplace', 'e-commerce', 'ecommerce', 'cart', 'inventory', 'orders'], reason: 'commerce flow' },
  { weight: 2, keywords: ['upload', 'storage', 'media library', 'file manager'], reason: 'file or media flows' },
  { weight: 1, keywords: ['search', 'filter', 'sorting', 'calendar', 'maps', 'editor', 'workflow', 'onboarding'], reason: 'advanced interaction patterns' },
  { weight: 1, keywords: ['api', 'integration', 'webhook', 'cms', 'localization', 'multi-language'], reason: 'external or platform integration' },
];

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function flattenAnswers(answers: Record<string, string | string[]> | undefined): string[] {
  if (!answers) return [];
  const values: string[] = [];
  for (const value of Object.values(answers)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string' && entry.trim()) values.push(entry.trim());
      }
    } else if (typeof value === 'string' && value.trim()) {
      values.push(value.trim());
    }
  }
  return values;
}

export function assessProjectComplexity(input: AssessProjectComplexityInput): ProjectComplexityAssessment {
  const description = input.description?.trim() || '';
  const answerValues = flattenAnswers(input.answers);
  const searchText = normalizeText([description, ...answerValues].join(' \n '));
  const reasons = new Set<string>();
  let score = 0;

  if (input.cloudMode) {
    score += 2;
    reasons.add('cloud mode');
  }

  const normalizedTechnology = normalizeText(input.technology || '');
  if (normalizedTechnology.includes('next')) {
    score += 1;
    reasons.add('nextjs stack');
  }

  if (normalizedTechnology.includes('html')) {
    score -= 1;
    reasons.add('static html stack');
  }

  if (description.length > 350) {
    score += 1;
    reasons.add('long prompt');
  }

  if (description.length > 700) {
    score += 1;
    reasons.add('very detailed prompt');
  }

  if (answerValues.length >= 4) {
    score += 1;
    reasons.add('many structured answers');
  }

  const answerSelectionCount = answerValues.reduce((sum, value) => sum + value.split(',').filter(Boolean).length, 0);
  if (answerSelectionCount >= 6) {
    score += 1;
    reasons.add('broad feature selection');
  }

  for (const simpleKeyword of SIMPLE_KEYWORDS) {
    if (searchText.includes(simpleKeyword)) {
      score -= 2;
      reasons.add('simple marketing-style app');
      break;
    }
  }

  for (const group of COMPLEX_KEYWORD_GROUPS) {
    if (group.keywords.some((keyword) => searchText.includes(keyword))) {
      score += group.weight;
      reasons.add(group.reason);
    }
  }

  const level: ProjectComplexity =
    score >= 7 ? 'complex' :
      score >= 3 ? 'medium' :
        'simple';

  return {
    level,
    score,
    reasons: Array.from(reasons),
  };
}

export function getProjectGenerationRuntimePolicy(level: ProjectComplexity): ProjectGenerationRuntimePolicy {
  if (level === 'simple') {
    return {
      maxAttempts: 1,
      maxIterations: 48,
      retryRequiresNearEmptyOutput: true,
      retryMaxCostEur: 0.35,
      retryMaxGeneratedFiles: 1,
      taskBudgetTokens: config.projectGenerationTaskBudgetSimpleTokens,
    };
  }

  if (level === 'medium') {
    return {
      maxAttempts: 1,
      maxIterations: 64,
      retryRequiresNearEmptyOutput: true,
      retryMaxCostEur: 0.5,
      retryMaxGeneratedFiles: 2,
      taskBudgetTokens: config.projectGenerationTaskBudgetMediumTokens,
    };
  }

  return {
    maxAttempts: 2,
    maxIterations: 80,
    retryRequiresNearEmptyOutput: true,
    retryMaxCostEur: 1.25,
    retryMaxGeneratedFiles: 2,
    taskBudgetTokens: config.projectGenerationTaskBudgetComplexTokens,
  };
}
