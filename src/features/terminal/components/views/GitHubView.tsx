import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, Animated as RNAnimated, ActivityIndicator, RefreshControl } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppColors } from '../../../../shared/theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { gitAccountService, GitAccount, GIT_PROVIDERS } from '../../../../core/git/gitAccountService';
import { useWorkstationStore } from '../../../../core/terminal/workstationStore';
import { workstationService } from '../../../../core/workstation/workstationService';
import { config } from '../../../../config/config';
import { getAuthHeaders } from '../../../../core/api/getAuthToken';
import { AddGitAccountModal } from '../../../settings/components/AddGitAccountModal';
import { githubService } from '../../../../core/github/githubService';
import { tracciaAzioneGit, tracciaCommitCreato, tracciaCambioBranch, tracciaTabGitCambiato, tracciaCronologiaCommit, tracciaAccountGitCollegato, tracciaAccountGitScollegato, tracciaAccountGitRimosso, tracciaErrore, tracciaPullEffettuato, tracciaErrorePull, tracciaErrorePush, tracciaErroreCommit } from '../../../../core/services/analyticsService';
import {
  getDefaultGitBranches,
  getRepoInfoFromUrl,
  mapBackendCommit,
  mapGitHubCommit,
  type GitBranch,
  type GitCommit,
  type GitStatus,
} from './gitHubViewUtils';
import {
  GitAccountPickerModal,
  GitBranchesSection,
  GitChangesSection,
  GitCommitsSection,
  GitHeaderSection,
} from './gitHubViewSections';

// Tab bar height constant
const TAB_BAR_HEIGHT = 44;

interface Props {
  tab: any;
}

export const GitHubView = ({ tab }: Props) => {
  const { t, i18n } = useTranslation(['terminal', 'common']);
  const [activeSection, setActiveSection] = useState<'commits' | 'branches' | 'changes'>('commits');
  const [gitAccounts, setGitAccounts] = useState<GitAccount[]>([]);
  const [linkedAccount, setLinkedAccount] = useState<GitAccount | null>(null);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'checking' | 'write' | 'read' | 'none' | null>(null);

  // Git data states
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [currentBranch, setCurrentBranch] = useState<string>('main');
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [gitLoading, setGitLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState('');

  const shimmerAnim = useRef(new RNAnimated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const currentWorkstation = useWorkstationStore((state) => state.currentWorkstation);
  const userId = useWorkstationStore.getState().userId || 'anonymous';

  useEffect(() => {
    loadAccountInfo();
    loadGitData();

    const shimmerLoop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(shimmerAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        RNAnimated.timing(shimmerAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    );
    shimmerLoop.start();
    return () => shimmerLoop.stop();
  }, [currentWorkstation?.id]);

  const loadAccountInfo = async () => {
    try {
      // Use getAllAccounts to include Firebase accounts (cross-device sync)
      const accounts = await gitAccountService.getAllAccounts(userId);
      setGitAccounts(accounts);

      // Check if there's a linked account for this repo
      const repoUrl = currentWorkstation?.repositoryUrl || currentWorkstation?.githubUrl;
      if (repoUrl) {
        // First check if project has a linked GitHub account username
        const linkedUsername = currentWorkstation?.githubAccountUsername;
        if (linkedUsername) {
          const linked = accounts.find(a => a.username === linkedUsername);
          if (linked) {
            setLinkedAccount(linked);
            checkAccountPermissions(linked, repoUrl);
          }
        } else {
          // Try to auto-detect from token service
          const tokenResult = await gitAccountService.getTokenForRepo(userId, repoUrl);
          if (tokenResult) {
            const linked = accounts.find(a => a.username === tokenResult.account.username);
            if (linked) {
              setLinkedAccount(linked);
              checkAccountPermissions(linked, repoUrl);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading account info:', error);
    } finally {
      setLoading(false);
    }
  };

  // Check if account has write permissions on repo
  const checkAccountPermissions = async (account: GitAccount, repoUrl: string) => {
    setPermissionStatus('checking');
    try {
      const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        setPermissionStatus('none');
        return;
      }
      const owner = match[1];
      const repo = match[2].replace('.git', '');

      const token = await gitAccountService.getToken(account, userId);
      if (!token) {
        setPermissionStatus('none');
        return;
      }

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Check permissions
        if (data.permissions?.push || data.permissions?.admin) {
          setPermissionStatus('write');
        } else {
          setPermissionStatus('read');
        }
      } else if (response.status === 404) {
        setPermissionStatus('none');
      } else {
        setPermissionStatus('read');
      }
    } catch (error) {
      console.error('Error checking permissions:', error);
      setPermissionStatus('none');
    }
  };

  // Link an account to this repo
  const handleLinkAccount = async (account: GitAccount) => {
    tracciaAccountGitCollegato(account.provider);
    setLinkedAccount(account);
    setShowAccountPicker(false);

    // Save to project
    if (currentWorkstation?.projectId || currentWorkstation?.id) {
      try {
        await workstationService.updateProjectGitHubAccount(
          currentWorkstation.projectId || currentWorkstation.id,
          account.username
        );
      } catch (error) {
        console.error('Error saving linked account:', error);
      }
    }

    // Check permissions
    const repoUrl = currentWorkstation?.repositoryUrl || currentWorkstation?.githubUrl;
    if (repoUrl) {
      checkAccountPermissions(account, repoUrl);
    }

    // Reload git data with new account
    loadGitData();
  };

  // Unlink account from repo
  const handleUnlinkAccount = async () => {
    tracciaAccountGitScollegato(linkedAccount?.provider || 'unknown');
    setLinkedAccount(null);
    setPermissionStatus(null);

    if (currentWorkstation?.projectId || currentWorkstation?.id) {
      try {
        await workstationService.removeProjectGitHubAccount(
          currentWorkstation.projectId || currentWorkstation.id
        );
      } catch (error) {
        console.error('Error removing linked account:', error);
      }
    }
  };

  const loadGitData = async () => {
    if (!currentWorkstation?.id) return;

    setGitLoading(true);
    try {
      // Get local git data from backend (fast!)
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${config.apiUrl}/git/status/${currentWorkstation.id}`, {
        headers: authHeaders,
      });
      const data = await response.json();

      // Set local data immediately
      if (data.success) {
        setIsGitRepo(true);
        setBranches(data.branches || [{ name: data.currentBranch || 'main', isCurrent: true, isRemote: false }]);
        setGitStatus(data.changes || null);
        setCurrentBranch(data.currentBranch || 'main');

        // Set local commits (backend now returns full format)
        if (data.commits && data.commits.length > 0) {
          const localCommits: GitCommit[] = data.commits.map((commit: any) => mapBackendCommit(commit));
          setCommits(localCommits);
        }

        // Done loading! Show data immediately
        setGitLoading(false);

        // Optionally enhance with GitHub API in background (non-blocking)
        const repoUrl = currentWorkstation.repositoryUrl || currentWorkstation.githubUrl;
        if (repoUrl && repoUrl.includes('github.com')) {
          // Run in background - don't await
          (async () => {
            try {
              const tokenResult = await gitAccountService.getTokenForRepo(userId, repoUrl);
              const token = tokenResult?.token;
              const githubCommits = await githubService.fetchCommits(repoUrl, token, 1, 30);

              // Transform and update commits with GitHub data (avatars, URLs)
              const transformedCommits: GitCommit[] = githubCommits.map((commit, index) =>
                mapGitHubCommit(commit, index, data.currentBranch || 'main')
              );

              setCommits(transformedCommits);
            } catch (githubError) {
              // Silently fail - we already have local data
            }
          })();
        }
      } else {
        setGitLoading(false);
      }
    } catch (error) {
      console.error('[GitHubView] Error loading git data:', error);
      setIsGitRepo(true);
      setCommits([]);
      setBranches(getDefaultGitBranches());
      setGitLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadGitData();
    await loadAccountInfo();
    setRefreshing(false);
  }, [currentWorkstation?.id]);

  const handleGitAction = async (action: 'pull' | 'push' | 'fetch') => {
    tracciaAzioneGit(action);
    if (!currentWorkstation?.id) {
      Alert.alert(t('common:error'), t('terminal:git.noActiveWorkspace'));
      return;
    }

    // Get token for this repo (auto-detect provider from URL)
    const repoUrl = currentWorkstation.githubUrl || '';
    const tokenData = await gitAccountService.getTokenForRepo(userId, repoUrl);

    if (!tokenData) {
      Alert.alert(t('common:error'), t('terminal:git.authRequiredForAction', { action: t(`terminal:git.${action}`) }));
      return;
    }

    setActionLoading(action);
    try {
      const actionAuthHeaders = await getAuthHeaders();
      const response = await fetch(`${config.apiUrl}/git/${action}/${currentWorkstation.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...actionAuthHeaders,
          'X-Git-Token': tokenData.token || '',
        },
      });

      const result = await response.json();
      if (result.success) {
        if (action === 'pull') tracciaPullEffettuato();
        Alert.alert(t('common:success'), t('terminal:git.actionCompleted', { action: t(`terminal:git.${action}`) }));
        await loadGitData();
      } else {
        const errMsg = result.message || t('terminal:git.actionError', { action: t(`terminal:git.${action}`) });
        if (action === 'pull') tracciaErrorePull(errMsg);
        if (action === 'push') tracciaErrorePush(errMsg);
        Alert.alert(t('common:error'), errMsg);
      }
    } catch (error) {
      console.error(`Git ${action} error:`, error);
      if (action === 'pull') tracciaErrorePull('Network error');
      if (action === 'push') tracciaErrorePush('Network error');
      Alert.alert(t('common:error'), t('terminal:git.unableToExecute', { action: t(`terminal:git.${action}`) }));
    } finally {
      setActionLoading(null);
    }
  };

  // Handle commit
  const handleCommit = async () => {
    if (!currentWorkstation?.id) {
      Alert.alert(t('common:error'), t('terminal:git.noActiveWorkspace'));
      return;
    }

    if (!commitMessage.trim()) {
      Alert.alert(t('common:error'), t('terminal:git.enterCommitMessage'));
      return;
    }

    tracciaCommitCreato();
    setActionLoading('commit');
    try {
      const commitAuthHeaders = await getAuthHeaders();
      const response = await fetch(`${config.apiUrl}/git/commit/${currentWorkstation.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...commitAuthHeaders,
        },
        body: JSON.stringify({ message: commitMessage.trim() }),
      });

      const result = await response.json();
      if (result.success) {
        Alert.alert(t('common:success'), t('terminal:git.commitSuccess'));
        setCommitMessage('');
        await loadGitData();
      } else {
        Alert.alert(t('common:error'), result.message || t('terminal:git.commitError'));
      }
    } catch (error) {
      console.error('Git commit error:', error);
      tracciaErroreCommit('Commit failed');
      Alert.alert(t('common:error'), t('terminal:git.unableToCommit'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteAccount = (account: GitAccount) => {
    Alert.alert(
      t('terminal:git.removeAccount'),
      t('terminal:git.removeAccountConfirm', { account: account.username }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('common:remove'),
          style: 'destructive',
          onPress: async () => {
            tracciaAccountGitRimosso(account.provider);
            await gitAccountService.deleteAccount(account, userId);
            loadAccountInfo();
          },
        },
      ]
    );
  };

  const getProviderConfig = (provider: string) => {
    return GIT_PROVIDERS.find(p => p.id === provider);
  };

  const formatDate = (date: Date) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return t('terminal:chat.justNow');
    if (hours < 24) return t('terminal:chat.hoursAgo', { count: hours });
    if (days < 7) return t('terminal:chat.daysAgo', { count: days });
    return d.toLocaleDateString(i18n.language?.startsWith('it') ? 'it-IT' : 'en-US', { day: 'numeric', month: 'short' });
  };

  const projectName = currentWorkstation?.name || t('common:project');
  const repoUrl = currentWorkstation?.repositoryUrl || currentWorkstation?.githubUrl;
  const repoInfo = getRepoInfoFromUrl(repoUrl);

  // Handle opening commit in browser
  const handleOpenCommit = (url?: string) => {
    if (url) {
      tracciaCronologiaCommit();
      WebBrowser.openBrowserAsync(url);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + TAB_BAR_HEIGHT }]}>
      <GitHeaderSection
        projectName={projectName}
        repoInfo={repoInfo}
        linkedAccount={linkedAccount}
        permissionStatus={permissionStatus}
        currentBranch={currentBranch}
        actionLoading={actionLoading}
        activeSection={activeSection}
        styles={styles}
        labels={{
          commits: t('common:commits'),
          branches: t('terminal:git.branch'),
          changes: t('terminal:git.changes'),
          linkAccount: t('terminal:git.linkAccount'),
        }}
        onOpenAccountPicker={() => setShowAccountPicker(true)}
        onAction={handleGitAction}
        onChangeSection={(section) => {
          setActiveSection(section);
          tracciaTabGitCambiato(section);
        }}
      />

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={AppColors.primary}
          />
        }
      >
        {activeSection === 'commits' && (
          <GitCommitsSection
            styles={styles}
            commits={commits}
            gitLoading={gitLoading}
            loadingLabel={t('terminal:git.loadingCommits')}
            emptyLabel={t('terminal:git.noCommitsFound')}
            sectionTitle={t('terminal:git.recentCommits', { count: commits.length })}
            formatDate={formatDate}
            onOpenCommit={handleOpenCommit}
          />
        )}
        {activeSection === 'branches' && (
          <GitBranchesSection
            styles={styles}
            branches={branches}
            localLabel={`${t('terminal:git.branch')} Local`}
            remoteLabel={`${t('terminal:git.branch')} Remote`}
          />
        )}
        {activeSection === 'changes' && (
          <GitChangesSection
            styles={styles}
            gitStatus={gitStatus}
            commitMessage={commitMessage}
            actionLoading={actionLoading}
            labels={{
              createCommit: t('terminal:git.createCommit'),
              placeholder: t('terminal:git.commitMessagePlaceholder'),
              commit: t('terminal:git.commit'),
              staged: t('terminal:git.staged'),
              modified: t('terminal:git.modified'),
              untracked: t('terminal:git.untracked'),
              noChanges: t('terminal:git.noChanges'),
              status: t('terminal:git.status'),
              noData: t('common:noData', { defaultValue: 'No data available' }),
            }}
            onCommitMessageChange={setCommitMessage}
            onCommit={handleCommit}
          />
        )}
      </ScrollView>

      {showAccountPicker && (
        <GitAccountPickerModal
          styles={styles}
          title={t('terminal:git.selectAccount')}
          addAccountLabel={t('terminal:git.addAccount')}
          removeAccountLabel={t('terminal:git.removeAccount')}
          linkedAccount={linkedAccount}
          gitAccounts={gitAccounts}
          getProviderConfig={getProviderConfig as any}
          onClose={() => setShowAccountPicker(false)}
          onUnlink={handleUnlinkAccount}
          onLinkAccount={handleLinkAccount}
          onAddAccount={() => {
            setShowAccountPicker(false);
            setShowAddAccountModal(true);
            tracciaAccountGitCollegato('picker');
          }}
        />
      )}

      <AddGitAccountModal
        visible={showAddAccountModal}
        onClose={() => setShowAddAccountModal(false)}
        onAccountAdded={loadAccountInfo}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0f',
  },
  // Compact Header
  compactHeader: {
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerInner: {
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  repoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  repoTextContainer: {
    flex: 1,
  },
  repoName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  repoPath: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    fontFamily: 'monospace',
    marginTop: 1,
  },
  // Account Selector
  accountSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    maxWidth: 160,
  },
  accountAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  accountAvatarPlaceholder: {
    backgroundColor: 'rgba(139, 124, 246, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#fff',
    maxWidth: 80,
  },
  accountPlaceholder: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  permBadgeWrite: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 208, 132, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  permBadgeRead: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  // Actions Row
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  branchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
    borderRadius: 6,
  },
  branchText: {
    fontSize: 11,
    fontWeight: '600',
    color: AppColors.primary,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pushBtn: {
    backgroundColor: `${AppColors.primary}30`,
  },
  actionBtnLoading: {
    opacity: 0.6,
  },
  // Tabs Row
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  tabItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  tabItemActive: {
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
  },
  tabTextActive: {
    color: AppColors.primary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 20,
  },
  // Account Picker Modal
  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  pickerCard: {
    width: '85%',
    maxHeight: '60%',
    borderRadius: 16,
  },
  pickerInner: {
    backgroundColor: 'rgba(26, 26, 28, 0.4)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  pickerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  pickerList: {
    maxHeight: 300,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  pickerItemSelected: {
    backgroundColor: 'rgba(139, 124, 246, 0.1)',
  },
  pickerItemAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerItemInfo: {
    flex: 1,
  },
  pickerItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  pickerItemProvider: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 1,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  // Loading
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  emptySubtext: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
  },
  // Commit row (Fork-style)
  commitRow: {
    marginBottom: 4,
    borderRadius: 10,
    marginHorizontal: -4,
  },
  commitRowInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    paddingRight: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingHorizontal: 4,
  },
  graphColumn: {
    width: 28,
    alignItems: 'center',
    marginRight: 4,
  },
  graphLine: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(139, 124, 246, 0.3)',
  },
  graphLineFirst: {
    backgroundColor: 'transparent',
  },
  graphDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(139, 124, 246, 0.5)',
    borderWidth: 2,
    borderColor: '#0d0d0f',
  },
  graphDotHead: {
    backgroundColor: AppColors.primary,
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  commitAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
    marginTop: 2,
  },
  commitAvatarPlaceholder: {
    backgroundColor: 'rgba(139, 124, 246, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commitAvatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  commitInfo: {
    flex: 1,
    paddingVertical: 2,
  },
  commitHeader: {
    marginBottom: 4,
  },
  commitMessage: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
    lineHeight: 18,
  },
  commitBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  headBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(0, 208, 132, 0.2)',
    borderRadius: 4,
  },
  headBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#00D084',
  },
  branchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
    borderRadius: 4,
  },
  branchBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: AppColors.primary,
  },
  commitMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  commitHash: {
    fontSize: 11,
    fontWeight: '600',
    color: AppColors.primary,
    fontFamily: 'monospace',
  },
  commitAuthor: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
  commitDate: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
  },
  // Branch row
  branchRow: {
    borderRadius: 8,
    marginBottom: 6,
  },
  branchRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  branchRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  branchRowName: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  branchRowNameActive: {
    color: '#fff',
    fontWeight: '600',
  },
  branchRowStats: {
    flexDirection: 'row',
    gap: 6,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  statBadgeTextGreen: {
    fontSize: 11,
    fontWeight: '600',
    color: '#00D084',
  },
  statBadgeTextRed: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  // Commit section
  commitSection: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  commitInputContainer: {
    gap: 10,
  },
  // File row
  fileRow: {
    borderRadius: 8,
    marginBottom: 6,
  },
  fileRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: 10,
  },
  fileStatusBadge: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 208, 132, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileStatusModified: {
    backgroundColor: 'rgba(255, 165, 0, 0.2)',
  },
  fileStatusUntracked: {
    backgroundColor: 'rgba(100, 100, 100, 0.3)',
  },
  fileStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  fileName: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontFamily: 'monospace',
  },
  // Account section
  accountsList: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  accountCard: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  accountCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: {
    flex: 1,
  },
  accountNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  accountCardName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  providerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  providerBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  accountEmail: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  unlinkBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,77,77,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noAccountCard: {
    alignItems: 'center',
    padding: 28,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderStyle: 'dashed',
    gap: 8,
  },
  noAccountText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  noAccountSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    lineHeight: 18,
  },
  addAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
  },
  addAccountBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: AppColors.primary,
  },
});
