import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TerminalSession } from '../TerminalSession';
import { useTerminalStore } from '../../../../core/terminal/terminalStore';
import { AppColors } from '../../../../shared/theme/colors';

const FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

interface InteractiveTerminalViewProps {
  tab?: any;
}

export const InteractiveTerminalView = React.memo(({ tab }: InteractiveTerminalViewProps) => {
  const insets = useSafeAreaInsets();
  const topPadding = insets.top + 38;
  const currentWorkstation = useTerminalStore(s => s.currentWorkstation);
  const projectId = currentWorkstation?.projectId || tab?.data?.projectId || '';
  const sessionIdRef = useRef(`pty-${Date.now()}`);

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
      <LinearGradient
        colors={AppColors.gradient.dark}
        locations={[0, 0.3, 0.7, 1]}
        style={styles.background}
      />

      <View style={styles.sessionContainer}>
        <TerminalSession
          projectId={projectId}
          sessionId={sessionIdRef.current}
          sessionTitle="bash"
          isActive={true}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.dark.background,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  sessionContainer: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: AppColors.dark.background,
    gap: 12,
  },
  emptyText: {
    fontFamily: FONT,
    fontSize: 14,
    color: '#6A6A82',
  },
});
