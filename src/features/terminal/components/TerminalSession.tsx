import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Platform,
  InputAccessoryView,
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
  const partialLineRef = useRef('');
  const onConnectionChangeRef = useRef(onConnectionChange);
  onConnectionChangeRef.current = onConnectionChange;

  const handleOutput = useCallback((data: string) => {
    const raw = partialLineRef.current + data;
    const parts = raw.split('\n');
    partialLineRef.current = parts.pop() ?? '';

    if (parts.length === 0 && partialLineRef.current) {
      setLines(prev => {
        const parsed = parseAnsiLines(partialLineRef.current);
        if (prev.length === 0) return parsed;
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

  const { isConnected, isConnecting, connect, sendInput } = useTerminalPTY({
    projectId,
    sessionId,
    onOutput: handleOutput,
    onExit: handleExit,
    onError: handleError,
  });

  // Notify parent of connection changes via ref to avoid re-render loops
  const prevConnectedRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevConnectedRef.current !== isConnected) {
      prevConnectedRef.current = isConnected;
      onConnectionChangeRef.current?.(isConnected);
    }
  }, [isConnected]);

  // Auto-connect once when session mounts as active
  const hasConnectedRef = useRef(false);
  useEffect(() => {
    if (isActive && !hasConnectedRef.current) {
      hasConnectedRef.current = true;
      connect();
    }
  }, [isActive, connect]);

  // Auto-scroll to bottom on new output
  const linesLenRef = useRef(0);
  useEffect(() => {
    if (lines.length !== linesLenRef.current) {
      linesLenRef.current = lines.length;
      const timer = setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: false });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [lines.length]);

  // Focus input when active
  useEffect(() => {
    if (isActive) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  const handleAccessoryKey = useCallback((data: string) => {
    sendInput(data);
  }, [sendInput]);

  // Use a ref to track input value to avoid controlled-input re-render loop
  const inputValueRef = useRef('');
  const handleChangeText = useCallback((text: string) => {
    // text contains the full new value; diff with previous to get typed char(s)
    const prev = inputValueRef.current;
    if (text.length > prev.length) {
      const typed = text.slice(prev.length);
      sendInput(typed);
    }
    // Reset to empty after processing to keep the input clean
    inputValueRef.current = '';
    // Use setTimeout to avoid setState during render cycle
    setTimeout(() => {
      inputRef.current?.setNativeProps?.({ text: '' });
    }, 0);
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

      {/* Hidden input to capture keyboard — uncontrolled to avoid re-render loops */}
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        keyboardType="ascii-capable"
        keyboardAppearance="dark"
        inputAccessoryViewID={accessoryId}
        onChangeText={handleChangeText}
        onKeyPress={handleKeyPress}
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
