import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Platform, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../shared/theme/colors';
import { useTabStore } from '../../../core/tabs/tabStore';
import { TerminalItemType } from '../../../shared/types';
import axios from 'axios';
import { useTerminalStore } from '../../../core/terminal/terminalStore';

interface Props {
  terminalTabId: string; // The terminal tab itself (where to write new commands)
  sourceTabId: string; // The tab whose commands we're displaying (read-only)
}

/**
 * TerminalView - Interactive terminal showing AI command history and allowing direct command execution
 */
export const TerminalView = ({ terminalTabId, sourceTabId }: Props) => {
  const scrollViewRef = useRef<ScrollView>(null);
  const [input, setInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const { tabs, addTerminalItem: addTerminalItemToTab } = useTabStore();
  const { currentWorkstation } = useTerminalStore();

  // Get terminal items based on sourceTabId
  const allTerminalItems = useMemo(() => {
    if (sourceTabId === 'all') {
      // Show commands from ALL chat tabs, sorted by timestamp
      const allItems: any[] = [];
      tabs.forEach(tab => {
        if (tab.type === 'chat' && tab.terminalItems) {
          allItems.push(...tab.terminalItems);
        }
      });
      // Sort by timestamp to show chronological order
      return allItems.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    } else {
      // Show commands from specific tab
      const sourceTab = tabs.find(t => t.id === sourceTabId);
      return sourceTab?.terminalItems || [];
    }
  }, [sourceTabId, tabs]);

  // Filter out USER_MESSAGE items and their OUTPUT responses - only show real terminal commands
  const terminalItems = useMemo(() => {
    return allTerminalItems.filter((item, index) => {
      // Skip USER_MESSAGE items
      if (item.type === TerminalItemType.USER_MESSAGE) {
        return false;
      }

      // Skip OUTPUT items that follow a USER_MESSAGE (AI responses)
      if (item.type === TerminalItemType.OUTPUT && index > 0) {
        const prevItem = allTerminalItems[index - 1];
        if (prevItem.type === TerminalItemType.USER_MESSAGE) {
          return false;
        }
      }

      return true;
    });
  }, [allTerminalItems]);

  // Check if this is an AI command history terminal (showing all commands or from another tab)
  const isAICommandHistory = sourceTabId === 'all' || sourceTabId !== terminalTabId;

  // Auto-scroll to bottom when new items are added
  useEffect(() => {
    if (scrollViewRef.current && terminalItems.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [terminalItems]);

  const handleCommand = async () => {
    if (!input.trim() || isExecuting) return;

    const command = input.trim();
    setInput('');
    setIsExecuting(true);

    // Add command to terminal (write to terminalTabId, not sourceTabId)
    addTerminalItemToTab(terminalTabId, {
      id: Date.now().toString(),
      content: command,
      type: TerminalItemType.COMMAND,
      timestamp: new Date(),
    });

    try {
      const response = await axios.post(
        `${process.env.EXPO_PUBLIC_API_URL}/terminal/execute`,
        {
          command: command,
          workstationId: currentWorkstation?.id
        }
      );

      // Add output to terminal (write to terminalTabId, not sourceTabId)
      addTerminalItemToTab(terminalTabId, {
        id: (Date.now() + 1).toString(),
        content: response.data.output || '',
        type: response.data.error ? TerminalItemType.ERROR : TerminalItemType.OUTPUT,
        timestamp: new Date(),
        exitCode: response.data.exitCode,
      });
    } catch (error: any) {
      // Add error to terminal (write to terminalTabId, not sourceTabId)
      addTerminalItemToTab(terminalTabId, {
        id: (Date.now() + 1).toString(),
        content: error.response?.data?.error || error.message || 'Unknown error',
        type: TerminalItemType.ERROR,
        timestamp: new Date(),
        errorDetails: error.response?.data?.details,
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header with gradient */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={['rgba(10, 10, 15, 0.95)', 'rgba(10, 10, 15, 0.7)']}
          style={styles.headerGradient}
        >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.terminalIcon}>
                <Ionicons name="terminal" size={18} color={AppColors.primary} />
              </View>
              <View style={styles.headerTexts}>
                <Text style={styles.headerTitle}>Terminal</Text>
                <View style={styles.workspaceRow}>
                  <View style={styles.workspaceDot} />
                  <Text style={styles.headerSubtitle}>
                    {currentWorkstation?.name || 'No workspace'}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, isExecuting && styles.statusDotActive]} />
              <Text style={styles.statusText}>
                {isExecuting ? 'Running' : 'Ready'}
              </Text>
            </View>
          </View>
        </LinearGradient>
        <View style={styles.headerBorder} />
      </View>

      {/* Terminal Output */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {terminalItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="terminal-outline" size={48} color="rgba(255, 255, 255, 0.2)" />
            <Text style={styles.emptyText}>
              {isAICommandHistory ? 'Nessun comando eseguito' : 'Terminal Interattivo'}
            </Text>
            <Text style={styles.emptySubtext}>
              {isAICommandHistory
                ? 'I comandi eseguiti dall\'AI appariranno qui'
                : 'Inizia a digitare comandi per interagire con il terminale'
              }
            </Text>
          </View>
        ) : (
          <View style={styles.terminalList}>
            {terminalItems.map((item, index) => (
              <View key={item.id || index} style={styles.terminalItemWrapper}>
                <View style={[
                  styles.terminalItem,
                  item.type === TerminalItemType.ERROR && styles.terminalItemError,
                  item.type === TerminalItemType.COMMAND && styles.terminalItemCommand,
                ]}>
                  <LinearGradient
                    colors={
                      item.type === TerminalItemType.ERROR
                        ? ['rgba(255, 107, 107, 0.12)', 'rgba(255, 107, 107, 0.04)']
                        : item.type === TerminalItemType.COMMAND
                        ? ['rgba(139, 124, 246, 0.12)', 'rgba(139, 124, 246, 0.04)']
                        : item.type === TerminalItemType.SYSTEM
                        ? ['rgba(255, 165, 0, 0.12)', 'rgba(255, 165, 0, 0.04)']
                        : ['rgba(255, 255, 255, 0.06)', 'rgba(255, 255, 255, 0.02)']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.terminalItemGradient}
                  >
                    <View style={styles.terminalItemHeader}>
                      <View style={styles.terminalItemLeft}>
                        <View style={[
                          styles.iconCircle,
                          {
                            backgroundColor: item.type === TerminalItemType.ERROR
                              ? 'rgba(255, 107, 107, 0.2)'
                              : item.type === TerminalItemType.COMMAND
                              ? 'rgba(139, 124, 246, 0.2)'
                              : item.type === TerminalItemType.SYSTEM
                              ? 'rgba(255, 165, 0, 0.2)'
                              : 'rgba(255, 255, 255, 0.1)'
                          }
                        ]}>
                          <Ionicons
                            name={getItemIcon(item.type)}
                            size={14}
                            color={getItemColor(item.type)}
                          />
                        </View>
                        <Text style={[styles.terminalItemType, { color: getItemColor(item.type) }]}>
                          {item.type.toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.timestampBadge}>
                        <Ionicons name="time-outline" size={11} color="rgba(255, 255, 255, 0.4)" />
                        <Text style={styles.terminalItemTime}>
                          {formatTimestamp(item.timestamp)}
                        </Text>
                      </View>
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
                          <Ionicons name="alert-circle-outline" size={12} color="#FFA500" />
                          <Text style={styles.exitCodeText}>Exit {item.exitCode}</Text>
                        </View>
                      )}
                    </View>
                  </LinearGradient>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Interactive Terminal Input */}
      <View style={styles.inputContainer}>
        <View style={styles.inputBorder} />
        <LinearGradient
          colors={['rgba(10, 10, 15, 0.98)', 'rgba(10, 10, 15, 0.95)']}
          style={styles.inputGradient}
        >
          <View style={styles.inputWrapper}>
            <View style={styles.promptIndicator}>
              <Ionicons name="chevron-forward" size={14} color={AppColors.primary} />
            </View>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleCommand}
              placeholder="Inserisci comando..."
              placeholderTextColor="rgba(255, 255, 255, 0.3)"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isExecuting}
            />
            <TouchableOpacity
              onPress={handleCommand}
              disabled={!input.trim() || isExecuting}
              style={styles.sendButton}
            >
              <LinearGradient
                colors={input.trim() && !isExecuting
                  ? [AppColors.primary, '#6B5DD6']
                  : ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.04)']
                }
                style={styles.sendButtonGradient}
              >
                {isExecuting ? (
                  <Ionicons name="hourglass-outline" size={18} color="rgba(255, 255, 255, 0.5)" />
                ) : (
                  <Ionicons name="send" size={18} color={input.trim() ? '#FFFFFF' : 'rgba(255, 255, 255, 0.3)'} />
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingLeft: 50,
  },
  headerContainer: {
    position: 'relative',
  },
  headerGradient: {
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  terminalIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTexts: {
    gap: 3,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  workspaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  workspaceDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: AppColors.primary,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#2ED573',
  },
  statusDotActive: {
    backgroundColor: AppColors.primary,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.6)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  headerBorder: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 20,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 20,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.25)',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 18,
  },
  terminalList: {
    gap: 10,
  },
  terminalItemWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  terminalItem: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 2,
  },
  terminalItemCommand: {
    borderColor: 'rgba(139, 124, 246, 0.15)',
  },
  terminalItemError: {
    borderColor: 'rgba(255, 107, 107, 0.15)',
  },
  terminalItemGradient: {
    borderRadius: 14,
  },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
  },
  terminalItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  terminalItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  terminalItemType: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  timestampBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 6,
  },
  terminalItemTime: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.45)',
    fontFamily: 'monospace',
  },
  terminalItemContent: {
    padding: 14,
  },
  terminalItemText: {
    fontSize: 13,
    fontFamily: 'monospace',
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  errorDetails: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 10,
    padding: 10,
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.25)',
  },
  errorDetailsText: {
    flex: 1,
    fontSize: 12,
    color: '#FF8A8A',
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  exitCode: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(255, 165, 0, 0.12)',
    borderRadius: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 165, 0, 0.2)',
  },
  exitCodeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFAB40',
    fontFamily: 'monospace',
    letterSpacing: 0.5,
  },
  inputContainer: {
    position: 'relative',
  },
  inputBorder: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  inputGradient: {
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 20,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  promptIndicator: {
    width: 34,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139, 124, 246, 0.12)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.2)',
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'monospace',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  sendButtonGradient: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
});
