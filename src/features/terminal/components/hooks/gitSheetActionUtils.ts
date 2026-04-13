import { useGitCacheStore } from '../../../../core/cache/gitCacheStore';
import { useFileCacheStore } from '../../../../core/cache/fileCacheStore';
import type { GitAccount } from '../../../../core/git/gitAccountService';
import type { WorkstationInfo } from '../../../../shared/types';

export const getGitAuthorInfo = (account: GitAccount) => ({
  authorName: account.displayName || account.username,
  authorEmail: account.email || `${account.username}@users.noreply.github.com`,
});

export const getGitExecutionContext = ({
  currentWorkstation,
  linkedAccount,
}: {
  currentWorkstation: WorkstationInfo | null;
  linkedAccount?: GitAccount | null;
}) => {
  if (!currentWorkstation?.id) {
    return null;
  }

  return {
    workstationId: currentWorkstation.id,
    linkedAccount: linkedAccount ?? null,
  };
};

export const refreshGitWorkspaceState = async ({
  workstationId,
  loadGitData,
  isLoadingRef,
  skipAutoFilterRef,
  setSelectedBranchFilter,
  setActiveSection,
  clearFileCache = false,
}: {
  workstationId: string;
  loadGitData: () => Promise<void>;
  isLoadingRef: React.MutableRefObject<boolean>;
  skipAutoFilterRef?: React.MutableRefObject<boolean>;
  setSelectedBranchFilter?: (value: string | null) => void;
  setActiveSection?: (value: 'commits' | 'branches' | 'changes') => void;
  clearFileCache?: boolean;
}) => {
  useGitCacheStore.getState().clearCache(workstationId);
  if (clearFileCache) {
    useFileCacheStore.getState().clearCache(workstationId);
  }
  if (skipAutoFilterRef) {
    skipAutoFilterRef.current = true;
  }
  if (setSelectedBranchFilter) {
    setSelectedBranchFilter(null);
  }
  if (setActiveSection) {
    setActiveSection('commits');
  }
  isLoadingRef.current = false;
  await loadGitData();
};
