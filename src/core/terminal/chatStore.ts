import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ChatSession,
  ChatFolder,
} from '../../shared/types';
import { AppColors } from '../../shared/theme/colors';

// AsyncStorage keys
const STORAGE_KEYS = {
  CHAT_HISTORY: '@bynot_chat_history',
  CHAT_FOLDERS: '@bynot_chat_folders',
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
    await AsyncStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(chats));
  } catch (error) {
    console.error('Error saving chats to storage:', error);
  }
};

const loadFoldersFromStorage = async (): Promise<ChatFolder[]> => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.CHAT_FOLDERS);
    if (stored) {
      const folders = JSON.parse(stored);
      return folders.map((f: any) => ({
        ...f,
        createdAt: new Date(f.createdAt),
      }));
    }
    return [];
  } catch (error) {
    console.error('Error loading folders from storage:', error);
    return [];
  }
};

const saveFoldersToStorage = async (folders: ChatFolder[]) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.CHAT_FOLDERS, JSON.stringify(folders));
  } catch (error) {
    console.error('Error saving folders to storage:', error);
  }
};

export interface ChatState {
  // Chat
  chatHistory: ChatSession[];
  chatFolders: ChatFolder[];
  currentChatSession: ChatSession | null;
  currentChatTitle: string | null;
  searchQuery: string;
  filteredChats: ChatSession[];

  // Actions
  setCurrentChat: (session: ChatSession | null) => void;
  setCurrentChatTitle: (title: string | null) => void;
  setSearchQuery: (query: string) => void;
  addChat: (chat: ChatSession) => void;
  updateChat: (chatId: string, updates: Partial<ChatSession>) => void;
  deleteChat: (chatId: string) => void;
  updateChatLastUsed: (chatId: string) => void;
  loadChats: () => Promise<void>;

  // Folder actions
  loadFolders: () => Promise<void>;
  addFolder: (name: string) => void;
  updateFolder: (folderId: string, updates: Partial<ChatFolder>) => void;
  deleteFolder: (folderId: string) => void;
  pinChat: (chatId: string) => void;
  unpinChat: (chatId: string) => void;
  moveChatToFolder: (chatId: string, folderId: string | undefined) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
    // Initial state
    chatHistory: [],
    chatFolders: [],
    currentChatSession: null,
    currentChatTitle: null,
    searchQuery: '',
    filteredChats: [],

    // Actions
    setCurrentChat: (session) => set({ currentChatSession: session }),
    setCurrentChatTitle: (title) => set({ currentChatTitle: title }),
    setSearchQuery: (query) => set({ searchQuery: query }),

    addChat: (chat) =>
      set((state) => {
        const newHistory = [chat, ...state.chatHistory];
        saveChatsToStorage(newHistory);
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
        saveChatsToStorage(newHistory);
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
        saveChatsToStorage(newHistory);
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
        saveChatsToStorage(newHistory);
        return {
          chatHistory: newHistory,
        };
      }),

    loadChats: async () => {
      const chats = await loadChatsFromStorage();
      set({ chatHistory: chats });
    },

    // Folder actions
    loadFolders: async () => {
      const folders = await loadFoldersFromStorage();
      set({ chatFolders: folders });
    },

    addFolder: (name) =>
      set((state) => {
        const newFolder: ChatFolder = {
          id: Date.now().toString(),
          name,
          icon: 'folder',
          color: AppColors.primary,
          createdAt: new Date(),
        };
        const newFolders = [...state.chatFolders, newFolder];
        saveFoldersToStorage(newFolders);
        return { chatFolders: newFolders };
      }),

    updateFolder: (folderId, updates) =>
      set((state) => {
        const newFolders = state.chatFolders.map((f) =>
          f.id === folderId ? { ...f, ...updates } : f
        );
        saveFoldersToStorage(newFolders);
        return { chatFolders: newFolders };
      }),

    deleteFolder: (folderId) =>
      set((state) => {
        const newFolders = state.chatFolders.filter((f) => f.id !== folderId);
        saveFoldersToStorage(newFolders);
        // Reset folderId for all chats in this folder
        const newHistory = state.chatHistory.map((chat) =>
          chat.folderId === folderId ? { ...chat, folderId: undefined } : chat
        );
        saveChatsToStorage(newHistory);
        return { chatFolders: newFolders, chatHistory: newHistory };
      }),

    pinChat: (chatId) =>
      set((state) => {
        const newHistory = state.chatHistory.map((chat) =>
          chat.id === chatId ? { ...chat, pinned: true } : chat
        );
        saveChatsToStorage(newHistory);
        return { chatHistory: newHistory };
      }),

    unpinChat: (chatId) =>
      set((state) => {
        const newHistory = state.chatHistory.map((chat) =>
          chat.id === chatId ? { ...chat, pinned: false } : chat
        );
        saveChatsToStorage(newHistory);
        return { chatHistory: newHistory };
      }),

    moveChatToFolder: (chatId, folderId) =>
      set((state) => {
        const newHistory = state.chatHistory.map((chat) =>
          chat.id === chatId ? { ...chat, folderId } : chat
        );
        saveChatsToStorage(newHistory);
        return { chatHistory: newHistory };
      }),
}));
