/**
 * PreviewSurfaceConsole — Console output view for non-web projects
 * (python-console, javascript-console, c-lang, cpp, java).
 * Pure component: no hooks that fetch data, no direct store access.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ── Props ──────────────────────────────────────────────────

export interface PreviewSurfaceConsoleProps {
  /** Terminal output lines */
  terminalOutput: string[];
  /** Called to stop the preview */
  onStop: () => void;
  /** Project name shown in the header bar */
  projectName?: string;
  terminalScrollRef?: React.RefObject<ScrollView>;
}

// ── Component ──────────────────────────────────────────────

export const PreviewSurfaceConsole: React.FC<PreviewSurfaceConsoleProps> = ({
  terminalOutput,
  onStop,
  projectName,
  terminalScrollRef,
}) => {
  return (
    <View style={s.root}>
      {/* Header bar */}
      <View style={s.header}>
        <TouchableOpacity onPress={onStop} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={22} color="#9ca3af" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{projectName || 'Terminal'}</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Console output */}
      <ScrollView
        ref={terminalScrollRef}
        style={s.body}
        contentContainerStyle={s.bodyContent}
        showsVerticalScrollIndicator
      >
        {terminalOutput.length > 0 ? (
          terminalOutput.map((line, i) => (
            <Text
              key={`console-${i}`}
              style={[
                s.line,
                {
                  color:
                    line.toLowerCase().includes('error') || line.toLowerCase().includes('failed')
                      ? '#f87171'
                      : line.toLowerCase().includes('warning')
                        ? '#fbbf24'
                        : '#d1d5db',
                },
              ]}
            >
              {line}
            </Text>
          ))
        ) : (
          <Text style={s.emptyText}>Waiting for output...</Text>
        )}
      </ScrollView>
    </View>
  );
};

// ── Styles ──────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d1117' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 12,
    backgroundColor: '#0d1117',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 13,
    fontFamily: 'Courier New',
  },
  body: { flex: 1, backgroundColor: '#0d1117' },
  bodyContent: { padding: 12, gap: 2 },
  line: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Courier New',
    letterSpacing: 0.2,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 40,
  },
});
