import { AppColors } from '../../../shared/theme/colors';
import type { TerminalItem } from '../../../shared/types';
import { TerminalItemType } from '../../../shared/types';

const TERMINAL_COMMAND_RE = /^(ls|cd|pwd|mkdir|rm|cp|mv|cat|echo|touch|grep|find|chmod|chown|ps|kill|top|df|du|tar|zip|unzip|wget|curl|git|npm|node|python|pip|java|gcc|make|docker|kubectl)/i;

const TOOL_RESULT_PREFIXES = [
  'Read ',
  'Write ',
  'Edit ',
  'Multi-edit ',
  'Patch ',
  'List files',
  'Search "',
  'Execute:',
  'Glob ',
  'glob_search',
  'grep_search',
  'Todo List',
  'Web Search',
  'User Question',
  'Agent:',
  'Diagnostics',
  'LSP:',
  'Skill:',
  'Fetch:',
  'Fetch URL',
  'web_fetch',
] as const;

const FORMATTED_TOOL_OUTPUT_PREFIXES = [
  'Read ',
  'Write ',
  'Edit ',
  'Multi-edit ',
  'Patch ',
] as const;

export const isTerminalCommandItem = (item: TerminalItem): boolean => (
  item.type === TerminalItemType.COMMAND
  && Boolean(item.isDirectTerminal || (item.content || '').match(TERMINAL_COMMAND_RE))
);

export const isUserMessageItem = (item: TerminalItem): boolean => item.type === TerminalItemType.USER_MESSAGE;

export const shouldRenderTerminalItem = (
  item: TerminalItem | undefined,
  showThinking: boolean,
): item is TerminalItem => {
  if (!item || item.content == null) return false;
  if (typeof item.content === 'string' && item.content.trim() === '' && !showThinking) return false;
  return true;
};

export const getTerminalItemTextColor = (item: TerminalItem): string => {
  switch (item.type) {
    case TerminalItemType.COMMAND:
      return AppColors.primary;
    case TerminalItemType.ERROR:
      return AppColors.error;
    case TerminalItemType.SYSTEM:
      return AppColors.warning;
    default:
      return AppColors.dark.bodyText;
  }
};

export const isToolResultContent = (content: string): boolean => (
  TOOL_RESULT_PREFIXES.some((prefix) => content.startsWith(prefix))
);

export const isFormattedToolOutputContent = (content: string): boolean => (
  FORMATTED_TOOL_OUTPUT_PREFIXES.some((prefix) => content.startsWith(prefix))
);

export const hasCommandError = (content: string): boolean => (
  /^Error:/i.test(content)
  || /^ERROR:/i.test(content)
  || content.includes('command not found')
  || content.includes('No such file or directory')
);

export const hasLeadingToolError = (content: string): boolean => {
  const firstLines = content.split('\n').slice(0, 3).join('\n');
  return (
    /^Error:/m.test(firstLines)
    || /^ERROR:/m.test(firstLines)
    || firstLines.includes('└─ Error:')
    || firstLines.includes('└─ Failed')
  );
};

export const getTerminalItemDotColor = (item: TerminalItem, outputItem?: TerminalItem): string => {
  if (item.type === TerminalItemType.COMMAND && (isTerminalCommandItem(item) || item.isDirectTerminal) && outputItem) {
    return hasCommandError(outputItem.content || '') ? '#F85149' : '#3FB950';
  }

  if (item.type === TerminalItemType.ERROR) {
    return '#F85149';
  }

  if (item.type === TerminalItemType.OUTPUT) {
    const content = item.content || '';
    if (isToolResultContent(content)) {
      return hasLeadingToolError(content) ? '#F85149' : '#3FB950';
    }
  }

  return '#6E7681';
};
