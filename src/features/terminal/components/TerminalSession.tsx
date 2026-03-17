import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Platform,
  InputAccessoryView,
  TouchableOpacity,
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
  const [inputText, setInputText] = useState('');
  const [statusMsg, setStatusMsg] = useState('Initializing...');
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const accessoryId = `terminal-accessory-${sessionId}`;
  const partialLineRef = useRef('');
  const onConnectionChangeRef = useRef(onConnectionChange);
  onConnectionChangeRef.current = onConnectionChange;

  const handleOutput = useCallback((data: string) => {
    setStatusMsg('');
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
    setStatusMsg('Session ended.');
    onExit?.();
  }, [onExit]);

  const handleError = useCallback((msg: string) => {
    console.warn('[TerminalSession] Error:', msg);
    setStatusMsg(`Error: ${msg}`);
    setLines(prev => [...prev, [{ text: `[Error] ${msg}`, style: { color: '#cd3131' } }]]);
  }, []);

  const { isConnected, isConnecting, connect, sendInput } = useTerminalPTY({
    projectId,
    sessionId,
    onOutput: handleOutput,
    onExit: handleExit,
    onError: handleError,
  });

  // Update status based on connection state
  useEffect(() => {
    if (isConnecting) {
      setStatusMsg(`Connecting to ${projectId}...`);
    } else if (isConnected) {
      setStatusMsg('');
    } else if (!isConnecting && !isConnected) {
      setStatusMsg(prev => prev || 'Disconnected.');
    }
  }, [isConnecting, isConnected, projectId]);

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
      console.log('[TerminalSession] Auto-connecting, projectId:', projectId);
      connect();
    }
  }, [isActive, connect, projectId]);

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

  const handleAccessoryKey = useCallback((data: string) => {
    sendInput(data);
  }, [sendInput]);

  // Send command when user presses enter on the visible input
  const handleSubmit = useCallback(() => {
    if (inputText.trim()) {
      sendInput(inputText + '\r');
      setInputText('');
    } else {
      sendInput('\r');
    }
  }, [inputText, sendInput]);

  const handleReconnect = useCallback(() => {
    hasConnectedRef.current = false;
    setStatusMsg('Reconnecting...');
    connect();
    hasConnectedRef.current = true;
  }, [connect]);

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
        keyboardShouldPersistTaps="always"
      >
        {statusMsg ? (
          <View style={styles.statusRow}>
            <Text style={styles.statusText}>{statusMsg}</Text>
            {!isConnected && !isConnecting && (
              <TouchableOpacity onPress={handleReconnect} style={styles.reconnectBtn}>
                <Text style={styles.reconnectText}>Reconnect</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}
        {lines.map(renderLine)}
      </ScrollView>

      {/* Visible input bar at bottom */}
      <View style={styles.inputBar}>
        <Text style={styles.prompt}>$</Text>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSubmit}
          placeholder="Type command..."
          placeholderTextColor="#4A4A62"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          keyboardType="ascii-capable"
          keyboardAppearance="dark"
          inputAccessoryViewID={accessoryId}
          blurOnSubmit={false}
          returnKeyType="send"
        />
      </View>

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
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  statusText: {
    fontFamily: FONT,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    color: '#6A6A82',
    fontStyle: 'italic',
  },
  reconnectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#2A2A2E',
    borderRadius: 6,
  },
  reconnectText: {
    fontFamily: FONT,
    fontSize: 12,
    color: '#7C3AED',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161619',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 44,
  },
  prompt: {
    fontFamily: FONT,
    fontSize: FONT_SIZE,
    color: '#0dbc79',
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontFamily: FONT,
    fontSize: FONT_SIZE,
    color: '#E0E0E0',
    padding: 0,
    margin: 0,
  },
});
