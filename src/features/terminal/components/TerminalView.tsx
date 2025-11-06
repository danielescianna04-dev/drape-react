import React, { useEffect, useRef, useState } from 'react';
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

  // Get terminal items from the source tab
  const sourceTab = tabs.find(t => t.id === sourceTabId);
  const allTerminalItems = sourceTab?.terminalItems || [];

  // Filter out USER_MESSAGE items - only show real terminal commands
  const terminalItems = allTerminalItems.filter(item => {
    console.log('Terminal item type:', item.type, 'Content:', item.content?.substring(0, 30));
    return item.type !== TerminalItemType.USER_MESSAGE;
  });

  // Check if this is an AI command history terminal (opened from sidebar)
  // The sourceTabId will be different from the terminal tab's own ID if it's showing another tab's commands
  const isAICommandHistory = sourceTab && sourceTab.id !== sourceTabId && sourceTab.type !== 'terminal';

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
      <LinearGradient
        colors={['rgba(139, 124, 246, 0.15)', 'rgba(139, 124, 246, 0.05)', 'transparent']}
        style={styles.headerGradient}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.terminalIcon}>
              <LinearGradient
                colors={['rgba(139, 124, 246, 0.3)', 'rgba(139, 124, 246, 0.1)']}
                style={styles.terminalIconGradient}
              >
                <Ionicons name="terminal" size={20} color={AppColors.primary} />
              </LinearGradient>
            </View>
            <View>
              <Text style={styles.headerTitle}>Terminal</Text>
              <Text style={styles.headerSubtitle}>
                {currentWorkstation?.name || 'No workspace'}
              </Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, isExecuting && styles.statusDotActive]} />
              <Text style={styles.statusText}>
                {isExecuting ? 'Running' : 'Ready'}
              </Text>
            </View>
          </View>
        </View>
      </LinearGradient>

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
                <LinearGradient
                  colors={
                    item.type === TerminalItemType.ERROR
                      ? ['rgba(255, 107, 107, 0.08)', 'rgba(255, 107, 107, 0.03)']
                      : item.type === TerminalItemType.COMMAND
                      ? ['rgba(139, 124, 246, 0.08)', 'rgba(139, 124, 246, 0.03)']
                      : ['rgba(255, 255, 255, 0.04)', 'rgba(255, 255, 255, 0.02)']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.terminalItem}
                >
                  <View style={styles.terminalItemHeader}>
                    <View style={styles.terminalItemLeft}>
                      <View style={[
                        styles.iconCircle,
                        {
                          backgroundColor: item.type === TerminalItemType.ERROR
                            ? 'rgba(255, 107, 107, 0.15)'
                            : item.type === TerminalItemType.COMMAND
                            ? 'rgba(139, 124, 246, 0.15)'
                            : 'rgba(255, 255, 255, 0.08)'
                        }
                      ]}>
                        <Ionicons
                          name={getItemIcon(item.type)}
                          size={12}
                          color={getItemColor(item.type)}
                        />
                      </View>
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
                </LinearGradient>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Interactive Terminal Input */}
      <View style={styles.inputContainer}>
        <LinearGradient
          colors={['transparent', 'rgba(0, 0, 0, 0.3)']}
          style={styles.inputGradient}
        >
          <View style={styles.inputWrapper}>
            <View style={styles.promptIndicator}>
              <Ionicons name="chevron-forward" size={16} color={AppColors.primary} />
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
              style={[styles.sendButton, (!input.trim() || isExecuting) && styles.sendButtonDisabled]}
            >
              <LinearGradient
                colors={input.trim() && !isExecuting
                  ? ['rgba(139, 124, 246, 0.8)', 'rgba(107, 93, 214, 0.8)']
                  : ['rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.05)']
                }
                style={styles.sendButtonGradient}
              >
                {isExecuting ? (
                  <Ionicons name="hourglass-outline" size={18} color="rgba(255, 255, 255, 0.6)" />
                ) : (
                  <Ionicons name="send" size={18} color={input.trim() ? '#FFFFFF' : 'rgba(255, 255, 255, 0.4)'} />
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
    paddingLeft: 50, // Spazio per la sidebar laterale
  },
  headerGradient: {
    paddingBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 0,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  terminalIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    overflow: 'hidden',
  },
  terminalIconGradient: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.3)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 2,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(46, 213, 115, 0.6)',
  },
  statusDotActive: {
    backgroundColor: AppColors.primary,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.6)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
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
  terminalItemWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  terminalItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  iconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
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
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  inputGradient: {
    paddingTop: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  promptIndicator: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139, 124, 246, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.2)',
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'monospace',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    overflow: 'hidden',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonGradient: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
});
