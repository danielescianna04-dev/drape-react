import { useEffect, useMemo, useReducer, useRef } from 'react';

export type ChatSendPhase =
  | 'idle'
  | 'sending'
  | 'streaming'
  | 'processing_tools'
  | 'stopped'
  | 'error';

export type ChatSendEvent =
  | { type: 'SEND_STARTED' }
  | { type: 'STREAM_STARTED' }
  | { type: 'TOOLS_STARTED' }
  | { type: 'STOPPED' }
  | { type: 'FAILED' }
  | { type: 'RESET' };

/**
 * Valid transition table — only allowed (state, event) pairs produce a new state.
 * Invalid transitions return the current state unchanged (no-op).
 */
const VALID_TRANSITIONS: Record<string, ChatSendPhase | undefined> = {
  // From idle
  'idle:SEND_STARTED': 'sending',

  // From sending
  'sending:STREAM_STARTED': 'streaming',
  'sending:FAILED': 'error',
  'sending:STOPPED': 'stopped',
  'sending:RESET': 'idle', // terminal/quick command paths reset immediately

  // From streaming
  'streaming:TOOLS_STARTED': 'processing_tools',
  'streaming:STOPPED': 'stopped',
  'streaming:FAILED': 'error',
  'streaming:RESET': 'idle', // normal completion

  // From processing_tools
  'processing_tools:STOPPED': 'stopped',
  'processing_tools:FAILED': 'error',
  'processing_tools:RESET': 'idle',

  // Terminal states → only RESET is valid
  'stopped:RESET': 'idle',
  'error:RESET': 'idle',
};

export const chatSendStateReducer = (state: ChatSendPhase, event: ChatSendEvent): ChatSendPhase => {
  const key = `${state}:${event.type}`;
  return VALID_TRANSITIONS[key] ?? state;
};

/** True when the machine is in a terminal (non-active) state. */
export const isTerminalPhase = (phase: ChatSendPhase): boolean =>
  phase === 'idle' || phase === 'stopped' || phase === 'error';

/** True when the machine is in an active sending/streaming/tools state. */
export const isActivePhase = (phase: ChatSendPhase): boolean =>
  phase === 'sending' || phase === 'streaming' || phase === 'processing_tools';

export const useChatSendStateMachine = () => {
  const [phase, dispatch] = useReducer(chatSendStateReducer, 'idle' as ChatSendPhase);
  const phaseRef = useRef<ChatSendPhase>(phase);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const actions = useMemo(() => ({
    markSendStarted: () => dispatch({ type: 'SEND_STARTED' }),
    markStreamStarted: () => dispatch({ type: 'STREAM_STARTED' }),
    markToolsStarted: () => dispatch({ type: 'TOOLS_STARTED' }),
    markStopped: () => dispatch({ type: 'STOPPED' }),
    markFailed: () => dispatch({ type: 'FAILED' }),
    reset: () => dispatch({ type: 'RESET' }),
  }), []);

  return useMemo(() => ({
    phase,
    getPhase: () => phaseRef.current,
    isActive: isActivePhase(phase),
    isTerminal: isTerminalPhase(phase),
    ...actions,
  }), [phase, actions]);
};
