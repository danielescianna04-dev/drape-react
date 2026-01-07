import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@drape_file_history';
const MAX_HISTORY_PER_PROJECT = 50; // Limit memory usage

export interface FileModification {
  id: string;
  projectId: string;
  filePath: string;
  originalContent: string;
  newContent: string;
  toolName: 'write_file' | 'edit_file';
  timestamp: Date;
  description?: string; // e.g., "AI: Added login button"
}

interface ProjectHistory {
  undoStack: FileModification[];
  redoStack: FileModification[];
}

interface FileHistoryState {
  // History per project
  projectHistories: Record<string, ProjectHistory>;

  // Current project being tracked
  currentProjectId: string | null;

  // Actions
  setCurrentProject: (projectId: string | null) => void;

  // Record a new file modification (clears redo stack)
  recordModification: (modification: Omit<FileModification, 'id' | 'timestamp'>) => void;

  // Undo last modification - returns the modification to apply
  undo: (projectId: string) => FileModification | null;

  // Redo last undone modification - returns the modification to apply
  redo: (projectId: string) => FileModification | null;

  // Check if undo/redo is available
  canUndo: (projectId: string) => boolean;
  canRedo: (projectId: string) => boolean;

  // Get current stack sizes (for UI)
  getStackSizes: (projectId: string) => { undoCount: number; redoCount: number };

  // Clear history for a project
  clearHistory: (projectId: string) => void;

  // Load from storage
  loadHistory: () => Promise<void>;

  // Get recent modifications for display
  getRecentModifications: (projectId: string, limit?: number) => FileModification[];
}

// Helper to generate unique IDs
const generateId = () => `mod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Persist to AsyncStorage
const saveHistoryToStorage = async (histories: Record<string, ProjectHistory>) => {
  try {
    // Convert to serializable format
    const serializable: Record<string, { undoStack: any[]; redoStack: any[] }> = {};

    for (const [projectId, history] of Object.entries(histories)) {
      serializable[projectId] = {
        undoStack: history.undoStack.map(mod => ({
          ...mod,
          timestamp: mod.timestamp.toISOString(),
        })),
        redoStack: history.redoStack.map(mod => ({
          ...mod,
          timestamp: mod.timestamp.toISOString(),
        })),
      };
    }

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch (error) {
    console.error('❌ [FileHistory] Error saving history:', error);
  }
};

// Load from AsyncStorage
const loadHistoryFromStorage = async (): Promise<Record<string, ProjectHistory>> => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (!stored) return {};

    const parsed = JSON.parse(stored);
    const histories: Record<string, ProjectHistory> = {};

    for (const [projectId, history] of Object.entries(parsed as Record<string, any>)) {
      histories[projectId] = {
        undoStack: (history.undoStack || []).map((mod: any) => ({
          ...mod,
          timestamp: new Date(mod.timestamp),
        })),
        redoStack: (history.redoStack || []).map((mod: any) => ({
          ...mod,
          timestamp: new Date(mod.timestamp),
        })),
      };
    }

    return histories;
  } catch (error) {
    console.error('❌ [FileHistory] Error loading history:', error);
    return {};
  }
};

export const useFileHistoryStore = create<FileHistoryState>((set, get) => ({
  projectHistories: {},
  currentProjectId: null,

  setCurrentProject: (projectId) => {
    set({ currentProjectId: projectId });
  },

  recordModification: (modification) => {
    const { projectId } = modification;

    set((state) => {
      const currentHistory = state.projectHistories[projectId] || { undoStack: [], redoStack: [] };

      const newModification: FileModification = {
        ...modification,
        id: generateId(),
        timestamp: new Date(),
      };

      // Add to undo stack, clear redo stack
      let newUndoStack = [...currentHistory.undoStack, newModification];

      // Limit stack size
      if (newUndoStack.length > MAX_HISTORY_PER_PROJECT) {
        newUndoStack = newUndoStack.slice(-MAX_HISTORY_PER_PROJECT);
      }

      const newHistories = {
        ...state.projectHistories,
        [projectId]: {
          undoStack: newUndoStack,
          redoStack: [], // Clear redo on new modification
        },
      };

      // Persist async
      saveHistoryToStorage(newHistories);

      console.log(`📝 [FileHistory] Recorded: ${modification.toolName} on ${modification.filePath}`);

      return { projectHistories: newHistories };
    });
  },

  undo: (projectId) => {
    const state = get();
    const history = state.projectHistories[projectId];

    if (!history || history.undoStack.length === 0) {
      console.log('⚠️ [FileHistory] Nothing to undo');
      return null;
    }

    const modification = history.undoStack[history.undoStack.length - 1];

    set((state) => {
      const currentHistory = state.projectHistories[projectId];

      const newHistories = {
        ...state.projectHistories,
        [projectId]: {
          undoStack: currentHistory.undoStack.slice(0, -1),
          redoStack: [...currentHistory.redoStack, modification],
        },
      };

      saveHistoryToStorage(newHistories);

      console.log(`↩️ [FileHistory] Undo: ${modification.filePath}`);

      return { projectHistories: newHistories };
    });

    return modification;
  },

  redo: (projectId) => {
    const state = get();
    const history = state.projectHistories[projectId];

    if (!history || history.redoStack.length === 0) {
      console.log('⚠️ [FileHistory] Nothing to redo');
      return null;
    }

    const modification = history.redoStack[history.redoStack.length - 1];

    set((state) => {
      const currentHistory = state.projectHistories[projectId];

      const newHistories = {
        ...state.projectHistories,
        [projectId]: {
          undoStack: [...currentHistory.undoStack, modification],
          redoStack: currentHistory.redoStack.slice(0, -1),
        },
      };

      saveHistoryToStorage(newHistories);

      console.log(`↪️ [FileHistory] Redo: ${modification.filePath}`);

      return { projectHistories: newHistories };
    });

    return modification;
  },

  canUndo: (projectId) => {
    const history = get().projectHistories[projectId];
    return history ? history.undoStack.length > 0 : false;
  },

  canRedo: (projectId) => {
    const history = get().projectHistories[projectId];
    return history ? history.redoStack.length > 0 : false;
  },

  getStackSizes: (projectId) => {
    const history = get().projectHistories[projectId];
    return {
      undoCount: history?.undoStack.length || 0,
      redoCount: history?.redoStack.length || 0,
    };
  },

  clearHistory: (projectId) => {
    set((state) => {
      const newHistories = { ...state.projectHistories };
      delete newHistories[projectId];

      saveHistoryToStorage(newHistories);

      console.log(`🗑️ [FileHistory] Cleared history for ${projectId}`);

      return { projectHistories: newHistories };
    });
  },

  loadHistory: async () => {
    const histories = await loadHistoryFromStorage();
    set({ projectHistories: histories });
    console.log(`📂 [FileHistory] Loaded history for ${Object.keys(histories).length} projects`);
  },

  getRecentModifications: (projectId, limit = 10) => {
    const history = get().projectHistories[projectId];
    if (!history) return [];

    return history.undoStack.slice(-limit).reverse();
  },
}));
