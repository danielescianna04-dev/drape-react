import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, Animated, ActivityIndicator, RefreshControl, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../../shared/theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { gitAccountService, GitAccount, GIT_PROVIDERS } from '../../../../core/git/gitAccountService';
import { useTerminalStore } from '../../../../core/terminal/terminalStore';
import { workstationService } from '../../../../core/workstation/workstationService-firebase';
import { config } from '../../../../config/config';
import { AddGitAccountModal } from '../../../settings/components/AddGitAccountModal';
import { githubService, GitHubCommit } from '../../../../core/github/githubService';

// Tab bar height constant
const TAB_BAR_HEIGHT = 44;

interface Props {
  tab: any;
}

interface GitCommit {
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
}

interface GitBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  tracking?: string;
  ahead?: number;
  behind?: number;
}

interface GitStatus {
  staged: string[];
  modified: string[];
  untracked: string[];
  deleted: string[];
}

export const GitHubView = ({ tab }: Props) => {
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

  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const currentWorkstation = useTerminalStore((state) => state.currentWorkstation);
  const userId = useTerminalStore.getState().userId || 'anonymous';

  useEffect(() => {
    loadAccountInfo();
    loadGitData();

    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
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
            const linked = accounts.find(a => a.username === tokenResult.username);
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

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
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
      // First try to get local git data from backend
      const response = await fetch(`${config.apiUrl}/git/status/${currentWorkstation.id}`);
      const data = await response.json();

      if (data.isGitRepo) {
        setIsGitRepo(true);
        setBranches(data.branches || []);
        setGitStatus(data.status || null);
        setCurrentBranch(data.currentBranch || 'main');
      }

      // Also fetch commits from GitHub API if we have a repository URL
      const repoUrl = currentWorkstation.repositoryUrl || currentWorkstation.githubUrl;
      if (repoUrl && repoUrl.includes('github.com')) {
        try {
          // Get token for this repo
          const tokenResult = await gitAccountService.getTokenForRepo(userId, repoUrl);
          const token = tokenResult?.token;

          // Fetch commits from GitHub
          const githubCommits = await githubService.fetchCommits(repoUrl, token, 1, 50);

          // Transform to our GitCommit format
          const transformedCommits: GitCommit[] = githubCommits.map((c, index) => ({
            hash: c.sha,
            shortHash: c.sha.substring(0, 7),
            message: c.message,
            author: c.author.name,
            authorEmail: c.author.email,
            authorAvatar: c.author.avatar_url,
            authorLogin: c.author.login,
            date: c.author.date,
            isHead: index === 0,
            branch: index === 0 ? currentBranch : undefined,
            url: c.url,
          }));

          setCommits(transformedCommits);
          setIsGitRepo(true);
        } catch (githubError) {
          console.error('Error fetching GitHub commits:', githubError);
          // Use local commits if GitHub fails
          if (data.commits) {
            setCommits(data.commits);
          }
        }
      } else if (data.commits) {
        setCommits(data.commits);
      }
    } catch (error) {
      console.error('Error loading git data:', error);
      // If endpoint doesn't exist, try GitHub API directly
      const repoUrl = currentWorkstation?.repositoryUrl || currentWorkstation?.githubUrl;
      if (repoUrl && repoUrl.includes('github.com')) {
        try {
          const tokenResult = await gitAccountService.getTokenForRepo(userId, repoUrl);
          const token = tokenResult?.token;
          const githubCommits = await githubService.fetchCommits(repoUrl, token, 1, 50);

          const transformedCommits: GitCommit[] = githubCommits.map((c, index) => ({
            hash: c.sha,
            shortHash: c.sha.substring(0, 7),
            message: c.message,
            author: c.author.name,
            authorEmail: c.author.email,
            authorAvatar: c.author.avatar_url,
            authorLogin: c.author.login,
            date: c.author.date,
            isHead: index === 0,
            branch: index === 0 ? 'main' : undefined,
            url: c.url,
          }));

          setCommits(transformedCommits);
          setIsGitRepo(true);
          setBranches([{ name: 'main', isCurrent: true, isRemote: false, ahead: 0, behind: 0 }]);
        } catch (githubError) {
          console.error('Error fetching GitHub commits:', githubError);
          setIsGitRepo(true);
          setCommits([]);
        }
      } else {
        setIsGitRepo(true);
        setCommits([]);
        setBranches([{ name: 'main', isCurrent: true, isRemote: false, ahead: 0, behind: 0 }]);
      }
    } finally {
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
    if (!currentWorkstation?.id) {
      Alert.alert('Errore', 'Nessun progetto aperto');
      return;
    }

    // Get token for this repo (auto-detect provider from URL)
    const repoUrl = currentWorkstation.githubUrl || '';
    const tokenData = await gitAccountService.getTokenForRepo(userId, repoUrl);

    if (!tokenData) {
      Alert.alert('Errore', 'Collega un account Git per eseguire questa azione');
      return;
    }

    setActionLoading(action);
    try {
      const response = await fetch(`${config.apiUrl}/git/${action}/${currentWorkstation.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenData.token}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        Alert.alert('Successo', `${action.charAt(0).toUpperCase() + action.slice(1)} completato`);
        await loadGitData();
      } else {
        Alert.alert('Errore', result.message || `Errore durante ${action}`);
      }
    } catch (error) {
      console.error(`Git ${action} error:`, error);
      Alert.alert('Errore', `Impossibile eseguire ${action}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteAccount = (account: GitAccount) => {
    Alert.alert(
      'Rimuovi Account',
      `Sei sicuro di voler rimuovere l'account ${account.username}?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Rimuovi',
          style: 'destructive',
          onPress: async () => {
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

    if (hours < 1) return 'Adesso';
    if (hours < 24) return `${hours}h fa`;
    if (days < 7) return `${days}g fa`;
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  };

  const projectName = currentWorkstation?.name || 'Progetto';
  const repoUrl = currentWorkstation?.repositoryUrl || currentWorkstation?.githubUrl;

  // Get repo info from URL
  const getRepoInfo = () => {
    if (!repoUrl) return null;
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (match) {
      return { owner: match[1], repo: match[2].replace('.git', '') };
    }
    return null;
  };

  const repoInfo = getRepoInfo();

  // Compact header with account selector
  const renderHeader = () => (
    <View style={styles.compactHeader}>
      <View style={styles.headerRow}>
        <View style={styles.repoInfo}>
          <Ionicons name="git-branch" size={18} color={AppColors.primary} />
          <View style={styles.repoTextContainer}>
            <Text style={styles.repoName} numberOfLines={1}>{projectName}</Text>
            {repoInfo && (
              <Text style={styles.repoPath} numberOfLines={1}>{repoInfo.owner}/{repoInfo.repo}</Text>
            )}
          </View>
        </View>

        {/* Account Selector */}
        <TouchableOpacity
          style={styles.accountSelector}
          onPress={() => setShowAccountPicker(true)}
        >
          {linkedAccount ? (
            <>
              {linkedAccount.avatarUrl ? (
                <Image source={{ uri: linkedAccount.avatarUrl }} style={styles.accountAvatar} />
              ) : (
                <View style={[styles.accountAvatar, styles.accountAvatarPlaceholder]}>
                  <Ionicons name="person" size={12} color="#fff" />
                </View>
              )}
              <Text style={styles.accountName} numberOfLines={1}>{linkedAccount.username}</Text>
              {permissionStatus === 'checking' ? (
                <ActivityIndicator size="small" color={AppColors.primary} style={{ marginLeft: 4 }} />
              ) : permissionStatus === 'write' ? (
                <View style={styles.permBadgeWrite}>
                  <Ionicons name="checkmark" size={10} color="#00D084" />
                </View>
              ) : permissionStatus === 'read' ? (
                <View style={styles.permBadgeRead}>
                  <Ionicons name="eye" size={10} color="#f59e0b" />
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Ionicons name="person-add-outline" size={14} color="rgba(255,255,255,0.5)" />
              <Text style={styles.accountPlaceholder}>Collega account</Text>
            </>
          )}
          <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>
      </View>

      {/* Branch and Actions Row */}
      <View style={styles.actionsRow}>
        <View style={styles.branchPill}>
          <Ionicons name="git-branch" size={12} color={AppColors.primary} />
          <Text style={styles.branchText}>{currentBranch}</Text>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionBtn, actionLoading === 'fetch' && styles.actionBtnLoading]}
            onPress={() => handleGitAction('fetch')}
            disabled={!!actionLoading || !linkedAccount}
          >
            {actionLoading === 'fetch' ? (
              <ActivityIndicator size="small" color={AppColors.primary} />
            ) : (
              <Ionicons name="cloud-download-outline" size={14} color={linkedAccount ? '#fff' : 'rgba(255,255,255,0.3)'} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, actionLoading === 'pull' && styles.actionBtnLoading]}
            onPress={() => handleGitAction('pull')}
            disabled={!!actionLoading || !linkedAccount}
          >
            {actionLoading === 'pull' ? (
              <ActivityIndicator size="small" color={AppColors.primary} />
            ) : (
              <Ionicons name="arrow-down" size={14} color={linkedAccount ? '#fff' : 'rgba(255,255,255,0.3)'} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.pushBtn, actionLoading === 'push' && styles.actionBtnLoading]}
            onPress={() => handleGitAction('push')}
            disabled={!!actionLoading || !linkedAccount || permissionStatus !== 'write'}
          >
            {actionLoading === 'push' ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="arrow-up" size={14} color={linkedAccount && permissionStatus === 'write' ? '#fff' : 'rgba(255,255,255,0.3)'} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs - inline */}
      <View style={styles.tabsRow}>
        {[
          { key: 'commits', label: 'Commits' },
          { key: 'branches', label: 'Branch' },
          { key: 'changes', label: 'Changes' },
        ].map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[styles.tabItem, activeSection === item.key && styles.tabItemActive]}
            onPress={() => setActiveSection(item.key as any)}
          >
            <Text style={[styles.tabText, activeSection === item.key && styles.tabTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // Account picker modal
  const renderAccountPicker = () => (
    <View style={styles.pickerOverlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowAccountPicker(false)} />
      <View style={styles.pickerCard}>
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerTitle}>Seleziona Account</Text>
          <TouchableOpacity onPress={() => setShowAccountPicker(false)}>
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.pickerList}>
          {linkedAccount && (
            <TouchableOpacity
              style={styles.pickerItem}
              onPress={handleUnlinkAccount}
            >
              <View style={[styles.pickerItemAvatar, { backgroundColor: 'rgba(255,77,77,0.1)' }]}>
                <Ionicons name="unlink" size={16} color="#ff4d4d" />
              </View>
              <Text style={[styles.pickerItemText, { color: '#ff4d4d' }]}>Scollega account</Text>
            </TouchableOpacity>
          )}

          {gitAccounts.map((account) => {
            const providerConfig = getProviderConfig(account.provider);
            const isLinked = linkedAccount?.id === account.id;
            return (
              <TouchableOpacity
                key={account.id}
                style={[styles.pickerItem, isLinked && styles.pickerItemSelected]}
                onPress={() => handleLinkAccount(account)}
              >
                {account.avatarUrl ? (
                  <Image source={{ uri: account.avatarUrl }} style={styles.pickerItemAvatar} />
                ) : (
                  <View style={[styles.pickerItemAvatar, { backgroundColor: providerConfig?.color || '#333' }]}>
                    <Ionicons name={providerConfig?.icon as any || 'person'} size={16} color="#fff" />
                  </View>
                )}
                <View style={styles.pickerItemInfo}>
                  <Text style={styles.pickerItemText}>{account.username}</Text>
                  <Text style={styles.pickerItemProvider}>{providerConfig?.name || account.provider}</Text>
                </View>
                {isLinked && (
                  <Ionicons name="checkmark-circle" size={18} color={AppColors.primary} />
                )}
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => {
              setShowAccountPicker(false);
              setShowAddAccountModal(true);
            }}
          >
            <View style={[styles.pickerItemAvatar, { backgroundColor: `${AppColors.primary}20` }]}>
              <Ionicons name="add" size={16} color={AppColors.primary} />
            </View>
            <Text style={[styles.pickerItemText, { color: AppColors.primary }]}>Aggiungi nuovo account</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );

  // Handle opening commit in browser
  const handleOpenCommit = (url?: string) => {
    if (url) {
      Linking.openURL(url);
    }
  };

  // Commits list (Fork-style with avatars)
  const renderCommits = () => (
    <View style={styles.section}>
      {gitLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={AppColors.primary} />
          <Text style={styles.loadingText}>Caricamento commits...</Text>
        </View>
      ) : commits.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="git-commit" size={48} color="rgba(255,255,255,0.2)" />
          <Text style={styles.emptyText}>Nessun commit trovato</Text>
        </View>
      ) : (
        <>
          <Text style={styles.sectionTitle}>{commits.length} commit</Text>
          {commits.map((commit, index) => (
            <TouchableOpacity
              key={commit.hash}
              style={styles.commitRow}
              activeOpacity={0.7}
              onPress={() => handleOpenCommit(commit.url)}
            >
              {/* Graph line */}
              <View style={styles.graphColumn}>
                <View style={[styles.graphLine, index === 0 && styles.graphLineFirst]} />
                <View style={[styles.graphDot, commit.isHead && styles.graphDotHead]} />
                {index < commits.length - 1 && <View style={styles.graphLine} />}
              </View>

              {/* Avatar */}
              {commit.authorAvatar ? (
                <Image source={{ uri: commit.authorAvatar }} style={styles.commitAvatar} />
              ) : (
                <View style={[styles.commitAvatar, styles.commitAvatarPlaceholder]}>
                  <Text style={styles.commitAvatarText}>
                    {commit.author.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}

              {/* Commit info */}
              <View style={styles.commitInfo}>
                <View style={styles.commitHeader}>
                  <Text style={styles.commitMessage} numberOfLines={2}>{commit.message.split('\n')[0]}</Text>
                </View>
                <View style={styles.commitMeta}>
                  <Text style={styles.commitHash}>{commit.shortHash}</Text>
                  <Text style={styles.commitAuthor}>{commit.authorLogin || commit.author}</Text>
                  <Text style={styles.commitDate}>{formatDate(commit.date)}</Text>
                </View>
                {/* Badges row */}
                <View style={styles.commitBadges}>
                  {commit.isHead && (
                    <View style={styles.headBadge}>
                      <Text style={styles.headBadgeText}>HEAD</Text>
                    </View>
                  )}
                  {commit.branch && (
                    <View style={styles.branchBadge}>
                      <Ionicons name="git-branch" size={10} color={AppColors.primary} />
                      <Text style={styles.branchBadgeText}>{commit.branch}</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Open icon */}
              {commit.url && (
                <Ionicons name="open-outline" size={14} color="rgba(255,255,255,0.2)" style={{ marginLeft: 8 }} />
              )}
            </TouchableOpacity>
          ))}
        </>
      )}
    </View>
  );

  // Branches list
  const renderBranches = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Local Branches</Text>
      {branches.filter(b => !b.isRemote).map((branch) => (
        <TouchableOpacity key={branch.name} style={styles.branchRow}>
          <View style={styles.branchRowLeft}>
            <Ionicons
              name={branch.isCurrent ? 'radio-button-on' : 'radio-button-off'}
              size={16}
              color={branch.isCurrent ? AppColors.primary : 'rgba(255,255,255,0.4)'}
            />
            <Text style={[styles.branchRowName, branch.isCurrent && styles.branchRowNameActive]}>
              {branch.name}
            </Text>
          </View>
          {(branch.ahead !== undefined || branch.behind !== undefined) && (
            <View style={styles.branchRowStats}>
              {branch.ahead !== undefined && branch.ahead > 0 && (
                <View style={styles.statBadge}>
                  <Ionicons name="arrow-up" size={10} color="#00D084" />
                  <Text style={styles.statBadgeTextGreen}>{branch.ahead}</Text>
                </View>
              )}
              {branch.behind !== undefined && branch.behind > 0 && (
                <View style={styles.statBadge}>
                  <Ionicons name="arrow-down" size={10} color="#FF6B6B" />
                  <Text style={styles.statBadgeTextRed}>{branch.behind}</Text>
                </View>
              )}
            </View>
          )}
        </TouchableOpacity>
      ))}

      {branches.some(b => b.isRemote) && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Remote Branches</Text>
          {branches.filter(b => b.isRemote).map((branch) => (
            <TouchableOpacity key={branch.name} style={styles.branchRow}>
              <View style={styles.branchRowLeft}>
                <Ionicons name="cloud-outline" size={16} color="rgba(255,255,255,0.4)" />
                <Text style={styles.branchRowName}>{branch.name}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}
    </View>
  );

  // Changes (staged/unstaged)
  const renderChanges = () => (
    <View style={styles.section}>
      {gitStatus ? (
        <>
          {gitStatus.staged.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Staged Changes ({gitStatus.staged.length})</Text>
              {gitStatus.staged.map((file) => (
                <View key={file} style={styles.fileRow}>
                  <View style={styles.fileStatusBadge}>
                    <Text style={styles.fileStatusText}>S</Text>
                  </View>
                  <Text style={styles.fileName} numberOfLines={1}>{file}</Text>
                </View>
              ))}
            </>
          )}

          {gitStatus.modified.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, gitStatus.staged.length > 0 && { marginTop: 20 }]}>
                Modified ({gitStatus.modified.length})
              </Text>
              {gitStatus.modified.map((file) => (
                <View key={file} style={styles.fileRow}>
                  <View style={[styles.fileStatusBadge, styles.fileStatusModified]}>
                    <Text style={styles.fileStatusText}>M</Text>
                  </View>
                  <Text style={styles.fileName} numberOfLines={1}>{file}</Text>
                </View>
              ))}
            </>
          )}

          {gitStatus.untracked.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
                Untracked ({gitStatus.untracked.length})
              </Text>
              {gitStatus.untracked.map((file) => (
                <View key={file} style={styles.fileRow}>
                  <View style={[styles.fileStatusBadge, styles.fileStatusUntracked]}>
                    <Text style={styles.fileStatusText}>?</Text>
                  </View>
                  <Text style={styles.fileName} numberOfLines={1}>{file}</Text>
                </View>
              ))}
            </>
          )}

          {gitStatus.staged.length === 0 && gitStatus.modified.length === 0 && gitStatus.untracked.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle" size={48} color="#00D084" />
              <Text style={styles.emptyText}>Working tree clean</Text>
              <Text style={styles.emptySubtext}>Nessuna modifica da committare</Text>
            </View>
          )}
        </>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={48} color="rgba(255,255,255,0.2)" />
          <Text style={styles.emptyText}>Nessun dato disponibile</Text>
        </View>
      )}
    </View>
  );

  // Account section - Global accounts (multi-provider like Fork)
  const renderAccount = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Account Git Collegati</Text>

      <View style={styles.accountsList}>
        {gitAccounts.length === 0 ? (
          <View style={styles.noAccountCard}>
            <Ionicons name="git-network-outline" size={40} color="rgba(255,255,255,0.2)" />
            <Text style={styles.noAccountText}>Nessun account collegato</Text>
            <Text style={styles.noAccountSubtext}>
              Collega un account per push, pull e accesso ai repository privati
            </Text>
          </View>
        ) : (
          gitAccounts.map((account) => {
            const providerConfig = getProviderConfig(account.provider);
            return (
              <View key={account.id} style={styles.accountCard}>
                <View style={styles.accountCardInner}>
                  {account.avatarUrl ? (
                    <Image source={{ uri: account.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: providerConfig?.color || '#333' }]}>
                      <Ionicons name={providerConfig?.icon as any || 'person'} size={20} color="#fff" />
                    </View>
                  )}
                  <View style={styles.accountInfo}>
                    <View style={styles.accountNameRow}>
                      <Text style={styles.accountName}>{account.username}</Text>
                      <View style={[styles.providerBadge, { backgroundColor: `${providerConfig?.color}20` }]}>
                        <Ionicons
                          name={providerConfig?.icon as any || 'git-branch'}
                          size={10}
                          color={providerConfig?.color || '#fff'}
                        />
                        <Text style={[styles.providerBadgeText, { color: providerConfig?.color }]}>
                          {providerConfig?.name || account.provider}
                        </Text>
                      </View>
                    </View>
                    {account.email && (
                      <Text style={styles.accountEmail}>{account.email}</Text>
                    )}
                  </View>
                  <TouchableOpacity style={styles.unlinkBtn} onPress={() => handleDeleteAccount(account)}>
                    <Ionicons name="trash-outline" size={18} color="#ff4d4d" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        {/* Add Account Button */}
        <TouchableOpacity
          style={styles.addAccountBtn}
          onPress={() => setShowAddAccountModal(true)}
        >
          <Ionicons name="add-circle-outline" size={20} color={AppColors.primary} />
          <Text style={styles.addAccountBtnText}>Aggiungi Account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );


  return (
    <View style={[styles.container, { paddingTop: insets.top + TAB_BAR_HEIGHT }]}>
      {/* Compact Header */}
      {renderHeader()}

      {/* Content */}
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
        {activeSection === 'commits' && renderCommits()}
        {activeSection === 'branches' && renderBranches()}
        {activeSection === 'changes' && renderChanges()}
      </ScrollView>

      {/* Account Picker Modal */}
      {showAccountPicker && renderAccountPicker()}

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
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
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
    backgroundColor: '#1a1a1c',
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
    paddingVertical: 8,
    paddingRight: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 10,
    marginHorizontal: -4,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    marginBottom: 6,
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
  // File row
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    marginBottom: 6,
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
  accountName: {
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
  accountMeta: {
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
  // Account picker
  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  pickerCard: {
    width: '100%',
    maxHeight: '60%',
    backgroundColor: '#1a1a1c',
    borderRadius: 16,
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  pickerList: {
    maxHeight: 280,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  pickerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  pickerItemText: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
  },
});
