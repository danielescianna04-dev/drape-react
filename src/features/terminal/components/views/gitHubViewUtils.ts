import type { GitHubCommit } from '../../../../core/github/githubService';

export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  authorEmail: string;
  authorAvatar?: string;
  authorLogin?: string;
  date: Date;
  isHead: boolean;
  branch?: string;
  url?: string;
  branches?: string[];
  tags?: string[];
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  tracking?: string;
  ahead?: number;
  behind?: number;
}

export interface GitStatus {
  staged: string[];
  modified: string[];
  untracked: string[];
  deleted: string[];
}

export interface GitRepoInfo {
  owner: string;
  repo: string;
}

type BackendCommitLike = {
  hash: string;
  shortHash?: string;
  message: string;
  author?: string;
  authorEmail?: string;
  authorAvatar?: string;
  authorLogin?: string;
  date?: string | Date;
  isHead?: boolean;
  branch?: string;
  url?: string;
};

export const mapBackendCommit = (commit: BackendCommitLike): GitCommit => ({
  hash: commit.hash,
  shortHash: commit.shortHash || commit.hash?.substring(0, 7),
  message: commit.message,
  author: commit.author || 'Unknown',
  authorEmail: commit.authorEmail || '',
  authorAvatar: commit.authorAvatar,
  authorLogin: commit.authorLogin,
  date: commit.date ? new Date(commit.date) : new Date(),
  isHead: commit.isHead || false,
  branch: commit.branch,
  url: commit.url,
});

export const mapGitHubCommit = (
  commit: GitHubCommit,
  index: number,
  currentBranch: string,
): GitCommit => ({
  hash: commit.sha,
  shortHash: commit.sha.substring(0, 7),
  message: commit.message,
  author: commit.author.name,
  authorEmail: commit.author.email,
  authorAvatar: commit.author.avatar_url,
  authorLogin: commit.author.login,
  date: commit.author.date,
  isHead: index === 0,
  branch: index === 0 ? currentBranch : undefined,
  url: commit.url,
});

export const getRepoInfoFromUrl = (repoUrl?: string | null): GitRepoInfo | null => {
  if (!repoUrl) return null;
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) return null;

  return {
    owner: match[1],
    repo: match[2].replace('.git', ''),
  };
};

export const getDefaultGitBranches = (): GitBranch[] => ([
  { name: 'main', isCurrent: true, isRemote: false, ahead: 0, behind: 0 },
]);
