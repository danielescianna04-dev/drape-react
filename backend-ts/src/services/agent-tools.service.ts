import { fileService } from './file.service';
import { dockerService } from './docker.service';
import { globSearch } from '../tools/glob';
import { grepSearch } from '../tools/grep';
import { webSearch } from '../tools/web-search';
import { writeTodos, getTodos } from '../tools/todo-write';
import { log } from '../utils/logger';
import { Session, ToolResult } from '../types';
import path from 'path';

/**
 * Blocklist of dangerous command patterns to prevent abuse
 */
const DANGEROUS_PATTERNS = [
  /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\/(?!home\/coder\/project)/,  // rm outside project
  // Protect critical dirs/files managed by the backend install flow — the AI
  // must NEVER delete these during generation/verify. If deps are broken, fix
  // package.json and let the backend re-run the install pipeline.
  /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+(\.\/)?node_modules\b/,  // rm -rf node_modules
  /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+(\.\/)?\.next\b/,        // rm -rf .next (bind mount)
  /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+(\.\/)?\.drape\b/,       // rm -rf .drape (build report etc.)
  /\brm\s+.*\bpackage\.json\b/,                              // deleting package.json
  /\brm\s+.*\bbun\.lock(b)?\b/,                              // deleting bun.lock
  /\brm\s+.*\btsconfig\.json\b/,                             // deleting tsconfig
  /curl\s.*\|\s*(sh|bash)/,       // curl pipe to shell
  /wget\s.*\|\s*(sh|bash)/,       // wget pipe to shell
  />\s*\/etc\//,                    // writing to /etc
  /curl\s+.*-d\s+.*\$\(/,         // curl with command substitution
  /169\.254\.169\.254/,            // AWS metadata endpoint
  /\/proc\/|\/sys\//,             // system pseudo-filesystems
];

/**
 * Truncate long command output (like OpenCode's 30K limit)
 */
function truncateOutput(output: string, maxChars = 30000): string {
  if (output.length <= maxChars) return output;
  const half = Math.floor(maxChars / 2);
  const firstHalf = output.substring(0, half);
  const lastHalf = output.substring(output.length - half);
  const totalLines = output.split('\n').length;
  const keptLines = firstHalf.split('\n').length + lastHalf.split('\n').length;
  const truncatedLines = totalLines - keptLines;
  return `${firstHalf}\n\n... [${truncatedLines} lines truncated] ...\n\n${lastHalf}`;
}

/**
 * Background command tracking
 */
interface BackgroundCommand {
  startedAt: number;
  command: string;
  status: 'running' | 'completed';
  result?: { exitCode: number; stdout: string; stderr: string };
}

const backgroundCommands = new Map<string, BackgroundCommand>();

function isCommandDangerous(command: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return `Command blocked by security policy: matches ${pattern}`;
    }
  }
  return null;
}

/**
 * Service for executing agent tool calls
 * Dispatches tool calls to appropriate implementations
 */
class AgentToolsService {
  /**
   * Execute a tool call and return the result
   * @param toolName - Name of the tool to execute
   * @param input - Tool input parameters
   * @param projectId - The project ID
   * @param session - Optional session (will fetch if not provided)
   * @returns Tool execution result
   */
  async executeTool(
    toolName: string,
    input: any,
    projectId: string,
    session?: Session
  ): Promise<ToolResult> {
    try {
      log.debug(`[AgentTools] Executing ${toolName} for project ${projectId}`);

      switch (toolName) {
        case 'write_file':
          return await this.writeFile(projectId, input, session);

        case 'read_file':
          return await this.readFile(projectId, input);

        case 'edit_file':
          return await this.editFile(projectId, input, session);

        case 'list_directory':
          return await this.listDirectory(projectId, input);

        case 'run_command':
          return await this.runCommand(projectId, input, session);

        case 'command_output':
          return this.getCommandOutput(input);

        case 'memory_read': {
          const { readMemory } = await import('./memory.service');
          const memory = await readMemory(projectId);
          return {
            success: true,
            content: memory || 'No memory saved for this project yet. Use memory_write to save project-specific knowledge.',
          };
        }

        case 'memory_write': {
          const { writeMemory } = await import('./memory.service');
          if (!input.content) {
            return { success: false, error: 'content is required' };
          }
          await writeMemory(projectId, input.content);
          return { success: true, content: 'Project memory updated successfully.' };
        }

        case 'glob_search':
          return await this.globSearchTool(projectId, input);

        case 'grep_search':
          return await this.grepSearchTool(projectId, input);

        case 'web_search':
          return await this.webSearchTool(input);

        case 'todo_write':
          return await this.todoWriteTool(projectId, input);

        case 'ask_user_question':
          return this.askUserQuestion(input);

        case 'signal_completion':
          return this.signalCompletion(input);

        case 'multi_edit_file':
          return await this.multiEditFile(projectId, input, session);

        case 'web_fetch': {
          const { webFetch } = await import('../tools/web-fetch');
          return webFetch(input.url, input.prompt);
        }

        case 'todo_read': {
          const todos = getTodos(projectId);
          return { success: true, content: JSON.stringify(todos), todos };
        }

        // dispatch_agent is handled directly in agent-loop.service.ts (not here)

        case 'patch_file':
          return await this.patchFile(projectId, input, session);

        case 'load_skill': {
          const { loadSkill, discoverSkills } = await import('../tools/skill-loader');
          if (input.name) {
            const content = await loadSkill(projectId, input.name);
            if (content) return { success: true, content };
            const skills = await discoverSkills(projectId);
            const names = skills.map(s => s.name).join(', ');
            return { success: false, content: `Skill "${input.name}" not found. Available: ${names || 'none'}` };
          }
          const skills = await discoverSkills(projectId);
          return { success: true, content: skills.length > 0
            ? skills.map(s => `- ${s.name}: ${s.description}`).join('\n')
            : 'No skills found. Create .drape/skills/<name>.md files to add skills.' };
        }

        case 'tool_search': {
          try {
            const { getAllMcpTools } = await import('./mcp-client');
            const query = (input.query || '').toLowerCase();
            const allTools = await getAllMcpTools();
            const matches = allTools.filter(t =>
              t.name.toLowerCase().includes(query) || (t.description || '').toLowerCase().includes(query)
            );
            return {
              success: true,
              content: matches.length > 0
                ? `Available tools:\n${matches.map(t => `- ${t.name}: ${t.description}`).join('\n')}`
                : `No tools found matching "${input.query}". Configure MCP servers in .drape/mcp.json.`,
            };
          } catch {
            return { success: true, content: 'No MCP servers configured. Add .drape/mcp.json to enable external tools.' };
          }
        }

        default: {
          // Check if it's an MCP tool (prefix: mcp_)
          if (toolName.startsWith('mcp_')) {
            try {
              const { callMcpTool } = await import('./mcp-client');
              const parts = toolName.split('_');
              const serverName = parts[1];
              return callMcpTool(serverName, toolName, input);
            } catch (e: any) {
              return { success: false, error: `MCP tool error: ${e.message}` };
            }
          }
          return {
            success: false,
            error: `Unknown tool: ${toolName}`,
          };
        }
      }
    } catch (error: any) {
      log.error(`[AgentTools] Tool ${toolName} failed: ${error.message}`);
      return {
        success: false,
        error: error.message || 'Tool execution failed',
      };
    }
  }

  /**
   * Write a file to the project
   */
  // Template config files that AI must NEVER overwrite
  private static readonly PROTECTED_FILES = new Set([
    'vite.config.ts', 'tsconfig.json', 'next.config.ts', 'next.config.mjs',
    'postcss.config.mjs', 'postcss.config.js', 'tailwind.config.ts', 'tailwind.config.js',
    'astro.config.mjs', 'index.html', 'src/main.tsx', 'src/main.ts',
    'src/index.css', 'src/style.css', 'app/globals.css', 'app/layout.tsx',
    'src/lib/utils.ts', 'app/lib/utils.ts',
  ]);

  private async writeFile(
    projectId: string,
    input: { file_path: string; content: string; description: string },
    session?: Session
  ): Promise<ToolResult> {
    const { file_path, content, description } = input;

    if (!file_path || content === undefined) {
      return { success: false, error: 'file_path and content are required' };
    }

    // Block overwriting protected template files
    const normalized = file_path.replace(/^\/+/, '');
    if (AgentToolsService.PROTECTED_FILES.has(normalized)) {
      log.warn(`[AgentTools] Blocked write to protected file: ${file_path}`);
      return {
        success: true,
        content: `SKIPPED: ${file_path} is a protected template file. It already has the correct configuration. Use edit_file if you need to modify it, or write your code in other files.`,
      };
    }

    // Smart merge for package.json — preserve template deps, add new ones
    if (normalized === 'package.json') {
      try {
        const existing = await fileService.readFile(projectId, 'package.json');
        if (existing.success && existing.data?.content) {
          const oldPkg = JSON.parse(existing.data.content);
          const newPkg = JSON.parse(content);
          // Merge: keep template deps, add new ones from AI
          const merged = { ...oldPkg };
          if (newPkg.dependencies) {
            merged.dependencies = { ...(oldPkg.dependencies || {}), ...(newPkg.dependencies || {}) };
          }
          if (newPkg.devDependencies) {
            merged.devDependencies = { ...(oldPkg.devDependencies || {}), ...(newPkg.devDependencies || {}) };
          }
          if (newPkg.scripts) {
            merged.scripts = { ...(oldPkg.scripts || {}), ...(newPkg.scripts || {}) };
          }
          const mergedResult = await fileService.writeFile(projectId, 'package.json', JSON.stringify(merged, null, 2));
          if (mergedResult.success) {
            return { success: true, content: `package.json merged successfully (preserved template deps, added new ones)` };
          }
        }
      } catch {
        // Fall through to normal write
      }
    }

    const result = await fileService.writeFile(projectId, file_path, content);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Notify agent of file change for hot reload
    if (session?.agentUrl) {
      await fileService.notifyAgent(session.agentUrl, file_path, content);
    }

    // Static analysis: scan JSX/TSX/Vue/HTML files for dead interactive elements.
    // Warnings are returned to the AI inline so it can fix them in the same turn.
    let warnings = '';
    if (/\.[tj]sx?$|\.vue$|\.html?$|\.astro$/.test(normalized)) {
      const issues: string[] = [];
      // Empty onClick handlers
      if (/onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/.test(content)) {
        issues.push('Empty onClick handler: onClick={() => {}} — add a real action or remove the button');
      }
      // onClick with only console.log
      if (/onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*console\.log/.test(content)) {
        issues.push('onClick only calls console.log — replace with a real action (state change, navigation, toast)');
      }
      // onClick={() => null/undefined}
      if (/onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*(null|undefined)\s*\}/.test(content)) {
        issues.push('onClick returns null/undefined — add a real action or remove the button');
      }
      // href="#" or href=""
      if (/href\s*=\s*["'](#|)\s*["']/.test(content)) {
        issues.push('Link has href="#" or href="" — use a real route path');
      }
      // <button> without onClick/@click/onclick (but not type="submit" or disabled)
      const buttonMatches = content.match(/<button[^>]*>/gi) || [];
      for (const btn of buttonMatches) {
        if (!btn.includes('onClick') && !btn.includes('@click') && !btn.includes('onclick')
            && !btn.includes('type="submit"') && !btn.includes('type=\'submit\'') && !btn.includes('disabled')) {
          issues.push('Found <button> without click handler — use SafeButton or add onClick/@click/onclick');
        }
      }
      // Vue: empty @click handler
      if (/@click\s*=\s*["']\s*["']/.test(content) || /@click\s*=\s*["']\(\)\s*=>?\s*\{\s*\}\s*["']/.test(content)) {
        issues.push('Empty @click handler in Vue template — add a real handler');
      }
      // Expo/RN: Pressable/TouchableOpacity without onPress
      if (/<(?:Pressable|TouchableOpacity)[^>]*>/.test(content) && !content.includes('onPress')) {
        issues.push('Found Pressable/TouchableOpacity without onPress — use SafePressable or add onPress');
      }
      // JSON.parse without fallback on localStorage/sessionStorage
      if (/JSON\.parse\(\s*(localStorage|sessionStorage)\.getItem\([^)]+\)\s*\)/.test(content)) {
        issues.push('JSON.parse(localStorage.getItem(...)) without fallback — add || \'[]\' or || \'null\' to prevent crash on empty key');
      }
      // HTML: onclick="" (empty)
      if (/onclick\s*=\s*["']\s*["']/.test(content)) {
        issues.push('Empty onclick="" attribute — add a real JavaScript function call');
      }

      if (issues.length > 0) {
        warnings = `\n\n⚠️ STATIC ANALYSIS WARNINGS (fix these now):\n${issues.map((w, i) => `${i + 1}. ${w}`).join('\n')}`;
      }
    }

    return {
      success: true,
      content: `File written successfully: ${file_path}\n${description || ''}${warnings}`,
    };
  }

  /**
   * Read a file from the project
   */
  private async readFile(
    projectId: string,
    input: { file_path: string }
  ): Promise<ToolResult> {
    const { file_path } = input;

    if (!file_path) {
      return { success: false, error: 'file_path is required' };
    }

    const result = await fileService.readFile(projectId, file_path);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const fileContent = result.data!;

    if (fileContent.isBinary) {
      return {
        success: true,
        content: `Binary file: ${file_path} (${(fileContent.size / 1024).toFixed(1)}KB)\n` +
                 `[Binary content not displayed]`,
      };
    }

    return {
      success: true,
      content: `File: ${file_path}\n\n${fileContent.content}`,
    };
  }

  /**
   * Edit a file by replacing a string
   */
  private async editFile(
    projectId: string,
    input: { file_path: string; old_string: string; new_string: string },
    session?: Session
  ): Promise<ToolResult> {
    const { file_path, old_string, new_string } = input;

    if (!file_path || old_string === undefined || new_string === undefined) {
      return {
        success: false,
        error: 'file_path, old_string, and new_string are required',
      };
    }

    // Read the file
    const readResult = await fileService.readFile(projectId, file_path);
    if (!readResult.success) {
      return { success: false, error: `Failed to read file: ${readResult.error}` };
    }

    const fileContent = readResult.data!;
    if (fileContent.isBinary) {
      return { success: false, error: 'Cannot edit binary files' };
    }

    // Check if old_string exists
    if (!fileContent.content.includes(old_string)) {
      return {
        success: false,
        error: `String not found in file. Make sure old_string matches exactly (including whitespace).`,
      };
    }

    // Replace the first occurrence only, using a function replacer to prevent
    // special replacement patterns ($1, $&, etc.) in new_string from being interpreted.
    const newContent = fileContent.content.replace(old_string, () => new_string);

    // Write back
    const writeResult = await fileService.writeFile(projectId, file_path, newContent);
    if (!writeResult.success) {
      return { success: false, error: `Failed to write file: ${writeResult.error}` };
    }

    // Notify agent
    if (session?.agentUrl) {
      await fileService.notifyAgent(session.agentUrl, file_path, newContent);
    }

    // Format diff for display - frontend expects lines with "- " and "+ " prefixes
    const formatDiffLines = (str: string, prefix: string) => {
      return str.split('\n').map(line => `${prefix} ${line}`).join('\n');
    };

    const removedLines = formatDiffLines(old_string, '-');
    const addedLines = formatDiffLines(new_string, '+');

    // Extract just the filename for the header
    const fileName = file_path.split('/').pop() || file_path;

    return {
      success: true,
      content: `Edit ${fileName}\n└─ File modified\n\n${removedLines}\n${addedLines}`,
    };
  }

  /**
   * List files in a directory
   */
  private async listDirectory(
    projectId: string,
    input: { path?: string; recursive?: boolean }
  ): Promise<ToolResult> {
    const { path: dirPath = '', recursive = false } = input;

    if (recursive) {
      // List all files recursively
      const result = await fileService.listAllFiles(projectId);
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const files = result.data || [];
      const formatted = files.map(f => f.path).join('\n');
      return {
        success: true,
        content: `Found ${files.length} file(s):\n\n${formatted}`,
      };
    } else {
      // List directory contents
      const result = await fileService.listFiles(projectId, dirPath);
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const entries = result.data || [];
      const formatted = entries
        .map(e => `${e.isDirectory ? '[DIR] ' : '[FILE]'} ${e.path}`)
        .join('\n');

      return {
        success: true,
        content: `Contents of ${dirPath || '/' }:\n\n${formatted}`,
      };
    }
  }

  /**
   * Execute a command in the container
   */
  private async runCommand(
    projectId: string,
    input: { command: string; timeout?: number; background?: boolean },
    session?: Session
  ): Promise<ToolResult> {
    const { command, timeout = 60000, background = false } = input;

    if (!command) {
      return { success: false, error: 'command is required' };
    }

    // Check command against security blocklist
    const blocked = isCommandDangerous(command);
    if (blocked) {
      return { success: false, error: blocked };
    }

    // Auto-redirect: npm/bun install of expo-* packages → npx expo install
    // npm install grabs the LATEST version which may be incompatible with the SDK.
    // npx expo install auto-resolves the correct compatible version.
    let effectiveCommand = command;
    const expoInstallMatch = command.match(/(?:npm\s+install|bun\s+(?:add|install))\s+((?:expo-[\w-]+\s*)+)/);
    if (expoInstallMatch) {
      const packages = expoInstallMatch[1].trim();
      effectiveCommand = `npx expo install ${packages}`;
      log.info(`[AgentTools] Redirected expo package install to: ${effectiveCommand}`);
    }

    // Agent loop should always pass a user-scoped session to avoid cross-user container access.
    if (!session) {
      return {
        success: false,
        error: 'No active session found. Container may not be running.',
      };
    }

    // Background execution — launch and return immediately
    if (background) {
      const id = `bg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const entry: BackgroundCommand = {
        startedAt: Date.now(),
        command: effectiveCommand,
        status: 'running',
      };
      backgroundCommands.set(id, entry);

      // Fire and forget — save result when done
      dockerService.exec(session.agentUrl, effectiveCommand, '/home/coder/project', Math.min(timeout, 300000))
        .then(result => {
          entry.status = 'completed';
          entry.result = result;
        })
        .catch(err => {
          entry.status = 'completed';
          entry.result = { exitCode: 1, stdout: '', stderr: err.message };
        });

      return {
        success: true,
        content: `Background command started. ID: ${id}\nCommand: ${effectiveCommand}\nUse command_output with this ID to check results.`,
      };
    }

    try {
      const result = await dockerService.exec(
        session.agentUrl,
        effectiveCommand,
        '/home/coder/project',
        timeout
      );

      const output = [
        `Command: ${effectiveCommand}`,
        `Exit code: ${result.exitCode}`,
      ];

      if (result.stdout) {
        output.push(`\nStdout:\n${truncateOutput(result.stdout)}`);
      }

      if (result.stderr) {
        output.push(`\nStderr:\n${truncateOutput(result.stderr)}`);
      }

      return {
        success: result.exitCode === 0,
        content: output.join('\n'),
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Command execution failed: ${error.message}`,
      };
    }
  }

  /**
   * Get output from a background command
   */
  private getCommandOutput(input: { command_id: string }): ToolResult {
    const { command_id } = input;
    if (!command_id) {
      return { success: false, error: 'command_id is required' };
    }

    const entry = backgroundCommands.get(command_id);
    if (!entry) {
      return { success: false, error: `No background command found with ID: ${command_id}` };
    }

    if (entry.status === 'running') {
      const elapsed = Math.round((Date.now() - entry.startedAt) / 1000);
      return {
        success: true,
        content: `Command still running (${elapsed}s elapsed).\nCommand: ${entry.command}\nCheck back later.`,
      };
    }

    // Completed — return result and clean up
    const result = entry.result!;
    backgroundCommands.delete(command_id);

    const output = [
      `Command: ${entry.command}`,
      `Exit code: ${result.exitCode}`,
      `Duration: ${Math.round((Date.now() - entry.startedAt) / 1000)}s`,
    ];

    if (result.stdout) {
      output.push(`\nStdout:\n${truncateOutput(result.stdout)}`);
    }
    if (result.stderr) {
      output.push(`\nStderr:\n${truncateOutput(result.stderr)}`);
    }

    return {
      success: result.exitCode === 0,
      content: output.join('\n'),
    };
  }

  /**
   * Search files by glob pattern
   */
  private async globSearchTool(
    projectId: string,
    input: { pattern: string; path?: string }
  ): Promise<ToolResult> {
    const { pattern, path: searchPath } = input;

    if (!pattern) {
      return { success: false, error: 'pattern is required' };
    }

    const result = await globSearch(projectId, pattern, searchPath);

    return {
      success: true,
      content: result,
    };
  }

  /**
   * Search files by text pattern
   */
  private async grepSearchTool(
    projectId: string,
    input: { pattern: string; path?: string; include?: string }
  ): Promise<ToolResult> {
    const { pattern, path: searchPath, include } = input;

    if (!pattern) {
      return { success: false, error: 'pattern is required' };
    }

    const result = await grepSearch(projectId, pattern, searchPath, include);

    return {
      success: true,
      content: result,
    };
  }

  /**
   * Perform web search
   */
  private async webSearchTool(input: { query: string }): Promise<ToolResult> {
    const { query } = input;

    if (!query) {
      return { success: false, error: 'query is required' };
    }

    const result = await webSearch(query);

    return {
      success: true,
      content: result,
    };
  }

  /**
   * Update todo list
   */
  private async todoWriteTool(
    projectId: string,
    input: { todos: any[] }
  ): Promise<ToolResult> {
    const { todos } = input;

    if (!Array.isArray(todos)) {
      return { success: false, error: 'todos must be an array' };
    }

    const result = writeTodos(projectId, todos);

    return {
      success: true,
      content: result,
      todos,
    };
  }

  /**
   * Ask user a question (handled by loop)
   */
  private askUserQuestion(input: { questions: string[] }): ToolResult {
    const { questions } = input;

    if (!Array.isArray(questions) || questions.length === 0) {
      return { success: false, error: 'questions must be a non-empty array' };
    }

    // This is a special signal that the loop will handle
    return {
      success: true,
      content: 'User questions prepared',
      questions,
      _pauseForUser: true, // Signal to loop
    };
  }

  /**
   * Apply multiple edits to a single file atomically
   */
  private async multiEditFile(
    projectId: string,
    input: { file_path: string; edits: Array<{ old_string: string; new_string: string }> },
    session?: Session
  ): Promise<ToolResult> {
    const { file_path, edits } = input;

    if (!file_path || !Array.isArray(edits) || edits.length === 0) {
      return { success: false, error: 'file_path and non-empty edits array are required' };
    }

    // Read the file once
    const readResult = await fileService.readFile(projectId, file_path);
    if (!readResult.success) {
      return { success: false, error: `Failed to read file: ${readResult.error}` };
    }

    const fileContent = readResult.data!;
    if (fileContent.isBinary) {
      return { success: false, error: 'Cannot edit binary files' };
    }

    // Apply edits sequentially on a copy (atomic: all or nothing)
    let content = fileContent.content;
    const diffs: string[] = [];

    for (let i = 0; i < edits.length; i++) {
      const { old_string, new_string } = edits[i];

      if (!content.includes(old_string)) {
        return {
          success: false,
          error: `Edit ${i + 1}/${edits.length} failed: old_string not found in file. No edits were applied.`,
        };
      }

      // Apply edit using function replacer to prevent $1 etc.
      content = content.replace(old_string, () => new_string);

      // Collect diff for display
      const removedLines = old_string.split('\n').map(line => `- ${line}`).join('\n');
      const addedLines = new_string.split('\n').map(line => `+ ${line}`).join('\n');
      diffs.push(`Edit ${i + 1}:\n${removedLines}\n${addedLines}`);
    }

    // All edits passed — write the result
    const writeResult = await fileService.writeFile(projectId, file_path, content);
    if (!writeResult.success) {
      return { success: false, error: `Failed to write file: ${writeResult.error}` };
    }

    // Notify agent for hot reload
    if (session?.agentUrl) {
      await fileService.notifyAgent(session.agentUrl, file_path, content);
    }

    const fileName = file_path.split('/').pop() || file_path;

    return {
      success: true,
      content: `Multi-edit ${fileName}\n└─ ${edits.length} edits applied\n\n${diffs.join('\n\n')}`,
    };
  }

  /**
   * Apply a unified diff patch to a file
   */
  private async patchFile(
    projectId: string,
    input: { file_path: string; patch: string },
    session?: Session
  ): Promise<ToolResult> {
    const { file_path, patch } = input;

    if (!file_path || !patch) {
      return { success: false, error: 'file_path and patch are required' };
    }

    const readResult = await fileService.readFile(projectId, file_path);
    if (!readResult.success) {
      return { success: false, error: `Failed to read file: ${readResult.error}` };
    }

    const fileContent = readResult.data!;
    if (fileContent.isBinary) {
      return { success: false, error: 'Cannot patch binary files' };
    }

    const { applyPatch } = await import('diff');
    const result = applyPatch(fileContent.content, patch);

    if (result === false) {
      return { success: false, error: 'Patch could not be applied — content mismatch. Verify the patch context lines match the file.' };
    }

    const writeResult = await fileService.writeFile(projectId, file_path, result);
    if (!writeResult.success) {
      return { success: false, error: `Failed to write file: ${writeResult.error}` };
    }

    if (session?.agentUrl) {
      await fileService.notifyAgent(session.agentUrl, file_path, result);
    }

    const fileName = file_path.split('/').pop() || file_path;
    return {
      success: true,
      content: `Patch ${fileName}\n└─ Applied successfully\n\n${patch}`,
    };
  }

  /**
   * Signal task completion (handled by loop)
   */
  private signalCompletion(input: { result: string }): ToolResult {
    const { result } = input;

    if (!result) {
      return { success: false, error: 'result is required' };
    }

    // This is a special signal that the loop will handle
    return {
      success: true,
      content: result,
      _completion: true, // Signal to loop
    };
  }
}

export const agentToolsService = new AgentToolsService();
