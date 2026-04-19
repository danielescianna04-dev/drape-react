/**
 * FriendlyToolItem — plain-language rendering of a tool call for non-technical
 * users. Replaces the CMD/GREP/READ badges + code output with a single line
 * like "Sto cercando le tabelle nel database…" or "Ho letto la configurazione".
 *
 * Intended to be rendered INSTEAD of TerminalOutputContent when
 * `uiStore.simpleToolView` is true. Keeps the original dev view untouched.
 */
import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TerminalItem } from '../../../shared/types';

interface Props {
  item: TerminalItem & {
    isExecuting?: boolean;
    toolInfo?: {
      tool?: string;
      input?: unknown;
      output?: unknown;
      status?: 'running' | 'completed' | 'error';
    };
  };
}

type Payload = Record<string, unknown>;

const parse = (raw: unknown): Payload => {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Payload;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as Payload; } catch { return {}; }
  }
  return {};
};

const baseName = (p: unknown): string => {
  const s = typeof p === 'string' ? p : '';
  if (!s) return '';
  const parts = s.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] || s;
};

/**
 * Strip regex metacharacters from a grep/search pattern so non-technical
 * users see "db" instead of "\bdb\b" or "import { db }" instead of
 * "import \{ db \}".
 */
const humanizeSearchPattern = (raw: unknown): string => {
  let s = typeof raw === 'string' ? raw : '';
  if (!s) return '';
  s = s.replace(/\\b/g, '').replace(/\\B/g, '');
  s = s.replace(/\\([.{}()\[\]+*?|^$/])/g, '$1');
  s = s.replace(/\\w|\\d|\\s/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > 40) s = `${s.slice(0, 38)}…`;
  return s;
};

const classifyCommand = (cmd: string): { verb: string; icon: string } => {
  const c = cmd.trim();
  if (/^ls(\s|$)|^find(\s|$)|^tree(\s|$)/.test(c)) return { verb: 'Sfoglio i file del progetto', icon: 'folder-open-outline' };
  if (/^cat(\s|$)|^head(\s|$)|^tail(\s|$)|^less(\s|$)/.test(c)) return { verb: 'Leggo un file', icon: 'document-text-outline' };
  if (/^grep(\s|$)|^rg(\s|$)/.test(c)) return { verb: 'Cerco nel codice', icon: 'search-outline' };
  if (/^git(\s|$)/.test(c)) return { verb: 'Controllo lo stato del progetto', icon: 'git-branch-outline' };
  if (/^npm(\s|$)|^yarn(\s|$)|^pnpm(\s|$)|^bun(\s|$)|^npx(\s|$)/.test(c)) return { verb: 'Gestisco i pacchetti', icon: 'cube-outline' };
  if (/^curl(\s|$)|^wget(\s|$)/.test(c)) return { verb: 'Faccio una chiamata di rete', icon: 'cloud-outline' };
  if (/^echo(\s|$)|^printf(\s|$)/.test(c)) return { verb: 'Scrivo un messaggio', icon: 'chatbox-outline' };
  return { verb: 'Eseguo un comando tecnico', icon: 'terminal-outline' };
};

function describe(tool: string, inputRaw: unknown, _outputRaw: unknown): { verb: string; detail: string; icon: string; color: string } {
  const input = parse(inputRaw);
  const t = tool || '';
  const PURPLE = '#A78BFA';
  const GREEN = '#34D399';
  const BLUE = '#60A5FA';
  const ORANGE = '#F59E0B';
  const PINK = '#EC4899';
  const GRAY = '#9CA3AF';

  if (t === 'read_file' || t === 'Read') {
    return { verb: 'Leggo', detail: baseName(input.path ?? input.filePath ?? input.file_path) || 'un file', icon: 'document-text-outline', color: BLUE };
  }
  if (t === 'write_file' || t === 'Write') {
    return { verb: 'Creo', detail: baseName(input.path ?? input.filePath) || 'un file', icon: 'create-outline', color: GREEN };
  }
  if (t === 'edit_file' || t === 'Edit' || t === 'multi_edit_file') {
    return { verb: 'Modifico', detail: baseName(input.path ?? input.filePath) || 'un file', icon: 'brush-outline', color: GREEN };
  }
  if (t === 'patch_file') {
    return { verb: 'Applico una modifica a', detail: baseName(input.path ?? input.filePath) || 'un file', icon: 'brush-outline', color: GREEN };
  }
  if (t === 'list_directory' || t === 'list_files') {
    const dir = String(input.path ?? input.directory ?? '.') || '.';
    return { verb: 'Guardo la cartella', detail: dir === '.' ? 'principale del progetto' : dir, icon: 'folder-open-outline', color: PURPLE };
  }
  if (t === 'glob_search' || t === 'glob_files' || t === 'Glob') {
    const pat = humanizeSearchPattern(input.pattern);
    return { verb: 'Cerco i file', detail: pat ? `del tipo ${pat}` : 'nel progetto', icon: 'folder-outline', color: PURPLE };
  }
  if (t === 'grep_search' || t === 'search_in_files' || t === 'Grep' || t === 'code_search') {
    const q = humanizeSearchPattern(input.pattern ?? input.query);
    return { verb: 'Cerco nel codice', detail: q ? `"${q}"` : '', icon: 'search-outline', color: ORANGE };
  }
  if (t === 'run_command' || t === 'execute_command' || t === 'Bash') {
    const cmd = String(input.command ?? '');
    const { verb, icon } = classifyCommand(cmd);
    return { verb, detail: '', icon, color: ORANGE };
  }
  if (t === 'web_search' || t === 'WebSearch') {
    const q = String(input.query ?? '');
    return { verb: 'Cerco sul web', detail: q ? `"${q}"` : '', icon: 'globe-outline', color: BLUE };
  }
  if (t === 'web_fetch' || t === 'WebFetch') {
    const url = String(input.url ?? '');
    let host = '';
    try { host = url ? new URL(url).hostname : ''; } catch { host = ''; }
    return { verb: 'Scarico una pagina web', detail: host, icon: 'cloud-download-outline', color: BLUE };
  }
  if (t === 'todo_write' || t === 'TodoWrite') {
    return { verb: 'Aggiorno la lista delle cose da fare', detail: '', icon: 'checkbox-outline', color: PINK };
  }
  if (t === 'todo_read') {
    return { verb: 'Controllo la lista delle cose da fare', detail: '', icon: 'checkbox-outline', color: PINK };
  }
  if (t === 'memory_read') {
    return { verb: 'Ricordo le note salvate', detail: '', icon: 'library-outline', color: PURPLE };
  }
  if (t === 'memory_write') {
    return { verb: 'Salvo una nota per ricordarmela', detail: '', icon: 'bookmark-outline', color: PURPLE };
  }
  if (t === 'dispatch_agent' || t === 'launch_sub_agent' || t === 'sub_agent' || t === 'Task') {
    return { verb: 'Chiedo a un aiutante di occuparsene', detail: '', icon: 'people-outline', color: PINK };
  }
  if (t === 'ask_user_question' || t === 'user_question' || t === 'AskUserQuestion') {
    return { verb: 'Ho una domanda per te', detail: '', icon: 'help-circle-outline', color: ORANGE };
  }
  if (t === 'diagnostics') {
    return { verb: 'Verifico la correttezza del codice', detail: baseName(input.path ?? input.filePath) || '', icon: 'shield-checkmark-outline', color: GREEN };
  }
  if (t === 'load_skill' || t === 'skill') {
    return { verb: 'Imparo una nuova capacità', detail: String(input.name ?? input.path ?? ''), icon: 'bulb-outline', color: ORANGE };
  }
  if (t === 'think') {
    return { verb: 'Sto riflettendo…', detail: '', icon: 'sparkles-outline', color: PURPLE };
  }

  // Fallback
  return { verb: 'Lavoro sul progetto', detail: t.replace(/_/g, ' '), icon: 'cog-outline', color: GRAY };
}

export const FriendlyToolItem: React.FC<Props> = ({ item }) => {
  const info = item.toolInfo;
  if (!info) return null;

  const { verb, detail, icon, color } = describe(info.tool || '', info.input, info.output);
  const running = item.isExecuting || info.status === 'running';
  const errored = info.status === 'error';
  const done = info.status === 'completed' && !errored;

  return (
    <View style={s.row}>
      <View style={[s.iconWrap, { backgroundColor: `${color}18`, borderColor: `${color}35` }]}>
        <Ionicons name={icon as any} size={14} color={color} />
      </View>

      <View style={s.textWrap}>
        <Text style={s.verb} numberOfLines={2}>
          {verb}
          {detail ? <Text style={s.detail}>{` ${detail}`}</Text> : null}
        </Text>
      </View>

      <View style={s.statusWrap}>
        {running ? (
          <ActivityIndicator size="small" color={color} />
        ) : errored ? (
          <Ionicons name="alert-circle" size={16} color="#EF4444" />
        ) : done ? (
          <Ionicons name="checkmark-circle" size={16} color="#34D399" />
        ) : null}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 10,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  textWrap: { flex: 1 },
  verb: { color: 'rgba(255,255,255,0.9)', fontSize: 14, lineHeight: 19, fontWeight: '500' },
  detail: { color: 'rgba(255,255,255,0.5)', fontWeight: '400' },
  statusWrap: { width: 22, alignItems: 'center', justifyContent: 'center' },
});
