import { useState, useRef } from 'react';
import { Alert } from 'react-native';
import { Animated as RNAnimated } from 'react-native';
import { gitAccountService, GitAccount } from '../../../../core/git/gitAccountService';
import { useGitCacheStore } from '../../../../core/cache/gitCacheStore';
import { useFileCacheStore } from '../../../../core/cache/fileCacheStore';
import { config } from '../../../../config/config';
import { getAuthHeaders } from '../../../../core/api/getAuthToken';
import {
  tracciaAzioneGit,
  tracciaCommitCreato,
  tracciaCambioBranch,
  tracciaBranchCreato,
  tracciaPushEffettuato,
  tracciaErrore,
  tracciaPullEffettuato,
  tracciaErrorePull,
  tracciaErrorePush,
  tracciaErroreCommit,
  tracciaErroreCambioBranch,
  tracciaErroreCreazioneBranch,
} from '../../../../core/services/analyticsService';
import type { GitBranch, GitCommit } from '../views/gitHubViewUtils';
import type { GitChangeFile } from '../gitSheetUtils';
import type { WorkstationInfo } from '../../../../shared/types';

interface UseGitSheetActionsParams {
  currentWorkstation: WorkstationInfo | null;
  userId: string;
  linkedAccount: GitAccount | null;
  gitAccounts: GitAccount[];
  currentBranch: string;
  branches: GitBranch[];
  isDetachedHead: boolean;
  allChangedFiles: GitChangeFile[];
  isOwnRepo: boolean;
  repoOwner: string;
  repoName: string;
  isLoadingRef: React.MutableRefObject<boolean>;
  skipAutoFilterRef: React.MutableRefObject<boolean>;
  previousBranchRef: React.MutableRefObject<string>;
  loadGitData: (passedAccounts?: GitAccount[], overrideRepoUrl?: string) => Promise<void>;
  fetchDiff: (file: string) => Promise<void>;
  setSelectedBranchFilter: (v: string | null) => void;
  setShowAddAccountModal: (v: boolean) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function useGitSheetActions({
  currentWorkstation,
  userId,
  linkedAccount,
  gitAccounts,
  currentBranch,
  branches,
  isDetachedHead,
  allChangedFiles,
  isOwnRepo,
  repoOwner,
  repoName,
  isLoadingRef,
  skipAutoFilterRef,
  previousBranchRef,
  loadGitData,
  fetchDiff,
  setSelectedBranchFilter,
  setShowAddAccountModal,
  t,
}: UseGitSheetActionsParams) {
  // Action modal state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showPushModal, setShowPushModal] = useState(false);
  const [pushDestBranch, setPushDestBranch] = useState<string>('');
  const [pushDestPickerOpen, setPushDestPickerOpen] = useState(false);
  const [showPullModal, setShowPullModal] = useState(false);
  const [pullBranch, setPullBranch] = useState<string>('');
  const [pullRemote, setPullRemote] = useState<string>('origin');
  const [pullRebase, setPullRebase] = useState(false);
  const [pullStash, setPullStash] = useState(false);
  const [pullBranchPickerOpen, setPullBranchPickerOpen] = useState(false);
  const [pullIntoBranch, setPullIntoBranch] = useState<string>('');
  const [pullIntoPickerOpen, setPullIntoPickerOpen] = useState(false);

  // File selection + commit composer state
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [commitMessage, setCommitMessage] = useState('');
  const [commitDescription, setCommitDescription] = useState('');
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [showCreateBranch, setShowCreateBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  // Commit context menu state
  const [commitContextMenu, setCommitContextMenu] = useState<{ hash: string; shortHash: string; message: string } | null>(null);
  const [newBranchFromCommit, setNewBranchFromCommit] = useState<string | null>(null);
  const [branchFromName, setBranchFromName] = useState('');

  // Commit files modal state
  const [commitFilesModal, setCommitFilesModal] = useState<{ hash: string; shortHash: string; message: string } | null>(null);
  const [commitCollapsedFolders, setCommitCollapsedFolders] = useState<Set<string>>(new Set());
  const [expandedCommitFile, setExpandedCommitFile] = useState<string | null>(null);
  const [expandedCommitDiff, setExpandedCommitDiff] = useState<string | null>(null);
  const [expandedCommitDiffLoading, setExpandedCommitDiffLoading] = useState(false);

  // File context menu + change folders
  const [fileContextMenu, setFileContextMenu] = useState<{
    y: number;
    file: string;
    type: 'modified' | 'untracked' | 'deleted';
  } | null>(null);
  const [expandedChangeFolders, setExpandedChangeFolders] = useState<Set<string>>(new Set());

  // Connect / account modals
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  // Active section for tab switching after actions
  const [activeSection, setActiveSection] = useState<'commits' | 'branches' | 'changes'>('commits');

  // ─── Utility functions ────────────────────────────────────────────────

  const isValidBranchName = (name: string): boolean => {
    if (!name) return false;
    if (/[\s~^:?*\[\\]/.test(name)) return false;
    if (name.includes('..')) return false;
    if (name.startsWith('.') || name.startsWith('/') || name.endsWith('.') || name.endsWith('/') || name.endsWith('.lock')) return false;
    if (name.includes('//')) return false;
    if (name.startsWith('-')) return false;
    return true;
  };

  const formatDate = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return '';

    const now = new Date();
    const diffMs = now.getTime() - dateObj.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  };

  const toggleFileSelection = (file: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(file)) {
        newSet.delete(file);
      } else {
        newSet.add(file);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedFiles.size === allChangedFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(allChangedFiles.map(f => f.file)));
    }
  };

  // ─── Git action handlers ──────────────────────────────────────────────

  const handleGitAction = async (action: 'pull' | 'push' | 'fetch') => {
    tracciaAzioneGit(action);
    if (!currentWorkstation?.id) {
      Alert.alert(t('common:error'), t('terminal:git.noActiveWorkspace'));
      return;
    }

    if (gitAccounts.length === 0) {
      Alert.alert(
        t('terminal:git.authRequired'),
        t('terminal:git.authRequiredForAction', { action }),
        [
          { text: t('common:cancel'), style: 'cancel' },
          { text: t('terminal:git.linkAccount'), onPress: () => setShowAddAccountModal(true) },
        ]
      );
      return;
    }

    if (!linkedAccount) {
      Alert.alert(t('common:error'), t('terminal:git.selectAccount'));
      return;
    }

    if ((action === 'push' || action === 'pull') && isDetachedHead) {
      Alert.alert(
        'Detached HEAD',
        'You are in detached HEAD state. Return to a branch before pushing or pulling.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (action === 'push' && !isOwnRepo) {
      Alert.alert(
        t('terminal:git.notYourRepo'),
        t('terminal:git.notYourRepoDesc', { owner: repoOwner, repo: repoName }) + '\n\n' + t('terminal:git.forkInstructions'),
        [{ text: t('common:ok') }]
      );
      return;
    }

    if (action === 'pull') {
      setPullBranch(currentBranch);
      setPullRemote('origin');
      setPullRebase(false);
      setPullStash(allChangedFiles.length > 0);
      setPullBranchPickerOpen(false);
      setPullIntoBranch(currentBranch);
      setPullIntoPickerOpen(false);
      setShowPullModal(true);
      return;
    }

    if (action === 'push') {
      setPushDestBranch(currentBranch);
      setPushDestPickerOpen(false);
      setShowPushModal(true);
      return;
    }

    await executeGitAction(action);
  };

  const executePush = async () => {
    setShowPushModal(false);
    setActionLoading('push');
    const branch = branches.find(b => b.isCurrent)?.name || currentBranch;
    const destBranch = pushDestBranch || branch;
    try {
      const token = await gitAccountService.getToken(linkedAccount!, userId);
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${config.apiUrl}/git/push/${currentWorkstation!.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
          'X-Git-Token': token || '',
        },
        body: JSON.stringify({
          branch,
          remoteBranch: destBranch,
          remote: 'origin',
          forcePush: false,
          pushTags: false,
          setUpstream: true,
        }),
      });
      const data = await response.json();
      if (data.success) {
        const output = (data.output || '').trim();
        const detail = output.includes('up-to-date')
          ? `${destBranch}: already up-to-date`
          : `${branch} → origin/${destBranch}`;
        Alert.alert(t('common:success'), detail);
        useGitCacheStore.getState().clearCache(currentWorkstation!.id);
        skipAutoFilterRef.current = true;
        setSelectedBranchFilter(null);
        setActiveSection('commits');
        isLoadingRef.current = false;
        await loadGitData();
      } else {
        tracciaErrorePush(data.output || data.error || 'Push failed');
        Alert.alert(t('common:error'), data.output || data.error || 'Push failed');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Push failed';
      tracciaErrorePush(msg);
      Alert.alert(t('common:error'), msg);
    } finally {
      setActionLoading(null);
    }
  };

  const executePull = async () => {
    setShowPullModal(false);
    setActionLoading('pull');
    try {
      const token = await gitAccountService.getToken(linkedAccount!, userId);
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${config.apiUrl}/git/pull/${currentWorkstation!.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
          'X-Git-Token': token || '',
        },
        body: JSON.stringify({
          branch: pullBranch,
          remote: pullRemote,
          intoBranch: pullIntoBranch || currentBranch,
          rebase: pullRebase,
          stashAndReapply: pullStash,
        }),
      });
      const data = await response.json();
      if (data.success) {
        tracciaPullEffettuato();
        Alert.alert(t('common:success'), 'Pull complete');
        useGitCacheStore.getState().clearCache(currentWorkstation!.id);
        useFileCacheStore.getState().clearCache(currentWorkstation!.id);
        skipAutoFilterRef.current = true;
        setSelectedBranchFilter(null);
        setActiveSection('commits');
        isLoadingRef.current = false;
        await loadGitData();
      } else {
        tracciaErrorePull(data.output || data.error || 'Pull failed');
        Alert.alert(t('common:error'), data.output || data.error || 'Pull failed');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Pull failed';
      tracciaErrorePull(msg);
      Alert.alert(t('common:error'), msg);
    } finally {
      setActionLoading(null);
    }
  };

  const executeGitAction = async (action: 'pull' | 'push' | 'fetch') => {
    setActionLoading(action);
    try {
      const token = await gitAccountService.getToken(linkedAccount!, userId);
      const authHeaders = await getAuthHeaders();

      const response = await fetch(`${config.apiUrl}/git/${action}/${currentWorkstation!.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
          'X-Git-Token': token || '',
        },
      });

      const data = await response.json();
      if (response.ok && data.success) {
        if (action === 'pull') tracciaPullEffettuato();
        Alert.alert(t('common:success'), t('terminal:git.actionCompleted', { action: action.charAt(0).toUpperCase() + action.slice(1) }));
        isLoadingRef.current = false;
        await loadGitData();
      } else {
        const errMsg = data.error || data.output || data.message || t('terminal:git.actionError', { action });
        if (action === 'pull') tracciaErrorePull(errMsg);
        if (action === 'push') tracciaErrorePush(errMsg);
        Alert.alert(t('common:error'), errMsg);
      }
    } catch (error) {
      if (action === 'pull') tracciaErrorePull('Network error');
      if (action === 'push') tracciaErrorePush('Network error');
      Alert.alert(t('common:error'), t('terminal:git.unableToExecute', { action }));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCheckoutBranch = async (branchName: string) => {
    if (!currentWorkstation?.id) return;
    tracciaCambioBranch(branchName);
    setActionLoading('checkout');
    let didStash = false;
    try {
      const authHeaders = await getAuthHeaders();
      const token = linkedAccount ? await gitAccountService.getToken(linkedAccount, userId) : '';
      if (allChangedFiles.length > 0) {
        const stashRes = await fetch(`${config.apiUrl}/git/stash/${currentWorkstation.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders, 'X-Git-Token': token || '' },
          body: JSON.stringify({ action: 'push', message: `Auto-stash before checkout ${branchName}` }),
        });
        didStash = stashRes.ok;
      }

      const response = await fetch(`${config.apiUrl}/git/checkout/${currentWorkstation.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders, 'X-Git-Token': token || '' },
        body: JSON.stringify({ branch: branchName }),
      });

      if (response.ok) {
        if (didStash) {
          await fetch(`${config.apiUrl}/git/stash/${currentWorkstation.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders, 'X-Git-Token': token || '' },
            body: JSON.stringify({ action: 'pop' }),
          });
        }
        Alert.alert(t('common:success'), t('terminal:git.branchSwitched'));

        useGitCacheStore.getState().clearCache(currentWorkstation.id);
        useFileCacheStore.getState().clearCache(currentWorkstation.id);
        isLoadingRef.current = false;
        await loadGitData();
      } else {
        if (didStash) {
          await fetch(`${config.apiUrl}/git/stash/${currentWorkstation.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders, 'X-Git-Token': token || '' },
            body: JSON.stringify({ action: 'pop' }),
          });
        }
        const error = await response.json();
        Alert.alert(t('common:error'), error.message || t('terminal:git.actionError', { action: 'checkout' }));
      }
    } catch (error) {
      if (didStash) {
        const authHeaders2 = await getAuthHeaders().catch(() => ({}));
        await fetch(`${config.apiUrl}/git/stash/${currentWorkstation.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders2 },
          body: JSON.stringify({ action: 'pop' }),
        }).catch(() => {});
      }
      tracciaErroreCambioBranch(branchName, 'Checkout failed');
      Alert.alert(t('common:error'), t('terminal:git.unableToExecute', { action: 'checkout' }));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateBranch = async () => {
    const name = newBranchName.trim();
    if (!name || !currentWorkstation?.id) return;

    if (!isValidBranchName(name)) {
      Alert.alert(t('common:error'), 'Invalid branch name. Avoid spaces, special characters (~^:?*[\\), and sequences like "..".');
      return;
    }

    setActionLoading('createBranch');
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${config.apiUrl}/git/checkout/${currentWorkstation.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ branch: name, create: true }),
      });

      if (response.ok) {
        tracciaBranchCreato(name);
        Alert.alert(t('common:success'), t('terminal:git.branchCreated'));
        setNewBranchName('');
        setShowCreateBranch(false);
        useGitCacheStore.getState().clearCache(currentWorkstation.id);
        isLoadingRef.current = false;
        await loadGitData();
      } else {
        const error = await response.json();
        Alert.alert(t('common:error'), error.message || t('terminal:git.actionError', { action: 'create branch' }));
      }
    } catch (error) {
      tracciaErroreCreazioneBranch(name, 'Branch creation failed');
      Alert.alert(t('common:error'), t('terminal:git.unableToExecute', { action: 'create branch' }));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCommit = async (): Promise<boolean> => {
    if (!currentWorkstation?.id || !linkedAccount) {
      Alert.alert(t('common:error'), t('terminal:git.authRequiredForCommit'));
      return false;
    }

    if (selectedFiles.size === 0) {
      Alert.alert(t('common:error'), t('terminal:git.selectAtLeastOneFile'));
      return false;
    }

    if (!commitMessage.trim()) {
      Alert.alert(t('common:error'), t('terminal:git.enterCommitMessage'));
      return false;
    }

    tracciaCommitCreato();
    setActionLoading('commit');
    try {
      const token = await gitAccountService.getToken(linkedAccount, userId);
      const authHeaders = await getAuthHeaders();

      const response = await fetch(`${config.apiUrl}/git/commit/${currentWorkstation.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
          'X-Git-Token': token || '',
        },
        body: JSON.stringify({
          files: Array.from(selectedFiles),
          message: commitDescription.trim()
            ? `${commitMessage.trim()}\n\n${commitDescription.trim()}`
            : commitMessage.trim(),
          authorName: linkedAccount.displayName || linkedAccount.username,
          authorEmail: linkedAccount.email || `${linkedAccount.username}@users.noreply.github.com`,
        }),
      });

      const result = await response.json();
      if (response.ok && result.success) {
        Alert.alert(t('common:success'), t('terminal:git.commitSuccess'));
        setCommitMessage('');
        setCommitDescription('');
        setSelectedFiles(new Set());
        isLoadingRef.current = false;
        await loadGitData();
        return true;
      } else {
        Alert.alert(t('common:error'), result.error || result.output || t('terminal:git.commitError'));
        return false;
      }
    } catch (error) {
      tracciaErroreCommit('Commit failed');
      Alert.alert(t('common:error'), t('terminal:git.unableToCommit'));
      return false;
    } finally {
      setActionLoading(null);
    }
  };

  const handleCommitAndPush = async () => {
    if (commitMessage.trim() && selectedFiles.size > 0) {
      if (!currentWorkstation?.id || !linkedAccount) {
        Alert.alert(t('common:error'), t('terminal:git.authRequiredForCommit'));
        return;
      }
      setActionLoading('commit');
      try {
        const token = await gitAccountService.getToken(linkedAccount, userId);
        const authHeaders = await getAuthHeaders();
        const response = await fetch(`${config.apiUrl}/git/commit/${currentWorkstation.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders, 'X-Git-Token': token || '' },
          body: JSON.stringify({
            files: Array.from(selectedFiles),
            message: commitDescription.trim()
              ? `${commitMessage.trim()}\n\n${commitDescription.trim()}`
              : commitMessage.trim(),
            authorName: linkedAccount.displayName || linkedAccount.username,
            authorEmail: linkedAccount.email || `${linkedAccount.username}@users.noreply.github.com`,
          }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          Alert.alert(t('common:error'), result.error || result.output || t('terminal:git.commitError'));
          setActionLoading(null);
          return;
        }
        setCommitMessage('');
        setCommitDescription('');
        setSelectedFiles(new Set());
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Commit failed';
        tracciaErroreCommit(msg);
        Alert.alert(t('common:error'), msg || t('terminal:git.commitError'));
        setActionLoading(null);
        return;
      } finally {
        setActionLoading(null);
      }
    }
    setShowCommitModal(false);
    tracciaPushEffettuato();
    handleGitAction('push');
  };

  const handleRevertCommit = async (hash: string) => {
    if (!currentWorkstation?.id || !linkedAccount) return;
    setActionLoading('revert');
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${config.apiUrl}/git/revert/${currentWorkstation.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          hash,
          authorName: linkedAccount.displayName || linkedAccount.username,
          authorEmail: linkedAccount.email || `${linkedAccount.username}@users.noreply.github.com`,
        }),
      });
      const result = await response.json();
      if (result.success) {
        Alert.alert('Success', 'Commit reverted');
        isLoadingRef.current = false;
        await loadGitData();
      } else {
        Alert.alert('Error', result.error || result.output || 'Revert failed');
      }
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Revert failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCherryPick = async (hash: string) => {
    if (!currentWorkstation?.id || !linkedAccount) return;
    setActionLoading('cherry-pick');
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${config.apiUrl}/git/cherry-pick/${currentWorkstation.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          hash,
          authorName: linkedAccount.displayName || linkedAccount.username,
          authorEmail: linkedAccount.email || `${linkedAccount.username}@users.noreply.github.com`,
        }),
      });
      const result = await response.json();
      if (result.success) {
        Alert.alert('Success', 'Cherry-pick applied');
        isLoadingRef.current = false;
        await loadGitData();
      } else {
        Alert.alert('Error', result.error || result.output || 'Cherry-pick failed');
      }
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Cherry-pick failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBranchFromCommit = async (hash: string, branchName: string) => {
    if (!currentWorkstation?.id) return;
    if (!isValidBranchName(branchName)) {
      Alert.alert(t('common:error'), 'Invalid branch name. Avoid spaces, special characters (~^:?*[\\), and sequences like "..".');
      return;
    }
    setActionLoading('branch-from');
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${config.apiUrl}/git/branch-from/${currentWorkstation.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ hash, branchName }),
      });
      const result = await response.json();
      if (result.success) {
        Alert.alert('Success', `Branch '${branchName}' created`);
        setNewBranchFromCommit(null);
        setBranchFromName('');
        isLoadingRef.current = false;
        await loadGitData();
      } else {
        Alert.alert('Error', result.error || result.output || 'Branch creation failed');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Branch creation failed';
      tracciaErroreCreazioneBranch(branchName, msg);
      Alert.alert('Error', msg);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReturnToBranch = async () => {
    if (!currentWorkstation?.id) return;

    setActionLoading('checkout');
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${config.apiUrl}/git/checkout/${currentWorkstation.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ branch: previousBranchRef.current || currentBranch || 'main' }),
      });
      const result = await response.json();
      if (result.success) {
        useGitCacheStore.getState().clearCache(currentWorkstation.id);
        useFileCacheStore.getState().clearCache(currentWorkstation.id);
        isLoadingRef.current = false;
        await loadGitData();
      } else {
        Alert.alert('Error', result.output || 'Checkout failed');
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Checkout failed';
      tracciaErroreCambioBranch(previousBranchRef.current || currentBranch || 'main', msg);
      Alert.alert('Error', msg);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDiscard = (files: string[]) => {
    const isMultiple = files.length > 1;
    const title = isMultiple
      ? t('terminal:git.discardSelected')
      : t('terminal:git.discardChanges');
    const message = isMultiple
      ? t('terminal:git.discardSelectedConfirm', { count: files.length })
      : t('terminal:git.discardConfirm', { file: files[0] });

    Alert.alert(title, message, [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('common:discard'),
        style: 'destructive',
        onPress: async () => {
          setActionLoading('discard');
          try {
            const authHeaders = await getAuthHeaders();
            const res = await fetch(
              `${config.apiUrl}/git/discard/${currentWorkstation!.id}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({ files }),
              }
            );
            if (res.ok) {
              setSelectedFiles(prev => {
                const next = new Set(prev);
                files.forEach(f => next.delete(f));
                return next;
              });
              isLoadingRef.current = false;
              await loadGitData();
            } else {
              const errBody = await res.json().catch(() => null);
              const errMsg = errBody?.error || errBody?.message || `HTTP ${res.status}`;
              console.error('[GitSheet] Discard failed:', res.status, errBody);
              Alert.alert(t('common:error'), errMsg);
            }
          } catch (e: unknown) {
            console.error('[GitSheet] Discard error:', e);
            Alert.alert(t('common:error'), e instanceof Error ? e.message : t('terminal:git.discardError'));
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  const handleFileMenuAction = (action: 'viewDiff' | 'discard') => {
    if (!fileContextMenu) return;
    const { file } = fileContextMenu;
    setFileContextMenu(null);
    switch (action) {
      case 'viewDiff': fetchDiff(file); break;
      case 'discard': handleDiscard([file]); break;
    }
  };

  // ─── Reset function for when sheet closes ─────────────────────────────

  const resetActionState = () => {
    setCommitContextMenu(null);
    setNewBranchFromCommit(null);
    setBranchFromName('');
    setCommitFilesModal(null);
    setCommitCollapsedFolders(new Set());
    setFileContextMenu(null);
    setShowCommitModal(false);
    setShowAccountPicker(false);
    setExpandedCommitFile(null);
    setExpandedCommitDiff(null);
    setShowPushModal(false);
    setShowPullModal(false);
    setPullBranchPickerOpen(false);
    setShowCreateBranch(false);
    setNewBranchName('');
    setCommitMessage('');
    setCommitDescription('');
    setSelectedFiles(new Set());
    setExpandedChangeFolders(new Set());
  };

  return {
    // Action loading
    actionLoading,
    setActionLoading,

    // Push modal
    showPushModal,
    setShowPushModal,
    pushDestBranch,
    setPushDestBranch,
    pushDestPickerOpen,
    setPushDestPickerOpen,

    // Pull modal
    showPullModal,
    setShowPullModal,
    pullBranch,
    setPullBranch,
    pullRemote,
    setPullRemote,
    pullRebase,
    setPullRebase,
    pullStash,
    setPullStash,
    pullBranchPickerOpen,
    setPullBranchPickerOpen,
    pullIntoBranch,
    setPullIntoBranch,
    pullIntoPickerOpen,
    setPullIntoPickerOpen,

    // File selection + commit
    selectedFiles,
    setSelectedFiles,
    commitMessage,
    setCommitMessage,
    commitDescription,
    setCommitDescription,
    showCommitModal,
    setShowCommitModal,
    showCreateBranch,
    setShowCreateBranch,
    newBranchName,
    setNewBranchName,

    // Commit context menu
    commitContextMenu,
    setCommitContextMenu,
    newBranchFromCommit,
    setNewBranchFromCommit,
    branchFromName,
    setBranchFromName,

    // Commit files modal
    commitFilesModal,
    setCommitFilesModal,
    commitCollapsedFolders,
    setCommitCollapsedFolders,
    expandedCommitFile,
    setExpandedCommitFile,
    expandedCommitDiff,
    setExpandedCommitDiff,
    expandedCommitDiffLoading,
    setExpandedCommitDiffLoading,

    // File context menu + change folders
    fileContextMenu,
    setFileContextMenu,
    expandedChangeFolders,
    setExpandedChangeFolders,

    // Connect / account modals
    showConnectModal,
    setShowConnectModal,
    showAccountPicker,
    setShowAccountPicker,

    // Active section (for tab switching after actions)
    activeSection,
    setActiveSection,

    // Utility functions
    isValidBranchName,
    formatDate,
    toggleFileSelection,
    toggleSelectAll,

    // Action handlers
    handleGitAction,
    executePush,
    executePull,
    executeGitAction,
    handleCheckoutBranch,
    handleCreateBranch,
    handleCommit,
    handleCommitAndPush,
    handleRevertCommit,
    handleCherryPick,
    handleBranchFromCommit,
    handleReturnToBranch,
    handleDiscard,
    handleFileMenuAction,

    // Reset
    resetActionState,
  };
}
