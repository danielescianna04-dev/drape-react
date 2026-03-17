import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TerminalSession } from '../TerminalSession';
import { useTerminalStore } from '../../../../core/terminal/terminalStore';

const FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const MAX_SESSIONS = 4;

interface TerminalSessionInfo {
  id: string;
  title: string;
  isConnected: boolean;
}

interface InteractiveTerminalViewProps {
  tab?: any;
}

export const InteractiveTerminalView = React.memo(({ tab }: InteractiveTerminalViewProps) => {
  const insets = useSafeAreaInsets();
  const topPadding = insets.top + 38;
  const currentWorkstation = useTerminalStore(s => s.currentWorkstation);
  const projectId = currentWorkstation?.projectId || tab?.data?.projectId || '';

  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([
    { id: `pty-${Date.now()}`, title: 'bash', isConnected: false },
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string>(sessions[0].id);

  const handleNewSession = useCallback(() => {
    if (sessions.length >= MAX_SESSIONS) return;
    const id = `pty-${Date.now()}`;
    const num = sessions.length + 1;
    setSessions(prev => [...prev, { id, title: `bash ${num}`, isConnected: false }]);
    setActiveSessionId(id);
  }, [sessions.length]);

  const handleCloseSession = useCallback((sessionId: string) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== sessionId);
      if (updated.length === 0) {
        // Create a fresh session when last one is closed
        const id = `pty-${Date.now()}`;
        setActiveSessionId(id);
        return [{ id, title: 'bash', isConnected: false }];
      }
      if (sessionId === activeSessionId) {
        setActiveSessionId(updated[updated.length - 1].id);
      }
      return updated;
    });
  }, [activeSessionId]);

  const handleConnectionChange = useCallback((sessionId: string, connected: boolean) => {
    setSessions(prev =>
      prev.map(s => s.id === sessionId ? { ...s, isConnected: connected } : s)
    );
  }, []);

  const handleSessionExit = useCallback((sessionId: string) => {
    setSessions(prev =>
      prev.map(s => s.id === sessionId ? { ...s, isConnected: false, title: `${s.title} (exited)` } : s)
    );
  }, []);

  if (!projectId) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="terminal-outline" size={48} color="#4A4A62" />
        <Text style={styles.emptyText}>No project selected</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      {/* Session tabs bar */}
      <View style={styles.tabBar}>
        <View style={styles.tabsContainer}>
          {sessions.map(session => (
            <TouchableOpacity
              key={session.id}
              style={[
                styles.tab,
                session.id === activeSessionId && styles.tabActive,
              ]}
              onPress={() => setActiveSessionId(session.id)}
              activeOpacity={0.7}
            >
              <View style={[
                styles.statusDot,
                session.isConnected ? styles.statusConnected : styles.statusDisconnected,
              ]} />
              <Text
                style={[
                  styles.tabText,
                  session.id === activeSessionId && styles.tabTextActive,
                ]}
                numberOfLines={1}
              >
                {session.title}
              </Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => handleCloseSession(session.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={14} color="#6A6A82" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>

        {/* New session button */}
        {sessions.length < MAX_SESSIONS && (
          <TouchableOpacity
            style={styles.newButton}
            onPress={handleNewSession}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={18} color="#9494AE" />
          </TouchableOpacity>
        )}
      </View>

      {/* Active session */}
      {sessions.map(session => (
        <View
          key={session.id}
          style={[
            styles.sessionContainer,
            session.id !== activeSessionId && styles.sessionHidden,
          ]}
        >
          <TerminalSession
            projectId={projectId}
            sessionId={session.id}
            isActive={session.id === activeSessionId}
            onExit={() => handleSessionExit(session.id)}
            onConnectionChange={(connected) => handleConnectionChange(session.id, connected)}
          />
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161619',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    paddingLeft: 8,
    height: 36,
  },
  tabsContainer: {
    flexDirection: 'row',
    flex: 1,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 2,
    borderRadius: 6,
    maxWidth: 140,
  },
  tabActive: {
    backgroundColor: '#2A2A2E',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusConnected: {
    backgroundColor: '#0dbc79',
  },
  statusDisconnected: {
    backgroundColor: '#cd3131',
  },
  tabText: {
    fontFamily: FONT,
    fontSize: 12,
    color: '#6A6A82',
    flex: 1,
  },
  tabTextActive: {
    color: '#E0E0E0',
  },
  closeButton: {
    marginLeft: 6,
    padding: 2,
  },
  newButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sessionContainer: {
    flex: 1,
  },
  sessionHidden: {
    display: 'none',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0C',
    gap: 12,
  },
  emptyText: {
    fontFamily: FONT,
    fontSize: 14,
    color: '#6A6A82',
  },
});
