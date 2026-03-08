import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, FlatList, TouchableOpacity, KeyboardAvoidingView, Platform, Keyboard, Pressable, Dimensions, Image, Alert, Linking, ActivityIndicator } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence, withRepeat, interpolate, Extrapolate, Easing } from 'react-native-reanimated';
import apiClient from '../../core/api/apiClient';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { applyGlassEffect, removeGlassEffect, removeAllGlassEffects } from '../../shared/components/NativeGlassView';
import { useTranslation } from 'react-i18next';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { useChatStore } from '../../core/terminal/chatStore';
import { useWorkstationStore } from '../../core/terminal/workstationStore';
import { useUIStore } from '../../core/terminal/uiStore';
import { TerminalItemType } from '../../shared/types';
import { AppColors } from '../../shared/theme/colors';
import { WelcomeView } from '../../features/terminal/components/WelcomeView';
import { TerminalItem as TerminalItemComponent } from '../../features/terminal/components/TerminalItem';
import { Sidebar } from '../../features/terminal/components/Sidebar';
import { VSCodeSidebar } from '../../features/terminal/components/VSCodeSidebar';
import { SafeText } from '../../shared/components/SafeText';
import { ThinkingIndicator } from '../../shared/components/atoms/ThinkingIndicator';
// import { PreviewEye } from './components/PreviewEye';
import { githubService } from '../../core/github/githubService';
import { aiService } from '../../core/ai/aiService';
import { useTabStore, Tab } from '../../core/tabs/tabStore';
import { ToolService } from '../../core/ai/toolService';
import { useAuthStore } from '../../core/auth/authStore';
import { config } from '../../config/config';
import { getAuthToken, getAuthHeaders } from '../../core/api/getAuthToken';

import { FileViewer } from '../../features/terminal/components/FileViewer';
import { TerminalView } from '../../features/terminal/components/TerminalView';
import { GitHubView } from '../../features/terminal/components/views/GitHubView';
import { BrowserView } from '../../features/terminal/components/views/BrowserView';
import { PreviewView } from '../../features/terminal/components/views/PreviewView';
import { SupabaseView } from '../../features/terminal/components/views/SupabaseView';
import { FigmaView } from '../../features/terminal/components/views/FigmaView';
import { EnvVarsView } from '../../features/terminal/components/views/EnvVarsView';
import { TasksView } from '../../features/terminal/components/views/TasksView';
import { ShellView } from '../../features/terminal/components/views/ShellView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSidebarOffset } from '../../features/terminal/context/SidebarContext';
import { useChatState } from '../../hooks/business/useChatState';
import { useContentOffset } from '../../hooks/ui/useContentOffset';
import { AnthropicIcon, GoogleIcon, OpenAIIcon } from '../../shared/components/icons';
import { useFileHistoryStore } from '../../core/history/fileHistoryStore';
import { UndoRedoBar } from '../../features/terminal/components/UndoRedoBar';
import { useAgentStream } from '../../hooks/api/useAgentStream';
import { useChatEngine, type ChatEngineMessage } from '../../hooks/engine/useChatEngine';
import { stripToolCallXml } from '../../shared/utils/stripToolCallXml';
import { useAgentStore } from '../../core/agent/agentStore';
import { useFileCacheStore } from '../../core/cache/fileCacheStore';
// PlanApprovalModal removed - plans now shown inline in chat
import { AgentStatusBadge } from '../../shared/components/molecules/AgentStatusBadge';
import { TodoList } from '../../shared/components/molecules/TodoList';
// AskUserQuestionModal removed — questions shown inline in chat
import { SubAgentStatus } from '../../shared/components/molecules/SubAgentStatus';
import { AgentProgress } from '../../shared/components/molecules/AgentProgress';
import { useNavigationStore } from '../../core/navigation/navigationStore';
import { SpotlightOverlay } from '../../shared/components/SpotlightOverlay';
import { ChatWelcomeOverlay } from '../../shared/components/ChatWelcomeOverlay';
import Svg, { Circle } from 'react-native-svg';
// WebSocket log service disabled - was causing connect/disconnect loop
// import { websocketLogService, BackendLog } from '../../core/services/websocketLogService';

const colors = AppColors.dark;
const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

// Helper to parse undo data from tool results
const parseUndoData = (result: string): { cleanResult: string; undoData: any | null } => {
  const undoMatch = result.match(/<!--UNDO:(.*?)-->/s);
  if (undoMatch) {
    try {
      const undoData = JSON.parse(undoMatch[1]);
      const cleanResult = result.replace(/\n?<!--UNDO:.*?-->/s, '');
      return { cleanResult, undoData };
    } catch (e) {
      console.warn('Failed to parse undo data:', e);
    }
  }
  return { cleanResult: result, undoData: null };
};

// Available AI models with custom icon components
const AI_MODELS = [
  { id: 'claude-4-6-opus', name: 'Claude 4.6 Opus', IconComponent: AnthropicIcon, hasThinking: true, isPremium: true },
  { id: 'claude-4-6-sonnet', name: 'Claude 4.6 Sonnet', IconComponent: AnthropicIcon, hasThinking: true },
  { id: 'gpt-5-3', name: 'GPT 5.3', IconComponent: OpenAIIcon, hasThinking: false, isPremium: true },
  { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro', IconComponent: GoogleIcon, hasThinking: true, thinkingLevels: ['none', 'low', 'high'], isPremium: true },
  { id: 'gemini-3-flash', name: 'Gemini 3.0 Flash', IconComponent: GoogleIcon, hasThinking: true, thinkingLevels: ['none', 'minimal', 'low', 'medium', 'high'] },
];

// Thinking level labels for display
const THINKING_LEVEL_LABELS: Record<string, string> = {
  none: 'Off',
  minimal: 'Minimo',
  low: 'Basso',
  medium: 'Medio',
  high: 'Alto',
};

interface ChatPageProps {
  tab?: Tab;
  isCardMode: boolean;
  cardDimensions: { width: number; height: number; };
  animatedStyle?: any;
}

const ChatPage = ({ tab, isCardMode, cardDimensions, animatedStyle }: ChatPageProps) => {
  const { t } = useTranslation('chat');
  // Use custom hooks for state management and UI concerns
  const chatState = useChatState(isCardMode);

  const scrollViewRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  const { sidebarTranslateX, hideSidebar, showSidebar, setForceHideToggle } = useSidebarOffset();

  // ── Auto-scroll tracking ────────────────────────────────────────
  const contentHeightRef = useRef(0);
  const layoutHeightRef = useRef(0);
  const isNearBottomRef = useRef(true);        // true = user hasn't scrolled up
  const scrollLockUntilRef = useRef(0);        // timestamp: ignore onScroll isNearBottom updates until
  const isUserScrollActiveRef = useRef(false); // true only while user is actively scrolling
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const setNearBottomState = useCallback((nearBottom: boolean) => {
    isNearBottomRef.current = nearBottom;
    setShowScrollToBottom((prev) => {
      const next = !nearBottom;
      return prev === next ? prev : next;
    });
  }, []);

  // ── Scroll helper (declared early, used by multiple effects) ──────────
  const scrollToBottom = useCallback((animated = true) => {
    setNearBottomState(true);
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd?.({ animated });

      const offset = contentHeightRef.current - layoutHeightRef.current;
      if (offset > 0) {
        scrollViewRef.current?.scrollToOffset({ offset, animated });
      }
    });
  }, [setNearBottomState]);

  // Destructure chat state for easier access
  const {
    input,
    setInput,
    isTerminalMode,
    setIsTerminalMode,
    forcedMode,
    setForcedMode,
    selectedModel,
    setSelectedModel,
    thinkingLevel,
    setThinkingLevel,
    conversationHistory,
    setConversationHistory,
    scrollPaddingBottom,
    setScrollPaddingBottom,
    isProcessingToolsRef,
    tabInputsRef,
    previousTabIdRef,
    previousInputRef,
    widgetHeight,
    scaleAnim,
    inputPositionAnim,
    borderAnim,
    hasChatStartedAnim,
    cardModeAnim,
    keyboardHeight,
  } = chatState;

  // Agent state - 2-mode system (Fast or Terminal)
  const [agentMode, setAgentMode] = useState<'fast' | 'terminal'>('fast');
  const [isInputbarTodoCollapsed, setIsInputbarTodoCollapsed] = useState(false);
  const [isInputbarTodoDismissed, setIsInputbarTodoDismissed] = useState(false);

  // User plan state for upgrade CTA
  const { user } = useAuthStore();
  const isPaidUser = ['go', 'pro', 'team'].includes(user?.plan || '');
  const navigateTo = useNavigationStore((state) => state.navigateTo);
  const {
    start: startAgent,
    startExecuting: executeAgentPlan,
    stop: stopAgent,
    isRunning: agentStreaming,
    events: agentEvents,
    eventsVersion: agentEventsVersion,
    currentTool: agentCurrentTool,
    plan: agentPlan,
    reset: resetAgent
  } = useAgentStream('fast');
  // const [activeAgentProgressId, setActiveAgentProgressId] = useState<string | null>(null); // REMOVED
  const [showNextJsWarning, setShowNextJsWarning] = useState(false);
  const [nextJsWarningData, setNextJsWarningData] = useState<any>(null);

  // Liquid Glass Shimmer Animation - flows across the button
  const shimmerX = useSharedValue(-150);
  // Need activeTabId BEFORE the glass useEffect so the dependency array works
  const activeTabId = useTabStore((state) => state.activeTabId);
  const isSidebarOpen = useUIStore((state) => state.isSidebarOpen);
  const isActiveTab = (tab?.id ?? activeTabId) === activeTabId;
  const inputBarGlassId = useMemo(() => {
    const rawId = tab?.id ?? activeTabId ?? 'main';
    const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `inputBarGlass-${safeId}`;
  }, [tab?.id, activeTabId]);
  const lastGlassIdRef = useRef<string | null>(null);
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Apply native glass effect imperatively — lives in native, React can't touch it
  const [glassApplied, setGlassApplied] = useState(false);

  const applyInputGlass = useCallback(async (prevId?: string | null) => {
    if (Platform.OS !== 'ios' || !isActiveTab || isSidebarOpen) return;
    const ok = await applyGlassEffect(inputBarGlassId, 28);
    if (ok) {
      setGlassApplied(true);
      if (prevId && prevId !== inputBarGlassId) {
        if (removeTimerRef.current) {
          clearTimeout(removeTimerRef.current);
          removeTimerRef.current = null;
        }
        removeTimerRef.current = setTimeout(() => {
          removeGlassEffect(prevId);
        }, 32);
      }
    }
  }, [inputBarGlassId, isActiveTab, isSidebarOpen]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !isActiveTab) return;
    if (isSidebarOpen) {
      if (removeTimerRef.current) {
        clearTimeout(removeTimerRef.current);
        removeTimerRef.current = null;
      }
      setGlassApplied(false);
      removeGlassEffect(inputBarGlassId);
      return;
    }
    let cancelled = false;
    const prevId = lastGlassIdRef.current;
    if (removeTimerRef.current) {
      clearTimeout(removeTimerRef.current);
      removeTimerRef.current = null;
    }
    setGlassApplied(false);
    lastGlassIdRef.current = inputBarGlassId;
    applyInputGlass(prevId);
    const delays = [0, 80, 200];
    const timers = delays.map(ms =>
      setTimeout(async () => {
        if (cancelled) return;
        const ok = await applyGlassEffect(inputBarGlassId, 28);
        if (ok && !cancelled) setGlassApplied(true);
      }, ms)
    );
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      if (removeTimerRef.current) {
        clearTimeout(removeTimerRef.current);
        removeTimerRef.current = null;
      }
      const idToRemove = inputBarGlassId;
      removeTimerRef.current = setTimeout(() => {
        removeGlassEffect(idToRemove);
      }, 180);
    };
  }, [activeTabId, inputBarGlassId, isActiveTab, applyInputGlass, isSidebarOpen]);

  // Apply glass to model dropdown when it opens
  useEffect(() => {
    if (Platform.OS !== 'ios' || !showModelSelector) return;
    const timer = setTimeout(() => applyGlassEffect('modelDropdownGlass', 16), 100);
    return () => {
      clearTimeout(timer);
      removeGlassEffect('modelDropdownGlass');
    };
  }, [showModelSelector]);

  useEffect(() => {
    shimmerX.value = withRepeat(
      withTiming(150, { duration: 3000, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
      -1,
      false
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }, { skewX: '-20deg' }],
  }));

  const nextPlanLabel = user?.plan === 'go' ? 'Pro' : 'Go';

  // ── Engine: shared event processing ──────────────────────────────
  const engine = useChatEngine(agentEvents, agentStreaming, agentEventsVersion);

  // Bridge refs to sync engine.messages → tabStore terminal items
  const preThinkingIdRef = useRef<string | null>(null);
  const engineIdMapRef = useRef<Map<string, string>>(new Map());
  const prevEngineMessagesRef = useRef<ChatEngineMessage[]>([]);

  // ── Tool formatting helpers ──────────────────────────────────────

  /** Format the executing message shown while a tool is running */
  const getToolStartMessage = (tool: string, input: any): string => {
    let parsedInput: any = {};
    try {
      parsedInput = typeof input === 'string' ? JSON.parse(input) : (input || {});
    } catch { parsedInput = input || {}; }

    const getFileName = (i: any) => {
      const path = i?.path || i?.filePath || i?.file_path || '';
      return path ? path.split('/').pop() || path : '';
    };

    const toolMessages: Record<string, (i: any) => string> = {
      'read_file': (i) => { const f = getFileName(i); return f ? `Read ${f}\n└─ Reading...` : `Read file\n└─ Reading...`; },
      'write_file': (i) => { const f = getFileName(i); return f ? `Write ${f}\n└─ Writing...` : `Write file\n└─ Writing...`; },
      'edit_file': (i) => { const f = getFileName(i); return f ? `Edit ${f}\n└─ Applying edit...` : `Edit file\n└─ Applying edit...`; },
      'list_directory': (i) => `List files in ${i?.path || i?.directory || '.'}\n└─ Loading...`,
      'list_files': (i) => `List files in ${i?.path || i?.directory || '.'}\n└─ Loading...`,
      'search_in_files': (i) => { const p = i?.pattern || i?.query; return p ? `Search "${p}"\n└─ Searching...` : `Search\n└─ Searching...`; },
      'grep_search': (i) => { const p = i?.pattern || i?.query; return p ? `Search "${p}"\n└─ Searching...` : `Search\n└─ Searching...`; },
      'glob_files': (i) => { const p = i?.pattern; return p ? `Glob pattern: ${p}\n└─ Searching...` : `Glob\n└─ Searching...`; },
      'run_command': (i) => { const c = i?.command; return c ? `Run command\n└─ ${c.substring(0, 50)}...` : `Run command\n└─ Executing...`; },
      'execute_command': (i) => { const c = i?.command; return c ? `Run command\n└─ ${c.substring(0, 50)}...` : `Run command\n└─ Executing...`; },
      'web_search': (i) => { const q = i?.query; return q ? `Web search\n└─ "${q}"...` : `Web search\n└─ Searching...`; },
      'web_fetch': () => `Fetch URL\n└─ Loading...`,
      'multi_edit_file': (i) => { const f = getFileName(i); const n = i?.edits?.length || '?'; return f ? `Multi-edit ${f}\n└─ Applying ${n} edits...` : `Multi-edit file\n└─ Applying ${n} edits...`; },
      'patch_file': (i) => { const f = getFileName(i); return f ? `Patch ${f}\n└─ Applying diff...` : `Patch file\n└─ Applying diff...`; },
      'load_skill': (i) => { const n = i?.name; return n ? `Load skill: ${n}\n└─ Loading...` : `List skills\n└─ Discovering...`; },
      'tool_search': (i) => { const q = i?.query; return q ? `Tool search\n└─ "${q}"...` : `Tool search\n└─ Searching...`; },
      'command_output': (i) => { const id = i?.command_id || '?'; return `Check command\n└─ ${id}`; },
      'memory_read': () => `Read memory\n└─ Loading project memory...`,
      'memory_write': () => `Save memory\n└─ Updating project memory...`,
      'dispatch_agent': (i) => { const t = i?.type || 'agent'; const p = i?.prompt?.substring(0, 60) || 'Processing...'; return `Agent: ${t}\n└─ ${p}`; },
      'ask_user_question': (i) => {
        const questions = i?.questions;
        if (Array.isArray(questions) && questions.length > 0) {
          const questionText = questions.map((q: any) => q?.question || q).join('\n   ');
          return `User Question\n└─ ${questionText}`;
        }
        return `User Question\n└─ Waiting for response...`;
      },
      'todo_write': () => `Todo List\n└─ Updating...`,
    };

    const getMessage = toolMessages[tool];
    if (getMessage) {
      try { return getMessage(parsedInput); } catch { return `${tool}\n└─ Running...`; }
    }
    return `${tool}\n└─ Running...`;
  };

  /** Format a completed tool result for terminal display */
  const formatToolResult = (tool: string, toolInput: any, rawResult: any): string => {
    let result = '';
    let hasError = false;
    let errorMessage = '';
    try {
      if (rawResult !== null && rawResult !== undefined) {
        if (typeof rawResult === 'object' && rawResult.success === false) {
          hasError = true;
          errorMessage = rawResult.error || 'Unknown error';
        } else if (typeof rawResult === 'object' && rawResult.content) {
          result = typeof rawResult.content === 'string' ? rawResult.content : JSON.stringify(rawResult.content);
        } else if (typeof rawResult === 'object' && rawResult.message) {
          result = rawResult.message;
        } else {
          result = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);
        }
      }
    } catch { result = ''; }

    let input: any = {};
    try {
      if (toolInput) {
        input = typeof toolInput === 'string' ? JSON.parse(toolInput) : toolInput;
      }
    } catch { input = {}; }

    const getFileName = (i: any) => {
      const filePath = i?.file_path || i?.path || i?.filePath || '';
      return filePath ? filePath.split('/').pop() || filePath : '';
    };

    if (tool === 'read_file') {
      const f = getFileName(input);
      const lines = result ? result.split('\n').length : 0;
      return `Read ${f || 'file'}\n└─ ${lines} line${lines !== 1 ? 's' : ''}\n\n${result}`;
    }
    if (tool === 'write_file') {
      const f = getFileName(input);
      if (hasError) return `Write ${f || 'file'}\n└─ Error: ${errorMessage}`;
      return `Write ${f || 'file'}\n└─ File created`;
    }
    if (tool === 'edit_file') {
      const f = getFileName(input);
      if (hasError) return `Edit ${f || 'file'}\n└─ Error: ${errorMessage}`;
      return `Edit ${f || 'file'}\n└─ File modified${result ? `\n\n${result}` : ''}`;
    }
    if (tool === 'glob_files') {
      const pattern = input?.pattern || 'files';
      const fileCount = result ? result.split('\n').filter((l: string) => l.trim()).length : 0;
      return `Glob pattern: ${pattern}\n└─ Found ${fileCount} file(s)\n\n${result}`;
    }
    if (tool === 'list_directory' || tool === 'list_files') {
      const dir = input?.directory || input?.dirPath || input?.path || '.';
      const fileCount = result ? result.split('\n').filter((l: string) => l.trim()).length : 0;
      return `List files in ${dir}\n└─ ${fileCount} file${fileCount !== 1 ? 's' : ''}\n\n${result}`;
    }
    if (tool === 'search_in_files' || tool === 'grep_search') {
      const pattern = input?.pattern || input?.query || 'pattern';
      const matches = result ? result.split('\n').filter((l: string) => l.includes(':')).length : 0;
      return `Search "${pattern}"\n└─ ${matches} match${matches !== 1 ? 'es' : ''}\n\n${result}`;
    }
    if (tool === 'run_command' || tool === 'execute_command') {
      const cmd = input?.command || 'command';
      if (cmd.startsWith('curl')) {
        const urlMatch = cmd.match(/curl\s+(?:-[sS]\s+)?(?:['"])?([^\s'"]+)/);
        const url = urlMatch ? urlMatch[1] : cmd.substring(5).trim();
        let exitCode = 0, stdout = '', stderr = '';
        try {
          if (typeof rawResult === 'object' && rawResult !== null) {
            exitCode = rawResult.exitCode || 0;
            stdout = rawResult.stdout || '';
            stderr = rawResult.stderr || '';
          } else if (typeof result === 'string' && result.includes('exitCode')) {
            const parsed = JSON.parse(result);
            exitCode = parsed.exitCode || 0;
            stdout = parsed.stdout || '';
            stderr = parsed.stderr || '';
          }
        } catch { stdout = result || ''; }
        const curlHasError = exitCode !== 0 || stderr;
        const status = curlHasError ? `Error (exit ${exitCode})` : 'Completed';
        let output = '';
        if (stdout && stdout.trim()) output = `\n\n${stdout}`;
        if (stderr && stderr.trim()) output += `\n\nError: ${stderr}`;
        return `Execute: curl ${url}\n└─ ${status}${output}`;
      }
      let actualOutput = result;
      if (typeof rawResult === 'object' && rawResult !== null && rawResult.stdout) {
        actualOutput = rawResult.stdout;
      }
      const cmdResultLines = (actualOutput || '').split('\n');
      const MAX_OUTPUT_LINES = 50;
      let truncatedResult = actualOutput;
      if (cmdResultLines.length > MAX_OUTPUT_LINES) {
        truncatedResult = cmdResultLines.slice(0, MAX_OUTPUT_LINES).join('\n') +
          `\n\n... (${cmdResultLines.length - MAX_OUTPUT_LINES} more lines - expand to see all)`;
      }
      return `Execute: ${cmd}\n└─ Command completed\n\n${truncatedResult}`;
    }
    if (tool === 'multi_edit_file') {
      const f = getFileName(input);
      const editCount = input?.edits?.length || '?';
      if (hasError) return `Multi-edit ${f || 'file'}\n└─ Error: ${errorMessage}`;
      // Backend result includes "Multi-edit file\n└─ N edits applied\n\nEdit 1:\n- old\n+ new..."
      // Extract only the diff part (after the first double newline)
      const diffStart = result.indexOf('\n\n');
      const diffContent = diffStart >= 0 ? result.substring(diffStart + 2) : '';
      return `Multi-edit ${f || 'file'}\n└─ ${editCount} edits applied${diffContent ? `\n\n${diffContent}` : ''}`;
    }
    if (tool === 'dispatch_agent') {
      const agentType = input?.type || 'agent';
      const description = input?.prompt?.substring(0, 80) || 'Task';
      if (hasError) return `Agent: ${agentType}\n└─ Error: ${errorMessage}\n\n${description}`;
      return `Agent: ${agentType}\n└─ Completed\n\n${description}${result ? `\n\n${result.substring(0, 1000)}` : ''}`;
    }
    if (tool === 'patch_file') {
      const f = getFileName(input);
      if (hasError) return `Patch ${f || 'file'}\n└─ Error: ${errorMessage}`;
      return `Patch ${f || 'file'}\n└─ Applied`;
    }
    if (tool === 'load_skill') {
      const skillName = input?.name || 'skills';
      if (hasError) return `Skill ${skillName}\n└─ ${errorMessage}`;
      return `Skill: ${skillName}\n└─ Loaded\n\n${result.substring(0, 1500)}${result.length > 1500 ? '...' : ''}`;
    }
    if (tool === 'tool_search') {
      return `Tool search\n└─ ${result.substring(0, 1000)}`;
    }
    if (tool === 'command_output') {
      const cmdId = input?.command_id || '?';
      if (hasError) return `Check command ${cmdId}\n└─ Error: ${errorMessage}`;
      return `Check command ${cmdId}\n└─ ${result.includes('still running') ? 'Still running...' : 'Completed'}\n\n${result.substring(0, 2000)}`;
    }
    if (tool === 'memory_read') {
      if (!result || result.includes('No memory saved')) return `Read memory\n└─ No memory saved yet`;
      return `Read memory\n└─ Loaded\n\n${result.substring(0, 1500)}${result.length > 1500 ? '...' : ''}`;
    }
    if (tool === 'memory_write') {
      if (hasError) return `Save memory\n└─ Error: ${errorMessage}`;
      return `Save memory\n└─ Updated`;
    }
    if (tool === 'web_fetch') {
      const url = input?.url || 'URL';
      const urlShort = url.length > 50 ? url.substring(0, 50) + '...' : url;
      return `Fetch: ${urlShort}\n└─ Completed\n\n${result.substring(0, 2000)}${result.length > 2000 ? '...' : ''}`;
    }
    if (tool === 'launch_sub_agent') {
      const agentType = input?.subagent_type || input?.type || 'agent';
      const description = input?.description || input?.prompt?.substring(0, 60) || 'Task';
      if (hasError) return `Agent: ${agentType}\n└─ Error: ${errorMessage}\n\n${description}`;
      let summary = '';
      try {
        if (typeof rawResult === 'object' && rawResult?.summary) summary = rawResult.summary;
        else if (typeof result === 'string' && result.length > 0 && result !== 'undefined') summary = result;
      } catch { /* ignore */ }
      return `Agent: ${agentType}\n└─ Completed\n\n${description}${summary ? `\n\n${summary}` : ''}`;
    }
    if (tool === 'todo_write') {
      let todos: any[] = [];
      try { todos = input?.todos || []; } catch { /* ignore */ }
      const totalTasks = todos.length;
      const completedTasks = todos.filter((t: any) => t.status === 'completed').length;
      const inProgressTasks = todos.filter((t: any) => t.status === 'in_progress').length;
      const todoLines = todos.map((todo: any) => `${todo.status || 'pending'}|${todo.content || ''}`).join('\n');
      return `Todo List\n└─ ${totalTasks} task${totalTasks !== 1 ? 's' : ''} (${completedTasks} done, ${inProgressTasks} in progress)\n\n${todoLines}`;
    }
    if (tool === 'web_search') {
      let searchResults: any[] = [];
      let query = '', count = 0;
      try {
        if (typeof rawResult === 'object' && rawResult?.results) {
          searchResults = rawResult.results || [];
          query = rawResult.query || input?.query || 'query';
          count = rawResult.count || searchResults.length;
        }
      } catch { /* ignore */ }
      const srLines = searchResults.map((r: any) => `${r.title || 'Untitled'}|${r.url || ''}|${r.snippet || ''}`).join('\n');
      return `Web Search "${query}"\n└─ ${count} result${count !== 1 ? 's' : ''} found\n\n${srLines}`;
    }
    if (tool === 'ask_user_question') {
      let questions: any[] = [];
      let answers: any = {};
      try {
        if (input?.questions) questions = input.questions;
        if (typeof rawResult === 'object' && rawResult?.answers) answers = rawResult.answers;
      } catch { /* ignore */ }
      const qaLines = questions.map((q: any, idx: number) => `${q.question || ''}|${answers[`q${idx}`] || 'No answer'}`).join('\n');
      return `User Question\n└─ ${questions.length} question${questions.length !== 1 ? 's' : ''} answered\n\n${qaLines}`;
    }
    return `${tool}\n└─ Completed\n\n${result}`;
  };

  /** Map a ChatEngineMessage to terminal item properties */
  const formatEngineMessage = (msg: ChatEngineMessage): any => {
    const costProps: any = {};
    if ((msg as any).costEur) {
      costProps.costEur = (msg as any).costEur;
    }
    if ((msg as any).tokensUsed) {
      costProps.tokensUsed = (msg as any).tokensUsed;
    }

    switch (msg.type) {
      case 'thinking':
        return { content: msg.content || '', type: TerminalItemType.OUTPUT, timestamp: msg.timestamp, isThinking: msg.isThinking, thinkingContent: msg.thinkingContent || '' };
      case 'text':
        return { content: msg.content || '', type: TerminalItemType.OUTPUT, timestamp: msg.timestamp, isThinking: false, thinkingContent: '', ...costProps };
      case 'tool_start':
        return {
          content: getToolStartMessage(msg.tool!, msg.toolInput),
          type: TerminalItemType.OUTPUT,
          timestamp: msg.timestamp,
          isExecuting: true,
          toolInfo: {
            tool: msg.tool!,
            input: msg.toolInput,
            status: 'running' as const,
          },
        };
      case 'tool_complete':
        return {
          content: formatToolResult(msg.tool!, msg.toolInput, msg.toolResult),
          type: TerminalItemType.OUTPUT,
          timestamp: msg.timestamp,
          isExecuting: false,
          toolInfo: {
            tool: msg.tool!,
            input: msg.toolInput,
            output: msg.toolResult,
            status: 'completed' as const,
          },
        };
      case 'tool_error':
        return {
          content: `${msg.tool}\n└─ Error`,
          type: TerminalItemType.OUTPUT,
          timestamp: msg.timestamp,
          isExecuting: false,
          toolInfo: {
            tool: msg.tool!,
            input: msg.toolInput,
            output: msg.toolResult,
            status: 'error' as const,
          },
        };
      case 'error':
        return { content: msg.content || t('composer.unknownError'), type: TerminalItemType.ERROR, timestamp: msg.timestamp };
      case 'context_compacted':
        return { content: msg.isCompacting ? '__CONTEXT_COMPACTING__' : '__CONTEXT_COMPACTED__', type: TerminalItemType.OUTPUT, timestamp: msg.timestamp };
      case 'budget_exceeded':
        return { content: '__BUDGET_EXCEEDED__', type: TerminalItemType.OUTPUT, timestamp: msg.timestamp };
      case 'completion':
        return { content: msg.content || '', type: TerminalItemType.OUTPUT, timestamp: msg.timestamp, isAgentMessage: true };
      default:
        return { content: msg.content || '', type: TerminalItemType.OUTPUT, timestamp: msg.timestamp };
    }
  };

  // Sub-agent state (not handled by engine)
  const [currentSubAgent, setCurrentSubAgent] = useState<any>(null);

  // Agent store - use specific selectors to prevent unnecessary re-renders
  const agentIteration = useAgentStore((state) => state.iteration);
  const agentCurrentPrompt = useAgentStore((state) => state.currentPrompt);
  const agentFilesCreated = useAgentStore((state) => state.filesCreated);
  const agentFilesModified = useAgentStore((state) => state.filesModified);
  const setCurrentPrompt = useAgentStore((state) => state.setCurrentPrompt);
  const setCurrentProjectId = useAgentStore((state) => state.setCurrentProjectId);

  // Tools bottom sheet state
  const [showToolsSheet, setShowToolsSheet] = useState(false);
  const toolsSheetAnim = useSharedValue(SCREEN_HEIGHT);
  const [recentPhotos, setRecentPhotos] = useState<{ uri: string; originalUri?: string; id: string }[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());

  // Selected images for input preview (from tools sheet)
  const [selectedInputImages, setSelectedInputImages] = useState<{ uri: string; base64: string; type: string }[]>([]);

  // Load recent photos when sheet opens
  const loadRecentPhotos = useCallback(async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        return;
      }

      const media = await MediaLibrary.getAssetsAsync({
        first: 4,
        mediaType: 'photo',
        sortBy: ['creationTime'],
      });

      // Get asset info to obtain localUri for each photo
      const photosWithLocalUri = await Promise.all(
        media.assets.map(async (asset) => {
          const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
          return {
            uri: assetInfo.localUri || asset.uri, // Use localUri for rendering
            originalUri: asset.uri, // Keep original for reference
            id: asset.id,
          };
        })
      );

      setRecentPhotos(photosWithLocalUri);
    } catch (error) {
      console.error('[ChatPage] Failed to load recent photos:', error);
    }
  }, []);

  const toggleToolsSheet = useCallback(() => {
    if (showToolsSheet) {
      if (showSidebar) showSidebar();
      if (setForceHideToggle) setForceHideToggle(false);
      toolsSheetAnim.value = withTiming(SCREEN_HEIGHT, {
        duration: 300,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1)
      });
      setTimeout(() => {
        setShowToolsSheet(false);
        setSelectedPhotoIds(new Set()); // Clear selection when closing
        // Restore input bar glass after sheet closes
        if (Platform.OS === 'ios') applyInputGlass();
      }, 300);
    } else {
      Keyboard.dismiss(); // Close keyboard when opening sheet
      if (hideSidebar) hideSidebar();
      if (setForceHideToggle) setForceHideToggle(true);
      // Remove input bar glass so it doesn't render on top of the sheet
      if (Platform.OS === 'ios') removeGlassEffect(inputBarGlassId);
      setShowToolsSheet(true);
      loadRecentPhotos(); // Load photos when opening
      toolsSheetAnim.value = withTiming(0, {
        duration: 400,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1)
      });
    }
  }, [showToolsSheet, hideSidebar, showSidebar, setForceHideToggle, loadRecentPhotos, inputBarGlassId, applyInputGlass]);

  const pickImageFromLibrary = useCallback(async () => {
    toggleToolsSheet();
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        t('common:galleryPermissionTitle'),
        t('common:galleryPermissionRequired'),
        [
          { text: t('common:cancel'), style: 'cancel' },
          { text: t('common:openSettings'), onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets) {
      const newImages = result.assets.map(asset => ({
        uri: asset.uri,
        base64: asset.base64 ?? '',
        type: asset.mimeType ?? 'image/jpeg',
      }));
      setSelectedInputImages(prev => {
        const combined = [...prev, ...newImages];
        return combined.slice(0, 4);
      });
    }
  }, [toggleToolsSheet]);


  const sendSelectedPhotos = useCallback(async () => {
    if (selectedPhotoIds.size === 0) return;

    try {
      // Get selected photos
      const selectedPhotos = recentPhotos.filter(photo => selectedPhotoIds.has(photo.id));

      // Load photo data with base64
      const photosWithBase64 = await Promise.all(
        selectedPhotos.map(async (photo) => {
          // Use ImageManipulator to handle ph:// URIs and save to file
          // Use originalUri if available (for ph:// URIs), otherwise use uri
          const sourceUri = photo.originalUri || photo.uri;

          // Optimize images aggressively: resize to 512px and compress heavily
          // AI models don't need high resolution - 512px is sufficient for understanding
          const manipulatedImage = await ImageManipulator.manipulateAsync(
            sourceUri,
            [{ resize: { width: 512 } }],  // Resize to max 512px width (maintains aspect ratio)
            { compress: 0.2, format: ImageManipulator.SaveFormat.JPEG }  // Aggressive compression (80% reduction)
          );

          // Read the file as base64
          const base64 = await FileSystem.readAsStringAsync(manipulatedImage.uri, {
            encoding: 'base64',
          });

          // Clean up temp file
          await FileSystem.deleteAsync(manipulatedImage.uri, { idempotent: true });

          // Return clean object with no circular references
          return {
            uri: String(photo.uri),
            base64: String(base64),
            type: 'image/jpeg'
          };
        })
      );

      // Add photos to input preview instead of sending directly (max 4)
      setSelectedInputImages(prev => {
        const remainingSlots = 4 - prev.length;
        if (remainingSlots <= 0) {
          Alert.alert(t('composer.maxImagesTitle'), t('composer.maxImagesMessage'));
          return prev;
        }
        const imagesToAdd = photosWithBase64.slice(0, remainingSlots);
        if (photosWithBase64.length > remainingSlots) {
          Alert.alert(t('composer.maxImagesTitle'), t('composer.maxImagesPartialMessage', { count: remainingSlots }));
        }
        const newImages = [...prev, ...imagesToAdd];
        return newImages;
      });

      // Close the sheet
      toggleToolsSheet();
    } catch (error) {
      console.error('[ChatPage] Error selecting photos:', error);
    }
  }, [selectedPhotoIds, recentPhotos, toggleToolsSheet]);

  const toolsSheetStyle = useAnimatedStyle(() => {
    const sidebarLeft = interpolate(
      sidebarTranslateX.value,
      [-44, 0],
      [0, 44],
      Extrapolate.CLAMP
    );

    return {
      transform: [{ translateY: toolsSheetAnim.value }],
      left: sidebarLeft + 8,
      right: 8,
      bottom: 8,
      opacity: interpolate(toolsSheetAnim.value, [SCREEN_HEIGHT, 0], [0, 1]),
    };
  });

  const toolsBackdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(toolsSheetAnim.value, [SCREEN_HEIGHT, 0], [0, 1]),
    pointerEvents: showToolsSheet ? 'auto' : 'none',
  }));

  // Usa selettori specifici per evitare re-render su ogni cambio di store
  const tabs = useTabStore((state) => state.tabs);
  // activeTabId is declared earlier (before glass useEffect)
  const updateTab = useTabStore((state) => state.updateTab);
  const addTerminalItemToStore = useTabStore((state) => state.addTerminalItem);
  const removeTerminalItemById = useTabStore((state) => state.removeTerminalItemById);
  const updateTerminalItemById = useTabStore((state) => state.updateTerminalItemById);

  // Model selector dropdown state
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showContextInfo, setShowContextInfo] = useState(false);
  const dropdownAnim = useSharedValue(0);

  // Animated styles for dropdown
  const dropdownAnimatedStyle = useAnimatedStyle(() => ({
    opacity: dropdownAnim.value,
    transform: [
      { translateY: interpolate(dropdownAnim.value, [0, 1], [8, 0]) },
      { scale: interpolate(dropdownAnim.value, [0, 1], [0.97, 1]) },
    ],
  }));

  // Toggle dropdown with animation
  const toggleModelSelector = useCallback(() => {
    if (showModelSelector) {
      // Close
      dropdownAnim.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.cubic) });
      setTimeout(() => setShowModelSelector(false), 150);
    } else {
      // Open
      setShowModelSelector(true);
      dropdownAnim.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
    }
  }, [showModelSelector]);

  const closeDropdown = useCallback(() => {
    dropdownAnim.value = withTiming(0, { duration: 150 });
    setTimeout(() => setShowModelSelector(false), 150);
  }, []);

  // Get current model display name — migrate stale model IDs
  const currentModelName = useMemo(() => {
    const model = AI_MODELS.find(m => m.id === selectedModel);
    if (!model) {
      // Stale ID from persist storage (e.g. 'claude-4-5-sonnet') — reset to default
      setSelectedModel(AI_MODELS[1].id); // claude-4-6-sonnet
      return AI_MODELS[1].name;
    }
    return model.name;
  }, [selectedModel]);

  // Memoize currentTab to prevent infinite re-renders
  const currentTab = useMemo(() => {
    return tab || tabs.find(t => t.id === activeTabId);
  }, [tab, tabs, activeTabId]);

  // Always use tab-specific terminal items
  const tabTerminalItems = useMemo(() => currentTab?.terminalItems || [], [currentTab?.terminalItems]);
  const isLoading = currentTab?.isLoading || false;
  const hasChatStarted = tabTerminalItems.length > 0;



  // Custom input handler that saves to ref immediately (no extra re-renders)
  const handleInputChange = useCallback((text: string) => {
    previousInputRef.current = text;
    setInput(text);
    // Save to ref immediately - this won't trigger re-renders
    if (currentTab?.id) {
      tabInputsRef.current[currentTab.id] = text;
    }
    // Auto-switch toggle based on input content
    if (text.trim().length > 0 && isTerminalInput(text)) {
      if (agentMode !== 'terminal') setAgentMode('terminal');
    } else {
      if (agentMode !== 'fast') setAgentMode('fast');
    }
  }, [currentTab?.id, agentMode]);

  // Load input when tab changes (ONLY depends on tab ID)
  useEffect(() => {
    if (!currentTab?.id) return;

    // Only act if tab has actually changed
    if (previousTabIdRef.current !== currentTab.id) {
      // Load input for new tab
      const savedInput = tabInputsRef.current[currentTab.id] || '';
      setInput(savedInput);

      // Reset scroll padding when switching tabs to prevent content displacement
      // The keyboard listener will re-apply padding if keyboard is still open
      setScrollPaddingBottom(300);

      // Scroll to bottom of new tab after a brief delay
      setNearBottomState(true);
      setTimeout(() => scrollToBottom(false), 100);

      // Update previous tab reference
      previousTabIdRef.current = currentTab.id;
    }
  }, [currentTab?.id]); // ONLY depend on tab ID - NOT on input!

  // Use specific selectors from focused stores to minimize re-renders
  const hasInteracted = useUIStore((state) => state.hasInteracted);
  const setGitHubUser = useWorkstationStore((state) => state.setGitHubUser);
  const setGitHubRepositories = useWorkstationStore((state) => state.setGitHubRepositories);
  const currentWorkstation = useWorkstationStore((state) => state.currentWorkstation);
  const currentProjectInfo = useWorkstationStore((state) => state.currentProjectInfo);

  // Use tabTerminalItems directly (already memoized above)
  const terminalItems = tabTerminalItems;
  const hasUserMessaged = terminalItems.some(item => item.type === TerminalItemType.USER_MESSAGE);

  // Set loading state for current tab
  const setLoading = (loading: boolean) => {
    if (currentTab) {
      updateTab(currentTab.id, { isLoading: loading });
    }
  };

  // Remove stale thinking placeholders when no stream is active
  const clearDanglingThinkingState = useCallback((tabId: string) => {
    const targetTab = useTabStore.getState().tabs.find(t => t.id === tabId);
    const hasDanglingThinking = (targetTab?.terminalItems || []).some(item => item.isThinking);
    if (!hasDanglingThinking) return;

    // Don't remove items that are managed by the engine bridge (pre-thinking
    // placeholders awaiting RAF text flush). Only clear truly orphaned items.
    const bridgeManagedIds = new Set(engineIdMapRef.current.values());
    // Also protect the current pre-thinking placeholder (RAF might not have flushed yet)
    const activePreThinking = preThinkingIdRef.current;
    if (activePreThinking) bridgeManagedIds.add(activePreThinking);

    // Don't null preThinkingIdRef here — the bridge needs it to map engine messages.
    // It gets cleared by the bridge itself when it processes the first message.
    useTabStore.setState((state) => ({
      tabs: state.tabs.map(t =>
        t.id === tabId
          ? {
            ...t,
            terminalItems: (t.terminalItems ?? [])
              .map(item => item.isThinking ? { ...item, isThinking: false } : item)
              .filter(item => item.content !== '' || bridgeManagedIds.has(item.id)),
          }
          : t
      ),
    }));
  }, []);

  // Always add item to tab-specific storage
  const addTerminalItem = useCallback((item: any) => {
    if (!currentTab) return;

    // Use atomic function from store to avoid race conditions
    addTerminalItemToStore(currentTab.id, item);
  }, [currentTab, addTerminalItemToStore]);

  const processedUndoEventsRef = useRef<Set<string>>(new Set());

  // Track file modifications coming from streamed tool_complete events
  useEffect(() => {
    if (!currentWorkstation?.id || !agentEvents?.length) return;

    const seen = processedUndoEventsRef.current;
    const nextSeen = new Set(seen);

    for (const event of agentEvents) {
      if (event.type !== 'tool_complete' || !event.tool) continue;

      const eventKey = `${event.type}:${(event as any).id || ''}:${event.tool}:${event.timestamp?.toString?.() || ''}`;
      if (nextSeen.has(eventKey)) continue;
      nextSeen.add(eventKey);

      if (!['write_file', 'edit_file', 'multi_edit_file', 'patch_file'].includes(event.tool)) continue;

      const rawResult = (event as any).result ?? (event as any).output;
      const resultText = typeof rawResult === 'string'
        ? rawResult
        : typeof rawResult?.content === 'string'
          ? rawResult.content
          : '';

      if (!resultText) continue;

      const { undoData } = parseUndoData(resultText);
      if (undoData && undoData.__undo && undoData.filePath) {
        useFileHistoryStore.getState().recordModification({
          projectId: currentWorkstation.id,
          filePath: undoData.filePath,
          originalContent: undoData.originalContent || '',
          newContent: undoData.newContent || '',
          toolName: event.tool === 'write_file' ? 'write_file' : 'edit_file',
          description: `AI: ${event.tool === 'write_file' ? 'Created' : 'Modified'} ${undoData.filePath}`,
        });
      }
    }

    // keep bounded to avoid unbounded growth in long sessions
    if (nextSeen.size > 1000) {
      processedUndoEventsRef.current = new Set(Array.from(nextSeen).slice(-500));
    } else {
      processedUndoEventsRef.current = nextSeen;
    }
  }, [agentEvents, currentWorkstation?.id]);

  useEffect(() => {
    processedUndoEventsRef.current.clear();
  }, [currentTab?.id]);

  const handleRetryTool = useCallback(async (tool: string, input: any) => {
    if (!currentTab?.id || !currentWorkstation?.id) return;

    const retryItemId = `tool-retry-${Date.now()}-${tool}`;
    addTerminalItem({
      id: retryItemId,
      content: getToolStartMessage(tool, input),
      type: TerminalItemType.OUTPUT,
      timestamp: new Date(),
      isExecuting: true,
      toolInfo: {
        tool,
        input,
        status: 'running',
      },
    });
    scrollToBottom(true);

    try {
      const response = await apiClient.post(`${config.apiUrl}/agent/execute-tool`, {
        tool,
        input,
        projectId: currentWorkstation.id,
      });

      const rawToolResult = response?.data?.result;
      const rawResultText = typeof rawToolResult === 'string'
        ? rawToolResult
        : typeof rawToolResult?.content === 'string'
          ? rawToolResult.content
          : rawToolResult != null
            ? JSON.stringify(rawToolResult)
            : '';

      const { cleanResult, undoData } = parseUndoData(rawResultText);
      if (undoData && undoData.__undo && undoData.filePath) {
        useFileHistoryStore.getState().recordModification({
          projectId: currentWorkstation.id,
          filePath: undoData.filePath,
          originalContent: undoData.originalContent || '',
          newContent: undoData.newContent || '',
          toolName: tool === 'write_file' ? 'write_file' : 'edit_file',
          description: `AI retry: ${tool === 'write_file' ? 'Created' : 'Modified'} ${undoData.filePath}`,
        });
      }

      const normalizedResult = typeof rawToolResult === 'object' && rawToolResult !== null
        ? { ...rawToolResult, content: cleanResult }
        : cleanResult;

      updateTerminalItemById(currentTab.id, retryItemId, {
        content: formatToolResult(tool, input, normalizedResult),
        isExecuting: false,
        toolInfo: {
          tool,
          input,
          output: normalizedResult,
          status: 'completed',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Retry failed';
      updateTerminalItemById(currentTab.id, retryItemId, {
        content: `${tool}\n└─ Error: ${message}`,
        type: TerminalItemType.OUTPUT,
        isExecuting: false,
        toolInfo: {
          tool,
          input,
          output: message,
          status: 'error',
        },
      });
    }
  }, [currentTab?.id, currentWorkstation?.id, addTerminalItem, updateTerminalItemById, scrollToBottom]);

  // ── Handle pending chat message from preview error ──────────────
  const pendingChatMessage = useUIStore((state) => state.pendingChatMessage);
  const handleSendRef = useRef<((images?: any[]) => Promise<void>) | null>(null);

  useEffect(() => {
    if (!pendingChatMessage || !handleSendRef.current) return;
    // Set input and trigger send on next tick
    setInput(pendingChatMessage);
    useUIStore.getState().setPendingChatMessage(null);
    // Wait for input state to settle, then send
    setTimeout(() => {
      handleSendRef.current?.();
    }, 100);
  }, [pendingChatMessage]);

  // ── Auto-retry preview after AI fix completes ──────────────────
  const prevAgentStreamingRef = useRef(agentStreaming);
  useEffect(() => {
    const wasStreaming = prevAgentStreamingRef.current;
    prevAgentStreamingRef.current = agentStreaming;
    // Agent just finished (was running, now stopped)
    if (wasStreaming && !agentStreaming && currentTab?.id) {
      const { autoRetryPreview } = useUIStore.getState();
      if (autoRetryPreview) {
        useUIStore.getState().setAutoRetryPreview(false);
        // Add "Start preview" button to chat
        addTerminalItem({
          id: `preview-retry-${Date.now()}`,
          content: '__PREVIEW_RETRY__',
          type: TerminalItemType.SYSTEM,
          timestamp: new Date(),
        });
      }
    }
  }, [agentStreaming, currentTab?.id]);

  // ── Bridge: sync engine.messages → tabStore terminal items ───────
  // Optimized: uses Map for O(1) prev lookups instead of O(n) find()
  useEffect(() => {
    if (!currentTab?.id) return;
    const prev = prevEngineMessagesRef.current;
    const curr = engine.messages;
    const idMap = engineIdMapRef.current;
    const currIds = new Set(curr.map(m => m.id));

    // Build prev lookup Map once — O(n) instead of O(n²) from prev.find()
    const prevMap = new Map<string, ChatEngineMessage>();
    for (const m of prev) prevMap.set(m.id, m);

    // Remove items that the engine filtered out (e.g. empty thinking placeholders)
    for (const prevMsg of prev) {
      if (!currIds.has(prevMsg.id)) {
        const terminalId = idMap.get(prevMsg.id);
        if (terminalId) {
          removeTerminalItemById(currentTab.id, terminalId);
          idMap.delete(prevMsg.id);
        }
      }
    }

    for (const msg of curr) {
      const prevMsg = prevMap.get(msg.id);

      if (!prevMsg && !idMap.has(msg.id)) {
        // New message — replace pre-thinking placeholder if it exists
        if (preThinkingIdRef.current) {
          const preId = preThinkingIdRef.current;
          idMap.set(msg.id, preId);
          preThinkingIdRef.current = null;
          updateTerminalItemById(currentTab.id, preId, formatEngineMessage(msg));
        } else {
          idMap.set(msg.id, msg.id);
          addTerminalItem({ id: msg.id, ...formatEngineMessage(msg) });
        }
      } else if (prevMsg && prevMsg !== msg) {
        // Changed message (reference changed) — update in tabStore
        const terminalId = idMap.get(msg.id) || msg.id;
        updateTerminalItemById(currentTab.id, terminalId, formatEngineMessage(msg));
      }
    }

    prevEngineMessagesRef.current = curr;
  }, [engine.messages, currentTab?.id]);

  // Load file history from storage on mount
  useEffect(() => {
    useFileHistoryStore.getState().loadHistory();
  }, []);

  // Process agent events for sub-agents (todos + questions handled by engine)
  useEffect(() => {
    if (!agentEvents || agentEvents.length === 0) return;

    // Extract latest sub_agent_start event
    const subAgentStartEvents = agentEvents.filter((e: any) => e.type === 'sub_agent_start');
    const subAgentCompleteEvents = agentEvents.filter((e: any) => e.type === 'sub_agent_complete');

    if (subAgentCompleteEvents.length > subAgentStartEvents.length - 1) {
      setCurrentSubAgent(null);
    } else if (subAgentStartEvents.length > 0) {
      const latestSubAgent = subAgentStartEvents[subAgentStartEvents.length - 1];
      setCurrentSubAgent({
        id: (latestSubAgent as any).agentId,
        type: (latestSubAgent as any).agentType,
        description: (latestSubAgent as any).description,
        iteration: (latestSubAgent as any).iteration || 0,
        maxIterations: (latestSubAgent as any).maxIterations || 50,
        status: 'running',
      });
    }
  }, [agentEvents]);

  // Detect Next.js 16.x and show warning dialog
  // DISABLED: Next.js 16.1 works fine with --no-turbo flag, no need for downgrade warning
  // useEffect(() => {
  //   console.log('[NEXTJS DEBUG] currentProjectInfo:', currentProjectInfo);
  //   console.log('[NEXTJS DEBUG] showNextJsWarning:', showNextJsWarning);

  //   if (!currentProjectInfo || showNextJsWarning) {
  //     console.log('[NEXTJS DEBUG] Returning early - no projectInfo or already showing warning');
  //     return;
  //   }

  //   // Check if Next.js 16.x is detected with version warning
  //   if (currentProjectInfo.nextJsVersionWarning) {
  //     console.log('⚠️ [ChatPage] Next.js version warning detected:', currentProjectInfo.nextJsVersionWarning);
  //     const warningData = currentProjectInfo.nextJsVersionWarning;
  //     setNextJsWarningData(warningData);
  //     setShowNextJsWarning(true);

  //     // Show alert dialog - pass warningData directly to closure
  //     Alert.alert(
  //       '⚠️ Next.js Version Issue',
  //       `Abbiamo rilevato Next.js ${warningData.version} che ha problemi noti di performance (2-3 minuti di avvio del server).\n\nVuoi fare downgrade a Next.js 15.3.0 (versione stabile)?`,
  //       [
  //         {
  //           text: 'No, continua',
  //           style: 'cancel',
  //           onPress: () => setShowNextJsWarning(false)
  //         },
  //         {
  //           text: 'Sì, downgrade',
  //           onPress: () => handleDowngradeAccept(warningData)
  //         }
  //       ]
  //     );
  //   }
  // }, [currentProjectInfo]);

  // Effect for cache invalidation and chat saving on agent completion
  useEffect(() => {
    if (!agentStreaming && agentEvents.length > 0 && currentTab?.id) {
      // Save chat messages when agent completes
      if (currentTab?.type === 'chat' && currentTab.data?.chatId) {
        const chatId = currentTab.data.chatId;
        const existingChat = useChatStore.getState().chatHistory.find(c => c.id === chatId);

        if (existingChat) {
          const freshTab = useTabStore.getState().tabs.find(t => t.id === currentTab.id);
          const updatedMessages = freshTab?.terminalItems || [];

          useChatStore.getState().updateChat(chatId, {
            messages: updatedMessages,
            lastUsed: new Date(),
          });
        }
      }

      // Invalidate file cache when agent completes
      if (currentTab?.data?.projectId) {
        const hadFileChanges = agentEvents.some(e =>
          e.type === 'tool_complete' &&
          ['write_file', 'edit_file', 'run_command', 'notebook_edit', 'launch_sub_agent'].includes((e as any).tool)
        );

        const projectId = currentTab?.data?.projectId;
        if (hadFileChanges && projectId) {
          useFileCacheStore.getState().clearCache(projectId);
        }
      }

      // NOTE: Do NOT reset prevEngineMessagesRef/engineIdMapRef here!
      // The engine still has messages and the bridge would re-add them all.
      // Bridge refs are only reset in handleSend/handleStop when engine.reset() is called.

      // Clean up any dangling "Thinking..." placeholders left in the tab
      // (can happen if the user navigated away while the agent was processing)
      clearDanglingThinkingState(currentTab.id);
    }
  }, [agentStreaming, agentEvents.length, currentTab?.id, currentTab?.data?.projectId, currentTab?.data?.chatId, clearDanglingThinkingState]);

  // Defensive cleanup when entering/re-entering a tab with completed iteration.
  // If no stream is active, any leftover isThinking state is stale UI.
  useEffect(() => {
    if (!currentTab?.id || !isActiveTab) return;
    if (agentStreaming || isLoading) return;
    clearDanglingThinkingState(currentTab.id);
  }, [currentTab?.id, isActiveTab, agentStreaming, isLoading, clearDanglingThinkingState]);

  // Scroll to end when keyboard opens to show last messages
  useEffect(() => {
    const keyboardDidShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardDidShow' : 'keyboardDidShow',
      () => {
        if (hasChatStarted && terminalItems.length > 0) {
          setTimeout(() => scrollToBottom(true), 100);
        }
      }
    );

    return () => {
      keyboardDidShow.remove();
    };
  }, [hasChatStarted, terminalItems.length, scrollToBottom]);

  // Keyboard listeners - move input box up when keyboard opens
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        // Always move up when keyboard opens, regardless of chat state
        keyboardHeight.value = withTiming(e.endCoordinates.height, {
          duration: 250,
          easing: Easing.out(Easing.cubic),
        });

        const currentItems = useTabStore.getState().tabs.find(t => t.id === useTabStore.getState().activeTabId)?.terminalItems;
        if (currentItems && currentItems.length > 0) {
          // Chat mode: adjust scroll padding and scroll to end
          const extraPadding = e.endCoordinates.height - insets.bottom + 80;
          setScrollPaddingBottom(300 + extraPadding);
          setTimeout(() => scrollToBottom(true), 150);
        }
      }
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        // Set to 0 immediately so widget jumps directly to final position
        // Widget stays in place while keyboard slides down underneath
        keyboardHeight.value = 0;
        // Reset scroll padding
        setScrollPaddingBottom(300);
        // Scroll to bottom after padding shrinks to prevent view jumping up
        // (the padding reduction shifts content and can set isNearBottom=false)
        if (isNearBottomRef.current) {
          setNearBottomState(true); // keep pinned
          setTimeout(() => scrollToBottom(false), 80);
        }
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, [insets.bottom]);

  // Sync hasChatStartedAnim with actual state (for tab switching)
  useEffect(() => {
    if (hasChatStarted) {
      hasChatStartedAnim.value = 1;
      inputPositionAnim.value = 1;
    } else {
      hasChatStartedAnim.value = 0;
      inputPositionAnim.value = 0.45;
    }
  }, [hasChatStarted, currentTab?.id]);

  // WebSocket log service DISABLED - was causing connect/disconnect loop issues
  // TODO: Re-enable when WebSocket stability is improved
  // The real-time backend logs feature is temporarily disabled to prevent
  // performance issues and log spam in the terminal.

  /*
  // Ref to hold the current addTerminalItem function (avoids re-subscribing on every render)
  const addTerminalItemRef = useRef(addTerminalItem);
  const isTerminalModeRef = useRef(isTerminalMode);

  // Keep refs up to date
  useEffect(() => {
    addTerminalItemRef.current = addTerminalItem;
  }, [addTerminalItem]);

  useEffect(() => {
    isTerminalModeRef.current = isTerminalMode;
  }, [isTerminalMode]);

  // Subscribe to real-time backend logs via WebSocket (only once on mount)
  useEffect(() => {
    const unsubscribe = websocketLogService.addListener((log: BackendLog) => {
      // Only show logs when in terminal mode
      if (!isTerminalModeRef.current) return;

      // Filter out WebSocket connection spam messages
      const spamPatterns = [
        /WebSocket.*connect/i,
        /WebSocket.*disconnect/i,
        /🔌.*WebSocket/i,
        /\[WebSocketLogService\]/i,
      ];

      if (spamPatterns.some(pattern => pattern.test(log.message))) {
        return; // Skip spam messages
      }

      // Add backend log to terminal
      addTerminalItemRef.current({
        id: `backend-log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        content: log.message,
        type: log.level === 'error' ? TerminalItemType.ERROR : TerminalItemType.BACKEND_LOG,
        timestamp: new Date(log.timestamp),
        source: 'system',
      });
    });

    return () => {
      unsubscribe();
    };
  }, []); // Empty dependency array - subscribe only once on mount
  */

  useEffect(() => {
    // Aggiorna il toggle in tempo reale mentre scrivi (solo in auto mode)
    if (input.trim() && !forcedMode) {
      setIsTerminalMode(isCommand(input.trim()));
    }
  }, [input, forcedMode]);

  useEffect(() => {
    // Animazione quando cambia il toggle
    if (isTerminalMode) {
      scaleAnim.value = withSpring(1.2, { duration: 100 });
      scaleAnim.value = withSpring(1, { duration: 100 });
    } else {
      scaleAnim.value = withSpring(1.2, { duration: 100 });
      scaleAnim.value = withSpring(1, { duration: 100 });
    }
  }, [isTerminalMode]);

  const terminalModeAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scaleAnim.value }],
    };
  });

  const aiModeAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scaleAnim.value }],
    };
  });

  const cardBorderAnimatedStyle = useAnimatedStyle(() => {
    return {
      borderWidth: borderAnim.value * 2,
      borderColor: `rgba(155, 138, 255, ${borderAnim.value * 0.3})`,
    };
  });

  const cardDimensionsAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    // Animate dimensions and border radius when entering/exiting card mode
    const borderRadius = interpolate(
      cardModeAnim.value,
      [0, 1],
      [0, 16]
    );

    const marginTop = interpolate(
      cardModeAnim.value,
      [0, 1],
      [0, insets.top + 10]
    );

    // Animate width and height too - use fixed values when in card mode
    const width = interpolate(
      cardModeAnim.value,
      [0, 0.01, 1],
      [0, cardDimensions.width, cardDimensions.width]
    );

    const height = interpolate(
      cardModeAnim.value,
      [0, 0.01, 1],
      [0, cardDimensions.height - insets.top - 10, cardDimensions.height - insets.top - 10]
    );

    return {
      width: width > 0 ? width : undefined,
      height: height > 0 ? height : undefined,
      borderRadius,
      marginTop,
      overflow: 'hidden',
    };
  });

  const animatedContentStyle = useAnimatedStyle(() => {
    'worklet';
    const paddingLeft = interpolate(
      sidebarTranslateX.value,
      [-50, 0],
      [0, 44],
      Extrapolate.CLAMP
    );

    return {
      paddingLeft,
    };
  });

  const welcomeAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    const translateY = interpolate(
      keyboardHeight.value,
      [0, 300],
      [0, -70],
      Extrapolate.CLAMP
    );
    return { transform: [{ translateY }] };
  });

  const inputWrapperAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    const animProgress = inputPositionAnim.value;

    // Calcola left in base allo stato della sidebar
    const sidebarLeft = interpolate(
      sidebarTranslateX.value,
      [-50, 0],
      [0, 44],
      Extrapolate.CLAMP
    );

    // Calcola la posizione base
    const baseTranslateY = interpolate(
      animProgress,
      [0, 1],
      [0, 280],
      Extrapolate.CLAMP
    );
    const heightDiff = Math.max(0, widgetHeight.value - 90);

    // iPad: centra la input bar nell'area di contenuto
    const MAX_INPUT_WIDTH = 720;
    const isIPad = SCREEN_WIDTH >= 768;
    const computedLeft = isIPad
      ? sidebarLeft + (SCREEN_WIDTH - sidebarLeft - MAX_INPUT_WIDTH) / 2
      : sidebarLeft;
    const computedRight = isIPad
      ? SCREEN_WIDTH - computedLeft - MAX_INPUT_WIDTH
      : 0;

    // Se la tastiera è aperta, calcola top dalla posizione della tastiera
    if (keyboardHeight.value > 0) {
      const topFromKeyboard = SCREEN_HEIGHT - keyboardHeight.value - widgetHeight.value - 12;
      return {
        top: topFromKeyboard,
        left: computedLeft,
        right: computedRight,
        transform: []
      };
    }

    // Altrimenti usa top + translateY (comportamento normale)
    const translateY = baseTranslateY - heightDiff;

    // Posiziona l'input bar a ~48% dell'altezza schermo (funziona su iPhone e iPad)
    const baseTop = Math.round(SCREEN_HEIGHT * 0.48);

    return {
      top: baseTop,
      left: computedLeft,
      right: computedRight,
      transform: [{ translateY }]
    };
  });

  useEffect(() => {
    if (isCardMode) {
      borderAnim.value = withSpring(1, {
        damping: 20,
        stiffness: 180,
        mass: 0.6,
      });
      cardModeAnim.value = withSpring(1, {
        damping: 20,
        stiffness: 180,
        mass: 0.6,
      });
    } else {
      borderAnim.value = withSpring(0, {
        damping: 20,
        stiffness: 180,
        mass: 0.6,
      });
      cardModeAnim.value = withSpring(0, {
        damping: 20,
        stiffness: 180,
        mass: 0.6,
      });
    }
  }, [isCardMode]);



  const handleToggleMode = (mode: 'fast' | 'terminal') => {
    setAgentMode(mode);
  };

  useEffect(() => {
    // Handle GitHub OAuth callback
    const handleGitHubCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');

      if (code && state) {
        const success = await githubService.handleOAuthCallback(code, state);

        if (success) {
          const user = await githubService.getStoredUser();
          const repos = await githubService.fetchRepositories();

          setGitHubUser(user);
          setGitHubRepositories(repos);


          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } else {
        // Check if already authenticated
        const isAuth = await githubService.isAuthenticated();
        if (isAuth) {
          const user = await githubService.getStoredUser();
          const repos = await githubService.fetchRepositories();
          setGitHubUser(user);
          setGitHubRepositories(repos);

        }
      }
    };

    handleGitHubCallback();
  }, []);

  const isCommand = (text: string): boolean => {
    const commandPrefixes = ['ls', 'cd', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'echo', 'touch', 'grep', 'find', 'chmod', 'chown', 'ps', 'kill', 'top', 'df', 'du', 'tar', 'zip', 'unzip', 'wget', 'curl', 'git', 'npm', 'node', 'python', 'pip', 'java', 'gcc', 'make', 'docker', 'kubectl'];
    const firstWord = text.trim().split(' ')[0].toLowerCase();
    return commandPrefixes.includes(firstWord) || text.includes('&&') || text.includes('|') || text.includes('>');
  };

  // Detect if input looks like a terminal command vs natural language for AI
  const isTerminalInput = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    // Starts with ./ or / (executable path)
    if (trimmed.startsWith('./') || (trimmed.startsWith('/') && !trimmed.includes(' '))) return true;
    // Shell operators
    if (trimmed.includes('&&') || trimmed.includes(' | ') || trimmed.includes(' > ') || trimmed.includes(' >> ') || trimmed.includes(' ; ')) return true;
    // Known commands
    const cmdBinaries = [
      'ls', 'cd', 'pwd', 'mkdir', 'rmdir', 'rm', 'cp', 'mv', 'cat', 'head', 'tail',
      'echo', 'touch', 'grep', 'egrep', 'find', 'chmod', 'chown', 'chgrp', 'ps', 'kill',
      'top', 'htop', 'df', 'du', 'tar', 'zip', 'unzip', 'gzip', 'gunzip',
      'wget', 'curl', 'ssh', 'scp', 'rsync', 'ping', 'nc', 'netstat',
      'git', 'npm', 'npx', 'yarn', 'pnpm', 'bun', 'deno',
      'node', 'python', 'python3', 'pip', 'pip3', 'ruby', 'php', 'go', 'cargo', 'rustc',
      'java', 'javac', 'gcc', 'g++', 'clang', 'make', 'cmake',
      'docker', 'docker-compose', 'kubectl', 'helm',
      'apt', 'apt-get', 'yum', 'brew', 'pacman',
      'which', 'whereis', 'whoami', 'hostname', 'uname', 'env', 'export', 'set', 'unset',
      'clear', 'history', 'man', 'date', 'cal', 'wc', 'sort', 'uniq', 'cut', 'awk', 'sed',
      'xargs', 'tee', 'diff', 'patch', 'file', 'stat', 'ln', 'readlink',
      'tree', 'less', 'more', 'vi', 'vim', 'nano',
      'systemctl', 'service', 'journalctl', 'crontab',
      'dir', 'type', 'printenv', 'source', 'bash', 'sh', 'zsh',
    ];
    const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
    return cmdBinaries.includes(firstWord);
  };

  // Handle Next.js downgrade acceptance
  const handleDowngradeAccept = (warningData: any) => {
    if (!currentWorkstation?.id || !warningData) {
      return;
    }

    if (!currentTab?.id) {
      return;
    }

    // Close dialog
    setShowNextJsWarning(false);

    // Build auto-message for downgrade
    const downgradeMessage = `Downgrade this Next.js app from version ${warningData.version} to Next.js 15.3.0 (stable version). Update package.json, run npm install, and verify the downgrade is successful.`;

    // Add user message to terminal
    addTerminalItem({
      id: Date.now().toString(),
      content: downgradeMessage,
      type: TerminalItemType.USER_MESSAGE,
      timestamp: new Date(),
    });

    // Reset engine and bridge for new session
    engine.reset();
    prevEngineMessagesRef.current = [];
    engineIdMapRef.current.clear();

    // Add pre-thinking placeholder for instant UX
    const preId = `pre-thinking-${Date.now()}`;
    preThinkingIdRef.current = preId;
    addTerminalItem({
      id: preId,
      content: '',
      type: TerminalItemType.OUTPUT,
      timestamp: new Date(),
      isThinking: true,
      thinkingContent: '',
    });

    // Start agent with downgrade message
    const conversationHistory: any[] = [];
    startAgent(downgradeMessage, currentWorkstation.id, selectedModel, conversationHistory, undefined, thinkingLevel);

  };

  // Handle stop button - stops agent and clears loading state
  const handleStop = useCallback(() => {

    // Stop the agent SSE stream
    stopAgent();

    // Clear loading state
    setLoading(false);

    // Reset engine and bridge
    engine.reset();
    prevEngineMessagesRef.current = [];
    engineIdMapRef.current.clear();
    preThinkingIdRef.current = null;

    // Remove any "Thinking..." placeholders from the current tab
    if (currentTab?.id) {
      useTabStore.setState((state) => ({
        tabs: state.tabs.map(t =>
          t.id === currentTab.id
            ? {
              ...t,
              terminalItems: t.terminalItems?.map(item =>
                item.isThinking ? { ...item, isThinking: false, content: item.content || '(Interrotto)' } : item
              ).filter(item => item.content !== '' && item.content !== '(Interrotto)') || []
            }
            : t
        )
      }));
    }

  }, [stopAgent, currentTab?.id]);

  const buildAgentConversationHistory = useCallback(() => {
    return (currentTab?.terminalItems || [])
      .filter(item =>
        (() => {
          const content = String(item.content ?? '');
          const trimmed = content.trim();
          const hasValidImages = Array.isArray(item.images) && item.images.some(img => Boolean(img?.base64));

          if (item.type === TerminalItemType.USER_MESSAGE) {
            return trimmed.length > 0 || hasValidImages;
          }

          if (item.type === TerminalItemType.OUTPUT) {
            if (trimmed.length === 0) return false;
            return !content.startsWith('Read ') &&
              !content.startsWith('Write ') && !content.startsWith('Edit ') &&
              !content.startsWith('Execute:') && !content.startsWith('Glob ') &&
              !content.startsWith('Web Search') && !content.startsWith('Agent:') &&
              !content.startsWith('Todo List') && !content.startsWith('User Question') &&
              !content.startsWith('List files') && content !== '__BUDGET_EXCEEDED__';
          }

          return false;
        })()
      )
      .map(item => {
        const hasValidImages = Array.isArray(item.images) && item.images.some(img => Boolean(img?.base64));
        const content = String(item.content ?? '').trim() || (hasValidImages ? '[Image attached]' : '');
        const historyItem: any = {
          role: item.type === TerminalItemType.USER_MESSAGE ? 'user' : 'assistant',
          content,
        };
        if (item.images && item.images.length > 0) {
          historyItem.images = item.images.map(img => ({
            base64: String(img.base64 || ''),
            type: String(img.type || 'image/jpeg'),
          }));
        }
        return historyItem;
      });
  }, [currentTab?.terminalItems]);

  // ── Estimate context window usage from conversation length ──────
  const contextUsage = useMemo(() => {
    const items = currentTab?.terminalItems || [];
    if (items.length === 0) return 0;

    // Estimate total chars in conversation
    let totalChars = 0;
    for (const item of items) {
      const content = String(item.content ?? '');
      if (item.type === TerminalItemType.USER_MESSAGE || item.type === TerminalItemType.OUTPUT) {
        totalChars += content.length;
      }
    }
    // Add ~15K chars for system prompt estimate
    totalChars += 15000;

    // Context windows by model (tokens)
    const contextWindows: Record<string, number> = {
      'claude-sonnet-4': 200000,
      'claude-4-6-sonnet': 200000,
      'claude-4-6-opus': 200000,
      'claude-haiku-3.5': 200000,
      'gemini-3-flash': 1000000,
      'gemini-3.1-pro': 1000000,
      'gpt-5-3': 128000,
      'llama-3.3-70b': 128000,
    };
    const windowTokens = contextWindows[selectedModel] || 200000;

    // ~3.5 chars per token
    const estimatedTokens = Math.ceil(totalChars / 3.5);
    const pct = Math.min(100, Math.round((estimatedTokens / windowTokens) * 100));

    // Use backend value if higher (more accurate, includes full system prompt + tools)
    return Math.max(pct, engine.contextUsagePercent);
  }, [currentTab?.terminalItems, selectedModel, engine.contextUsagePercent]);

  const handleSend = async (images?: { uri: string; base64?: string; type?: string }[]) => {
    // Use passed images or fall back to selectedInputImages
    const imagesToSend = (images && images.length > 0) ? images : (selectedInputImages.length > 0 ? selectedInputImages : undefined);

    if ((!input.trim() && (!imagesToSend || imagesToSend.length === 0)) || isLoading) {
      return;
    }

    // Reset tool processing flag for new message
    isProcessingToolsRef.current = false;

    // Animate input to bottom on first send - Apple-style smooth animation
    if (!hasChatStarted) {
      hasChatStartedAnim.value = 1; // Mark chat as started
      inputPositionAnim.value = withSpring(1, {
        damping: 20,
        stiffness: 180,
        mass: 0.8,
      });
    }

    // Always dismiss keyboard when sending
    // Lock scroll tracking for 500ms so keyboard dismiss animation
    // doesn't incorrectly set isNearBottom=false
    scrollLockUntilRef.current = Date.now() + 500;
    setNearBottomState(true);
    Keyboard.dismiss();

    const userMessage = input.trim() || (imagesToSend && imagesToSend.length > 0 ? `[${imagesToSend.length} immagini allegate]` : '');

    // Check if agent mode is active (fast only - terminal mode handles separately)
    const isAgentMode = agentMode === 'fast';

    // Auto-save chat on first message - must happen BEFORE any return statements
    // Check if this is the first USER message (not system messages)
    const existingUserMessages = currentTab?.terminalItems?.filter(item =>
      item.type === TerminalItemType.USER_MESSAGE || item.type === TerminalItemType.COMMAND
    ) || [];
    const isFirstUserMessage = existingUserMessages.length === 0;

    if (isFirstUserMessage && currentTab?.type === 'chat' && currentTab.data?.chatId) {
      const chatId = currentTab.data.chatId;
      const existingChat = useChatStore.getState().chatHistory.find(c => c.id === chatId);

      // Generate a temporary title from first message (will be replaced by AI-generated title)
      let title = userMessage.slice(0, 40);
      const punctuationIndex = title.search(/[.!?]/);
      if (punctuationIndex > 10) {
        title = title.slice(0, punctuationIndex);
      }
      if (userMessage.length > 40) title += '...';

      // Generate AI title asynchronously (like ChatGPT)
      const generateAITitle = async () => {
        try {
          const titleAuthHeaders = await getAuthHeaders();
          const response = await fetch(`${config.apiUrl}/ai/chat/generate-title`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...titleAuthHeaders },
            body: JSON.stringify({ message: userMessage }),
          });
          if (response.ok) {
            const data = await response.json();
            if (data.title) {
              useChatStore.getState().updateChat(chatId, { title: data.title });
              updateTab(currentTab.id, { title: data.title });
            }
          }
        } catch (e) {
          // Could not generate AI title, using default
        }
      };
      // Delay AI title generation to not compete with agent SSE connection on slow networks
      setTimeout(() => generateAITitle(), 3000);

      if (existingChat) {
        // Chat already exists, update description and lastUsed
        const wasManuallyRenamed = existingChat.title !== 'Nuova Conversazione';
        const finalTitle = wasManuallyRenamed ? existingChat.title : title;

        useChatStore.getState().updateChat(chatId, {
          title: finalTitle,
          description: userMessage.slice(0, 100),
          lastUsed: new Date(),
          repositoryId: existingChat.repositoryId || currentWorkstation?.id,
          repositoryName: existingChat.repositoryName || currentWorkstation?.name,
        });

        if (!wasManuallyRenamed) {
          updateTab(currentTab.id, { title: finalTitle });
        }
      } else {
        // Chat doesn't exist yet, create it now
        const newChat = {
          id: chatId,
          title: title,
          description: userMessage.slice(0, 100),
          createdAt: new Date(),
          lastUsed: new Date(),
          messages: [],
          aiModel: selectedModel,
          repositoryId: currentWorkstation?.id,
          repositoryName: currentWorkstation?.name,
        };

        useChatStore.getState().addChat(newChat);
        updateTab(currentTab.id, { title: title });
      }
    } else if (currentTab?.type === 'chat' && currentTab.data?.chatId) {
      // Update lastUsed for existing chat
      useChatStore.getState().updateChatLastUsed(currentTab.data.chatId);
    }

    // If agent mode AND we have a workstation, use agent stream
    if (isAgentMode && currentWorkstation?.id) {
      // Reset engine and bridge for new session
      engine.reset();
      prevEngineMessagesRef.current = [];
      engineIdMapRef.current.clear();

      // Add user message to terminal with images
      const cleanImagesForStore = imagesToSend ? imagesToSend.map(img => ({
        uri: String(img.uri || ''),
        base64: String(img.base64 || ''),
        type: String(img.type || 'image/jpeg')
      })) : undefined;

      addTerminalItem({
        id: Date.now().toString(),
        content: userMessage,
        type: TerminalItemType.USER_MESSAGE,
        timestamp: new Date(),
        images: cleanImagesForStore,
      });

      // Add pre-thinking placeholder for instant UX (engine will replace it)
      const preId = `pre-thinking-${Date.now()}`;
      preThinkingIdRef.current = preId;
      addTerminalItem({
        id: preId,
        content: '',
        type: TerminalItemType.OUTPUT,
        timestamp: new Date(),
        isThinking: true,
        thinkingContent: '',
      });

      setInput('');
      setSelectedInputImages([]); // Clear images after sending
      setLoading(true);

      // Force scroll to bottom so user sees the Thinking... placeholder immediately
      setNearBottomState(true);
      setTimeout(() => scrollToBottom(true), 50);

      // Store the prompt in the agent store
      setCurrentPrompt(userMessage);
      setCurrentProjectId(currentWorkstation.id);

      // Build conversation history from terminal items (ALL messages, no limits - Claude Code style)
      // Filter only actual conversation (user messages and assistant responses, not tool outputs)
      // Include images in history for multimodal context
      const conversationHistory = buildAgentConversationHistory();


      // Start agent stream with selected model, conversation history, and current images
      // Clean images to avoid circular references
      const cleanImages = imagesToSend ? imagesToSend.map(img => ({
        base64: String(img.base64 || ''),
        type: String(img.type || 'image/jpeg')
      })) : undefined;

      startAgent(userMessage, currentWorkstation.id, selectedModel, conversationHistory, cleanImages, thinkingLevel);

      // (AgentProgress placeholder removed - events will be streamed as items)

      setLoading(false);
      return;
    }

    // Terminal mode - auto-detect: command → execute in container, natural language → AI
    if (agentMode === 'terminal' && currentWorkstation?.id && isTerminalInput(userMessage)) {
      addTerminalItem({
        id: Date.now().toString(),
        content: userMessage,
        type: TerminalItemType.COMMAND,
        isDirectTerminal: true,
        timestamp: new Date(),
      });

      setInput('');
      setSelectedInputImages([]);
      setLoading(true);

      try {
        const response = await apiClient.post(
          `${config.apiUrl}/workstation/execute-command`,
          {
            projectId: currentWorkstation.id,
            command: userMessage,
          }
        );

        const stdout = response.data.stdout || '';
        const stderr = response.data.stderr || '';
        const output = (stdout + (stderr ? `\n${stderr}` : '')).trim() || '(nessun output)';

        addTerminalItem({
          id: (Date.now() + 1).toString(),
          content: output,
          type: TerminalItemType.OUTPUT,
          isDirectTerminal: true,
          timestamp: new Date(),
        });
      } catch (err: any) {
        addTerminalItem({
          id: (Date.now() + 1).toString(),
          content: `${t('common:error')}: ${err.message || t('terminal:tools.failed')}`,
          isDirectTerminal: true,
          type: TerminalItemType.OUTPUT,
          timestamp: new Date(),
        });
      } finally {
        setLoading(false);
      }

      setNearBottomState(true);
      setTimeout(() => scrollToBottom(true), 100);
      setTimeout(() => scrollToBottom(true), 350);
      return;
    // Terminal mode but natural language → fall through to AI
    }

    // Se c'è un forced mode, usa quello, altrimenti auto-detect
    const shouldExecuteCommand = forcedMode
      ? forcedMode === 'terminal'
      : isCommand(userMessage);

    // Aggiorna il toggle in base al tipo rilevato (solo se non in forced mode)
    if (!forcedMode) {
      setIsTerminalMode(shouldExecuteCommand);
    }

    setInput('');

    const messageType = shouldExecuteCommand ? TerminalItemType.COMMAND : TerminalItemType.USER_MESSAGE;

    // Create streaming message placeholder IMMEDIATELY for AI chat
    let streamingMessageId = (Date.now() + 2).toString();
    let streamedContent = '';

    // Add user message
    addTerminalItem({
      id: Date.now().toString(),
      content: userMessage,
      type: messageType,
      timestamp: new Date(),
    });

    // For AI chat, add placeholder with isThinking=true immediately
    // This ensures "Thinking..." appears right away without depending on parent isLoading state
    if (!shouldExecuteCommand) {
      addTerminalItem({
        id: streamingMessageId,
        content: '',
        type: TerminalItemType.OUTPUT,
        timestamp: new Date(),
        isThinking: true,
      });

      // Force scroll to bottom so user sees the Thinking... placeholder immediately
      setNearBottomState(true);
      setTimeout(() => scrollToBottom(true), 50);
    }

    setLoading(true);

    try {
      if (shouldExecuteCommand) {
        // Terminal mode - execute command
        const response = await apiClient.post(
          `${config.apiUrl}/terminal/execute`,
          {
            command: userMessage,
            workstationId: currentWorkstation?.id
          }
        );

        addTerminalItem({
          id: (Date.now() + 1).toString(),
          content: response.data.output || '',
          type: TerminalItemType.OUTPUT,
          timestamp: new Date(),
        });
      } else {
        // Chat mode - AI response
        // Placeholder already created above with isThinking: true

        // IMPORTANT: Wait before starting XHR to allow React to render "Thinking..." placeholder
        // This delay ensures the placeholder is visible before any API response arrives
        await new Promise(resolve => setTimeout(resolve, 400));

        // Track when we started to ensure minimum "Thinking..." display time
        const thinkingStartTime = Date.now();
        const MIN_THINKING_TIME = 500; // Show "Thinking..." for at least 500ms total
        let hasShownFirstContent = false;

        // Use XMLHttpRequest for streaming (works in React Native)
        const chatAuthToken = await getAuthToken();
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.open('POST', `${config.apiUrl}/ai/chat`);
          xhr.setRequestHeader('Content-Type', 'application/json');
          if (chatAuthToken) {
            xhr.setRequestHeader('Authorization', `Bearer ${chatAuthToken}`);
          }
          xhr.timeout = 60000; // 60 second timeout

          let buffer = '';
          let thinkingContent = '';
          let isThinking = false;

          xhr.onprogress = () => {
            const newData = xhr.responseText.substring(buffer.length);
            buffer = xhr.responseText;

            const lines = newData.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.substring(6).trim();
                if (data === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(data);

                  // Handle tool results from backend
                  if (parsed.toolResult) {
                    const { name, args, result } = parsed.toolResult;
                    // CRITICAL: Clear isThinking on current streaming message before creating new one
                    useTabStore.setState((state) => ({
                      tabs: state.tabs.map(t =>
                        t.id === tab.id
                          ? {
                            ...t,
                            terminalItems: t.terminalItems?.map(item =>
                              item.id === streamingMessageId
                                ? { ...item, isThinking: false }
                                : item
                            )
                          }
                          : t
                      )
                    }));

                    // Parse undo data for write/edit operations
                    const { cleanResult, undoData } = parseUndoData(result);

                    // Record modification to history if undo data is present
                    if (undoData && undoData.__undo && currentWorkstation?.id) {
                      useFileHistoryStore.getState().recordModification({
                        projectId: currentWorkstation.id,
                        filePath: undoData.filePath,
                        originalContent: undoData.originalContent || '',
                        newContent: undoData.newContent,
                        toolName: name as 'write_file' | 'edit_file',
                        description: `AI: ${name === 'write_file' ? 'Created' : 'Modified'} ${undoData.filePath}`,
                      });
                    }

                    // Format the result based on tool type (Claude Code style)
                    let formattedOutput = '';

                    if (name === 'read_file') {
                      const lines = cleanResult.split('\n').length;
                      const fileName = args.filePath.split('/').pop() || args.filePath;
                      // Include both header and content
                      formattedOutput = `Read ${fileName}\n└─ ${lines} line${lines !== 1 ? 's' : ''}\n\n${cleanResult}`;
                    } else if (name === 'write_file') {
                      const fileName = args.filePath.split('/').pop() || args.filePath;
                      formattedOutput = `Write ${fileName}\n└─ File created\n\n${cleanResult}`;
                    } else if (name === 'edit_file') {
                      const fileName = args.filePath.split('/').pop() || args.filePath;
                      formattedOutput = `Edit ${fileName}\n└─ File modified\n\n${cleanResult}`;
                    } else if (name === 'list_files') {
                      const fileCount = cleanResult.split('\n').filter((line: string) => line.trim()).length;
                      formattedOutput = `List files in ${args.directory || '.'}\n└─ ${fileCount} file${fileCount !== 1 ? 's' : ''}\n\n${cleanResult}`;
                    } else if (name === 'search_in_files') {
                      const matches = cleanResult.split('\n').filter((line: string) => line.includes(':')).length;
                      formattedOutput = `Search "${args.pattern}"\n└─ ${matches} match${matches !== 1 ? 'es' : ''}\n\n${cleanResult}`;
                    } else if (name === 'execute_command') {
                      formattedOutput = `Execute: ${args.command}\n└─ Command completed\n\n${cleanResult}`;
                    } else if (name === 'glob_files') {
                      // For glob_files, just use the result as-is (it's already formatted from backend)
                      formattedOutput = cleanResult;
                    } else if (name === 'list_directory') {
                      formattedOutput = `List directory: ${args.dirPath || '.'}\n└─ Completed\n\n${cleanResult}`;
                    } else if (name === 'create_folder') {
                      formattedOutput = `Create folder: ${args.folderPath}\n└─ Completed\n\n${cleanResult}`;
                    } else if (name === 'delete_file') {
                      formattedOutput = `Delete: ${args.filePath}\n└─ Completed\n\n${cleanResult}`;
                    } else if (name === 'move_file') {
                      formattedOutput = `Move: ${args.sourcePath} → ${args.destPath}\n└─ Completed\n\n${cleanResult}`;
                    } else if (name === 'copy_file') {
                      formattedOutput = `Copy: ${args.sourcePath} → ${args.destPath}\n└─ Completed\n\n${cleanResult}`;
                    } else if (name === 'web_fetch') {
                      const urlShort = args.url.length > 50 ? args.url.substring(0, 50) + '...' : args.url;
                      formattedOutput = `Fetch: ${urlShort}\n└─ Completed\n\n${cleanResult.substring(0, 2000)}${cleanResult.length > 2000 ? '...' : ''}`;
                    } else if (name === 'think') {
                      formattedOutput = `💭 ${cleanResult}`;
                    } else {
                      // Generic format for other tools - include result
                      formattedOutput = `${name}\n└─ Completed\n\n${cleanResult}`;
                    }

                    // Add tool result as a separate terminal item
                    const toolResultId = `tool-result-${Date.now()}`;
                    useTabStore.setState((state) => ({
                      tabs: state.tabs.map(t =>
                        t.id === tab.id
                          ? {
                            ...t,
                            terminalItems: [
                              ...(t.terminalItems || []),
                              {
                                id: toolResultId,
                                type: TerminalItemType.OUTPUT,
                                content: formattedOutput,
                                timestamp: new Date()
                              }
                            ]
                          }
                          : t
                      )
                    }));

                    // IMPORTANT: Create a new streaming message for text after the tool
                    // This ensures text before and after tool execution are separate messages
                    streamingMessageId = `stream-after-tool-${Date.now()}`;
                    streamedContent = '';

                    addTerminalItem({
                      id: streamingMessageId,
                      content: '',
                      type: TerminalItemType.OUTPUT,
                      timestamp: new Date(),
                    });
                  }
                  // OPTIMIZATION 15: Handle batched tool results (multiple tools executed in parallel)
                  else if (parsed.toolResultsBatch) {
                    const { toolResultsBatch, executionTime, count } = parsed;

                    // CRITICAL: Clear isThinking on current streaming message before creating new one
                    useTabStore.setState((state) => ({
                      tabs: state.tabs.map(t =>
                        t.id === tab.id
                          ? {
                            ...t,
                            terminalItems: t.terminalItems?.map(item =>
                              item.id === streamingMessageId
                                ? { ...item, isThinking: false }
                                : item
                            )
                          }
                          : t
                      )
                    }));

                    // 🚀 OPTIMIZATION: Format ALL tool results FIRST, then add them ALL at once
                    const formattedToolItems = toolResultsBatch.map((toolResult: any, index: number) => {
                      const { name, args, result } = toolResult;

                      // Parse undo data for write/edit operations
                      const { cleanResult, undoData } = parseUndoData(result);

                      // Record modification to history if undo data is present
                      if (undoData && undoData.__undo && currentWorkstation?.id) {
                        useFileHistoryStore.getState().recordModification({
                          projectId: currentWorkstation.id,
                          filePath: undoData.filePath,
                          originalContent: undoData.originalContent || '',
                          newContent: undoData.newContent,
                          toolName: name as 'write_file' | 'edit_file',
                          description: `AI: ${name === 'write_file' ? 'Created' : 'Modified'} ${undoData.filePath}`,
                        });
                      }

                      // Format the result based on tool type (Claude Code style)
                      let formattedOutput = '';

                      if (name === 'read_file') {
                        const lines = cleanResult.split('\n').length;
                        const fileName = args.filePath.split('/').pop() || args.filePath;
                        formattedOutput = `Read ${fileName}\n└─ ${lines} line${lines !== 1 ? 's' : ''}\n\n${cleanResult}`;
                      } else if (name === 'write_file') {
                        const fileName = args.filePath.split('/').pop() || args.filePath;
                        formattedOutput = `Write ${fileName}\n└─ File created\n\n${cleanResult}`;
                      } else if (name === 'edit_file') {
                        const fileName = args.filePath.split('/').pop() || args.filePath;
                        formattedOutput = `Edit ${fileName}\n└─ File modified\n\n${cleanResult}`;
                      } else if (name === 'list_files') {
                        const fileCount = cleanResult.split('\n').filter((line: string) => line.trim()).length;
                        formattedOutput = `List files in ${args.directory || '.'}\n└─ ${fileCount} file${fileCount !== 1 ? 's' : ''}\n\n${cleanResult}`;
                      } else if (name === 'search_in_files') {
                        const matches = cleanResult.split('\n').filter((line: string) => line.includes(':')).length;
                        formattedOutput = `Search "${args.pattern}"\n└─ ${matches} match${matches !== 1 ? 'es' : ''}\n\n${cleanResult}`;
                      } else if (name === 'execute_command') {
                        formattedOutput = `Execute: ${args.command}\n└─ Command completed\n\n${cleanResult}`;
                      } else if (name === 'glob_files') {
                        formattedOutput = cleanResult;
                      } else if (name === 'list_directory') {
                        const dirPath = args.dirPath || '.';
                        const fileCount = cleanResult.split('\n').filter((line: string) => line.trim() && !line.startsWith('total')).length;
                        formattedOutput = `List files in ${dirPath}\n└─ ${fileCount} file${fileCount !== 1 ? 's' : ''}\n\n${cleanResult}`;
                      } else if (name === 'create_folder') {
                        formattedOutput = `Create folder: ${args.folderPath}\n└─ Completed\n\n${cleanResult}`;
                      } else if (name === 'delete_file') {
                        formattedOutput = `Delete: ${args.filePath}\n└─ Completed\n\n${cleanResult}`;
                      } else if (name === 'move_file') {
                        formattedOutput = `Move: ${args.sourcePath} → ${args.destPath}\n└─ Completed\n\n${cleanResult}`;
                      } else if (name === 'copy_file') {
                        formattedOutput = `Copy: ${args.sourcePath} → ${args.destPath}\n└─ Completed\n\n${cleanResult}`;
                      } else if (name === 'web_fetch') {
                        const urlShort = args.url.length > 50 ? args.url.substring(0, 50) + '...' : args.url;
                        formattedOutput = `Fetch: ${urlShort}\n└─ Completed\n\n${cleanResult.substring(0, 2000)}${cleanResult.length > 2000 ? '...' : ''}`;
                      } else if (name === 'think') {
                        formattedOutput = `💭 ${cleanResult}`;
                      } else {
                        formattedOutput = `${name}\n└─ Completed\n\n${cleanResult}`;
                      }

                      return {
                        id: `tool-result-${Date.now()}-${name}-${index}`,
                        type: TerminalItemType.OUTPUT,
                        content: formattedOutput,
                        timestamp: new Date()
                      };
                    });

                    // ⚡ Add ALL tool results in a SINGLE setState call (shows them all at once!)
                    useTabStore.setState((state) => ({
                      tabs: state.tabs.map(t =>
                        t.id === tab.id
                          ? {
                            ...t,
                            terminalItems: [
                              ...(t.terminalItems || []),
                              ...formattedToolItems // Spread all items at once
                            ]
                          }
                          : t
                      )
                    }));

                    // IMPORTANT: Create a new streaming message for text after the batched tools
                    streamingMessageId = `stream-after-batch-${Date.now()}`;
                    streamedContent = '';

                    addTerminalItem({
                      id: streamingMessageId,
                      content: '',
                      type: TerminalItemType.OUTPUT,
                      timestamp: new Date(),
                    });
                  }
                  // Handle function call in progress (Gemini sends this before executing tool)
                  else if (parsed.functionCall) {
                    const { name, args } = parsed.functionCall;
                    // CRITICAL: Clear isThinking on current streaming message before creating new one
                    useTabStore.setState((state) => ({
                      tabs: state.tabs.map(t =>
                        t.id === tab.id
                          ? {
                            ...t,
                            terminalItems: t.terminalItems?.map(item =>
                              item.id === streamingMessageId
                                ? { ...item, isThinking: false }
                                : item
                            )
                          }
                          : t
                      )
                    }));

                    // Add a "tool executing" indicator to the terminal
                    // Format: "Executing: tool_name" - will be styled in TerminalItem
                    const toolIndicatorId = `tool-${Date.now()}-${name}`;
                    addTerminalItem({
                      id: toolIndicatorId,
                      content: `Executing: ${name}`,
                      type: TerminalItemType.OUTPUT,
                      timestamp: new Date(),
                    });

                    // IMPORTANT: Create a new streaming message for text AFTER the tool call
                    // This prevents the AI's text from being "split" around the tool indicator
                    streamingMessageId = `stream-after-tool-${Date.now()}`;
                    streamedContent = '';

                    addTerminalItem({
                      id: streamingMessageId,
                      content: '',
                      type: TerminalItemType.OUTPUT,
                      timestamp: new Date(),
                    });
                  }
                  // Handle thinking start
                  else if (parsed.type === 'thinking_start') {
                    isThinking = true;
                    thinkingContent = '';
                    // Update UI to show thinking indicator
                    useTabStore.setState((state) => ({
                      tabs: state.tabs.map(t =>
                        t.id === tab.id
                          ? {
                            ...t,
                            terminalItems: t.terminalItems?.map(item =>
                              item.id === streamingMessageId
                                ? { ...item, isThinking: true, thinkingContent: '' }
                                : item
                            )
                          }
                          : t
                      )
                    }));
                  }
                  // Handle thinking content
                  else if (parsed.type === 'thinking' && parsed.text) {
                    thinkingContent += parsed.text;
                    // Update UI with thinking content
                    useTabStore.setState((state) => ({
                      tabs: state.tabs.map(t =>
                        t.id === tab.id
                          ? {
                            ...t,
                            terminalItems: t.terminalItems?.map(item =>
                              item.id === streamingMessageId
                                ? { ...item, isThinking: true, thinkingContent }
                                : item
                            )
                          }
                          : t
                      )
                    }));
                  }
                  // Handle thinking end
                  else if (parsed.type === 'thinking_end') {
                    isThinking = false;
                    // Keep thinking content visible but mark as ended
                    useTabStore.setState((state) => ({
                      tabs: state.tabs.map(t =>
                        t.id === tab.id
                          ? {
                            ...t,
                            terminalItems: t.terminalItems?.map(item =>
                              item.id === streamingMessageId
                                ? { ...item, isThinking: false, thinkingContent }
                                : item
                            )
                          }
                          : t
                      )
                    }));
                  }
                  // Handle text responses
                  else if (parsed.text) {
                    streamedContent += parsed.text;

                    // Function to update UI with content (strip any raw XML tool call markup)
                    const updateContent = () => {
                      const cleanContent = stripToolCallXml(streamedContent);
                      useTabStore.setState((state) => ({
                        tabs: state.tabs.map(t =>
                          t.id === tab.id
                            ? {
                              ...t,
                              terminalItems: t.terminalItems?.map(item =>
                                item.id === streamingMessageId
                                  ? { ...item, content: cleanContent, isThinking: false }
                                  : item
                              )
                            }
                            : t
                        )
                      }));
                    };

                    // For first content, ensure minimum "Thinking..." display time
                    if (!hasShownFirstContent) {
                      hasShownFirstContent = true;
                      const elapsed = Date.now() - thinkingStartTime;
                      const remaining = MIN_THINKING_TIME - elapsed;

                      if (remaining > 0) {
                        // Wait for remaining time before showing content
                        setTimeout(updateContent, remaining);
                      } else {
                        // Already waited enough, show immediately
                        updateContent();
                      }
                    } else {
                      // After first content, update immediately
                      updateContent();
                    }
                  }
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }
          };

          xhr.onload = () => {
            if (xhr.status === 200) {
              resolve();
            } else {
              reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
            }
          };

          xhr.onerror = () => reject(new Error('Network error'));
          xhr.ontimeout = () => reject(new Error('Request timeout - AI non risponde'));

          xhr.send(JSON.stringify({
            prompt: userMessage,
            selectedModel: selectedModel,
            conversationHistory: conversationHistory,
            workstationId: currentWorkstation?.id,
            projectId: currentWorkstation?.projectId || currentWorkstation?.id,
            repositoryUrl: currentWorkstation?.githubUrl || currentWorkstation?.repositoryUrl,
            // Include userId for budget tracking
            userId: useWorkstationStore.getState().userId || null,
            // Include username for multi-user context
            username: (useWorkstationStore.getState().userId || 'anonymous').split('@')[0].replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase(),
            // Include thinking level for Gemini reasoning
            thinkingLevel: thinkingLevel || null,
            context: currentWorkstation ? {
              projectName: currentWorkstation.name || 'Unnamed Project',
              language: currentWorkstation.language || 'Unknown',
              repositoryUrl: currentWorkstation.githubUrl || currentWorkstation.repositoryUrl || ''
            } : undefined
          }));
        });

        // After streaming completes, clean up and process tool calls
        if ((currentWorkstation?.projectId || currentWorkstation?.id) && !isProcessingToolsRef.current) {
          const projectId = currentWorkstation.projectId || currentWorkstation.id;

          // Detect tool calls from the AI's response
          const toolCalls = ToolService.detectToolCalls(streamedContent);

          if (toolCalls.length > 0) {
            // Set flag to prevent duplicate processing
            isProcessingToolsRef.current = true;

            // Split content into before and after tool calls
            const firstToolCallMatch = streamedContent.match(/(read_file|write_file|list_files|search_in_files)\s*\(/);
            const toolCallIndex = firstToolCallMatch ? streamedContent.indexOf(firstToolCallMatch[0]) : -1;

            let beforeToolCall = streamedContent;
            let afterToolCall = '';

            if (toolCallIndex !== -1) {
              beforeToolCall = streamedContent.substring(0, toolCallIndex).trim();
              // Find where tool call ends and extract text after it
              const afterToolCallStart = streamedContent.substring(toolCallIndex);
              const toolCallEnd = afterToolCallStart.indexOf('\n');
              if (toolCallEnd !== -1) {
                afterToolCall = afterToolCallStart.substring(toolCallEnd + 1).trim();
              }
            }

            // Clean the AI message by removing tool call syntax (keep only before part)
            const cleanedContent = ToolService.removeToolCallsFromText(beforeToolCall);

            // Update the AI message to show only the part before tool call
            useTabStore.setState((state) => ({
              tabs: state.tabs.map(t =>
                t.id === currentTab?.id
                  ? {
                    ...t,
                    terminalItems: t.terminalItems?.map(item =>
                      item.id === streamingMessageId
                        ? { ...item, content: cleanedContent }
                        : item
                    )
                  }
                  : t
              )
            }));

            // Execute each tool call in separate terminal items (as bash commands)
            for (const toolCall of toolCalls) {
              // For write_file and edit_file, only show output (no command)
              if (toolCall.tool === 'write_file' || toolCall.tool === 'edit_file') {
                // Execute the tool
                const result = await ToolService.executeTool(projectId, toolCall);

                // Show only the output (formatted edit)
                addTerminalItem({
                  id: (Date.now() + Math.random()).toString(),
                  content: result,
                  type: TerminalItemType.OUTPUT,
                  timestamp: new Date(),
                });

                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
              }

              // Format command based on tool type (for other tools)
              let commandText = '';
              switch (toolCall.tool) {
                case 'read_file':
                  commandText = `cat ${toolCall.args.filePath}`;
                  break;
                case 'list_files':
                  commandText = `ls ${toolCall.args.directory || '.'}`;
                  break;
                case 'search_in_files':
                  commandText = `grep -r "${toolCall.args.pattern}" .`;
                  break;
                default:
                  commandText = toolCall.tool;
              }

              // Add as bash command
              addTerminalItem({
                id: (Date.now() + Math.random()).toString(),
                content: commandText,
                type: TerminalItemType.COMMAND,
                timestamp: new Date(),
              });

              // Small delay for visual separation
              await new Promise(resolve => setTimeout(resolve, 100));

              // Execute the tool and show result as output
              const result = await ToolService.executeTool(projectId, toolCall);

              addTerminalItem({
                id: (Date.now() + Math.random()).toString(),
                content: result,
                type: TerminalItemType.OUTPUT,
                timestamp: new Date(),
              });

              // Small delay between tools
              await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Add the text that came after the tool call (AI's response after tool execution)
            if (afterToolCall) {
              const cleanedAfterToolCall = ToolService.removeToolCallsFromText(afterToolCall);
              if (cleanedAfterToolCall.trim()) {
                addTerminalItem({
                  id: (Date.now() + Math.random()).toString(),
                  content: cleanedAfterToolCall,
                  type: TerminalItemType.OUTPUT,
                  timestamp: new Date(),
                });
              }
            }

            // Update streamedContent for conversation history
            // Include both before and after tool call text, but not the tool output
            streamedContent = cleanedContent + (afterToolCall ? '\n' + ToolService.removeToolCallsFromText(afterToolCall) : '');

            // Reset flag after processing
            isProcessingToolsRef.current = false;
          }
        }

        // Update conversation history with both user message and AI response
        setConversationHistory([...conversationHistory, userMessage, streamedContent]);
      }
    } catch (error) {
      console.error('❌ [ChatPage] AI request failed:', error);

      // Remove isThinking from the placeholder item so "Thinking..." disappears
      useTabStore.setState((state) => ({
        tabs: state.tabs.map(t =>
          t.id === tab.id
            ? {
              ...t,
              terminalItems: t.terminalItems?.map(item =>
                item.id === streamingMessageId
                  ? { ...item, isThinking: false, content: '' }
                  : item
              ).filter(item => item.content !== '' || item.isThinking) // Remove empty items
            }
            : t
        )
      }));

      addTerminalItem({
        id: (Date.now() + 3).toString(),
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: TerminalItemType.ERROR,
        timestamp: new Date(),
      });
    } finally {
      setLoading(false);

      // Save messages to chat after completing the send
      if (currentTab?.type === 'chat' && currentTab.data?.chatId) {
        const chatId = currentTab.data.chatId;
        const existingChat = useChatStore.getState().chatHistory.find(c => c.id === chatId);

        if (existingChat) {
          // Get fresh tab state from store to ensure we have latest messages
          const freshTab = useTabStore.getState().tabs.find(t => t.id === currentTab.id);
          const updatedMessages = freshTab?.terminalItems || [];

          useChatStore.getState().updateChat(chatId, {
            messages: updatedMessages,
            lastUsed: new Date(),
          });
        } else {
        }
      }
    }
  };

  // Keep ref updated for pending message effect
  handleSendRef.current = handleSend;

  // Memoized filtered and processed terminal items for FlatList
  const processedTerminalItems = useMemo(() => {
    if (terminalItems.length === 0) return [];

    // Filter out null items, empty content items, and "Executing:" placeholders
    // Keep empty thinking rows only while an actual stream/loading is active.
    const filtered = terminalItems.filter(item =>
      item &&
      item.content != null &&
      (item.content.trim() !== '' || (item.isThinking && (isLoading || agentStreaming)) || (item as any).isAgentProgress) &&
      item.content !== '...' &&
      !item.content.startsWith('Executing: ')
    );

    return filtered.map((item, index, filteredArray) => {
      const prevItem = filteredArray[index - 1];
      const nextItem = filteredArray[index + 1];

      const isOutputAfterTerminalCommand =
        item.type === TerminalItemType.OUTPUT &&
        prevItem?.type === TerminalItemType.COMMAND &&
        (isCommand(prevItem.content || '') || prevItem.isDirectTerminal);

      const isNextItemAI = item.type !== TerminalItemType.USER_MESSAGE &&
        nextItem &&
        nextItem.type !== TerminalItemType.USER_MESSAGE;

      const outputItem =
        item.type === TerminalItemType.COMMAND &&
          (isCommand(item.content || '') || item.isDirectTerminal) &&
          nextItem?.type === TerminalItemType.OUTPUT
          ? nextItem
          : undefined;

      const isLastItem = index === filteredArray.length - 1;
      const shouldShowLoading = isLastItem && (isLoading || agentStreaming);

      return {
        item,
        isOutputAfterTerminalCommand,
        isNextItemAI,
        outputItem,
        shouldShowLoading,
      };
    }).filter(processed => !processed.isOutputAfterTerminalCommand);
  }, [terminalItems, isLoading, agentStreaming]);

  const inputbarTodoRenderKey = useMemo(() => {
    if (!engine.currentTodos?.length) return 'no-todos';
    return engine.currentTodos
      .map((t: any) => `${t.id || ''}:${t.status || ''}:${(t.activeForm || t.content || '').length}`)
      .join('|');
  }, [engine.currentTodos]);

  useEffect(() => {
    if (processedTerminalItems.length === 0) {
      setNearBottomState(true);
    }
  }, [processedTerminalItems.length, setNearBottomState]);

  // Reset dismiss state when a new set of todos arrives
  const prevTodoCountRef = React.useRef(0);
  React.useEffect(() => {
    const count = engine.currentTodos?.length || 0;
    if (count > 0 && prevTodoCountRef.current === 0) {
      setIsInputbarTodoDismissed(false);
    }
    prevTodoCountRef.current = count;
  }, [engine.currentTodos?.length]);

  // Track updates on the last rendered item (also during streaming deltas)
  const lastItemAutoScrollKey = useMemo(() => {
    const last = processedTerminalItems[processedTerminalItems.length - 1]?.item;
    if (!last) return 'empty';
    const contentLen = (last.content || '').length;
    const thinkingLen = (last.thinkingContent || '').length;
    return `${processedTerminalItems.length}:${last.id || ''}:${last.type || ''}:${contentLen}:${thinkingLen}:${last.isThinking ? 1 : 0}`;
  }, [processedTerminalItems]);

  // Keep following the bottom while streaming, unless the user scrolled up.
  useEffect(() => {
    if (!isNearBottomRef.current || processedTerminalItems.length === 0) return;
    scrollToBottom(!(isLoading || agentStreaming));
  }, [lastItemAutoScrollKey, processedTerminalItems.length, isLoading, agentStreaming, scrollToBottom]);

  return (
    <Animated.View style={[
      styles.container,
      cardDimensionsAnimatedStyle, // Animated width, height, borderRadius, marginTop, overflow
      cardBorderAnimatedStyle,
      animatedStyle
    ]}>
      {/* Content wrapper with sidebar offset */}
      <Animated.View style={[{ flex: 1, backgroundColor: '#0d0d0f' }, animatedContentStyle]}>
        {/* Top Upgrade Pill - Custom Liquid Glass (Expo Safe) */}
        {!isPaidUser && !hasUserMessaged && currentTab?.type === 'terminal' && (
          <TouchableOpacity
            style={[
              styles.topUpgradePill,
              { top: insets.top + (isCardMode ? 47 : 40) }
            ]}
            onPress={() => navigateTo('plans')}
            activeOpacity={0.8}
          >
            <BlurView intensity={35} tint="dark" style={styles.upgradePillBlur}>
              {/* Animated Shimmer Highlight (Liquid feel) */}
              <Animated.View style={[styles.shimmerLayer, shimmerStyle]}>
                <LinearGradient
                  colors={['transparent', 'rgba(255, 255, 255, 0.1)', 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>

              {/* Inner Border Reflection */}
              <View style={styles.innerGloss} />

              <Ionicons name="flash" size={11} color="rgba(255,255,255,0.95)" />
              <Text style={styles.upgradePillText}>{t('terminal:preview.upgradeCta')}</Text>
            </BlurView>
          </TouchableOpacity>
        )}

        {currentTab?.type === 'file' ? (
          <FileViewer
            visible={true}
            projectId={currentTab.data?.projectId || ''}
            filePath={currentTab.data?.filePath || ''}
            repositoryUrl={currentTab.data?.repositoryUrl || ''}
            userId={'anonymous'}
            onClose={() => { }}
          />
        ) : currentTab?.type === 'terminal' ? (
          <TerminalView
            terminalTabId={currentTab.id}
            sourceTabId={currentTab.data?.sourceTabId || currentTab.id}
          />
        ) : currentTab?.type === 'github' ? (
          <GitHubView tab={currentTab} />
        ) : currentTab?.type === 'browser' ? (
          <BrowserView tab={currentTab} />
        ) : currentTab?.type === 'preview' ? (
          <PreviewView tab={currentTab} />
        ) : currentTab?.type === 'shell' ? (
          <ShellView tab={currentTab} />
        ) : currentTab?.type === 'envVars' ? (
          <EnvVarsView tab={currentTab} />
        ) : currentTab?.type === 'tasks' ? (
          <TasksView tab={currentTab} />
        ) : currentTab?.type === 'integration' ? (
          currentTab.data?.integration === 'supabase' ? (
            <SupabaseView tab={currentTab} />
          ) : currentTab.data?.integration === 'figma' ? (
            <FigmaView tab={currentTab} />
          ) : null
        ) : (
          <>
            {/* Chat background with gradient */}
            <LinearGradient
              colors={AppColors.gradient.dark}
              locations={[0, 0.3, 0.7, 1]}
              style={styles.background}
            >
              <View style={styles.glowTop} />
              <View style={styles.glowBottom} />
            </LinearGradient>
            <FlatList
              ref={scrollViewRef}
              style={[styles.output, isCardMode && styles.outputCardMode]}
              contentContainerStyle={[styles.outputContent, { paddingBottom: scrollPaddingBottom }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              data={processedTerminalItems}
              keyExtractor={(processed, index) => processed.item.id || `item-${index}`}
              onContentSizeChange={(_w, h) => {
                contentHeightRef.current = h;
                if (isNearBottomRef.current) {
                  // During streaming use non-animated follow to avoid lag behind new chunks
                  scrollToBottom(!(isLoading || agentStreaming));
                }
              }}
              onLayout={(e) => { layoutHeightRef.current = e.nativeEvent.layout.height; }}
              onScrollBeginDrag={() => {
                isUserScrollActiveRef.current = true;
              }}
              onScrollEndDrag={() => {
                isUserScrollActiveRef.current = false;
              }}
              onMomentumScrollBegin={() => {
                isUserScrollActiveRef.current = true;
              }}
              onMomentumScrollEnd={(e) => {
                isUserScrollActiveRef.current = false;
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
                setNearBottomState(distanceFromBottom < 220);
              }}
              onScroll={(e) => {
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
                // During keyboard dismiss animation, scroll events fire with stale positions
                // that would incorrectly set isNearBottom=false. Skip those updates.
                if (Date.now() < scrollLockUntilRef.current) return;
                // While streaming, only allow user-driven scroll events to change pin state.
                // Programmatic/layout scroll events can otherwise flip this to false and stop auto-follow.
                if ((isLoading || agentStreaming) && !isUserScrollActiveRef.current) return;
                setNearBottomState(distanceFromBottom < 220);
              }}
              scrollEventThrottle={16}
              renderItem={({ item: processed }) => {
                const { item, isNextItemAI, outputItem, shouldShowLoading } = processed;

                // Handle agent progress items (thinking, tools trace)
                if ((item as any).isAgentProgress) {
                  const isRunning = agentStreaming;
                  return (
                    <View style={{ marginBottom: 16 }}>
                      <AgentProgress
                        events={agentEvents}
                        status={isRunning ? 'running' : 'complete'}
                        currentTool={isRunning ? agentCurrentTool : null}
                      />
                    </View>
                  );
                }

                // Handle preview retry action card
                if (item.content === '__PREVIEW_RETRY__') {
                  return (
                    <TouchableOpacity
                      onPress={() => {
                        useUIStore.getState().setOpenPreviewRequested(true);
                      }}
                      activeOpacity={0.85}
                      style={{
                        marginHorizontal: 16,
                        marginVertical: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        paddingVertical: 14,
                        paddingHorizontal: 20,
                        borderRadius: 22,
                        backgroundColor: 'rgba(139, 92, 246, 0.2)',
                        borderWidth: 1,
                        borderColor: 'rgba(139, 92, 246, 0.35)',
                      }}
                    >
                      <Ionicons name="play" size={18} color="#A78BFA" />
                      <Text style={{ fontSize: 15, fontWeight: '600', color: '#A78BFA' }}>
                        Avvia preview
                      </Text>
                    </TouchableOpacity>
                  );
                }

                // Handle context compaction messages
                if (item.content === '__CONTEXT_COMPACTING__' || item.content === '__CONTEXT_COMPACTED__') {
                  const isCompacting = item.content === '__CONTEXT_COMPACTING__';
                  return (
                    <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 6, gap: 8 }}>
                      <View style={{ flex: 1, height: 0.5, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                      {isCompacting
                        ? <ActivityIndicator size="small" color={AppColors.primary} style={{ marginHorizontal: 4 }} />
                        : <Ionicons name="flash" size={12} color={AppColors.primary} />
                      }
                      <SafeText style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: '500' }}>
                        {isCompacting ? t('terminal:preview.contextCompacting') : t('terminal:preview.contextCompacted')}
                      </SafeText>
                      <View style={{ flex: 1, height: 0.5, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                    </View>
                  );
                }

                // Handle budget exceeded — show upgrade card
                if (item.content === '__BUDGET_EXCEEDED__') {
                  return (
                    <View style={{
                      marginHorizontal: 16,
                      marginVertical: 12,
                      borderRadius: 24,
                      overflow: 'hidden',
                    }}>
                      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                      <LiquidGlassView
                        style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
                        interactive={true}
                        effect="regular"
                        colorScheme="dark"
                      />
                      <View style={{
                        borderRadius: 24,
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.08)',
                        padding: 20,
                      }}>
                        {/* Title */}
                        <View style={{ alignItems: 'center', marginBottom: 16 }}>
                          <Text style={{ fontSize: 28, marginBottom: 10 }}>
                            🚀
                          </Text>
                          <Text style={{ fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: -0.3 }}>
                            {t('settings:plans.budgetExhausted')}
                          </Text>
                          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 4, textAlign: 'center', lineHeight: 18 }}>
                            {t('settings:plans.budgetExhaustedDesc', { plan: nextPlanLabel })}
                          </Text>
                        </View>

                        {/* CTA button */}
                        <TouchableOpacity
                          onPress={() => navigateTo('plans')}
                          activeOpacity={0.85}
                          style={{ borderRadius: 28, overflow: 'hidden' }}
                        >
                          <LinearGradient
                            colors={['#8B7CF6', '#7C6CF0']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={{
                              paddingVertical: 14,
                              alignItems: 'center',
                              borderRadius: 28,
                            }}
                          >
                            <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff', letterSpacing: -0.2 }}>
                              {t('settings:plans.upgradeTo', { plan: nextPlanLabel })}
                            </Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }

                return (
                  <TerminalItemComponent
                    item={item}
                    isNextItemOutput={isNextItemAI}
                    outputItem={outputItem}
                    isLoading={shouldShowLoading}
                    onRetryTool={handleRetryTool}
                    onPlanApprove={undefined}
                    onPlanReject={undefined}
                  />
                );
              }}
              ListEmptyComponent={terminalItems.length === 0 ? (
                <Animated.View style={[styles.emptyState, welcomeAnimatedStyle]}>
                  <View style={styles.welcomeContainer}>
                    <Text style={styles.welcomeTitle}>{t('welcomeTitle')}</Text>
                    <Text style={styles.welcomeSubtitle}>
                      {t('welcomeSubtitle')}
                    </Text>
                    <View style={styles.suggestionsGrid}>
                      {[
                        { icon: 'sparkles-outline', text: t('suggestionFeature') },
                        { icon: 'bug-outline', text: t('suggestionBugs') },
                        { icon: 'color-palette-outline', text: t('suggestionDesign') },
                        { icon: 'rocket-outline', text: t('suggestionPerformance') },
                      ].map((suggestion, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={styles.suggestionChip}
                          activeOpacity={0.7}
                          onPress={() => {
                            handleInputChange(suggestion.text);
                            setTimeout(() => handleSend(), 100);
                          }}
                        >
                          <Ionicons name={suggestion.icon as any} size={15} color="rgba(255,255,255,0.4)" />
                          <Text style={styles.suggestionText}>{suggestion.text}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </Animated.View>
              ) : null}
              ListFooterComponent={terminalItems.length > 0 ? (
                <>
                  {/* Reliable "Thinking..." indicator as footer fallback */}
                  {/* Shows when loading/streaming but no AI content visible yet */}
                  {(isLoading || agentStreaming) &&
                    !processedTerminalItems.some(p => p.item.isThinking) &&
                    (processedTerminalItems.length === 0 ||
                      processedTerminalItems[processedTerminalItems.length - 1]?.item?.type === TerminalItemType.USER_MESSAGE) && (
                    <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                      <View style={{
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        borderRadius: 16,
                        padding: 16,
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.08)',
                      }}>
                        <ThinkingIndicator
                          textStyle={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, fontStyle: 'italic' }}
                        />
                      </View>
                    </View>
                  )}

                  {/* Sub-agent progress removed — AGENT badge in chat handles it */}
                </>
              ) : null}
            />

            {/* AskUserQuestion: shown inline in chat as Q&A card, user replies via input */}

            <Animated.View style={[
              styles.inputWrapper,
              isCardMode && styles.inputWrapperCardMode,
              inputWrapperAnimatedStyle,
            ]}>
              {showScrollToBottom && (
                <TouchableOpacity
                  style={[
                    styles.scrollToBottomButton,
                    selectedInputImages.length > 0 && styles.scrollToBottomButtonWithImages,
                  ]}
                  onPress={() => scrollToBottom(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="arrow-down" size={16} color="#FFFFFF" />
                  <Text style={styles.scrollToBottomText}>{t('composer.scrollToBottom')}</Text>
                </TouchableOpacity>
              )}

              {currentWorkstation?.id && (
                <View style={[
                  styles.undoFloatingContainer,
                  selectedInputImages.length > 0 && styles.undoFloatingContainerWithImages,
                ]}>
                  <UndoRedoBar
                    projectId={currentWorkstation.id}
                    onUndoComplete={() => {}}
                    onRedoComplete={() => {}}
                  />
                </View>
              )}

              {/* Compact Image Preview Bar - above input */}
              {selectedInputImages.length > 0 && (
                <View style={styles.compactImageBar}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.compactImageBarContent}
                  >
                    {selectedInputImages.map((img, index) => (
                      <View key={index} style={styles.compactImageItem}>
                        <Image source={{ uri: img.uri }} style={styles.compactImage} />
                        <TouchableOpacity
                          style={styles.compactRemoveButton}
                          onPress={() => {
                            setSelectedInputImages(prev => prev.filter((_, i) => i !== index));
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="close-circle" size={16} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View
                testID={inputBarGlassId}
                nativeID={inputBarGlassId}
                style={[
                  styles.inputGradient,
                  styles.inputGradientOverflow,
                  selectedInputImages.length > 0 && styles.inputGradientWithImages
                ]}
                onLayout={(e) => {
                  widgetHeight.value = withTiming(e.nativeEvent.layout.height, { duration: 100 });
                  if (Platform.OS === 'ios' && isActiveTab && !isSidebarOpen && !glassApplied) {
                    requestAnimationFrame(() => {
                      applyInputGlass();
                    });
                  }
                }}
              >
                {/* Background — always rendered; the native glass overlays on top with passthrough touches */}
                <LinearGradient
                  colors={[`${AppColors.dark.surface}F9`, `${AppColors.dark.surface}EB`]}
                  style={StyleSheet.absoluteFill}
                />

                {/* Top Controls */}
                <View style={styles.topControls}>
                  <View style={styles.modeToggleContainer}>
                    <View style={styles.modeToggle}>
                      <TouchableOpacity
                        onPress={() => handleToggleMode('fast')}
                        style={[
                          styles.modeButton,
                          agentMode === 'fast' && styles.modeButtonActive,
                        ]}
                      >
                        <Animated.View style={agentMode === 'fast' ? aiModeAnimatedStyle : undefined}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: agentMode === 'fast' ? '#FFFFFF' : 'rgba(255,255,255,0.3)' }}>AI</Text>
                        </Animated.View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleToggleMode('terminal')}
                        style={[
                          styles.modeButton,
                          agentMode === 'terminal' && styles.modeButtonActive,
                        ]}
                      >
                        <Animated.View style={agentMode === 'terminal' ? aiModeAnimatedStyle : undefined}>
                          <Ionicons
                            name="terminal-outline"
                            size={14}
                            color={agentMode === 'terminal' ? '#FFFFFF' : 'rgba(255,255,255,0.3)'}
                          />
                        </Animated.View>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {/* Context window usage indicator */}
                    {contextUsage > 0 && (() => {
                      const size = 18;
                      const strokeWidth = 2;
                      const radius = (size - strokeWidth) / 2;
                      const circumference = 2 * Math.PI * radius;
                      const strokeDashoffset = circumference * (1 - contextUsage / 100);
                      const color = contextUsage >= 90 ? '#FF6B6B' : contextUsage >= 60 ? '#FFB86C' : 'rgba(255,255,255,0.25)';
                      return (
                        <TouchableOpacity
                          onPress={() => setShowContextInfo(true)}
                          activeOpacity={0.7}
                          style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}
                        >
                          <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
                            <Circle
                              cx={size / 2} cy={size / 2} r={radius}
                              stroke="rgba(255,255,255,0.08)"
                              strokeWidth={strokeWidth}
                              fill="none"
                            />
                            <Circle
                              cx={size / 2} cy={size / 2} r={radius}
                              stroke={color}
                              strokeWidth={strokeWidth}
                              fill="none"
                              strokeDasharray={`${circumference}`}
                              strokeDashoffset={strokeDashoffset}
                              strokeLinecap="round"
                            />
                          </Svg>
                        </TouchableOpacity>
                      );
                    })()}
                    <TouchableOpacity
                      style={styles.modelSelector}
                      onPress={toggleModelSelector}
                    >
                      <SafeText style={styles.modelText}>{currentModelName}</SafeText>
                      <Ionicons
                        name={showModelSelector ? "chevron-up" : "chevron-down"}
                        size={12}
                        color="rgba(255,255,255,0.4)"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Tasks in input bar — disabled */}

                {/* Main Input Row */}
                <View collapsable={false} style={styles.mainInputRow}>
                  <TouchableOpacity
                    style={styles.toolsButton}
                    onPress={toggleToolsSheet}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={24} color="rgba(255,255,255,0.4)" />
                  </TouchableOpacity>

                  <TextInput
                    style={[styles.input, { textTransform: 'none' }]}
                    value={input}
                    onChangeText={handleInputChange}
                    placeholder={
                      agentMode === 'terminal'
                        ? '$ comando...'
                        : t('placeholderFast')
                    }
                    placeholderTextColor={AppColors.dark.bodyText}
                    multiline
                    maxLength={1000}
                    onSubmitEditing={handleSend}
                    keyboardAppearance="dark"
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="off"
                    textContentType="none"
                    keyboardType="default"
                  />

                  <TouchableOpacity
                    onPress={agentStreaming || isLoading ? handleStop : () => handleSend()}
                    disabled={!agentStreaming && !isLoading && !input.trim() && selectedInputImages.length === 0}
                    style={[
                      styles.sendButton,
                      agentStreaming || isLoading
                        ? { backgroundColor: 'rgba(255,80,80,0.15)' }
                        : (input.trim() || selectedInputImages.length > 0)
                          ? { backgroundColor: AppColors.primary }
                          : { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={agentStreaming || isLoading ? "stop" : "arrow-up"}
                      size={16}
                      color={agentStreaming || isLoading ? "#FF5050" : (input.trim() || selectedInputImages.length > 0) ? '#FFFFFF' : 'rgba(255,255,255,0.3)'}
                    />
                  </TouchableOpacity>
                </View>
              </View>


              {/* Model Dropdown - positioned outside LinearGradient */}
              {showModelSelector && (
                <>
                  <Pressable
                    style={styles.dropdownOverlay}
                    onPress={closeDropdown}
                  />
                  <Animated.View testID="modelDropdownGlass" style={[styles.modelDropdown, dropdownAnimatedStyle]}>
                    {AI_MODELS.map((model) => {
                      const IconComponent = model.IconComponent;
                      const isSelected = selectedModel === model.id;
                      const hasThinkingOptions = model.thinkingLevels && model.thinkingLevels.length > 0;
                      const isLocked = model.isPremium && !isPaidUser;

                      return (
                        <TouchableOpacity
                          key={model.id}
                          style={[
                            styles.modelDropdownItem,
                            isSelected && styles.modelDropdownItemActive,
                            isLocked && { opacity: 0.45 },
                          ]}
                          onPress={() => {
                            if (isLocked) {
                              navigateTo('plans');
                              return;
                            }
                            setSelectedModel(model.id);
                            if (hasThinkingOptions) {
                              const defaultLevel = model.id.includes('flash') ? 'medium' : 'low';
                              setThinkingLevel(defaultLevel);
                            }
                          }}
                        >
                          <IconComponent size={16} />
                          <SafeText style={[
                            styles.modelDropdownText,
                            isSelected && styles.modelDropdownTextActive
                          ]}>
                            {model.name}
                          </SafeText>
                          {isLocked ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <View style={{ backgroundColor: AppColors.primary, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                                <SafeText style={{ fontSize: 9, fontWeight: '900', color: '#fff' }}>GO</SafeText>
                              </View>
                              <Ionicons name="lock-closed" size={13} color="rgba(255,255,255,0.35)" />
                            </View>
                          ) : isSelected ? (
                            <Ionicons name="checkmark-circle" size={16} color={AppColors.primary} />
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}

                    {/* Thinking Level Options - always show all 4 levels to prevent modal resize */}
                    {(() => {
                      const currentModel = AI_MODELS.find(m => m.id === selectedModel);
                      const modelLevels = currentModel?.thinkingLevels || [];
                      // Always show all 4 levels for consistent sizing
                      const allLevels = ['minimal', 'low', 'medium', 'high'];

                      return (
                        <View style={styles.thinkingLevelContainer}>
                          <SafeText style={styles.thinkingLevelLabel}>{t('terminal:preview.thinkingLevel')}</SafeText>
                          <View style={styles.thinkingLevelOptions}>
                            {allLevels.map((level: string) => {
                              const isAvailable = modelLevels.includes(level);
                              const isSelected = isAvailable && thinkingLevel === level;

                              return (
                                <TouchableOpacity
                                  key={level}
                                  style={[
                                    styles.thinkingLevelChip,
                                    isSelected && styles.thinkingLevelChipActive,
                                    !isAvailable && { opacity: 0.25 }
                                  ]}
                                  onPress={() => {
                                    if (isAvailable) {
                                      setThinkingLevel(level);
                                    }
                                  }}
                                  disabled={!isAvailable}
                                >
                                  <SafeText style={[
                                    styles.thinkingLevelChipText,
                                    isSelected && styles.thinkingLevelChipTextActive
                                  ]}>
                                    {THINKING_LEVEL_LABELS[level] || level}
                                  </SafeText>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })()}
                  </Animated.View>
                </>
              )}

              {/* Context usage info tooltip */}
              {showContextInfo && (() => {
                const contextWindows: Record<string, number> = {
                  'claude-4-6-opus': 200000, 'claude-4-6-sonnet': 200000, 'claude-haiku-3.5': 200000,
                  'claude-sonnet-4': 200000, 'gemini-3-flash': 1000000, 'gemini-3.1-pro': 1000000,
                  'gpt-5-3': 128000, 'llama-3.3-70b': 128000,
                };
                const windowK = Math.round((contextWindows[selectedModel] || 200000) / 1000);
                const compactionAt = 90;
                const remaining = Math.max(0, compactionAt - contextUsage);
                return (
                  <>
                    <Pressable
                      style={{ position: 'absolute', top: -500, left: -500, right: -500, bottom: -500 }}
                      onPress={() => setShowContextInfo(false)}
                    />
                    <View style={{
                      position: 'absolute', bottom: '100%', right: 0, marginBottom: 8,
                      backgroundColor: 'rgba(30,30,35,0.95)', borderRadius: 12,
                      paddingHorizontal: 14, paddingVertical: 10, width: 220,
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
                    }}>
                      <SafeText style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600', marginBottom: 6 }}>
                        {t('context.title', { percent: contextUsage })}
                      </SafeText>
                      <SafeText style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, lineHeight: 16 }}>
                        {contextUsage < compactionAt
                          ? t('context.beforeCompaction', { threshold: compactionAt, remaining })
                          : t('context.compactionActive')}
                      </SafeText>
                      <View style={{
                        marginTop: 8, height: 3, borderRadius: 1.5,
                        backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden',
                      }}>
                        <View style={{
                          width: `${contextUsage}%`, height: '100%', borderRadius: 1.5,
                          backgroundColor: contextUsage >= 90 ? '#FF6B6B' : contextUsage >= 60 ? '#FFB86C' : 'rgba(255,255,255,0.25)',
                        }} />
                      </View>
                      <SafeText style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 4 }}>
                        {t('context.window', { size: windowK })}
                      </SafeText>
                    </View>
                  </>
                );
              })()}
            </Animated.View>
          </>
        )}
      </Animated.View>

      {/* Tools Bottom Sheet */}
      {
        showToolsSheet && (
          <Pressable style={StyleSheet.absoluteFill} onPress={toggleToolsSheet}>
            <Animated.View style={[styles.sheetBackdrop, toolsBackdropStyle]} />
          </Pressable>
        )
      }
      <Animated.View style={[styles.toolsSheet, toolsSheetStyle]}>
        <BlurView intensity={90} tint="dark" style={styles.sheetBlur}>
          <LinearGradient
            colors={['rgba(30, 30, 35, 0.4)', 'rgba(15, 15, 20, 0.6)']}
            style={styles.sheetGradient}
          >
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <Text style={styles.sheetHeaderTitle}>Drape</Text>
              <TouchableOpacity onPress={() => { }}>
                <Text style={styles.sheetHeaderAction}>{t('composer.allPhotos')}</Text>
              </TouchableOpacity>
            </View>

            {/* Photos Gallery */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.galleryContainer}
            >
              <TouchableOpacity style={styles.cameraCard}>
                <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
                <Ionicons name="camera-outline" size={20} color="#fff" />
              </TouchableOpacity>
              {recentPhotos.map((photo) => (
                <TouchableOpacity
                  key={photo.id}
                  style={styles.galleryCard}
                  activeOpacity={0.7}
                  onPress={() => {
                    setSelectedPhotoIds(prev => {
                      const newSet = new Set(prev);
                      if (newSet.has(photo.id)) {
                        // Always allow deselection
                        newSet.delete(photo.id);
                      } else {
                        // Check total limit (already selected + new selection)
                        const totalImages = selectedInputImages.length + newSet.size;
                        if (totalImages < 4) {
                          newSet.add(photo.id);
                        } else {
                          // Show warning if trying to select more than 4 total
                          Alert.alert(t('composer.maxImagesTitle'), t('composer.maxImagesMessage'));
                        }
                      }
                      return newSet;
                    });
                  }}
                >
                  <Image source={{ uri: photo.uri }} style={styles.galleryImage} />
                  <View style={[
                    styles.gallerySelectCircle,
                    selectedPhotoIds.has(photo.id) && styles.gallerySelectCircleActive
                  ]} />
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Send Selected Photos Button */}
            {selectedPhotoIds.size > 0 && (
              <View style={styles.sendPhotosButtonContainer}>
                <TouchableOpacity
                  style={styles.sendPhotosButton}
                  onPress={sendSelectedPhotos}
                  activeOpacity={0.7}
                >
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <Text style={styles.sendPhotosButtonText}>
                    {selectedPhotoIds.size === 1
                      ? t('composer.selectPhotos', { count: selectedPhotoIds.size })
                      : t('composer.selectPhotosPlural', { count: selectedPhotoIds.size })}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.sheetDivider} />

            {/* Extra Tools */}
            <View style={styles.toolsList}>
              <TouchableOpacity
                style={styles.toolItem}
                activeOpacity={0.7}
                onPress={pickImageFromLibrary}
              >
                <View style={styles.toolIconContainer}>
                  <Ionicons name="images-outline" size={20} color="rgba(255,255,255,0.8)" />
                </View>
                <View style={styles.toolTextContainer}>
                  <Text style={styles.toolTitle}>{t('composer.photoPickerTitle')}</Text>
                  <Text style={styles.toolSubtitle}>{t('composer.photoPickerSubtitle')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            </View>

          </LinearGradient>
        </BlurView>
      </Animated.View>

      {/* Onboarding overlays */}
      <SpotlightOverlay />
      <ChatWelcomeOverlay />
    </Animated.View >
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0f',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  glowTop: {
    position: 'absolute',
    top: -100,
    left: -50,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: AppColors.primaryAlpha.a08,
    opacity: 0.6,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -150,
    right: -80,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: AppColors.primaryAlpha.a05,
    opacity: 0.5,
  },
  inputWrapper: {
    position: 'absolute',
    right: 0,
    pointerEvents: 'box-none',
    overflow: 'visible',
  },
  scrollToBottomButton: {
    position: 'absolute',
    right: 18,
    bottom: '100%',
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(17, 17, 22, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.45)',
    zIndex: 140,
  },
  scrollToBottomButtonWithImages: {
    marginBottom: 58,
  },
  scrollToBottomText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: -0.1,
  },
  undoFloatingContainer: {
    position: 'absolute',
    left: 16,
    bottom: '100%',
    marginBottom: 12,
    zIndex: 130,
  },
  undoFloatingContainerWithImages: {
    marginBottom: 58,
  },
  inputWrapperCentered: {
    top: 100,
    justifyContent: 'center',
  },
  // Tools Sheet
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  toolsSheet: {
    position: 'absolute',
    borderRadius: 28,
    zIndex: 2000,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sheetBlur: {
    flex: 1,
  },
  sheetGradient: {
    paddingBottom: 16,
    paddingTop: 8,
  },
  sheetHandle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  sheetHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  sheetHeaderAction: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  galleryContainer: {
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 14,
  },
  cameraCard: {
    width: 78,
    height: 78,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  galleryCard: {
    width: 78,
    height: 78,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  galleryImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  gallerySelectCircle: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  gallerySelectCircleActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  sendPhotosButtonContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sendPhotosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  sendPhotosButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  sheetDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 16,
    marginBottom: 6,
  },
  toolsList: {
    paddingHorizontal: 6,
  },
  toolItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 12,
    borderRadius: 14,
  },
  toolIconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolTextContainer: {
    flex: 1,
    gap: 1,
  },
  toolTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.1,
  },
  toolSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 16,
  },
  inputWrapperCardMode: {
    left: 0,
  },
  contextHeader: {
    position: 'absolute',
    top: 100,
    left: 60,
    right: 20,
    height: 44,
    justifyContent: 'center',
    zIndex: 5,
  },
  contextContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contextName: {
    fontSize: 15,
    fontWeight: '600',
    color: AppColors.white.full,
  },
  eyeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  output: {
    flex: 1,
    paddingLeft: 16,
    paddingTop: 100, // Further increased to add space below TabBar
  },
  outputCardMode: {
    paddingLeft: 0, // Remove sidebar offset in card mode
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -16,
    // Limita l'altezza per non finire sotto l'input bar su iPad
    maxHeight: SCREEN_HEIGHT * 0.4,
  },
  welcomeContainer: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
    marginBottom: 6,
  },
  welcomeSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.25)',
    textAlign: 'center',
    marginBottom: 24,
  },
  suggestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  suggestionText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.45)',
  },
  logoWrapper: {
    alignItems: 'center',
    opacity: 0.9,
  },
  logoIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: AppColors.primaryAlpha.a15,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: AppColors.primaryAlpha.a40,
    elevation: 8,
  },
  logoTitle: {
    fontSize: 48,
    fontWeight: '900',
    color: AppColors.white.full,
    marginBottom: 8,
  },
  logoSubtitle: {
    fontSize: 18,
    color: AppColors.primary,
    fontWeight: '600',
    marginBottom: 24,
  },
  logoDivider: {
    width: 80,
    height: 3,
    backgroundColor: AppColors.primaryAlpha.a40,
    marginBottom: 24,
    borderRadius: 2,
  },
  logoDescription: {
    fontSize: 16,
    color: AppColors.white.w60,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '400',
    maxWidth: 280,
  },
  topUpgradePill: {
    position: 'absolute',
    alignSelf: 'center',
    marginLeft: 16,
    zIndex: 100,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  upgradePillBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    gap: 6,
    borderRadius: 30,
    overflow: 'hidden',
  },
  shimmerLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '100%',
    opacity: 0.7,
  },
  innerGloss: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 30,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  upgradePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.95)',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  outputContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 20, // Reduced since output already has paddingTop:80
    // paddingBottom managed dynamically via state
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  inputGradient: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    elevation: 8,
    marginHorizontal: 16,
    zIndex: 10,
  },
  inputGradientOverflow: {
    overflow: 'hidden',
  },
  inputGradientWithImages: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 0,
  },
  inputbarTodoContainer: {
    paddingHorizontal: 10,
    paddingTop: 2,
    paddingBottom: 2,
  },
  topControls: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 4,
    overflow: 'visible',
    zIndex: 100,
  },
  modeToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderRadius: 20,
    padding: 3,
    gap: 1,
  },
  autoLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: AppColors.primary,
    letterSpacing: 0.3,
  },
  modeButton: {
    width: 30,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
  },
  modeButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  modeButtonForced: {
    borderWidth: 1,
    borderColor: AppColors.primary,
  },
  modelSelectorContainer: {
    position: 'relative',
    zIndex: 100,
  },
  modelSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  modelText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
  },
  dropdownOverlay: {
    position: 'absolute',
    top: -500,
    left: -500,
    right: -500,
    bottom: -500,
    zIndex: 998,
  },
  modelDropdown: {
    position: 'absolute',
    bottom: '100%',
    right: 16,
    marginBottom: 8,
    backgroundColor: '#1a1a1e',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 6,
    minWidth: 200,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 20,
    overflow: 'hidden',
  },
  modelDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderRadius: 12,
    marginHorizontal: 3,
    marginVertical: 2,
  },
  modelDropdownItemActive: {
    backgroundColor: AppColors.primaryAlpha.a25,
  },
  modelDropdownText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  modelDropdownTextActive: {
    color: AppColors.white.full,
    fontWeight: '700',
  },
  // Thinking level selector styles
  thinkingLevelContainer: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    marginTop: 4,
  },
  thinkingLevelLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 8,
    fontWeight: '500',
  },
  thinkingLevelOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  thinkingLevelChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  thinkingLevelChipActive: {
    backgroundColor: AppColors.primaryAlpha.a25,
    borderColor: AppColors.primary,
  },
  thinkingLevelChipText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  thinkingLevelChipTextActive: {
    color: AppColors.primary,
    fontWeight: '600',
  },
  imagePreviewContainer: {
    maxHeight: 100,
    paddingVertical: 8,
  },
  imagePreviewContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  imagePreviewItem: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 10,
  },
  // Compact image preview bar (sopra l'input)
  compactImageBar: {
    position: 'absolute',
    bottom: '100%',
    left: 16,
    right: 16,
    backgroundColor: `${AppColors.dark.surface}F2`,
    paddingTop: 14,
    paddingHorizontal: 12,
    paddingBottom: 4,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  compactImageBarContent: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  compactImageItem: {
    width: 36,
    height: 36,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  compactImage: {
    width: '100%',
    height: '100%',
  },
  compactRemoveButton: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  mainInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  toolsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: AppColors.dark.titleText,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 300,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
});
export default ChatPage;
