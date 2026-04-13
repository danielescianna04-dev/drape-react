import { describe, expect, it } from 'vitest';
import { shouldShowHomeShell, shouldShowWorkspaceShell } from '../../app/appScreenVisibility';

describe('appScreenVisibility', () => {
  it('shows home shell for home and non-first create', () => {
    expect(shouldShowHomeShell('home', null, false)).toBe(true);
    expect(shouldShowHomeShell('create', null, false)).toBe(true);
    expect(shouldShowHomeShell('create', null, true)).toBe(false);
  });

  it('shows home shell when settings comes from home', () => {
    expect(shouldShowHomeShell('settings', 'home', false)).toBe(true);
    expect(shouldShowHomeShell('settings', 'terminal', false)).toBe(false);
  });

  it('shows workspace shell for terminal and overlays coming from terminal', () => {
    expect(shouldShowWorkspaceShell('terminal', null)).toBe(true);
    expect(shouldShowWorkspaceShell('settings', 'terminal')).toBe(true);
    expect(shouldShowWorkspaceShell('plans', 'terminal')).toBe(true);
    expect(shouldShowWorkspaceShell('plans', 'home')).toBe(false);
  });
});

