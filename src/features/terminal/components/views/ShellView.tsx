import React, { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import {
  View, StyleSheet, Text, TextInput, TouchableOpacity,
  FlatList, Platform, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AppColors } from '../../../../shared/theme/colors';
import { useTerminalStore } from '../../../../core/terminal/terminalStore';
import { Tab, useTabStore } from '../../../../core/tabs/tabStore';
import { useUIStore } from '../../../../core/terminal/uiStore';
import { TerminalItemType } from '../../../../shared/types';
import { usePreviewLogs } from '../../../../hooks/api/usePreviewLogs';
import { useTranslation } from 'react-i18next';

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
type LogKindFilter = 'all' | 'error' | 'tool';
type LogTimeFilter = 'all' | '5m' | '30m' | '2h';

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

const isErrorText = (msg: string): boolean => {
  const lower = String(msg || '').toLowerCase();
  return (
    lower.includes('error') ||
    lower.includes('failed') ||
    lower.includes('enoent') ||
    lower.includes('exception') ||
    lower.includes('fatal')
  );
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
  const { t } = useTranslation('terminal');
  const insets = useSafeAreaInsets();
  const { currentWorkstation } = useTerminalStore();
  const flatListRef = useRef<FlatList>(null);
  const isNearBottomRef = useRef(true);
  const isUserScrollActiveRef = useRef(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isAutoFollowPaused, setIsAutoFollowPaused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<LogKindFilter>('all');
  const [timeFilter, setTimeFilter] = useState<LogTimeFilter>('all');

  const topPadding = insets.top + 38;
  const projectName = currentWorkstation?.name || t('common:project');

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

    toolItems.forEach((item, index) => {
      const ts = item.timestamp instanceof Date ? item.timestamp.getTime() : (item.timestamp || 0);
      const fallbackBase = String(item.toolInfo?.tool || item.content || 'tool')
        .replace(/\s+/g, '-')
        .slice(0, 24);
      raw.push({
        type: 'tool',
        item,
        timestamp: ts,
        id: item.id || `tool-${ts}-${index}-${fallbackBase}`,
      });
    });

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

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const now = Date.now();
    const timeCutoffMs =
      timeFilter === '5m' ? now - 5 * 60 * 1000 :
      timeFilter === '30m' ? now - 30 * 60 * 1000 :
      timeFilter === '2h' ? now - 2 * 60 * 60 * 1000 :
      0;

    return displayEntries.filter((entry) => {
      if (timeCutoffMs > 0 && entry.timestamp < timeCutoffMs) return false;

      if (kindFilter === 'tool' && entry.type !== 'tool') return false;
      if (kindFilter === 'error') {
        if (entry.type === 'tool') {
          if (!entry.isError && !isErrorText(entry.output) && !isErrorText(entry.status)) return false;
        } else if (!entry.messages.some(isErrorText)) {
          return false;
        }
      }

      if (!query) return true;
      if (entry.type === 'tool') {
        return (
          entry.command.toLowerCase().includes(query) ||
          entry.status.toLowerCase().includes(query) ||
          entry.output.toLowerCase().includes(query)
        );
      }
      return entry.messages.some((msg) => msg.toLowerCase().includes(query));
    });
  }, [displayEntries, searchQuery, kindFilter, timeFilter]);

  const updateNearBottom = useCallback((contentOffsetY: number, contentHeight: number, layoutHeight: number) => {
    const distanceFromBottom = contentHeight - contentOffsetY - layoutHeight;
    const nearBottom = distanceFromBottom < 120;
    if (nearBottom !== isNearBottomRef.current) {
      isNearBottomRef.current = nearBottom;
      setShowScrollToBottom(!nearBottom);
    }
  }, []);

  const scrollToBottom = useCallback((animated = true) => {
    isNearBottomRef.current = true;
    setShowScrollToBottom(false);
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated });
    });
  }, []);

  // Auto-follow only while pinned to bottom
  useEffect(() => {
    if (!flatListRef.current || filteredEntries.length === 0) return;
    if (!isNearBottomRef.current || isUserScrollActiveRef.current || isAutoFollowPaused) return;
    const t = setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 60);
    return () => clearTimeout(t);
  }, [filteredEntries.length, isAutoFollowPaused]);

  const handleContentSizeChange = useCallback(() => {
    if (!isNearBottomRef.current || isUserScrollActiveRef.current || isAutoFollowPaused) return;
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated: false });
    });
  }, [isAutoFollowPaused]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    updateNearBottom(contentOffset.y, contentSize.height, layoutMeasurement.height);
  }, [updateNearBottom]);

  const handleScrollBeginDrag = useCallback(() => {
    isUserScrollActiveRef.current = true;
  }, []);

  const handleScrollEndDrag = useCallback(() => {
    isUserScrollActiveRef.current = false;
  }, []);

  const handleMomentumScrollBegin = useCallback(() => {
    isUserScrollActiveRef.current = true;
  }, []);

  const handleMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    isUserScrollActiveRef.current = false;
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    updateNearBottom(contentOffset.y, contentSize.height, layoutMeasurement.height);
  }, [updateNearBottom]);

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
              const isErr = isErrorText(msg);
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

  const hasAnyItems = displayEntries.length > 0;
  const hasItems = filteredEntries.length > 0;
  const logCount = filteredPreviewLogs.length;
  const toolCount = toolItems.length;
  const hasActiveFilters = searchQuery.trim().length > 0 || kindFilter !== 'all' || timeFilter !== 'all';

  useEffect(() => {
    if (!hasItems) {
      isNearBottomRef.current = true;
      setShowScrollToBottom(false);
    }
  }, [hasItems]);

  return (
    <LinearGradient
      colors={AppColors.gradient.dark as unknown as string[]}
      style={[styles.container, { paddingTop: topPadding }]}
    >
      {/* Top bar */}
      <Animated.View entering={FadeIn.duration(200)} style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Ionicons name="receipt-outline" size={16} color="rgba(255,255,255,0.4)" />
          <Text style={styles.topBarTitle}>{t('shellView.log')}</Text>
          <Text style={styles.topBarProject}>{projectName}</Text>
        </View>
        <View style={styles.topBarRight}>
          <TouchableOpacity
            onPress={() => setIsAutoFollowPaused((prev) => !prev)}
            style={[styles.followToggleButton, isAutoFollowPaused && styles.followToggleButtonPaused]}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isAutoFollowPaused ? 'pause' : 'play'}
              size={10}
              color={isAutoFollowPaused ? '#fbbf24' : '#4ade80'}
            />
            <Text style={[styles.followToggleText, isAutoFollowPaused && styles.followToggleTextPaused]}>
              {isAutoFollowPaused ? t('shellView.pause') : t('shellView.auto')}
            </Text>
          </TouchableOpacity>
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

      <View style={styles.filtersContainer}>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('shellView.searchPlaceholder')}
          placeholderTextColor="rgba(255,255,255,0.3)"
          style={styles.searchInput}
        />
        <View style={styles.filterRow}>
          {([
            { key: 'all', label: t('common:all') },
            { key: 'error', label: t('common:error') },
            { key: 'tool', label: t('shellView.tool') },
          ] as { key: LogKindFilter; label: string }[]).map((chip) => (
            <TouchableOpacity
              key={chip.key}
              onPress={() => setKindFilter(chip.key)}
              style={[styles.filterChip, kindFilter === chip.key && styles.filterChipActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterChipText, kindFilter === chip.key && styles.filterChipTextActive]}>
                {chip.label}
              </Text>
            </TouchableOpacity>
          ))}
          {([
            { key: 'all', label: t('shellView.always') },
            { key: '5m', label: '5m' },
            { key: '30m', label: '30m' },
            { key: '2h', label: '2h' },
          ] as { key: LogTimeFilter; label: string }[]).map((chip) => (
            <TouchableOpacity
              key={chip.key}
              onPress={() => setTimeFilter(chip.key)}
              style={[styles.filterChip, timeFilter === chip.key && styles.timeFilterChipActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterChipText, timeFilter === chip.key && styles.filterChipTextActive]}>
                {chip.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Content */}
      {!hasItems ? (
        <View style={styles.emptyState}>
          <Ionicons name="terminal-outline" size={48} color="rgba(255,255,255,0.06)" />
          <Text style={styles.emptyTitle}>{hasAnyItems ? t('common:noResults') : t('shellView.noLogs')}</Text>
          <Text style={styles.emptySubtitle}>
            {hasAnyItems && hasActiveFilters
              ? t('shellView.changeFilters')
              : t('shellView.emptyState')}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={filteredEntries}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={handleContentSizeChange}
          onScroll={handleScroll}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollBegin={handleMomentumScrollBegin}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          scrollEventThrottle={16}
        />
      )}

      {showScrollToBottom && hasItems && (
        <TouchableOpacity
          style={styles.scrollToBottomButton}
          onPress={() => scrollToBottom(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-down" size={14} color="#FFFFFF" />
          <Text style={styles.scrollToBottomText}>Torna in basso</Text>
        </TouchableOpacity>
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
    alignItems: 'center',
    gap: 6,
  },
  followToggleButton: {
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(74,222,128,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.25)',
  },
  followToggleButtonPaused: {
    backgroundColor: 'rgba(251,191,36,0.14)',
    borderColor: 'rgba(251,191,36,0.35)',
  },
  followToggleText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#4ade80',
    letterSpacing: 0.2,
  },
  followToggleTextPaused: {
    color: '#fbbf24',
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
  filtersContainer: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 8,
  },
  searchInput: {
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(0,0,0,0.22)',
    paddingHorizontal: 12,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  filterChipActive: {
    borderColor: 'rgba(248,113,113,0.42)',
    backgroundColor: 'rgba(248,113,113,0.13)',
  },
  timeFilterChipActive: {
    borderColor: 'rgba(88,166,255,0.4)',
    backgroundColor: 'rgba(88,166,255,0.13)',
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
  },
  filterChipTextActive: {
    color: 'rgba(255,255,255,0.9)',
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
    paddingBottom: 128,
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
  scrollToBottomButton: {
    position: 'absolute',
    right: 14,
    bottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(20,20,25,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(88,166,255,0.4)',
  },
  scrollToBottomText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
});
