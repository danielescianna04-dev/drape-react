import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { useTabStore } from '../../../core/tabs/tabStore';
import { TerminalItemType } from '../../../shared/types';

interface Props {
  tabId: string;
}

/**
 * TerminalView - Terminal display for tabs
 * Shows AI command history and allows manual command execution
 */
export const TerminalView = ({ tabId }: Props) => {
  const scrollViewRef = useRef<ScrollView>(null);
  const { currentWorkstation } = useTerminalStore();
  const { tabs, addTerminalItem } = useTabStore();
  const [command, setCommand] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);

  // Get terminal items from this specific tab
  const currentTab = tabs.find(t => t.id === tabId);
  const terminalItems = currentTab?.terminalItems || [];

  // Auto-scroll to bottom when new items are added
  useEffect(() => {
    if (scrollViewRef.current && terminalItems.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [terminalItems]);

  // Execute command
  const executeCommand = async () => {
    if (!command.trim()) return;

    const cmd = command.trim();
    setCommand('');
    setIsExecuting(true);

    // Add command to terminal
    addTerminalItem(tabId, {
      id: Date.now().toString(),
      content: cmd,
      type: TerminalItemType.COMMAND,
      timestamp: new Date(),
    });

    try {
      // Execute command via backend
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/terminal/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: cmd,
          workstationId: currentWorkstation?.id,
        }),
      });

      const result = await response.json();

      // Add output
      addTerminalItem(tabId, {
        id: (Date.now() + 1).toString(),
        content: result.output || result.error || 'Comando eseguito',
        type: result.success ? TerminalItemType.OUTPUT : TerminalItemType.ERROR,
        timestamp: new Date(),
        exitCode: result.exitCode,
      });
    } catch (error) {
      addTerminalItem(tabId, {
        id: (Date.now() + 1).toString(),
        content: `Errore: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: TerminalItemType.ERROR,
        timestamp: new Date(),
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const getItemColor = (type: TerminalItemType) => {
    switch (type) {
      case TerminalItemType.COMMAND:
        return AppColors.primary;
      case TerminalItemType.OUTPUT:
        return '#FFFFFF';
      case TerminalItemType.ERROR:
        return '#FF6B6B';
      case TerminalItemType.SYSTEM:
        return '#FFA500';
      default:
        return 'rgba(255, 255, 255, 0.7)';
    }
  };

  const getItemIcon = (type: TerminalItemType) => {
    switch (type) {
      case TerminalItemType.COMMAND:
        return 'chevron-forward';
      case TerminalItemType.OUTPUT:
        return 'return-down-forward';
      case TerminalItemType.ERROR:
        return 'alert-circle';
      case TerminalItemType.SYSTEM:
        return 'information-circle';
      default:
        return 'ellipse';
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="terminal" size={20} color={AppColors.primary} />
          <Text style={styles.headerTitle}>Terminal</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.itemCount}>{terminalItems.length} comandi</Text>
          {terminalItems.length > 0 && (
            <TouchableOpacity
              onPress={() => useTabStore.getState().clearTerminalItems(tabId)}
              style={styles.clearButton}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={16} color="rgba(255, 255, 255, 0.5)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Terminal Output */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {terminalItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="terminal-outline" size={48} color="rgba(255, 255, 255, 0.2)" />
            <Text style={styles.emptyText}>Terminale vuoto</Text>
            <Text style={styles.emptySubtext}>
              I comandi AI e manuali appariranno qui
            </Text>
          </View>
        ) : (
          <View style={styles.terminalList}>
            {terminalItems.map((item, index) => (
              <View key={item.id || index} style={styles.terminalItem}>
                <View style={styles.terminalItemHeader}>
                  <View style={styles.terminalItemLeft}>
                    <Ionicons
                      name={getItemIcon(item.type)}
                      size={14}
                      color={getItemColor(item.type)}
                    />
                    <Text style={[styles.terminalItemType, { color: getItemColor(item.type) }]}>
                      {item.type.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.terminalItemTime}>
                    {formatTimestamp(item.timestamp)}
                  </Text>
                </View>

                <View style={styles.terminalItemContent}>
                  <Text
                    style={[
                      styles.terminalItemText,
                      { color: getItemColor(item.type) }
                    ]}
                    selectable
                  >
                    {item.content}
                  </Text>

                  {item.errorDetails && (
                    <View style={styles.errorDetails}>
                      <Ionicons name="information-circle-outline" size={14} color="#FF6B6B" />
                      <Text style={styles.errorDetailsText}>{item.errorDetails}</Text>
                    </View>
                  )}

                  {item.exitCode !== undefined && item.exitCode !== 0 && (
                    <View style={styles.exitCode}>
                      <Text style={styles.exitCodeText}>Exit Code: {item.exitCode}</Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Command Input */}
      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <Ionicons name="chevron-forward" size={16} color={AppColors.primary} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            value={command}
            onChangeText={setCommand}
            placeholder="Esegui comando..."
            placeholderTextColor="rgba(255, 255, 255, 0.3)"
            onSubmitEditing={executeCommand}
            returnKeyType="send"
            editable={!isExecuting}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {isExecuting ? (
            <ActivityIndicator size="small" color={AppColors.primary} style={styles.sendButton} />
          ) : (
            <TouchableOpacity
              onPress={executeCommand}
              style={styles.sendButton}
              disabled={!command.trim()}
              activeOpacity={0.7}
            >
              <Ionicons
                name="send"
                size={18}
                color={command.trim() ? AppColors.primary : 'rgba(255, 255, 255, 0.3)'}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemCount: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clearButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.3)',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 18,
  },
  terminalList: {
    gap: 12,
  },
  terminalItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  terminalItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  terminalItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  terminalItemType: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  terminalItemTime: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.4)',
    fontFamily: 'monospace',
  },
  terminalItemContent: {
    padding: 12,
  },
  terminalItemText: {
    fontSize: 13,
    fontFamily: 'monospace',
    lineHeight: 20,
  },
  errorDetails: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
    padding: 8,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.2)',
  },
  errorDetailsText: {
    flex: 1,
    fontSize: 12,
    color: '#FF6B6B',
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  exitCode: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 165, 0, 0.1)',
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  exitCodeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFA500',
    fontFamily: 'monospace',
  },
  inputContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'monospace',
    paddingVertical: 4,
  },
  sendButton: {
    marginLeft: 8,
    padding: 4,
  },
});
