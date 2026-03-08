import { stripToolCallXml } from './stripToolCallXml';

const LEAKED_TOOL_NAMES = [
  'todo_write',
  'signal_completion',
  'edit_file',
  'write_file',
  'multi_edit_file',
  'run_command',
  'read_file',
  'list_directory',
  'glob_search',
  'grep_search',
  'launch_sub_agent',
  'ask_user_question',
];

const LEAKED_TOOL_NAME_PATTERN = LEAKED_TOOL_NAMES.join('|');
const LEAKED_TOOL_USAGE_LINE_RE = /^\s*\[Uses [^\]]+\](?:\s*code)?\s*$/gim;
const LEAKED_TOOL_CALL_BLOCK_RE = new RegExp(
  String.raw`(?:^|\n)\s*(?:${LEAKED_TOOL_NAME_PATTERN})\(\s*\{[\s\S]*?(?:\n\s*\}\)\s*|\}\)\s*)`,
  'gim',
);
const LEAKED_FENCED_TOOL_CALL_BLOCK_RE = new RegExp(
  `(?:^|\\n)\`\`\`[a-zA-Z]*\\s*(?:${LEAKED_TOOL_NAME_PATTERN})\\(\\s*\\{[\\s\\S]*?\`\`\``,
  'gim',
);

type SanitizeAgentTextOptions = {
  compact?: boolean;
  plainText?: boolean;
};

export function sanitizeAgentText(
  text: string,
  options: SanitizeAgentTextOptions = {},
): string {
  if (!text) return text;

  let cleaned = stripToolCallXml(text).replace(/\r\n?/g, '\n');

  cleaned = cleaned.replace(LEAKED_FENCED_TOOL_CALL_BLOCK_RE, '\n');
  cleaned = cleaned.replace(LEAKED_TOOL_CALL_BLOCK_RE, '\n');
  cleaned = cleaned.replace(LEAKED_TOOL_USAGE_LINE_RE, '');
  cleaned = cleaned.replace(/^\s*Summary:\s*/gim, '');
  cleaned = cleaned.replace(/\s*\[code\]\s*/g, ' ');

  if (options.compact) {
    cleaned = cleaned.replace(/(?:^|\n)```[\s\S]*?```(?=\n|$)/g, '\n');
    cleaned = cleaned.replace(/`[^`\n]{60,}`/g, ' ');
  }

  if (options.plainText) {
    cleaned = cleaned.replace(/`([^`\n]+)`/g, '$1');
  }

  cleaned = cleaned.replace(/[ \t]+\n/g, '\n');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');

  return cleaned.trim();
}
