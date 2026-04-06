import { create } from 'zustand';
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
  setPreviewCurrentUrl: (url: string) => void;
  setPreviewViewportMode: (mode: 'mobile' | 'desktop') => void;
  setPreviewHandlers: (handlers: Partial<UIState['previewHandlers']>) => void;
  setPreviewPublishInfo: (info: { slug: string; url: string } | null) => void;

  // Database navigation
  databaseBackHandler: (() => void) | null;

  // Pending message to send to main chat (e.g. from preview error)
  pendingChatMessage: string | null;
  // Auto-retry preview after AI fix
  autoRetryPreview: boolean;
  openPreviewRequested: boolean;
  openGitSheetRequested: boolean;
  openGitSheetTab: 'commits' | 'branches' | 'changes' | null;
  openEnvVarsRequested: boolean;
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
  setIsSidebarOpen: (value: boolean) => void;
  setAutocompleteOptions: (options: AutocompleteOption[]) => void;
  setShowAutocomplete: (show: boolean) => void;
  setPendingChatMessage: (message: string | null) => void;
  setAutoRetryPreview: (value: boolean) => void;
  setOpenPreviewRequested: (value: boolean) => void;
  setOpenGitSheetRequested: (value: boolean) => void;
  setOpenEnvVarsRequested: (value: boolean) => void;
  setSkipNextPreflight: (value: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
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
    isSidebarOpen: false,

    // Preview toolbar shared state
    previewCurrentUrl: '',
    previewViewportMode: 'mobile' as const,
    previewHandlers: { refresh: null, publish: null, setViewportMode: null, setUrl: null, goBack: null, goForward: null },
    databaseBackHandler: null,
    previewPublishInfo: null,
    setPreviewCurrentUrl: (url: string) => set({ previewCurrentUrl: url }),
    setPreviewViewportMode: (mode: 'mobile' | 'desktop') => set({ previewViewportMode: mode }),
    setPreviewHandlers: (handlers) => set((state) => ({ previewHandlers: { ...state.previewHandlers, ...handlers } })),
    setPreviewPublishInfo: (info) => set({ previewPublishInfo: info }),

    // Pending chat message
    pendingChatMessage: null,
    autoRetryPreview: false,
    openPreviewRequested: false,
    openGitSheetRequested: false,
    openGitSheetTab: null,
    openEnvVarsRequested: false,
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
    setPreviewServerStatus: (status) => set({ previewServerStatus: status }),
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
    setIsSidebarOpen: (value) => set({ isSidebarOpen: value }),
    setAutocompleteOptions: (options) => set({ autocompleteOptions: options }),
    setShowAutocomplete: (show) => set({ showAutocomplete: show }),
    setPendingChatMessage: (message) => set({ pendingChatMessage: message }),
    setAutoRetryPreview: (value) => set({ autoRetryPreview: value }),
    setOpenPreviewRequested: (value) => set({ openPreviewRequested: value }),
    setOpenGitSheetRequested: (value) => set({ openGitSheetRequested: value }),
    setOpenEnvVarsRequested: (value) => set({ openEnvVarsRequested: value }),
    setSkipNextPreflight: (value) => set({ skipNextPreflight: value }),
}));
