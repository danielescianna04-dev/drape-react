import { describe, expect, it } from 'vitest';
import { getGitActionBlockReason, isValidGitBranchName } from '../../features/terminal/components/hooks/gitSheetActionGuards';

describe('gitSheetActionGuards', () => {
  it('validates branch names', () => {
    expect(isValidGitBranchName('feature/test')).toBe(true);
    expect(isValidGitBranchName('bad name')).toBe(false);
    expect(isValidGitBranchName('..oops')).toBe(false);
    expect(isValidGitBranchName('-broken')).toBe(false);
  });

  it('returns the right block reason for git actions', () => {
    expect(getGitActionBlockReason({
      action: 'push',
      hasWorkstation: false,
      gitAccounts: [],
      linkedAccount: null,
      isDetachedHead: false,
      isOwnRepo: true,
    })).toBe('no-workstation');

    expect(getGitActionBlockReason({
      action: 'push',
      hasWorkstation: true,
      gitAccounts: [{} as any],
      linkedAccount: {} as any,
      isDetachedHead: true,
      isOwnRepo: true,
    })).toBe('detached-head');

    expect(getGitActionBlockReason({
      action: 'push',
      hasWorkstation: true,
      gitAccounts: [{} as any],
      linkedAccount: {} as any,
      isDetachedHead: false,
      isOwnRepo: false,
    })).toBe('not-own-repo');
  });
});
