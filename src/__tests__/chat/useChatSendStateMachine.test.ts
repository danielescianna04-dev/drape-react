import { describe, expect, it } from 'vitest';
import {
  chatSendStateReducer,
  isTerminalPhase,
  isActivePhase,
  type ChatSendPhase,
  type ChatSendEvent,
} from '../../pages/Chat/useChatSendStateMachine';

const reduce = (state: ChatSendPhase, type: ChatSendEvent['type']) =>
  chatSendStateReducer(state, { type } as ChatSendEvent);

describe('chatSendStateReducer', () => {
  it('transitions through the happy path: idle → sending → streaming → tools → idle', () => {
    let phase: ChatSendPhase = 'idle';

    phase = reduce(phase, 'SEND_STARTED');
    expect(phase).toBe('sending');

    phase = reduce(phase, 'STREAM_STARTED');
    expect(phase).toBe('streaming');

    phase = reduce(phase, 'TOOLS_STARTED');
    expect(phase).toBe('processing_tools');

    phase = reduce(phase, 'RESET');
    expect(phase).toBe('idle');
  });

  it('handles stop during streaming', () => {
    let phase: ChatSendPhase = 'idle';
    phase = reduce(phase, 'SEND_STARTED');
    phase = reduce(phase, 'STREAM_STARTED');
    expect(phase).toBe('streaming');

    phase = reduce(phase, 'STOPPED');
    expect(phase).toBe('stopped');

    phase = reduce(phase, 'RESET');
    expect(phase).toBe('idle');
  });

  it('handles stop during tool processing', () => {
    let phase: ChatSendPhase = 'idle';
    phase = reduce(phase, 'SEND_STARTED');
    phase = reduce(phase, 'STREAM_STARTED');
    phase = reduce(phase, 'TOOLS_STARTED');
    expect(phase).toBe('processing_tools');

    phase = reduce(phase, 'STOPPED');
    expect(phase).toBe('stopped');
  });

  it('handles failure from any active state', () => {
    expect(reduce('sending', 'FAILED')).toBe('error');
    expect(reduce('streaming', 'FAILED')).toBe('error');
    expect(reduce('processing_tools', 'FAILED')).toBe('error');
  });

  it('ignores invalid transitions (no-op)', () => {
    // Can't start streaming from idle
    expect(reduce('idle', 'STREAM_STARTED')).toBe('idle');
    // Can't start tools from idle
    expect(reduce('idle', 'TOOLS_STARTED')).toBe('idle');
    // Can't fail from idle
    expect(reduce('idle', 'FAILED')).toBe('idle');
    // Can't stop from idle
    expect(reduce('idle', 'STOPPED')).toBe('idle');
    // Can't re-send from streaming
    expect(reduce('streaming', 'SEND_STARTED')).toBe('streaming');
    // Can't go from error to streaming
    expect(reduce('error', 'STREAM_STARTED')).toBe('error');
    // Can't go from stopped to streaming
    expect(reduce('stopped', 'STREAM_STARTED')).toBe('stopped');
  });

  it('allows RESET from terminal states', () => {
    expect(reduce('stopped', 'RESET')).toBe('idle');
    expect(reduce('error', 'RESET')).toBe('idle');
  });

  it('allows immediate RESET from sending (terminal/quick commands)', () => {
    let phase: ChatSendPhase = 'idle';
    phase = reduce(phase, 'SEND_STARTED');
    phase = reduce(phase, 'RESET');
    expect(phase).toBe('idle');
  });

  it('allows direct streaming → idle reset on normal completion', () => {
    let phase: ChatSendPhase = 'idle';
    phase = reduce(phase, 'SEND_STARTED');
    phase = reduce(phase, 'STREAM_STARTED');
    phase = reduce(phase, 'RESET');
    expect(phase).toBe('idle');
  });
});

describe('phase helpers', () => {
  it('isTerminalPhase', () => {
    expect(isTerminalPhase('idle')).toBe(true);
    expect(isTerminalPhase('stopped')).toBe(true);
    expect(isTerminalPhase('error')).toBe(true);
    expect(isTerminalPhase('sending')).toBe(false);
    expect(isTerminalPhase('streaming')).toBe(false);
    expect(isTerminalPhase('processing_tools')).toBe(false);
  });

  it('isActivePhase', () => {
    expect(isActivePhase('sending')).toBe(true);
    expect(isActivePhase('streaming')).toBe(true);
    expect(isActivePhase('processing_tools')).toBe(true);
    expect(isActivePhase('idle')).toBe(false);
    expect(isActivePhase('stopped')).toBe(false);
    expect(isActivePhase('error')).toBe(false);
  });
});
