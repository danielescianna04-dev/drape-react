import { create } from 'zustand';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { ProjectService } from '../firebase/projectService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  TerminalItem,
  ChatSession,
  ChatFolder,
  GitHubRepository,
  GitHubUser,
  WorkstationInfo,
  ProjectFolder,
  AutocompleteOption,
} from '../../shared/types';

// AsyncStorage keys
const STORAGE_KEYS = {
  CHAT_HISTORY: '@drape_chat_history',
};

// Helper functions for AsyncStorage
const loadChatsFromStorage = async (): Promise<ChatSession[]> => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.CHAT_HISTORY);
    if (stored) {
      const chats = JSON.parse(stored);
      // Convert date strings back to Date objects
      return chats.map((chat: any) => ({
        ...chat,
        createdAt: new Date(chat.createdAt),
        lastUsed: new Date(chat.lastUsed),
      }));
    }
    return [];
  } catch (error) {
    console.error('Error loading chats from storage:', error);
    return [];
  }
};

const saveChatsToStorage = async (chats: ChatSession[]) => {
  try {
    console.log('💿 Saving chats to AsyncStorage:', chats.length, 'chats');
    await AsyncStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(chats));
    console.log('✅ Chats saved successfully');
  } catch (error) {
    console.error('❌ Error saving chats to storage:', error);
  }
};

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
  workstations: WorkstationInfo[];
  projectFolders: ProjectFolder[];
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
  executeCommand: (command: string, workstationId?: string) => Promise<void>;
  clearTerminal: () => void;
  setLoading: (loading: boolean) => void;
  setHasInteracted: (value: boolean) => void;
  setCurrentChat: (session: ChatSession | null) => void;
  setCurrentChatTitle: (title: string | null) => void;
  setSearchQuery: (query: string) => void;
  addChat: (chat: ChatSession) => void;
  updateChat: (chatId: string, updates: Partial<ChatSession>) => void;
  deleteChat: (chatId: string) => void;
  updateChatLastUsed: (chatId: string) => void;
  loadChats: () => Promise<void>;
  setGitHubConnected: (connected: boolean) => void;
  setGitHubUser: (user: GitHubUser | null) => void;
  setGitHubRepositories: (repos: GitHubRepository[]) => void;
  setSelectedRepository: (repo: GitHubRepository | null) => void;
  setShowGitHubSidebar: (show: boolean) => void;
  setWorkstation: (workstation: WorkstationInfo | null) => void;
  addWorkstation: (workstation: WorkstationInfo) => void;
  loadWorkstations: (workstations: WorkstationInfo[]) => void;
  setProjectFolders: (folders: ProjectFolder[]) => void;
  removeWorkstation: (workstationId: string) => Promise<void>;
  addProjectFolder: (folder: ProjectFolder) => void;
  removeProjectFolder: (folderId: string) => void;
  toggleFolderExpanded: (folderId: string) => void;
  moveProjectToFolder: (projectId: string, folderId: string | null) => void;
  reorderWorkstations: (draggedId: string, targetId: string) => void;
  setSelectedModel: (model: string) => void;
  setIsTerminalMode: (value: boolean) => void;
  setAutoApprove: (value: boolean) => void;
  setIsRecording: (value: boolean) => void;
  setPreviewUrl: (url: string | null) => void;
  setIsToolsExpanded: (value: boolean) => void;
  setIsSidebarOpen: (value: boolean) => void;
  setAutocompleteOptions: (options: AutocompleteOption[]) => void;
  setShowAutocomplete: (show: boolean) => void;
  setWorkstationFiles: (workstationId: string, files: string[]) => void;
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
  workstations: [],
  projectFolders: [],
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
  
  executeCommand: async (command: string, workstationId?: string) => {
    // Implementazione gestita da useTerminalExecutor
  },
      
  clearTerminal: () => set({ terminalItems: [], hasInteracted: false }),
  setLoading: (loading) => set({ isLoading: loading }),
  setHasInteracted: (value) => set({ hasInteracted: value }),
  setCurrentChat: (session) => set({ currentChatSession: session }),
  setCurrentChatTitle: (title) => set({ currentChatTitle: title }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  // Chat management
  addChat: (chat) =>
    set((state) => {
      const newHistory = [chat, ...state.chatHistory];
      saveChatsToStorage(newHistory); // Persist to AsyncStorage
      return {
        chatHistory: newHistory,
        currentChatSession: chat,
      };
    }),

  updateChat: (chatId, updates) =>
    set((state) => {
      const newHistory = state.chatHistory.map((chat) =>
        chat.id === chatId ? { ...chat, ...updates } : chat
      );
      saveChatsToStorage(newHistory); // Persist to AsyncStorage
      return {
        chatHistory: newHistory,
        currentChatSession: state.currentChatSession?.id === chatId
          ? { ...state.currentChatSession, ...updates }
          : state.currentChatSession,
      };
    }),

  deleteChat: (chatId) =>
    set((state) => {
      const newHistory = state.chatHistory.filter((chat) => chat.id !== chatId);
      saveChatsToStorage(newHistory); // Persist to AsyncStorage
      return {
        chatHistory: newHistory,
        currentChatSession: state.currentChatSession?.id === chatId ? null : state.currentChatSession,
      };
    }),

  updateChatLastUsed: (chatId) =>
    set((state) => {
      const newHistory = state.chatHistory.map((chat) =>
        chat.id === chatId ? { ...chat, lastUsed: new Date() } : chat
      );
      saveChatsToStorage(newHistory); // Persist to AsyncStorage
      return {
        chatHistory: newHistory,
      };
    }),

  loadChats: async () => {
    const chats = await loadChatsFromStorage();
    set({ chatHistory: chats });
  },
  setGitHubConnected: (connected) => set({ isGitHubConnected: connected }),
  setGitHubUser: (user) => set({ gitHubUser: user }),
  setGitHubRepositories: (repos) => set({ gitHubRepositories: repos }),
  setSelectedRepository: (repo) => set({ selectedRepository: repo }),
  setShowGitHubSidebar: (show) => set({ showGitHubSidebar: show }),
  setWorkstation: (workstation) => set({ currentWorkstation: workstation }),
  addWorkstation: (workstation) =>
    set((state) => ({
      workstations: [...state.workstations, workstation],
      currentWorkstation: workstation,
    })),
  loadWorkstations: (workstations) => set({ workstations }),
  setProjectFolders: (folders) => set({ projectFolders: folders }),
  removeWorkstation: async (workstationId) => {
    // Rimuovi da Firestore
    try {
      await deleteDoc(doc(db, 'user_projects', workstationId));
    } catch (error) {
      console.error('Error deleting from Firestore:', error);
    }
    // Rimuovi dallo store locale
    set((state) => ({
      workstations: state.workstations.filter((w) => w.id !== workstationId),
      currentWorkstation: state.currentWorkstation?.id === workstationId ? null : state.currentWorkstation,
    }));
  },
  addProjectFolder: (folder) =>
    set((state) => ({
      projectFolders: [...state.projectFolders, folder],
    })),
  removeProjectFolder: (folderId) =>
    set((state) => ({
      projectFolders: state.projectFolders.filter((f) => f.id !== folderId && f.parentId !== folderId),
      workstations: state.workstations.map((w) =>
        w.folderId === folderId ? { ...w, folderId: null } : w
      ),
    })),
  toggleFolderExpanded: (folderId) =>
    set((state) => ({
      projectFolders: state.projectFolders.map((f) =>
        f.id === folderId ? { ...f, isExpanded: !f.isExpanded } : f
      ),
    })),
  moveProjectToFolder: (projectId, folderId) =>
    set((state) => ({
      workstations: state.workstations.map((w) =>
        w.id === projectId ? { ...w, folderId } : w
      ),
    })),
  reorderWorkstations: (draggedId, targetId) =>
    set((state) => {
      const rootProjects = state.workstations.filter((w) => !w.folderId);
      const otherProjects = state.workstations.filter((w) => w.folderId);
      
      const draggedIndex = rootProjects.findIndex((w) => w.id === draggedId);
      const targetIndex = rootProjects.findIndex((w) => w.id === targetId);
      
      if (draggedIndex === -1 || targetIndex === -1) return state;
      
      const newRootProjects = [...rootProjects];
      const [removed] = newRootProjects.splice(draggedIndex, 1);
      newRootProjects.splice(targetIndex, 0, removed);
      
      return { workstations: [...newRootProjects, ...otherProjects] };
    }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  setIsTerminalMode: (value) => set({ isTerminalMode: value }),
  setAutoApprove: (value) => set({ autoApprove: value }),
  setIsRecording: (value) => set({ isRecording: value }),
  setPreviewUrl: (url) => set({ previewUrl: url }),
  setIsToolsExpanded: (value) => set({ isToolsExpanded: value }),
  setIsSidebarOpen: (value) => set({ isSidebarOpen: value }),
  setAutocompleteOptions: (options) => set({ autocompleteOptions: options }),
  setShowAutocomplete: (show) => set({ showAutocomplete: show }),
  setWorkstationFiles: (workstationId, files) =>
    set((state) => ({
      workstations: state.workstations.map((w) =>
        w.id === workstationId ? { ...w, files } : w
      ),
      currentWorkstation:
        state.currentWorkstation?.id === workstationId
          ? { ...state.currentWorkstation, files }
          : state.currentWorkstation,
    })),
}));
