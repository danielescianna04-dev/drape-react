import { ToolDefinition } from '../services/ai-provider.service';

/**
 * All tool definitions in OpenAI-compatible format
 * These tools enable the agent to interact with the filesystem, run commands, and more
 */
export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'write_file',
    description: 'Write content to a file at the specified path. Creates parent directories if needed. Use this to create new files or overwrite existing ones.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The path to the file to write (relative to project root)',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file',
        },
        description: {
          type: 'string',
          description: 'Brief description of what this file is for or what changes are being made',
        },
      },
      required: ['file_path', 'content', 'description'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file at the specified path. Returns the file content as a string.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The path to the file to read (relative to project root)',
        },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'edit_file',
    description: 'Replace a specific string in a file with new content. The old_string must match exactly (including whitespace). For multiple replacements, call this tool multiple times.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The path to the file to edit (relative to project root)',
        },
        old_string: {
          type: 'string',
          description: 'The exact string to find and replace (must match exactly)',
        },
        new_string: {
          type: 'string',
          description: 'The new string to replace with',
        },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and directories in the specified path. Returns a list of entries with their names and types.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The directory path to list (relative to project root, defaults to root)',
          default: '',
        },
        recursive: {
          type: 'boolean',
          description: 'If true, list all files recursively. Use with caution on large directories.',
          default: false,
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'run_command',
    description: 'Execute a shell command in the project container. Returns stdout, stderr, and exit code. Use this to run tests, build scripts, install dependencies, etc. Set background: true for long-running commands.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 60000)',
          default: 60000,
        },
        background: {
          type: 'boolean',
          description: 'Run in background. Returns immediately with a command ID. Use command_output to check results later.',
          default: false,
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'glob_search',
    description: 'Search for files matching a glob pattern (e.g., "**/*.ts", "src/**/*.tsx"). Fast for finding files by name or extension.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern to match (e.g., "**/*.ts", "src/**/*.json")',
        },
        path: {
          type: 'string',
          description: 'Base path to search from (relative to project root, defaults to root)',
          default: '',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'grep_search',
    description: 'Search for text patterns in files using grep. Returns file paths, line numbers, and matching content. Use this to find code patterns, function calls, etc.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Text pattern to search for (supports regex)',
        },
        path: {
          type: 'string',
          description: 'Base path to search from (relative to project root, defaults to root)',
          default: '',
        },
        include: {
          type: 'string',
          description: 'File pattern to include (e.g., "*.ts" to search only TypeScript files)',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for information. Use this when you need to look up documentation, error messages, or current information not in your training data.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'todo_write',
    description: 'Update the task list for tracking progress. Use this to show the user what you are working on. Each todo has content (imperative form), status, and activeForm (present continuous).',
    input_schema: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'Array of todo items',
          items: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'Task description in imperative form (e.g., "Run tests")',
              },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed'],
                description: 'Current status of the task',
              },
              activeForm: {
                type: 'string',
                description: 'Task description in present continuous form (e.g., "Running tests")',
              },
            },
            required: ['content', 'status', 'activeForm'],
          },
        },
      },
      required: ['todos'],
    },
  },
  {
    name: 'ask_user_question',
    description: 'Ask the user one or more questions when you need clarification or input. The agent will pause and wait for the user to respond.',
    input_schema: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          description: 'Array of questions to ask the user',
          items: {
            type: 'string',
          },
        },
      },
      required: ['questions'],
    },
  },
  {
    name: 'signal_completion',
    description: 'Signal that the task is complete and provide a final summary. Use this when you have finished all requested work.',
    input_schema: {
      type: 'object',
      properties: {
        result: {
          type: 'string',
          description: 'Summary of what was accomplished',
        },
      },
      required: ['result'],
    },
  },
  {
    name: 'multi_edit_file',
    description: 'Apply multiple edits to a single file atomically. All edits succeed or none are applied. Use instead of multiple edit_file calls when making 2+ changes to the same file.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file (relative to project root)',
        },
        edits: {
          type: 'array',
          description: 'Array of edits to apply sequentially',
          items: {
            type: 'object',
            properties: {
              old_string: {
                type: 'string',
                description: 'Exact string to find and replace',
              },
              new_string: {
                type: 'string',
                description: 'Replacement string',
              },
            },
            required: ['old_string', 'new_string'],
          },
        },
      },
      required: ['file_path', 'edits'],
    },
  },
  {
    name: 'web_fetch',
    description: 'Fetch a URL and extract specific information using AI analysis. Returns analyzed content, not raw HTML.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Full HTTP/HTTPS URL to fetch',
        },
        prompt: {
          type: 'string',
          description: 'What specific information to extract from the page',
        },
      },
      required: ['url', 'prompt'],
    },
  },
  {
    name: 'todo_read',
    description: 'Read the current todo list to check task status and progress.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'dispatch_agent',
    description: 'Dispatch a sub-agent for independent tasks with isolated context. Use "explore" (fast model, read-only tools) for broad codebase search when 3+ queries are needed. Use "general" (same model, all tools except dispatch_agent) for complex independent subtasks. Do NOT use for simple searches where 1 grep/glob suffices.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['explore', 'general'],
          description: '"explore" for codebase search, "general" for complex subtasks',
        },
        prompt: {
          type: 'string',
          description: 'Detailed task description for the sub-agent',
        },
      },
      required: ['type', 'prompt'],
    },
  },
  {
    name: 'patch_file',
    description: 'Apply a unified diff patch to a file. Use for complex multi-part changes that would require many edit_file calls. The patch must be in unified diff format (lines starting with -, +, or space for context).',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to file relative to project root',
        },
        patch: {
          type: 'string',
          description: 'Unified diff patch content',
        },
      },
      required: ['file_path', 'patch'],
    },
  },
  {
    name: 'load_skill',
    description: 'Load a reusable skill/workflow by name. Skills are defined in .drape/skills/, .agents/skills/, or .claude/skills/ as markdown files. Call without a name to list available skills.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Skill name to load (e.g. "deploy", "test", "review"). Omit to list all available.',
        },
      },
      required: [],
    },
  },
  {
    name: 'tool_search',
    description: 'Search for additional tools from MCP servers. Use when you need a capability not available in your current tools (e.g., database access, GitHub operations, external APIs).',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What capability you need (e.g. "github pull request", "database query")',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_read',
    description: 'Read the persistent project memory. Contains learnings, patterns, and notes from previous conversations that persist across sessions.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'memory_write',
    description: 'Write or update the persistent project memory. Use to save important project patterns, conventions, debugging insights, or user preferences that should persist across all conversations.',
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Full markdown content for memory. Organize with headers (## Architecture, ## Conventions, etc.). Overwrites existing memory.',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'command_output',
    description: 'Get output from a background command started with run_command background: true. Returns the current output or final result.',
    input_schema: {
      type: 'object',
      properties: {
        command_id: {
          type: 'string',
          description: 'The command ID returned by a background run_command',
        },
      },
      required: ['command_id'],
    },
  },
];

/**
 * Get all tool definitions for the agent
 */
export function getToolDefinitions(): ToolDefinition[] {
  return AGENT_TOOLS;
}

/**
 * Get a specific tool definition by name
 */
export function getToolByName(name: string): ToolDefinition | undefined {
  return AGENT_TOOLS.find(t => t.name === name);
}
