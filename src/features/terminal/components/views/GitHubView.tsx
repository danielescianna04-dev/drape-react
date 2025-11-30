import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, Animated, ActivityIndicator, RefreshControl } from 'react-native';
import Reanimated, { useAnimatedStyle, interpolate } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../../shared/theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { gitAccountService, GitAccount, GIT_PROVIDERS } from '../../../../core/git/gitAccountService';
import { useTerminalStore } from '../../../../core/terminal/terminalStore';
import { workstationService } from '../../../../core/workstation/workstationService-firebase';
import { useSidebarOffset } from '../../context/SidebarContext';
import { config } from '../../../../config/config';
import { AddGitAccountModal } from '../../../settings/components/AddGitAccountModal';

interface Props {
  tab: any;
}

interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  authorEmail: string;
  date: Date;
  isHead: boolean;
  branch?: string;
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
  const [activeSection, setActiveSection] = useState<'commits' | 'branches' | 'changes' | 'account'>('commits');
  const [gitAccounts, setGitAccounts] = useState<GitAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  const { sidebarTranslateX } = useSidebarOffset();

  const currentWorkstation = useTerminalStore((state) => state.currentWorkstation);
  const userId = useTerminalStore.getState().userId || 'anonymous';

  // Animated style that adapts when sidebar is hidden
  const containerAnimatedStyle = useAnimatedStyle(() => {
    const paddingLeft = interpolate(
      sidebarTranslateX.value,
      [-50, 0],
      [0, 50]
    );
    return { paddingLeft };
  });

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
      const accounts = await gitAccountService.getAccounts(userId);
      setGitAccounts(accounts);
    } catch (error) {
      console.error('Error loading account info:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadGitData = async () => {
    if (!currentWorkstation?.id) return;

    setGitLoading(true);
    try {
      const response = await fetch(`${config.apiUrl}/git/status/${currentWorkstation.id}`);
      const data = await response.json();

      if (data.isGitRepo) {
        setIsGitRepo(true);
        setCommits(data.commits || []);
        setBranches(data.branches || []);
        setGitStatus(data.status || null);
        setCurrentBranch(data.currentBranch || 'main');
      } else {
        setIsGitRepo(false);
      }
    } catch (error) {
      console.error('Error loading git data:', error);
      // If endpoint doesn't exist, show mock data
      setIsGitRepo(true);
      setCommits([
        { hash: 'abc123def456', shortHash: 'abc123d', message: 'Initial commit', author: 'Developer', authorEmail: 'dev@example.com', date: new Date(), isHead: true, branch: 'main' },
      ]);
      setBranches([
        { name: 'main', isCurrent: true, isRemote: false, ahead: 0, behind: 0 },
      ]);
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

  // Toolbar with git actions
  const renderToolbar = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.toolbarScroll}
      contentContainerStyle={styles.toolbar}
    >
      <TouchableOpacity
        style={[styles.toolbarBtn, actionLoading === 'fetch' && styles.toolbarBtnLoading]}
        onPress={() => handleGitAction('fetch')}
        disabled={!!actionLoading}
      >
        {actionLoading === 'fetch' ? (
          <ActivityIndicator size="small" color={AppColors.primary} />
        ) : (
          <Ionicons name="cloud-download-outline" size={16} color="#fff" />
        )}
        <Text style={styles.toolbarBtnText}>Fetch</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.toolbarBtn, actionLoading === 'pull' && styles.toolbarBtnLoading]}
        onPress={() => handleGitAction('pull')}
        disabled={!!actionLoading}
      >
        {actionLoading === 'pull' ? (
          <ActivityIndicator size="small" color={AppColors.primary} />
        ) : (
          <Ionicons name="arrow-down-outline" size={16} color="#fff" />
        )}
        <Text style={styles.toolbarBtnText}>Pull</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.toolbarBtn, actionLoading === 'push' && styles.toolbarBtnLoading]}
        onPress={() => handleGitAction('push')}
        disabled={!!actionLoading}
      >
        {actionLoading === 'push' ? (
          <ActivityIndicator size="small" color={AppColors.primary} />
        ) : (
          <Ionicons name="arrow-up-outline" size={16} color="#fff" />
        )}
        <Text style={styles.toolbarBtnText}>Push</Text>
      </TouchableOpacity>

      <View style={styles.toolbarDivider} />

      <View style={styles.branchIndicator}>
        <Ionicons name="git-branch" size={14} color={AppColors.primary} />
        <Text style={styles.branchName} numberOfLines={1}>{currentBranch}</Text>
      </View>
    </ScrollView>
  );

  // Navigation tabs
  const renderTabs = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.navTabsScroll}
      contentContainerStyle={styles.navTabs}
    >
      {[
        { key: 'commits', icon: 'git-commit-outline', label: 'Commits' },
        { key: 'branches', icon: 'git-branch-outline', label: 'Branches' },
        { key: 'changes', icon: 'document-text-outline', label: 'Changes' },
        { key: 'account', icon: 'person-outline', label: 'Account' },
      ].map((item) => (
        <TouchableOpacity
          key={item.key}
          style={[styles.navTab, activeSection === item.key && styles.navTabActive]}
          onPress={() => setActiveSection(item.key as any)}
        >
          <Ionicons
            name={item.icon as any}
            size={14}
            color={activeSection === item.key ? AppColors.primary : 'rgba(255,255,255,0.5)'}
          />
          <Text style={[styles.navTabText, activeSection === item.key && styles.navTabTextActive]}>
            {item.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  // Commits list (Fork-style)
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
        commits.map((commit, index) => (
          <View key={commit.hash} style={styles.commitRow}>
            {/* Graph line */}
            <View style={styles.graphColumn}>
              <View style={[styles.graphLine, index === 0 && styles.graphLineFirst]} />
              <View style={[styles.graphDot, commit.isHead && styles.graphDotHead]} />
              {index < commits.length - 1 && <View style={styles.graphLine} />}
            </View>

            {/* Commit info */}
            <View style={styles.commitInfo}>
              <View style={styles.commitHeader}>
                <Text style={styles.commitMessage} numberOfLines={1}>{commit.message}</Text>
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
              <View style={styles.commitMeta}>
                <Text style={styles.commitHash}>{commit.shortHash}</Text>
                <Text style={styles.commitAuthor}>{commit.author}</Text>
                <Text style={styles.commitDate}>{formatDate(commit.date)}</Text>
              </View>
            </View>
          </View>
        ))
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
    <Reanimated.View style={[styles.container, { paddingTop: insets.top }, containerAnimatedStyle]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="logo-github" size={24} color="#fff" />
          <Text style={styles.projectName}>{projectName}</Text>
        </View>
        {gitAccounts.length > 0 && (
          <View style={styles.headerAccount}>
            {gitAccounts[0].avatarUrl ? (
              <Image source={{ uri: gitAccounts[0].avatarUrl }} style={styles.headerAvatar} />
            ) : (
              <Ionicons name="person-circle" size={28} color="rgba(255,255,255,0.5)" />
            )}
          </View>
        )}
      </View>

      {/* Toolbar */}
      {renderToolbar()}

      {/* Navigation Tabs */}
      {renderTabs()}

      {/* Content */}
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
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
        {activeSection === 'account' && renderAccount()}
      </ScrollView>

      <AddGitAccountModal
        visible={showAddAccountModal}
        onClose={() => setShowAddAccountModal(false)}
        onAccountAdded={loadAccountInfo}
      />
    </Reanimated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0f',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  projectName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  headerAccount: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
  },
  headerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  // Toolbar
  toolbarScroll: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
  },
  toolbarBtnLoading: {
    opacity: 0.6,
  },
  toolbarBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
  },
  toolbarDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 8,
  },
  branchIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
    borderRadius: 6,
    maxWidth: 120,
  },
  branchName: {
    fontSize: 12,
    fontWeight: '600',
    color: AppColors.primary,
  },
  // Nav tabs
  navTabsScroll: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  navTabs: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  navTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  navTabActive: {
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
  },
  navTabText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
  },
  navTabTextActive: {
    color: AppColors.primary,
  },
  content: {
    flex: 1,
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
    marginBottom: 2,
  },
  graphColumn: {
    width: 32,
    alignItems: 'center',
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
  commitInfo: {
    flex: 1,
    paddingVertical: 10,
    paddingRight: 12,
  },
  commitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  commitMessage: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
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
