import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { workstationService } from '../../../core/workstation/workstationService';
import * as Haptics from 'expo-haptics';
import { AppColors } from '../../../shared/theme/colors';
import { useTabStore } from '../../../core/tabs/tabStore';
import { useSidebarOffset } from '../context/SidebarContext';
import { useFileCacheStore } from '../../../core/cache/fileCacheStore';
import { useAutocomplete } from '../hooks/useAutocomplete';
import type { Suggestion } from '../hooks/useAutocomplete';
import { AutocompleteBar } from './AutocompleteBar';

interface Props {
  visible: boolean;
  filePath: string;
  projectId: string;
  repositoryUrl?: string;
  userId: string;
  onClose: () => void;
  refreshKey?: number;
}

// ─── Syntax Highlighting ────────────────────────────────────────────────────

type Token = { text: string; color: string };

const C = {
  keyword:   '#569cd6',
  control:   '#c586c0',
  string:    '#ce9178',
  comment:   '#6a9955',
  number:    '#b5cea8',
  type:      '#4ec9b0',
  func:      '#dcdcaa',
  jsxTag:    '#4ec9b0',
  jsxAttr:   '#9cdcfe',
  decorator: '#dcdcaa',
  operator:  '#d4d4d4',
  punct:     '#d4d4d4',
  prop:      '#9cdcfe',
  plain:     '#d4d4d4',
};

const JS_KW = new Set([
  'import','export','default','from','as','const','let','var','function',
  'return','if','else','for','while','do','switch','case','break','continue',
  'class','extends','new','this','super','typeof','instanceof','in','of',
  'async','await','try','catch','finally','throw','void','delete','yield',
  'null','undefined','true','false','static','get','set','abstract',
  'type','interface','enum','namespace','declare','implements','keyof',
  'readonly','public','private','protected','module','require','with',
]);
const JS_CTRL = new Set(['if','else','for','while','do','switch','case','break','continue','return','try','catch','finally','throw','yield']);

const PY_KW = new Set([
  'import','from','as','def','class','return','if','elif','else','for',
  'while','in','not','and','or','is','None','True','False','with','try',
  'except','finally','raise','pass','break','continue','lambda','yield',
  'global','nonlocal','del','assert','async','await','print','self',
]);

const DART_KW = new Set([
  'import','export','library','part','class','extends','implements','with',
  'mixin','abstract','const','final','var','dynamic','void','return','if',
  'else','for','while','do','switch','case','break','continue','new','this',
  'super','null','true','false','async','await','try','catch','finally',
  'throw','rethrow','get','set','static','late','required','factory','enum',
]);

const CSS_KW = new Set([
  'display','flex','position','color','background','margin','padding',
  'width','height','font','border','overflow','transform','transition',
  'animation','grid','absolute','relative','fixed','sticky','block','inline',
]);

const GO_KW = new Set([
  'package','import','func','var','const','type','struct','interface','map',
  'chan','go','defer','select','return','if','else','for','range','switch',
  'case','break','continue','fallthrough','goto','default','nil','true','false',
  'error','string','int','int8','int16','int32','int64','uint','uint8','uint16',
  'uint32','uint64','float32','float64','complex64','complex128','byte','rune','bool',
  'make','new','len','cap','append','copy','delete','close','panic','recover','print','println',
]);
const GO_CTRL = new Set(['if','else','for','range','switch','case','return','break','continue','defer','go','select']);

const RUBY_KW = new Set([
  'def','end','class','module','do','begin','rescue','ensure','return','if',
  'elsif','else','unless','case','when','while','until','for','in','break',
  'next','nil','true','false','self','super','yield','and','or','not','then',
  'require','require_relative','include','extend','attr_accessor','attr_reader',
  'attr_writer','puts','print','p','raise','new','initialize','private','public','protected',
]);
const RUBY_CTRL = new Set(['if','elsif','else','unless','case','when','while','until','for','return','rescue','break','next']);

const PHP_KW = new Set([
  'echo','print','return','if','elseif','else','while','for','foreach','do',
  'switch','case','break','continue','function','class','interface','trait',
  'extends','implements','new','null','true','false','this','self','parent',
  'public','private','protected','static','abstract','final','namespace','use',
  'require','include','require_once','include_once','array','list','isset','unset',
  'empty','die','exit','try','catch','finally','throw','yield','match','fn',
]);
const PHP_CTRL = new Set(['if','elseif','else','while','for','foreach','switch','case','return','try','catch','break','continue']);

const RUST_KW = new Set([
  'fn','let','mut','const','static','struct','enum','trait','impl','use','mod',
  'pub','crate','super','self','Self','return','if','else','match','loop','for',
  'while','break','continue','in','as','where','type','async','await','move',
  'ref','Box','Vec','String','Option','Result','Some','None','Ok','Err',
  'true','false','i8','i16','i32','i64','i128','u8','u16','u32','u64','u128',
  'f32','f64','bool','char','str','usize','isize','println','print','panic','todo','unimplemented',
]);
const RUST_CTRL = new Set(['if','else','match','loop','for','while','return','break','continue','async','await']);

const YAML_KW = new Set(['true','false','null','yes','no','on','off']);

function getKeywords(lang: string): { kw: Set<string>; ctrl: Set<string> } {
  if (lang === 'py')   return { kw: PY_KW,   ctrl: new Set(['if','elif','else','for','while','try','except','finally','return','with']) };
  if (lang === 'dart') return { kw: DART_KW,  ctrl: new Set(['if','else','for','while','try','catch','finally','return','switch','case']) };
  if (lang === 'go')   return { kw: GO_KW,    ctrl: GO_CTRL };
  if (lang === 'rb')   return { kw: RUBY_KW,  ctrl: RUBY_CTRL };
  if (lang === 'php')  return { kw: PHP_KW,   ctrl: PHP_CTRL };
  if (lang === 'rs')   return { kw: RUST_KW,  ctrl: RUST_CTRL };
  if (lang === 'yaml') return { kw: YAML_KW,  ctrl: new Set() };
  return { kw: JS_KW, ctrl: JS_CTRL };
}

function tokenizeLine(
  line: string,
  lang: string,
  inMLC: boolean,   // in multi-line comment
  inMLS: boolean,   // in multi-line string (template literal)
): { tokens: Token[]; inMLC: boolean; inMLS: boolean } {
  const tokens: Token[] = [];
  let i = 0;
  const n = line.length;
  const { kw, ctrl } = getKeywords(lang);

  const push = (text: string, color: string) => {
    if (!text) return;
    if (tokens.length && tokens[tokens.length - 1].color === color) {
      tokens[tokens.length - 1].text += text;
    } else {
      tokens.push({ text, color });
    }
  };

  // Continue a multi-line comment
  if (inMLC) {
    const end = line.indexOf('*/');
    if (end === -1) {
      push(line, C.comment);
      return { tokens, inMLC: true, inMLS };
    }
    push(line.slice(0, end + 2), C.comment);
    i = end + 2;
    inMLC = false;
  }

  // Continue a template literal
  if (inMLS) {
    const end = line.indexOf('`', i);
    if (end === -1) {
      push(line.slice(i), C.string);
      return { tokens, inMLC, inMLS: true };
    }
    push(line.slice(i, end + 1), C.string);
    i = end + 1;
    inMLS = false;
  }

  while (i < n) {
    const ch = line[i];

    // Single-line comments
    if (ch === '/' && line[i + 1] === '/') {
      push(line.slice(i), C.comment);
      return { tokens, inMLC, inMLS };
    }
    if (ch === '#' && (lang === 'py' || lang === 'env')) {
      push(line.slice(i), C.comment);
      return { tokens, inMLC, inMLS };
    }

    // Multi-line comment start
    if (ch === '/' && line[i + 1] === '*') {
      const end = line.indexOf('*/', i + 2);
      if (end === -1) {
        push(line.slice(i), C.comment);
        return { tokens, inMLC: true, inMLS };
      }
      push(line.slice(i, end + 2), C.comment);
      i = end + 2;
      continue;
    }

    // Template literal
    if (ch === '`') {
      const end = line.indexOf('`', i + 1);
      if (end === -1) {
        push(line.slice(i), C.string);
        return { tokens, inMLC, inMLS: true };
      }
      push(line.slice(i, end + 1), C.string);
      i = end + 1;
      continue;
    }

    // Strings
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n) {
        if (line[j] === '\\') { j += 2; continue; }
        if (line[j] === ch) { j++; break; }
        j++;
      }
      push(line.slice(i, j), C.string);
      i = j;
      continue;
    }

    // HTML/JSX strings in attributes
    if (lang === 'html' && ch === '"') {
      let j = i + 1;
      while (j < n && line[j] !== '"') j++;
      push(line.slice(i, j + 1), C.string);
      i = j + 1;
      continue;
    }

    // Numbers
    if (ch >= '0' && ch <= '9') {
      let j = i;
      while (j < n && (line[j] >= '0' && line[j] <= '9' || line[j] === '.' || line[j] === 'x' || line[j] === 'X' || (line[j] >= 'a' && line[j] <= 'f') || (line[j] >= 'A' && line[j] <= 'F'))) j++;
      push(line.slice(i, j), C.number);
      i = j;
      continue;
    }

    // Decorators / annotations
    if (ch === '@') {
      let j = i + 1;
      while (j < n && /\w/.test(line[j])) j++;
      push(line.slice(i, j), C.decorator);
      i = j;
      continue;
    }

    // HTML/JSX tags: < TagName or </TagName or <tag
    if (lang === 'html' || lang === 'ts' || lang === 'js') {
      if (ch === '<') {
        // Closing or opening tag
        let j = i + 1;
        if (line[j] === '/') j++;
        const start = j;
        while (j < n && /[\w.-]/.test(line[j])) j++;
        if (j > start) {
          push('<' + (line[i + 1] === '/' ? '/' : ''), C.jsxTag);
          push(line.slice(start, j), line[start] >= 'A' && line[start] <= 'Z' ? C.type : C.jsxTag);
          i = j;
          continue;
        }
      }
      if (ch === '>' || (ch === '/' && line[i + 1] === '>')) {
        push(ch === '>' ? '>' : '/>', C.jsxTag);
        i += ch === '>' ? 1 : 2;
        continue;
      }
    }

    // CSS properties
    if (lang === 'css') {
      if (/[a-z-]/.test(ch)) {
        let j = i;
        while (j < n && /[a-z0-9-]/.test(line[j])) j++;
        const word = line.slice(i, j);
        if (line[j] === ':') {
          push(word, C.prop);
        } else if (CSS_KW.has(word)) {
          push(word, C.keyword);
        } else {
          push(word, C.plain);
        }
        i = j;
        continue;
      }
    }

    // Identifiers and keywords
    if (/[a-zA-Z_$]/.test(ch)) {
      let j = i;
      while (j < n && /[\w$]/.test(line[j])) j++;
      const word = line.slice(i, j);

      // Skip whitespace to check next char
      let k = j;
      while (k < n && line[k] === ' ') k++;
      const nextCh = line[k];

      if (kw.has(word)) {
        push(word, ctrl.has(word) ? C.control : C.keyword);
      } else if (nextCh === '(') {
        push(word, C.func);
      } else if (word[0] >= 'A' && word[0] <= 'Z') {
        push(word, C.type);
      } else if (lang === 'py' && nextCh === ':') {
        push(word, C.prop);
      } else {
        push(word, C.plain);
      }
      i = j;
      continue;
    }

    // Operators and punctuation
    if (/[=+\-*/%<>&|!^~?:,;.[\](){}]/.test(ch)) {
      push(ch, C.punct);
      i++;
      continue;
    }

    push(ch, C.plain);
    i++;
  }

  return { tokens, inMLC, inMLS };
}

// JSON tokenizer (separate — JSON has unique structure)
function tokenizeJSON(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = line.length;
  const push = (text: string, color: string) => { if (text) tokens.push({ text, color }); };

  while (i < n) {
    const ch = line[i];
    // Whitespace
    if (ch === ' ' || ch === '\t') { push(ch, C.plain); i++; continue; }
    // String key or value
    if (ch === '"') {
      let j = i + 1;
      while (j < n) {
        if (line[j] === '\\') { j += 2; continue; }
        if (line[j] === '"') { j++; break; }
        j++;
      }
      const str = line.slice(i, j);
      // Key: string followed by colon
      let k = j; while (k < n && line[k] === ' ') k++;
      push(str, line[k] === ':' ? C.prop : C.string);
      i = j;
      continue;
    }
    // Numbers
    if ((ch >= '0' && ch <= '9') || ch === '-') {
      let j = i + (ch === '-' ? 1 : 0);
      while (j < n && (line[j] >= '0' && line[j] <= '9' || line[j] === '.')) j++;
      push(line.slice(i, j), C.number);
      i = j;
      continue;
    }
    // Booleans / null
    for (const kw of ['true','false','null']) {
      if (line.startsWith(kw, i)) { push(kw, C.keyword); i += kw.length; break; }
      if (line.startsWith(kw, i)) break;
    }
    if (line.startsWith('true', i)) { push('true', C.keyword); i += 4; continue; }
    if (line.startsWith('false', i)) { push('false', C.keyword); i += 5; continue; }
    if (line.startsWith('null', i)) { push('null', C.keyword); i += 4; continue; }
    // Punctuation
    push(ch, C.punct);
    i++;
  }
  return tokens;
}

// Markdown tokenizer
function tokenizeMD(line: string): Token[] {
  if (!line.trim()) return [{ text: line, color: C.plain }];
  if (/^#{1,6}\s/.test(line)) return [{ text: line, color: '#569cd6' }];
  if (/^[-*+]\s/.test(line) || /^\d+\.\s/.test(line)) {
    return [{ text: line.slice(0, 2), color: C.keyword }, { text: line.slice(2), color: C.plain }];
  }
  if (/^>/.test(line)) return [{ text: line, color: C.comment }];
  if (/^```/.test(line)) return [{ text: line, color: C.type }];
  if (/^---/.test(line)) return [{ text: line, color: C.comment }];
  // Inline: bold, italic, code
  const tokens: Token[] = [];
  let i = 0; const n = line.length;
  while (i < n) {
    if (line[i] === '`') {
      let j = i + 1; while (j < n && line[j] !== '`') j++;
      tokens.push({ text: line.slice(i, j + 1), color: C.string }); i = j + 1; continue;
    }
    if (line[i] === '*' && line[i+1] === '*') {
      let j = i + 2; while (j < n - 1 && !(line[j] === '*' && line[j+1] === '*')) j++;
      tokens.push({ text: line.slice(i, j + 2), color: '#fff' }); i = j + 2; continue;
    }
    if (line[i] === '[') {
      let j = i + 1; while (j < n && line[j] !== ']') j++;
      tokens.push({ text: line.slice(i, j + 1), color: C.func }); i = j + 1;
      if (line[i] === '(') {
        let k = i + 1; while (k < n && line[k] !== ')') k++;
        tokens.push({ text: line.slice(i, k + 1), color: C.string }); i = k + 1;
      }
      continue;
    }
    tokens.push({ text: line[i], color: C.plain }); i++;
  }
  return tokens;
}

// YAML tokenizer
function tokenizeYAML(line: string): Token[] {
  const trimmed = line.trim();
  if (trimmed.startsWith('#')) return [{ text: line, color: C.comment }];
  if (trimmed.startsWith('-')) {
    const rest = trimmed.slice(1).trim();
    return [{ text: line.slice(0, line.indexOf('-') + 1), color: C.keyword }, { text: ' ' + rest, color: C.string }];
  }
  const colonIdx = line.indexOf(':');
  if (colonIdx > 0) {
    const key = line.slice(0, colonIdx);
    const val = line.slice(colonIdx);
    const valColor = ['true','false','null','yes','no','on','off'].some(k => val.trim().slice(1).trim() === k)
      ? C.keyword : val.trim().slice(1).trim().match(/^\d/) ? C.number : C.string;
    return [{ text: key, color: C.prop }, { text: val, color: valColor }];
  }
  return [{ text: line, color: C.plain }];
}

// TOML tokenizer
function tokenizeTOML(line: string): Token[] {
  if (line.startsWith('#')) return [{ text: line, color: C.comment }];
  if (line.startsWith('[')) return [{ text: line, color: C.type }];
  const eqIdx = line.indexOf('=');
  if (eqIdx > 0) {
    return [
      { text: line.slice(0, eqIdx), color: C.prop },
      { text: ' =', color: C.punct },
      { text: line.slice(eqIdx + 1), color: C.string },
    ];
  }
  return [{ text: line, color: C.plain }];
}

// Shell tokenizer
function tokenizeSH(line: string): Token[] {
  if (line.trimStart().startsWith('#')) return [{ text: line, color: C.comment }];
  const SH_KW = new Set(['if','then','else','elif','fi','for','do','done','while','until','case','esac','function','return','echo','export','source','cd','ls','rm','mv','cp','mkdir','chmod','grep','sed','awk','cat','tail','head','curl','wget','sudo','apt','brew','git','docker','npm','bun','node','python3']);
  const tokens: Token[] = [];
  let i = 0; const n = line.length;
  while (i < n) {
    const ch = line[i];
    if (ch === '#') { tokens.push({ text: line.slice(i), color: C.comment }); break; }
    if (ch === '"' || ch === "'") {
      let j = i + 1; while (j < n && line[j] !== ch) j++;
      tokens.push({ text: line.slice(i, j + 1), color: C.string }); i = j + 1; continue;
    }
    if (ch === '$') {
      let j = i + 1; while (j < n && /[\w{]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), color: C.type }); i = j; continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i; while (j < n && /[\w-]/.test(line[j])) j++;
      const word = line.slice(i, j);
      tokens.push({ text: word, color: SH_KW.has(word) ? C.keyword : line[j] === '(' ? C.func : C.plain }); i = j; continue;
    }
    tokens.push({ text: ch, color: /[|&;><]/.test(ch) ? C.control : C.plain }); i++;
  }
  return tokens;
}

// SQL tokenizer
function tokenizeSQL(line: string): Token[] {
  const SQL_KW = new Set(['SELECT','FROM','WHERE','JOIN','LEFT','RIGHT','INNER','OUTER','ON','INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','TABLE','DROP','ALTER','ADD','COLUMN','PRIMARY','KEY','FOREIGN','REFERENCES','INDEX','UNIQUE','NOT','NULL','AND','OR','IN','IS','LIKE','ORDER','BY','GROUP','HAVING','LIMIT','OFFSET','AS','DISTINCT','COUNT','SUM','AVG','MIN','MAX','UNION','ALL','EXISTS']);
  const tokens: Token[] = [];
  let i = 0; const n = line.length;
  while (i < n) {
    const ch = line[i];
    if (ch === '-' && line[i+1] === '-') { tokens.push({ text: line.slice(i), color: C.comment }); break; }
    if (ch === "'" ) {
      let j = i + 1; while (j < n && line[j] !== "'") j++;
      tokens.push({ text: line.slice(i, j + 1), color: C.string }); i = j + 1; continue;
    }
    if (ch >= '0' && ch <= '9') {
      let j = i; while (j < n && (line[j] >= '0' && line[j] <= '9' || line[j] === '.')) j++;
      tokens.push({ text: line.slice(i, j), color: C.number }); i = j; continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i; while (j < n && /[\w]/.test(line[j])) j++;
      const word = line.slice(i, j);
      tokens.push({ text: word, color: SQL_KW.has(word.toUpperCase()) ? C.keyword : C.plain }); i = j; continue;
    }
    tokens.push({ text: ch, color: C.punct }); i++;
  }
  return tokens;
}

function tokenizeCode(code: string, lang: string): Token[][] {
  const lines = code.split('\n');

  // Dedicated tokenizers for specific formats
  if (lang === 'json')  return lines.map(tokenizeJSON);
  if (lang === 'md')    return lines.map(tokenizeMD);
  if (lang === 'yaml')  return lines.map(tokenizeYAML);
  if (lang === 'toml')  return lines.map(tokenizeTOML);
  if (lang === 'sh')    return lines.map(tokenizeSH);
  if (lang === 'sql')   return lines.map(tokenizeSQL);
  if (lang === 'text')  return lines.map(l => [{ text: l, color: C.plain }]);

  // General tokenizer (JS, TS, PY, DART, GO, RB, PHP, RS, CSS, HTML…)
  const result: Token[][] = [];
  let inMLC = false;
  let inMLS = false;
  for (const line of lines) {
    const out = tokenizeLine(line, lang, inMLC, inMLS);
    result.push(out.tokens);
    inMLC = out.inMLC;
    inMLS = out.inMLS;
  }
  return result;
}

// ─── Language detection ─────────────────────────────────────────────────────

const getLanguage = (filePath: string): string => {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const name = filePath.split('/').pop()?.toLowerCase() || '';
  if (name.startsWith('.env') || name.includes('env')) return 'env';
  const map: Record<string, string> = {
    js: 'js', jsx: 'js', ts: 'ts', tsx: 'ts',
    py: 'py', json: 'json', html: 'html', css: 'css',
    dart: 'dart', scss: 'css', less: 'css', sass: 'css',
    go: 'go', rb: 'rb', php: 'php', rs: 'rs',
    yaml: 'yaml', yml: 'yaml', toml: 'toml',
    md: 'md', markdown: 'md',
    sh: 'sh', bash: 'sh', zsh: 'sh',
    sql: 'sql',
  };
  return map[ext] || 'text';
};

const getFileIcon = (filename: string): { icon: string; color: string } => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const name = filename.toLowerCase();
  if (name.includes('env')) return { icon: 'key', color: '#FFB800' };
  const icons: Record<string, { icon: string; color: string }> = {
    js:   { icon: 'logo-javascript', color: '#F7DF1E' },
    jsx:  { icon: 'logo-react',      color: '#61DAFB' },
    ts:   { icon: 'code-slash',      color: '#3178C6' },
    tsx:  { icon: 'logo-react',      color: '#3178C6' },
    py:   { icon: 'logo-python',     color: '#3776AB' },
    html: { icon: 'logo-html5',      color: '#E34F26' },
    css:  { icon: 'logo-css3',       color: '#1572B6' },
    json: { icon: 'code-working',    color: '#FFB800' },
    dart: { icon: 'code-slash',      color: '#54C5F8' },
    go:   { icon: 'code-slash',      color: '#00ACD7' },
    rs:   { icon: 'code-slash',      color: '#DEA584' },
    rb:   { icon: 'code-slash',      color: '#CC342D' },
    php:  { icon: 'code-slash',      color: '#8892BF' },
    md:   { icon: 'document-text',   color: '#888' },
  };
  return icons[ext] || { icon: 'document', color: '#888' };
};

// ─── Highlighted line component ─────────────────────────────────────────────

const HighlightedLine = React.memo(({ tokens }: { tokens: Token[] }) => (
  <Text style={styles.codeLine}>
    {tokens.length === 0
      ? ' '
      : tokens.map((t, i) => (
          <Text key={i} style={{ color: t.color }}>{t.text}</Text>
        ))
    }
  </Text>
));

// ─── Main component ─────────────────────────────────────────────────────────

const SIDEBAR_WIDTH = 44;
const LINE_H = 20;
const FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

export const FileViewer = ({ visible, filePath, projectId, repositoryUrl, onClose, refreshKey }: Props) => {
  const { t } = useTranslation(['terminal', 'common']);
  const insets = useSafeAreaInsets();
  const { isSidebarHidden } = useSidebarOffset();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEdited, setIsEdited] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);

  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const language = useMemo(() => getLanguage(filePath), [filePath]);
  const lines = useMemo(() => content.split('\n'), [content]);

  const { suggestions, applySuggestion } = useAutocomplete({
    content,
    cursorPosition: cursorPos,
    language,
    isEditing,
  });

  const handleSuggestionSelect = useCallback((suggestion: Suggestion) => {
    const { newContent, newCursorPosition } = applySuggestion(suggestion);
    setContent(newContent);
    setIsEdited(newContent !== originalContent);
    setSelection({ start: newCursorPosition, end: newCursorPosition });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [applySuggestion, originalContent]);
  const fileName = filePath.split('/').pop() || filePath;
  const { icon, color: iconColor } = getFileIcon(fileName);

  // Tokenize only when not editing (avoid per-keystroke tokenization)
  const tokenizedLines = useMemo(() => {
    if (isEditing) return null;
    return tokenizeCode(content, language);
  }, [content, language, isEditing]);

  useEffect(() => {
    if (visible && filePath && !isEditing) loadFile();
  }, [visible, filePath, refreshKey, activeTabId]);

  const loadFile = async () => {
    try {
      setLoading(true);
      setError(null);
      const fileContent = await workstationService.getFileContent(projectId, filePath, repositoryUrl);
      setContent(fileContent);
      setOriginalContent(fileContent);
      setIsEdited(false);
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message || t('common:unableToLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await workstationService.saveFileContent(projectId, filePath, content, repositoryUrl);
      useFileCacheStore.getState().clearCache(projectId);
      setOriginalContent(content);
      setIsEdited(false);
      Alert.alert(t('common:saved'), t('terminal:fileViewer.savedSuccess'));
    } catch (err: any) {
      Alert.alert(t('common:error'), err.message || t('common:unableToSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleTapCode = useCallback(() => {
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleEditBlur = useCallback(() => {
    setIsEditing(false);
  }, []);

  const searchResults = useMemo(() => {
    if (!searchQuery) return [];
    return lines.map((line, i) =>
      line.toLowerCase().includes(searchQuery.toLowerCase()) ? i : -1
    ).filter(i => i >= 0);
  }, [searchQuery, lines]);

  if (!visible) return null;

  const sidebarPadding = isSidebarHidden ? 0 : SIDEBAR_WIDTH;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 32, paddingLeft: sidebarPadding }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.fileTab}>
          <Ionicons name={icon as any} size={14} color={iconColor} />
          <Text style={styles.fileName} numberOfLines={1}>{fileName}</Text>
          {isEdited && <View style={styles.dot} />}
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setShowSearch(s => !s)} style={styles.actionBtn}>
            <Ionicons name="search-outline" size={18} color={showSearch ? '#fff' : 'rgba(255,255,255,0.5)'} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSave}
            disabled={!isEdited || saving}
            style={[styles.saveBtn, (!isEdited || saving) && styles.saveBtnOff]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={14} color="#fff" />
                <Text style={styles.saveBtnText}>{t('common:save')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      {showSearch && (
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('common:searchPlaceholder')}
            placeholderTextColor="#666"
            autoFocus
          />
          {searchResults.length > 0 && (
            <Text style={styles.searchCount}>{t('terminal:fileViewer.searchFound', { count: searchResults.length })}</Text>
          )}
          <TouchableOpacity onPress={() => { setShowSearch(false); setSearchQuery(''); }}>
            <Ionicons name="close" size={20} color="#666" />
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={AppColors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle" size={48} color="#f44" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadFile} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t('common:retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.editor}
          showsVerticalScrollIndicator
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.editorRow}>
              {/* Line numbers */}
              <View style={styles.lineNumbers}>
                {lines.map((_, idx) => (
                  <Text key={idx} style={styles.lineNum}>{idx + 1}</Text>
                ))}
              </View>

              {/* Code area */}
              <View style={styles.codeArea}>
                {isEditing ? (
                  <TextInput
                    ref={inputRef}
                    style={styles.codeInput}
                    value={content}
                    selection={selection}
                    onSelectionChange={(e) => {
                      setCursorPos(e.nativeEvent.selection.start);
                      if (selection !== undefined) setSelection(undefined);
                    }}
                    onChangeText={(text) => {
                      setContent(text);
                      setIsEdited(text !== originalContent);
                    }}
                    onBlur={handleEditBlur}
                    multiline
                    autoCorrect={false}
                    autoCapitalize="none"
                    spellCheck={false}
                    scrollEnabled={false}
                    textAlignVertical="top"
                  />
                ) : (
                  <TouchableOpacity
                    onPress={handleTapCode}
                    activeOpacity={1}
                    style={styles.highlightedArea}
                  >
                    {tokenizedLines && tokenizedLines.map((tokens, idx) => {
                      const isHighlighted = searchQuery && lines[idx]?.toLowerCase().includes(searchQuery.toLowerCase());
                      return (
                        <View key={idx} style={[styles.highlightedLineWrapper, isHighlighted && styles.searchHighlight]}>
                          <HighlightedLine tokens={tokens} />
                        </View>
                      );
                    })}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </ScrollView>
        </ScrollView>
      )}

      {/* Autocomplete suggestions */}
      {isEditing && suggestions.length > 0 && (
        <AutocompleteBar suggestions={suggestions} onSelect={handleSuggestionSelect} />
      )}

      {/* Footer */}
      {!loading && !error && (
        <View style={[styles.footer, { marginLeft: -sidebarPadding, paddingRight: Math.max(12, insets.right + 12) }]}>
          <Text style={[styles.footerText, { marginLeft: sidebarPadding }]}>{language.toUpperCase()}</Text>
          <Text style={styles.footerText}>{lines.length} lines</Text>
          {isEditing && <Text style={[styles.footerText, { color: '#569cd6' }]}>{t('terminal:fileViewer.editing')}</Text>}
          {isEdited && !isEditing && <Text style={styles.footerMod}>{t('common:modified')}</Text>}
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.dark.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  fileTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#e0e0e0',
    maxWidth: 160,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffc107',
    marginLeft: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    padding: 5,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: AppColors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  saveBtnOff: {
    opacity: 0.35,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  searchCount: {
    color: '#888',
    fontSize: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#f44',
    marginTop: 10,
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: AppColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  editor: {
    flex: 1,
  },
  editorRow: {
    flexDirection: 'row',
    paddingVertical: 8,
  },
  lineNumbers: {
    paddingRight: 4,
    paddingLeft: 8,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
    alignItems: 'flex-end',
  },
  lineNum: {
    height: LINE_H,
    fontSize: 12,
    lineHeight: LINE_H,
    fontFamily: FONT,
    color: '#4a4a4a',
    textAlign: 'right',
    minWidth: 24,
  },
  codeArea: {
    minWidth: Dimensions.get('window').width - 60,
  },
  codeInput: {
    minWidth: Dimensions.get('window').width - 60,
    fontSize: 13,
    lineHeight: LINE_H,
    fontFamily: FONT,
    color: '#d4d4d4',
    paddingHorizontal: 10,
    paddingTop: 0,
    paddingBottom: 20,
    textAlignVertical: 'top',
  },
  highlightedArea: {
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  highlightedLineWrapper: {
    minHeight: LINE_H,
  },
  searchHighlight: {
    backgroundColor: 'rgba(255, 200, 0, 0.15)',
  },
  codeLine: {
    fontSize: 13,
    lineHeight: LINE_H,
    fontFamily: FONT,
    width: 2000,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: AppColors.dark.background,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  footerText: {
    fontSize: 11,
    color: '#fff',
  },
  footerMod: {
    fontSize: 11,
    color: '#ffc107',
    fontWeight: '600',
  },
});
