import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Platform,
  InputAccessoryView,
  Keyboard,
} from 'react-native';
import { useTerminalPTY } from '../hooks/useTerminalPTY';
import { parseAnsiLines, type AnsiSegment } from '../utils/ansiParser';
import { TerminalAccessoryBar } from './TerminalAccessoryBar';

const FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const FONT_SIZE = 13;
const LINE_HEIGHT = 18;
const MAX_LINES = 5000;

interface TerminalSessionProps {
  projectId: string;
  sessionId: string;
  isActive: boolean;
  onExit?: () => void;
  onConnectionChange?: (connected: boolean) => void;
}

export const TerminalSession = React.memo(({
  projectId,
  sessionId,
  isActive,
  onExit,
  onConnectionChange,
}: TerminalSessionProps) => {
  const [lines, setLines] = useState<AnsiSegment[][]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const accessoryId = `terminal-accessory-${sessionId}`;
  // Buffer to accumulate incomplete output chunks before a newline arrives
  const partialLineRef = useRef('');

  const handleOutput = useCallback((data: string) => {
    // Prepend any leftover partial line from the previous chunk
    const raw = partialLineRef.current + data;

    // Split on newlines but keep the last segment (may be incomplete)
    const parts = raw.split('\n');
    partialLineRef.current = parts.pop() ?? '';

    if (parts.length === 0 && partialLineRef.current) {
      // No complete lines yet — render the partial for immediate feedback
      setLines(prev => {
        const parsed = parseAnsiLines(partialLineRef.current);
        if (prev.length === 0) return parsed;
        // Replace last line (likely partial from previous render)
        const updated = [...prev];
        if (parsed.length > 0) {
          updated[updated.length - 1] = parsed[0];
        }
        return updated.slice(-MAX_LINES);
      });
      return;
    }

    const newLines = parseAnsiLines(parts.join('\n'));
    setLines(prev => [...prev, ...newLines].slice(-MAX_LINES));
  }, []);

  const handleExit = useCallback(() => {
    onExit?.();
  }, [onExit]);

  const handleError = useCallback((msg: string) => {
    setLines(prev => [...prev, [{ text: `\n[Error] ${msg}`, style: { color: '#cd3131' } }]]);
  }, []);

  const { isConnected, isConnecting, connect, sendInput, resize } = useTerminalPTY({
    projectId,
    sessionId,
    onOutput: handleOutput,
    onExit: handleExit,
    onError: handleError,
  });

  // Notify parent of connection changes
  useEffect(() => {
    onConnectionChange?.(isConnected);
  }, [isConnected, onConnectionChange]);

  // Auto-connect when session becomes active
  useEffect(() => {
    if (isActive) {
      connect();
    }
  }, [isActive, connect]);

  // Auto-scroll to bottom on new output
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: false });
    }, 50);
    return () => clearTimeout(timer);
  }, [lines]);

  // Focus input when active
  useEffect(() => {
    if (isActive) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isActive]);

  const handleAccessoryKey = useCallback((data: string) => {
    sendInput(data);
  }, [sendInput]);

  const handleChangeText = useCallback((text: string) => {
    if (text) {
      sendInput(text);
    }
  }, [sendInput]);

  const handleSubmitEditing = useCallback(() => {
    sendInput('\r');
  }, [sendInput]);

  const handleKeyPress = useCallback((e: any) => {
    const { key } = e.nativeEvent;
    if (key === 'Backspace') {
      sendInput('\x7f');
    } else if (key === 'Enter') {
      sendInput('\r');
    }
  }, [sendInput]);

  const handleTapOutput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const renderLine = useCallback((segments: AnsiSegment[], index: number) => (
    <Text key={index} style={styles.line} selectable>
      {segments.map((seg, i) => (
        <Text key={i} style={[styles.text, seg.style]}>
          {seg.text}
        </Text>
      ))}
    </Text>
  ), []);

  return (
    <View style={styles.container}>
      {/* Terminal output */}
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onTouchEnd={handleTapOutput}
        keyboardShouldPersistTaps="always"
      >
        {isConnecting && (
          <Text style={styles.statusText}>Connecting...</Text>
        )}
        {!isConnected && !isConnecting && (
          <Text style={styles.statusText}>Disconnected. Tap to reconnect.</Text>
        )}
        {lines.map(renderLine)}
      </ScrollView>

      {/* Hidden input to capture keyboard */}
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value=""
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        keyboardType="ascii-capable"
        keyboardAppearance="dark"
        inputAccessoryViewID={accessoryId}
        onChangeText={handleChangeText}
        onKeyPress={handleKeyPress}
        onSubmitEditing={handleSubmitEditing}
        blurOnSubmit={false}
        caretHidden
        contextMenuHidden
      />

      {/* Accessory bar above keyboard */}
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={accessoryId}>
          <TerminalAccessoryBar onKeyPress={handleAccessoryKey} />
        </InputAccessoryView>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 20,
  },
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  text: {
    fontFamily: FONT,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    color: '#E0E0E0',
  },
  statusText: {
    fontFamily: FONT,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    color: '#6A6A82',
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  hiddenInput: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 1,
    height: 1,
    opacity: 0,
  },
});
