import React, { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import {
  View, StyleSheet, Text,
  FlatList, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AppColors } from '../../../../shared/theme/colors';
import { useTerminalStore } from '../../../../core/terminal/terminalStore';
import { Tab, useTabStore } from '../../../../core/tabs/tabStore';
import { useUIStore } from '../../../../core/terminal/uiStore';
import { useSidebarOffset } from '../../context/SidebarContext';
import { TerminalItemType } from '../../../../shared/types';
import { usePreviewLogs } from '../../../../hooks/api/usePreviewLogs';

interface Props {
  tab: Tab;
}

// Unified display entry types
interface ToolEntry {
  id: string;
  type: 'tool';
  message: string;
  timestamp: number;
  command: string;
  status: string;
  output: string;
  isExecuting: boolean;
  isError: boolean;
  icon: string;
}

interface LogGroupEntry {
  id: string;
  type: 'log_group';
  messages: string[];
  timestamp: number;
}

type DisplayEntry = ToolEntry | LogGroupEntry;

/** Filter out noise from preview logs */
const isNoisyLog = (msg: string): boolean => {
  const trimmed = msg.trim();
  if (!trimmed) return true;
  // Progress bar dots
  if (/^[.·•●○]{5,}$/.test(trimmed)) return true;
  // Just a timer like "~ 0s" or "~ 12s"
  if (/^~\s*\d+s$/.test(trimmed)) return true;
  // Keepalive
  if (trimmed === ':keepalive' || trimmed === 'keepalive') return true;
  // Just a bare timestamp like "2026-02-21 14:04:47"
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(trimmed)) return true;
  return false;
};

/** Parse tool content into parts */
function parseToolContent(content: string): { command: string; status: string; output: string } {
  const lines = content.split('\n');
  const firstLine = lines[0] || '';
  let statusLine = '';
  let outputStart = 1;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].startsWith('└─')) {
      statusLine = lines[i].replace('└─ ', '').trim();
      outputStart = i + 1;
      break;
    }
  }
  while (outputStart < lines.length && lines[outputStart].trim() === '') outputStart++;
  const output = lines.slice(outputStart).join('\n').trim();
  return { command: firstLine, status: statusLine, output };
}

function getToolIcon(command: string): string {
  const l = command.toLowerCase();
  if (l.startsWith('execute:') || l.startsWith('run command') || l.startsWith('$')) return 'terminal-outline';
  if (l.startsWith('write ')) return 'create-outline';
  if (l.startsWith('edit ')) return 'pencil-outline';
  if (l.startsWith('read ')) return 'eye-outline';
  if (l.startsWith('glob') || l.startsWith('list')) return 'folder-outline';
  if (l.startsWith('search') || l.startsWith('grep')) return 'search-outline';
  if (l.startsWith('fetch')) return 'globe-outline';
  if (l.startsWith('agent')) return 'git-branch-outline';
  if (l.startsWith('todo')) return 'checkbox-outline';
  if (l.startsWith('web search')) return 'search-outline';
  if (l.startsWith('user question')) return 'chatbubble-ellipses-outline';
  return 'code-slash-outline';
}

// Module-level cache — survives component unmount/remount (tab switches)
const _toolCache = new Map<string, any[]>();

/** Check if a terminal item is a tool execution */
function isToolItem(item: any): boolean {
  // Has explicit isExecuting flag (set by bridge for tool_start/tool_complete/tool_error)
  // Text messages, thinking, etc. do NOT have this field
  if (item.isExecuting !== undefined) return true;
  // Explicit TOOL_USE or ERROR type
  if (item.type === TerminalItemType.TOOL_USE) return true;
  if (item.type === TerminalItemType.ERROR) return true;
  return false;
}

export const ShellView = ({ tab }: Props) => {
  const insets = useSafeAreaInsets();
  const { currentWorkstation } = useTerminalStore();
  const { isSidebarHidden } = useSidebarOffset();
  const flatListRef = useRef<FlatList>(null);

  const topPadding = insets.top + 38;
  const projectName = currentWorkstation?.name || 'Progetto';

  // Get preview token and project ID for live log streaming
  const projectId = currentWorkstation?.projectId || currentWorkstation?.id;
  const projectPreviewTokens = useUIStore(s => s.projectPreviewTokens);
  const previewToken = projectId ? (projectPreviewTokens[projectId] || null) : null;

  // Stream real-time container logs (npm install, dev server output, etc.)
  const { logs: previewLogs } = usePreviewLogs({
    enabled: !!projectId,
    projectId: projectId || undefined,
    previewToken,
    maxLogs: 200,
  });

  // Get AI tool executions from chat tabs — cached at module level so closing chat tab doesn't lose them
  const tabs = useTabStore(s => s.tabs);
  const cacheKey = projectId || 'default';

  // Initialize from module-level cache (survives remount)
  const [toolItems, setToolItems] = useState<any[]>(() => _toolCache.get(cacheKey) || []);

  // Sync tool items from chat tabs into cache
  useEffect(() => {
    const wsId = currentWorkstation?.id;
    const pId = currentWorkstation?.projectId || wsId;

    // Find chat tab: first try by workstationId/projectId, then any chat tab with items
    let chatTab = tabs.find(t =>
      t.type === 'chat' && (
        t.workstationId === wsId ||
        t.workstationId === pId ||
        t.data?.projectId === wsId ||
        t.data?.projectId === pId
      )
    );
    if (!chatTab) {
      chatTab = tabs
        .filter(t => t.type === 'chat' && t.terminalItems && t.terminalItems.length > 0)
        .sort((a, b) => (b.terminalItems?.length || 0) - (a.terminalItems?.length || 0))[0];
    }

    if (!chatTab?.terminalItems) return;

    const liveTools = chatTab.terminalItems.filter(isToolItem);
    if (liveTools.length === 0) return;

    // Deduplicate by ID
    const map = new Map<string, any>();
    for (const item of liveTools) {
      const key = item.id || `${item.content?.substring(0, 40)}-${item.timestamp}`;
      map.set(key, item);
    }
    const deduped = Array.from(map.values());

    // Update both module cache and state
    _toolCache.set(cacheKey, deduped);
    setToolItems(deduped);
  }, [tabs, currentWorkstation, cacheKey]);

  // Filter noisy preview logs
  const filteredPreviewLogs = useMemo(() => {
    return previewLogs.filter(log => !isNoisyLog(log.message));
  }, [previewLogs]);

  // Build display entries: group consecutive preview logs, interleave with tool cards
  const displayEntries = useMemo((): DisplayEntry[] => {
    // Build sorted raw entries
    type RawEntry = { type: 'preview_log'; message: string; timestamp: number; id: string }
      | { type: 'tool'; item: any; timestamp: number; id: string };

    const raw: RawEntry[] = [];

    for (const log of filteredPreviewLogs) {
      raw.push({
        type: 'preview_log',
        message: log.message,
        timestamp: log.timestamp,
        id: `plog-${log.id}`,
      });
    }

    for (const item of toolItems) {
      const ts = item.timestamp instanceof Date ? item.timestamp.getTime() : (item.timestamp || 0);
      raw.push({
        type: 'tool',
        item,
        timestamp: ts,
        id: item.id || `tool-${Math.random()}`,
      });
    }

    raw.sort((a, b) => a.timestamp - b.timestamp);

    // Group consecutive preview logs
    const entries: DisplayEntry[] = [];
    let pendingLogs: string[] = [];
    let pendingLogTs = 0;
    let pendingLogId = '';

    const flushLogs = () => {
      if (pendingLogs.length > 0) {
        entries.push({
          id: `lgroup-${pendingLogId}`,
          type: 'log_group',
          messages: [...pendingLogs],
          timestamp: pendingLogTs,
        });
        pendingLogs = [];
      }
    };

    for (const r of raw) {
      if (r.type === 'preview_log') {
        if (pendingLogs.length === 0) {
          pendingLogTs = r.timestamp;
          pendingLogId = r.id;
        }
        pendingLogs.push(r.message);
      } else {
        flushLogs();
        const content = r.item.content || '';
        const { command, status, output } = parseToolContent(content);
        const isError = r.item.type === TerminalItemType.ERROR || content.toLowerCase().includes('error');
        entries.push({
          id: r.id,
          type: 'tool',
          message: command,
          timestamp: r.timestamp,
          command,
          status,
          output,
          isExecuting: r.item.isExecuting === true,
          isError,
          icon: getToolIcon(command),
        });
      }
    }
    flushLogs();

    return entries;
  }, [filteredPreviewLogs, toolItems]);

  // Auto-scroll
  const prevCountRef = useRef(0);
  if (displayEntries.length > prevCountRef.current) {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
  }
  prevCountRef.current = displayEntries.length;

  const renderItem = useCallback(({ item }: { item: DisplayEntry }) => {
    if (item.type === 'log_group') {
      return (
        <View style={styles.logCard}>
          <View style={styles.logCardHeader}>
            <Ionicons name="terminal-outline" size={12} color="rgba(255,255,255,0.35)" />
            <Text style={styles.logCardTitle}>Container</Text>
            <Text style={styles.logCardCount}>{item.messages.length} righe</Text>
          </View>
          <View style={styles.logCardBody}>
            {item.messages.map((msg, i) => {
              const isErr = msg.toLowerCase().includes('error') ||
                            msg.toLowerCase().includes('failed') ||
                            msg.toLowerCase().includes('enoent');
              return (
                <Text key={i} style={[styles.logLineText, isErr && styles.logLineError]} numberOfLines={4}>
                  {msg}
                </Text>
              );
            })}
          </View>
        </View>
      );
    }

    // Tool execution card
    const statusColor = item.isExecuting ? '#fbbf24' : item.isError ? '#f87171' : '#4ade80';
    // Override status text for failed commands
    const displayStatus = item.isError && item.status
      ? item.status.replace(/[Cc]ompleted/, 'Failed')
      : item.status;

    return (
      <View style={styles.toolCard}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconCircle, { backgroundColor: item.isError ? 'rgba(248,113,113,0.1)' : 'rgba(155,138,255,0.1)' }]}>
            <Ionicons
              name={(item.icon || 'code-slash-outline') as any}
              size={13}
              color={item.isError ? '#f87171' : AppColors.primary}
            />
          </View>
          <Text style={styles.commandText} numberOfLines={2}>{item.command}</Text>
          {item.isExecuting && <View style={styles.executingDot} />}
        </View>
        {displayStatus ? (
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusLabel, { color: statusColor }]}>{displayStatus}</Text>
          </View>
        ) : null}
        {item.output ? (
          <View style={styles.outputBlock}>
            <Text style={styles.outputText} numberOfLines={25}>{item.output}</Text>
          </View>
        ) : null}
      </View>
    );
  }, []);

  const hasItems = displayEntries.length > 0;
  const logCount = filteredPreviewLogs.length;
  const toolCount = toolItems.length;

  return (
    <LinearGradient
      colors={AppColors.gradient.dark as unknown as string[]}
      style={[styles.container, { paddingTop: topPadding }]}
    >
      {/* Top bar */}
      <Animated.View entering={FadeIn.duration(200)} style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Ionicons name="receipt-outline" size={16} color="rgba(255,255,255,0.4)" />
          <Text style={styles.topBarTitle}>Log</Text>
          <Text style={styles.topBarProject}>{projectName}</Text>
        </View>
        <View style={styles.topBarRight}>
          {logCount > 0 && (
            <View style={styles.badge}>
              <View style={styles.liveDot} />
              <Text style={styles.badgeText}>{logCount}</Text>
            </View>
          )}
          {toolCount > 0 && (
            <View style={[styles.badge, styles.badgeTool]}>
              <Ionicons name="hammer-outline" size={10} color={AppColors.primary} />
              <Text style={[styles.badgeText, { color: AppColors.primary }]}>{toolCount}</Text>
            </View>
          )}
        </View>
      </Animated.View>

      {/* Content */}
      {!hasItems ? (
        <View style={styles.emptyState}>
          <Ionicons name="terminal-outline" size={48} color="rgba(255,255,255,0.06)" />
          <Text style={styles.emptyTitle}>Nessun log</Text>
          <Text style={styles.emptySubtitle}>
            I log del container e i comandi{'\n'}dell'IA appariranno qui
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={displayEntries}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            flatListRef.current?.scrollToEnd({ animated: false });
          }}
        />
      )}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 40,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBarTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: -0.3,
  },
  topBarProject: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.25)',
    marginLeft: 4,
  },
  topBarRight: {
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(74,222,128,0.1)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeTool: {
    backgroundColor: 'rgba(155,138,255,0.1)',
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#4ade80',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4ade80',
  },
  // Empty
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 80,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.15)',
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.08)',
    textAlign: 'center',
    lineHeight: 19,
  },
  // List
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: 80,
  },
  // Preview log group card (terminal-style)
  logCard: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginVertical: 4,
  },
  logCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  logCardTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.3,
    flex: 1,
  },
  logCardCount: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.2)',
  },
  logCardBody: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  logLineText: {
    fontSize: 11,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.45)',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  logLineError: {
    color: '#f87171',
  },
  // Tool card
  toolCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 10,
    gap: 6,
    marginVertical: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 26,
    height: 26,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commandText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: -0.3,
  },
  executingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#fbbf24',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 34,
  },
  statusDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  outputBlock: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  outputText: {
    fontSize: 10.5,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.4)',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
