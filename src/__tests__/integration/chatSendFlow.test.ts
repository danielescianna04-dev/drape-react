/**
 * Integration-level tests for the chat send state machine flow.
 * Verifies transition sequences match real user scenarios.
 */
import { describe, expect, it } from 'vitest';
import {
  chatSendStateReducer,
  isActivePhase,
  isTerminalPhase,
  type ChatSendPhase,
  type ChatSendEvent,
} from '../../pages/Chat/useChatSendStateMachine';
import {
  canSendChatMessage,
  buildStreamingPlaceholder,
  clearStreamingPlaceholderOnError,
} from '../../pages/Chat/chatSendState';
import { TerminalItemType } from '../../shared/types';

const reduce = (state: ChatSendPhase, type: ChatSendEvent['type']) =>
  chatSendStateReducer(state, { type } as ChatSendEvent);

describe('chat send full flow', () => {
  it('agent mode: idle → sending → streaming → idle (normal completion)', () => {
    let phase: ChatSendPhase = 'idle';
    phase = reduce(phase, 'SEND_STARTED');
    phase = reduce(phase, 'STREAM_STARTED');
    expect(isActivePhase(phase)).toBe(true);
    phase = reduce(phase, 'RESET');
    expect(phase).toBe('idle');
  });

  it('legacy AI: idle → sending → streaming → tools → idle', () => {
    let phase: ChatSendPhase = 'idle';
    phase = reduce(phase, 'SEND_STARTED');
    phase = reduce(phase, 'STREAM_STARTED');
    phase = reduce(phase, 'TOOLS_STARTED');
    expect(phase).toBe('processing_tools');
    phase = reduce(phase, 'RESET');
    expect(phase).toBe('idle');
  });

  it('stop during streaming cleans up correctly', () => {
    let phase: ChatSendPhase = 'idle';
    phase = reduce(phase, 'SEND_STARTED');
    phase = reduce(phase, 'STREAM_STARTED');
    phase = reduce(phase, 'STOPPED');
    expect(isTerminalPhase(phase)).toBe(true);
    // After stop, can reset and send again
    phase = reduce(phase, 'RESET');
    expect(phase).toBe('idle');
    phase = reduce(phase, 'SEND_STARTED');
    expect(phase).toBe('sending');
  });

  it('error during streaming → error → reset → can retry', () => {
    let phase: ChatSendPhase = 'idle';
    phase = reduce(phase, 'SEND_STARTED');
    phase = reduce(phase, 'STREAM_STARTED');
    phase = reduce(phase, 'FAILED');
    expect(phase).toBe('error');
    phase = reduce(phase, 'RESET');
    expect(phase).toBe('idle');
    // Retry
    phase = reduce(phase, 'SEND_STARTED');
    expect(phase).toBe('sending');
  });

  it('double-send prevention: SEND_STARTED while streaming is ignored', () => {
    let phase: ChatSendPhase = 'idle';
    phase = reduce(phase, 'SEND_STARTED');
    phase = reduce(phase, 'STREAM_STARTED');
    // Try to send again while streaming — should be no-op
    phase = reduce(phase, 'SEND_STARTED');
    expect(phase).toBe('streaming');
  });

  it('terminal command: idle → sending → reset (instant path)', () => {
    let phase: ChatSendPhase = 'idle';
    phase = reduce(phase, 'SEND_STARTED');
    phase = reduce(phase, 'RESET');
    expect(phase).toBe('idle');
  });

  it('tab switch during stream: machine can be stopped then reset', () => {
    let phase: ChatSendPhase = 'idle';
    phase = reduce(phase, 'SEND_STARTED');
    phase = reduce(phase, 'STREAM_STARTED');
    // Tab switch triggers stop
    phase = reduce(phase, 'STOPPED');
    expect(phase).toBe('stopped');
    phase = reduce(phase, 'RESET');
    expect(phase).toBe('idle');
  });
});

describe('streaming placeholder lifecycle', () => {
  it('creates placeholder and clears it on error', () => {
    const placeholder = buildStreamingPlaceholder('msg-1');
    expect(placeholder.isThinking).toBe(true);
    expect(placeholder.content).toBe('');

    const tab = {
      id: 'tab-1',
      terminalItems: [
        { ...placeholder, type: TerminalItemType.OUTPUT, timestamp: new Date() },
        { id: 'real-msg', content: 'Hello', type: TerminalItemType.OUTPUT, timestamp: new Date() },
      ],
    } as any;

    const cleaned = clearStreamingPlaceholderOnError({ tab, streamingMessageId: 'msg-1' });
    // Placeholder should be removed (empty content, not thinking)
    expect(cleaned.terminalItems).toHaveLength(1);
    expect(cleaned.terminalItems[0].id).toBe('real-msg');
  });

  it('canSendChatMessage blocks when loading', () => {
    expect(canSendChatMessage({ input: 'test', imageCount: 0, isLoading: true })).toBe(false);
  });

  it('canSendChatMessage blocks when input is empty and no images', () => {
    expect(canSendChatMessage({ input: '  ', imageCount: 0, isLoading: false })).toBe(false);
  });

  it('canSendChatMessage allows images even with empty text', () => {
    expect(canSendChatMessage({ input: '', imageCount: 1, isLoading: false })).toBe(true);
  });
});
