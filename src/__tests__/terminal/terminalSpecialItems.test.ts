import { describe, expect, it } from 'vitest';
import { formatTerminalErrorMessage } from '../../features/terminal/components/terminalErrorFormatting';

describe('formatTerminalErrorMessage', () => {
  it('returns object message fields when content is an object', () => {
    expect(formatTerminalErrorMessage({ message: 'boom' } as any)).toBe('boom');
    expect(formatTerminalErrorMessage({ error: 'nope' } as any)).toBe('nope');
  });

  it('extracts useful fields from JSON strings', () => {
    expect(formatTerminalErrorMessage('{"detail":"missing env"}')).toBe('missing env');
  });

  it('falls back to the original string for plain text', () => {
    expect(formatTerminalErrorMessage('plain error')).toBe('plain error');
  });
});
