import {
  getTerminalItemDotColor,
  hasLeadingToolError,
  isFormattedToolOutputContent,
  isTerminalCommandItem,
  shouldRenderTerminalItem,
} from '@/features/terminal/components/terminalItemUtils';
import { TerminalItemType } from '@/shared/types';

describe('terminalItemUtils', () => {
  it('detects terminal commands', () => {
    expect(isTerminalCommandItem({
      content: 'git status',
      type: TerminalItemType.COMMAND,
      timestamp: new Date(),
    })).toBe(true);
  });

  it('detects formatted tool output', () => {
    expect(isFormattedToolOutputContent('Write src/App.tsx')).toBe(true);
    expect(isFormattedToolOutputContent('Search "todo"')).toBe(false);
  });

  it('detects leading tool errors only in header area', () => {
    expect(hasLeadingToolError('Read file\n└─ Error: missing file')).toBe(true);
    expect(hasLeadingToolError('Read file\nok\nbody\nError: later')).toBe(false);
  });

  it('computes terminal command status dot color from output', () => {
    const item = {
      content: 'npm test',
      type: TerminalItemType.COMMAND,
      timestamp: new Date(),
    };
    const output = {
      content: 'Error: failed',
      type: TerminalItemType.OUTPUT,
      timestamp: new Date(),
    };

    expect(getTerminalItemDotColor(item, output)).toBe('#F85149');
  });

  it('hides empty placeholder messages unless thinking is active', () => {
    expect(shouldRenderTerminalItem({
      content: '',
      type: TerminalItemType.OUTPUT,
      timestamp: new Date(),
    }, false)).toBe(false);

    expect(shouldRenderTerminalItem({
      content: '',
      type: TerminalItemType.OUTPUT,
      timestamp: new Date(),
    }, true)).toBe(true);
  });
});
