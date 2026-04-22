import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  TerminalItem,
  AutocompleteOption,
} from '../../shared/types';

// Preview startup state (persisted per project)
export interface PreviewStartupState {
  isStarting: boolean;
  startingMessage: string;
  startupSteps: Array<{ id: string; label: string; status: 'pending' | 'active' | 'complete' | 'error' }>;
  currentStepId: string | null;
  smoothProgress: number;
  targetProgress: number;
  displayedMessage: string;
  previewError: { message: string; timestamp: Date } | null;
}

export interface UIState {
  // Terminal - Global log
  globalTerminalLog: TerminalItem[];
  terminalItems: TerminalItem[];
  isLoading: boolean;
  hasInteracted: boolean;

  // UI State
  selectedModel: string;
  isTerminalMode: boolean;
  autoApprove: boolean;
  isRecording: boolean;
  previewUrl: string | null;
  previewServerStatus: 'checking' | 'running' | 'stopped';
  previewServerUrl: string | null;
  flyMachineId: string | null;
  projectMachineIds: Record<string, string>;
  projectPreviewUrls: Record<string, string>;
  projectPreviewTokens: Record<string, string>;
  previewStartupStates: Record<string, PreviewStartupState>;
  isToolsExpanded: boolean;
  /** When true, tool-call items in chat render a plain-language one-liner
   * instead of the dev-oriented CMD/GREP/READ badges + code. Persisted. */
  simpleToolView: boolean;
  isSidebarOpen: boolean;

  // Preview toolbar state (shared with header)
  previewCurrentUrl: string;
  previewViewportMode: 'mobile' | 'desktop';
  previewHandlers: {
    refresh: (() => void) | null;
    publish: (() => void) | null;
    setViewportMode: ((mode: 'mobile' | 'desktop') => void) | null;
    setUrl: ((url: string) => void) | null;
    goBack: (() => void) | null;
    goForward: (() => void) | null;
  };
  previewPublishInfo: { slug: string; url: string } | null;
  /** True when the AI has finished writing files that haven't been
   *  reloaded yet. Rendered at the sidebar root so the banner floats
   *  above the preview AND the chat drawer. */
  previewNeedsReload: boolean;
  setPreviewCurrentUrl: (url: string) => void;
  setPreviewViewportMode: (mode: 'mobile' | 'desktop') => void;
  setPreviewHandlers: (handlers: Partial<UIState['previewHandlers']>) => void;
  setPreviewPublishInfo: (info: { slug: string; url: string } | null) => void;
  setPreviewNeedsReload: (value: boolean) => void;

  // Database navigation
  databaseBackHandler: (() => void) | null;

  // Pending message to send to main chat (e.g. from preview error)
  pendingChatMessage: string | null;
  // Auto-retry preview after AI fix
  autoRetryPreview: boolean;
  openPreviewRequested: boolean;
  openPreviewRequestId: number;
  openGitSheetRequested: boolean;
  openGitSheetRequestId: number;
  openGitSheetTab: 'commits' | 'branches' | 'changes' | null;
  openEnvVarsRequested: boolean;
  openEnvVarsRequestId: number;
  skipNextPreflight: boolean;

  // Preview gate: blocked per project until verification passes
  previewBlockedProjects: Record<string, boolean>;
  setPreviewBlocked: (projectId: string, blocked: boolean) => void;
  isPreviewBlocked: (projectId: string) => boolean;

  // Autocomplete
  autocompleteOptions: AutocompleteOption[];
  showAutocomplete: boolean;
  selectedAutocompleteIndex: number;

  // Actions - Terminal
  addTerminalItem: (item: TerminalItem) => void;
  addGlobalTerminalLog: (item: TerminalItem) => void;
  clearGlobalTerminalLog: () => void;
  executeCommand: (command: string, workstationId?: string) => Promise<void>;
  clearTerminal: () => void;
  setLoading: (loading: boolean) => void;
  setHasInteracted: (value: boolean) => void;

  // Actions - UI
  setSelectedModel: (model: string) => void;
  setIsTerminalMode: (value: boolean) => void;
  setAutoApprove: (value: boolean) => void;
  setIsRecording: (value: boolean) => void;
  setPreviewUrl: (url: string | null) => void;
  setPreviewServerStatus: (status: 'checking' | 'running' | 'stopped') => void;
  setPreviewServerUrl: (url: string | null, projectId?: string) => void;
  setFlyMachineId: (id: string | null, projectId?: string) => void;
  setPreviewAccessToken: (token: string | null, projectId?: string) => void;
  clearProjectPreviewSession: (projectId: string) => void;
  setPreviewStartupState: (projectId: string, state: Partial<PreviewStartupState>) => void;
  getPreviewStartupState: (projectId: string) => PreviewStartupState | null;
  clearPreviewStartupState: (projectId: string) => void;
  setIsToolsExpanded: (value: boolean) => void;
  setSimpleToolView: (value: boolean) => void;
  setIsSidebarOpen: (value: boolean) => void;
  setAutocompleteOptions: (options: AutocompleteOption[]) => void;
  setShowAutocomplete: (show: boolean) => void;
  setPendingChatMessage: (message: string | null) => void;
  setAutoRetryPreview: (value: boolean) => void;
  setOpenPreviewRequested: (value: boolean) => void;
  setOpenGitSheetRequested: (value: boolean) => void;
  setOpenEnvVarsRequested: (value: boolean) => void;
  requestOpenPreview: () => void;
  requestOpenGitSheet: (tab?: 'commits' | 'branches' | 'changes' | null) => void;
  requestOpenEnvVars: () => void;
  consumeOpenPreviewRequest: (lastHandledId: number) => number;
  consumeOpenGitSheetRequest: (lastHandledId: number) => number;
  consumeOpenEnvVarsRequest: (lastHandledId: number) => number;
  setSkipNextPreflight: (value: boolean) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
    // Initial state - Terminal
    globalTerminalLog: [],
    terminalItems: [],
    isLoading: false,
    hasInteracted: false,

    // Initial state - UI
    selectedModel: 'gemini-3-flash',
    isTerminalMode: true,
    autoApprove: false,
    isRecording: false,
    previewUrl: null,
    previewServerStatus: 'stopped',
    previewServerUrl: null,
    flyMachineId: null,
    projectMachineIds: {},
    projectPreviewUrls: {},
    projectPreviewTokens: {},
    previewStartupStates: {},
    isToolsExpanded: false,
    simpleToolView: true,
    isSidebarOpen: false,

    // Preview toolbar shared state
    previewCurrentUrl: '',
    previewViewportMode: 'mobile' as const,
    previewHandlers: { refresh: null, publish: null, setViewportMode: null, setUrl: null, goBack: null, goForward: null },
    databaseBackHandler: null,
    previewPublishInfo: null,
    previewNeedsReload: false,
    setPreviewNeedsReload: (value: boolean) => set((state) => (
      state.previewNeedsReload === value ? state : { previewNeedsReload: value }
    )),
    setPreviewCurrentUrl: (url: string) => set((state) => (
      state.previewCurrentUrl === url ? state : { previewCurrentUrl: url }
    )),
    setPreviewViewportMode: (mode: 'mobile' | 'desktop') => set((state) => (
      state.previewViewportMode === mode ? state : { previewViewportMode: mode }
    )),
    setPreviewHandlers: (handlers) => set((state) => {
      const nextHandlers = { ...state.previewHandlers, ...handlers };
      const unchanged =
        state.previewHandlers.refresh === nextHandlers.refresh &&
        state.previewHandlers.publish === nextHandlers.publish &&
        state.previewHandlers.setViewportMode === nextHandlers.setViewportMode &&
        state.previewHandlers.setUrl === nextHandlers.setUrl &&
        state.previewHandlers.goBack === nextHandlers.goBack &&
        state.previewHandlers.goForward === nextHandlers.goForward;
      return unchanged ? state : { previewHandlers: nextHandlers };
    }),
    setPreviewPublishInfo: (info) => set((state) => {
      const current = state.previewPublishInfo;
      const unchanged =
        current?.slug === info?.slug &&
        current?.url === info?.url;
      return unchanged ? state : { previewPublishInfo: info };
    }),

    // Pending chat message
    pendingChatMessage: null,
    autoRetryPreview: false,
    openPreviewRequested: false,
    openPreviewRequestId: 0,
    openGitSheetRequested: false,
    openGitSheetRequestId: 0,
    openGitSheetTab: null,
    openEnvVarsRequested: false,
    openEnvVarsRequestId: 0,
    skipNextPreflight: false,
    previewBlockedProjects: {},
    setPreviewBlocked: (projectId, blocked) => set(state => ({
      previewBlockedProjects: { ...state.previewBlockedProjects, [projectId]: blocked },
    })),
    isPreviewBlocked: (projectId) => get().previewBlockedProjects[projectId] === true,

    // Initial state - Autocomplete
    autocompleteOptions: [],
    showAutocomplete: false,
    selectedAutocompleteIndex: -1,

    // Actions - Terminal
    addTerminalItem: (item) =>
      set((state) => ({
        terminalItems: [...state.terminalItems, item],
        hasInteracted: true,
      })),

    addGlobalTerminalLog: (item) =>
      set((state) => {
        return {
          globalTerminalLog: [...state.globalTerminalLog, {
            ...item,
            timestamp: item.timestamp || new Date(),
          }],
        };
      }),

    clearGlobalTerminalLog: () =>
      set({ globalTerminalLog: [] }),

    executeCommand: async (command: string, workstationId?: string) => {
      // Implementazione gestita da useTerminalExecutor
    },

    clearTerminal: () => set({ terminalItems: [], hasInteracted: false }),
    setLoading: (loading) => set({ isLoading: loading }),
    setHasInteracted: (value) => set({ hasInteracted: value }),

    // Actions - UI
    setSelectedModel: (model) => set({ selectedModel: model }),
    setIsTerminalMode: (value) => set({ isTerminalMode: value }),
    setAutoApprove: (value) => set({ autoApprove: value }),
    setIsRecording: (value) => set({ isRecording: value }),
    setPreviewUrl: (url) => set({ previewUrl: url }),
    setPreviewServerStatus: (status) => set((state) => (
      state.previewServerStatus === status ? state : { previewServerStatus: status }
    )),
    setPreviewServerUrl: (url, projectId) => set((state) => {
      if (url && projectId) {
        return {
          previewServerUrl: url,
          projectPreviewUrls: { ...state.projectPreviewUrls, [projectId]: url }
        };
      }
      return { previewServerUrl: url };
    }),
    setFlyMachineId: (id, projectId) => set((state) => {
      if (id && projectId) {
        return {
          flyMachineId: id,
          projectMachineIds: { ...state.projectMachineIds, [projectId]: id }
        };
      }
      return { flyMachineId: id };
    }),
    setPreviewAccessToken: (token, projectId) => set((state) => {
      if (!projectId) return state;
      const nextTokens = { ...state.projectPreviewTokens };
      if (token) nextTokens[projectId] = token;
      else delete nextTokens[projectId];
      return { projectPreviewTokens: nextTokens };
    }),
    clearProjectPreviewSession: (projectId) => set((state) => {
      const nextMachineIds = { ...state.projectMachineIds };
      const nextPreviewUrls = { ...state.projectPreviewUrls };
      const nextPreviewTokens = { ...state.projectPreviewTokens };
      delete nextMachineIds[projectId];
      delete nextPreviewUrls[projectId];
      delete nextPreviewTokens[projectId];

      const isCurrentMachineForProject = state.projectMachineIds[projectId]
        && state.flyMachineId === state.projectMachineIds[projectId];

      return {
        projectMachineIds: nextMachineIds,
        projectPreviewUrls: nextPreviewUrls,
        projectPreviewTokens: nextPreviewTokens,
        ...(isCurrentMachineForProject ? { flyMachineId: null } : {}),
      };
    }),
    setPreviewStartupState: (projectId, stateUpdate) => set((state) => {
      const currentState = state.previewStartupStates[projectId] || {
        isStarting: false,
        startingMessage: '',
        startupSteps: [],
        currentStepId: null,
        smoothProgress: 0,
        targetProgress: 0,
        displayedMessage: '',
        previewError: null,
      };

      return {
        previewStartupStates: {
          ...state.previewStartupStates,
          [projectId]: { ...currentState, ...stateUpdate }
        }
      };
    }),
    getPreviewStartupState: (projectId) => {
      const state = useUIStore.getState();
      return state.previewStartupStates[projectId] || null;
    },
    clearPreviewStartupState: (projectId) => set((state) => {
      const newStates = { ...state.previewStartupStates };
      delete newStates[projectId];
      return { previewStartupStates: newStates };
    }),
    setIsToolsExpanded: (value) => set({ isToolsExpanded: value }),
    setSimpleToolView: (value) => {
      set({ simpleToolView: value });
      AsyncStorage.setItem('chat_simple_tool_view', value ? '1' : '0').catch(() => {});
    },
    setIsSidebarOpen: (value) => set((state) => (
      state.isSidebarOpen === value ? state : { isSidebarOpen: value }
    )),
    setAutocompleteOptions: (options) => set({ autocompleteOptions: options }),
    setShowAutocomplete: (show) => set({ showAutocomplete: show }),
    setPendingChatMessage: (message) => set({ pendingChatMessage: message }),
    setAutoRetryPreview: (value) => set({ autoRetryPreview: value }),
    setOpenPreviewRequested: (value) => set({ openPreviewRequested: value }),
    setOpenGitSheetRequested: (value) => set({ openGitSheetRequested: value }),
    setOpenEnvVarsRequested: (value) => set({ openEnvVarsRequested: value }),
    requestOpenPreview: () => set((state) => ({
      openPreviewRequested: true,
      openPreviewRequestId: state.openPreviewRequestId + 1,
    })),
    requestOpenGitSheet: (tab = null) => set((state) => ({
      openGitSheetRequested: true,
      openGitSheetRequestId: state.openGitSheetRequestId + 1,
      openGitSheetTab: tab,
    })),
    requestOpenEnvVars: () => set((state) => ({
      openEnvVarsRequested: true,
      openEnvVarsRequestId: state.openEnvVarsRequestId + 1,
    })),
    consumeOpenPreviewRequest: (lastHandledId) => {
      const state = get();
      if (state.openPreviewRequestId <= lastHandledId) return lastHandledId;
      set({ openPreviewRequested: false });
      return state.openPreviewRequestId;
    },
    consumeOpenGitSheetRequest: (lastHandledId) => {
      const state = get();
      if (state.openGitSheetRequestId <= lastHandledId) return lastHandledId;
      set({ openGitSheetRequested: false });
      return state.openGitSheetRequestId;
    },
    consumeOpenEnvVarsRequest: (lastHandledId) => {
      const state = get();
      if (state.openEnvVarsRequestId <= lastHandledId) return lastHandledId;
      set({ openEnvVarsRequested: false });
      return state.openEnvVarsRequestId;
    },
    setSkipNextPreflight: (value) => set({ skipNextPreflight: value }),
}));

// Hydrate persisted simpleToolView on import
AsyncStorage.getItem('chat_simple_tool_view')
  .then((raw) => {
    if (raw === '0' || raw === '1') {
      useUIStore.setState({ simpleToolView: raw === '1' });
    }
  })
  .catch(() => {});
