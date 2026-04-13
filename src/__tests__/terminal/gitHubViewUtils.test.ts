import {
  getDefaultGitBranches,
  getRepoInfoFromUrl,
  mapBackendCommit,
  mapGitHubCommit,
} from '@/features/terminal/components/views/gitHubViewUtils';

describe('gitHubViewUtils', () => {
  it('extracts repo info from a GitHub URL', () => {
    expect(getRepoInfoFromUrl('https://github.com/openai/codex.git')).toEqual({
      owner: 'openai',
      repo: 'codex',
    });
  });

  it('maps backend commits into the view model', () => {
    const mapped = mapBackendCommit({
      hash: '1234567890',
      message: 'feat: add tests',
      author: 'Daniele',
      date: '2026-04-13T00:00:00.000Z',
    });

    expect(mapped.shortHash).toBe('1234567');
    expect(mapped.author).toBe('Daniele');
    expect(mapped.message).toBe('feat: add tests');
  });

  it('maps GitHub commits into the view model', () => {
    const mapped = mapGitHubCommit({
      sha: 'abcdef1234567890',
      message: 'fix: sync avatars',
      author: {
        name: 'OpenAI',
        email: 'dev@example.com',
        date: new Date('2026-04-13T00:00:00.000Z'),
        avatar_url: 'https://example.com/avatar.png',
        login: 'openai',
      },
      committer: {
        name: 'OpenAI',
        email: 'dev@example.com',
        date: new Date('2026-04-13T00:00:00.000Z'),
      },
      url: 'https://github.com/openai/codex/commit/abcdef1',
    }, 0, 'main');

    expect(mapped.shortHash).toBe('abcdef1');
    expect(mapped.isHead).toBe(true);
    expect(mapped.branch).toBe('main');
  });

  it('returns a stable default branch fallback', () => {
    expect(getDefaultGitBranches()).toEqual([
      { name: 'main', isCurrent: true, isRemote: false, ahead: 0, behind: 0 },
    ]);
  });
});
