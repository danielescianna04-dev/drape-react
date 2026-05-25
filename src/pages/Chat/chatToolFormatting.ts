import { TerminalItemType } from '../../shared/types';
import type { ChatEngineMessage } from '../../hooks/engine/useChatEngine';

// ── Tool payload types ──────────────────────────────────────

/** Loosely-typed bag for tool input/result payloads from the agent stream */
type ToolPayload = Record<string, unknown>;

const PROJECT_ROOT_PREFIXES = [
  '/home/coder/project/',
  '/Users/daniele/bynot-react/',
];

/** Safely parse a tool input that may be a string or object */
const parseToolPayload = (raw: unknown): ToolPayload => {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as ToolPayload;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as ToolPayload; } catch { return {}; }
  }
  return {};
};

const normalizeDisplayPath = (rawPath: string): string => {
  if (!rawPath) return '';
  let normalized = rawPath.replace(/\\/g, '/');
  for (const prefix of PROJECT_ROOT_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }
  normalized = normalized.replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 3) return normalized || rawPath;
  return parts.slice(-3).join('/');
};

/** Extract a display path from various tool payload conventions */
const getFileName = (payload: ToolPayload): string => {
  const path = String(payload?.path ?? payload?.filePath ?? payload?.file_path ?? '');
  return path ? normalizeDisplayPath(path) : '';
};

/**
 * Type guard: does the result look like an object with typed fields?
 * Used for result payloads that have `success`, `content`, `error`, etc.
 */
const isResultObject = (raw: unknown): raw is ToolPayload =>
  raw != null && typeof raw === 'object' && !Array.isArray(raw);

/** Extract string content from a tool result */
const extractResultContent = (raw: unknown): { text: string; hasError: boolean; errorMessage: string } => {
  let text = '';
  let hasError = false;
  let errorMessage = '';

  try {
    if (raw == null) return { text, hasError, errorMessage };
    if (isResultObject(raw)) {
      if (raw.success === false) {
        hasError = true;
        errorMessage = String(raw.error ?? 'Unknown error');
      } else if (typeof raw.content === 'string') {
        text = raw.content;
      } else if (typeof raw.message === 'string') {
        text = raw.message;
      } else {
        text = JSON.stringify(raw);
      }
    } else {
      text = typeof raw === 'string' ? raw : JSON.stringify(raw);
    }
  } catch { /* swallow */ }

  return { text, hasError, errorMessage };
};

// ── Tool start messages ─────────────────────────────────────

export const getToolStartMessage = (tool: string, input: unknown): string => {
  const parsedInput = parseToolPayload(input);

  const toolMessages: Record<string, (payload: ToolPayload) => string> = {
    read_file: (payload) => { const file = getFileName(payload); return file ? `Read ${file}\n└─ Reading...` : 'Read file\n└─ Reading...'; },
    write_file: (payload) => { const file = getFileName(payload); return file ? `Write ${file}\n└─ Writing...` : 'Write file\n└─ Writing...'; },
    edit_file: (payload) => { const file = getFileName(payload); return file ? `Edit ${file}\n└─ Applying edit...` : 'Edit file\n└─ Applying edit...'; },
    list_directory: (p) => `List files in ${p?.path || p?.directory || '.'}\n└─ Loading...`,
    list_files: (p) => `List files in ${p?.path || p?.directory || '.'}\n└─ Loading...`,
    search_in_files: (p) => { const q = p?.pattern || p?.query; return q ? `Search "${q}"\n└─ Searching...` : 'Search\n└─ Searching...'; },
    grep_search: (p) => { const q = p?.pattern || p?.query; return q ? `Search "${q}"\n└─ Searching...` : 'Search\n└─ Searching...'; },
    glob_files: (p) => { const q = p?.pattern; return q ? `Glob pattern: ${q}\n└─ Searching...` : 'Glob\n└─ Searching...'; },
    glob_search: (p) => { const q = p?.pattern; return q ? `Glob pattern: ${q}\n└─ Searching...` : 'Glob\n└─ Searching...'; },
    run_command: (p) => { const c = String(p?.command ?? ''); return c ? `Run command\n└─ ${c.substring(0, 50)}...` : 'Run command\n└─ Executing...'; },
    execute_command: (p) => { const c = String(p?.command ?? ''); return c ? `Run command\n└─ ${c.substring(0, 50)}...` : 'Run command\n└─ Executing...'; },
    web_search: (p) => { const q = p?.query; return q ? `Web search\n└─ "${q}"...` : 'Web search\n└─ Searching...'; },
    web_fetch: () => 'Fetch URL\n└─ Loading...',
    multi_edit_file: (p) => {
      const file = getFileName(p);
      const edits = Array.isArray(p?.edits) ? p.edits : [];
      const editCount = edits.length || '?';
      return file ? `Multi-edit ${file}\n└─ Applying ${editCount} edits...` : `Multi-edit file\n└─ Applying ${editCount} edits...`;
    },
    patch_file: (p) => { const file = getFileName(p); return file ? `Patch ${file}\n└─ Applying diff...` : 'Patch file\n└─ Applying diff...'; },
    load_skill: (p) => { const name = p?.name; return name ? `Load skill: ${name}\n└─ Loading...` : 'List skills\n└─ Discovering...'; },
    tool_search: (p) => { const q = p?.query; return q ? `Tool search\n└─ "${q}"...` : 'Tool search\n└─ Searching...'; },
    command_output: (p) => `Check command\n└─ ${p?.command_id || '?'}`,
    memory_read: () => 'Read memory\n└─ Loading project memory...',
    memory_write: () => 'Save memory\n└─ Updating project memory...',
    dispatch_agent: (p) => {
      const agentType = p?.type || 'agent';
      const prompt = String(p?.prompt ?? '').substring(0, 60) || 'Processing...';
      return `Agent: ${agentType}\n└─ ${prompt}`;
    },
    ask_user_question: (p) => {
      const questions = p?.questions;
      if (Array.isArray(questions) && questions.length > 0) {
        const questionText = questions.map((q: unknown) => (isResultObject(q) ? q?.question : q) || q).join('\n   ');
        return `User Question\n└─ ${questionText}`;
      }
      return 'User Question\n└─ Waiting for response...';
    },
    todo_write: () => 'Todo List\n└─ Updating...',
    todo_read: () => 'Todo List\n└─ Reading...',
    sub_agent: (p) => {
      const prompt = String(p?.prompt ?? '').substring(0, 60) || 'Processing...';
      return `Agent: sub-agent\n└─ ${prompt}`;
    },
    user_question: (p) => {
      const question = p?.question || p?.text || '';
      return question ? `User Question\n└─ ${question}` : 'User Question\n└─ Waiting for response...';
    },
    diagnostics: (p) => { const file = getFileName(p); return file ? `Diagnostics ${file}\n└─ Checking...` : 'Diagnostics\n└─ Checking...'; },
    code_search: (p) => { const q = p?.query || p?.pattern || ''; return q ? `Search "${q}"\n└─ Searching code...` : 'Search code\n└─ Searching...'; },
    skill: (p) => { const name = p?.name || p?.path || ''; return name ? `Skill: ${name}\n└─ Loading...` : 'Skill\n└─ Loading...'; },
    lsp: (p) => { const action = p?.action || ''; return action ? `LSP: ${action}\n└─ Processing...` : 'LSP\n└─ Processing...'; },
  };

  const getMessage = toolMessages[tool];
  if (!getMessage) return `${tool}\n└─ Running...`;

  try {
    return getMessage(parsedInput);
  } catch {
    return `${tool}\n└─ Running...`;
  }
};

/**
 * Sentinel encoding for the agent-activity card. When a streaming message's
 * `content` starts with this prefix, ChatMessageList renders a Lovable-style
 * card instead of plain text. Format:
 *   __BYNOT_ACTIVITY__|<state>|<title>|<subtitle>
 * state ∈ "running" | "done"
 *
 * The prefix is overwritten as soon as real text tokens stream in, so the
 * card transitions naturally into the final AI message.
 */
export const ACTIVITY_PREFIX = '__BYNOT_ACTIVITY__|';

/**
 * Encoding: __BYNOT_ACTIVITY__|<state>|<poolKey>|<file>
 * AgentActivityCard reads poolKey + file and rotates its subtitle internally
 * through STATUS_POOLS[poolKey] every few seconds — so the user sees variety
 * even when a single tool runs for a long time (write_file on a big HTML).
 */
export function encodeActivityCard(
  state: 'running' | 'done',
  poolKey: string,
  file: string,
): string {
  const safe = (s: string) => (s || '').replace(/\|/g, '/');
  return `${ACTIVITY_PREFIX}${state}|${safe(poolKey)}|${safe(file)}`;
}

export function parseActivityCard(content: string | undefined | null):
  | { state: 'running' | 'done'; poolKey: string; file: string }
  | null
{
  if (!content || !content.startsWith(ACTIVITY_PREFIX)) return null;
  const rest = content.slice(ACTIVITY_PREFIX.length);
  const [state, poolKey, ...fileParts] = rest.split('|');
  if (state !== 'running' && state !== 'done') return null;
  return {
    state,
    poolKey: poolKey || 'generic',
    file: fileParts.join('|') || '',
  };
}

// ---------------------------------------------------------------------------
// Friendly status pools for the agent activity card.
//
// Each tool maps to MANY phrasings — picking one at random each time keeps the
// UX feeling alive instead of "Sto leggendo / Sto leggendo / Sto leggendo" on
// repeat. The text shows for ~1-3 seconds before the next tool overwrites it,
// so variety matters more than perfect grammatical agreement (file vs files).
// All copy in Italian: the audience is no-code Italian users.
// ---------------------------------------------------------------------------

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/**
 * Render a phrase from a pool, substituting {file} with the provided filename
/**
 * Resolves a friendly status template by replacing {file} with the file name
 * (or 'il file' if empty/fallback is used) and fixing Italian grammatical contractions.
 */
export function formatFriendlyStatus(template: string, file: string, fallbackFile: string = 'il file'): string {
  const resolvedFile = file || fallbackFile;
  let rendered = template.replace('{file}', resolvedFile);
  
  if (resolvedFile === 'il file') {
    rendered = rendered.replace(/\bdi il file\b/gi, 'del file');
    rendered = rendered.replace(/\ba il file\b/gi, 'al file');
    rendered = rendered.replace(/\bda il file\b/gi, 'dal file');
    rendered = rendered.replace(/\bnuovo il file\b/gi, 'nuovo file');
  }
  
  return rendered;
}

/**
 * Render a phrase from a pool, substituting {file} with the provided filename
 * (or a sensible Italian fallback). Used both by friendlyToolStatus (for the
 * initial subtitle on toolStart) and by AgentActivityCard (to rotate the
 * subtitle internally while the same tool keeps running).
 */
export function renderStatusFromPool(poolKey: string, file: string): string {
  const pool = STATUS_POOLS[poolKey] ?? STATUS_POOLS.generic;
  const tpl = pool[Math.floor(Math.random() * pool.length)];
  return formatFriendlyStatus(tpl, file);
}

/**
 * Map an opencode tool name (+ inspectable input for the bash family) to a
 * STATUS_POOLS key. Lets the activity card know which pool to keep rotating
 * through for as long as a single tool is running.
 */
export function toolToPool(tool: string, toolInput: unknown): { poolKey: string; file: string } {
  const input = parseToolPayload(toolInput);
  const file = getFileName(input);
  if (tool === 'read_file' || tool === 'read') return { poolKey: 'read', file };
  if (tool === 'write_file' || tool === 'write') return { poolKey: 'write', file };
  if (tool === 'edit_file' || tool === 'edit' || tool === 'multi_edit_file' || tool === 'multiedit' || tool === 'patch_file') return { poolKey: 'edit', file };
  if (tool === 'delete_file') return { poolKey: 'delete', file: String(input?.filePath || '') };
  if (tool === 'move_file' || tool === 'copy_file') return { poolKey: 'move', file: '' };
  if (tool === 'create_folder') return { poolKey: 'folder', file: '' };
  if (tool === 'list_directory' || tool === 'list_files' || tool === 'list') return { poolKey: 'list', file: '' };
  if (tool === 'glob_files' || tool === 'glob_search' || tool === 'glob') return { poolKey: 'glob', file: '' };
  if (tool === 'search_in_files' || tool === 'grep_search' || tool === 'grep' || tool === 'code_search') return { poolKey: 'search', file: '' };
  if (tool === 'run_command' || tool === 'execute_command' || tool === 'bash') {
    const cmd = String(input?.command || '');
    if (cmd.startsWith('curl') || cmd.includes('http')) return { poolKey: 'bash_curl', file: '' };
    if (cmd.startsWith('npm') || cmd.startsWith('yarn') || cmd.startsWith('pnpm') || cmd.includes('install')) return { poolKey: 'bash_npm', file: '' };
    if (cmd.startsWith('git')) return { poolKey: 'bash_git', file: '' };
    if (cmd.includes('build') || cmd.includes('compile') || cmd.includes('webpack') || cmd.includes('vite')) return { poolKey: 'bash_build', file: '' };
    if (cmd.includes('test') || cmd.includes('jest') || cmd.includes('vitest')) return { poolKey: 'bash_test', file: '' };
    return { poolKey: 'bash_other', file: '' };
  }
  if (tool === 'web_fetch') return { poolKey: 'web_fetch', file: '' };
  if (tool === 'web_search') return { poolKey: 'web_search', file: '' };
  if (tool === 'diagnostics') return { poolKey: 'diagnostics', file: '' };
  if (tool === 'todo_write' || tool === 'todo_read') return { poolKey: 'todo', file: '' };
  if (tool === 'load_skill' || tool === 'skill') return { poolKey: 'skill', file: '' };
  if (tool === 'memory_read' || tool === 'memory_write') return { poolKey: 'memory', file: '' };
  if (tool === 'dispatch_agent' || tool === 'task' || tool === 'sub_agent' || tool === 'launch_sub_agent') return { poolKey: 'subagent', file: '' };
  if (tool === 'lsp') return { poolKey: 'lsp', file: '' };
  if (tool === 'ask_user_question' || tool === 'user_question') return { poolKey: 'question', file: '' };
  return { poolKey: 'generic', file: '' };
}

/** Rotating titles for the activity card header (variety > one fixed label). */
export const ACTIVITY_TITLES = [
  'Lavoro in corso',
  'Ci penso io',
  'Sto preparando tutto',
  'Un attimo solo',
  'Quasi pronto',
  'Sto sistemando',
  'Procedo',
  'Costruisco',
];

export const STATUS_POOLS: Record<string, string[]> = {
  read: [
    'Sto leggendo {file}',
    'Apro {file} per dare un\'occhiata',
    'Sto controllando {file}',
    'Sbircio dentro {file}',
    'Recupero il contenuto di {file}',
  ],
  write: [
    'Sto creando {file}',
    'Salvo {file}',
    'Scrivo il nuovo {file}',
    'Sto preparando {file}',
    'Genero {file}',
  ],
  edit: [
    'Sto modificando {file}',
    'Aggiorno {file}',
    'Sto sistemando {file}',
    'Ritocco {file}',
    'Faccio qualche modifica a {file}',
  ],
  delete: [
    'Sto eliminando {file}',
    'Rimuovo {file}',
    'Cancello {file}',
  ],
  move: [
    'Sto spostando i file',
    'Riorganizzo qualche file',
    'Sistemo i file nelle cartelle giuste',
  ],
  folder: [
    'Sto creando la cartella',
    'Preparo una nuova cartella',
  ],
  list: [
    'Sto esplorando il progetto',
    'Do un\'occhiata in giro',
    'Controllo cosa c\'è nel progetto',
    'Vedo la struttura del progetto',
    'Mi oriento nel progetto',
  ],
  glob: [
    'Sto cercando i file',
    'Cerco i file giusti',
    'Setaccio i file del progetto',
  ],
  search: [
    'Sto cercando nel codice',
    'Frugo nel codice',
    'Cerco la parte giusta',
    'Esamino il codice',
  ],
  bash_curl: [
    'Sto scaricando i dati',
    'Recupero qualche informazione',
    'Sto facendo una richiesta web',
  ],
  bash_npm: [
    'Sto installando le dipendenze',
    'Scarico i pacchetti necessari',
    'Preparo le librerie',
  ],
  bash_git: [
    'Sto sincronizzando con git',
    'Aggiorno il repository',
    'Commit & push…',
  ],
  bash_build: [
    'Sto compilando il progetto',
    'Build in corso',
    'Costruisco il bundle',
  ],
  bash_test: [
    'Eseguo i test',
    'Verifico che tutto funzioni',
    'Controllo che il codice sia ok',
  ],
  bash_other: [
    'Sto eseguendo un comando',
    'Lavoro nel terminale',
    'Faccio un\'operazione tecnica',
  ],
  web_fetch: [
    'Sto leggendo una pagina web',
    'Visito la pagina',
    'Recupero il contenuto online',
  ],
  web_search: [
    'Sto cercando sul web',
    'Cerco informazioni online',
    'Faccio una ricerca',
  ],
  diagnostics: [
    'Sto controllando il codice',
    'Cerco eventuali errori',
    'Verifico che sia tutto in ordine',
  ],
  todo: [
    'Sto organizzando le attività',
    'Aggiorno la lista delle cose da fare',
    'Pianifico i prossimi passi',
  ],
  skill: [
    'Sto caricando le competenze',
    'Mi attrezzo per il prossimo step',
    'Carico gli strumenti giusti',
  ],
  memory: [
    'Sto consultando la memoria',
    'Cerco nei miei appunti',
    'Recupero quello che ricordo',
  ],
  subagent: [
    'Sto lavorando su un sotto-compito',
    'Delego una parte del lavoro',
    'Mi concentro su un aspetto specifico',
  ],
  lsp: [
    'Sto analizzando il codice',
    'Studio la struttura del progetto',
  ],
  question: [
    'Ti sto chiedendo una conferma',
    'Aspetto una tua risposta',
  ],
  generic: [
    'Sto lavorando',
    'Un attimo…',
    'Ci sono quasi…',
    'Penso al prossimo passo',
  ],
};

/**
 * Pick a random friendly Italian status line for a tool. Same tool called
 * back-to-back produces different copy each time — keeps the activity card
 * feeling alive across the agent's multi-step loops.
 */
export const friendlyToolStatus = (tool: string, toolInput: unknown): string => {
  const input = parseToolPayload(toolInput);
  const file = getFileName(input);
  const fmt = (key: string, fallback?: string) => {
    const pool = STATUS_POOLS[key];
    const tpl = pool ? pick(pool) : (fallback ?? STATUS_POOLS.generic[0]);
    return formatFriendlyStatus(tpl, file, fallback);
  };

  if (tool === 'read_file' || tool === 'read') return fmt('read');
  if (tool === 'write_file' || tool === 'write') return fmt('write');
  if (tool === 'edit_file' || tool === 'edit' || tool === 'multi_edit_file' || tool === 'multiedit' || tool === 'patch_file') return fmt('edit');
  if (tool === 'delete_file') return fmt('delete');
  if (tool === 'move_file' || tool === 'copy_file') return pick(STATUS_POOLS.move);
  if (tool === 'create_folder') return pick(STATUS_POOLS.folder);
  if (tool === 'list_directory' || tool === 'list_files' || tool === 'list') return pick(STATUS_POOLS.list);
  if (tool === 'glob_files' || tool === 'glob_search' || tool === 'glob') return pick(STATUS_POOLS.glob);
  if (tool === 'search_in_files' || tool === 'grep_search' || tool === 'grep' || tool === 'code_search') {
    return pick(STATUS_POOLS.search);
  }
  if (tool === 'run_command' || tool === 'execute_command' || tool === 'bash') {
    const cmd = String(input?.command || '');
    if (cmd.startsWith('curl') || cmd.includes('http')) return pick(STATUS_POOLS.bash_curl);
    if (cmd.startsWith('npm') || cmd.startsWith('yarn') || cmd.startsWith('pnpm') || cmd.includes('install')) return pick(STATUS_POOLS.bash_npm);
    if (cmd.startsWith('git')) return pick(STATUS_POOLS.bash_git);
    if (cmd.includes('build') || cmd.includes('compile') || cmd.includes('webpack') || cmd.includes('vite')) return pick(STATUS_POOLS.bash_build);
    if (cmd.includes('test') || cmd.includes('jest') || cmd.includes('vitest')) return pick(STATUS_POOLS.bash_test);
    return pick(STATUS_POOLS.bash_other);
  }
  if (tool === 'web_fetch') return pick(STATUS_POOLS.web_fetch);
  if (tool === 'web_search') return pick(STATUS_POOLS.web_search);
  if (tool === 'diagnostics') return pick(STATUS_POOLS.diagnostics);
  if (tool === 'todo_write' || tool === 'todo_read') return pick(STATUS_POOLS.todo);
  if (tool === 'load_skill' || tool === 'skill') return pick(STATUS_POOLS.skill);
  if (tool === 'memory_read' || tool === 'memory_write') return pick(STATUS_POOLS.memory);
  if (tool === 'dispatch_agent' || tool === 'task' || tool === 'sub_agent' || tool === 'launch_sub_agent') return pick(STATUS_POOLS.subagent);
  if (tool === 'lsp') return pick(STATUS_POOLS.lsp);
  if (tool === 'ask_user_question' || tool === 'user_question') return pick(STATUS_POOLS.question);
  return pick(STATUS_POOLS.generic);
};

export const formatToolResult = (tool: string, toolInput: unknown, rawResult: unknown): string => {
  // Lovable-style "running" card: emitted by chatStreamingRequest when the
  // backend sends a toolStart event. Renders as a single-line "Working on X"
  // until the matching toolResult lands and replaces the content.
  if (rawResult === '__pending__') {
    const input = parseToolPayload(toolInput);
    const file = getFileName(input);
    if (tool === 'read_file' || tool === 'read') return `⏳ Read ${file || 'file'}\n└─ Loading...`;
    if (tool === 'write_file' || tool === 'write') return `⏳ Write ${file || 'file'}\n└─ Saving...`;
    if (tool === 'edit_file' || tool === 'edit') return `⏳ Edit ${file || 'file'}\n└─ Modifying...`;
    if (tool === 'glob_files' || tool === 'glob_search' || tool === 'glob') return `⏳ Glob ${input?.pattern || ''}\n└─ Searching...`;
    if (tool === 'list_directory' || tool === 'list_files' || tool === 'list') return `⏳ List ${input?.directory || input?.path || '.'}\n└─ Listing...`;
    if (tool === 'search_in_files' || tool === 'grep_search' || tool === 'grep') return `⏳ Search "${input?.pattern || input?.query || ''}"\n└─ Searching...`;
    if (tool === 'run_command' || tool === 'execute_command' || tool === 'bash') return `⏳ Run ${String(input?.command || '').slice(0, 60)}\n└─ Executing...`;
    return `⏳ ${tool}\n└─ Working...`;
  }

  const { text: result, hasError, errorMessage } = extractResultContent(rawResult);
  const input = parseToolPayload(toolInput);

  // Lovable-style compact cards: title + 1-line summary, NEVER the full body.
  // Dumping file contents / dir listings / search hits as plain chat text was
  // overwhelming on a phone. The full result is still on the server (and can
  // be exposed via a future "expand details" tap), but the chat itself stays
  // glanceable.
  if (tool === 'read_file' || tool === 'read') {
    const file = getFileName(input);
    const lines = result ? result.split('\n').length : 0;
    return `Read ${file || 'file'}\n└─ ${lines} line${lines !== 1 ? 's' : ''}`;
  }
  if (tool === 'write_file' || tool === 'write') {
    const file = getFileName(input);
    if (hasError) return `Write ${file || 'file'}\n└─ Error: ${errorMessage}`;
    return `Write ${file || 'file'}\n└─ File created`;
  }
  if (tool === 'edit_file' || tool === 'edit') {
    const file = getFileName(input);
    if (hasError) return `Edit ${file || 'file'}\n└─ Error: ${errorMessage}`;
    return `Edit ${file || 'file'}\n└─ File modified`;
  }
  if (tool === 'glob_files' || tool === 'glob_search' || tool === 'glob') {
    const pattern = input?.pattern || 'files';
    const fileCount = result ? result.split('\n').filter((line: string) => line.trim()).length : 0;
    return `Glob pattern: ${pattern}\n└─ Found ${fileCount} file(s)`;
  }
  if (tool === 'list_directory' || tool === 'list_files' || tool === 'list') {
    const directory = input?.directory || input?.dirPath || input?.path || '.';
    const fileCount = result ? result.split('\n').filter((line: string) => line.trim()).length : 0;
    return `List ${directory}\n└─ ${fileCount} file${fileCount !== 1 ? 's' : ''}`;
  }
  if (tool === 'search_in_files' || tool === 'grep_search' || tool === 'grep') {
    const pattern = input?.pattern || input?.query || 'pattern';
    const matches = result ? result.split('\n').filter((line: string) => line.includes(':')).length : 0;
    return `Search "${pattern}"\n└─ ${matches} match${matches !== 1 ? 'es' : ''}`;
  }
  if (tool === 'run_command' || tool === 'execute_command' || tool === 'bash') {
    const command = String(input?.command || 'command');
    const shortCmd = command.length > 60 ? command.slice(0, 60) + '…' : command;
    if (command.startsWith('curl')) {
      const urlMatch = command.match(/curl\s+(?:-[sS]\s+)?(?:['"])?([^\s'"]+)/);
      const url = urlMatch ? urlMatch[1] : command.substring(5).trim();
      let exitCode = 0;
      try {
        if (isResultObject(rawResult)) {
          exitCode = Number(rawResult.exitCode ?? 0);
        } else if (typeof result === 'string' && result.includes('exitCode')) {
          exitCode = JSON.parse(result).exitCode || 0;
        }
      } catch {}
      return `curl ${url.slice(0, 50)}${url.length > 50 ? '…' : ''}\n└─ ${exitCode === 0 ? 'OK' : `Error (exit ${exitCode})`}`;
    }
    let exitCode = 0;
    if (isResultObject(rawResult)) exitCode = Number(rawResult.exitCode ?? 0);
    if (hasError || exitCode !== 0) {
      return `$ ${shortCmd}\n└─ Failed${errorMessage ? `: ${errorMessage.slice(0, 80)}` : ''}`;
    }
    return `$ ${shortCmd}\n└─ Done`;
  }
  if (tool === 'multi_edit_file' || tool === 'multiedit') {
    const file = getFileName(input);
    const edits = Array.isArray(input?.edits) ? input.edits : [];
    const editCount = edits.length || '?';
    if (hasError) return `Multi-edit ${file || 'file'}\n└─ Error: ${errorMessage}`;
    return `Multi-edit ${file || 'file'}\n└─ ${editCount} edits applied`;
  }
  if (tool === 'dispatch_agent' || tool === 'task') {
    const agentType = input?.type || input?.subagent_type || 'agent';
    const description = String(input?.prompt ?? input?.description ?? '').slice(0, 60);
    if (hasError) return `Agent: ${agentType}\n└─ Error: ${errorMessage}`;
    return `Agent: ${agentType}${description ? `\n└─ ${description}${description.length >= 60 ? '…' : ''}` : '\n└─ Completed'}`;
  }
  if (tool === 'patch_file') {
    const file = getFileName(input);
    if (hasError) return `Patch ${file || 'file'}\n└─ Error: ${errorMessage}`;
    return `Patch ${file || 'file'}\n└─ Applied`;
  }
  if (tool === 'create_folder') {
    return `Create folder ${input?.folderPath || 'folder'}\n└─ Done`;
  }
  if (tool === 'delete_file') {
    return `Delete ${input?.filePath || 'file'}\n└─ Done`;
  }
  if (tool === 'move_file') {
    return `Move ${input?.sourcePath || 'source'} → ${input?.destPath || 'dest'}\n└─ Done`;
  }
  if (tool === 'copy_file') {
    return `Copy ${input?.sourcePath || 'source'} → ${input?.destPath || 'dest'}\n└─ Done`;
  }
  if (tool === 'think') {
    return `💭 ${result}`;
  }
  if (tool === 'load_skill') {
    const skillName = input?.name || 'skills';
    if (hasError) return `Skill ${skillName}\n└─ ${errorMessage}`;
    return `Skill ${skillName}\n└─ Loaded`;
  }
  if (tool === 'tool_search') return `Tool search\n└─ Done`;
  if (tool === 'command_output') {
    const commandId = input?.command_id || '?';
    if (hasError) return `Check command ${commandId}\n└─ Error`;
    return `Check command ${commandId}\n└─ ${result.includes('still running') ? 'Still running…' : 'Done'}`;
  }
  if (tool === 'memory_read') {
    if (!result || result.includes('No memory saved')) return 'Read memory\n└─ Empty';
    return `Read memory\n└─ Loaded`;
  }
  if (tool === 'memory_write') {
    if (hasError) return `Save memory\n└─ Error: ${errorMessage}`;
    return 'Save memory\n└─ Updated';
  }
  if (tool === 'web_fetch') {
    const url = String(input?.url || 'URL');
    const urlShort = url.length > 50 ? `${url.substring(0, 50)}…` : url;
    return `Fetch ${urlShort}\n└─ Done`;
  }
  if (tool === 'launch_sub_agent') {
    const agentType = input?.subagent_type || input?.type || 'agent';
    const description = String(input?.description || '').substring(0, 60) || String(input?.prompt ?? '').substring(0, 60) || 'Task';
    if (hasError) return `Agent: ${agentType}\n└─ Error: ${errorMessage}\n\n${description}`;
    let summary = '';
    try {
      if (isResultObject(rawResult) && typeof rawResult.summary === 'string') summary = rawResult.summary;
      else if (result.length > 0 && result !== 'undefined') summary = result;
    } catch {
      summary = '';
    }
    return `Agent: ${agentType}\n└─ ${description || 'Completed'}`;
  }
  if (tool === 'todo_write') {
    const todos = Array.isArray(input?.todos) ? (input.todos as ToolPayload[]) : [];
    const totalTasks = todos.length;
    const completedTasks = todos.filter((todo) => todo.status === 'completed').length;
    return `Todo List\n└─ ${completedTasks}/${totalTasks} done`;
  }
  if (tool === 'web_search') {
    let query = '';
    let count = 0;
    try {
      if (isResultObject(rawResult) && Array.isArray(rawResult.results)) {
        query = String(rawResult.query ?? input?.query ?? 'query');
        count = (typeof rawResult.count === 'number' ? rawResult.count : rawResult.results.length);
      }
    } catch {}
    return `Web search "${query}"\n└─ ${count} result${count !== 1 ? 's' : ''}`;
  }
  if (tool === 'ask_user_question') {
    const questions = Array.isArray(input?.questions) ? (input.questions as ToolPayload[]) : [];
    return `User Question\n└─ ${questions.length} answered`;
  }
  if (tool === 'sub_agent') {
    const description = String(input?.prompt ?? '').slice(0, 60) || 'Task';
    if (hasError) return `Agent: sub-agent\n└─ Error: ${errorMessage}`;
    return `Agent: sub-agent\n└─ ${description}${description.length >= 60 ? '…' : ''}`;
  }
  if (tool === 'todo_read') return `Todo List\n└─ Read`;
  if (tool === 'user_question') {
    return `User Question\n└─ Answered`;
  }
  if (tool === 'diagnostics') {
    const file = getFileName(input);
    if (hasError) return `Diagnostics ${file || ''}\n└─ Error: ${errorMessage}`;
    const issueCount = result ? result.split('\n').filter((line: string) => line.trim()).length : 0;
    return `Diagnostics ${file || 'project'}\n└─ ${issueCount} issue${issueCount !== 1 ? 's' : ''}`;
  }
  if (tool === 'code_search') {
    const query = input?.query || input?.pattern || 'code';
    const matches = result ? result.split('\n').filter((line: string) => line.trim()).length : 0;
    return `Search "${query}"\n└─ ${matches} result${matches !== 1 ? 's' : ''}`;
  }
  if (tool === 'skill') {
    const name = input?.name || input?.path || 'skill';
    if (hasError) return `Skill: ${name}\n└─ Error: ${errorMessage}`;
    return `Skill: ${name}\n└─ Loaded`;
  }
  if (tool === 'lsp') {
    const action = input?.action || 'query';
    if (hasError) return `LSP: ${action}\n└─ Error: ${errorMessage}`;
    return `LSP: ${action}\n└─ Done`;
  }

  // Unknown tool fallback — show name + "Done" only, never dump raw result.
  return `${tool}\n└─ ${hasError ? `Error: ${errorMessage}` : 'Done'}`;
};

export const formatEngineMessage = (
  message: ChatEngineMessage,
  unknownErrorLabel: string,
) => {
  const costProps: Record<string, unknown> = {};
  const messageRecord = message as unknown as Record<string, unknown>;
  if (messageRecord.costEur) costProps.costEur = messageRecord.costEur;
  if (messageRecord.tokensUsed) costProps.tokensUsed = messageRecord.tokensUsed;

  switch (message.type) {
    case 'thinking':
      return {
        content: message.content || '',
        type: TerminalItemType.OUTPUT,
        timestamp: message.timestamp,
        isThinking: message.isThinking,
        thinkingContent: message.thinkingContent || '',
      };
    case 'text':
      return {
        content: message.content || '',
        type: TerminalItemType.OUTPUT,
        timestamp: message.timestamp,
        isThinking: false,
        thinkingContent: '',
        ...costProps,
      };
    case 'tool_start':
      return {
        content: getToolStartMessage(message.tool!, message.toolInput),
        type: TerminalItemType.OUTPUT,
        timestamp: message.timestamp,
        isExecuting: true,
        toolInfo: {
          tool: message.tool!,
          input: message.toolInput,
          status: 'running' as const,
        },
      };
    case 'tool_complete':
      return {
        content: formatToolResult(message.tool!, message.toolInput, message.toolResult),
        type: TerminalItemType.OUTPUT,
        timestamp: message.timestamp,
        isExecuting: false,
        toolInfo: {
          tool: message.tool!,
          input: message.toolInput,
          output: message.toolResult,
          status: 'completed' as const,
        },
      };
    case 'tool_error':
      return {
        content: `${message.tool}\n└─ Error`,
        type: TerminalItemType.OUTPUT,
        timestamp: message.timestamp,
        isExecuting: false,
        toolInfo: {
          tool: message.tool!,
          input: message.toolInput,
          output: message.toolResult,
          status: 'error' as const,
        },
      };
    case 'error':
      return { content: message.content || unknownErrorLabel, type: TerminalItemType.ERROR, timestamp: message.timestamp };
    case 'context_compacted':
      return {
        content: message.isCompacting ? '__CONTEXT_COMPACTING__' : '__CONTEXT_COMPACTED__',
        type: TerminalItemType.OUTPUT,
        timestamp: message.timestamp,
      };
    case 'budget_exceeded':
      return { content: '__BUDGET_EXCEEDED__', type: TerminalItemType.OUTPUT, timestamp: message.timestamp };
    case 'completion':
      return {
        content: message.content || '',
        type: TerminalItemType.OUTPUT,
        timestamp: message.timestamp,
        isAgentMessage: true,
        isCompletion: true,
      };
    case 'status':
      return {
        content: `__AGENT_STATUS__${JSON.stringify({
          phase: (message as ChatEngineMessage & { phase?: string }).phase || '',
          message: message.content || '',
        })}`,
        type: TerminalItemType.OUTPUT,
        timestamp: message.timestamp,
      };
    default:
      return { content: message.content || '', type: TerminalItemType.OUTPUT, timestamp: message.timestamp };
  }
};

export const isCommand = (text: string): boolean => {
  const commandPrefixes = ['ls', 'cd', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'echo', 'touch', 'grep', 'find', 'chmod', 'chown', 'ps', 'kill', 'top', 'df', 'du', 'tar', 'zip', 'unzip', 'wget', 'curl', 'git', 'npm', 'node', 'python', 'pip', 'java', 'gcc', 'make', 'docker', 'kubectl'];
  const firstWord = text.trim().split(' ')[0].toLowerCase();
  return commandPrefixes.includes(firstWord) || text.includes('&&') || text.includes('|') || text.includes('>');
};

export const isTerminalInput = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('./') || (trimmed.startsWith('/') && !trimmed.includes(' '))) return true;
  if (trimmed.includes('&&') || trimmed.includes(' | ') || trimmed.includes(' > ') || trimmed.includes(' >> ') || trimmed.includes(' ; ')) return true;

  const binaries = [
    'ls', 'cd', 'pwd', 'mkdir', 'rmdir', 'rm', 'cp', 'mv', 'cat', 'head', 'tail',
    'echo', 'touch', 'grep', 'egrep', 'find', 'chmod', 'chown', 'chgrp', 'ps', 'kill',
    'top', 'htop', 'df', 'du', 'tar', 'zip', 'unzip', 'gzip', 'gunzip',
    'wget', 'curl', 'ssh', 'scp', 'rsync', 'ping', 'nc', 'netstat',
    'git', 'npm', 'npx', 'yarn', 'pnpm', 'bun', 'deno',
    'node', 'python', 'python3', 'pip', 'pip3', 'ruby', 'php', 'go', 'cargo', 'rustc',
    'java', 'javac', 'gcc', 'g++', 'clang', 'make', 'cmake',
    'docker', 'docker-compose', 'kubectl', 'helm',
    'apt', 'apt-get', 'yum', 'brew', 'pacman',
    'which', 'whereis', 'whoami', 'hostname', 'uname', 'env', 'export', 'set', 'unset',
    'clear', 'history', 'man', 'date', 'cal', 'wc', 'sort', 'uniq', 'cut', 'awk', 'sed',
    'xargs', 'tee', 'diff', 'patch', 'file', 'stat', 'ln', 'readlink',
    'tree', 'less', 'more', 'vi', 'vim', 'nano',
    'systemctl', 'service', 'journalctl', 'crontab',
    'dir', 'type', 'printenv', 'source', 'bash', 'sh', 'zsh',
  ];

  const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
  return binaries.includes(firstWord);
};

export const estimateContextUsage = (
  terminalItems: Array<{ type: string; content?: string | null }>,
  selectedModel: string,
  engineContextUsagePercent: number,
) => {
  if (terminalItems.length === 0) return 0;

  let totalChars = 15000;
  for (const item of terminalItems) {
    const content = String(item.content ?? '');
    if (item.type === TerminalItemType.USER_MESSAGE || item.type === TerminalItemType.OUTPUT) {
      totalChars += content.length;
    }
  }

  const contextWindows: Record<string, number> = {
    // Current OpenRouter models (primary)
    'openrouter/deepseek/deepseek-v4-pro': 1000000,
    'openrouter/deepseek/deepseek-v4-flash': 1000000,
    'openrouter/qwen/qwen3-coder': 1000000,
    'openrouter/google/gemma-4-31b-it:free': 262000,
    // Legacy Zen IDs (kept for backwards compat with saved sessions)
    'deepseek-v4-flash-free': 128000,
    'qwen3.6-plus-free': 128000,
    'nemotron-3-super-free': 128000,
    'minimax-m2.5-free': 128000,
    'big-pickle': 128000,
    // Legacy support
    'claude-sonnet-4': 200000,
    'claude-4-6-sonnet': 200000,
    'claude-4-7-opus': 1000000,
    'claude-opus-4-7': 1000000,
    'claude-4-6-opus': 1000000,
    'claude-haiku-3.5': 200000,
    'gemini-3-flash': 1000000,
    'gemini-3.1-pro': 1000000,
    'gpt-5-4': 128000,
    'glm-5.1': 202752,
    'llama-3.3-70b': 128000,
  };

  const windowTokens = contextWindows[selectedModel] || 200000;
  const estimatedTokens = Math.ceil(totalChars / 3.5);
  const percent = Math.min(100, Math.round((estimatedTokens / windowTokens) * 100));

  return Math.max(percent, engineContextUsagePercent);
};
