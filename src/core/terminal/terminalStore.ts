/**
 * terminalStore.ts - Backwards-compatible thin wrapper
 *
 * This file re-exports a unified `useTerminalStore` that delegates to three
 * focused stores (chatStore, workstationStore, uiStore). All existing imports
 * continue to work without changes.
 *
 * For new code, prefer importing from the focused stores directly:
 *   import { useChatStore } from './chatStore';
 *   import { useWorkstationStore } from './workstationStore';
 *   import { useUIStore } from './uiStore';
 */

import { useChatStore, ChatState } from './chatStore';
import { useWorkstationStore, WorkstationState } from './workstationStore';
import { useUIStore, UIState } from './uiStore';

// Re-export PreviewStartupState from uiStore for backwards compatibility
export { PreviewStartupState } from './uiStore';

// Re-export the focused stores for gradual migration
export { useChatStore } from './chatStore';
export { useWorkstationStore } from './workstationStore';
export { useUIStore } from './uiStore';

// Combined state type (union of all three stores)
type TerminalState = ChatState & WorkstationState & UIState;

/**
 * Helper to get the merged state from all three stores.
 * Used by getState() and setState().
 */
function getMergedState(): TerminalState {
  return {
    ...useChatStore.getState(),
    ...useWorkstationStore.getState(),
    ...useUIStore.getState(),
  };
}

/**
 * Route a partial state update to the correct sub-store(s).
 */
function routeSetState(partial: Partial<TerminalState> | ((state: TerminalState) => Partial<TerminalState>)) {
  // If it's a function, resolve it with the merged state
  const updates = typeof partial === 'function' ? partial(getMergedState()) : partial;

  // Chat store fields
  const chatKeys: (keyof ChatState)[] = [
    'chatHistory', 'chatFolders', 'currentChatSession', 'currentChatTitle',
    'searchQuery', 'filteredChats',
  ];

  // Workstation store fields
  const workstationKeys: (keyof WorkstationState)[] = [
    'isGitHubConnected', 'isConnectingToGitHub', 'gitHubUsername', 'gitHubToken',
    'gitHubRepositories', 'selectedRepository', 'gitHubUser', 'showGitHubSidebar',
    'currentWorkstation', 'workstations', 'projectFolders', 'isCreatingWorkstation',
    'userId', 'currentProjectInfo',
  ];

  // UI store fields (everything else)
  const uiKeys: (keyof UIState)[] = [
    'globalTerminalLog', 'terminalItems', 'isLoading', 'hasInteracted',
    'selectedModel', 'isTerminalMode', 'autoApprove', 'isRecording',
    'previewUrl', 'previewServerStatus', 'previewServerUrl', 'flyMachineId',
    'projectMachineIds', 'projectPreviewUrls', 'previewStartupStates',
    'isToolsExpanded', 'isSidebarOpen',
    'autocompleteOptions', 'showAutocomplete', 'selectedAutocompleteIndex',
  ];

  const chatUpdates: Record<string, any> = {};
  const workstationUpdates: Record<string, any> = {};
  const uiUpdates: Record<string, any> = {};

  for (const [key, value] of Object.entries(updates)) {
    if (chatKeys.includes(key as keyof ChatState)) {
      chatUpdates[key] = value;
    } else if (workstationKeys.includes(key as keyof WorkstationState)) {
      workstationUpdates[key] = value;
    } else if (uiKeys.includes(key as keyof UIState)) {
      uiUpdates[key] = value;
    } else {
      // Unknown key - try workstation store as fallback (for userId etc.)
      workstationUpdates[key] = value;
    }
  }

  if (Object.keys(chatUpdates).length > 0) {
    useChatStore.setState(chatUpdates as Partial<ChatState>);
  }
  if (Object.keys(workstationUpdates).length > 0) {
    useWorkstationStore.setState(workstationUpdates as Partial<WorkstationState>);
  }
  if (Object.keys(uiUpdates).length > 0) {
    useUIStore.setState(uiUpdates as Partial<UIState>);
  }
}

/**
 * Backwards-compatible useTerminalStore hook.
 *
 * Supports both patterns:
 *   - useTerminalStore((state) => state.someField)  // selector pattern
 *   - const { field1, field2 } = useTerminalStore()  // destructuring pattern
 *   - useTerminalStore.getState().someField           // static access
 *   - useTerminalStore.setState({ someField: value }) // static update
 */
function useTerminalStore(): TerminalState;
function useTerminalStore<T>(selector: (state: TerminalState) => T): T;
function useTerminalStore<T>(selector?: (state: TerminalState) => T): T | TerminalState {
  // Subscribe to all three stores so React re-renders on any change
  const chatState = useChatStore();
  const workstationState = useWorkstationStore();
  const uiState = useUIStore();

  const merged: TerminalState = {
    ...chatState,
    ...workstationState,
    ...uiState,
  };

  if (selector) {
    return selector(merged);
  }
  return merged;
}

// Attach static methods for compatibility with useTerminalStore.getState() and .setState()
useTerminalStore.getState = getMergedState;
useTerminalStore.setState = routeSetState;

// Subscribe method - subscribes to all three stores
useTerminalStore.subscribe = (listener: (state: TerminalState, prevState: TerminalState) => void) => {
  let prevState = getMergedState();

  const handleChange = () => {
    const nextState = getMergedState();
    listener(nextState, prevState);
    prevState = nextState;
  };

  const unsub1 = useChatStore.subscribe(handleChange);
  const unsub2 = useWorkstationStore.subscribe(handleChange);
  const unsub3 = useUIStore.subscribe(handleChange);

  return () => {
    unsub1();
    unsub2();
    unsub3();
  };
};

export { useTerminalStore };
export type { TerminalState };
