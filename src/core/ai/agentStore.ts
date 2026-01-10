/**
 * Agent Store
 * Global state management for agent operations
 */

import { create } from 'zustand';
import { AgentMode, ToolEvent } from './useAgentStream';

interface AgentState {
  // Current agent session
  projectId: string | null;
  mode: AgentMode | null;
  isActive: boolean;
  events: ToolEvent[];
  currentTool: string | null;
  status: 'idle' | 'running' | 'complete' | 'error';
  result: any | null;

  // Actions
  startSession: (projectId: string, mode: AgentMode) => void;
  addEvent: (event: ToolEvent) => void;
  setCurrentTool: (tool: string | null) => void;
  setStatus: (status: 'idle' | 'running' | 'complete' | 'error') => void;
  setResult: (result: any) => void;
  endSession: () => void;
  reset: () => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  // Initial state
  projectId: null,
  mode: null,
  isActive: false,
  events: [],
  currentTool: null,
  status: 'idle',
  result: null,

  // Actions
  startSession: (projectId, mode) =>
    set({
      projectId,
      mode,
      isActive: true,
      events: [],
      currentTool: null,
      status: 'running',
      result: null,
    }),

  addEvent: (event) =>
    set((state) => ({
      events: [...state.events, event],
    })),

  setCurrentTool: (tool) =>
    set({
      currentTool: tool,
    }),

  setStatus: (status) =>
    set({
      status,
    }),

  setResult: (result) =>
    set({
      result,
    }),

  endSession: () =>
    set({
      isActive: false,
      status: 'complete',
      currentTool: null,
    }),

  reset: () =>
    set({
      projectId: null,
      mode: null,
      isActive: false,
      events: [],
      currentTool: null,
      status: 'idle',
      result: null,
    }),
}));

export default useAgentStore;
