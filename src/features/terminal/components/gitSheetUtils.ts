import type { GitBranch, GitCommit, GitStatus } from './views/gitHubViewUtils';

export const GIT_BRANCH_COLORS = ['#9B8AFF', '#F97316', '#22D3EE', '#F472B6', '#FBBF24', '#3FB950'];

export type GitChangeType = 'modified' | 'untracked' | 'deleted';

export interface GitChangeFile {
  file: string;
  type: GitChangeType;
}

export interface GitChangeTreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  changeType?: GitChangeType;
  children?: GitChangeTreeNode[];
}

export interface CommitFileEntry {
  status: string;
  file: string;
}

export interface CommitFileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  status?: string;
  children?: CommitFileTreeNode[];
}

export const formatGitCommitDate = (date: Date | string) => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return '';

  const day = dateObj.getDate();
  const month = dateObj.toLocaleDateString('en-US', { month: 'short' });
  const year = dateObj.getFullYear();
  const hours = dateObj.getHours().toString().padStart(2, '0');
  const mins = dateObj.getMinutes().toString().padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${mins}`;
};

export const buildChangedFiles = (gitStatus: GitStatus | null): GitChangeFile[] => {
  if (!gitStatus) return [];

  const seen = new Set<string>();
  const result: GitChangeFile[] = [];

  const pushIfMissing = (file: string, type: GitChangeType) => {
    if (seen.has(file)) return;
    seen.add(file);
    result.push({ file, type });
  };

  for (const file of gitStatus.deleted || []) pushIfMissing(file, 'deleted');
  for (const file of gitStatus.modified || []) pushIfMissing(file, 'modified');
  for (const file of gitStatus.staged || []) pushIfMissing(file, 'modified');
  for (const file of gitStatus.untracked || []) pushIfMissing(file, 'untracked');

  return result;
};

const sortTreeNodes = <T extends { name: string; type: 'file' | 'folder'; children?: T[] }>(nodes: T[]): T[] =>
  [...nodes]
    .sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'folder' ? -1 : 1;
    })
    .map((node) => ({
      ...node,
      children: node.children ? sortTreeNodes(node.children) : undefined,
    }));

export const buildGitChangeTree = (allChangedFiles: GitChangeFile[]): GitChangeTreeNode[] => {
  if (allChangedFiles.length === 0) return [];

  const root: GitChangeTreeNode[] = [];
  allChangedFiles.forEach(({ file, type }) => {
    const cleanFile = file.endsWith('/') ? file.slice(0, -1) : file;
    if (!cleanFile) return;

    const parts = cleanFile.split('/');
    let currentLevel = root;
    let currentPath = '';

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;
      let node = currentLevel.find((candidate) => candidate.name === part);
      if (!node) {
        node = {
          name: part,
          path: currentPath,
          type: isFile ? 'file' : 'folder',
          changeType: isFile ? type : undefined,
          children: isFile ? undefined : [],
        };
        currentLevel.push(node);
      }
      if (!isFile && node.children) currentLevel = node.children;
    });
  });

  return sortTreeNodes(root);
};

export const countGitChangeNodeFiles = (node: GitChangeTreeNode): number => {
  if (node.type === 'file') return 1;
  return (node.children || []).reduce((sum, child) => sum + countGitChangeNodeFiles(child), 0);
};

export const buildCommitFileTree = (commitFiles: CommitFileEntry[]): CommitFileTreeNode[] => {
  if (commitFiles.length === 0) return [];

  const root: CommitFileTreeNode[] = [];

  commitFiles.forEach((commitFile) => {
    const parts = commitFile.file.split('/');
    let level = root;
    let currentPath = '';

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;
      let node = level.find((candidate) => candidate.name === part);

      if (!node) {
        node = {
          name: part,
          path: currentPath,
          type: isFile ? 'file' : 'folder',
          status: isFile ? commitFile.status : undefined,
          children: isFile ? undefined : [],
        };
        level.push(node);
      }

      if (!isFile && node.children) level = node.children;
    });
  });

  return sortTreeNodes(root);
};

export const countCommitFileTreeFiles = (node: CommitFileTreeNode): number => {
  if (node.type === 'file') return 1;
  return (node.children || []).reduce((sum, child) => sum + countCommitFileTreeFiles(child), 0);
};

export const getBranchColorMap = (branches: GitBranch[]): Record<string, string> => {
  const map: Record<string, string> = {};
  const localBranches = branches.filter((branch) => !branch.name.startsWith('origin/'));
  const currentIndex = localBranches.findIndex((branch) => branch.isCurrent);

  if (currentIndex >= 0) {
    map[localBranches[currentIndex].name] = GIT_BRANCH_COLORS[0];
  }

  let colorIndex = 1;
  for (const branch of localBranches) {
    if (!map[branch.name]) {
      map[branch.name] = GIT_BRANCH_COLORS[colorIndex % GIT_BRANCH_COLORS.length];
      colorIndex++;
    }
  }

  return map;
};

export const getCommitTimelineColors = (
  displayCommits: GitCommit[],
  currentBranch: string,
  branchColorMap: Record<string, string>,
  commitBranchMap: Record<string, string[]>,
) => {
  const defaultColor = branchColorMap[currentBranch || 'main'] || GIT_BRANCH_COLORS[0];

  return displayCommits.map((commit) => {
    const hash = commit.shortHash || commit.hash?.substring(0, 7);
    const memberBranches = hash ? commitBranchMap[hash] : null;

    if (memberBranches && memberBranches.length > 0) {
      if (memberBranches.includes(currentBranch)) {
        return defaultColor;
      }
      return branchColorMap[memberBranches[0]] || GIT_BRANCH_COLORS[0];
    }

    return defaultColor;
  });
};
