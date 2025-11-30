import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, Animated, ActivityIndicator, RefreshControl } from 'react-native';
import ReanimatedView from 'react-native-reanimated';
import { useAnimatedStyle, interpolate } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../../shared/theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { githubTokenService, GitHubAccount } from '../../../../core/github/githubTokenService';
import { useTerminalStore } from '../../../../core/terminal/terminalStore';
import { workstationService } from '../../../../core/workstation/workstationService-firebase';
import { GitHubAuthModal } from '../GitHubAuthModal';
import { useSidebarOffset } from '../../context/SidebarContext';
import { config } from '../../../../config/config';

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
  const [linkedAccount, setLinkedAccount] = useState<GitHubAccount | null>(null);
  const [availableAccounts, setAvailableAccounts] = useState<GitHubAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
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
      const allAccounts = await githubTokenService.getAccounts(userId);
      setAvailableAccounts(allAccounts);

      if (currentWorkstation?.githubAccountUsername) {
        const linked = allAccounts.find(acc => acc.username === currentWorkstation.githubAccountUsername);
        setLinkedAccount(linked || null);
      } else {
        setLinkedAccount(null);
      }
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
    if (!currentWorkstation?.id || !linkedAccount) {
      Alert.alert('Errore', 'Collega un account GitHub per eseguire questa azione');
      return;
    }

    setActionLoading(action);
    try {
      const token = await githubTokenService.getToken(linkedAccount.username, userId);
      const response = await fetch(`${config.apiUrl}/git/${action}/${currentWorkstation.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
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

  const handleLinkAccount = async (account: GitHubAccount) => {
    if (!currentWorkstation?.projectId && !currentWorkstation?.id) {
      Alert.alert('Errore', 'Nessun progetto selezionato');
      return;
    }

    try {
      const projectId = currentWorkstation.projectId || currentWorkstation.id;
      await workstationService.updateProjectGitHubAccount(projectId, account.username);
      setLinkedAccount(account);
      setShowAccountPicker(false);
      useTerminalStore.getState().setWorkstation({
        ...currentWorkstation,
        githubAccountUsername: account.username,
      });
    } catch (error) {
      Alert.alert('Errore', 'Impossibile collegare l\'account');
    }
  };

  const handleUnlinkAccount = () => {
    if (!currentWorkstation?.projectId && !currentWorkstation?.id) return;

    Alert.alert(
      'Scollega Account',
      `Sei sicuro di voler scollegare l'account ${linkedAccount?.username}?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Scollega',
          style: 'destructive',
          onPress: async () => {
            try {
              const projectId = currentWorkstation.projectId || currentWorkstation.id;
              await workstationService.removeProjectGitHubAccount(projectId);
              setLinkedAccount(null);
              useTerminalStore.getState().setWorkstation({
                ...currentWorkstation,
                githubAccountUsername: undefined,
              });
            } catch (error) {
              Alert.alert('Errore', 'Impossibile scollegare l\'account');
            }
          },
        },
      ]
    );
  };

  const handleAuthenticated = async (token: string) => {
    setShowAuthModal(false);
    try {
      const validation = await githubTokenService.validateToken(token);
      if (validation.valid && validation.username) {
        await githubTokenService.saveToken(validation.username, token, userId);
        await loadAccountInfo();

        if (!linkedAccount && currentWorkstation) {
          const projectId = currentWorkstation.projectId || currentWorkstation.id;
          await workstationService.updateProjectGitHubAccount(projectId, validation.username);
          await loadAccountInfo();
          useTerminalStore.getState().setWorkstation({
            ...currentWorkstation,
            githubAccountUsername: validation.username,
          });
        }
      } else {
        Alert.alert('Errore', 'Token non valido');
      }
    } catch (error) {
      Alert.alert('Errore', 'Impossibile salvare l\'account');
    }
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
    <View style={styles.toolbar}>
      <TouchableOpacity
        style={[styles.toolbarBtn, actionLoading === 'fetch' && styles.toolbarBtnLoading]}
        onPress={() => handleGitAction('fetch')}
        disabled={!!actionLoading}
      >
        {actionLoading === 'fetch' ? (
          <ActivityIndicator size="small" color={AppColors.primary} />
        ) : (
          <Ionicons name="cloud-download-outline" size={18} color="#fff" />
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
          <Ionicons name="arrow-down-outline" size={18} color="#fff" />
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
          <Ionicons name="arrow-up-outline" size={18} color="#fff" />
        )}
        <Text style={styles.toolbarBtnText}>Push</Text>
      </TouchableOpacity>

      <View style={styles.toolbarDivider} />

      <View style={styles.branchIndicator}>
        <Ionicons name="git-branch" size={16} color={AppColors.primary} />
        <Text style={styles.branchName}>{currentBranch}</Text>
      </View>
    </View>
  );

  // Navigation tabs
  const renderTabs = () => (
    <View style={styles.navTabs}>
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
            size={16}
            color={activeSection === item.key ? AppColors.primary : 'rgba(255,255,255,0.5)'}
          />
          <Text style={[styles.navTabText, activeSection === item.key && styles.navTabTextActive]}>
            {item.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
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

  // Account section
  const renderAccount = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Account GitHub del progetto</Text>

      {linkedAccount ? (
        <View style={styles.linkedAccountCard}>
          <View style={styles.linkedBadge}>
            <Ionicons name="link" size={12} color="#00D084" />
            <Text style={styles.linkedBadgeText}>Collegato</Text>
          </View>
          <View style={styles.accountCardInner}>
            {linkedAccount.avatarUrl ? (
              <Image source={{ uri: linkedAccount.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={24} color="rgba(255,255,255,0.5)" />
              </View>
            )}
            <View style={styles.accountInfo}>
              <Text style={styles.accountName}>{linkedAccount.username}</Text>
              <Text style={styles.accountMeta}>Account per push/pull</Text>
            </View>
            <TouchableOpacity style={styles.unlinkBtn} onPress={handleUnlinkAccount}>
              <Ionicons name="unlink-outline" size={18} color="#ff4d4d" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.noAccountCard}>
          <Ionicons name="logo-github" size={40} color="rgba(255,255,255,0.2)" />
          <Text style={styles.noAccountText}>Nessun account collegato</Text>
          <Text style={styles.noAccountSubtext}>
            Collega un account per push, pull e accesso ai repository privati
          </Text>
          <View style={styles.noAccountButtons}>
            {availableAccounts.length > 0 && (
              <TouchableOpacity
                style={styles.selectAccountBtn}
                onPress={() => setShowAccountPicker(true)}
              >
                <Ionicons name="people-outline" size={16} color={AppColors.primary} />
                <Text style={styles.selectAccountBtnText}>Scegli</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.addAccountBtn}
              onPress={() => setShowAuthModal(true)}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.addAccountBtnText}>Nuovo</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  // Account picker overlay
  const renderAccountPicker = () => {
    if (!showAccountPicker) return null;

    return (
      <View style={styles.pickerOverlay}>
        <View style={styles.pickerCard}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Scegli un account</Text>
            <TouchableOpacity onPress={() => setShowAccountPicker(false)}>
              <Ionicons name="close" size={24} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.pickerList}>
            {availableAccounts.map((account) => (
              <TouchableOpacity
                key={account.id}
                style={styles.pickerItem}
                onPress={() => handleLinkAccount(account)}
              >
                {account.avatarUrl ? (
                  <Image source={{ uri: account.avatarUrl }} style={styles.pickerAvatar} />
                ) : (
                  <View style={[styles.pickerAvatar, styles.avatarPlaceholder]}>
                    <Ionicons name="person" size={16} color="rgba(255,255,255,0.5)" />
                  </View>
                )}
                <Text style={styles.pickerItemText}>{account.username}</Text>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    );
  };

  return (
    <ReanimatedView.default style={[styles.container, { paddingTop: insets.top }, containerAnimatedStyle]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="logo-github" size={24} color="#fff" />
          <Text style={styles.projectName}>{projectName}</Text>
        </View>
        {linkedAccount && (
          <View style={styles.headerAccount}>
            {linkedAccount.avatarUrl ? (
              <Image source={{ uri: linkedAccount.avatarUrl }} style={styles.headerAvatar} />
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

      {renderAccountPicker()}

      <GitHubAuthModal
        visible={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthenticated={handleAuthenticated}
      />
    </ReanimatedView.default>
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
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 6,
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
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
    gap: 6,
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
    borderRadius: 6,
  },
  branchName: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.primary,
  },
  // Nav tabs
  navTabs: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  navTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  navTabActive: {
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
  },
  navTabText: {
    fontSize: 13,
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
  linkedAccountCard: {
    backgroundColor: 'rgba(0, 208, 132, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 208, 132, 0.2)',
    overflow: 'hidden',
  },
  linkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0, 208, 132, 0.15)',
  },
  linkedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#00D084',
    textTransform: 'uppercase',
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
  accountName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
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
  noAccountButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  selectAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: AppColors.primary,
  },
  selectAccountBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.primary,
  },
  addAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: AppColors.primary,
    borderRadius: 8,
  },
  addAccountBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
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
