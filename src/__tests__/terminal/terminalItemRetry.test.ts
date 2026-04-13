import { describe, expect, it } from 'vitest';
import { TerminalItemType, type TerminalItem } from '../../shared/types';
import { canRetryTerminalTool } from '../../features/terminal/components/terminalItemUtils';

const buildItem = (overrides: Partial<TerminalItem> = {}): TerminalItem => ({
  id: 'item-1',
  content: 'Tool failed',
  type: TerminalItemType.OUTPUT,
  timestamp: new Date(),
  ...overrides,
});

describe('canRetryTerminalTool', () => {
  it('returns true only for failed tool items with a retry handler', () => {
    const item = buildItem({
      toolInfo: {
        tool: 'write_file',
        input: { path: 'a.txt' },
        output: 'boom',
        status: 'error',
      },
    });

    expect(canRetryTerminalTool(item, true)).toBe(true);
    expect(canRetryTerminalTool(item, false)).toBe(false);
  });

  it('returns false for running or completed tool items', () => {
    const running = buildItem({
      toolInfo: {
        tool: 'write_file',
        input: {},
        status: 'running',
      },
    });
    const completed = buildItem({
      toolInfo: {
        tool: 'write_file',
        input: {},
        status: 'completed',
      },
    });

    expect(canRetryTerminalTool(running, true)).toBe(false);
    expect(canRetryTerminalTool(completed, true)).toBe(false);
  });
});
