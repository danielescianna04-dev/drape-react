import { fileService } from './file.service';
import { dockerService } from './docker.service';
import { sessionService } from './session.service';
import { globSearch } from '../tools/glob';
import { grepSearch } from '../tools/grep';
import { webSearch } from '../tools/web-search';
import { writeTodos } from '../tools/todo-write';
import { log } from '../utils/logger';
import { Session, ToolResult } from '../types';
import path from 'path';

/**
 * Blocklist of dangerous command patterns to prevent abuse
 */
const DANGEROUS_PATTERNS = [
  /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\/(?!home\/coder\/project)/,  // rm outside project
  /curl\s.*\|\s*(sh|bash)/,       // curl pipe to shell
  /wget\s.*\|\s*(sh|bash)/,       // wget pipe to shell
  />\s*\/etc\//,                    // writing to /etc
  /curl\s+.*-d\s+.*\$\(/,         // curl with command substitution
  /169\.254\.169\.254/,            // AWS metadata endpoint
  /\/proc\/|\/sys\//,             // system pseudo-filesystems
];

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

        default:
          return {
            success: false,
            error: `Unknown tool: ${toolName}`,
          };
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
  private async writeFile(
    projectId: string,
    input: { file_path: string; content: string; description: string },
    session?: Session
  ): Promise<ToolResult> {
    const { file_path, content, description } = input;

    if (!file_path || content === undefined) {
      return { success: false, error: 'file_path and content are required' };
    }

    const result = await fileService.writeFile(projectId, file_path, content);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Notify agent of file change for hot reload
    if (session?.agentUrl) {
      await fileService.notifyAgent(session.agentUrl, file_path, content);
    }

    return {
      success: true,
      content: `File written successfully: ${file_path}\n${description || ''}`,
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
    input: { command: string; timeout?: number },
    session?: Session
  ): Promise<ToolResult> {
    const { command, timeout = 60000 } = input;

    if (!command) {
      return { success: false, error: 'command is required' };
    }

    // Check command against security blocklist
    const blocked = isCommandDangerous(command);
    if (blocked) {
      return { success: false, error: blocked };
    }

    // Get session if not provided
    if (!session) {
      const fetchedSession = await sessionService.getByProjectId(projectId);
      if (!fetchedSession) {
        return {
          success: false,
          error: 'No active session found. Container may not be running.',
        };
      }
      session = fetchedSession;
    }

    try {
      const result = await dockerService.exec(
        session.agentUrl,
        command,
        '/home/coder/project',
        timeout
      );

      const output = [
        `Command: ${command}`,
        `Exit code: ${result.exitCode}`,
      ];

      if (result.stdout) {
        output.push(`\nStdout:\n${result.stdout}`);
      }

      if (result.stderr) {
        output.push(`\nStderr:\n${result.stderr}`);
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
