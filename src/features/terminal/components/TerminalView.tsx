import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppColors } from '../../../shared/theme/colors';
import { useTabStore } from '../../../core/tabs/tabStore';
import { TerminalItemType } from '../../../shared/types';
import axios from 'axios';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { ChatInput } from '../../../shared/components/ChatInput';

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
  const { currentWorkstation, globalTerminalLog, addGlobalTerminalLog } = useTerminalStore();

  // Get terminal items based on sourceTabId
  // Now includes GLOBAL log from all sources (preview, AI, etc.)
  const allTerminalItems = useMemo(() => {
    const allItems: any[] = [];

    // Always include global terminal log (commands from preview, AI, etc.)
    if (globalTerminalLog && globalTerminalLog.length > 0) {
      allItems.push(...globalTerminalLog);
    }

    if (sourceTabId === 'all') {
      // Show commands from ALL chat tabs + global log
      tabs.forEach(tab => {
        if (tab.type === 'chat' && tab.terminalItems) {
          allItems.push(...tab.terminalItems);
        }
      });
    } else {
      // Show commands from specific tab + global log
      const sourceTab = tabs.find(t => t.id === sourceTabId);
      if (sourceTab?.terminalItems) {
        allItems.push(...sourceTab.terminalItems);
      }
    }

    // Sort by timestamp to show chronological order
    return allItems.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [sourceTabId, tabs, globalTerminalLog]);

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

    const commandId = Date.now().toString();

    // Add command to GLOBAL terminal log (visible everywhere)
    addGlobalTerminalLog({
      id: commandId,
      content: command,
      type: TerminalItemType.COMMAND,
      timestamp: new Date(),
      source: 'terminal',
    });

    try {
      const response = await axios.post(
        `${process.env.EXPO_PUBLIC_API_URL}/terminal/execute`,
        {
          command: command,
          workstationId: currentWorkstation?.id
        }
      );

      // Add output to GLOBAL terminal log
      addGlobalTerminalLog({
        id: (Date.now() + 1).toString(),
        content: response.data.output || '',
        type: response.data.error ? TerminalItemType.ERROR : TerminalItemType.OUTPUT,
        timestamp: new Date(),
        exitCode: response.data.exitCode,
        source: 'terminal',
      });
    } catch (error: any) {
      // Add error to GLOBAL terminal log
      addGlobalTerminalLog({
        id: (Date.now() + 1).toString(),
        content: error.response?.data?.error || error.message || 'Unknown error',
        type: TerminalItemType.ERROR,
        timestamp: new Date(),
        errorDetails: error.response?.data?.details,
        source: 'terminal',
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
        return AppColors.white.full;
      case TerminalItemType.ERROR:
        return AppColors.error;
      case TerminalItemType.SYSTEM:
        return AppColors.terminal.yellow;
      default:
        return AppColors.white.w60;
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

  const renderHeaderContent = () => (
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
  );

  const renderCardContent = (item: any) => (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.typeIconContainer}>
          <Ionicons
            name={
              item.type === TerminalItemType.COMMAND ? 'terminal' :
                item.type === TerminalItemType.ERROR ? 'close-circle' :
                  item.type === TerminalItemType.SYSTEM ? 'information-circle' : 'checkmark-circle'
            }
            size={16}
            color={
              item.type === TerminalItemType.COMMAND ? AppColors.primary :
                item.type === TerminalItemType.ERROR ? AppColors.error :
                  item.type === TerminalItemType.SYSTEM ? AppColors.terminal.yellow : AppColors.success
            }
          />
          <Text style={[
            styles.typeLabel,
            item.type === TerminalItemType.COMMAND && styles.typeLabelCommand,
            item.type === TerminalItemType.ERROR && styles.typeLabelError,
            item.type === TerminalItemType.SYSTEM && styles.typeLabelSystem,
            item.type === TerminalItemType.OUTPUT && styles.typeLabelOutput,
          ]}>
            {item.type === TerminalItemType.COMMAND ? 'COMMAND' :
              item.type === TerminalItemType.ERROR ? 'ERROR' :
                item.type === TerminalItemType.SYSTEM ? 'SYSTEM' : 'OUTPUT'}
          </Text>
        </View>

        <View style={styles.headerRight}>
          {item.source && (
            <View style={[
              styles.sourceBadge,
              item.source === 'preview' && styles.sourceBadgePreview,
              item.source === 'ai' && styles.sourceBadgeAI,
              item.source === 'terminal' && styles.sourceBadgeTerminal,
              item.source === 'backend' && styles.sourceBadgeBackend,
            ]}>
              <Ionicons
                name={
                  item.source === 'preview' ? 'phone-portrait-outline' :
                    item.source === 'ai' ? 'sparkles' :
                      item.source === 'terminal' ? 'terminal-outline' :
                        item.source === 'backend' ? 'server-outline' : 'code-outline'
                }
                size={10}
                color={AppColors.white.w60}
              />
              <Text style={styles.sourceText}>
                {item.source === 'preview' ? 'Preview' :
                  item.source === 'ai' ? 'AI' :
                    item.source === 'terminal' ? 'Terminal' :
                      item.source === 'backend' ? 'Backend' : item.source}
              </Text>
            </View>
          )}
          {item.timestamp && (
            <Text style={styles.timestamp}>
              {new Date(item.timestamp).toLocaleTimeString('it-IT', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })}
            </Text>
          )}
        </View>
      </View>

      {/* Content */}
      <View style={styles.cardContent}>
        <Text
          style={[
            styles.contentText,
            item.type === TerminalItemType.ERROR && styles.errorText,
            item.type === TerminalItemType.SYSTEM && styles.systemText,
          ]}
          selectable
        >
          {item.content}
        </Text>
      </View>

      {/* Footer for commands with exit code */}
      {item.type === TerminalItemType.COMMAND && item.exitCode !== undefined && (
        <View style={styles.cardFooter}>
          <View style={[
            styles.exitCodeBadge,
            item.exitCode === 0 ? styles.exitCodeSuccess : styles.exitCodeError
          ]}>
            <Text style={styles.exitCodeText}>
              Exit Code: {item.exitCode}
            </Text>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header with glassy effect */}
      <View style={styles.headerContainer}>
        {isLiquidGlassSupported ? (
          <LiquidGlassView
            style={[styles.headerGradient, { backgroundColor: 'transparent', overflow: 'hidden' }]}
            interactive={true}
            effect="clear"
            colorScheme="dark"
          >
            {renderHeaderContent()}
          </LiquidGlassView>
        ) : (
          <LinearGradient
            colors={[AppColors.dark.backgroundAlt, 'rgba(10, 10, 15, 0.7)']}
            style={styles.headerGradient}
          >
            {renderHeaderContent()}
          </LinearGradient>
        )}
        <View style={styles.headerBorder} />
      </View>

      {/* Terminal Output */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={true}
        scrollEventThrottle={16}
        alwaysBounceVertical={true}
      >
        {terminalItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="terminal-outline" size={48} color={AppColors.white.w25} />
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
              <View key={item.id || index} style={styles.terminalCard}>
                {isLiquidGlassSupported ? (
                  <LiquidGlassView
                    style={[styles.cardGradient, { backgroundColor: 'transparent', overflow: 'hidden' }]}
                    interactive={true}
                    effect="clear"
                    colorScheme="dark"
                  >
                    {renderCardContent(item)}
                  </LiquidGlassView>
                ) : (
                  <LinearGradient
                    colors={[AppColors.dark.surface, AppColors.dark.surfaceAlt]}
                    style={styles.cardGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    {renderCardContent(item)}
                  </LinearGradient>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Interactive Terminal Input */}
      <ChatInput
        value={input}
        onChangeText={setInput}
        onSend={handleCommand}
        placeholder="Scrivi un comando..."
        disabled={isExecuting}
        isExecuting={isExecuting}
        showTopBar={false}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
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
    backgroundColor: AppColors.primaryAlpha.a15,
    borderWidth: 1,
    borderColor: AppColors.primaryAlpha.a20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTexts: {
    gap: 3,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: AppColors.white.full,
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
    color: AppColors.white.w50,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: AppColors.white.w04,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AppColors.white.w10,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: AppColors.success,
  },
  statusDotActive: {
    backgroundColor: AppColors.primary,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: AppColors.white.w60,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  headerBorder: {
    height: 1,
    backgroundColor: AppColors.white.w10,
    marginHorizontal: 20,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 28,
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
    color: AppColors.white.w40,
    marginTop: 20,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 12,
    color: AppColors.white.w25,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 18,
  },
  terminalList: {
    gap: 10,
  },
  terminalCard: {
    marginBottom: 10,
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardGradient: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppColors.white.w10,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: AppColors.black.full + '33',
    borderBottomWidth: 1,
    borderBottomColor: AppColors.white.w06,
  },
  typeIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  typeLabelCommand: {
    color: AppColors.primary,
  },
  typeLabelError: {
    color: AppColors.error,
  },
  typeLabelSystem: {
    color: AppColors.terminal.yellow,
  },
  typeLabelOutput: {
    color: AppColors.success,
  },
  timestamp: {
    fontSize: 9,
    fontWeight: '600',
    color: AppColors.white.w40,
    fontFamily: 'monospace',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: AppColors.white.w10,
  },
  sourceBadgePreview: {
    backgroundColor: AppColors.success + '26',
  },
  sourceBadgeAI: {
    backgroundColor: AppColors.primaryAlpha.a15,
  },
  sourceBadgeTerminal: {
    backgroundColor: AppColors.terminal.yellow + '26',
  },
  sourceBadgeBackend: {
    backgroundColor: AppColors.primary + '26',
  },
  sourceText: {
    fontSize: 9,
    fontWeight: '600',
    color: AppColors.white.w60,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  cardContent: {
    padding: 14,
  },
  contentText: {
    fontSize: 13,
    fontFamily: 'monospace',
    lineHeight: 20,
    letterSpacing: 0.2,
    color: AppColors.white.full,
  },
  errorText: {
    color: AppColors.error,
  },
  systemText: {
    color: AppColors.terminal.yellow,
  },
  cardFooter: {
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  exitCodeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
  },
  exitCodeSuccess: {
    backgroundColor: AppColors.success + '1F',
    borderColor: AppColors.success + '33',
  },
  exitCodeError: {
    backgroundColor: AppColors.error + '1F',
    borderColor: AppColors.error + '33',
  },
  terminalItemWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  terminalItem: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppColors.white.w10,
    overflow: 'hidden',
    shadowColor: AppColors.black.full,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 2,
  },
  terminalItemCommand: {
    borderColor: AppColors.primaryAlpha.a15,
  },
  terminalItemError: {
    borderColor: AppColors.error + '26',
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
    backgroundColor: AppColors.black.full + '33',
    borderBottomWidth: 1,
    borderBottomColor: AppColors.white.w06,
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
    backgroundColor: AppColors.white.w04,
    borderRadius: 6,
  },
  terminalItemTime: {
    fontSize: 9,
    fontWeight: '600',
    color: AppColors.white.w40,
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
    backgroundColor: AppColors.error + '1F',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: AppColors.error + '40',
  },
  errorDetailsText: {
    flex: 1,
    fontSize: 12,
    color: AppColors.errorAlt,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  exitCode: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: AppColors.terminal.yellow + '1F',
    borderRadius: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: AppColors.terminal.yellow + '33',
  },
  exitCodeText: {
    fontSize: 10,
    fontWeight: '700',
    color: AppColors.terminal.yellow,
    fontFamily: 'monospace',
    letterSpacing: 0.5,
  },
});
