import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, Animated as RNAnimated, ActivityIndicator, RefreshControl, Linking, Dimensions, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { gitAccountService, GitAccount, GIT_PROVIDERS } from '../../../core/git/gitAccountService';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { workstationService } from '../../../core/workstation/workstationService-firebase';
import { config } from '../../../config/config';
import { AddGitAccountModal } from '../../settings/components/AddGitAccountModal';
import { githubService, GitHubCommit } from '../../../core/github/githubService';
import { useTabStore } from '../../../core/tabs/tabStore';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.65;

interface Props {
  visible: boolean;
  onClose: () => void;
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

export const GitSheet = ({ visible, onClose }: Props) => {
  const [activeSection, setActiveSection] = useState<'commits' | 'branches' | 'changes'>('commits');
  const [gitAccounts, setGitAccounts] = useState<GitAccount[]>([]);
  const [linkedAccount, setLinkedAccount] = useState<GitAccount | null>(null);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Git data states
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [currentBranch, setCurrentBranch] = useState<string>('main');
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [gitLoading, setGitLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const shimmerAnim = useRef(new RNAnimated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const { addTab, setActiveTab, tabs } = useTabStore();

  const currentWorkstation = useTerminalStore((state) => state.currentWorkstation);
  const userId = useTerminalStore.getState().userId || 'anonymous';

  useEffect(() => {
    if (visible) {
      // Sequence: Load accounts -> Then load Git data (once accounts are checked)
      loadAccountInfo().then(() => {
        setAccountsLoaded(true);
      });
    }
  }, [visible, currentWorkstation?.id]);

  useEffect(() => {
    if (visible && accountsLoaded) {
      loadGitData();
    }
  }, [visible, accountsLoaded, linkedAccount, currentWorkstation?.id]);

  const expandToTab = useCallback(() => {
    onClose();
    // Add or switch to git tab
    const existingTab = tabs.find(t => t.id === 'github-main');
    if (existingTab) {
      setActiveTab('github-main');
    } else {
      addTab({
        id: 'github-main',
        type: 'github',
        title: 'Git',
        data: {},
      });
    }
  }, [onClose, tabs, setActiveTab, addTab]);

  const loadAccountInfo = async () => {
    try {
      const accounts = await gitAccountService.getAllAccounts(userId);
      setGitAccounts(accounts);

      const repoUrl = currentWorkstation?.repositoryUrl || currentWorkstation?.githubUrl;
      if (repoUrl) {
        const linkedUsername = currentWorkstation?.githubAccountUsername;
        if (linkedUsername) {
          const linked = accounts.find(a => a.username === linkedUsername);
          if (linked) {
            setLinkedAccount(linked);
            setLoading(false);
            return;
          }
        }

        if (accounts.length > 0) {
          const defaultAccount = accounts.find(a => a.provider === 'github') || accounts[0];
          setLinkedAccount(defaultAccount);
        }
      }
    } catch (error) {
      console.error('Error loading git accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadGitData = async () => {
    if (!currentWorkstation?.id) return;

    setGitLoading(true);
    setErrorMsg(null);

    try {
      // 1. Fetch Local Data (Primary Source)
      // This ensures we always have something to show, even if GitHub API fails
      console.log('📦 Loading Local Git Data...');
      const localResponse = await fetch(`${config.apiUrl}/git/status/${currentWorkstation.id}`);
      const localData = await localResponse.json();

      let finalCommits: GitCommit[] = [];
      let finalBranches: GitBranch[] = [];
      let finalGitStatus: GitStatus | null = null;
      let finalCurrentBranch = 'main';
      let isGithubConnected = false;

      if (localData.isGitRepo) {
        setIsGitRepo(true);
        finalBranches = localData.branches || [];
        finalGitStatus = localData.status || null;
        finalCurrentBranch = localData.currentBranch || 'main';

        if (localData.commits) {
          finalCommits = localData.commits;
        }
      }

      // 2. Fetch GitHub Data (Secondary Source - for avatars/enrichment)
      const repoUrl = currentWorkstation?.repositoryUrl || currentWorkstation?.githubUrl;

      if (repoUrl && repoUrl.includes('github.com')) {
        try {
          console.log('🌐 Attempting to fetch from GitHub...', repoUrl);
          // Robust regex to capture owner and repo
          const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(\.git)?$/) || repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);

          if (match) {
            const [, owner, repo] = match;
            console.log('🎯 GitHub Target:', owner, '/', repo);

            // Get token
            let token: string | null = null;

            // First check linked account
            if (linkedAccount) {
              token = await gitAccountService.getToken(linkedAccount, userId);
            }

            // If no token from linked account, try to find ANY github account
            if (!token) {
              const validAccount = gitAccounts.find(a => a.provider === 'github');
              if (validAccount) {
                console.log('🔑 Using fallback GitHub account:', validAccount.username);
                token = await gitAccountService.getToken(validAccount, userId);
              }
            }

            // Fetch from GitHub
            // We fetch from GitHub to get the authoritative remote history and branches
            const [commitsData, branchesData] = await Promise.all([
              githubService.getCommits(owner, repo, token || undefined),
              githubService.getBranches(owner, repo, token || undefined)
            ]);

            if (commitsData && commitsData.length > 0) {
              console.log(`✅ Fetched ${commitsData.length} commits from GitHub`);

              // Transform GitHub commits
              const githubCommits: GitCommit[] = commitsData.map((c: GitHubCommit, index: number) => ({
                hash: c.sha,
                shortHash: c.sha.substring(0, 7),
                message: c.message.split('\n')[0],
                author: c.author.name,
                authorEmail: c.author.email,
                authorAvatar: c.author.avatar_url,
                authorLogin: c.author.login,
                date: new Date(c.author.date),
                isHead: index === 0,
                branch: index === 0 ? finalCurrentBranch : undefined,
                url: c.url,
              }));

              // OVERWRITE local commits with GitHub ones as requested
              finalCommits = githubCommits;
              isGithubConnected = true;
            }

            if (branchesData && branchesData.length > 0) {
              console.log(`✅ Fetched ${branchesData.length} branches from GitHub`);
              const githubBranches: GitBranch[] = branchesData.map((b: any) => ({
                name: b.name,
                isCurrent: b.name === finalCurrentBranch, // Best guess matching local current branch
                isRemote: true,
              }));

              // If we have local branches, we should try to merge or list them separately?
              // The UI separates them if they have `isRemote: true`
              // Let's append them if they are not already in the list
              const existingNames = new Set(finalBranches.map(b => b.name));
              const newRemoteBranches = githubBranches.filter(b => !existingNames.has(b.name));

              finalBranches = [...finalBranches, ...newRemoteBranches];
            }
          }
        } catch (ghError: any) {
          console.warn('⚠️ GitHub fetch failed (suppressed):', ghError.message);
          // User requested "NEVER show GitHub errors".
          // We silently failover to local data or empty state.
        }
      }

      // Update state
      if (finalCommits.length > 0) {
        setCommits(finalCommits);
      } else if (!localData.isGitRepo) {
        // Only set error if it's strictly not a git repo, otherwise empty state is fine
        // setErrorMsg('Nessuna repository Git trovata'); // Actually, even this might be annoying?
        // Let's just let it show empty state if commits are 0
      }

      setBranches(finalBranches);
      setGitStatus(finalGitStatus);
      setCurrentBranch(finalCurrentBranch);

    } catch (error) {
      console.error('Error loading git data:', error);
      // Generic error only if catastrophic
      if (commits.length === 0) {
        setErrorMsg('Impossibile caricare i dati');
      }
    } finally {
      setGitLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadAccountInfo(), loadGitData()]);
    setRefreshing(false);
  };

  const handleGitAction = async (action: 'pull' | 'push' | 'fetch') => {
    if (!currentWorkstation?.id || !linkedAccount) {
      Alert.alert('Errore', 'Collega un account Git per eseguire questa azione');
      return;
    }

    setActionLoading(action);
    try {
      // Get token properly
      const token = await gitAccountService.getToken(linkedAccount, userId);

      const response = await fetch(`${config.apiUrl}/workstation/${currentWorkstation.id}/git/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      if (response.ok) {
        Alert.alert('Successo', `${action.charAt(0).toUpperCase() + action.slice(1)} completato`);
        await loadGitData();
      } else {
        const error = await response.json();
        Alert.alert('Errore', error.message || `Errore durante ${action}`);
      }
    } catch (error) {
      Alert.alert('Errore', `Impossibile eseguire ${action}`);
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m fa`;
    if (diffHours < 24) return `${diffHours}h fa`;
    if (diffDays < 7) return `${diffDays}g fa`;
    return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  };

  const repoUrl = currentWorkstation?.repositoryUrl || currentWorkstation?.githubUrl;
  const repoName = repoUrl ? repoUrl.split('/').pop()?.replace('.git', '') : 'Repository';
  const repoOwner = repoUrl ? repoUrl.split('/').slice(-2, -1)[0] : '';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modalContainer} onPress={() => { }}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.gitIcon}>
                <Ionicons name="git-branch" size={18} color="#fff" />
              </View>
              <View style={styles.headerTitleContainer}>
                <Text style={styles.headerTitle}>{repoName}</Text>
                <Text style={styles.headerSubtitle}>{repoOwner}</Text>
              </View>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.expandButton} onPress={expandToTab}>
                <Ionicons name="expand-outline" size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Branch & Actions Row */}
          <View style={styles.branchRow}>
            <View style={styles.branchBadge}>
              <Ionicons name="git-branch" size={14} color={AppColors.primary} />
              <Text style={styles.branchText}>{currentBranch}</Text>
            </View>
            <View style={styles.gitActions}>
              <TouchableOpacity
                style={styles.gitActionBtn}
                onPress={() => handleGitAction('fetch')}
                disabled={!!actionLoading}
              >
                {actionLoading === 'fetch' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="sync-outline" size={16} color="#fff" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.gitActionBtn}
                onPress={() => handleGitAction('pull')}
                disabled={!!actionLoading}
              >
                {actionLoading === 'pull' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="arrow-down-outline" size={16} color="#fff" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.gitActionBtn}
                onPress={() => handleGitAction('push')}
                disabled={!!actionLoading}
              >
                {actionLoading === 'push' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="arrow-up-outline" size={16} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            {(['commits', 'branches', 'changes'] as const).map((section) => (
              <TouchableOpacity
                key={section}
                style={[styles.tab, activeSection === section && styles.tabActive]}
                onPress={() => setActiveSection(section)}
              >
                <Text style={[styles.tabText, activeSection === section && styles.tabTextActive]}>
                  {section === 'commits' ? 'Commit' : section === 'branches' ? 'Branch' : 'Changes'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Content */}
          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#fff" />
            }
          >
            {gitLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={AppColors.primary} />
              </View>
            ) : activeSection === 'commits' ? (
              <View style={styles.commitsList}>


                {commits.slice(0, 8).map((commit, index) => (
                  <TouchableOpacity
                    key={commit.hash || index}
                    style={styles.commitItem}
                    onPress={() => commit.url && Linking.openURL(commit.url)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.commitLeft}>
                      {commit.authorAvatar ? (
                        <Image source={{ uri: commit.authorAvatar }} style={styles.commitAvatar} />
                      ) : (
                        <View style={[styles.commitAvatar, styles.commitAvatarPlaceholder]}>
                          <Text style={styles.commitAvatarText}>
                            {commit.author.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.commitContent}>
                      <Text style={styles.commitMessage} numberOfLines={1}>
                        {commit.message}
                      </Text>
                      <View style={styles.commitMeta}>
                        <Text style={styles.commitHash}>{commit.shortHash}</Text>
                        <Text style={styles.commitAuthor}>{commit.authorLogin || commit.author}</Text>
                        <Text style={styles.commitDate}>{formatDate(commit.date)}</Text>
                      </View>
                      {commit.isHead && (
                        <View style={styles.commitBadges}>
                          <View style={styles.headBadge}>
                            <Text style={styles.headBadgeText}>HEAD</Text>
                          </View>
                          <View style={styles.branchBadgeSmall}>
                            <Ionicons name="git-branch" size={10} color="#fff" />
                            <Text style={styles.branchBadgeText}>{currentBranch}</Text>
                          </View>
                        </View>
                      )}
                    </View>
                    <Ionicons name="open-outline" size={14} color="rgba(255,255,255,0.3)" />
                  </TouchableOpacity>
                ))}
                {commits.length === 0 && (
                  <View style={styles.emptyState}>
                    <Ionicons name="git-commit-outline" size={40} color="rgba(255,255,255,0.2)" />
                    <Text style={styles.emptyStateText}>
                      {errorMsg || 'Nessun commit trovato'}
                    </Text>
                    {errorMsg && (
                      <TouchableOpacity onPress={() => loadGitData()} style={styles.retryButton}>
                        <Text style={styles.retryText}>Riprova</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                {commits.length > 8 && (
                  <TouchableOpacity style={styles.showMoreBtn} onPress={expandToTab}>
                    <Text style={styles.showMoreText}>Mostra tutti ({commits.length})</Text>
                    <Ionicons name="arrow-forward" size={14} color={AppColors.primary} />
                  </TouchableOpacity>
                )}
              </View>
            ) : activeSection === 'branches' ? (
              <View style={styles.branchesList}>
                {branches.map((branch) => (
                  <TouchableOpacity key={branch.name} style={styles.branchItem} activeOpacity={0.7}>
                    <View style={styles.branchItemLeft}>
                      <Ionicons
                        name={branch.isCurrent ? 'git-branch' : 'git-branch-outline'}
                        size={16}
                        color={branch.isCurrent ? AppColors.primary : 'rgba(255,255,255,0.5)'}
                      />
                      <Text style={[styles.branchItemText, branch.isCurrent && styles.branchItemTextActive]}>
                        {branch.name}
                      </Text>
                    </View>
                    {branch.isCurrent && (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>current</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.changesContainer}>
                <View style={styles.emptyState}>
                  <Ionicons name="checkmark-circle-outline" size={40} color="rgba(255,255,255,0.2)" />
                  <Text style={styles.emptyStateText}>Nessuna modifica</Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Account Link */}
          {linkedAccount && (
            <TouchableOpacity style={styles.accountRow} onPress={() => setShowAccountPicker(true)}>
              <Image source={{ uri: linkedAccount.avatarUrl }} style={styles.accountAvatar} />
              <Text style={styles.accountName}>{linkedAccount.username}</Text>
              <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>

      <AddGitAccountModal
        visible={showAddAccountModal}
        onClose={() => setShowAddAccountModal(false)}
        onAccountAdded={loadAccountInfo}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 420,
    maxHeight: MODAL_HEIGHT,
    minHeight: 500, // FORCE HEIGHT
    backgroundColor: '#151517',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gitIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    gap: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  expandButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  branchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${AppColors.primary}15`,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  branchText: {
    fontSize: 13,
    fontWeight: '500',
    color: AppColors.primary,
  },
  gitActions: {
    flexDirection: 'row',
    gap: 6,
  },
  gitActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 12,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  tabActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
  },
  tabTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  commitsList: {
    gap: 2,
  },
  commitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    marginBottom: 4,
    gap: 10,
  },
  commitLeft: {},
  commitAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  commitAvatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commitAvatarText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  commitContent: {
    flex: 1,
    gap: 3,
  },
  commitMessage: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
  },
  commitMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  commitHash: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: AppColors.primary,
  },
  commitAuthor: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
  },
  commitDate: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
  },
  commitBadges: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 3,
  },
  headBadge: {
    backgroundColor: AppColors.primary,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  headBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#fff',
  },
  branchBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  branchBadgeText: {
    fontSize: 8,
    fontWeight: '500',
    color: '#fff',
  },
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 4,
  },
  showMoreText: {
    fontSize: 13,
    fontWeight: '500',
    color: AppColors.primary,
  },
  branchesList: {
    gap: 4,
  },
  branchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
  },
  branchItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  branchItemText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  branchItemTextActive: {
    color: '#fff',
    fontWeight: '500',
  },
  currentBadge: {
    backgroundColor: `${AppColors.primary}20`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  currentBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: AppColors.primary,
  },
  changesContainer: {
    flex: 1,
    paddingVertical: 30,
  },
  emptyState: {
    alignItems: 'center',
    gap: 10,
  },
  emptyStateText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  accountAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  accountName: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 6,
  },
  retryText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },
});
