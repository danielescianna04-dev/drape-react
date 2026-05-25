import {
  estimateContextUsage,
  formatEngineMessage,
  formatToolResult,
  getToolStartMessage,
  isCommand,
  isTerminalInput,
  formatFriendlyStatus,
} from '@/pages/Chat/chatToolFormatting';
import { TerminalItemType } from '@/shared/types';

describe('chatToolFormatting', () => {
  it('formats tool start messages with file names', () => {
    expect(getToolStartMessage('read_file', { path: '/tmp/demo.ts' })).toContain('Read tmp/demo.ts');
  });

  it('formats tool result summaries for file reads', () => {
    expect(formatToolResult('read_file', { path: '/tmp/demo.ts' }, 'line1\nline2')).toContain('2 lines');
  });

  it('maps engine text messages into terminal output items', () => {
    const item = formatEngineMessage({
      id: '1',
      type: 'text',
      content: 'hello world',
      timestamp: new Date(),
    } as any, 'Unknown error');

    expect(item.type).toBe(TerminalItemType.OUTPUT);
    expect(item.content).toBe('hello world');
  });

  it('detects shell-like input', () => {
    expect(isCommand('git status')).toBe(true);
    expect(isTerminalInput('npm run dev')).toBe(true);
    expect(isTerminalInput('help me refactor this')).toBe(false);
  });

  it('estimates context usage using model-specific windows', () => {
    const usage = estimateContextUsage([
      { type: TerminalItemType.USER_MESSAGE, content: 'a'.repeat(6000) },
      { type: TerminalItemType.OUTPUT, content: 'b'.repeat(6000) },
    ], 'gpt-5-4', 0);

    expect(usage).toBeGreaterThan(0);
  });
});

describe('getToolStartMessage payload handling', () => {
  it('handles string input by parsing JSON', () => {
    const msg = getToolStartMessage('read_file', '{"path": "/app/index.ts"}');
    expect(msg).toContain('Read app/index.ts');
  });

  it('handles null/undefined input gracefully', () => {
    expect(getToolStartMessage('read_file', null)).toContain('Read file');
    expect(getToolStartMessage('read_file', undefined)).toContain('Read file');
  });

  it('handles unknown tool names', () => {
    expect(getToolStartMessage('mystery_tool', {})).toBe('mystery_tool\n└─ Running...');
  });

  it('handles malformed JSON string input', () => {
    expect(getToolStartMessage('read_file', 'not json')).toContain('Read file');
  });

  it('formats command tools with truncated command', () => {
    const longCmd = 'npm run build --verbose --production --output=dist/out';
    const msg = getToolStartMessage('run_command', { command: longCmd });
    expect(msg).toContain('Run command');
    expect(msg.length).toBeLessThan(200);
  });
});

describe('formatToolResult payload handling', () => {
  it('handles string result', () => {
    const msg = formatToolResult('write_file', { path: '/app/new.ts' }, 'File written');
    expect(msg).toContain('Write app/new.ts');
    expect(msg).toContain('File created');
  });

  it('handles object result with content field', () => {
    const msg = formatToolResult('read_file', { path: '/a.ts' }, { content: 'line1\nline2\nline3' });
    expect(msg).toContain('3 lines');
  });

  it('handles error result (success: false)', () => {
    const msg = formatToolResult('edit_file', { path: '/a.ts' }, { success: false, error: 'File not found' });
    expect(msg).toContain('Error');
    expect(msg).toContain('File not found');
  });

  it('handles null/undefined result', () => {
    const msg = formatToolResult('write_file', { path: '/a.ts' }, null);
    expect(msg).toContain('File created');
  });

  it('formats todo_write with typed todos', () => {
    const msg = formatToolResult('todo_write', {
      todos: [
        { status: 'completed', content: 'fix bug' },
        { status: 'in_progress', content: 'add tests' },
        { status: 'pending', content: 'deploy' },
      ],
    }, 'ok');
    expect(msg).toContain('Todo List');
    expect(msg).toContain('1/3 done');
  });

  it('formats web_search with structured result', () => {
    const msg = formatToolResult('web_search', { query: 'react hooks' }, {
      results: [
        { title: 'React Docs', url: 'https://react.dev', snippet: 'Hooks guide' },
      ],
      query: 'react hooks',
      count: 1,
    });
    expect(msg).toContain('Web search "react hooks"');
    expect(msg).toContain('1 result');
  });

  it('handles command result with stdout/stderr', () => {
    const msg = formatToolResult('run_command', { command: 'ls -la' }, {
      stdout: 'total 100\nfile1.ts\nfile2.ts',
      stderr: '',
      exitCode: 0,
    });
    expect(msg).toContain('$ ls -la');
  });

  describe('formatFriendlyStatus', () => {
    it('correctly replaces placeholders and fixes Italian contractions', () => {
      expect(formatFriendlyStatus('Sto leggendo {file}', 'App.tsx')).toBe('Sto leggendo App.tsx');
      expect(formatFriendlyStatus('Sto leggendo {file}', '')).toBe('Sto leggendo il file');
      expect(formatFriendlyStatus('Recupero il contenuto di {file}', '')).toBe('Recupero il contenuto del file');
      expect(formatFriendlyStatus('Faccio qualche modifica a {file}', '')).toBe('Faccio qualche modifica al file');
      expect(formatFriendlyStatus('Scrivo il nuovo {file}', '')).toBe('Scrivo il nuovo file');
    });
  });
});
