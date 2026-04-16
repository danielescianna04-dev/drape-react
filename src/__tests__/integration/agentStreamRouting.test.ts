/**
 * Integration-level tests for backend agent stream routing.
 * Covers edge cases and path/mode resolution.
 */
import { describe, expect, it } from 'vitest';
import { resolveAgentStreamRouting } from '../../../backend-ts/src/routes/agentStreamRouting';

describe('agent stream routing edge cases', () => {
  it('/run/execute resolves to execute mode', () => {
    const result = resolveAgentStreamRouting({
      path: '/run/execute',
      body: { prompt: 'implement the plan' },
    });
    expect(result.mode).toBe('execute');
    expect(result.intent).toBe('chat');
  });

  it('/run/fast resolves to fast mode', () => {
    const result = resolveAgentStreamRouting({
      path: '/run/fast',
      body: { prompt: 'fix the bug' },
    });
    expect(result.mode).toBe('fast');
    expect(result.intent).toBe('chat');
  });

  it('handles null body gracefully', () => {
    const result = resolveAgentStreamRouting({
      path: '/stream',
      body: null,
    });
    expect(result.mode).toBe('fast');
    expect(result.intent).toBe('chat');
  });

  it('handles undefined body gracefully', () => {
    const result = resolveAgentStreamRouting({
      path: '/stream',
    });
    expect(result.mode).toBe('fast');
    expect(result.intent).toBe('chat');
  });

  it('long prompt without explicit projectCreation stays as chat', () => {
    const result = resolveAgentStreamRouting({
      path: '/stream',
      body: {
        projectCreation: false,
        prompt: 'a'.repeat(3000),
      },
    });
    expect(result.intent).toBe('chat');
  });

  it('explicit projectCreation=true on /run/plan still uses project_creation intent', () => {
    const result = resolveAgentStreamRouting({
      path: '/run/plan',
      body: {
        projectCreation: true,
        prompt: 'create a React app',
      },
    });
    expect(result.mode).toBe('plan');
    expect(result.intent).toBe('project_creation');
  });
});
