/**
 * Agent Store
 * Zustand store for managing Agent execution state
 * Tracks: mode, events, plan, files changed, errors, etc.
 */

import { create } from 'zustand';
import { AgentToolEvent, AgentPlan } from '../../hooks/api/useAgentStream';

// Agent Mode
export type AgentMode = 'fast' | 'planning' | 'executing' | null;

// Agent State Interface
export interface AgentState {
  // Execution state
  mode: AgentMode;
  isRunning: boolean;
  events: AgentToolEvent[];
  currentTool: string | null;
  plan: AgentPlan | null;
  error: string | null;
  summary: string | null;
  iteration: number;

  // File tracking
  filesCreated: string[];
  filesModified: string[];

  // Execution context
  currentProjectId: string | null;
  currentPrompt: string | null;

  // Actions - Mode Management
  setMode: (mode: AgentMode) => void;

  // Actions - Execution Control
  startAgent: () => void;
  stopAgent: () => void;
  reset: () => void;

  // Actions - Event Management
  addEvent: (event: AgentToolEvent) => void;
  clearEvents: () => void;

  // Actions - Tool Management
  setCurrentTool: (tool: string | null) => void;

  // Actions - AgentPlan Management
  setAgentPlan: (plan: AgentPlan | null) => void;
  updateAgentPlanStep: (stepId: string, updates: Partial<{ status: 'pending' | 'running' | 'completed' | 'failed' }>) => void;

  // Actions - Error Management
  setError: (error: string | null) => void;
  clearError: () => void;

  // Actions - Summary Management
  setSummary: (summary: string | null) => void;

  // Actions - Iteration Management
  setIteration: (iteration: number) => void;

  // Actions - File Tracking
  addFilesCreated: (files: string[]) => void;
  addFilesModified: (files: string[]) => void;
  clearFileTracking: () => void;

  // Actions - Context Management
  setCurrentProjectId: (projectId: string | null) => void;
  setCurrentPrompt: (prompt: string | null) => void;
}

/**
 * Agent Store
 * Global state for agent execution and monitoring
 */
export const useAgentStore = create<AgentState>((set, get) => ({
  // Initial state
  mode: null,
  isRunning: false,
  events: [],
  currentTool: null,
  plan: null,
  error: null,
  summary: null,
  iteration: 0,
  filesCreated: [],
  filesModified: [],
  currentProjectId: null,
  currentPrompt: null,

  // Mode Management
  setMode: (mode) => {
    set({ mode });
  },

  // Execution Control
  startAgent: () => {
    set({
      isRunning: true,
      error: null,
      summary: null,
    });
  },

  stopAgent: () => {
    set({
      isRunning: false,
      currentTool: null,
    });
  },

  reset: () => {
    set({
      mode: null,
      isRunning: false,
      events: [],
      currentTool: null,
      plan: null,
      error: null,
      summary: null,
      iteration: 0,
      filesCreated: [],
      filesModified: [],
      currentProjectId: null,
      currentPrompt: null,
    });
  },

  // Event Management
  addEvent: (event) => {
    set((state) => ({
      events: [...state.events, event],
    }));
  },

  clearEvents: () => {
    set({ events: [] });
  },

  // Tool Management
  setCurrentTool: (tool) => {
    set({ currentTool: tool });
  },

  // AgentPlan Management
  setAgentPlan: (plan) => {
    set({ plan });
  },

  updateAgentPlanStep: (stepId, updates) => {
    set((state) => {
      if (!state.plan) return state;

      const updatedSteps = state.plan.steps.map((step) =>
        step.id === stepId ? { ...step, ...updates } : step
      );

      return {
        plan: {
          ...state.plan,
          steps: updatedSteps,
        },
      };
    });
  },

  // Error Management
  setError: (error) => {
    console.error('[AgentStore] Setting error:', error);
    set({ error });
  },

  clearError: () => {
    set({ error: null });
  },

  // Summary Management
  setSummary: (summary) => {
    set({ summary });
  },

  // Iteration Management
  setIteration: (iteration) => {
    set({ iteration });
  },

  // File Tracking
  addFilesCreated: (files) => {
    set((state) => {
      const uniqueFiles = Array.from(new Set([...state.filesCreated, ...files]));
      return { filesCreated: uniqueFiles };
    });
  },

  addFilesModified: (files) => {
    set((state) => {
      const uniqueFiles = Array.from(new Set([...state.filesModified, ...files]));
      return { filesModified: uniqueFiles };
    });
  },

  clearFileTracking: () => {
    set({
      filesCreated: [],
      filesModified: [],
    });
  },

  // Context Management
  setCurrentProjectId: (projectId) => {
    set({ currentProjectId: projectId });
  },

  setCurrentPrompt: (prompt) => {
    set({ currentPrompt: prompt });
  },
}));

// Selectors for common state combinations
export const agentSelectors = {
  // Get all events of a specific type
  getEventsByType: (type: AgentToolEvent['type']) => {
    const state = useAgentStore.getState();
    return state.events.filter((event) => event.type === type);
  },

  // Get events for a specific tool
  getEventsByTool: (tool: string) => {
    const state = useAgentStore.getState();
    return state.events.filter((event) => event.tool === tool);
  },

  // Get all tool errors
  getToolErrors: () => {
    const state = useAgentStore.getState();
    return state.events.filter((event) => event.type === 'tool_error');
  },

  // Check if agent is in error state
  hasError: () => {
    const state = useAgentStore.getState();
    return state.error !== null;
  },

  // Check if agent has completed
  isCompleted: () => {
    const state = useAgentStore.getState();
    return !state.isRunning && state.summary !== null;
  },

  // Get current execution status
  getStatus: (): 'idle' | 'running' | 'error' | 'completed' => {
    const state = useAgentStore.getState();
    if (state.error) return 'error';
    if (state.summary && !state.isRunning) return 'completed';
    if (state.isRunning) return 'running';
    return 'idle';
  },

  // Get plan progress
  getAgentPlanProgress: () => {
    const state = useAgentStore.getState();
    if (!state.plan) return null;

    const total = state.plan.steps.length;
    const completed = state.plan.steps.filter((s) => s.status === 'completed').length;
    const failed = state.plan.steps.filter((s) => s.status === 'failed').length;
    const running = state.plan.steps.filter((s) => s.status === 'running').length;

    return {
      total,
      completed,
      failed,
      running,
      pending: total - completed - failed - running,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  },

  // Get all file changes
  getAllFileChanges: () => {
    const state = useAgentStore.getState();
    return {
      created: state.filesCreated,
      modified: state.filesModified,
      total: state.filesCreated.length + state.filesModified.length,
    };
  },
};

// Export type for external use
export type AgentStoreType = typeof useAgentStore;
