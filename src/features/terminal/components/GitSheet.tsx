import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, Animated as RNAnimated, ActivityIndicator, RefreshControl, Linking, Dimensions, Pressable, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { BlurView } from 'expo-blur';
import { Button } from '../../../shared/components/atoms/Button';
import { Input } from '../../../shared/components/atoms/Input';
import { AppColors } from '../../../shared/theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { gitAccountService, GitAccount, GIT_PROVIDERS } from '../../../core/git/gitAccountService';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { useGitCacheStore } from '../../../core/cache/gitCacheStore';
import { workstationService } from '../../../core/workstation/workstationService-firebase';
import { config } from '../../../config/config';
import { AddGitAccountModal } from '../../settings/components/AddGitAccountModal';
import { githubService, GitHubCommit } from '../../../core/github/githubService';
import { useTabStore } from '../../../core/tabs/tabStore';
import { ConnectRepoModal } from './ConnectRepoModal';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation(['terminal', 'common']);
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
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [commitMessage, setCommitMessage] = useState('');
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showCommitModal, setShowCommitModal] = useState(false);

  const shimmerAnim = useRef(new RNAnimated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const { addTab, setActiveTab, tabs } = useTabStore();

  const currentWorkstation = useTerminalStore((state) => state.currentWorkstation);
  const userId = useTerminalStore.getState().userId || 'anonymous';

  // Use refs to store accounts and loading state (avoids async state issues)
  const accountsRef = useRef<GitAccount[]>([]);
  const isLoadingRef = useRef(false);
  const hasStartedRef = useRef(false); // Prevent double-start from React StrictMode

  useEffect(() => {
    if (visible && currentWorkstation?.id) {
      // Prevent double-start from React StrictMode or rapid prop changes
      if (hasStartedRef.current) {
        console.log('⚠️ [GitSheet] Already started loading, skipping');
        return;
      }
      hasStartedRef.current = true;

      // 🚀 CHECK CACHE FIRST - instant UI if we have prefetched data
      const cachedData = useGitCacheStore.getState().getGitData(currentWorkstation.id);
      const isCacheValid = useGitCacheStore.getState().isCacheValid(currentWorkstation.id, 5 * 60 * 1000); // 5 min

      if (cachedData && isCacheValid) {
        console.log('✅ [GitSheet] Using CACHED data - instant UI!');
        // Set all data from cache immediately
        setCommits(cachedData.commits.map(c => ({ ...c, date: new Date(c.date) })));
        setBranches(cachedData.branches);
        setCurrentBranch(cachedData.currentBranch);
        setIsGitRepo(cachedData.isGitRepo);
        if (cachedData.status) setGitStatus(cachedData.status);
        setGitLoading(false);
        setLoading(false);

        // Refresh in background silently
        loadAccountInfo().then(accounts => loadGitData(accounts || [])).catch(() => { });
        return;
      }

      // No cache - load normally
      console.log('🟡 [GitSheet] No cache - loading...');
      setGitLoading(true);

      const timeoutId = setTimeout(() => {
        const cachedCount = accountsRef.current.length;
        console.warn(`⏰ [GitSheet] loadAccountInfo timeout (10s) - using ${cachedCount} cached accounts`);
        // Use cached accounts from ref (from previous successful load) instead of empty array
        loadGitData(accountsRef.current);
      }, 10000);

      loadAccountInfo().then((accounts) => {
        console.log('✅ [GitSheet] loadAccountInfo resolved - calling loadGitData directly');
        clearTimeout(timeoutId);
        loadGitData(accounts || []);
      }).catch((err) => {
        console.error('❌ [GitSheet] loadAccountInfo failed:', err);
        clearTimeout(timeoutId);
        loadGitData([]); // Still try with empty accounts
      });
    } else if (!visible) {
      setGitLoading(false);
      setAccountsLoaded(false);
      isLoadingRef.current = false; // Reset guard when closed
      hasStartedRef.current = false; // Reset so next open triggers load
    }
  }, [visible, currentWorkstation?.id]);

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

  const loadAccountInfo = async (): Promise<GitAccount[]> => {
    console.log('🔶 [GitSheet] loadAccountInfo START');
    const startTime = Date.now();
    try {
      const accounts = await gitAccountService.getAllAccounts(userId);
      console.log(`⏱️ [GitSheet] getAllAccounts took ${Date.now() - startTime}ms`);
      setGitAccounts(accounts);
      accountsRef.current = accounts; // Store in ref for immediate access

      const repoUrl = currentWorkstation?.repositoryUrl || currentWorkstation?.githubUrl;
      if (repoUrl) {
        const linkedUsername = currentWorkstation?.githubAccountUsername;
        if (linkedUsername) {
          const linked = accounts.find(a => a.username === linkedUsername);
          if (linked) {
            setLinkedAccount(linked);
            setLoading(false);
            return accounts;
          }
        }

        if (accounts.length > 0) {
          const defaultAccount = accounts.find(a => a.provider === 'github') || accounts[0];
          setLinkedAccount(defaultAccount);
        }
      }
      return accounts;
    } catch (error) {
      console.error('Error loading git accounts:', error);
      return [];
    } finally {
      console.log(`✅ [GitSheet] loadAccountInfo DONE in ${Date.now() - startTime}ms`);
      setLoading(false);
    }
  };

  const loadGitData = async (passedAccounts?: GitAccount[], overrideRepoUrl?: string) => {
    if (!currentWorkstation?.id) return;

    // Prevent multiple simultaneous calls
    if (isLoadingRef.current) {
      console.log('⚠️ [GitSheet] loadGitData already running, skipping');
      return;
    }
    isLoadingRef.current = true;

    const totalStart = Date.now();
    console.log('🔄 [GitSheet] loadGitData START');
    setGitLoading(true);
    setErrorMsg(null);

    const repoUrl = overrideRepoUrl || currentWorkstation?.repositoryUrl || currentWorkstation?.githubUrl;
    let localCurrentBranch = 'main';

    try {
      // STRATEGY: GitHub API first (fast), backend second (slow, needs VM)
      // This gives instant feedback to user

      // 1. Try GitHub API FIRST (fast! ~500ms)
      if (repoUrl && repoUrl.includes('github.com')) {
        const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(\.git)?$/) || repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);

        if (match) {
          const [, owner, repo] = match;
          console.log(`🚀 [GitSheet] Fast path: GitHub API for ${owner}/${repo}`);

          try {
            // Get token - use passed accounts or ref to avoid Firebase call
            const tokenStart = Date.now();
            let token: string | null = null;
            const accounts = passedAccounts || accountsRef.current;
            const githubAccount = accounts.find(a => a.provider === 'github');
            if (githubAccount) {
              token = await gitAccountService.getToken(githubAccount, userId);
            }
            console.log(`⏱️ [GitSheet] Token fetch: ${Date.now() - tokenStart}ms (accounts passed: ${!!passedAccounts}, count: ${accounts.length})`);

            // Fetch from GitHub API (FAST!)
            const apiStart = Date.now();
            const [commitsData, branchesData] = await Promise.all([
              githubService.getCommits(owner, repo, token || undefined),
              githubService.getBranches(owner, repo, token || undefined)
            ]);
            console.log(`⏱️ [GitSheet] GitHub API fetch: ${Date.now() - apiStart}ms`);

            if (commitsData && commitsData.length > 0) {
              console.log(`✅ [GitSheet] GitHub API: ${commitsData.length} commits in ${Date.now() - totalStart}ms TOTAL`);

              // Determine current branch from GitHub default
              localCurrentBranch = branchesData?.find((b: any) => b.name === 'main' || b.name === 'master')?.name || 'main';

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
                branch: index === 0 ? localCurrentBranch : undefined,
                url: c.url,
              }));

              setCommits(githubCommits);
              setCurrentBranch(localCurrentBranch);
              setIsGitRepo(true);

              if (branchesData && branchesData.length > 0) {
                const githubBranches: GitBranch[] = branchesData.map((b: any) => ({
                  name: b.name,
                  isCurrent: b.name === localCurrentBranch,
                  isRemote: true,
                }));
                setBranches(githubBranches);
              }

              // Cache it
              useGitCacheStore.getState().setGitData(currentWorkstation.id, {
                commits: githubCommits.map(c => ({ ...c, date: c.date.toISOString() })),
                branches: branchesData?.map((b: any) => ({ name: b.name, isCurrent: b.name === localCurrentBranch, isRemote: true })) || [],
                status: null,
                currentBranch: localCurrentBranch,
                isGitRepo: true
              });

              // STOP LOADING - user sees commits instantly!
              console.log(`✅ [GitSheet] setGitLoading(false) - TOTAL TIME: ${Date.now() - totalStart}ms`);
              setGitLoading(false);

              // 2. Fetch status from backend IN BACKGROUND (for Changes tab)
              // Don't await - this can be slow
              fetchBackendStatus(localCurrentBranch);
              return; // Early exit - we have data!
            }
          } catch (ghError: any) {
            console.warn(`⚠️ [GitSheet] GitHub API failed after ${Date.now() - totalStart}ms:`, ghError.message);
          }
        }
      }

      // FALLBACK: Backend (slow, needs VM boot)
      console.log(`📦 [GitSheet] Slow path: Backend git status... (${Date.now() - totalStart}ms elapsed)`);
      await fetchBackendStatus(localCurrentBranch);

    } catch (error) {
      console.error('Error loading git data:', error);
      if (commits.length === 0) {
        setErrorMsg(t('terminal:git.unableToLoadData'));
      }
    } finally {
      console.log(`🏁 [GitSheet] loadGitData FINALLY - TOTAL: ${Date.now() - totalStart}ms`);
      setGitLoading(false);
      isLoadingRef.current = false; // Reset guard
    }
  };

  // Separate function for backend fetch (can run in background)
  const fetchBackendStatus = async (currentBranchName: string) => {
    if (!currentWorkstation?.id) return;

    try {
      console.log('📡 [GitSheet] Fetching backend status (for Changes)...');
      const localResponse = await fetch(`${config.apiUrl}/git/status/${currentWorkstation.id}`);
      const localData = await localResponse.json();

      if (localData?.isGitRepo) {
        // Update status for Changes tab — backend returns 'changes' object, not 'status'
        const changes = localData.changes;
        if (changes) {
          setGitStatus({
            staged: changes.staged || [],
            modified: changes.modified || [],
            untracked: changes.untracked || [],
            deleted: changes.deleted || [],
          });
          console.log('✅ [GitSheet] Backend status loaded (Changes ready)');
        }

        // Update cache with status
        const cached = useGitCacheStore.getState().getGitData(currentWorkstation.id);
        if (cached) {
          useGitCacheStore.getState().setGitData(currentWorkstation.id, {
            ...cached,
            status: changes ? {
              staged: changes.staged || [],
              modified: changes.modified || [],
              untracked: changes.untracked || [],
              deleted: changes.deleted || [],
            } : null,
          });
        }
      }
    } catch (e: any) {
      console.warn('⚠️ [GitSheet] Backend status failed:', e.message);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadAccountInfo(), loadGitData()]);
    setRefreshing(false);
  };

  const handleGitAction = async (action: 'pull' | 'push' | 'fetch') => {
    if (!currentWorkstation?.id) {
      Alert.alert(t('common:error'), t('terminal:git.noActiveWorkspace'));
      return;
    }

    // Check if user has any Git accounts
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

    // Check if user can push to this repo
    if (action === 'push' && !isOwnRepo) {
      Alert.alert(
        t('terminal:git.notYourRepo'),
        t('terminal:git.notYourRepoDesc', { owner: repoOwner, repo: repoName }) + '\n\n' + t('terminal:git.forkInstructions'),
        [{ text: t('common:ok') }]
      );
      return;
    }

    // Check for local changes before pull
    if (action === 'pull' && allChangedFiles.length > 0) {
      Alert.alert(
        t('terminal:git.localChangesDetected'),
        t('terminal:git.localChangesWarning', { count: allChangedFiles.length }) + '\n\n' + t('terminal:git.whatToDo'),
        [
          { text: t('common:cancel'), style: 'cancel' },
          {
            text: t('terminal:git.stashSave'),
            onPress: () => executeGitActionWithStash(action),
          },
          {
            text: t('terminal:git.pullAnyway'),
            style: 'destructive',
            onPress: () => executeGitAction(action),
          },
        ]
      );
      return;
    }

    await executeGitAction(action);
  };

  const executeGitActionWithStash = async (action: 'pull' | 'push' | 'fetch') => {
    setActionLoading(action);
    try {
      const token = await gitAccountService.getToken(linkedAccount!, userId);

      // First stash
      const stashResponse = await fetch(`${config.apiUrl}/git/stash/${currentWorkstation!.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'push', message: 'Auto-stash before pull' }),
      });

      if (!stashResponse.ok) {
        Alert.alert(t('common:error'), t('terminal:git.stashError'));
        return;
      }

      // Then do the action
      const response = await fetch(`${config.apiUrl}/git/${action}/${currentWorkstation!.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        // Try to restore stash
        const popResponse = await fetch(`${config.apiUrl}/git/stash/${currentWorkstation!.id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ action: 'pop' }),
        });

        if (popResponse.ok) {
          Alert.alert(t('common:success'), t('terminal:git.actionCompletedWithRestore', { action: action.charAt(0).toUpperCase() + action.slice(1) }));
        } else {
          Alert.alert(t('common:warning'), t('terminal:git.actionCompletedWithConflict', { action: action.charAt(0).toUpperCase() + action.slice(1) }));
        }
        await loadGitData();
      } else {
        // Restore stash if action failed
        await fetch(`${config.apiUrl}/git/stash/${currentWorkstation!.id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ action: 'pop' }),
        });
        const error = await response.json();
        Alert.alert(t('common:error'), error.message || t('terminal:git.actionError', { action }));
      }
    } catch (error) {
      Alert.alert(t('common:error'), t('terminal:git.unableToExecute', { action }));
    } finally {
      setActionLoading(null);
    }
  };

  const executeGitAction = async (action: 'pull' | 'push' | 'fetch') => {
    setActionLoading(action);
    try {
      const token = await gitAccountService.getToken(linkedAccount!, userId);

      const response = await fetch(`${config.apiUrl}/git/${action}/${currentWorkstation!.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        Alert.alert(t('common:success'), t('terminal:git.actionCompleted', { action: action.charAt(0).toUpperCase() + action.slice(1) }));
        await loadGitData();
      } else {
        const error = await response.json();
        Alert.alert(t('common:error'), error.message || t('terminal:git.actionError', { action }));
      }
    } catch (error) {
      Alert.alert(t('common:error'), t('terminal:git.unableToExecute', { action }));
    } finally {
      setActionLoading(null);
    }
  };

  // Get all changed files for selection
  const allChangedFiles = gitStatus ? [
    ...(gitStatus.modified || []).map(f => ({ file: f, type: 'modified' })),
    ...(gitStatus.untracked || []).map(f => ({ file: f, type: 'untracked' })),
    ...(gitStatus.deleted || []).map(f => ({ file: f, type: 'deleted' })),
  ] : [];

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

  const handleCommit = async () => {
    if (!currentWorkstation?.id || !linkedAccount) {
      Alert.alert(t('common:error'), t('terminal:git.authRequiredForCommit'));
      return;
    }

    if (selectedFiles.size === 0) {
      Alert.alert(t('common:error'), t('terminal:git.selectAtLeastOneFile'));
      return;
    }

    if (!commitMessage.trim()) {
      Alert.alert(t('common:error'), t('terminal:git.enterCommitMessage'));
      return;
    }

    setActionLoading('commit');
    try {
      const token = await gitAccountService.getToken(linkedAccount, userId);

      const response = await fetch(`${config.apiUrl}/git/commit/${currentWorkstation.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          files: Array.from(selectedFiles),
          message: commitMessage.trim(),
        }),
      });

      if (response.ok) {
        Alert.alert(t('common:success'), t('terminal:git.commitSuccess'));
        setCommitMessage('');
        setSelectedFiles(new Set());
        await loadGitData();
      } else {
        const error = await response.json();
        Alert.alert(t('common:error'), error.message || t('terminal:git.commitError'));
      }
    } catch (error) {
      Alert.alert(t('common:error'), t('terminal:git.unableToCommit'));
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return '';

    const now = new Date();
    const diffMs = now.getTime() - dateObj.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m fa`;
    if (diffHours < 24) return `${diffHours}h fa`;
    if (diffDays < 7) return `${diffDays}g fa`;
    return dateObj.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  };

  const SheetContainer = ({ children }: { children: React.ReactNode }) => {
    if (isLiquidGlassSupported) {
      return (
        <LiquidGlassView
          style={[styles.modalContainer, { backgroundColor: 'rgba(18, 18, 22, 0.55)', overflow: 'hidden' }]}
          interactive={true}
          effect="clear"
          colorScheme="dark"
        >
          <Pressable style={{ flex: 1 }} onPress={() => { }}>
            {children}
          </Pressable>
        </LiquidGlassView>
      );
    }
    return (
      <Pressable style={styles.modalContainer} onPress={() => { }}>
        {children}
      </Pressable>
    );
  };

  const repoUrl = currentWorkstation?.repositoryUrl || currentWorkstation?.githubUrl;
  const repoName = repoUrl ? repoUrl.split('/').pop()?.replace('.git', '') : 'Repository';
  const repoOwner = repoUrl ? repoUrl.split('/').slice(-2, -1)[0] : '';
  const isOwnRepo = linkedAccount?.username?.toLowerCase() === repoOwner?.toLowerCase();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
      <Pressable style={styles.backdrop} onPress={onClose}>
        <SheetContainer>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.gitIcon}>
                <Ionicons name="git-branch" size={18} color="#fff" />
              </View>
              <View style={styles.headerTitleContainer}>
                <Text style={styles.headerTitle} numberOfLines={1}>{repoName}</Text>
                <Text style={styles.headerSubtitle}>{repoOwner}</Text>
              </View>
            </View>
            <View style={styles.headerActions}>
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
                  {section === 'commits' ? t('git.commit') : section === 'branches' ? t('git.branch') : t('git.changes')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Content */}
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={true}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#fff" />
            }
          >
            {gitLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={AppColors.primary} />
                {errorMsg && (
                  <Text style={styles.loadingText}>{errorMsg}</Text>
                )}
              </View>
            ) : activeSection === 'commits' ? (
              <View style={styles.commitsList}>


                {commits.slice(0, 10).map((commit, index) => (
                  <TouchableOpacity
                    key={commit.hash || index}
                    style={styles.commitItem}
                    onPress={() => commit.url && Linking.openURL(commit.url)}
                    activeOpacity={0.7}
                  >
                    {/* Timeline */}
                    <View style={styles.timeline}>
                      {index > 0 && <View style={[styles.timelineLine, styles.timelineLineTop]} />}
                      <View style={[
                        styles.timelineDot,
                        commit.isHead && styles.timelineDotHead
                      ]}>
                        {commit.isHead && (
                          <View style={styles.timelineDotInner} />
                        )}
                      </View>
                      {index < Math.min(commits.length - 1, 9) && (
                        <View style={[styles.timelineLine, styles.timelineLineBottom]} />
                      )}
                    </View>

                    {/* Content */}
                    <View style={styles.commitContent}>
                      {/* HEAD badges on first line */}
                      {commit.isHead && (
                        <View style={styles.commitBadgesRow}>
                          <View style={styles.branchBadgeInline}>
                            <Ionicons name="git-branch" size={11} color="#fff" />
                            <Text style={styles.branchBadgeInlineText}>{currentBranch}</Text>
                          </View>
                          <View style={styles.headBadgeInline}>
                            <Text style={styles.headBadgeInlineText}>HEAD</Text>
                          </View>
                        </View>
                      )}
                      <Text style={styles.commitMessage} numberOfLines={2}>
                        {commit.message}
                      </Text>
                      <View style={styles.commitMeta}>
                        {commit.authorAvatar ? (
                          <Image source={{ uri: commit.authorAvatar }} style={styles.commitAvatarSmall} />
                        ) : (
                          <View style={[styles.commitAvatarSmall, styles.commitAvatarPlaceholder]}>
                            <Text style={styles.commitAvatarTextSmall}>
                              {commit.author.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.commitAuthor}>{commit.authorLogin || commit.author}</Text>
                        <Text style={styles.commitHash}>{commit.shortHash}</Text>
                        <Text style={styles.commitDate}>{formatDate(commit.date)}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
                {commits.length === 0 && (
                  <View style={styles.emptyState}>
                    {!repoUrl ? (
                      // Progetto creato in-app, non connesso a GitHub
                      <>
                        <View style={styles.connectGitIcon}>
                          <Ionicons name="logo-github" size={32} color="rgba(255,255,255,0.4)" />
                        </View>
                        <Text style={styles.connectGitTitle}>{t('connectRepo.title')}</Text>
                        <Text style={styles.connectGitSubtitle}>
                          {t('connectRepo.noAccountsAvailable')}
                        </Text>
                        <TouchableOpacity
                          style={styles.connectGitButton}
                          onPress={() => setShowConnectModal(true)}
                        >
                          <Ionicons name="add-circle-outline" size={18} color="#fff" />
                          <Text style={styles.connectGitButtonText}>{t('connectRepo.title')}</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      // Repository collegato ma nessun commit
                      <>
                        <Ionicons name="git-commit-outline" size={40} color="rgba(255,255,255,0.2)" />
                        <Text style={styles.emptyStateText}>
                          {errorMsg || t('terminal:git.noCommitsFound')}
                        </Text>
                        {errorMsg && (
                          <TouchableOpacity onPress={() => loadGitData()} style={styles.retryButton}>
                            <Text style={styles.retryText}>{t('common:retry')}</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                  </View>
                )}
                {commits.length > 10 && (
                  <TouchableOpacity style={styles.showMoreBtn} onPress={expandToTab}>
                    <Text style={styles.showMoreText}>{t('terminal:git.showAllCommits', { count: commits.length })}</Text>
                    <Ionicons name="chevron-forward" size={14} color={AppColors.primary} />
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
                        <Text style={styles.currentBadgeText}>{t('terminal:git.current')}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.changesContainer}>
                {allChangedFiles.length > 0 ? (
                  <>
                    {/* Select All Header */}
                    <TouchableOpacity style={styles.selectAllRow} onPress={toggleSelectAll}>
                      <Ionicons
                        name={selectedFiles.size === allChangedFiles.length ? "checkmark-circle" : "ellipse-outline"}
                        size={18}
                        color={selectedFiles.size === allChangedFiles.length ? AppColors.primary : 'rgba(255,255,255,0.4)'}
                      />
                      <Text style={styles.selectAllText}>
                        {selectedFiles.size === allChangedFiles.length ? t('common:deselectAll') : t('common:selectAll')}
                      </Text>
                      <Text style={styles.selectedCount}>{selectedFiles.size}/{allChangedFiles.length}</Text>
                    </TouchableOpacity>

                    {/* File List with Checkboxes */}
                    {(gitStatus?.modified?.length ?? 0) > 0 && (
                      <View style={styles.changeSection}>
                        <Text style={styles.changeSectionTitle}>{t('terminal:git.modified')}</Text>
                        {gitStatus!.modified.map((file) => (
                          <TouchableOpacity key={`mod-${file}`} style={styles.changeItem} onPress={() => toggleFileSelection(file)}>
                            <Ionicons
                              name={selectedFiles.has(file) ? "checkmark-circle" : "ellipse-outline"}
                              size={16}
                              color={selectedFiles.has(file) ? AppColors.primary : 'rgba(255,255,255,0.3)'}
                            />
                            <Ionicons name="create-outline" size={14} color="#f59e0b" />
                            <Text style={styles.changeFileName} numberOfLines={1}>{file}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    {(gitStatus?.untracked?.length ?? 0) > 0 && (
                      <View style={styles.changeSection}>
                        <Text style={styles.changeSectionTitle}>{t('terminal:git.new')}</Text>
                        {gitStatus!.untracked.map((file) => (
                          <TouchableOpacity key={`untracked-${file}`} style={styles.changeItem} onPress={() => toggleFileSelection(file)}>
                            <Ionicons
                              name={selectedFiles.has(file) ? "checkmark-circle" : "ellipse-outline"}
                              size={16}
                              color={selectedFiles.has(file) ? AppColors.primary : 'rgba(255,255,255,0.3)'}
                            />
                            <Ionicons name="add-circle-outline" size={14} color="#22c55e" />
                            <Text style={styles.changeFileName} numberOfLines={1}>{file}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    {(gitStatus?.deleted?.length ?? 0) > 0 && (
                      <View style={styles.changeSection}>
                        <Text style={styles.changeSectionTitle}>{t('common:deleted').toUpperCase()}</Text>
                        {gitStatus!.deleted.map((file) => (
                          <TouchableOpacity key={`del-${file}`} style={styles.changeItem} onPress={() => toggleFileSelection(file)}>
                            <Ionicons
                              name={selectedFiles.has(file) ? "checkmark-circle" : "ellipse-outline"}
                              size={16}
                              color={selectedFiles.has(file) ? AppColors.primary : 'rgba(255,255,255,0.3)'}
                            />
                            <Ionicons name="trash-outline" size={14} color="#ef4444" />
                            <Text style={styles.changeFileName} numberOfLines={1}>{file}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {/* Commit Button or Auth Required */}
                    {gitAccounts.length === 0 ? (
                      <View style={styles.authRequiredContainer}>
                        <View style={styles.authRequiredBanner}>
                          <Ionicons name="lock-closed" size={16} color="#FFB800" />
                          <Text style={styles.authRequiredText}>
                            {t('terminal:git.authRequiredForCommit')}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.authRequiredBtn}
                          onPress={() => setShowAddAccountModal(true)}
                        >
                          <Ionicons name="log-in-outline" size={18} color="#fff" />
                          <Text style={styles.authRequiredBtnText}>{t('terminal:git.linkGitHubAccount')}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.createCommitBtn, selectedFiles.size === 0 && styles.createCommitBtnDisabled]}
                        onPress={() => {
                          if (selectedFiles.size === 0) {
                            Alert.alert(t('terminal:git.selectFiles'), t('terminal:git.selectAtLeastOneFile'));
                            return;
                          }
                          setShowCommitModal(true);
                        }}
                      >
                        <Ionicons name="git-commit-outline" size={18} color="#fff" />
                        <Text style={styles.createCommitBtnText}>
                          {t('terminal:git.createCommit')} ({selectedFiles.size === 1 ? t('terminal:git.filesSelected', { count: selectedFiles.size }) : t('terminal:git.filesSelectedPlural', { count: selectedFiles.size })})
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <View style={styles.emptyState}>
                    <Ionicons name="checkmark-circle-outline" size={40} color="rgba(255,255,255,0.2)" />
                    <Text style={styles.emptyStateText}>{t('terminal:git.noChanges')}</Text>
                  </View>
                )}
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
        </SheetContainer>
      </Pressable>

      <AddGitAccountModal
        visible={showAddAccountModal}
        onClose={() => setShowAddAccountModal(false)}
        onAccountAdded={loadAccountInfo}
      />

      <ConnectRepoModal
        visible={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onConnected={(newRepoUrl) => {
          setShowConnectModal(false);
          // Reset loading state and reload with the new repo URL
          isLoadingRef.current = false;
          hasStartedRef.current = false;
          // Small delay to let state propagate, then reload with the new URL
          setTimeout(() => {
            loadGitData(accountsRef.current, newRepoUrl);
          }, 300);
        }}
        projectName={currentWorkstation?.name}
      />

      {/* Account Picker Modal */}
      <Modal
        visible={showAccountPicker}
        transparent
        animationType="none"
        onRequestClose={() => setShowAccountPicker(false)}
        statusBarTranslucent
      >
        <Animated.View
          style={styles.pickerBackdrop}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowAccountPicker(false)} />
          <Animated.View
            style={styles.pickerContainer}
            entering={SlideInDown.duration(250)}
            exiting={SlideOutDown.duration(200)}
          >
            <Text style={styles.pickerTitle}>{t('git.selectAccount')}</Text>
            <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
              {gitAccounts.map((account) => (
                <TouchableOpacity
                  key={account.id}
                  style={[
                    styles.pickerItem,
                    linkedAccount?.id === account.id && styles.pickerItemActive
                  ]}
                  onPress={() => {
                    setLinkedAccount(account);
                    setShowAccountPicker(false);
                  }}
                >
                  <Image source={{ uri: account.avatarUrl }} style={styles.pickerAvatar} />
                  <View style={styles.pickerItemContent}>
                    <Text style={styles.pickerItemName}>{account.username}</Text>
                    <Text style={styles.pickerItemProvider}>{account.provider}</Text>
                  </View>
                  {linkedAccount?.id === account.id && (
                    <Ionicons name="checkmark-circle" size={20} color={AppColors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.pickerAddBtn}
              onPress={() => {
                setShowAccountPicker(false);
                setShowAddAccountModal(true);
              }}
            >
              <Ionicons name="add-circle-outline" size={20} color={AppColors.primary} />
              <Text style={styles.pickerAddText}>{t('git.linkAccount')}</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Commit Modal */}
      <Modal
        visible={showCommitModal}
        transparent
        animationType="none"
        onRequestClose={() => setShowCommitModal(false)}
        statusBarTranslucent
      >
        <Animated.View
          style={styles.commitModalBackdrop}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCommitModal(false)} />
          <Animated.View
            style={styles.commitModalContainer}
            entering={FadeIn.duration(250).springify()}
            exiting={FadeOut.duration(200)}
          >
            <View style={styles.commitModalHeader}>
              <Text style={styles.commitModalTitle}>{t('git.commit')}</Text>
              <TouchableOpacity onPress={() => setShowCommitModal(false)}>
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>

            <View style={styles.commitModalFilesSummary}>
              <Ionicons name="documents-outline" size={16} color={AppColors.primary} />
              <Text style={styles.commitModalFilesText}>
                {selectedFiles.size === 1 ? t('terminal:git.filesSelected', { count: selectedFiles.size }) : t('terminal:git.filesSelectedPlural', { count: selectedFiles.size })}
              </Text>
            </View>

            <TextInput
              style={styles.commitModalInput}
              placeholder={t('terminal:git.commitMessagePlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={commitMessage}
              onChangeText={setCommitMessage}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={styles.commitModalActions}>
              <TouchableOpacity
                style={[styles.commitModalBtn, !commitMessage.trim() && styles.commitModalBtnDisabled]}
                onPress={async () => {
                  await handleCommit();
                  setShowCommitModal(false);
                }}
                disabled={!commitMessage.trim() || !!actionLoading}
              >
                {actionLoading === 'commit' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text style={styles.commitModalBtnText}>Commit</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.commitModalPushBtn, !isOwnRepo && styles.pushBtnWarning]}
                onPress={async () => {
                  if (commitMessage.trim()) {
                    await handleCommit();
                  }
                  await handleGitAction('push');
                  setShowCommitModal(false);
                }}
                disabled={!!actionLoading}
              >
                {actionLoading === 'push' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name={isOwnRepo ? "cloud-upload" : "lock-closed"} size={18} color={isOwnRepo ? "#fff" : "#f59e0b"} />
                    <Text style={[styles.commitModalPushBtnText, !isOwnRepo && styles.pushBtnTextWarning]}>Push</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 420,
    maxHeight: MODAL_HEIGHT,
    minHeight: 500,
    backgroundColor: 'rgba(18, 18, 22, 0.92)',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
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
    flex: 1,
    flexShrink: 1,
    marginRight: 10,
    overflow: 'hidden',
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
    flex: 1,
    flexShrink: 1,
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
    flexShrink: 0,
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
  contentContainer: {
    paddingBottom: 20,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
  },
  commitsList: {
    paddingLeft: 4,
  },
  commitItem: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 56,
  },
  timeline: {
    width: 24,
    position: 'relative',
  },
  timelineLine: {
    width: 2,
    backgroundColor: 'rgba(139, 92, 246, 0.3)',
    position: 'absolute',
    left: 11,
  },
  timelineLineTop: {
    top: 0,
    height: '50%',
  },
  timelineLineBottom: {
    bottom: 0,
    height: '50%',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1a1a1c',
    borderWidth: 2,
    borderColor: 'rgba(139, 92, 246, 0.6)',
    position: 'absolute',
    left: 7,
    top: 8,
    zIndex: 1,
  },
  timelineDotHead: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: AppColors.primary,
    borderWidth: 0,
    position: 'absolute',
    left: 5,
    top: 6,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 1,
  },
  timelineDotInner: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#fff',
  },
  commitContent: {
    flex: 1,
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 4,
    gap: 4,
  },
  commitBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  branchBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: AppColors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  branchBadgeInlineText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  headBadgeInline: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  headBadgeInlineText: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  commitMessage: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
    lineHeight: 18,
  },
  commitMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  commitAvatarSmall: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  commitAvatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commitAvatarTextSmall: {
    fontSize: 8,
    fontWeight: '600',
    color: '#fff',
  },
  commitHash: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: 'rgba(255,255,255,0.4)',
  },
  commitAuthor: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
  },
  commitDate: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
  },
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginLeft: 24,
    marginTop: 4,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 8,
  },
  showMoreText: {
    fontSize: 12,
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
    paddingTop: 4,
    paddingBottom: 20,
  },
  changeSection: {
    marginBottom: 16,
  },
  changeSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  changeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 6,
    marginBottom: 4,
  },
  changeFileName: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  connectGitIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  connectGitTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  connectGitSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 18,
    marginBottom: 16,
  },
  connectGitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: AppColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  connectGitButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    marginBottom: 8,
  },
  selectAllText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    flex: 1,
  },
  selectedCount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  commitSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  commitInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 13,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  commitActions: {
    flexDirection: 'row',
    gap: 8,
  },
  commitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: AppColors.primary,
    paddingVertical: 12,
    borderRadius: 8,
  },
  commitBtnDisabled: {
    opacity: 0.4,
  },
  commitBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  pushBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  pushBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  pushBtnWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  pushBtnTextWarning: {
    color: '#f59e0b',
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
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: '#1a1a1c',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: 400,
    paddingBottom: 30,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  pickerList: {
    maxHeight: 250,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  pickerItemActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  pickerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  pickerItemContent: {
    flex: 1,
  },
  pickerItemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  pickerItemProvider: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'capitalize',
  },
  pickerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 10,
  },
  pickerAddText: {
    fontSize: 14,
    fontWeight: '500',
    color: AppColors.primary,
  },
  createCommitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: AppColors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  createCommitBtnDisabled: {
    opacity: 0.35,
  },
  createCommitBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  authRequiredContainer: {
    marginTop: 16,
    gap: 12,
  },
  authRequiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 184, 0, 0.1)',
    borderRadius: 50,
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 0, 0.2)',
  },
  authRequiredText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FFB800',
    textAlign: 'center',
  },
  authRequiredBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: AppColors.primary,
    paddingVertical: 14,
    borderRadius: 50,
  },
  authRequiredBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  commitModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  commitModalContainer: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#1a1a1e',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  commitModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  commitModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  commitModalFilesSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 16,
  },
  commitModalFilesText: {
    fontSize: 13,
    fontWeight: '500',
    color: AppColors.primary,
  },
  commitModalInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 14,
    minHeight: 80,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  commitModalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  commitModalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: AppColors.primary,
    paddingVertical: 14,
    borderRadius: 12,
  },
  commitModalBtnDisabled: {
    opacity: 0.4,
  },
  commitModalBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  commitModalPushBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  commitModalPushBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
});
