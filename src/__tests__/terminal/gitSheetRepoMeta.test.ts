import { describe, expect, it } from 'vitest';
import { deriveGitSheetRepoMeta } from '../../features/terminal/components/hooks/gitSheetRepoMeta';

describe('deriveGitSheetRepoMeta', () => {
  it('extracts repo owner and name from git urls', () => {
    expect(deriveGitSheetRepoMeta('https://github.com/openai/demo.git', 'openai')).toEqual({
      repoName: 'demo',
      repoOwner: 'openai',
      isOwnRepo: true,
    });
  });

  it('falls back safely when repo url is missing', () => {
    expect(deriveGitSheetRepoMeta(undefined, undefined)).toEqual({
      repoName: 'Repository',
      repoOwner: '',
      isOwnRepo: false,
    });
  });
});
