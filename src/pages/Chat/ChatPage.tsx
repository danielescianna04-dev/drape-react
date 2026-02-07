import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, FlatList, TouchableOpacity, KeyboardAvoidingView, Platform, Keyboard, Pressable, Dimensions, Image, Alert } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence, withRepeat, interpolate, Extrapolate, Easing } from 'react-native-reanimated';
import apiClient from '../../core/api/apiClient';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import * as MediaLibrary from 'expo-media-library';
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
import { AskUserQuestionModal } from '../../shared/components/modals/AskUserQuestionModal';
import { SubAgentStatus } from '../../shared/components/molecules/SubAgentStatus';
import { AgentProgress } from '../../shared/components/molecules/AgentProgress';
import { useNavigationStore } from '../../core/navigation/navigationStore';
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
  { id: 'claude-4-5-opus', name: 'Claude 4.6 Opus', IconComponent: AnthropicIcon, hasThinking: true },
  { id: 'claude-4-5-sonnet', name: 'Claude 4.5 Sonnet', IconComponent: AnthropicIcon, hasThinking: true },
  { id: 'gpt-5-3', name: 'GPT 5.3', IconComponent: OpenAIIcon, hasThinking: false },
  { id: 'gemini-3-pro', name: 'Gemini 3.0 Pro', IconComponent: GoogleIcon, hasThinking: true, thinkingLevels: ['low', 'high'] },
  { id: 'gemini-3-flash', name: 'Gemini 3.0 Flash', IconComponent: GoogleIcon, hasThinking: true, thinkingLevels: ['minimal', 'low', 'medium', 'high'] },
];

// Thinking level labels for display
const THINKING_LEVEL_LABELS: Record<string, string> = {
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
  // Use custom hooks for state management and UI concerns
  const chatState = useChatState(isCardMode);

  const scrollViewRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  const { sidebarTranslateX, hideSidebar, showSidebar, setForceHideToggle } = useSidebarOffset();

  // ── Auto-scroll tracking ────────────────────────────────────────
  const contentHeightRef = useRef(0);
  const layoutHeightRef = useRef(0);
  const isNearBottomRef = useRef(true);        // true = user hasn't scrolled up

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

  // Agent state - 2-mode system (Fast or Planning only)
  const [agentMode, setAgentMode] = useState<'fast' | 'planning'>('fast');

  // User plan state for upgrade CTA
  const { user } = useAuthStore();
  const isGoUser = user?.plan === 'go';
  const navigateTo = useNavigationStore((state) => state.navigateTo);
  const {
    start: startAgent,
    startExecuting: executeAgentPlan,
    stop: stopAgent,
    isRunning: agentStreaming,
    events: agentEvents,
    currentTool: agentCurrentTool,
    plan: agentPlan,
    reset: resetAgent
  } = useAgentStream(agentMode);
  // const [activeAgentProgressId, setActiveAgentProgressId] = useState<string | null>(null); // REMOVED
  const [planItemId, setPlanItemId] = useState<string | null>(null);
  const [showNextJsWarning, setShowNextJsWarning] = useState(false);
  const [nextJsWarningData, setNextJsWarningData] = useState<any>(null);

  // Liquid Glass Shimmer Animation - flows across the button
  const shimmerX = useSharedValue(-150);
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

  // ── Engine: shared event processing ──────────────────────────────
  const engine = useChatEngine(agentEvents, agentStreaming);

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
      'edit_file': (i) => { const f = getFileName(i); return f ? `Edit ${f}\n└─ Editing...` : `Edit file\n└─ Editing...`; },
      'list_directory': (i) => `List files in ${i?.path || i?.directory || '.'}\n└─ Loading...`,
      'list_files': (i) => `List files in ${i?.path || i?.directory || '.'}\n└─ Loading...`,
      'search_in_files': (i) => { const p = i?.pattern || i?.query; return p ? `Search "${p}"\n└─ Searching...` : `Search\n└─ Searching...`; },
      'grep_search': (i) => { const p = i?.pattern || i?.query; return p ? `Search "${p}"\n└─ Searching...` : `Search\n└─ Searching...`; },
      'glob_files': (i) => { const p = i?.pattern; return p ? `Glob pattern: ${p}\n└─ Searching...` : `Glob\n└─ Searching...`; },
      'run_command': (i) => { const c = i?.command; return c ? `Run command\n└─ ${c.substring(0, 50)}...` : `Run command\n└─ Executing...`; },
      'execute_command': (i) => { const c = i?.command; return c ? `Run command\n└─ ${c.substring(0, 50)}...` : `Run command\n└─ Executing...`; },
      'web_search': (i) => { const q = i?.query; return q ? `Web search\n└─ "${q}"...` : `Web search\n└─ Searching...`; },
      'web_fetch': () => `Fetch URL\n└─ Loading...`,
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
      return `Write ${f || 'file'}\n└─ File created\n\n${result}`;
    }
    if (tool === 'edit_file') {
      const f = getFileName(input);
      if (hasError) return `Edit ${f || 'file'}\n└─ Error: ${errorMessage}`;
      return `Edit ${f || 'file'}\n└─ File modified\n\n${result}`;
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
      costProps.tokensUsed = (msg as any).tokensUsed;
    }

    switch (msg.type) {
      case 'thinking':
        return { content: msg.content || '', type: TerminalItemType.OUTPUT, timestamp: msg.timestamp, isThinking: msg.isThinking, thinkingContent: msg.thinkingContent || '' };
      case 'text':
        return { content: msg.content || '', type: TerminalItemType.OUTPUT, timestamp: msg.timestamp, isThinking: false, thinkingContent: '', ...costProps };
      case 'tool_start':
        return { content: getToolStartMessage(msg.tool!, msg.toolInput), type: TerminalItemType.OUTPUT, timestamp: msg.timestamp, isExecuting: true };
      case 'tool_complete':
        return { content: formatToolResult(msg.tool!, msg.toolInput, msg.toolResult), type: TerminalItemType.OUTPUT, timestamp: msg.timestamp, isExecuting: false };
      case 'tool_error':
        return { content: `${msg.tool}\n└─ Error`, type: TerminalItemType.OUTPUT, timestamp: msg.timestamp, isExecuting: false };
      case 'error':
        return { content: msg.content || 'Errore sconosciuto', type: TerminalItemType.ERROR, timestamp: msg.timestamp };
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
      }, 300);
    } else {
      Keyboard.dismiss(); // Close keyboard when opening sheet
      if (hideSidebar) hideSidebar();
      if (setForceHideToggle) setForceHideToggle(true);
      setShowToolsSheet(true);
      loadRecentPhotos(); // Load photos when opening
      toolsSheetAnim.value = withTiming(0, {
        duration: 400,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1)
      });
    }
  }, [showToolsSheet, hideSidebar, showSidebar, setForceHideToggle, loadRecentPhotos]);

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
          Alert.alert('Limite raggiunto', 'Puoi aggiungere massimo 4 immagini');
          return prev;
        }
        const imagesToAdd = photosWithBase64.slice(0, remainingSlots);
        if (photosWithBase64.length > remainingSlots) {
          Alert.alert('Limite raggiunto', `Aggiunte solo ${remainingSlots} immagini. Massimo 4 immagini totali.`);
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
  const activeTabId = useTabStore((state) => state.activeTabId);
  const updateTab = useTabStore((state) => state.updateTab);
  const addTerminalItemToStore = useTabStore((state) => state.addTerminalItem);
  const removeTerminalItemById = useTabStore((state) => state.removeTerminalItemById);
  const updateTerminalItemById = useTabStore((state) => state.updateTerminalItemById);

  // Model selector dropdown state
  const [showModelSelector, setShowModelSelector] = useState(false);
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

  // Get current model display name
  const currentModelName = useMemo(() => {
    const model = AI_MODELS.find(m => m.id === selectedModel);
    return model?.name || 'Claude 4';
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
  }, [currentTab?.id]);

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
      isNearBottomRef.current = true;
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

  // Always add item to tab-specific storage
  const addTerminalItem = useCallback((item: any) => {
    if (!currentTab) return;

    // Use atomic function from store to avoid race conditions
    addTerminalItemToStore(currentTab.id, item);
  }, [currentTab, addTerminalItemToStore]);

  // ── Bridge: sync engine.messages → tabStore terminal items ───────
  useEffect(() => {
    if (!currentTab?.id) return;
    const prev = prevEngineMessagesRef.current;
    const curr = engine.messages;
    const idMap = engineIdMapRef.current;
    const currIds = new Set(curr.map(m => m.id));

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
      const prevMsg = prev.find(p => p.id === msg.id);

      if (!prevMsg && !idMap.has(msg.id)) {
        // New message — replace pre-thinking placeholder if it exists
        // (React may batch thinking_start + text_delta, so first message can be 'text' not 'thinking')
        // Mark in idMap FIRST to prevent duplicate adds on rapid re-renders
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
      // If !prevMsg && idMap.has(msg.id) → already processed, skip (prevents duplicates)
    }

    prevEngineMessagesRef.current = curr;
  }, [engine.messages, currentTab?.id]);

  // Handle plan approval
  const handlePlanApprove = useCallback(() => {
    if (!currentTab?.id || !planItemId) return;

    // Update plan item status to approved
    updateTerminalItemById(currentTab.id, planItemId, {
      planInfo: {
        title: agentCurrentPrompt || 'Task',
        steps: agentPlan?.steps?.map((s: any) => s.description || s) || [],
        status: 'approved',
      },
    });

    // Execute the plan
    executeAgentPlan();

    // Don't reset planItemId here - it prevents duplicate plan items during execution
    // It will be reset when a new user message is sent
  }, [currentTab?.id, planItemId, agentCurrentPrompt, agentPlan, executeAgentPlan, updateTerminalItemById]);

  // Handle plan rejection
  const handlePlanReject = useCallback(() => {
    if (!currentTab?.id || !planItemId) return;

    // Update plan item status to rejected
    updateTerminalItemById(currentTab.id, planItemId, {
      planInfo: {
        title: agentCurrentPrompt || 'Task',
        steps: agentPlan?.steps?.map((s: any) => s.description || s) || [],
        status: 'rejected',
      },
    });

    // Reset agent state
    resetAgent();
    setLoading(false);

    // Reset plan item ID
    setPlanItemId(null);
  }, [currentTab?.id, planItemId, agentCurrentPrompt, agentPlan, resetAgent, updateTerminalItemById]);

  // Load file history from storage on mount
  useEffect(() => {
    useFileHistoryStore.getState().loadHistory();
  }, []);

  // Handle plan approval - add inline plan item to chat
  useEffect(() => {
    if (agentMode === 'planning' && agentPlan && !planItemId && currentTab?.id) {
      const itemId = `plan-${Date.now()}`;
      setPlanItemId(itemId);

      // Add plan approval item to terminal
      addTerminalItem({
        id: itemId,
        content: `Piano: ${agentPlan.steps?.length || 0} passaggi`,
        type: TerminalItemType.PLAN_APPROVAL,
        timestamp: new Date(),
        planInfo: {
          title: agentCurrentPrompt || 'Task',
          steps: agentPlan.steps?.map((s: any) => s.description || s) || [],
          status: 'pending',
        },
      });
    }
  }, [agentPlan, agentMode, planItemId, currentTab?.id, agentCurrentPrompt]);

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
    }
  }, [agentStreaming, agentEvents.length, currentTab?.id, currentTab?.data?.projectId, currentTab?.data?.chatId]);

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

    // Se la tastiera è aperta, calcola top dalla posizione della tastiera
    if (keyboardHeight.value > 0) {
      const topFromKeyboard = SCREEN_HEIGHT - keyboardHeight.value - widgetHeight.value - 12;
      return {
        top: topFromKeyboard,
        left: sidebarLeft,
        transform: []
      };
    }

    // Altrimenti usa top + translateY (comportamento normale)
    const translateY = baseTranslateY - heightDiff;

    return {
      top: 410,
      left: sidebarLeft,
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



  const handleToggleMode = (mode: 'fast' | 'planning') => {
    // Switch between fast and planning agent modes
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

  const handleSend = async (images?: { uri: string; base64?: string; type?: string }[]) => {
    // Use passed images or fall back to selectedInputImages
    const imagesToSend = (images && images.length > 0) ? images : (selectedInputImages.length > 0 ? selectedInputImages : undefined);

    if ((!input.trim() && (!imagesToSend || imagesToSend.length === 0)) || isLoading) {
      return;
    }

    // Reset tool processing flag for new message
    isProcessingToolsRef.current = false;

    // Reset plan item ID so new plans can be displayed
    setPlanItemId(null);

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
    Keyboard.dismiss();

    const userMessage = input.trim() || (imagesToSend && imagesToSend.length > 0 ? `[${imagesToSend.length} immagini allegate]` : '');

    // Check if agent mode is active (fast or planning)
    const isAgentMode = agentMode === 'fast' || agentMode === 'planning';

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
      isNearBottomRef.current = true;
      setTimeout(() => scrollToBottom(true), 50);

      // Store the prompt in the agent store
      setCurrentPrompt(userMessage);
      setCurrentProjectId(currentWorkstation.id);

      // Build conversation history from terminal items (ALL messages, no limits - Claude Code style)
      // Filter only actual conversation (user messages and assistant responses, not tool outputs)
      // Include images in history for multimodal context
      const MAX_HISTORY_MESSAGES = 40;
      const MAX_MESSAGE_CHARS = 6000;
      const conversationHistory = (currentTab?.terminalItems || [])
        .filter(item =>
          item.type === TerminalItemType.USER_MESSAGE ||
          (item.type === TerminalItemType.OUTPUT && !item.content?.startsWith('Read ') &&
            !item.content?.startsWith('Write ') && !item.content?.startsWith('Edit ') &&
            !item.content?.startsWith('Execute:') && !item.content?.startsWith('Glob ') &&
            !item.content?.startsWith('Web Search') && !item.content?.startsWith('Agent:') &&
            !item.content?.startsWith('Todo List') && !item.content?.startsWith('User Question') &&
            !item.content?.startsWith('List files') && item.content !== '__BUDGET_EXCEEDED__')
        )
        .slice(-MAX_HISTORY_MESSAGES)
        .map(item => {
          const content = item.content || '';
          const historyItem: any = {
            role: item.type === TerminalItemType.USER_MESSAGE ? 'user' : 'assistant',
            content: content.length > MAX_MESSAGE_CHARS
              ? content.slice(0, MAX_MESSAGE_CHARS) + '\n...(truncated)'
              : content,
          };
          // Include images if present (for multimodal context)
          if (item.images && item.images.length > 0) {
            historyItem.images = item.images.map(img => ({
              base64: String(img.base64 || ''),
              type: String(img.type || 'image/jpeg'),
            }));
          }
          return historyItem;
        });


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
      isNearBottomRef.current = true;
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

  // Memoized filtered and processed terminal items for FlatList
  const processedTerminalItems = useMemo(() => {
    if (terminalItems.length === 0) return [];

    // Filter out null items, empty content items, and "Executing:" placeholders
    // BUT: Keep items with isThinking=true or isAgentProgress=true even if content is empty
    const filtered = terminalItems.filter(item =>
      item &&
      item.content != null &&
      (item.content.trim() !== '' || item.isThinking || (item as any).isAgentProgress) &&
      item.content !== '...' &&
      !item.content.startsWith('Executing: ')
    );

    return filtered.map((item, index, filteredArray) => {
      const prevItem = filteredArray[index - 1];
      const nextItem = filteredArray[index + 1];

      const isOutputAfterTerminalCommand =
        item.type === TerminalItemType.OUTPUT &&
        prevItem?.type === TerminalItemType.COMMAND &&
        isCommand(prevItem.content || '');

      const isNextItemAI = item.type !== TerminalItemType.USER_MESSAGE &&
        nextItem &&
        nextItem.type !== TerminalItemType.USER_MESSAGE;

      const outputItem =
        item.type === TerminalItemType.COMMAND &&
          isCommand(item.content || '') &&
          nextItem?.type === TerminalItemType.OUTPUT
          ? nextItem
          : undefined;

      const isLastItem = index === filteredArray.length - 1;
      const shouldShowLoading = isLastItem && isLoading;

      return {
        item,
        isOutputAfterTerminalCommand,
        isNextItemAI,
        outputItem,
        shouldShowLoading,
      };
    }).filter(processed => !processed.isOutputAfterTerminalCommand);
  }, [terminalItems, isLoading]);

  // ── Scroll helpers ────────────────────────────────────────────────
  const scrollToBottom = useCallback((animated = true) => {
    const offset = contentHeightRef.current - layoutHeightRef.current;
    if (offset > 0) {
      scrollViewRef.current?.scrollToOffset({ offset, animated });
    }
  }, []);

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
        {!isGoUser && !hasUserMessaged && currentTab?.type === 'terminal' && (
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
              <Text style={styles.upgradePillText}>Passa a GO</Text>
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
                  const offset = h - layoutHeightRef.current;
                  if (offset > 0) {
                    scrollViewRef.current?.scrollToOffset({ offset, animated: true });
                  }
                }
              }}
              onLayout={(e) => { layoutHeightRef.current = e.nativeEvent.layout.height; }}
              onScroll={(e) => {
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
                isNearBottomRef.current = distanceFromBottom < 150;
              }}
              scrollEventThrottle={100}
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

                // Handle budget exceeded — show upgrade card
                if (item.content === '__BUDGET_EXCEEDED__') {
                  return (
                    <View style={{
                      marginHorizontal: 16,
                      marginVertical: 12,
                      backgroundColor: 'rgba(139, 124, 246, 0.08)',
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: 'rgba(139, 124, 246, 0.2)',
                      padding: 20,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <View style={{
                          width: 36, height: 36, borderRadius: 10,
                          backgroundColor: 'rgba(139, 124, 246, 0.15)',
                          alignItems: 'center', justifyContent: 'center', marginRight: 12,
                        }}>
                          <Ionicons name="flash" size={18} color={AppColors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>
                            Budget AI esaurito
                          </Text>
                          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                            Hai utilizzato tutto il budget di questo mese
                          </Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 20, marginBottom: 16 }}>
                        Il tuo budget AI mensile è terminato. Passa al piano Go per continuare a usare l'assistente AI con un budget maggiore.
                      </Text>
                      <TouchableOpacity
                        style={{
                          backgroundColor: AppColors.primary,
                          borderRadius: 12,
                          paddingVertical: 12,
                          alignItems: 'center',
                        }}
                        onPress={() => navigateTo('plans')}
                        activeOpacity={0.8}
                      >
                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>
                          Passa a Go
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                }

                return (
                  <TerminalItemComponent
                    item={item}
                    isNextItemOutput={isNextItemAI}
                    outputItem={outputItem}
                    isLoading={shouldShowLoading}
                    onPlanApprove={item.type === TerminalItemType.PLAN_APPROVAL ? handlePlanApprove : undefined}
                    onPlanReject={item.type === TerminalItemType.PLAN_APPROVAL ? handlePlanReject : undefined}
                  />
                );
              }}
              ListEmptyComponent={terminalItems.length === 0 ? (
                <Animated.View style={[styles.emptyState, welcomeAnimatedStyle]}>
                  <View style={styles.welcomeContainer}>
                    <Text style={styles.welcomeTitle}>Come posso aiutarti?</Text>
                    <Text style={styles.welcomeSubtitle}>
                      Scrivi cosa vuoi fare o prova un suggerimento
                    </Text>
                    <View style={styles.suggestionsGrid}>
                      {[
                        { icon: 'sparkles-outline', text: 'Aggiungi una nuova feature' },
                        { icon: 'bug-outline', text: 'Trova e correggi i bug' },
                        { icon: 'color-palette-outline', text: 'Migliora il design' },
                        { icon: 'rocket-outline', text: 'Ottimizza le performance' },
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
                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, fontStyle: 'italic' }}>
                          Thinking...
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Show TodoList if agent has active todos */}
                  {engine.currentTodos.length > 0 && (
                    <TodoList todos={engine.currentTodos} />
                  )}

                  {/* Show SubAgentStatus if a sub-agent is running */}
                  {currentSubAgent && (
                    <SubAgentStatus subAgent={currentSubAgent} />
                  )}
                </>
              ) : null}
            />

            {/* AskUserQuestion Modal */}
            <AskUserQuestionModal
              visible={!!engine.pendingQuestion}
              questions={engine.pendingQuestion || []}
              onAnswer={(answers) => {
                // Format answers as a response message to continue the agent
                const questions = engine.pendingQuestion || [];
                const responseLines = questions.map((q: any, idx: number) => {
                  const answer = answers[`q${idx}`] || '';
                  return `${q.question}: ${answer}`;
                }).join('\n');

                const responseMessage = `Ecco le mie risposte:\n${responseLines}`;

                // Resume agent with the answers by sending as a new message
                if (currentWorkstation?.id) {
                  // Reset engine and bridge for new session
                  engine.reset();
                  prevEngineMessagesRef.current = [];
                  engineIdMapRef.current.clear();

                  // Add user response to terminal
                  addTerminalItem({
                    id: Date.now().toString(),
                    content: responseMessage,
                    type: TerminalItemType.USER_MESSAGE,
                    timestamp: new Date(),
                  });

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

                  startAgent(responseMessage, currentWorkstation.id, selectedModel, conversationHistory, undefined, thinkingLevel);
                }
              }}
              onCancel={() => {
                // No-op: engine manages pendingQuestion state
              }}
            />

            <Animated.View style={[
              styles.inputWrapper,
              isCardMode && styles.inputWrapperCardMode,
              inputWrapperAnimatedStyle
            ]}>
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
                style={[
                  styles.inputGradient,
                  { borderRadius: 24, overflow: 'hidden' },
                  selectedInputImages.length > 0 && styles.inputGradientWithImages
                ]}
                onLayout={(e) => {
                  const newHeight = e.nativeEvent.layout.height;
                  widgetHeight.value = withTiming(newHeight, { duration: 100 });
                }}
              >
                {/* Background Layer */}
                {isLiquidGlassSupported ? (
                  <>
                    <BlurView
                      intensity={80}
                      tint="dark"
                      style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
                    />
                    <LiquidGlassView
                      style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
                      interactive={true}
                      effect="regular"
                      colorScheme="dark"
                    />
                  </>
                ) : (
                  <LinearGradient
                    colors={[`${AppColors.dark.surface}F9`, `${AppColors.dark.surface}EB`]}
                    style={StyleSheet.absoluteFill}
                  />
                )}
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
                          <Ionicons
                            name="flash"
                            size={14}
                            color={agentMode === 'fast' ? AppColors.white.full : '#8A8A8A'}
                          />
                        </Animated.View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleToggleMode('planning')}
                        style={[
                          styles.modeButton,
                          agentMode === 'planning' && styles.modeButtonActive,
                        ]}
                      >
                        <Animated.View style={agentMode === 'planning' ? aiModeAnimatedStyle : undefined}>
                          <Ionicons
                            name="clipboard"
                            size={14}
                            color={agentMode === 'planning' ? AppColors.white.full : '#8A8A8A'}
                          />
                        </Animated.View>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.modelSelector}
                    onPress={toggleModelSelector}
                  >
                    <SafeText style={styles.modelText}>{currentModelName}</SafeText>
                    <Ionicons
                      name={showModelSelector ? "chevron-up" : "chevron-down"}
                      size={12}
                      color={AppColors.dark.bodyText}
                    />
                  </TouchableOpacity>
                </View>

                {/* Undo/Redo Bar */}
                {currentWorkstation?.id && (
                  <UndoRedoBar
                    projectId={currentWorkstation.id}
                    onUndoComplete={() => {}}
                    onRedoComplete={() => {}}
                  />
                )}

                {/* Main Input Row */}
                <View style={styles.mainInputRow}>
                  <TouchableOpacity
                    style={styles.toolsButton}
                    onPress={toggleToolsSheet}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={24} color="#8A8A8A" />
                  </TouchableOpacity>

                  <TextInput
                    style={[styles.input, { textTransform: 'none' }]}
                    value={input}
                    onChangeText={handleInputChange}
                    placeholder={
                      agentMode === 'fast'
                        ? 'Fast agent - esecuzione diretta...'
                        : 'Planning agent - crea un piano...'
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
                    style={styles.sendButton}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={agentStreaming || isLoading ? "stop-circle" : "arrow-up-circle"}
                      size={32}
                      color={agentStreaming || isLoading ? "#FF6B6B" : (input.trim() || selectedInputImages.length > 0) ? AppColors.primary : AppColors.dark.surfaceVariant}
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
                  <Animated.View style={[styles.modelDropdown, dropdownAnimatedStyle]}>
                    {AI_MODELS.map((model) => {
                      const IconComponent = model.IconComponent;
                      const isSelected = selectedModel === model.id;
                      const hasThinkingOptions = model.thinkingLevels && model.thinkingLevels.length > 0;

                      return (
                        <TouchableOpacity
                          key={model.id}
                          style={[
                            styles.modelDropdownItem,
                            isSelected && styles.modelDropdownItemActive
                          ]}
                          onPress={() => {
                            setSelectedModel(model.id);
                            // Set default thinking level when switching to a model with thinking
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
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={16} color={AppColors.primary} />
                          )}
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
                          <SafeText style={styles.thinkingLevelLabel}>Livello ragionamento:</SafeText>
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
                <Text style={styles.sheetHeaderAction}>Tutte le foto</Text>
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
                          Alert.alert('Limite raggiunto', 'Puoi selezionare massimo 4 immagini in totale');
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
                    Seleziona {selectedPhotoIds.size} {selectedPhotoIds.size === 1 ? 'foto' : 'foto'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.sheetDivider} />

            {/* Tools List */}
            <View style={styles.toolsList}>
              <TouchableOpacity style={styles.toolItem} activeOpacity={0.6}>
                <View style={styles.toolIconContainer}>
                  <Ionicons name="sparkles-outline" size={18} color="#fff" />
                </View>
                <View style={styles.toolTextContainer}>
                  <Text style={styles.toolTitle}>Crea immagine</Text>
                  <Text style={styles.toolSubtitle}>Rendi visibile ogni concetto</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.toolItem} activeOpacity={0.6}>
                <View style={styles.toolIconContainer}>
                  <Ionicons name="bulb-outline" size={18} color="#fff" />
                </View>
                <View style={styles.toolTextContainer}>
                  <Text style={styles.toolTitle}>Pensa</Text>
                  <Text style={styles.toolSubtitle}>Pensa più a lungo per risposte migliori</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.toolItem} activeOpacity={0.6}>
                <View style={styles.toolIconContainer}>
                  <Ionicons name="search-outline" size={18} color="#fff" />
                </View>
                <View style={styles.toolTextContainer}>
                  <Text style={styles.toolTitle}>Deep Research</Text>
                  <Text style={styles.toolSubtitle}>Ottieni un report dettagliato</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.toolItem} activeOpacity={0.6}>
                <View style={styles.toolIconContainer}>
                  <Ionicons name="globe-outline" size={18} color="#fff" />
                </View>
                <View style={styles.toolTextContainer}>
                  <Text style={styles.toolTitle}>Ricerca sul web</Text>
                  <Text style={styles.toolSubtitle}>Trova notizie e informazioni in tempo reale</Text>
                </View>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </BlurView>
      </Animated.View>

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
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: AppColors.primaryAlpha.a15,
    elevation: 8,
    marginHorizontal: 16, // Margine orizzontale per restringere la card
    zIndex: 10,
  },
  inputGradientWithImages: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 0,
  },
  topControls: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.dark.surfaceAlt,
    padding: 2,
  },
  autoLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: AppColors.primary,
    letterSpacing: 0.3,
  },
  modeButton: {
    width: 28,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  modeButtonActive: {
    backgroundColor: AppColors.primaryAlpha.a20,
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
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: AppColors.dark.surfaceAlt,
    gap: 4,
  },
  modelText: {
    fontSize: 10,
    color: AppColors.icon.default,
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderBottomWidth: 0,
    borderColor: AppColors.primaryAlpha.a15,
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
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toolsButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: AppColors.dark.titleText,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    paddingHorizontal: 16,
    paddingVertical: 14,
    maxHeight: 300, // Altezza massima del campo di input
    lineHeight: 20,
    textAlignVertical: 'top', // Allinea il testo in alto nel campo
  },
});
export default ChatPage;
