import { TerminalItemType } from '../../shared/types';
import type { ChatEngineMessage } from '../../hooks/engine/useChatEngine';

export const getToolStartMessage = (tool: string, input: any): string => {
  let parsedInput: any = {};
  try {
    parsedInput = typeof input === 'string' ? JSON.parse(input) : (input || {});
  } catch {
    parsedInput = input || {};
  }

  const getFileName = (payload: any) => {
    const path = payload?.path || payload?.filePath || payload?.file_path || '';
    return path ? path.split('/').pop() || path : '';
  };

  const toolMessages: Record<string, (payload: any) => string> = {
    read_file: (payload) => { const file = getFileName(payload); return file ? `Read ${file}\n└─ Reading...` : 'Read file\n└─ Reading...'; },
    write_file: (payload) => { const file = getFileName(payload); return file ? `Write ${file}\n└─ Writing...` : 'Write file\n└─ Writing...'; },
    edit_file: (payload) => { const file = getFileName(payload); return file ? `Edit ${file}\n└─ Applying edit...` : 'Edit file\n└─ Applying edit...'; },
    list_directory: (payload) => `List files in ${payload?.path || payload?.directory || '.'}\n└─ Loading...`,
    list_files: (payload) => `List files in ${payload?.path || payload?.directory || '.'}\n└─ Loading...`,
    search_in_files: (payload) => { const pattern = payload?.pattern || payload?.query; return pattern ? `Search "${pattern}"\n└─ Searching...` : 'Search\n└─ Searching...'; },
    grep_search: (payload) => { const pattern = payload?.pattern || payload?.query; return pattern ? `Search "${pattern}"\n└─ Searching...` : 'Search\n└─ Searching...'; },
    glob_files: (payload) => { const pattern = payload?.pattern; return pattern ? `Glob pattern: ${pattern}\n└─ Searching...` : 'Glob\n└─ Searching...'; },
    glob_search: (payload) => { const pattern = payload?.pattern; return pattern ? `Glob pattern: ${pattern}\n└─ Searching...` : 'Glob\n└─ Searching...'; },
    run_command: (payload) => { const command = payload?.command; return command ? `Run command\n└─ ${command.substring(0, 50)}...` : 'Run command\n└─ Executing...'; },
    execute_command: (payload) => { const command = payload?.command; return command ? `Run command\n└─ ${command.substring(0, 50)}...` : 'Run command\n└─ Executing...'; },
    web_search: (payload) => { const query = payload?.query; return query ? `Web search\n└─ "${query}"...` : 'Web search\n└─ Searching...'; },
    web_fetch: () => 'Fetch URL\n└─ Loading...',
    multi_edit_file: (payload) => {
      const file = getFileName(payload);
      const editCount = payload?.edits?.length || '?';
      return file ? `Multi-edit ${file}\n└─ Applying ${editCount} edits...` : `Multi-edit file\n└─ Applying ${editCount} edits...`;
    },
    patch_file: (payload) => { const file = getFileName(payload); return file ? `Patch ${file}\n└─ Applying diff...` : 'Patch file\n└─ Applying diff...'; },
    load_skill: (payload) => { const name = payload?.name; return name ? `Load skill: ${name}\n└─ Loading...` : 'List skills\n└─ Discovering...'; },
    tool_search: (payload) => { const query = payload?.query; return query ? `Tool search\n└─ "${query}"...` : 'Tool search\n└─ Searching...'; },
    command_output: (payload) => `Check command\n└─ ${payload?.command_id || '?'}`,
    memory_read: () => 'Read memory\n└─ Loading project memory...',
    memory_write: () => 'Save memory\n└─ Updating project memory...',
    dispatch_agent: (payload) => {
      const agentType = payload?.type || 'agent';
      const prompt = payload?.prompt?.substring(0, 60) || 'Processing...';
      return `Agent: ${agentType}\n└─ ${prompt}`;
    },
    ask_user_question: (payload) => {
      const questions = payload?.questions;
      if (Array.isArray(questions) && questions.length > 0) {
        const questionText = questions.map((question: any) => question?.question || question).join('\n   ');
        return `User Question\n└─ ${questionText}`;
      }
      return 'User Question\n└─ Waiting for response...';
    },
    todo_write: () => 'Todo List\n└─ Updating...',
    todo_read: () => 'Todo List\n└─ Reading...',
    sub_agent: (payload) => {
      const prompt = payload?.prompt?.substring(0, 60) || 'Processing...';
      return `Agent: sub-agent\n└─ ${prompt}`;
    },
    user_question: (payload) => {
      const question = payload?.question || payload?.text || '';
      return question ? `User Question\n└─ ${question}` : 'User Question\n└─ Waiting for response...';
    },
    diagnostics: (payload) => { const file = getFileName(payload); return file ? `Diagnostics ${file}\n└─ Checking...` : 'Diagnostics\n└─ Checking...'; },
    code_search: (payload) => { const query = payload?.query || payload?.pattern || ''; return query ? `Search "${query}"\n└─ Searching code...` : 'Search code\n└─ Searching...'; },
    skill: (payload) => { const name = payload?.name || payload?.path || ''; return name ? `Skill: ${name}\n└─ Loading...` : 'Skill\n└─ Loading...'; },
    lsp: (payload) => { const action = payload?.action || ''; return action ? `LSP: ${action}\n└─ Processing...` : 'LSP\n└─ Processing...'; },
  };

  const getMessage = toolMessages[tool];
  if (!getMessage) return `${tool}\n└─ Running...`;

  try {
    return getMessage(parsedInput);
  } catch {
    return `${tool}\n└─ Running...`;
  }
};

export const formatToolResult = (tool: string, toolInput: any, rawResult: any): string => {
  let result = '';
  let hasError = false;
  let errorMessage = '';

  try {
    if (rawResult !== null && rawResult !== undefined) {
      if (typeof rawResult === 'object' && rawResult.success === false) {
        hasError = true;
        errorMessage = rawResult.error || 'Unknown error';
      } else if (typeof rawResult === 'object' && rawResult.content) {
        result = typeof rawResult.content === 'string' ? rawResult.content : JSON.stringify(rawResult.content);
      } else if (typeof rawResult === 'object' && rawResult.message) {
        result = rawResult.message;
      } else {
        result = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);
      }
    }
  } catch {
    result = '';
  }

  let input: any = {};
  try {
    if (toolInput) {
      input = typeof toolInput === 'string' ? JSON.parse(toolInput) : toolInput;
    }
  } catch {
    input = {};
  }

  const getFileName = (payload: any) => {
    const filePath = payload?.file_path || payload?.path || payload?.filePath || '';
    return filePath ? filePath.split('/').pop() || filePath : '';
  };

  if (tool === 'read_file') {
    const file = getFileName(input);
    const lines = result ? result.split('\n').length : 0;
    return `Read ${file || 'file'}\n└─ ${lines} line${lines !== 1 ? 's' : ''}\n\n${result}`;
  }
  if (tool === 'write_file') {
    const file = getFileName(input);
    if (hasError) return `Write ${file || 'file'}\n└─ Error: ${errorMessage}`;
    return `Write ${file || 'file'}\n└─ File created`;
  }
  if (tool === 'edit_file') {
    const file = getFileName(input);
    if (hasError) return `Edit ${file || 'file'}\n└─ Error: ${errorMessage}`;
    return `Edit ${file || 'file'}\n└─ File modified${result ? `\n\n${result}` : ''}`;
  }
  if (tool === 'glob_files' || tool === 'glob_search') {
    const pattern = input?.pattern || 'files';
    const fileCount = result ? result.split('\n').filter((line: string) => line.trim()).length : 0;
    return `Glob pattern: ${pattern}\n└─ Found ${fileCount} file(s)\n\n${result}`;
  }
  if (tool === 'list_directory' || tool === 'list_files') {
    const directory = input?.directory || input?.dirPath || input?.path || '.';
    const fileCount = result ? result.split('\n').filter((line: string) => line.trim()).length : 0;
    return `List files in ${directory}\n└─ ${fileCount} file${fileCount !== 1 ? 's' : ''}\n\n${result}`;
  }
  if (tool === 'search_in_files' || tool === 'grep_search') {
    const pattern = input?.pattern || input?.query || 'pattern';
    const matches = result ? result.split('\n').filter((line: string) => line.includes(':')).length : 0;
    return `Search "${pattern}"\n└─ ${matches} match${matches !== 1 ? 'es' : ''}\n\n${result}`;
  }
  if (tool === 'run_command' || tool === 'execute_command') {
    const command = input?.command || 'command';
    if (command.startsWith('curl')) {
      const urlMatch = command.match(/curl\s+(?:-[sS]\s+)?(?:['"])?([^\s'"]+)/);
      const url = urlMatch ? urlMatch[1] : command.substring(5).trim();
      let exitCode = 0;
      let stdout = '';
      let stderr = '';
      try {
        if (typeof rawResult === 'object' && rawResult !== null) {
          exitCode = rawResult.exitCode || 0;
          stdout = rawResult.stdout || '';
          stderr = rawResult.stderr || '';
        } else if (typeof result === 'string' && result.includes('exitCode')) {
          const parsed = JSON.parse(result);
          exitCode = parsed.exitCode || 0;
          stdout = parsed.stdout || '';
          stderr = parsed.stderr || '';
        }
      } catch {
        stdout = result || '';
      }
      const curlHasError = exitCode !== 0 || !!stderr;
      const status = curlHasError ? `Error (exit ${exitCode})` : 'Completed';
      let output = '';
      if (stdout && stdout.trim()) output = `\n\n${stdout}`;
      if (stderr && stderr.trim()) output += `\n\nError: ${stderr}`;
      return `Execute: curl ${url}\n└─ ${status}${output}`;
    }
    let actualOutput = result;
    if (typeof rawResult === 'object' && rawResult !== null && rawResult.stdout) {
      actualOutput = rawResult.stdout;
    }
    const resultLines = (actualOutput || '').split('\n');
    const maxOutputLines = 50;
    let truncatedResult = actualOutput;
    if (resultLines.length > maxOutputLines) {
      truncatedResult = resultLines.slice(0, maxOutputLines).join('\n') +
        `\n\n... (${resultLines.length - maxOutputLines} more lines - expand to see all)`;
    }
    return `Execute: ${command}\n└─ Command completed\n\n${truncatedResult}`;
  }
  if (tool === 'multi_edit_file') {
    const file = getFileName(input);
    const editCount = input?.edits?.length || '?';
    if (hasError) return `Multi-edit ${file || 'file'}\n└─ Error: ${errorMessage}`;
    const diffStart = result.indexOf('\n\n');
    const diffContent = diffStart >= 0 ? result.substring(diffStart + 2) : '';
    return `Multi-edit ${file || 'file'}\n└─ ${editCount} edits applied${diffContent ? `\n\n${diffContent}` : ''}`;
  }
  if (tool === 'dispatch_agent') {
    const agentType = input?.type || 'agent';
    const description = input?.prompt?.substring(0, 80) || 'Task';
    if (hasError) return `Agent: ${agentType}\n└─ Error: ${errorMessage}\n\n${description}`;
    return `Agent: ${agentType}\n└─ Completed\n\n${description}${result ? `\n\n${result.substring(0, 1000)}` : ''}`;
  }
  if (tool === 'patch_file') {
    const file = getFileName(input);
    if (hasError) return `Patch ${file || 'file'}\n└─ Error: ${errorMessage}`;
    return `Patch ${file || 'file'}\n└─ Applied`;
  }
  if (tool === 'create_folder') {
    return `Create folder: ${input?.folderPath || 'folder'}\n└─ Completed\n\n${result}`;
  }
  if (tool === 'delete_file') {
    return `Delete: ${input?.filePath || 'file'}\n└─ Completed\n\n${result}`;
  }
  if (tool === 'move_file') {
    return `Move: ${input?.sourcePath || 'source'} → ${input?.destPath || 'destination'}\n└─ Completed\n\n${result}`;
  }
  if (tool === 'copy_file') {
    return `Copy: ${input?.sourcePath || 'source'} → ${input?.destPath || 'destination'}\n└─ Completed\n\n${result}`;
  }
  if (tool === 'think') {
    return `💭 ${result}`;
  }
  if (tool === 'load_skill') {
    const skillName = input?.name || 'skills';
    if (hasError) return `Skill ${skillName}\n└─ ${errorMessage}`;
    return `Skill: ${skillName}\n└─ Loaded\n\n${result.substring(0, 1500)}${result.length > 1500 ? '...' : ''}`;
  }
  if (tool === 'tool_search') return `Tool search\n└─ ${result.substring(0, 1000)}`;
  if (tool === 'command_output') {
    const commandId = input?.command_id || '?';
    if (hasError) return `Check command ${commandId}\n└─ Error: ${errorMessage}`;
    return `Check command ${commandId}\n└─ ${result.includes('still running') ? 'Still running...' : 'Completed'}\n\n${result.substring(0, 2000)}`;
  }
  if (tool === 'memory_read') {
    if (!result || result.includes('No memory saved')) return 'Read memory\n└─ No memory saved yet';
    return `Read memory\n└─ Loaded\n\n${result.substring(0, 1500)}${result.length > 1500 ? '...' : ''}`;
  }
  if (tool === 'memory_write') {
    if (hasError) return `Save memory\n└─ Error: ${errorMessage}`;
    return 'Save memory\n└─ Updated';
  }
  if (tool === 'web_fetch') {
    const url = input?.url || 'URL';
    const urlShort = url.length > 50 ? `${url.substring(0, 50)}...` : url;
    return `Fetch: ${urlShort}\n└─ Completed\n\n${result.substring(0, 2000)}${result.length > 2000 ? '...' : ''}`;
  }
  if (tool === 'launch_sub_agent') {
    const agentType = input?.subagent_type || input?.type || 'agent';
    const description = input?.description || input?.prompt?.substring(0, 60) || 'Task';
    if (hasError) return `Agent: ${agentType}\n└─ Error: ${errorMessage}\n\n${description}`;
    let summary = '';
    try {
      if (typeof rawResult === 'object' && rawResult?.summary) summary = rawResult.summary;
      else if (typeof result === 'string' && result.length > 0 && result !== 'undefined') summary = result;
    } catch {
      summary = '';
    }
    return `Agent: ${agentType}\n└─ Completed\n\n${description}${summary ? `\n\n${summary}` : ''}`;
  }
  if (tool === 'todo_write') {
    let todos: any[] = [];
    try {
      todos = input?.todos || [];
    } catch {
      todos = [];
    }
    const totalTasks = todos.length;
    const completedTasks = todos.filter((todo: any) => todo.status === 'completed').length;
    const inProgressTasks = todos.filter((todo: any) => todo.status === 'in_progress').length;
    const todoLines = todos.map((todo: any) => `${todo.status || 'pending'}|${todo.content || ''}`).join('\n');
    return `Todo List\n└─ ${totalTasks} task${totalTasks !== 1 ? 's' : ''} (${completedTasks} done, ${inProgressTasks} in progress)\n\n${todoLines}`;
  }
  if (tool === 'web_search') {
    let searchResults: any[] = [];
    let query = '';
    let count = 0;
    try {
      if (typeof rawResult === 'object' && rawResult?.results) {
        searchResults = rawResult.results || [];
        query = rawResult.query || input?.query || 'query';
        count = rawResult.count || searchResults.length;
      }
    } catch {
      searchResults = [];
    }
    const searchLines = searchResults.map((entry: any) => `${entry.title || 'Untitled'}|${entry.url || ''}|${entry.snippet || ''}`).join('\n');
    return `Web Search "${query}"\n└─ ${count} result${count !== 1 ? 's' : ''} found\n\n${searchLines}`;
  }
  if (tool === 'ask_user_question') {
    let questions: any[] = [];
    let answers: any = {};
    try {
      if (input?.questions) questions = input.questions;
      if (typeof rawResult === 'object' && rawResult?.answers) answers = rawResult.answers;
    } catch {
      answers = {};
    }
    const qaLines = questions.map((question: any, index: number) => `${question.question || ''}|${answers[`q${index}`] || 'No answer'}`).join('\n');
    return `User Question\n└─ ${questions.length} question${questions.length !== 1 ? 's' : ''} answered\n\n${qaLines}`;
  }
  if (tool === 'sub_agent') {
    const description = input?.prompt?.substring(0, 80) || 'Task';
    if (hasError) return `Agent: sub-agent\n└─ Error: ${errorMessage}`;
    return `Agent: sub-agent\n└─ Completed\n\n${description}${result ? `\n\n${result.substring(0, 1000)}` : ''}`;
  }
  if (tool === 'todo_read') return `Todo List\n└─ Read\n\n${result}`;
  if (tool === 'user_question') {
    const question = input?.question || input?.text || '';
    return `User Question\n└─ Answered\n\n${question}`;
  }
  if (tool === 'diagnostics') {
    const file = getFileName(input);
    if (hasError) return `Diagnostics ${file || ''}\n└─ Error: ${errorMessage}`;
    const issueCount = result ? result.split('\n').filter((line: string) => line.trim()).length : 0;
    return `Diagnostics ${file || 'project'}\n└─ ${issueCount} issue${issueCount !== 1 ? 's' : ''}\n\n${result}`;
  }
  if (tool === 'code_search') {
    const query = input?.query || input?.pattern || 'code';
    const matches = result ? result.split('\n').filter((line: string) => line.trim()).length : 0;
    return `Search "${query}"\n└─ ${matches} result${matches !== 1 ? 's' : ''}\n\n${result}`;
  }
  if (tool === 'skill') {
    const name = input?.name || input?.path || 'skill';
    if (hasError) return `Skill: ${name}\n└─ Error: ${errorMessage}`;
    return `Skill: ${name}\n└─ Loaded`;
  }
  if (tool === 'lsp') {
    const action = input?.action || 'query';
    if (hasError) return `LSP: ${action}\n└─ Error: ${errorMessage}`;
    return `LSP: ${action}\n└─ Completed\n\n${result.substring(0, 1500)}`;
  }

  return `${tool}\n└─ Completed\n\n${result}`;
};

export const formatEngineMessage = (
  message: ChatEngineMessage,
  unknownErrorLabel: string,
) => {
  const costProps: any = {};
  if ((message as any).costEur) costProps.costEur = (message as any).costEur;
  if ((message as any).tokensUsed) costProps.tokensUsed = (message as any).tokensUsed;

  switch (message.type) {
    case 'thinking':
      return {
        content: message.content || '',
        type: TerminalItemType.OUTPUT,
        timestamp: message.timestamp,
        isThinking: message.isThinking,
        thinkingContent: message.thinkingContent || '',
      };
    case 'text':
      return {
        content: message.content || '',
        type: TerminalItemType.OUTPUT,
        timestamp: message.timestamp,
        isThinking: false,
        thinkingContent: '',
        ...costProps,
      };
    case 'tool_start':
      return {
        content: getToolStartMessage(message.tool!, message.toolInput),
        type: TerminalItemType.OUTPUT,
        timestamp: message.timestamp,
        isExecuting: true,
        toolInfo: {
          tool: message.tool!,
          input: message.toolInput,
          status: 'running' as const,
        },
      };
    case 'tool_complete':
      return {
        content: formatToolResult(message.tool!, message.toolInput, message.toolResult),
        type: TerminalItemType.OUTPUT,
        timestamp: message.timestamp,
        isExecuting: false,
        toolInfo: {
          tool: message.tool!,
          input: message.toolInput,
          output: message.toolResult,
          status: 'completed' as const,
        },
      };
    case 'tool_error':
      return {
        content: `${message.tool}\n└─ Error`,
        type: TerminalItemType.OUTPUT,
        timestamp: message.timestamp,
        isExecuting: false,
        toolInfo: {
          tool: message.tool!,
          input: message.toolInput,
          output: message.toolResult,
          status: 'error' as const,
        },
      };
    case 'error':
      return { content: message.content || unknownErrorLabel, type: TerminalItemType.ERROR, timestamp: message.timestamp };
    case 'context_compacted':
      return {
        content: message.isCompacting ? '__CONTEXT_COMPACTING__' : '__CONTEXT_COMPACTED__',
        type: TerminalItemType.OUTPUT,
        timestamp: message.timestamp,
      };
    case 'budget_exceeded':
      return { content: '__BUDGET_EXCEEDED__', type: TerminalItemType.OUTPUT, timestamp: message.timestamp };
    case 'completion':
      return {
        content: message.content || '',
        type: TerminalItemType.OUTPUT,
        timestamp: message.timestamp,
        isAgentMessage: true,
        isCompletion: true,
      };
    default:
      return { content: message.content || '', type: TerminalItemType.OUTPUT, timestamp: message.timestamp };
  }
};

export const isCommand = (text: string): boolean => {
  const commandPrefixes = ['ls', 'cd', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'echo', 'touch', 'grep', 'find', 'chmod', 'chown', 'ps', 'kill', 'top', 'df', 'du', 'tar', 'zip', 'unzip', 'wget', 'curl', 'git', 'npm', 'node', 'python', 'pip', 'java', 'gcc', 'make', 'docker', 'kubectl'];
  const firstWord = text.trim().split(' ')[0].toLowerCase();
  return commandPrefixes.includes(firstWord) || text.includes('&&') || text.includes('|') || text.includes('>');
};

export const isTerminalInput = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('./') || (trimmed.startsWith('/') && !trimmed.includes(' '))) return true;
  if (trimmed.includes('&&') || trimmed.includes(' | ') || trimmed.includes(' > ') || trimmed.includes(' >> ') || trimmed.includes(' ; ')) return true;

  const binaries = [
    'ls', 'cd', 'pwd', 'mkdir', 'rmdir', 'rm', 'cp', 'mv', 'cat', 'head', 'tail',
    'echo', 'touch', 'grep', 'egrep', 'find', 'chmod', 'chown', 'chgrp', 'ps', 'kill',
    'top', 'htop', 'df', 'du', 'tar', 'zip', 'unzip', 'gzip', 'gunzip',
    'wget', 'curl', 'ssh', 'scp', 'rsync', 'ping', 'nc', 'netstat',
    'git', 'npm', 'npx', 'yarn', 'pnpm', 'bun', 'deno',
    'node', 'python', 'python3', 'pip', 'pip3', 'ruby', 'php', 'go', 'cargo', 'rustc',
    'java', 'javac', 'gcc', 'g++', 'clang', 'make', 'cmake',
    'docker', 'docker-compose', 'kubectl', 'helm',
    'apt', 'apt-get', 'yum', 'brew', 'pacman',
    'which', 'whereis', 'whoami', 'hostname', 'uname', 'env', 'export', 'set', 'unset',
    'clear', 'history', 'man', 'date', 'cal', 'wc', 'sort', 'uniq', 'cut', 'awk', 'sed',
    'xargs', 'tee', 'diff', 'patch', 'file', 'stat', 'ln', 'readlink',
    'tree', 'less', 'more', 'vi', 'vim', 'nano',
    'systemctl', 'service', 'journalctl', 'crontab',
    'dir', 'type', 'printenv', 'source', 'bash', 'sh', 'zsh',
  ];

  const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
  return binaries.includes(firstWord);
};

export const estimateContextUsage = (
  terminalItems: Array<{ type: string; content?: string | null }>,
  selectedModel: string,
  engineContextUsagePercent: number,
) => {
  if (terminalItems.length === 0) return 0;

  let totalChars = 15000;
  for (const item of terminalItems) {
    const content = String(item.content ?? '');
    if (item.type === TerminalItemType.USER_MESSAGE || item.type === TerminalItemType.OUTPUT) {
      totalChars += content.length;
    }
  }

  const contextWindows: Record<string, number> = {
    'claude-sonnet-4': 200000,
    'claude-4-6-sonnet': 200000,
    'claude-4-6-opus': 200000,
    'claude-haiku-3.5': 200000,
    'gemini-3-flash': 1000000,
    'gemini-3.1-pro': 1000000,
    'gpt-5-4': 128000,
    'llama-3.3-70b': 128000,
  };

  const windowTokens = contextWindows[selectedModel] || 200000;
  const estimatedTokens = Math.ceil(totalChars / 3.5);
  const percent = Math.min(100, Math.round((estimatedTokens / windowTokens) * 100));

  return Math.max(percent, engineContextUsagePercent);
};
