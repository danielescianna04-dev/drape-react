import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

function optionalInt(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? parseInt(v, 10) : fallback;
}

function optionalFloat(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? parseFloat(v) : fallback;
}

function optionalBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function optionalEnum<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const value = process.env[key];
  if (!value) return fallback;
  return allowed.includes(value as T) ? (value as T) : fallback;
}

const nodeEnv = optional('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';
const AI_THINKING_LEVELS = ['none', 'minimal', 'low', 'medium', 'high', 'max'] as const;
const PROMPT_CACHE_TTLS = ['5m', '1h'] as const;

// Monthly AI budget per plan. Resets monthly. Legacy 'team' kept as alias of Pro
// so legacy users don't lose access; it is not sold.
export const planAiBudgets = {
  free: { name: 'Free', monthlyBudgetEur: optionalFloat('AI_BUDGET_FREE_EUR', 1.0) },
  go: { name: 'Go', monthlyBudgetEur: optionalFloat('AI_BUDGET_GO_EUR', 10.0) },
  pro: { name: 'Pro', monthlyBudgetEur: optionalFloat('AI_BUDGET_PRO_EUR', 25.0) },
  team: { name: 'Pro', monthlyBudgetEur: optionalFloat('AI_BUDGET_PRO_EUR', 25.0) },
} as const;

export const config = {
  port: optionalInt('PORT', 3001),
  publicUrl: optional('PUBLIC_URL', isProduction ? 'https://drape.info' : ''),
  nodeEnv,
  isDev: nodeEnv === 'development',

  // Docker
  dockerServers: optional('DOCKER_SERVERS', 'local'),
  dockerTlsDir: optional('DOCKER_TLS_DIR', '/etc/docker/tls'),
  workspaceImage: optional('DRAPE_WORKSPACE_IMAGE', 'drape-workspace:latest'),

  // Drape Cloud (multi-tenant shared backend for generated apps)
  drapeCloudDbUrl: optional('DRAPE_CLOUD_DB_URL', ''),
  drapeCloudEnabled: optionalBool('DRAPE_CLOUD_ENABLED', false),
  drapeCloudRowQuotaPerProject: optionalInt('DRAPE_CLOUD_ROW_QUOTA_PER_PROJECT', 10000),
  drapeCloudRequestsQuotaPerMonth: optionalInt('DRAPE_CLOUD_REQUESTS_QUOTA_PER_MONTH', 100000),

  // NVMe paths
  projectsRoot: optional('PROJECTS_ROOT', '/data/projects'),
  publishedRoot: optional('PUBLISHED_ROOT', '/data/published'),
  pnpmStorePath: optional('PNPM_STORE_PATH', '/data/pnpm-store'),
  cacheRoot: optional('CACHE_ROOT', '/data/cache'),

  // Firebase
  googleCloudProject: optional('GOOGLE_CLOUD_PROJECT', 'drapev2'),

  // AI
  anthropicApiKey: optional('ANTHROPIC_API_KEY', ''),
  geminiApiKey: optional('GEMINI_API_KEY', ''),
  groqApiKey: optional('GROQ_API_KEY', ''),
  openaiApiKey: optional('OPENAI_API_KEY', ''),
  openrouterApiKey: optional('OPENROUTER_API_KEY', ''),
  projectGenerationModel: optional('PROJECT_GENERATION_MODEL', 'claude-4-7-opus'),
  projectGenerationThinkingLevel: optionalEnum('PROJECT_GENERATION_THINKING_LEVEL', AI_THINKING_LEVELS, 'medium'),
  projectOpusPromptCachingEnabled: optionalBool('PROJECT_OPUS_PROMPT_CACHING_ENABLED', true),
  projectOpusPromptCacheTtl: optionalEnum('PROJECT_OPUS_PROMPT_CACHE_TTL', PROMPT_CACHE_TTLS, '5m'),
  projectGenerationTaskBudgetEnabled: optionalBool('PROJECT_GENERATION_TASK_BUDGET_ENABLED', true),
  projectGenerationTaskBudgetSimpleTokens: optionalInt('PROJECT_GENERATION_TASK_BUDGET_SIMPLE_TOKENS', 24000),
  projectGenerationTaskBudgetMediumTokens: optionalInt('PROJECT_GENERATION_TASK_BUDGET_MEDIUM_TOKENS', 32000),
  projectGenerationTaskBudgetComplexTokens: optionalInt('PROJECT_GENERATION_TASK_BUDGET_COMPLEX_TOKENS', 40000),
  projectGenerationMaxTokens: optionalInt('PROJECT_GENERATION_MAX_TOKENS', 16000),
  projectVerifyFixModel: optional('PROJECT_VERIFY_FIX_MODEL', 'gemini-3-flash'),
  projectVerifyFixThinkingLevel: optionalEnum('PROJECT_VERIFY_FIX_THINKING_LEVEL', AI_THINKING_LEVELS, 'low'),
  projectVerifyEscalationModel: optional('PROJECT_VERIFY_ESCALATION_MODEL', 'claude-4-7-opus'),
  projectVerifyEscalationThinkingLevel: optionalEnum('PROJECT_VERIFY_ESCALATION_THINKING_LEVEL', AI_THINKING_LEVELS, 'medium'),
  projectVerifyEscalationTaskBudgetEnabled: optionalBool('PROJECT_VERIFY_ESCALATION_TASK_BUDGET_ENABLED', true),
  projectVerifyEscalationTaskBudgetTokens: optionalInt('PROJECT_VERIFY_ESCALATION_TASK_BUDGET_TOKENS', 16000),
  projectVerifyEscalationMaxCostEur: optionalFloat('PROJECT_VERIFY_ESCALATION_MAX_COST_EUR', 0.35),
  projectAiMaxCostEur: optionalFloat('PROJECT_AI_MAX_COST_EUR', 2.2),
  projectVerifyEscalationMaxImpactedFiles: optionalInt('PROJECT_VERIFY_ESCALATION_MAX_IMPACTED_FILES', 4),
  projectVerifyFixMaxContextFiles: optionalInt('PROJECT_VERIFY_FIX_MAX_CONTEXT_FILES', 8),
  projectVerifyEscalationMaxContextFiles: optionalInt('PROJECT_VERIFY_ESCALATION_MAX_CONTEXT_FILES', 4),
  projectVerifyFixMaxContextCharsPerFile: optionalInt('PROJECT_VERIFY_FIX_MAX_CONTEXT_CHARS_PER_FILE', 6000),
  projectBatchFailureReviewEnabled: optionalBool('PROJECT_BATCH_FAILURE_REVIEW_ENABLED', true),
  projectBatchFailureReviewModel: optional('PROJECT_BATCH_FAILURE_REVIEW_MODEL', 'claude-4-6-sonnet'),
  projectBatchFailureReviewMaxTokens: optionalInt('PROJECT_BATCH_FAILURE_REVIEW_MAX_TOKENS', 1400),

  // GitHub
  githubClientId: optional('GITHUB_CLIENT_ID', ''),
  githubClientSecret: optional('GITHUB_CLIENT_SECRET', ''),

  // GitLab
  gitlabClientId: optional('GITLAB_CLIENT_ID', ''),
  gitlabClientSecret: optional('GITLAB_CLIENT_SECRET', ''),
  gitlabRedirectUri: optional('GITLAB_REDIRECT_URI', 'drape://oauth/gitlab/callback'),

  // Bitbucket
  bitbucketClientId: optional('BITBUCKET_CLIENT_ID', ''),
  bitbucketClientSecret: optional('BITBUCKET_CLIENT_SECRET', ''),
  bitbucketRedirectUri: optional('BITBUCKET_REDIRECT_URI', 'drape://oauth/bitbucket/callback'),

  // Container defaults
  containerMemoryMb: optionalInt('CONTAINER_MEMORY_MB', 4096),
  containerCpus: optionalInt('CONTAINER_CPUS', 4),
  containerIdleTimeoutMs: optionalInt('CONTAINER_IDLE_TIMEOUT_MS', 15 * 60 * 1000),
  nodeModulesCacheMaxMb: optionalInt('NODE_MODULES_CACHE_MAX_MB', 70 * 1024),
  strictNativeBinaryIntegrityCheck: optionalBool('STRICT_NATIVE_BINARY_INTEGRITY_CHECK', false),
  maxActiveContainersPerUser: optionalInt('MAX_ACTIVE_CONTAINERS_PER_USER', 3),

  // Security hardening — NEVER allow in production regardless of env var
  allowInsecureOwnershipBypass: isProduction ? false : optionalBool('ALLOW_INSECURE_OWNERSHIP_BYPASS', false),

  // Resend (email)
  resendApiKey: optional('RESEND_API_KEY', ''),
  resendFromEmail: optional('RESEND_FROM_EMAIL', 'Drape <noreply@drape-dev.it>'),
  resendReplyTo: optional('RESEND_REPLY_TO', ''),

  // Apple IAP
  appleIapKeyId: optional('APPLE_IAP_KEY_ID', ''),
  appleIapIssuerId: optional('APPLE_IAP_ISSUER_ID', ''),
  appleIapBundleId: optional('APPLE_IAP_BUNDLE_ID', 'com.drape.app'),
  appleIapKeyPath: optional('APPLE_IAP_KEY_PATH', './apple-iap-key.p8'),
  appleIapEnvironment: optional('APPLE_IAP_ENVIRONMENT', 'sandbox'),

  // Supabase Management API (legacy — being replaced by Neon)
  supabaseAccessToken: optional('SUPABASE_ACCESS_TOKEN', ''),
  supabaseOrgId: optional('SUPABASE_ORG_ID', ''),
  supabaseRegion: optional('SUPABASE_REGION', 'eu-central-1'),

  // Neon Postgres (primary cloud database — scale-to-zero, cheap)
  neonApiKey: optional('NEON_API_KEY', ''),
  neonOrgId: optional('NEON_ORG_ID', ''),
  neonRegion: optional('NEON_REGION', 'aws-eu-central-1'),
  aiBudgetFreeEur: planAiBudgets.free.monthlyBudgetEur,
  aiBudgetGoEur: planAiBudgets.go.monthlyBudgetEur,
  aiBudgetProEur: planAiBudgets.pro.monthlyBudgetEur,
  aiBudgetTeamEur: planAiBudgets.team.monthlyBudgetEur,
} as const;

export type Config = typeof config;
