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

export const config = {
  port: optionalInt('PORT', 3001),
  nodeEnv: optional('NODE_ENV', 'development'),
  isDev: optional('NODE_ENV', 'development') === 'development',

  // Docker
  dockerServers: optional('DOCKER_SERVERS', 'local'),
  dockerTlsDir: optional('DOCKER_TLS_DIR', '/etc/docker/tls'),
  workspaceImage: optional('DRAPE_WORKSPACE_IMAGE', 'drape-workspace:latest'),

  // NVMe paths
  projectsRoot: optional('PROJECTS_ROOT', '/data/projects'),
  pnpmStorePath: optional('PNPM_STORE_PATH', '/data/pnpm-store'),
  cacheRoot: optional('CACHE_ROOT', '/data/cache'),

  // Firebase
  googleCloudProject: optional('GOOGLE_CLOUD_PROJECT', 'drape-mobile-ide'),

  // AI
  anthropicApiKey: optional('ANTHROPIC_API_KEY', ''),
  geminiApiKey: optional('GEMINI_API_KEY', ''),
  groqApiKey: optional('GROQ_API_KEY', ''),
  openaiApiKey: optional('OPENAI_API_KEY', ''),

  // GitHub
  githubClientId: optional('GITHUB_CLIENT_ID', ''),
  githubClientSecret: optional('GITHUB_CLIENT_SECRET', ''),

  // Container defaults
  containerMemoryMb: optionalInt('CONTAINER_MEMORY_MB', 4096),
  containerCpus: optionalInt('CONTAINER_CPUS', 4),
  containerIdleTimeoutMs: optionalInt('CONTAINER_IDLE_TIMEOUT_MS', 30 * 60 * 1000),
} as const;

export type Config = typeof config;
