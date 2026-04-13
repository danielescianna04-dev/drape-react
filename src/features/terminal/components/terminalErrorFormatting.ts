import type { TerminalItem } from '../../../shared/types';

export const formatTerminalErrorMessage = (content: TerminalItem['content']) => {
  if (typeof content === 'object' && content !== null) {
    return (content as any).message || (content as any).error || JSON.stringify(content);
  }

  const message = String(content || '');
  if (message.startsWith('{')) {
    try {
      const parsed = JSON.parse(message);
      return parsed.message || parsed.error || parsed.detail || message;
    } catch {
      return message;
    }
  }
  return message;
};
