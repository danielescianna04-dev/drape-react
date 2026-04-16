import { describe, expect, it } from 'vitest';
import { resolveAgentStreamRouting } from '../../../backend-ts/src/routes/agentStreamRouting';

describe('resolveAgentStreamRouting', () => {
  it('uses explicit projectCreation for /stream requests', () => {
    expect(
      resolveAgentStreamRouting({
        path: '/stream',
        body: {
          projectCreation: true,
          prompt: 'short prompt',
        },
      }),
    ).toEqual({
      mode: 'fast',
      intent: 'project_creation',
    });
  });

  it('keeps /stream as chat when projectCreation is not set and prompt is short', () => {
    expect(
      resolveAgentStreamRouting({
        path: '/stream',
        body: {
          prompt: 'hello',
        },
      }),
    ).toEqual({
      mode: 'fast',
      intent: 'chat',
    });
  });

  it('long prompts without explicit projectCreation stay as chat', () => {
    expect(
      resolveAgentStreamRouting({
        path: '/stream',
        body: {
          prompt: 'a'.repeat(2100),
        },
      }),
    ).toEqual({
      mode: 'fast',
      intent: 'chat',
    });
  });

  it('reads plan mode from path-based agent routes', () => {
    expect(
      resolveAgentStreamRouting({
        path: '/run/plan',
        body: {
          prompt: 'plan this feature',
        },
      }),
    ).toEqual({
      mode: 'plan',
      intent: 'chat',
    });
  });
});
