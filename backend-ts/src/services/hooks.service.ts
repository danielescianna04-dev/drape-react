import { fileService } from './file.service';
import { log } from '../utils/logger';
import { dockerService } from './docker.service';

interface HookConfig {
  pre?: Record<string, string[]>;   // toolName → commands to run before
  post?: Record<string, string[]>;  // toolName → commands to run after
  postWrite?: string[];              // commands to run after any write/edit
}

const hookCache = new Map<string, { config: HookConfig | null; expiresAt: number }>();
const CACHE_TTL = 120_000; // 2 minutes

/**
 * Load hooks configuration from .drape/hooks.json or .agents/hooks.json
 */
async function loadHooks(projectId: string): Promise<HookConfig | null> {
  const cached = hookCache.get(projectId);
  if (cached && Date.now() < cached.expiresAt) return cached.config;

  const configFiles = ['.drape/hooks.json', '.agents/hooks.json'];
  for (const file of configFiles) {
    try {
      const result = await fileService.readFile(projectId, file);
      if (result.success && result.data?.content) {
        const config = JSON.parse(result.data.content) as HookConfig;
        hookCache.set(projectId, { config, expiresAt: Date.now() + CACHE_TTL });
        log.info(`[Hooks] Loaded config from ${file}`);
        return config;
      }
    } catch { /* not found or invalid */ }
  }

  hookCache.set(projectId, { config: null, expiresAt: Date.now() + CACHE_TTL });
  return null;
}

/**
 * Run pre-tool hooks. Returns combined output or null if no hooks.
 */
export async function runPreHooks(
  projectId: string, toolName: string, agentUrl?: string
): Promise<string | null> {
  const hooks = await loadHooks(projectId);
  if (!hooks?.pre?.[toolName]) return null;

  return executeHookCommands(hooks.pre[toolName], agentUrl);
}

/**
 * Run post-tool hooks. Returns combined output or null if no hooks.
 */
export async function runPostHooks(
  projectId: string, toolName: string, agentUrl?: string, filePath?: string
): Promise<string | null> {
  const hooks = await loadHooks(projectId);
  const commands: string[] = [];

  // Tool-specific post hooks
  if (hooks?.post?.[toolName]) {
    commands.push(...hooks.post[toolName]);
  }

  // postWrite hooks for any file modification tool
  const writingTools = ['write_file', 'edit_file', 'multi_edit_file', 'patch_file'];
  if (hooks?.postWrite && writingTools.includes(toolName)) {
    commands.push(...hooks.postWrite);
  }

  if (commands.length === 0) return null;

  // Replace {file} placeholder with actual file path
  const resolvedCommands = filePath
    ? commands.map(cmd => cmd.replace(/\{file\}/g, filePath))
    : commands;

  return executeHookCommands(resolvedCommands, agentUrl);
}

/**
 * Execute a list of hook commands in the container.
 */
async function executeHookCommands(commands: string[], agentUrl?: string): Promise<string | null> {
  if (!agentUrl || commands.length === 0) return null;

  const outputs: string[] = [];
  for (const cmd of commands) {
    try {
      const result = await dockerService.exec(agentUrl, cmd, '/home/coder/project', 10000);
      if (result.stdout?.trim()) outputs.push(result.stdout.trim());
      if (result.exitCode !== 0 && result.stderr?.trim()) {
        outputs.push(`[Hook warning] ${cmd}: ${result.stderr.trim()}`);
      }
    } catch (e: any) {
      outputs.push(`[Hook error] ${cmd}: ${e.message}`);
    }
  }

  return outputs.length > 0 ? outputs.join('\n') : null;
}

/**
 * Clear cached hooks for a project.
 */
export function clearHookCache(projectId?: string) {
  if (projectId) hookCache.delete(projectId);
  else hookCache.clear();
}
