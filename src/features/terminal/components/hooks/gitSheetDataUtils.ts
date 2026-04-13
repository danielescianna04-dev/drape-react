import type { GitHubCommit } from '../../../../core/github/githubService';
import type { GitBranch, GitCommit, GitStatus } from '../views/gitHubViewUtils';

export const parseGitHubRepoUrl = (repoUrl?: string | null) => {
  if (!repoUrl || !repoUrl.includes('github.com')) return null;
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/) || repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;

  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/, ''),
  };
};

export const buildGitStatusFromBackend = (changes?: Partial<GitStatus> | null): GitStatus | null => {
  if (!changes) return null;
  return {
    staged: changes.staged || [],
    modified: changes.modified || [],
    untracked: changes.untracked || [],
    deleted: changes.deleted || [],
  };
};

export const mergeLocalAndRemoteBranches = (
  localBranches: GitBranch[],
  existingBranches: GitBranch[],
) => {
  const localNames = new Set(localBranches.map((branch) => branch.name));
  const remoteOnly = existingBranches.filter((branch) => branch.isRemote && !localNames.has(branch.name));
  return [...localBranches, ...remoteOnly];
};

export const buildGithubCommitRefMap = (
  branchesData?: Array<{ name: string; commit?: { sha?: string } }>,
  tagsData?: Array<{ name: string; sha?: string }>,
) => {
  const refsMap: Record<string, { branches: string[]; tags: string[] }> = {};

  for (const branch of branchesData || []) {
    const sha7 = branch.commit?.sha?.substring(0, 7);
    if (!sha7) continue;
    if (!refsMap[sha7]) refsMap[sha7] = { branches: [], tags: [] };
    refsMap[sha7].branches.push(branch.name);
  }

  for (const tag of tagsData || []) {
    const tagSha7 = tag.sha?.substring(0, 7);
    if (!tagSha7) continue;
    if (!refsMap[tagSha7]) refsMap[tagSha7] = { branches: [], tags: [] };
    refsMap[tagSha7].tags.push(tag.name);
  }

  return refsMap;
};

export const buildGithubCommits = (
  commitsData: GitHubCommit[],
  currentBranch: string,
  refsMap: Record<string, { branches: string[]; tags: string[] }>,
): GitCommit[] => (
  commitsData.map((commit, index) => {
    const shortHash = commit.sha.substring(0, 7);
    const refs = refsMap[shortHash];
    return {
      hash: commit.sha,
      shortHash,
      message: commit.message.split('\n')[0],
      author: commit.author.name,
      authorEmail: commit.author.email,
      authorAvatar: commit.author.avatar_url,
      authorLogin: commit.author.login,
      date: new Date(commit.author.date),
      isHead: index === 0,
      branch: index === 0 ? currentBranch : undefined,
      url: commit.url,
      branches: refs?.branches,
      tags: refs?.tags,
    };
  })
);

