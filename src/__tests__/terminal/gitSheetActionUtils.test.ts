import { describe, expect, it } from 'vitest';
import { getGitExecutionContext } from '../../features/terminal/components/hooks/gitSheetActionUtils';

describe('getGitExecutionContext', () => {
  it('returns null when there is no active workstation', () => {
    expect(getGitExecutionContext({
      currentWorkstation: null,
      linkedAccount: null,
    })).toBeNull();
  });

  it('returns the workstation id and linked account when available', () => {
    const result = getGitExecutionContext({
      currentWorkstation: {
        id: 'ws-1',
        name: 'Repo',
        language: 'ts',
        status: 'ready',
        createdAt: new Date(),
        files: [],
      },
      linkedAccount: {
        id: 'acc-1',
        provider: 'github',
        username: 'daniele',
        displayName: 'Daniele',
        email: 'daniele@example.com',
        avatarUrl: 'https://example.com/avatar.png',
        addedAt: new Date(),
      },
    });

    expect(result).toMatchObject({
      workstationId: 'ws-1',
    });
    expect(result?.linkedAccount?.id).toBe('acc-1');
  });
});
