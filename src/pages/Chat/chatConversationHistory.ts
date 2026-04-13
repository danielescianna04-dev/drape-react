import { TerminalItemType, type TerminalItem } from '../../shared/types';

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
  images?: {
    base64: string;
    type: string;
  }[];
}

export const buildAgentConversationHistory = (
  terminalItems: TerminalItem[] = [],
): ChatHistoryItem[] =>
  terminalItems
    .filter((item) => {
      const content = String(item.content ?? '');
      const trimmed = content.trim();
      const hasValidImages =
        Array.isArray(item.images) && item.images.some((img) => Boolean(img?.base64));

      if (item.type === TerminalItemType.USER_MESSAGE) {
        return trimmed.length > 0 || hasValidImages;
      }

      if (item.type === TerminalItemType.OUTPUT) {
        if (trimmed.length === 0) return false;

        return (
          !content.startsWith('Read ') &&
          !content.startsWith('Write ') &&
          !content.startsWith('Edit ') &&
          !content.startsWith('Execute:') &&
          !content.startsWith('Glob ') &&
          !content.startsWith('glob_search') &&
          !content.startsWith('grep_search') &&
          !content.startsWith('Search "') &&
          !content.startsWith('Diagnostics') &&
          !content.startsWith('LSP:') &&
          !content.startsWith('Skill:') &&
          !content.startsWith('Fetch:') &&
          !content.startsWith('Fetch URL') &&
          !content.startsWith('web_fetch') &&
          !content.startsWith('Web Search') &&
          !content.startsWith('Agent:') &&
          !content.startsWith('Todo List') &&
          !content.startsWith('User Question') &&
          !content.startsWith('List files') &&
          content !== '__BUDGET_EXCEEDED__'
        );
      }

      return false;
    })
    .map((item) => {
      const hasValidImages =
        Array.isArray(item.images) && item.images.some((img) => Boolean(img?.base64));
      const content =
        String(item.content ?? '').trim() || (hasValidImages ? '[Image attached]' : '');

      const historyItem: ChatHistoryItem = {
        role: item.type === TerminalItemType.USER_MESSAGE ? 'user' : 'assistant',
        content,
      };

      if (item.images && item.images.length > 0) {
        historyItem.images = item.images.map((img) => ({
          base64: String(img.base64 || ''),
          type: String(img.type || 'image/jpeg'),
        }));
      }

      return historyItem;
    });
