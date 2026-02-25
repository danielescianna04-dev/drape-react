import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AUTOCOMPLETE_KEYWORDS, SNIPPETS, DOT_COMPLETIONS } from '../data/languageKeywords';
import type { Snippet } from '../data/languageKeywords';

// ─── Types ──────────────────────────────────────────────
export interface Suggestion {
  text: string;
  type: 'keyword' | 'snippet' | 'variable' | 'method';
  body?: string; // snippet body with $CURSOR
}

interface UseAutocompleteParams {
  content: string;
  cursorPosition: number;
  language: string;
  isEditing: boolean;
}

interface UseAutocompleteReturn {
  suggestions: Suggestion[];
  applySuggestion: (suggestion: Suggestion) => { newContent: string; newCursorPosition: number };
}

// ─── Constants ──────────────────────────────────────────
const IDENTIFIER_REGEX = /\b[a-zA-Z_$][a-zA-Z0-9_$]{2,}\b/g;
const MIN_PREFIX_LENGTH = 1;
const MAX_SUGGESTIONS = 6;
const DEBOUNCE_MS = 300;
const FREQ_STORAGE_KEY = 'autocomplete_freq';
const FREQ_PERSIST_MS = 5000;

// ─── Helpers ────────────────────────────────────────────

interface WordInfo {
  word: string;
  start: number;
  objectName?: string; // e.g. "console" for "console.lo|"
  methodPrefix?: string; // e.g. "lo" for "console.lo|"
  isDot: boolean;
}

function getCurrentWord(content: string, cursor: number): WordInfo {
  let end = cursor;
  let start = cursor;

  // Scan backward for word chars
  while (start > 0 && /[\w$]/.test(content[start - 1])) {
    start--;
  }
  const word = content.slice(start, end);

  // Check for dot-trigger: is there a `.` right before the word start?
  if (start > 0 && content[start - 1] === '.') {
    let objEnd = start - 1; // position of the dot
    let objStart = objEnd;
    // Scan backward for the object name (may include dots like os.path)
    while (objStart > 0 && /[\w$.]/.test(content[objStart - 1])) {
      objStart--;
    }
    const objectName = content.slice(objStart, objEnd);
    if (objectName.length > 0) {
      return {
        word,
        start,
        objectName,
        methodPrefix: word,
        isDot: true,
      };
    }
  }

  // Also handle case where cursor is right after a dot with no prefix yet: "console.|"
  if (word.length === 0 && cursor > 0 && content[cursor - 1] === '.') {
    let objEnd = cursor - 1;
    let objStart = objEnd;
    while (objStart > 0 && /[\w$.]/.test(content[objStart - 1])) {
      objStart--;
    }
    const objectName = content.slice(objStart, objEnd);
    if (objectName.length > 0) {
      return {
        word: '',
        start: cursor,
        objectName,
        methodPrefix: '',
        isDot: true,
      };
    }
  }

  return { word, start, isDot: false };
}

function extractIdentifiers(content: string): Set<string> {
  const ids = new Set<string>();
  const regex = new RegExp(IDENTIFIER_REGEX.source, 'g');
  let match;
  while ((match = regex.exec(content)) !== null) {
    ids.add(match[0]);
  }
  return ids;
}

function detectContext(content: string, cursor: number, language: string): string {
  if (language !== 'html') return language;
  const before = content.slice(0, cursor);
  const lastStyleOpen = before.lastIndexOf('<style');
  const lastStyleClose = before.lastIndexOf('</style>');
  if (lastStyleOpen > lastStyleClose) return 'css';
  const lastScriptOpen = before.lastIndexOf('<script');
  const lastScriptClose = before.lastIndexOf('</script>');
  if (lastScriptOpen > lastScriptClose) return 'js';
  return 'html';
}

function fuzzyMatch(input: string, target: string): number {
  const inputLower = input.toLowerCase();
  const targetLower = target.toLowerCase();
  let inputIdx = 0;
  let score = 0;
  let consecutive = 0;
  for (let i = 0; i < targetLower.length && inputIdx < inputLower.length; i++) {
    if (targetLower[i] === inputLower[inputIdx]) {
      inputIdx++;
      consecutive++;
      score += consecutive;
    } else {
      consecutive = 0;
    }
  }
  return inputIdx === inputLower.length ? score : 0;
}

// ─── Hook ───────────────────────────────────────────────
export function useAutocomplete({
  content,
  cursorPosition,
  language,
  isEditing,
}: UseAutocompleteParams): UseAutocompleteReturn {
  const identifiersRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [identifiersVersion, setIdentifiersVersion] = useState(0);

  // Frequency tracking
  const freqRef = useRef<Map<string, number>>(new Map());
  const freqLoadedRef = useRef(false);
  const freqDirtyRef = useRef(false);
  const freqTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load frequency data on mount
  useEffect(() => {
    AsyncStorage.getItem(FREQ_STORAGE_KEY).then(data => {
      if (data) {
        try {
          const parsed = JSON.parse(data) as Record<string, number>;
          freqRef.current = new Map(Object.entries(parsed));
        } catch {}
      }
      freqLoadedRef.current = true;
    });
    return () => {
      if (freqTimerRef.current) clearTimeout(freqTimerRef.current);
    };
  }, []);

  const persistFrequency = useCallback(() => {
    if (!freqDirtyRef.current) return;
    freqDirtyRef.current = false;
    const obj: Record<string, number> = {};
    freqRef.current.forEach((v, k) => { obj[k] = v; });
    AsyncStorage.setItem(FREQ_STORAGE_KEY, JSON.stringify(obj));
  }, []);

  const bumpFrequency = useCallback((text: string) => {
    freqRef.current.set(text, (freqRef.current.get(text) || 0) + 1);
    freqDirtyRef.current = true;
    if (freqTimerRef.current) clearTimeout(freqTimerRef.current);
    freqTimerRef.current = setTimeout(persistFrequency, FREQ_PERSIST_MS);
  }, [persistFrequency]);

  // Extract identifiers on entering edit mode
  useEffect(() => {
    if (isEditing) {
      identifiersRef.current = extractIdentifiers(content);
      setIdentifiersVersion(v => v + 1);
    }
  }, [isEditing]);

  // Debounced re-extraction while editing
  useEffect(() => {
    if (!isEditing) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      identifiersRef.current = extractIdentifiers(content);
      setIdentifiersVersion(v => v + 1);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [content, isEditing]);

  // Context-aware language (HTML → CSS inside <style>, JS inside <script>)
  const effectiveLang = useMemo(
    () => (isEditing ? detectContext(content, cursorPosition, language) : language),
    [content, cursorPosition, language, isEditing],
  );

  const keywords = useMemo(() => AUTOCOMPLETE_KEYWORDS[effectiveLang] || [], [effectiveLang]);

  const langSnippets = useMemo(
    () => SNIPPETS.filter(s => s.lang.includes(effectiveLang)),
    [effectiveLang],
  );

  const dotMap = useMemo(
    () => DOT_COMPLETIONS[effectiveLang] || {},
    [effectiveLang],
  );

  // Current word info
  const wordInfo = useMemo(
    () => (isEditing ? getCurrentWord(content, cursorPosition) : { word: '', start: 0, isDot: false } as WordInfo),
    [content, cursorPosition, isEditing],
  );

  // Compute suggestions
  const suggestions = useMemo(() => {
    if (!isEditing) return [];

    const { word, isDot, objectName, methodPrefix } = wordInfo;

    // ── Dot-trigger mode ──
    if (isDot && objectName) {
      const prefix = (methodPrefix || '').toLowerCase();
      const seen = new Set<string>();
      const result: Suggestion[] = [];

      // Look up exact object name
      const methods = dotMap[objectName];
      if (methods) {
        for (const m of methods) {
          if (result.length >= MAX_SUGGESTIONS) break;
          const mLower = m.toLowerCase();
          if (prefix.length === 0 || mLower.startsWith(prefix)) {
            if (mLower !== prefix && !seen.has(mLower)) {
              seen.add(mLower);
              result.push({ text: m, type: 'method' });
            }
          }
        }
      }

      // If no exact match or not enough results, try generic types
      if (result.length < MAX_SUGGESTIONS) {
        const generics = ['_array', '_string', '_promise', '_number', '_list', '_dict', '_str', '_set'];
        for (const g of generics) {
          if (result.length >= MAX_SUGGESTIONS) break;
          const gMethods = dotMap[g];
          if (!gMethods) continue;
          for (const m of gMethods) {
            if (result.length >= MAX_SUGGESTIONS) break;
            const mLower = m.toLowerCase();
            if (prefix.length === 0 || mLower.startsWith(prefix)) {
              if (mLower !== prefix && !seen.has(mLower)) {
                seen.add(mLower);
                result.push({ text: m, type: 'method' });
              }
            }
          }
        }
      }

      // Sort by frequency
      result.sort((a, b) => {
        const fa = freqRef.current.get(a.text) || 0;
        const fb = freqRef.current.get(b.text) || 0;
        return fb - fa;
      });

      return result.slice(0, MAX_SUGGESTIONS);
    }

    // ── Normal mode ──
    if (word.length < MIN_PREFIX_LENGTH) return [];

    const prefix = word.toLowerCase();
    const seen = new Set<string>();
    const result: Suggestion[] = [];

    // Source 1: Snippets (highest priority — they're templates)
    for (const sn of langSnippets) {
      if (result.length >= MAX_SUGGESTIONS) break;
      const tLower = sn.trigger.toLowerCase();
      if (tLower.startsWith(prefix) && tLower !== prefix) {
        if (!seen.has(tLower)) {
          seen.add(tLower);
          result.push({ text: sn.label, type: 'snippet', body: sn.body });
        }
      }
    }

    // Source 2: Language keywords (prefix match)
    for (const kw of keywords) {
      if (result.length >= MAX_SUGGESTIONS) break;
      const kwLower = kw.toLowerCase();
      if (kwLower.startsWith(prefix) && kwLower !== prefix) {
        if (!seen.has(kwLower)) {
          seen.add(kwLower);
          result.push({ text: kw, type: 'keyword' });
        }
      }
    }

    // Source 3: Local identifiers (prefix match)
    if (result.length < MAX_SUGGESTIONS) {
      const sorted = [...identifiersRef.current]
        .filter(id => {
          const idLower = id.toLowerCase();
          return idLower.startsWith(prefix) && idLower !== prefix && !seen.has(idLower);
        })
        .sort((a, b) => a.length - b.length);

      for (const id of sorted) {
        if (result.length >= MAX_SUGGESTIONS) break;
        seen.add(id.toLowerCase());
        result.push({ text: id, type: 'variable' });
      }
    }

    // Source 4: Fuzzy matching on keywords + snippets (fill remaining slots)
    if (result.length < MAX_SUGGESTIONS && prefix.length >= 2) {
      const fuzzyResults: { suggestion: Suggestion; score: number }[] = [];

      for (const kw of keywords) {
        const kwLower = kw.toLowerCase();
        if (seen.has(kwLower)) continue;
        const score = fuzzyMatch(prefix, kwLower);
        if (score > 0) {
          fuzzyResults.push({ suggestion: { text: kw, type: 'keyword' }, score });
        }
      }

      for (const sn of langSnippets) {
        const tLower = sn.trigger.toLowerCase();
        if (seen.has(tLower)) continue;
        const score = fuzzyMatch(prefix, tLower);
        // Also try fuzzy against the label
        const labelScore = fuzzyMatch(prefix, sn.label.toLowerCase());
        const bestScore = Math.max(score, labelScore);
        if (bestScore > 0) {
          fuzzyResults.push({
            suggestion: { text: sn.label, type: 'snippet', body: sn.body },
            score: bestScore,
          });
        }
      }

      fuzzyResults.sort((a, b) => b.score - a.score);

      for (const { suggestion } of fuzzyResults) {
        if (result.length >= MAX_SUGGESTIONS) break;
        const key = suggestion.text.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          result.push(suggestion);
        }
      }
    }

    // Boost by frequency (stable sort — preserve prefix > fuzzy ordering)
    result.sort((a, b) => {
      const fa = freqRef.current.get(a.text) || 0;
      const fb = freqRef.current.get(b.text) || 0;
      if (fa !== fb) return fb - fa;
      return 0; // keep insertion order
    });

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, wordInfo, keywords, langSnippets, dotMap, identifiersVersion]);

  const applySuggestion = useCallback(
    (suggestion: Suggestion) => {
      const info = getCurrentWord(content, cursorPosition);

      // Track usage
      bumpFrequency(suggestion.text);

      // For dot-trigger, we replace only the method prefix part
      if (info.isDot) {
        const before = content.slice(0, info.start);
        const after = content.slice(cursorPosition);
        const newContent = before + suggestion.text + after;
        const newCursorPosition = info.start + suggestion.text.length;
        return { newContent, newCursorPosition };
      }

      // For snippets with body, insert the body and handle $CURSOR
      if (suggestion.body) {
        const before = content.slice(0, info.start);
        const after = content.slice(cursorPosition);
        const body = suggestion.body;
        const cursorMarker = '$CURSOR';
        const markerIdx = body.indexOf(cursorMarker);

        if (markerIdx >= 0) {
          const cleanBody = body.slice(0, markerIdx) + body.slice(markerIdx + cursorMarker.length);
          const newContent = before + cleanBody + after;
          const newCursorPosition = info.start + markerIdx;
          return { newContent, newCursorPosition };
        }

        const newContent = before + body + after;
        const newCursorPosition = info.start + body.length;
        return { newContent, newCursorPosition };
      }

      // For keywords/variables, replace the current word
      const before = content.slice(0, info.start);
      const after = content.slice(cursorPosition);
      const newContent = before + suggestion.text + after;
      const newCursorPosition = info.start + suggestion.text.length;
      return { newContent, newCursorPosition };
    },
    [content, cursorPosition, bumpFrequency],
  );

  return { suggestions, applySuggestion };
}
