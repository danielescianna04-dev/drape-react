import type { GitAccount } from '../../../../core/git/gitAccountService';

export const isValidGitBranchName = (name: string): boolean => {
  if (!name) return false;
  if (/[\s~^:?*\[\\]/.test(name)) return false;
  if (name.includes('..')) return false;
  if (name.startsWith('.') || name.startsWith('/') || name.endsWith('.') || name.endsWith('/') || name.endsWith('.lock')) return false;
  if (name.includes('//')) return false;
  if (name.startsWith('-')) return false;
  return true;
};

export const getGitActionBlockReason = ({
  action,
  hasWorkstation,
  gitAccounts,
  linkedAccount,
  isDetachedHead,
  isOwnRepo,
}: {
  action: 'pull' | 'push' | 'fetch';
  hasWorkstation: boolean;
  gitAccounts: GitAccount[];
  linkedAccount: GitAccount | null;
  isDetachedHead: boolean;
  isOwnRepo: boolean;
}) => {
  if (!hasWorkstation) return 'no-workstation' as const;
  if (gitAccounts.length === 0) return 'no-accounts' as const;
  if (!linkedAccount) return 'no-linked-account' as const;
  if ((action === 'push' || action === 'pull') && isDetachedHead) return 'detached-head' as const;
  if (action === 'push' && !isOwnRepo) return 'not-own-repo' as const;
  return null;
};
