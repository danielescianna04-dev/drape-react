import { create } from 'zustand';
import {
  TerminalItem,
  ChatSession,
  ChatFolder,
  GitHubRepository,
  GitHubUser,
  WorkstationInfo,
  AutocompleteOption,
} from '../../shared/types';

interface TerminalState {
  // Terminal
  terminalItems: TerminalItem[];
  isLoading: boolean;
  hasInteracted: boolean;
  
  // Chat
  chatHistory: ChatSession[];
  chatFolders: ChatFolder[];
  currentChatSession: ChatSession | null;
  currentChatTitle: string | null;
  searchQuery: string;
  filteredChats: ChatSession[];
  
  // GitHub
  isGitHubConnected: boolean;
  isConnectingToGitHub: boolean;
  gitHubUsername: string | null;
  gitHubToken: string | null;
  gitHubRepositories: GitHubRepository[];
  selectedRepository: GitHubRepository | null;
  gitHubUser: GitHubUser | null;
  showGitHubSidebar: boolean;
  
  // Workstation
  currentWorkstation: WorkstationInfo | null;
  isCreatingWorkstation: boolean;
  userId: string | null;
  
  // UI State
  selectedModel: string;
  isTerminalMode: boolean;
  autoApprove: boolean;
  isRecording: boolean;
  previewUrl: string | null;
  isToolsExpanded: boolean;
  isSidebarOpen: boolean;
  
  // Autocomplete
  autocompleteOptions: AutocompleteOption[];
  showAutocomplete: boolean;
  selectedAutocompleteIndex: number;
  
  // Actions
  addTerminalItem: (item: TerminalItem) => void;
  clearTerminal: () => void;
  setLoading: (loading: boolean) => void;
  setHasInteracted: (value: boolean) => void;
  setCurrentChat: (session: ChatSession | null) => void;
  setCurrentChatTitle: (title: string | null) => void;
  setSearchQuery: (query: string) => void;
  setGitHubConnected: (connected: boolean) => void;
  setGitHubUser: (user: GitHubUser | null) => void;
  setGitHubRepositories: (repos: GitHubRepository[]) => void;
  setSelectedRepository: (repo: GitHubRepository | null) => void;
  setShowGitHubSidebar: (show: boolean) => void;
  setWorkstation: (workstation: WorkstationInfo | null) => void;
  setSelectedModel: (model: string) => void;
  setIsTerminalMode: (value: boolean) => void;
  setAutoApprove: (value: boolean) => void;
  setIsRecording: (value: boolean) => void;
  setPreviewUrl: (url: string | null) => void;
  setIsToolsExpanded: (value: boolean) => void;
  setIsSidebarOpen: (value: boolean) => void;
  setAutocompleteOptions: (options: AutocompleteOption[]) => void;
  setShowAutocomplete: (show: boolean) => void;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  // Initial state
  terminalItems: [],
  isLoading: false,
  hasInteracted: false,
  chatHistory: [],
  chatFolders: [],
  currentChatSession: null,
  currentChatTitle: null,
  searchQuery: '',
  filteredChats: [],
  isGitHubConnected: false,
  isConnectingToGitHub: false,
  gitHubUsername: null,
  gitHubToken: null,
  gitHubRepositories: [],
  selectedRepository: null,
  gitHubUser: null,
  showGitHubSidebar: false,
  currentWorkstation: null,
  isCreatingWorkstation: false,
  userId: null,
  selectedModel: 'auto',
  isTerminalMode: true,
  autoApprove: false,
  isRecording: false,
  previewUrl: null,
  isToolsExpanded: false,
  isSidebarOpen: false,
  autocompleteOptions: [],
  showAutocomplete: false,
  selectedAutocompleteIndex: -1,
  
  // Actions
  addTerminalItem: (item) =>
    set((state) => ({
      terminalItems: [...state.terminalItems, item],
      hasInteracted: true,
    })),
    
  clearTerminal: () => set({ terminalItems: [], hasInteracted: false }),
  setLoading: (loading) => set({ isLoading: loading }),
  setHasInteracted: (value) => set({ hasInteracted: value }),
  setCurrentChat: (session) => set({ currentChatSession: session }),
  setCurrentChatTitle: (title) => set({ currentChatTitle: title }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setGitHubConnected: (connected) => set({ isGitHubConnected: connected }),
  setGitHubUser: (user) => set({ gitHubUser: user }),
  setGitHubRepositories: (repos) => set({ gitHubRepositories: repos }),
  setSelectedRepository: (repo) => set({ selectedRepository: repo }),
  setShowGitHubSidebar: (show) => set({ showGitHubSidebar: show }),
  setWorkstation: (workstation) => set({ currentWorkstation: workstation }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  setIsTerminalMode: (value) => set({ isTerminalMode: value }),
  setAutoApprove: (value) => set({ autoApprove: value }),
  setIsRecording: (value) => set({ isRecording: value }),
  setPreviewUrl: (url) => set({ previewUrl: url }),
  setIsToolsExpanded: (value) => set({ isToolsExpanded: value }),
  setIsSidebarOpen: (value) => set({ isSidebarOpen: value }),
  setAutocompleteOptions: (options) => set({ autocompleteOptions: options }),
  setShowAutocomplete: (show) => set({ showAutocomplete: show }),
}));
