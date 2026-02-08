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
  previewStartupStates: Record<string, PreviewStartupState>;
  isToolsExpanded: boolean;
  isSidebarOpen: boolean;

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
  setPreviewStartupState: (projectId: string, state: Partial<PreviewStartupState>) => void;
  getPreviewStartupState: (projectId: string) => PreviewStartupState | null;
  clearPreviewStartupState: (projectId: string) => void;
  setIsToolsExpanded: (value: boolean) => void;
  setIsSidebarOpen: (value: boolean) => void;
  setAutocompleteOptions: (options: AutocompleteOption[]) => void;
  setShowAutocomplete: (show: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
    // Initial state - Terminal
    globalTerminalLog: [],
    terminalItems: [],
    isLoading: false,
    hasInteracted: false,

    // Initial state - UI
    selectedModel: 'claude-4-5-sonnet',
    isTerminalMode: true,
    autoApprove: false,
    isRecording: false,
    previewUrl: null,
    previewServerStatus: 'stopped',
    previewServerUrl: null,
    flyMachineId: null,
    projectMachineIds: {},
    projectPreviewUrls: {},
    previewStartupStates: {},
    isToolsExpanded: false,
    isSidebarOpen: false,

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
}));
