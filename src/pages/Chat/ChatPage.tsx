import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Keyboard, Pressable, Dimensions, Image, Alert } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence, withRepeat, interpolate, Extrapolate, Easing } from 'react-native-reanimated';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { useTerminalStore } from '../../core/terminal/terminalStore';
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
import { AnthropicIcon, GoogleIcon } from '../../shared/components/icons';
import { useFileHistoryStore } from '../../core/history/fileHistoryStore';
import { UndoRedoBar } from '../../features/terminal/components/UndoRedoBar';
import { useAgentStream } from '../../hooks/api/useAgentStream';
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
  { id: 'claude-4-5-opus', name: 'Claude 4.5 Opus', IconComponent: AnthropicIcon, hasThinking: true },
  { id: 'claude-4-5-sonnet', name: 'Claude 4.5 Sonnet', IconComponent: AnthropicIcon, hasThinking: true },
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

  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const { sidebarTranslateX, hideSidebar, showSidebar, setForceHideToggle } = useSidebarOffset();

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

  // Track processed events to avoid duplicates in terminal
  const processedEventIdsRef = useRef<Set<string>>(new Set());

  // Track tool_start inputs to get filenames later (since tool_complete may not have input)
  const toolInputsRef = useRef<Map<string, any>>(new Map());

  // Track executing item IDs by tool ID (to link tool_start with tool_complete)
  const executingToolItemsRef = useRef<Map<string, string>>(new Map());

  // Track tool start timestamps for minimum display time
  const toolStartTimesRef = useRef<Map<string, number>>(new Map());
  const MIN_TOOL_DISPLAY_MS = 400; // Minimum time to show executing indicator

  // Track accumulated streaming content (to avoid losing deltas due to async state updates)
  const streamingContentRef = useRef<string>('');

  // Track accumulated thinking content for real-time streaming
  const thinkingContentRef = useRef<string>('');

  // Track accumulated cost for the current agent session
  const sessionCostRef = useRef<{ costEur: number; inputTokens: number; outputTokens: number }>({
    costEur: 0,
    inputTokens: 0,
    outputTokens: 0,
  });

  // Effect to map agent events to terminal items (Old School Style - Restored UI)
  useEffect(() => {
    if (!agentEvents || agentEvents.length === 0) return;

    agentEvents.forEach(event => {
      // Use composite key (id + type) since tool_start and tool_complete share the same id
      const eventKey = `${event.id}-${event.type}`;
      if (processedEventIdsRef.current.has(eventKey)) return;
      processedEventIdsRef.current.add(eventKey);

      // 0. ITERATION_START -> Reset thinking for new iteration (so each iteration has separate thinking)
      if (event.type === 'iteration_start') {
        const iteration = (event as any).iteration || 1;
        // After first iteration, close previous thinking and create new placeholder immediately
        if (iteration > 1) {
          // Close previous thinking if exists
          if (currentAgentMessageIdRef.current?.startsWith('agent-thinking-')) {
            updateTerminalItemById(currentTab?.id || '', currentAgentMessageIdRef.current, {
              isThinking: false, // Mark as complete
            });
          }

          // IMMEDIATELY create new thinking placeholder - never leave user waiting
          const newThinkingId = `agent-thinking-${Date.now()}`;
          currentAgentMessageIdRef.current = newThinkingId;
          thinkingContentRef.current = ''; // Reset thinking content for new iteration

          addTerminalItem({
            id: newThinkingId,
            content: '',
            type: TerminalItemType.OUTPUT,
            timestamp: new Date(),
            isThinking: true,
            thinkingContent: '',
          });
        }
        return;
      }

      // 0.5. THINKING -> Stream thinking content in real-time (letter by letter effect)
      if (event.type === 'thinking' && (event as any).text) {
        const thinkingText = (event as any).text;

        // Create thinking item if not exists
        if (!currentAgentMessageIdRef.current || !currentAgentMessageIdRef.current.startsWith('agent-thinking-')) {
          currentAgentMessageIdRef.current = `agent-thinking-${Date.now()}`;
          thinkingContentRef.current = ''; // Reset for new thinking

          // Add new thinking item
          addTerminalItem({
            id: currentAgentMessageIdRef.current,
            content: '',
            type: TerminalItemType.OUTPUT,
            timestamp: new Date(),
            isThinking: true,
            thinkingContent: thinkingText,
          });
          thinkingContentRef.current = thinkingText;
        } else {
          // Accumulate and update existing thinking item in real-time
          thinkingContentRef.current += thinkingText;
          updateTerminalItemById(currentTab?.id || '', currentAgentMessageIdRef.current, {
            thinkingContent: thinkingContentRef.current,
          });
        }
        return;
      }

      // 1. TOOL START -> Show executing indicator for ALL tools
      if (event.type === 'tool_start') {
        console.log('[ChatPage] tool_start event:', event.tool, 'ID:', event.id, 'input:', event.input);

        // Store the input for later use in tool_complete
        if (event.tool && event.input) {
          toolInputsRef.current.set(event.tool, event.input);
        }

        // Generate formatted message matching tool_complete format (but with loading indicator)
        const getToolStartMessage = (tool: string, input: any): string => {
          // Parse input safely
          let parsedInput: any = {};
          try {
            parsedInput = typeof input === 'string' ? JSON.parse(input) : (input || {});
          } catch {
            parsedInput = input || {};
          }

          const getFileName = (i: any) => {
            const path = i?.path || i?.filePath || '';
            return path ? path.split('/').pop() || path : '?';
          };

          const toolMessages: Record<string, (i: any) => string> = {
            'read_file': (i) => `Read ${getFileName(i)}\n└─ Reading...`,
            'write_file': (i) => `Write ${getFileName(i)}\n└─ Writing...`,
            'edit_file': (i) => `Edit ${getFileName(i)}\n└─ Editing...`,
            'list_directory': (i) => `List files in ${i?.path || i?.directory || '.'}\n└─ Loading...`,
            'list_files': (i) => `List files in ${i?.path || i?.directory || '.'}\n└─ Loading...`,
            'search_in_files': (i) => `Search "${i?.pattern || i?.query || '?'}"\n└─ Searching...`,
            'grep_search': (i) => `Search "${i?.pattern || i?.query || '?'}"\n└─ Searching...`,
            'glob_files': (i) => `Glob pattern: ${i?.pattern || '?'}\n└─ Searching...`,
            'run_command': (i) => `Run command\n└─ ${(i?.command || '?').substring(0, 50)}...`,
            'execute_command': (i) => `Run command\n└─ ${(i?.command || '?').substring(0, 50)}...`,
            'web_search': (i) => `Web search\n└─ "${i?.query || '?'}"...`,
            'web_fetch': (i) => `Fetch URL\n└─ Loading...`,
            'ask_user_question': () => `User Question\n└─ Waiting for response...`,
            'todo_write': () => `Todo List\n└─ Updating...`,
            'signal_completion': () => `Completion\n└─ Finishing...`,
          };

          const getMessage = toolMessages[tool];
          if (getMessage) {
            try {
              return getMessage(parsedInput);
            } catch {
              return `${tool}\n└─ Running...`;
            }
          }
          return `${tool}\n└─ Running...`;
        };

        // Skip signal_completion as it's internal
        if (event.tool !== 'signal_completion') {
          const message = getToolStartMessage(event.tool || '', event.input);
          const itemId = `${event.id}-executing`;

          // Reset streaming message ref so next message creates new item
          if (currentAgentMessageIdRef.current?.startsWith('streaming-msg-')) {
            currentAgentMessageIdRef.current = null;
          }

          // Store the item ID and start time
          executingToolItemsRef.current.set(event.id, itemId);
          toolStartTimesRef.current.set(event.id, Date.now());

          addTerminalItem({
            id: itemId,
            content: message,
            type: TerminalItemType.OUTPUT,
            timestamp: new Date(event.timestamp),
            isExecuting: true, // Mark as executing for styling
          });
        }
      }

      // 2. TOOL INPUT -> Just store input, don't show indicator (handled by tool_start)
      else if (event.type === 'tool_input') {
        // Store the input for later use in tool_complete
        if (event.tool && event.input) {
          toolInputsRef.current.set(event.tool, event.input);
        }
      }

      // 3. TOOL COMPLETE -> Replace executing indicator with formatted result
      // Handle signal_completion specially - show as completion message
      else if (event.type === 'tool_complete' && event.tool === 'signal_completion') {
        // Extract completion message from input
        let completionMessage = '';
        try {
          const input = typeof event.input === 'string' ? JSON.parse(event.input) : event.input;
          completionMessage = input?.result || '';
        } catch (e) {
          console.warn('[ChatPage] Failed to parse signal_completion input:', e);
        }

        if (completionMessage) {
          // Add completion message as an AI response
          addTerminalItem({
            id: `completion-${Date.now()}`,
            content: completionMessage,
            type: TerminalItemType.OUTPUT,
            timestamp: new Date(event.timestamp),
            isAgentMessage: true,
          });
        }
      }
      // Handle other tool completions
      else if (event.type === 'tool_complete' && event.tool !== 'signal_completion') {
        const resultPreview = typeof event.result === 'string' ? event.result.substring(0, 100) : event.result;
        const resultLines = typeof event.result === 'string' ? event.result.split('\n').length : 0;
        console.log('[ChatPage] tool_complete event:', event.tool, 'ID:', event.id, 'looking for:', `${event.id}-executing`);

        let formattedOutput = '';

        // Safely get result as string - handle object results with .content field
        let result = '';
        let hasError = false;
        let errorMessage = '';
        try {
          if (event.result !== null && event.result !== undefined) {
            // Check if result is an error object
            if (typeof event.result === 'object' && event.result.success === false) {
              hasError = true;
              errorMessage = event.result.error || 'Unknown error';
            }
            // If result is an object with .content field, extract it
            else if (typeof event.result === 'object' && event.result.content) {
              result = typeof event.result.content === 'string'
                ? event.result.content
                : JSON.stringify(event.result.content);
            }
            // If result is an object with .message field (e.g., write_file), extract it
            else if (typeof event.result === 'object' && event.result.message) {
              result = event.result.message;
            } else {
              result = typeof event.result === 'string' ? event.result : JSON.stringify(event.result);
            }
          }
        } catch (e) {
          console.warn('[ChatPage] Failed to stringify tool result:', e);
          result = '';
        }

        // Log extracted result
        const extractedResultLines = result.split('\n').length;
        console.log(`[RESULT DEBUG] Tool: ${event.tool}, Extracted result lines: ${extractedResultLines}, Has error: ${hasError}`);

        // If there's an error, we'll format it as normal but with error message
        // The red dot will be shown automatically by TerminalItem based on "Error:" text

        // Safely parse input - try event.input first, then fallback to stored input
        let input: any = {};
        try {
          if (event.input) {
            input = typeof event.input === 'string' ? JSON.parse(event.input) : event.input;
          } else if (event.tool && toolInputsRef.current.has(event.tool)) {
            // Fallback to stored input from tool_input event
            const storedInput = toolInputsRef.current.get(event.tool);
            input = typeof storedInput === 'string' ? JSON.parse(storedInput) : storedInput;
          }
        } catch (e) {
          console.warn('[ChatPage] Failed to parse tool input:', e);
          input = {};
        }

        console.log('[ChatPage] Parsed input:', input, 'path:', input?.path, 'filePath:', input?.filePath);

        // Format based on tool type (matching old UI expectations)
        if (event.tool === 'read_file') {
          const lines = result ? result.split('\n').length : 0;
          const filePath = input?.file_path || input?.path || input?.filePath || '?';
          const fileName = filePath !== '?' ? filePath.split('/').pop() || filePath : '?';
          formattedOutput = `Read ${fileName}\n└─ ${lines} line${lines !== 1 ? 's' : ''}\n\n${result}`;
        }
        else if (event.tool === 'write_file') {
          const filePath = input?.file_path || input?.path || input?.filePath || '?';
          const fileName = filePath !== '?' ? filePath.split('/').pop() || filePath : '?';
          formattedOutput = `Write ${fileName}\n└─ File created\n\n${result}`;
        }
        else if (event.tool === 'edit_file') {
          const filePath = input?.file_path || input?.path || input?.filePath || '?';
          const fileName = filePath !== '?' ? filePath.split('/').pop() || filePath : '?';
          if (hasError) {
            // Show error without the diff box
            formattedOutput = `Edit ${fileName}\n└─ Error: ${errorMessage}`;
          } else {
            // Show success with diff
            formattedOutput = `Edit ${fileName}\n└─ File modified\n\n${result}`;
          }
        }
        else if (event.tool === 'write_file') {
          const filePath = input?.file_path || input?.path || input?.filePath || '?';
          const fileName = filePath !== '?' ? filePath.split('/').pop() || filePath : '?';

          if (hasError) {
            formattedOutput = `Write ${fileName}\n└─ Error: ${errorMessage}`;
          } else {
            // Try to extract bytes from result message
            let bytes = 0;
            try {
              if (typeof result === 'string') {
                const bytesMatch = result.match(/(\d+)\s+bytes/);
                if (bytesMatch) {
                  bytes = parseInt(bytesMatch[1]);
                }
              }
            } catch (e) {
              console.warn('[ChatPage] Failed to parse bytes:', e);
            }

            formattedOutput = bytes > 0
              ? `Write ${fileName}\n└─ File created (${bytes} bytes)`
              : `Write ${fileName}\n└─ File created`;
          }
        }
        else if (event.tool === 'glob_files') {
          const pattern = input?.pattern || '?';
          const fileCount = result ? result.split('\n').filter((l: string) => l.trim()).length : 0;
          formattedOutput = `Glob pattern: ${pattern}\n└─ Found ${fileCount} file(s)\n\n${result}`;
        }
        else if (event.tool === 'list_directory' || event.tool === 'list_files') {
          const dir = input?.directory || input?.dirPath || input?.path || '.';
          const fileCount = result ? result.split('\n').filter((l: string) => l.trim()).length : 0;
          formattedOutput = `List files in ${dir}\n└─ ${fileCount} file${fileCount !== 1 ? 's' : ''}\n\n${result}`;
        }
        else if (event.tool === 'search_in_files' || event.tool === 'grep_search') {
          const pattern = input?.pattern || input?.query || '?';
          const matches = result ? result.split('\n').filter((l: string) => l.includes(':')).length : 0;
          formattedOutput = `Search "${pattern}"\n└─ ${matches} match${matches !== 1 ? 'es' : ''}\n\n${result}`;
        }
        else if (event.tool === 'run_command' || event.tool === 'execute_command') {
          const cmd = input?.command || '?';

          // Check if this is a curl command
          if (cmd.startsWith('curl')) {
            // Extract URL from curl command
            const urlMatch = cmd.match(/curl\s+(?:-[sS]\s+)?(?:['"])?([^\s'"]+)/);
            const url = urlMatch ? urlMatch[1] : cmd.substring(5).trim();

            // Check for error in result
            let exitCode = 0;
            let stdout = '';
            let stderr = '';

            try {
              // Try parsing event.result as object first
              if (typeof event.result === 'object' && event.result !== null) {
                exitCode = event.result.exitCode || 0;
                stdout = event.result.stdout || '';
                stderr = event.result.stderr || '';
              }
              // If result is a string (already stringified), try to parse it
              else if (typeof result === 'string' && result.includes('exitCode')) {
                const parsed = JSON.parse(result);
                exitCode = parsed.exitCode || 0;
                stdout = parsed.stdout || '';
                stderr = parsed.stderr || '';
              }
            } catch (e) {
              console.warn('[ChatPage] Failed to parse curl result:', e);
              // If parsing fails, just show the raw result as stdout
              stdout = result || '';
            }

            const hasError = exitCode !== 0 || stderr;
            const status = hasError ? `Error (exit ${exitCode})` : 'Completed';

            // Format: Execute: curl <url>\n└─ status\n\noutput (if any)
            // Only include output if it's meaningful (not empty and not just JSON metadata)
            let output = '';
            if (stdout && stdout.trim()) {
              output = `\n\n${stdout}`;
            }
            if (stderr && stderr.trim()) {
              output += `\n\nError: ${stderr}`;
            }

            formattedOutput = `Execute: curl ${url}\n└─ ${status}${output}`;
          } else {
            // Regular command - extract stdout from result object first
            let actualOutput = result;

            // If result is an object with stdout, extract it
            if (typeof event.result === 'object' && event.result !== null && event.result.stdout) {
              actualOutput = event.result.stdout;
              console.log(`[TRUNCATE DEBUG] Extracted stdout from object result`);
            }

            // Regular command - truncate long outputs
            const resultLines = (actualOutput || '').split('\n');
            const MAX_OUTPUT_LINES = 50;

            console.log(`[TRUNCATE DEBUG] Command: ${cmd}`);
            console.log(`[TRUNCATE DEBUG] Total lines: ${resultLines.length}`);
            console.log(`[TRUNCATE DEBUG] Should truncate: ${resultLines.length > MAX_OUTPUT_LINES}`);

            let truncatedResult = actualOutput;
            if (resultLines.length > MAX_OUTPUT_LINES) {
              truncatedResult = resultLines.slice(0, MAX_OUTPUT_LINES).join('\n') +
                `\n\n... (${resultLines.length - MAX_OUTPUT_LINES} more lines - expand to see all)`;
              console.log(`[TRUNCATE DEBUG] Truncated! Showing ${MAX_OUTPUT_LINES}/${resultLines.length} lines`);
            }
            formattedOutput = `Execute: ${cmd}\n└─ Command completed\n\n${truncatedResult}`;
            console.log(`[TRUNCATE DEBUG] Formatted output length: ${formattedOutput.length}`);
          }
        }
        else if (event.tool === 'launch_sub_agent') {
          // Parse sub-agent info
          const agentType = input?.subagent_type || input?.type || 'agent';
          const description = input?.description || input?.prompt?.substring(0, 60) || 'Task';

          // Check for error
          if (hasError) {
            formattedOutput = `Agent: ${agentType}\n└─ Error: ${errorMessage}\n\n${description}`;
          } else {
            // Parse result if available
            let summary = '';
            try {
              if (typeof event.result === 'object' && event.result.summary) {
                summary = event.result.summary;
              } else if (typeof result === 'string' && result.length > 0 && result !== 'undefined') {
                summary = result;
              }
            } catch (e) {
              console.warn('[ChatPage] Failed to parse sub-agent result:', e);
            }

            const summaryText = summary ? `\n\n${summary}` : '';
            formattedOutput = `Agent: ${agentType}\n└─ Completed\n\n${description}${summaryText}`;
          }
        }
        else if (event.tool === 'todo_write') {
          // Parse todos from input
          let todos = [];
          try {
            todos = input?.todos || [];
          } catch (e) {
            console.warn('[ChatPage] Failed to parse todos:', e);
          }

          const totalTasks = todos.length;
          const completedTasks = todos.filter((t: any) => t.status === 'completed').length;
          const inProgressTasks = todos.filter((t: any) => t.status === 'in_progress').length;

          // Format todos as lines
          const todoLines = todos.map((todo: any) => {
            const status = todo.status || 'pending';
            const content = todo.content || '';
            return `${status}|${content}`;
          }).join('\n');

          formattedOutput = `Todo List\n└─ ${totalTasks} task${totalTasks !== 1 ? 's' : ''} (${completedTasks} done, ${inProgressTasks} in progress)\n\n${todoLines}`;
        }
        else if (event.tool === 'web_search') {
          // Parse web search results from event.result object
          let searchResults: any[] = [];
          let query = '';
          let count = 0;

          try {
            // event.result is already an object for web_search
            if (typeof event.result === 'object' && event.result.results) {
              searchResults = event.result.results || [];
              query = event.result.query || input?.query || '?';
              count = event.result.count || searchResults.length;
            }
          } catch (e) {
            console.warn('[ChatPage] Failed to parse web search results:', e);
          }

          // Format results as lines: title|url|snippet
          const resultLines = searchResults.map((r: any) => {
            const title = r.title || 'Untitled';
            const url = r.url || '';
            const snippet = r.snippet || '';
            return `${title}|${url}|${snippet}`;
          }).join('\n');

          formattedOutput = `Web Search "${query}"\n└─ ${count} result${count !== 1 ? 's' : ''} found\n\n${resultLines}`;
        }
        else if (event.tool === 'ask_user_question') {
          // Parse ask_user_question results
          let questions: any[] = [];
          let answers: any = {};

          try {
            // Get questions from input
            if (input?.questions) {
              questions = input.questions;
            }
            // Get answers from result
            if (typeof event.result === 'object' && event.result.answers) {
              answers = event.result.answers;
            }
          } catch (e) {
            console.warn('[ChatPage] Failed to parse ask_user_question:', e);
          }

          // Format as question|answer pairs
          const qaLines = questions.map((q: any, index: number) => {
            const question = q.question || '';
            const answer = answers[`q${index}`] || 'No answer';
            return `${question}|${answer}`;
          }).join('\n');

          formattedOutput = `User Question\n└─ ${questions.length} question${questions.length !== 1 ? 's' : ''} answered\n\n${qaLines}`;
        }
        else {
          // Generic format for unknown tools
          formattedOutput = `${event.tool}\n└─ Completed\n\n${result}`;
        }

        // Find the executing item ID from the map using event.id (toolId)
        // Both tool_start and tool_complete have the same event.id from backend
        const executingItemId = executingToolItemsRef.current.get(event.id) || `${event.id}-executing`;
        console.log('[ChatPage] tool_complete: looking for item', executingItemId, 'for tool', event.tool, 'eventId:', event.id);

        // Calculate time since tool started
        const startTime = toolStartTimesRef.current.get(event.id) || Date.now();
        const elapsed = Date.now() - startTime;
        const delay = Math.max(0, MIN_TOOL_DISPLAY_MS - elapsed);

        // Update after minimum display time (so user always sees the executing indicator)
        const doUpdate = () => {
          updateTerminalItemById(currentTab.id, executingItemId, {
            content: formattedOutput,
            isExecuting: false, // Remove pulsing animation
          });
          // Clean up the map entries
          executingToolItemsRef.current.delete(event.id);
          toolStartTimesRef.current.delete(event.id);
        };

        if (delay > 0) {
          setTimeout(doUpdate, delay);
        } else {
          doUpdate();
        }
      }

      // Handle TEXT_DELTA events (real-time streaming from AI)
      else if (event.type === 'text_delta') {
        const delta = (event as any).delta || (event as any).text;
        if (delta) {
          // Check if we need to transition from thinking to streaming
          const wasThinking = currentAgentMessageIdRef.current?.startsWith('agent-thinking-');
          if (wasThinking) {
            // DON'T remove thinking - update it to mark as completed (stays in place)
            updateTerminalItemById(currentTab.id, currentAgentMessageIdRef.current, {
              isThinking: false, // Mark thinking as done but keep it visible
            });
            // Create new streaming message ID immediately (before accumulating)
            const newStreamingId = `streaming-msg-${Date.now()}`;
            currentAgentMessageIdRef.current = newStreamingId;
            // Reset and start accumulating
            streamingContentRef.current = delta;

            addTerminalItem({
              id: newStreamingId,
              content: delta,
              type: TerminalItemType.OUTPUT,
              timestamp: new Date(event.timestamp),
            });
          } else if (currentAgentMessageIdRef.current?.startsWith('streaming-msg-')) {
            // Already streaming - accumulate and update
            streamingContentRef.current += delta;
            updateTerminalItemById(currentTab?.id || '', currentAgentMessageIdRef.current, {
              content: streamingContentRef.current,
            });
          } else {
            // Edge case: no thinking, no streaming - create new message
            streamingContentRef.current = delta;
            const newStreamingId = `streaming-msg-${Date.now()}`;
            currentAgentMessageIdRef.current = newStreamingId;

            addTerminalItem({
              id: newStreamingId,
              content: delta,
              type: TerminalItemType.OUTPUT,
              timestamp: new Date(event.timestamp),
            });
          }
        }
      }

      // Handle MESSAGE events (complete messages, fallback)
      else if (event.type === 'message' || event.type === 'response') {
        // Extract message content
        const msg = (event as any).content || (event as any).message || (event as any).text || (event as any).output;
        let content = msg;
        if (typeof msg === 'object' && msg !== null) {
          content = msg.text || msg.content || msg.message || JSON.stringify(msg);
        }

        if (content && content.trim()) {
          // Mark thinking as completed (keep it visible in place)
          if (currentAgentMessageIdRef.current?.startsWith('agent-thinking-')) {
            updateTerminalItemById(currentTab.id, currentAgentMessageIdRef.current, {
              isThinking: false,
            });
            currentAgentMessageIdRef.current = null;
          }

          // Check if we have an existing streaming message to append to
          const existingStreamingId = currentAgentMessageIdRef.current;

          if (existingStreamingId && existingStreamingId.startsWith('streaming-msg-')) {
            // Append to existing message (streaming effect)
            const currentTab = tabs.find(t => t.id === activeTabId);
            const existingItem = currentTab?.terminalItems?.find(i => i.id === existingStreamingId);
            const currentContent = existingItem?.content || '';

            updateTerminalItemById(currentTab?.id || '', existingStreamingId, {
              content: currentContent + content,
            });
          } else {
            // Create new streaming message
            const newStreamingId = `streaming-msg-${event.id}`;
            currentAgentMessageIdRef.current = newStreamingId;

            addTerminalItem({
              id: newStreamingId,
              content: content,
              type: TerminalItemType.OUTPUT,
              timestamp: new Date(event.timestamp),
            });
          }
        }
      }

      // Handle errors explicitly
      // Budget exceeded — show upgrade CTA instead of error
      else if (event.type === 'budget_exceeded') {
        // Mark thinking as completed (keep visible)
        if (currentAgentMessageIdRef.current?.startsWith('agent-thinking-')) {
          updateTerminalItemById(currentTab.id, currentAgentMessageIdRef.current, {
            isThinking: false,
          });
          currentAgentMessageIdRef.current = null;
        }

        addTerminalItem({
          id: `budget-exceeded-${Date.now()}`,
          content: `__BUDGET_EXCEEDED__`,
          type: TerminalItemType.OUTPUT,
          timestamp: new Date(event.timestamp),
        });
      }

      else if (event.type === 'error' || event.type === 'fatal_error') {
        addTerminalItem({
          id: event.id,
          content: `❌ ${event.error || event.message}`,
          type: TerminalItemType.ERROR,
          timestamp: new Date(event.timestamp),
        });
      }

      // Handle usage events to track cost
      else if (event.type === 'usage') {
        sessionCostRef.current = {
          costEur: (event as any).totalCostEur || 0,
          inputTokens: (event as any).totalInputTokens || 0,
          outputTokens: (event as any).totalOutputTokens || 0,
        };
      }

      // Handle complete/done events to finalize the streaming message with cost
      else if (event.type === 'complete' || event.type === 'done') {
        const currentMessageId = currentAgentMessageIdRef.current;
        if (currentMessageId && currentTab?.id && sessionCostRef.current.costEur > 0) {
          // Update the terminal item with cost information
          useTabStore.setState((state) => ({
            tabs: state.tabs.map(t =>
              t.id === currentTab.id
                ? {
                    ...t,
                    terminalItems: t.terminalItems?.map(item =>
                      item.id === currentMessageId
                        ? {
                            ...item,
                            costEur: sessionCostRef.current.costEur,
                            tokensUsed: {
                              input: sessionCostRef.current.inputTokens,
                              output: sessionCostRef.current.outputTokens,
                            },
                          }
                        : item
                    ) || [],
                  }
                : t
            ),
          }));
        }

        // Reset session cost for next run
        sessionCostRef.current = { costEur: 0, inputTokens: 0, outputTokens: 0 };
      }
    });
  }, [agentEvents]);

  // New Claude Code components state
  const [currentTodos, setCurrentTodos] = useState<any[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<any>(null);
  const [currentSubAgent, setCurrentSubAgent] = useState<any>(null);

  // Agent store - use specific selectors to prevent unnecessary re-renders
  const agentIteration = useAgentStore((state) => state.iteration);
  const agentCurrentPrompt = useAgentStore((state) => state.currentPrompt);
  const agentFilesCreated = useAgentStore((state) => state.filesCreated);
  const agentFilesModified = useAgentStore((state) => state.filesModified);
  const setCurrentPrompt = useAgentStore((state) => state.setCurrentPrompt);
  const setCurrentProjectId = useAgentStore((state) => state.setCurrentProjectId);

  // Ref to store a stable message ID for the current agent session
  // This is set when the user sends a message, before starting the agent
  const currentAgentMessageIdRef = useRef<string | null>(null);

  // Track how many agent messages we've already shown as terminal items
  // This allows us to create SEPARATE items for each new message
  const shownAgentMessagesCountRef = useRef<number>(0);

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
        console.log('[ChatPage] Media library permission denied');
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
      console.log(`[ChatPage] Loaded ${photosWithLocalUri.length} recent photos`);
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
    console.log('[ChatPage] sendSelectedPhotos called - selectedPhotoIds:', selectedPhotoIds.size);
    if (selectedPhotoIds.size === 0) return;

    try {
      // Get selected photos
      const selectedPhotos = recentPhotos.filter(photo => selectedPhotoIds.has(photo.id));
      console.log('[ChatPage] Selected photos to process:', selectedPhotos.length);

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
      console.log('[ChatPage] Adding photos to selectedInputImages:', photosWithBase64.length);
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
        console.log('[ChatPage] selectedInputImages updated - total:', newImages.length);
        return newImages;
      });

      // Close the sheet
      toggleToolsSheet();

      console.log(`[ChatPage] Added ${photosWithBase64.length} photos to input preview`);
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



  // DEBUG: Log when terminal items count changes (reduced verbosity)
  useEffect(() => {
    // Only log significant changes (not every item)
    if (tabTerminalItems.length > 0 && tabTerminalItems.length % 5 === 0) {
      console.log(`💬 [ChatPage] Terminal items: ${tabTerminalItems.length} for tab ${currentTab?.id}`);
    }
  }, [tabTerminalItems.length, currentTab?.id]);

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
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: false });
      }, 100);

      // Update previous tab reference
      previousTabIdRef.current = currentTab.id;
    }
  }, [currentTab?.id]); // ONLY depend on tab ID - NOT on input!

  // Usa selettori specifici per evitare re-render su ogni cambio di store
  const hasInteracted = useTerminalStore((state) => state.hasInteracted);
  const setGitHubUser = useTerminalStore((state) => state.setGitHubUser);
  const setGitHubRepositories = useTerminalStore((state) => state.setGitHubRepositories);
  const currentWorkstation = useTerminalStore((state) => state.currentWorkstation);
  const currentProjectInfo = useTerminalStore((state) => state.currentProjectInfo);

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

    console.log('💾 Adding item to tab:', currentTab.id);
    // Use atomic function from store to avoid race conditions
    addTerminalItemToStore(currentTab.id, item);
  }, [currentTab, addTerminalItemToStore]);

  // Handle plan approval
  const handlePlanApprove = useCallback(() => {
    if (!currentTab?.id || !planItemId) return;

    console.log('[ChatPage] Approving plan');

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

    console.log('[ChatPage] Rejecting plan');

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

  // Scroll to end when items count changes OR last item content updates (streaming)
  const lastItemContent = terminalItems[terminalItems.length - 1]?.content;
  useEffect(() => {
    if (terminalItems.length > 0) {
      // Use animated: true for smooth "following" effect
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  }, [terminalItems.length, lastItemContent]);

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

  // Process agent events for todos, questions, and sub-agents
  useEffect(() => {
    if (!agentEvents || agentEvents.length === 0) return;

    // Extract latest todo_update event
    const todoEvents = agentEvents.filter((e: any) => e.type === 'todo_update');
    if (todoEvents.length > 0) {
      const latestTodo = todoEvents[todoEvents.length - 1];
      setCurrentTodos((latestTodo as any).todos || []);
    }

    // Extract latest ask_user_question event
    const questionEvents = agentEvents.filter((e: any) => e.type === 'ask_user_question');
    if (questionEvents.length > 0) {
      const latestQuestion = questionEvents[questionEvents.length - 1];
      setPendingQuestion((latestQuestion as any).questions || null);
    }

    // Extract latest sub_agent_start event
    const subAgentStartEvents = agentEvents.filter((e: any) => e.type === 'sub_agent_start');
    const subAgentCompleteEvents = agentEvents.filter((e: any) => e.type === 'sub_agent_complete');

    if (subAgentCompleteEvents.length > subAgentStartEvents.length - 1) {
      // Sub-agent completed
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

  // Mark thinking as complete when agent finishes
  // The actual thinking content is now handled in real-time in the main agentEvents useEffect
  useEffect(() => {
    if (!agentStreaming && agentEvents.length > 0 && currentTab?.id) {
      const isComplete = agentEvents.some(e => e.type === 'complete' || e.type === 'done');

      // Mark all thinking items as done when agent completes
      if (isComplete) {
        useTabStore.setState((state) => ({
          tabs: state.tabs.map(t =>
            t.id === currentTab.id
              ? {
                ...t,
                terminalItems: t.terminalItems?.map(item =>
                  item.id?.startsWith('agent-thinking-')
                    ? { ...item, isThinking: false }
                    : item
                ).filter(item =>
                  item.id !== 'agent-streaming'
                ) || []
              }
              : t
          )
        }));
      }
    }
  }, [agentStreaming, agentEvents, currentTab?.id]);

  // Effect for cache invalidation and chat saving on agent completion
  useEffect(() => {
    if (!agentStreaming && agentEvents.length > 0 && currentTab?.id) {
      // Save chat messages when agent completes
      if (currentTab?.type === 'chat' && currentTab.data?.chatId) {
        const chatId = currentTab.data.chatId;
        const existingChat = useTerminalStore.getState().chatHistory.find(c => c.id === chatId);

        if (existingChat) {
          // Get fresh tab state from store to ensure we have latest messages
          const freshTab = useTabStore.getState().tabs.find(t => t.id === currentTab.id);
          const updatedMessages = freshTab?.terminalItems || [];

          console.log('💾 [Agent Complete] Saving chat messages:', { chatId, messageCount: updatedMessages.length });

          useTerminalStore.getState().updateChat(chatId, {
            messages: updatedMessages,
            lastUsed: new Date(),
          });
        }
      }

      // Invalidate file cache when agent completes - triggers FileExplorer refresh
      if (currentTab?.data?.projectId) {
        const hadFileChanges = agentEvents.some(e =>
          e.type === 'tool_complete' &&
          ['write_file', 'edit_file', 'run_command', 'notebook_edit', 'launch_sub_agent'].includes((e as any).tool)
        );

        const projectId = currentTab?.data?.projectId;
        if (hadFileChanges && projectId) {
          console.log('🔄 [ChatPage] Agent completed with file changes - invalidating cache');
          useFileCacheStore.getState().invalidateCache(projectId);
        }
      }

      // Reset agent message refs when agent completes
      // This ensures next agent session starts with fresh state
      currentAgentMessageIdRef.current = null;
      shownAgentMessagesCountRef.current = 0;
      streamingContentRef.current = '';
      thinkingContentRef.current = '';
    }
  }, [agentStreaming, agentEvents.length, currentTab?.id, currentTab?.data?.projectId, currentTab?.data?.chatId]);

  // Scroll to end when keyboard opens to show last messages
  useEffect(() => {
    const keyboardDidShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardDidShow' : 'keyboardDidShow',
      () => {
        if (hasChatStarted && terminalItems.length > 0) {
          // Delay scroll slightly to ensure layout has updated
          setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
      }
    );

    return () => {
      keyboardDidShow.remove();
    };
  }, [hasChatStarted, terminalItems.length]);

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
        // Update scroll padding to prevent messages going under widget
        // Reduced padding to prevent content going too high
        const extraPadding = e.endCoordinates.height - insets.bottom + 80;
        setScrollPaddingBottom(300 + extraPadding);

        // Force scroll to end after padding update
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 150);
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
      inputPositionAnim.value = 0;
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

    // Se la tastiera è aperta, usa bottom positioning (appena sopra la tastiera)
    if (keyboardHeight.value > 0) {
      return {
        bottom: keyboardHeight.value,
        left: sidebarLeft,
        top: undefined,
        transform: []
      };
    }

    // Altrimenti usa top + translateY (comportamento normale)
    const baseTranslateY = interpolate(
      animProgress,
      [0, 1],
      [0, 280], // Sposta 280px verso il basso quando chat si avvia
      Extrapolate.CLAMP
    );

    // Compensa la crescita del widget
    const heightDiff = Math.max(0, widgetHeight.value - 90);
    const translateY = baseTranslateY - heightDiff;

    return {
      top: 410,
      left: sidebarLeft,
      bottom: undefined,
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
    console.log('[handleDowngradeAccept] START', {
      workstationId: currentWorkstation?.id,
      warningData: warningData,
      currentTab: currentTab?.id,
      agentMode
    });

    if (!currentWorkstation?.id || !warningData) {
      console.log('[handleDowngradeAccept] Missing requirements - abort');
      return;
    }

    if (!currentTab?.id) {
      console.log('[handleDowngradeAccept] No current tab - abort');
      return;
    }

    // Close dialog
    setShowNextJsWarning(false);

    // Build auto-message for downgrade
    const downgradeMessage = `Downgrade this Next.js app from version ${warningData.version} to Next.js 15.3.0 (stable version). Update package.json, run npm install, and verify the downgrade is successful.`;

    console.log('[handleDowngradeAccept] Adding message to terminal:', downgradeMessage.substring(0, 50));

    // Add user message to terminal
    addTerminalItem({
      id: Date.now().toString(),
      content: downgradeMessage,
      type: TerminalItemType.USER_MESSAGE,
      timestamp: new Date(),
    });

    // Reset refs for new agent session
    const thinkingId = `agent-thinking-${Date.now()}`;
    currentAgentMessageIdRef.current = thinkingId;
    shownAgentMessagesCountRef.current = 0;
    streamingContentRef.current = '';
    thinkingContentRef.current = '';
    processedEventIdsRef.current.clear();

    // IMMEDIATELY show thinking placeholder - never leave user waiting with blank screen
    addTerminalItem({
      id: thinkingId,
      content: '',
      type: TerminalItemType.OUTPUT,
      timestamp: new Date(),
      isThinking: true,
      thinkingContent: '',
    });

    console.log('[handleDowngradeAccept] Starting agent with message');

    // Start agent with downgrade message
    const conversationHistory: any[] = [];
    startAgent(downgradeMessage, currentWorkstation.id, selectedModel, conversationHistory, undefined, thinkingLevel);

    console.log('✅ [ChatPage] Auto-downgrade message sent to AI');
  };

  // Handle stop button - stops agent and clears loading state
  const handleStop = useCallback(() => {
    console.log('[ChatPage] handleStop called - stopping agent');

    // Stop the agent SSE stream
    stopAgent();

    // Clear loading state
    setLoading(false);

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

    // Reset the agent message refs
    currentAgentMessageIdRef.current = null;
    streamingContentRef.current = '';
    thinkingContentRef.current = '';
  }, [stopAgent, currentTab?.id]);

  const handleSend = async (images?: { uri: string; base64?: string; type?: string }[]) => {
    // Use passed images or fall back to selectedInputImages
    console.log('[ChatPage] handleSend - selectedInputImages.length:', selectedInputImages.length);
    console.log('[ChatPage] handleSend - images param:', images);
    const imagesToSend = (images && images.length > 0) ? images : (selectedInputImages.length > 0 ? selectedInputImages : undefined);

    console.log('[ChatPage] handleSend called - input:', input.trim(), 'imagesToSend:', imagesToSend?.length, 'isLoading:', isLoading);

    if ((!input.trim() && (!imagesToSend || imagesToSend.length === 0)) || isLoading) {
      console.log('[ChatPage] handleSend blocked - no content or loading');
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
      const existingChat = useTerminalStore.getState().chatHistory.find(c => c.id === chatId);

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
          const response = await fetch(`${config.apiUrl}/ai/chat/generate-title`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: userMessage }),
          });
          if (response.ok) {
            const data = await response.json();
            if (data.title) {
              console.log('🏷️ AI generated title:', data.title);
              useTerminalStore.getState().updateChat(chatId, { title: data.title });
              updateTab(currentTab.id, { title: data.title });
            }
          }
        } catch (e) {
          console.log('⚠️ Could not generate AI title, using default');
        }
      };
      // Fire and forget - don't wait for AI title
      generateAITitle();

      if (existingChat) {
        // Chat already exists, update description and lastUsed
        const wasManuallyRenamed = existingChat.title !== 'Nuova Conversazione';
        const finalTitle = wasManuallyRenamed ? existingChat.title : title;

        console.log('💾 Updating existing chat:', { chatId, title: finalTitle });
        useTerminalStore.getState().updateChat(chatId, {
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

        console.log('✨ Creating new chat:', { chatId, title });
        useTerminalStore.getState().addChat(newChat);
        updateTab(currentTab.id, { title: title });
      }
    } else if (currentTab?.type === 'chat' && currentTab.data?.chatId) {
      // Update lastUsed for existing chat
      useTerminalStore.getState().updateChatLastUsed(currentTab.data.chatId);
    }

    // If agent mode AND we have a workstation, use agent stream
    if (isAgentMode && currentWorkstation?.id) {
      // Reset ALL refs for new agent session (CRITICAL: prevents event ID collisions)
      const thinkingId = `agent-thinking-${Date.now()}`;
      currentAgentMessageIdRef.current = thinkingId;
      shownAgentMessagesCountRef.current = 0;
      streamingContentRef.current = '';
      thinkingContentRef.current = ''; // Reset thinking content for new session
      processedEventIdsRef.current.clear(); // CRITICAL: Clear processed events for new session

      // Add user message to terminal with images
      // Clean images to avoid circular references in store
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
        images: cleanImagesForStore, // Attach cleaned images to terminal item
      });

      // IMMEDIATELY show thinking placeholder - never leave user waiting with blank screen
      addTerminalItem({
        id: thinkingId,
        content: '',
        type: TerminalItemType.OUTPUT,
        timestamp: new Date(),
        isThinking: true,
        thinkingContent: '', // Will be updated when real thinking arrives
      });

      setInput('');
      setSelectedInputImages([]); // Clear images after sending
      setLoading(true);

      // Store the prompt in the agent store
      setCurrentPrompt(userMessage);
      setCurrentProjectId(currentWorkstation.id);

      // Build conversation history from terminal items (ALL messages, no limits - Claude Code style)
      // Filter only actual conversation (user messages and assistant responses, not tool outputs)
      // Include images in history for multimodal context
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
        // NO slice() - send ALL conversation history, backend will handle summarization if needed
        .map(item => {
          const historyItem: any = {
            role: item.type === TerminalItemType.USER_MESSAGE ? 'user' : 'assistant',
            content: item.content || ''
          };
          // Include images if present (for multimodal context)
          if (item.images && item.images.length > 0) {
            historyItem.images = item.images.map(img => {
              // Create clean object to avoid circular references
              return {
                base64: String(img.base64 || ''),
                type: String(img.type || 'image/jpeg')
              };
            });
          }
          return historyItem;
        });

      console.log(`[ChatPage] Including ${conversationHistory.length} messages in agent context (unlimited, Claude Code style)`);

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
    }

    setLoading(true);

    try {
      if (shouldExecuteCommand) {
        // Terminal mode - execute command
        const response = await axios.post(
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
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.open('POST', `${config.apiUrl}/ai/chat`);
          xhr.setRequestHeader('Content-Type', 'application/json');
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
                    console.log('🎯 Tool result received:', name, args);

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
                      console.log('📝 [Undo] Recorded modification for:', undoData.filePath);
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
                    console.log(`🎯 Batch of ${count} tool results received (executed in ${executionTime})`);

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
                        console.log('📝 [Undo] Recorded batch modification for:', undoData.filePath);
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
                    console.log('🔧 Function call in progress:', name);

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

                    // Function to update UI with content
                    const updateContent = () => {
                      useTabStore.setState((state) => ({
                        tabs: state.tabs.map(t =>
                          t.id === tab.id
                            ? {
                              ...t,
                              terminalItems: t.terminalItems?.map(item =>
                                item.id === streamingMessageId
                                  ? { ...item, content: streamedContent, isThinking: false }
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
            userId: useTerminalStore.getState().userId || null,
            // Include username for multi-user context
            username: (useTerminalStore.getState().userId || 'anonymous').split('@')[0].replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase(),
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
            console.log('🔧 Processing', toolCalls.length, 'tool calls');

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
        const existingChat = useTerminalStore.getState().chatHistory.find(c => c.id === chatId);

        if (existingChat) {
          // Get fresh tab state from store to ensure we have latest messages
          const freshTab = useTabStore.getState().tabs.find(t => t.id === currentTab.id);
          const updatedMessages = freshTab?.terminalItems || [];

          console.log('💾 Saving chat messages:', { chatId, messageCount: updatedMessages.length });

          useTerminalStore.getState().updateChat(chatId, {
            messages: updatedMessages,
            lastUsed: new Date(),
          });
        } else {
          console.log('⚠️ Chat not found in chatHistory:', chatId);
        }
      }
    }
  };

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
        {!isGoUser && !hasUserMessaged && (
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
            <ScrollView
              ref={scrollViewRef}
              style={[styles.output, isCardMode && styles.outputCardMode]}
              contentContainerStyle={[styles.outputContent, { paddingBottom: scrollPaddingBottom }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >

              {terminalItems.length === 0 ? (
                <View style={styles.emptyState}>
                </View>
              ) : (
                <>
                  {(() => {
                    // Filter out null items, empty content items, and "Executing:" placeholders
                    // BUT: Keep items with isThinking=true or isAgentProgress=true even if content is empty
                    const filtered = terminalItems.filter(item =>
                      item &&
                      item.content != null &&
                      (item.content.trim() !== '' || item.isThinking || (item as any).isAgentProgress) &&  // Allow empty content if isThinking or isAgentProgress
                      item.content !== '...' &&  // Filter out placeholder ellipsis
                      !item.content.startsWith('Executing: ')  // Filter out tool execution indicators (replaced by tool results)
                    );

                    return filtered.reduce((acc, item, index, filteredArray) => {
                      // Skip OUTPUT items that follow a terminal COMMAND (they'll be grouped)
                      const prevItem = filteredArray[index - 1];
                      const isOutputAfterTerminalCommand =
                        item.type === TerminalItemType.OUTPUT &&
                        prevItem?.type === TerminalItemType.COMMAND &&
                        isCommand(prevItem.content || '');

                      if (isOutputAfterTerminalCommand) {
                        return acc;
                      }

                      // Check if next item exists and is not a user message
                      const nextItem = filteredArray[index + 1];
                      // Show thread line only if CURRENT item is NOT user message AND next item is NOT a user message
                      const isNextItemAI = item.type !== TerminalItemType.USER_MESSAGE &&
                        nextItem &&
                        nextItem.type !== TerminalItemType.USER_MESSAGE;
                      const isNextItemOutput = nextItem?.type === TerminalItemType.OUTPUT && !isCommand(nextItem.content || '');
                      const outputItem =
                        item.type === TerminalItemType.COMMAND &&
                          isCommand(item.content || '') &&
                          nextItem?.type === TerminalItemType.OUTPUT
                          ? nextItem
                          : undefined;

                      // Check if this is the last item and we're loading
                      const isLastItem = index === filteredArray.length - 1;
                      const shouldShowLoading = isLastItem && isLoading;

                      // Handle agent progress items (thinking, tools trace)
                      if ((item as any).isAgentProgress) {
                        const isRunning = agentStreaming;
                        acc.push(
                          <View key={item.id} style={{ marginBottom: 16 }}>
                            <AgentProgress
                              events={agentEvents}
                              status={isRunning ? 'running' : 'complete'}
                              currentTool={isRunning ? agentCurrentTool : null}
                            />
                          </View>
                        );
                        return acc;
                      }

                      // Handle budget exceeded — show upgrade card
                      if (item.content === '__BUDGET_EXCEEDED__') {
                        acc.push(
                          <View key={item.id} style={{
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
                        return acc;
                      }

                      acc.push(
                        <TerminalItemComponent
                          key={item.id}
                          item={item}
                          isNextItemOutput={isNextItemAI}
                          outputItem={outputItem}
                          isLoading={shouldShowLoading}
                          onPlanApprove={item.type === TerminalItemType.PLAN_APPROVAL ? handlePlanApprove : undefined}
                          onPlanReject={item.type === TerminalItemType.PLAN_APPROVAL ? handlePlanReject : undefined}
                        />
                      );
                      return acc;
                    }, [] as JSX.Element[]);
                  })()}

                  {/* Show TodoList if agent has active todos */}
                  {currentTodos.length > 0 && (
                    <TodoList todos={currentTodos} />
                  )}

                  {/* Show SubAgentStatus if a sub-agent is running */}
                  {currentSubAgent && (
                    <SubAgentStatus subAgent={currentSubAgent} />
                  )}
                </>
              )}
            </ScrollView>

            {/* AskUserQuestion Modal */}
            <AskUserQuestionModal
              visible={!!pendingQuestion}
              questions={pendingQuestion || []}
              onAnswer={(answers) => {
                // Format answers as a response message to continue the agent
                const questions = pendingQuestion || [];
                const responseLines = questions.map((q: any, idx: number) => {
                  const answer = answers[`q${idx}`] || '';
                  return `${q.question}: ${answer}`;
                }).join('\n');

                const responseMessage = `Ecco le mie risposte:\n${responseLines}`;
                console.log('User answers formatted:', responseMessage);

                // Clear pending question first
                setPendingQuestion(null);

                // Resume agent with the answers by sending as a new message
                if (currentWorkstation?.id) {
                  // Reset refs for new agent session
                  const thinkingId = `agent-thinking-${Date.now()}`;
                  currentAgentMessageIdRef.current = thinkingId;
                  shownAgentMessagesCountRef.current = 0;
                  streamingContentRef.current = '';
                  thinkingContentRef.current = '';
                  processedEventIdsRef.current.clear();

                  // Add user response to terminal
                  addTerminalItem({
                    id: Date.now().toString(),
                    content: responseMessage,
                    type: TerminalItemType.USER_MESSAGE,
                    timestamp: new Date(),
                  });

                  // IMMEDIATELY show thinking placeholder - never leave user waiting with blank screen
                  addTerminalItem({
                    id: thinkingId,
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
                setPendingQuestion(null);
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
                    onUndoComplete={() => console.log('✅ [Undo] File restored')}
                    onRedoComplete={() => console.log('✅ [Redo] File re-applied')}
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
                    onPress={agentStreaming || isLoading ? handleStop : handleSend}
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
                            // Set default thinking level when switching to Gemini 3
                            if (hasThinkingOptions) {
                              const defaultLevel = model.id.includes('flash') ? 'medium' : 'low';
                              setThinkingLevel(defaultLevel);
                            }
                            if (!hasThinkingOptions) {
                              closeDropdown();
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
                                      closeDropdown();
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
    paddingHorizontal: 40,
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
    justifyContent: 'flex-end', // Fa crescere il contenuto verso l'alto
    maxHeight: 250, // Limite massimo dell'intero widget
    marginHorizontal: 16, // Margine orizzontale per restringere la card
    overflow: 'hidden',
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
    fontFamily: 'monospace',
    paddingHorizontal: 16,
    paddingVertical: 14,
    maxHeight: 150, // Altezza massima del campo di input
    lineHeight: 20,
    textAlignVertical: 'top', // Allinea il testo in alto nel campo
  },
});
export default ChatPage;
