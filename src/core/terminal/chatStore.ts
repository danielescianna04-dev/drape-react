import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ChatSession,
  ChatFolder,
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
    await AsyncStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(chats));
  } catch (error) {
    console.error('❌ Error saving chats to storage:', error);
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
}

export const useChatStore = create<ChatState>((set) => ({
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
}));
