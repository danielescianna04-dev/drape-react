import { describe, expect, it } from 'vitest';
import {
  buildGithubCommitRefMap,
  buildGitStatusFromBackend,
  mergeLocalAndRemoteBranches,
  parseGitHubRepoUrl,
} from '../../features/terminal/components/hooks/gitSheetDataUtils';

describe('gitSheetDataUtils', () => {
  it('parses GitHub repo URLs with or without .git suffix', () => {
    expect(parseGitHubRepoUrl('https://github.com/openai/example.git')).toEqual({
      owner: 'openai',
      repo: 'example',
    });
    expect(parseGitHubRepoUrl('https://github.com/openai/example')).toEqual({
      owner: 'openai',
      repo: 'example',
    });
  });

  it('returns null for non-github urls', () => {
    expect(parseGitHubRepoUrl('https://gitlab.com/openai/example')).toBeNull();
  });

  it('normalizes backend status payloads', () => {
    expect(buildGitStatusFromBackend({ modified: ['a.ts'] })).toEqual({
      staged: [],
      modified: ['a.ts'],
      untracked: [],
      deleted: [],
    });
  });

  it('keeps remote-only branches when merging local and remote state', () => {
    expect(mergeLocalAndRemoteBranches(
      [{ name: 'main', isCurrent: true, isRemote: false }],
      [
        { name: 'main', isCurrent: true, isRemote: true },
        { name: 'origin/feature', isCurrent: false, isRemote: true },
      ],
    )).toEqual([
      { name: 'main', isCurrent: true, isRemote: false },
      { name: 'origin/feature', isCurrent: false, isRemote: true },
    ]);
  });

  it('builds commit ref map from branches and tags', () => {
    expect(buildGithubCommitRefMap(
      [{ name: 'main', commit: { sha: 'abcdef1234' } }],
      [{ name: 'v1.0.0', sha: 'abcdef1fff' }],
    )).toEqual({
      abcdef1: { branches: ['main'], tags: ['v1.0.0'] },
    });
  });
});

