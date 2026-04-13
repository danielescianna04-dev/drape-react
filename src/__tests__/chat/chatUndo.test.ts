import { parseUndoData } from '@/pages/Chat/chatUndo';
import { vi } from 'vitest';

describe('parseUndoData', () => {
  it('extracts undo payload and strips marker from content', () => {
    const result = parseUndoData(
      'Done\n<!--UNDO:{"__undo":true,"filePath":"src/App.tsx","newContent":"hello"}-->'
    );

    expect(result.cleanResult).toBe('Done');
    expect(result.undoData).toEqual({ __undo: true, filePath: 'src/App.tsx', newContent: 'hello' });
  });

  it('returns original content when payload is invalid', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const source = 'Done\n<!--UNDO:{not-json}-->';
    const result = parseUndoData(source);

    expect(result.cleanResult).toBe(source);
    expect(result.undoData).toBeNull();
    warnSpy.mockRestore();
  });
});
