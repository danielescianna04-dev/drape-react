import {
  estimateContextUsage,
  formatEngineMessage,
  formatToolResult,
  getToolStartMessage,
  isCommand,
  isTerminalInput,
} from '@/pages/Chat/chatToolFormatting';
import { TerminalItemType } from '@/shared/types';

describe('chatToolFormatting', () => {
  it('formats tool start messages with file names', () => {
    expect(getToolStartMessage('read_file', { path: '/tmp/demo.ts' })).toContain('Read demo.ts');
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
