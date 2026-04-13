export interface UndoData {
  __undo: true;
  filePath: string;
  originalContent?: string;
  newContent?: string;
}

export interface ParsedUndoPayload {
  cleanResult: string;
  undoData: UndoData | null;
}

export const parseUndoData = (result: string): ParsedUndoPayload => {
  const undoMatch = result.match(/<!--UNDO:(.*?)-->/s);
  if (undoMatch) {
    try {
      const undoData = JSON.parse(undoMatch[1]) as Partial<UndoData>;
      if (!undoData || undoData.__undo !== true || typeof undoData.filePath !== 'string') {
        return { cleanResult: result, undoData: null };
      }
      const cleanResult = result.replace(/\n?<!--UNDO:.*?-->/s, '');
      return {
        cleanResult,
        undoData: {
          __undo: true,
          filePath: undoData.filePath,
          originalContent: typeof undoData.originalContent === 'string' ? undoData.originalContent : undefined,
          newContent: typeof undoData.newContent === 'string' ? undoData.newContent : undefined,
        },
      };
    } catch (e) {
      console.warn('Failed to parse undo data:', e);
    }
  }

  return { cleanResult: result, undoData: null };
};
