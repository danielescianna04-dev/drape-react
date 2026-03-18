import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, Animated as RNAnimated, ActivityIndicator, RefreshControl, Linking, Dimensions, Pressable, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import { Button } from '../../../shared/components/atoms/Button';
import { Input } from '../../../shared/components/atoms/Input';
import { AppColors } from '../../../shared/theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { gitAccountService, GitAccount, GIT_PROVIDERS } from '../../../core/git/gitAccountService';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { useGitCacheStore } from '../../../core/cache/gitCacheStore';
import { useFileCacheStore } from '../../../core/cache/fileCacheStore';
import { workstationService } from '../../../core/workstation/workstationService-firebase';
import { config } from '../../../config/config';
import { getAuthHeaders } from '../../../core/api/getAuthToken';
import { AddGitAccountModal } from '../../settings/components/AddGitAccountModal';
import { githubService, GitHubCommit } from '../../../core/github/githubService';
import { useTabStore } from '../../../core/tabs/tabStore';
import { ConnectRepoModal } from './ConnectRepoModal';
import { useTranslation } from 'react-i18next';
import { tracciaAzioneGit, tracciaCommitCreato, tracciaCambioBranch, tracciaAuthGit, tracciaAuthGitRiuscita, tracciaErroreAuthGit, tracciaRepoConnesso, tracciaTabGitCambiato, tracciaBranchCreato, tracciaCronologiaCommit, tracciaSelezionaTuttoGit, tracciaAccountGitCollegato, tracciaConnettiRepo, tracciaPushEffettuato, tracciaErrore, tracciaPullEffettuato, tracciaErrorePull, tracciaErrorePush, tracciaErroreCommit, tracciaErroreCambioBranch, tracciaErroreCreazioneBranch } from '../../../core/services/analyticsService';

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
  branches?: string[];
  tags?: string[];
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
  const [currentBranch, _setCurrentBranch] = useState<string>('main');
  // Guard: never allow raw git status lines like "(HEAD detached at abc1234)" as branch name
  const setCurrentBranch = (branch: string) => {
    if (!branch || branch.startsWith('(HEAD detached')) return;
    _setCurrentBranch(branch);
  };
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [gitLoading, setGitLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusRefreshing, setStatusRefreshing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [commitMessage, setCommitMessage] = useState('');
  const [commitDescription, setCommitDescription] = useState('');
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [showCreateBranch, setShowCreateBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [diffFile, setDiffFile] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [fileContextMenu, setFileContextMenu] = useState<{
    y: number;
    file: string;
    type: 'modified' | 'untracked' | 'deleted';
  } | null>(null);
  const [expandedChangeFolders, setExpandedChangeFolders] = useState<Set<string>>(new Set());
  const [commitContextMenu, setCommitContextMenu] = useState<{ hash: string; shortHash: string; message: string } | null>(null);
  const [newBranchFromCommit, setNewBranchFromCommit] = useState<string | null>(null);
  const [branchFromName, setBranchFromName] = useState('');
  const [remoteHead, setRemoteHead] = useState<string | null>(null);
  const [aheadCount, setAheadCount] = useState(0);
  const [behindCount, setBehindCount] = useState(0);
  const [commitBranchMap, setCommitBranchMap] = useState<Record<string, string[]>>({});
  const [isDetachedHead, setIsDetachedHead] = useState(false);
  const [detachedAt, setDetachedAt] = useState<string | null>(null);
  const previousBranchRef = useRef<string>('main');
  const [commitFilesModal, setCommitFilesModal] = useState<{ hash: string; shortHash: string; message: string } | null>(null);
  const [commitFiles, setCommitFiles] = useState<{ status: string; file: string }[]>([]);
  const [commitFilesLoading, setCommitFilesLoading] = useState(false);
  const [commitCollapsedFolders, setCommitCollapsedFolders] = useState<Set<string>>(new Set());
  const [expandedCommitFile, setExpandedCommitFile] = useState<string | null>(null);
  const [expandedCommitDiff, setExpandedCommitDiff] = useState<string | null>(null);
  const [expandedCommitDiffLoading, setExpandedCommitDiffLoading] = useState(false);
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

  // Branch filter state
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string | null>(null);
  const [filteredCommits, setFilteredCommits] = useState<GitCommit[]>([]);
  const [branchFilterLoading, setBranchFilterLoading] = useState(false);
  const [branchCommitsCache, setBranchCommitsCache] = useState<Record<string, GitCommit[]>>({});

  const shimmerAnim = useRef(new RNAnimated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const { addTab, setActiveTab, tabs } = useTabStore();

  const currentWorkstation = useTerminalStore((state) => state.currentWorkstation);
  const userId = useTerminalStore.getState().userId || 'anonymous';

  // Use refs to store accounts and loading state (avoids async state issues)
  const accountsRef = useRef<GitAccount[]>([]);
  const isLoadingRef = useRef(false);
  const hasStartedRef = useRef(false); // Prevent double-start from React StrictMode
  const skipAutoFilterRef = useRef(false); // Skip auto-filter after push/pull

  useEffect(() => {
    if (visible && currentWorkstation?.id) {
      // Prevent double-start from React StrictMode or rapid prop changes
      if (hasStartedRef.current) {
        return;
      }
      hasStartedRef.current = true;

      // 🚀 CHECK CACHE FIRST - instant UI if we have prefetched data
      const cachedData = useGitCacheStore.getState().getGitData(currentWorkstation.id);
      const isCacheValid = useGitCacheStore.getState().isCacheValid(currentWorkstation.id, 5 * 60 * 1000); // 5 min

      if (cachedData && isCacheValid) {
        // Set commits/branches from cache immediately (stable data)
        setCommits(cachedData.commits.map(c => ({ ...c, date: new Date(c.date) })));
        setBranches(cachedData.branches);
        setCurrentBranch(cachedData.currentBranch);
        setIsGitRepo(cachedData.isGitRepo);
        // NOTE: Don't load status from cache — it's too volatile (user edits files between sessions).
        // Always fetch fresh status from backend.
        setGitLoading(false);
        setLoading(false);

        // Refresh in background (including fresh status)
        loadAccountInfo().then(accounts => loadGitData(accounts || [])).catch((err) => console.warn('[Git] Background refresh failed:', err?.message || err));
        return;
      }

      // No cache - load normally
      setGitLoading(true);

      const timeoutId = setTimeout(() => {
        const cachedCount = accountsRef.current.length;
        console.warn(`⏰ [GitSheet] loadAccountInfo timeout (10s) - using ${cachedCount} cached accounts`);
        // Use cached accounts from ref (from previous successful load) instead of empty array
        loadGitData(accountsRef.current);
      }, 10000);

      loadAccountInfo().then((accounts) => {
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
      // Reset all sub-modal states to prevent stale overlays blocking touches
      setCommitContextMenu(null);
      setNewBranchFromCommit(null);
      setBranchFromName('');
      setCommitFilesModal(null);
      setCommitFiles([]);
      setCommitFilesLoading(false);
      setDiffFile(null);
      setDiffContent(null);
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
      // Reset branch filter state
      setSelectedBranchFilter(null);
      setFilteredCommits([]);
      setBranchFilterLoading(false);
      setBranchCommitsCache({});
    }
  }, [visible, currentWorkstation?.id]);


  const loadAccountInfo = async (): Promise<GitAccount[]> => {
    const startTime = Date.now();
    try {
      const accounts = await gitAccountService.getAllAccounts(userId);
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
      setLoading(false);
    }
  };

  const loadGitData = async (passedAccounts?: GitAccount[], overrideRepoUrl?: string) => {
    if (!currentWorkstation?.id) return;

    // Prevent multiple simultaneous calls
    if (isLoadingRef.current) {
      return;
    }
    isLoadingRef.current = true;

    const totalStart = Date.now();
    setGitLoading(true);
    setErrorMsg(null);
    // Reset branch filter on fresh load
    setSelectedBranchFilter(null);
    setFilteredCommits([]);
    setBranchCommitsCache({});

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

          try {
            // Get token - use passed accounts or ref to avoid Firebase call
            const tokenStart = Date.now();
            let token: string | null = null;
            const accounts = passedAccounts || accountsRef.current;
            const githubAccount = accounts.find(a => a.provider === 'github');
            if (githubAccount) {
              token = await gitAccountService.getToken(githubAccount, userId);
            }

            // Fetch from GitHub API (FAST!)
            const apiStart = Date.now();
            const [commitsData, branchesData, tagsData] = await Promise.all([
              githubService.getCommits(owner, repo, token),
              githubService.getBranches(owner, repo, token),
              githubService.getTags(owner, repo, token),
            ]);

            if (commitsData && commitsData.length > 0) {

              // Determine current branch from GitHub default
              localCurrentBranch = branchesData?.find((b: any) => b.name === 'main' || b.name === 'master')?.name || 'main';

              // Build refs map: shortHash -> { branches, tags }
              const refsMap: Record<string, { branches: string[]; tags: string[] }> = {};
              if (branchesData) {
                for (const b of branchesData) {
                  const sha7 = b.commit?.sha?.substring(0, 7);
                  if (sha7) {
                    if (!refsMap[sha7]) refsMap[sha7] = { branches: [], tags: [] };
                    refsMap[sha7].branches.push(b.name);
                  }
                }
              }
              if (tagsData) {
                for (const t of tagsData) {
                  if (t.sha) {
                    const tagSha7 = t.sha.substring(0, 7);
                    if (!refsMap[tagSha7]) refsMap[tagSha7] = { branches: [], tags: [] };
                    refsMap[tagSha7].tags.push(t.name);
                  }
                }
              }

              const githubCommits: GitCommit[] = commitsData.map((c: GitHubCommit, index: number) => {
                const sh = c.sha.substring(0, 7);
                const refs = refsMap[sh];
                return {
                  hash: c.sha,
                  shortHash: sh,
                  message: c.message.split('\n')[0],
                  author: c.author.name,
                  authorEmail: c.author.email,
                  authorAvatar: c.author.avatar_url,
                  authorLogin: c.author.login,
                  date: new Date(c.author.date),
                  isHead: index === 0,
                  branch: index === 0 ? localCurrentBranch : undefined,
                  url: c.url,
                  branches: refs?.branches,
                  tags: refs?.tags,
                };
              });

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
      await fetchBackendStatus(localCurrentBranch);

    } catch (error) {
      console.error('Error loading git data:', error);
      if (commits.length === 0) {
        setErrorMsg(t('terminal:git.unableToLoadData'));
      }
    } finally {
      setGitLoading(false);
      isLoadingRef.current = false; // Reset guard
    }
  };

  // Separate function for backend fetch (can run in background)
  const fetchStatusAbortRef = useRef<AbortController | null>(null);
  const fetchBackendStatus = async (currentBranchName: string) => {
    if (!currentWorkstation?.id) return;
    // Abort any in-flight request to prevent duplicate processing
    if (fetchStatusAbortRef.current) {
      fetchStatusAbortRef.current.abort();
    }
    const abortController = new AbortController();
    fetchStatusAbortRef.current = abortController;

    setStatusRefreshing(true);
    try {
      const authHeaders = await getAuthHeaders();
      const signal = abortController.signal;
      const [localResponse, branchesResponse, refsResponse] = await Promise.all([
        fetch(`${config.apiUrl}/git/status/${currentWorkstation.id}`, { headers: authHeaders, signal }),
        fetch(`${config.apiUrl}/git/branches/${currentWorkstation.id}`, { headers: authHeaders, signal }).catch(() => null),
        fetch(`${config.apiUrl}/git/refs/${currentWorkstation.id}`, { headers: authHeaders, signal }).catch(() => null),
      ]);

      if (!localResponse.ok) {
        console.error(`[GitSheet] Status API error: ${localResponse.status}`);
        return;
      }

      // Update branches from backend (includes local branches)
      if (branchesResponse?.ok) {
        try {
          const branchData = await branchesResponse.json();
          if (branchData.branches && branchData.branches.length > 0) {
            const backendBranches: GitBranch[] = branchData.branches.map((name: string) => ({
              name,
              isCurrent: name === (branchData.current || currentBranchName),
              isRemote: false,
            }));
            setBranches(prev => {
              // Merge: keep remote-only branches from GitHub, add/update local branches
              const localNames = new Set(backendBranches.map((b: GitBranch) => b.name));
              const remoteOnly = prev.filter(b => b.isRemote && !localNames.has(b.name));
              const merged = [...backendBranches, ...remoteOnly];

              // Update cache with merged branches so they persist across opens
              const cached = useGitCacheStore.getState().getGitData(currentWorkstation!.id);
              if (cached) {
                useGitCacheStore.getState().setGitData(currentWorkstation!.id, {
                  ...cached,
                  branches: merged.map(b => ({ name: b.name, isCurrent: b.isCurrent, isRemote: b.isRemote })),
                });
              }

              return merged;
            });

            // Update currentBranch from backend (authoritative)
            if (branchData.current) {
              setCurrentBranch(branchData.current);
            }
          }
        } catch { /* ignore parse errors */ }
      }

      const localData = await localResponse.json();
      console.log('[GitSheet] Backend status response:', JSON.stringify({
        isGitRepo: localData?.isGitRepo,
        modified: localData?.changes?.modified?.length,
        untracked: localData?.changes?.untracked?.length,
        deleted: localData?.changes?.deleted?.length,
      }));

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
        }

        // Update branch from backend (more accurate than GitHub default guess)
        if (localData.branch) {
          setCurrentBranch(localData.branch);
        }

        // Remote tracking info (for pushed/unpushed distinction)
        if (localData.remoteHead) setRemoteHead(localData.remoteHead);
        if (localData.ahead !== undefined) setAheadCount(localData.ahead);
        if (localData.behind !== undefined) setBehindCount(localData.behind);
        setIsDetachedHead(!!localData.isDetachedHead);
        setDetachedAt(localData.detachedAt || null);
        if (localData.commitBranches) setCommitBranchMap(localData.commitBranches);

        // Reset skip flag if set (after push/pull)
        if (skipAutoFilterRef.current) {
          skipAutoFilterRef.current = false;
        }
        // Default to "All" view — no auto-filter to current branch

        // Merge local commits with existing GitHub commits
        // Local commits from backend include unpushed commits
        if (localData.commits && localData.commits.length > 0) {
          setCommits(prev => {
            const existingHashes = new Set(prev.map(c => c.shortHash || c.hash?.substring(0, 7)));
            const localOnly: GitCommit[] = localData.commits
              .filter((lc: any) => !existingHashes.has(lc.hash?.substring(0, 7)))
              .map((lc: any) => ({
                hash: lc.hash,
                shortHash: lc.hash?.substring(0, 7),
                message: lc.message,
                author: '',
                date: lc.authorDate ? new Date(lc.authorDate) : new Date(),
                isHead: false,
              }));

            if (localOnly.length > 0) {
              // Merge local + existing commits, sorted by date (newest first)
              const merged = [...localOnly, ...prev]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((c, i) => ({
                  ...c,
                  isHead: i === 0,
                  branch: i === 0 && localData.branch ? localData.branch : (i === 0 ? c.branch : undefined),
                }));
              return merged;
            }
            return prev;
          });
        }

        // Update commits with backend refs (branches + tags per commit)
        if (refsResponse?.ok) {
          try {
            const refsData = await refsResponse.json();
            if (refsData.refs) {
              const backendRefs = refsData.refs as Record<string, { branches: string[]; tags: string[] }>;
              setCommits(prev => prev.map(c => {
                const r = backendRefs[c.shortHash];
                if (r) {
                  return { ...c, branches: r.branches, tags: r.tags };
                }
                return c;
              }));
            }
          } catch { /* ignore */ }
        }

        // Update cache with status
        const cached = useGitCacheStore.getState().getGitData(currentWorkstation!.id);
        if (cached) {
          useGitCacheStore.getState().setGitData(currentWorkstation!.id, {
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
      if (e.name !== 'AbortError') {
        console.warn('⚠️ [GitSheet] Backend status failed:', e.message);
      }
    } finally {
      setStatusRefreshing(false);
      if (fetchStatusAbortRef.current === abortController) {
        fetchStatusAbortRef.current = null;
      }
    }
  };

  const fetchDiff = async (file: string) => {
    if (!currentWorkstation?.id) return;
    setDiffFile(file);
    setDiffContent(null);
    setDiffLoading(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(
        `${config.apiUrl}/git/diff/${currentWorkstation.id}?file=${encodeURIComponent(file)}`,
        { headers: authHeaders },
      );
      const data = await res.json();
      setDiffContent(data.diff || '');
    } catch (e: any) {
      setDiffContent(`Error loading diff: ${e.message}`);
    } finally {
      setDiffLoading(false);
    }
  };

  const fetchCommitFiles = async (hash: string) => {
    if (!currentWorkstation?.id) return;
    setCommitFilesLoading(true);
    setCommitFiles([]);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(
        `${config.apiUrl}/git/commit-files/${currentWorkstation.id}?commit=${encodeURIComponent(hash)}`,
        { headers: authHeaders },
      );
      const data = await res.json();
      if (data.success) {
        setCommitFiles(data.files || []);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load commit files');
    } finally {
      setCommitFilesLoading(false);
    }
  };

  const fetchCommitDiff = async (commit: string, file: string) => {
    if (!currentWorkstation?.id) return;
    setDiffFile(file);
    setDiffContent(null);
    setDiffLoading(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(
        `${config.apiUrl}/git/commit-diff/${currentWorkstation.id}?commit=${encodeURIComponent(commit)}&file=${encodeURIComponent(file)}`,
        { headers: authHeaders },
      );
      const data = await res.json();
      setDiffContent(data.diff || '');
    } catch (e: any) {
      setDiffContent(`Error loading diff: ${e.message}`);
    } finally {
      setDiffLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setSelectedBranchFilter(null);
    setFilteredCommits([]);
    isLoadingRef.current = false; // Reset guard so loadGitData can proceed
    await Promise.all([loadAccountInfo(), loadGitData()]);
    setRefreshing(false);
  };

  const handleBranchFilterSelect = useCallback(async (branchName: string | null) => {
    setSelectedBranchFilter(branchName);
    if (branchName === null) { setFilteredCommits([]); return; }

    // Check in-memory cache
    if (branchCommitsCache[branchName]) { setFilteredCommits(branchCommitsCache[branchName]); return; }

    // Fetch from GitHub API with sha parameter
    const repoUrl = currentWorkstation?.repositoryUrl || currentWorkstation?.githubUrl;
    if (!repoUrl || !repoUrl.includes('github.com')) return;
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(\.git)?$/) || repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) return;
    const [, owner, repo] = match;

    setBranchFilterLoading(true);
    try {
      const accounts = accountsRef.current;
      const githubAccount = accounts.find(a => a.provider === 'github');
      let token: string | null = null;
      if (githubAccount) token = await gitAccountService.getToken(githubAccount, userId);

      const commitsData = await githubService.getCommits(owner, repo, token || undefined, 1, 30, branchName);
      if (commitsData && commitsData.length > 0) {
        const branchCommits: GitCommit[] = commitsData.map((c: any, index: number) => ({
          hash: c.sha,
          shortHash: c.sha.substring(0, 7),
          message: c.message.split('\n')[0],
          author: c.author.name,
          authorEmail: c.author.email,
          authorAvatar: c.author.avatar_url,
          authorLogin: c.author.login,
          date: new Date(c.author.date),
          isHead: index === 0,
          branch: index === 0 ? branchName : undefined,
          url: c.url,
        }));
        setFilteredCommits(branchCommits);
        setBranchCommitsCache(prev => ({ ...prev, [branchName]: branchCommits }));
      } else {
        setFilteredCommits([]);
      }
    } catch (err: any) {
      console.warn(`[GitSheet] Failed to fetch commits for branch ${branchName}:`, err.message);
      setSelectedBranchFilter(null);
      setFilteredCommits([]);
    } finally {
      setBranchFilterLoading(false);
    }
  }, [currentWorkstation, userId, branchCommitsCache]);

  const handleGitAction = async (action: 'pull' | 'push' | 'fetch') => {
    tracciaAzioneGit(action);
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

    // Block push/pull in detached HEAD state
    if ((action === 'push' || action === 'pull') && isDetachedHead) {
      Alert.alert(
        'Detached HEAD',
        'You are in detached HEAD state. Return to a branch before pushing or pulling.',
        [{ text: 'OK' }]
      );
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
    // For pull, open config modal
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

    // Push: open modal to select destination branch
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
        // Show All commits after push so user sees the latest
        skipAutoFilterRef.current = true;
        setSelectedBranchFilter(null);
        setActiveSection('commits');
        isLoadingRef.current = false;
        await loadGitData();
      } else {
        tracciaErrorePush(data.output || data.error || 'Push failed');
        Alert.alert(t('common:error'), data.output || data.error || 'Push failed');
      }
    } catch (e: any) {
      tracciaErrorePush(e.message || 'Push failed');
      Alert.alert(t('common:error'), e.message || 'Push failed');
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
    } catch (e: any) {
      tracciaErrorePull(e.message || 'Pull failed');
      Alert.alert(t('common:error'), e.message || 'Pull failed');
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

      // 2. Checkout branch
      const response = await fetch(`${config.apiUrl}/git/checkout/${currentWorkstation.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders, 'X-Git-Token': token || '' },
        body: JSON.stringify({ branch: branchName }),
      });

      if (response.ok) {
        // 3. Restore stash only if we actually stashed something
        if (didStash) {
          await fetch(`${config.apiUrl}/git/stash/${currentWorkstation.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders, 'X-Git-Token': token || '' },
            body: JSON.stringify({ action: 'pop' }),
          });
        }
        Alert.alert(t('common:success'), t('terminal:git.branchSwitched'));

        // Invalidate caches and reload (file tree changes on checkout)
        useGitCacheStore.getState().clearCache(currentWorkstation.id);
        useFileCacheStore.getState().clearCache(currentWorkstation.id);
        isLoadingRef.current = false;
        await loadGitData();
      } else {
        // Restore stash if checkout failed and we actually stashed
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
      // Restore stash if checkout threw an exception
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

  const isValidBranchName = (name: string): boolean => {
    // Git branch name rules: no spaces, no ~^:?\*[, no .., no leading/trailing dot or slash, no double slashes
    if (!name) return false;
    if (/[\s~^:?*\[\\]/.test(name)) return false;
    if (name.includes('..')) return false;
    if (name.startsWith('.') || name.startsWith('/') || name.endsWith('.') || name.endsWith('/') || name.endsWith('.lock')) return false;
    if (name.includes('//')) return false;
    if (name.startsWith('-')) return false;
    return true;
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

  // Branch filter: displayCommits returns filtered or all commits
  const BRANCH_COLORS = ['#9B8AFF', '#F97316', '#22D3EE', '#F472B6', '#FBBF24', '#3FB950'];

  const displayCommits = useMemo(() => {
    if (selectedBranchFilter === null) return commits;
    // Use commitBranchMap for local filtering when available
    if (Object.keys(commitBranchMap).length > 0) {
      return commits.filter(c => {
        const hash = c.shortHash || c.hash?.substring(0, 7);
        if (!hash) return true; // no hash → show it
        const branches = commitBranchMap[hash];
        if (!branches) return true; // not in map (older commit) → show it
        return branches.includes(selectedBranchFilter);
      });
    }
    return filteredCommits;
  }, [selectedBranchFilter, commits, filteredCommits, commitBranchMap]);

  const branchColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    const local = branches.filter(b => !b.name.startsWith('origin/'));
    const curIdx = local.findIndex(b => b.isCurrent);
    if (curIdx >= 0) map[local[curIdx].name] = BRANCH_COLORS[0];
    let ci = 1;
    for (const b of local) {
      if (!map[b.name]) { map[b.name] = BRANCH_COLORS[ci % BRANCH_COLORS.length]; ci++; }
    }
    return map;
  }, [branches]);

  // Pre-compute timeline color per commit using backend branch membership
  const commitTimelineColors = useMemo(() => {
    const defaultColor = branchColorMap[currentBranch || 'main'] || BRANCH_COLORS[0];
    const colors: string[] = [];
    for (const c of displayCommits) {
      const hash = c.shortHash || c.hash?.substring(0, 7);
      const memberBranches = hash ? commitBranchMap[hash] : null;
      if (memberBranches && memberBranches.length > 0) {
        if (memberBranches.includes(currentBranch)) {
          // On current branch (even if also on others) → current branch color
          colors.push(defaultColor);
        } else {
          // Exclusively on another branch → that branch's color
          colors.push(branchColorMap[memberBranches[0]] || BRANCH_COLORS[0]);
        }
      } else {
        colors.push(defaultColor);
      }
    }
    return colors;
  }, [displayCommits, currentBranch, branchColorMap, commitBranchMap]);

  // Get all changed files for selection (include staged files too — they're still changes)
  // Deduplicate: a file can appear in multiple categories (e.g. staged + deleted)
  const allChangedFiles = useMemo(() => {
    if (!gitStatus) return [];
    const seen = new Set<string>();
    const result: { file: string; type: 'modified' | 'untracked' | 'deleted' }[] = [];
    // Deleted first (highest priority label)
    for (const f of (gitStatus.deleted || [])) {
      if (!seen.has(f)) { seen.add(f); result.push({ file: f, type: 'deleted' }); }
    }
    // Modified
    for (const f of (gitStatus.modified || [])) {
      if (!seen.has(f)) { seen.add(f); result.push({ file: f, type: 'modified' }); }
    }
    // Staged (only if not already shown as modified/deleted)
    for (const f of (gitStatus.staged || [])) {
      if (!seen.has(f)) { seen.add(f); result.push({ file: f, type: 'modified' }); }
    }
    // Untracked
    for (const f of (gitStatus.untracked || [])) {
      if (!seen.has(f)) { seen.add(f); result.push({ file: f, type: 'untracked' }); }
    }
    return result;
  }, [gitStatus]);

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
          } catch (e: any) {
            console.error('[GitSheet] Discard error:', e);
            Alert.alert(t('common:error'), e?.message || t('terminal:git.discardError'));
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

  // Tree view builder for Changes tab
  interface GitChangeTreeNode {
    name: string;
    path: string;
    type: 'file' | 'folder';
    changeType?: 'modified' | 'untracked' | 'deleted';
    children?: GitChangeTreeNode[];
  }

  const changeFileTree = useMemo((): GitChangeTreeNode[] => {
    if (allChangedFiles.length === 0) return [];

    const root: GitChangeTreeNode[] = [];
    allChangedFiles.forEach(({ file, type }) => {
      // Strip trailing slash (git shows untracked dirs as "dir/")
      const cleanFile = file.endsWith('/') ? file.slice(0, -1) : file;
      if (!cleanFile) return;
      const parts = cleanFile.split('/');
      let currentLevel = root;
      let currentPath = '';
      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isFile = index === parts.length - 1;
        let node = currentLevel.find(n => n.name === part);
        if (!node) {
          node = {
            name: part,
            path: currentPath,
            type: isFile ? 'file' : 'folder',
            changeType: isFile ? type as 'modified' | 'untracked' | 'deleted' : undefined,
            children: isFile ? undefined : [],
          };
          currentLevel.push(node);
        }
        if (!isFile && node.children) currentLevel = node.children;
      });
    });

    const sortNodes = (nodes: GitChangeTreeNode[]): GitChangeTreeNode[] =>
      [...nodes].sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'folder' ? -1 : 1;
      }).map(node => ({
        ...node,
        children: node.children ? sortNodes(node.children) : undefined,
      }));

    return sortNodes(root);
  }, [allChangedFiles]);

  const countFilesRecursive = (node: GitChangeTreeNode): number => {
    if (node.type === 'file') return 1;
    return (node.children || []).reduce((sum, c) => sum + countFilesRecursive(c), 0);
  };

  const renderChangeNode = (node: GitChangeTreeNode, depth: number = 0): React.ReactNode => {
    if (node.type === 'file') {
      const statusIcon = node.changeType === 'modified'
        ? { name: 'create-outline' as const, color: '#f59e0b' }
        : node.changeType === 'untracked'
        ? { name: 'add-circle-outline' as const, color: '#22c55e' }
        : { name: 'trash-outline' as const, color: '#ef4444' };

      return (
        <View key={node.path} style={[styles.changeItem, { marginLeft: depth * 20 }]}>
          <TouchableOpacity onPress={() => toggleFileSelection(node.path)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons
              name={selectedFiles.has(node.path) ? "checkmark-circle" : "ellipse-outline"}
              size={16}
              color={selectedFiles.has(node.path) ? AppColors.primary : 'rgba(255,255,255,0.3)'}
            />
          </TouchableOpacity>
          <Ionicons name={statusIcon.name} size={14} color={statusIcon.color} />
          <TouchableOpacity style={{ flex: 1 }} onPress={() => fetchDiff(node.path)}>
            <Text style={styles.changeFileName} numberOfLines={1}>{node.name}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={(e) => setFileContextMenu({ y: e.nativeEvent.pageY, file: node.path, type: node.changeType! })}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ padding: 4 }}
          >
            <Ionicons name="ellipsis-vertical" size={14} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        </View>
      );
    }

    // Folders are expanded by default (expanded set tracks collapsed ones)
    const isExpanded = !expandedChangeFolders.has(node.path);
    const childCount = countFilesRecursive(node);

    return (
      <View key={node.path}>
        <TouchableOpacity
          style={[styles.changeFolderItem, { marginLeft: depth * 20 }]}
          onPress={() => {
            setExpandedChangeFolders(prev => {
              const next = new Set(prev);
              // Toggle: add to set = collapsed, remove from set = expanded
              next.has(node.path) ? next.delete(node.path) : next.add(node.path);
              return next;
            });
          }}
        >
          <Ionicons
            name={isExpanded ? "chevron-down" : "chevron-forward"}
            size={12}
            color="rgba(255,255,255,0.4)"
          />
          <Ionicons name="folder-outline" size={14} color="rgba(255,255,255,0.5)" />
          <Text style={styles.changeFolderName}>{node.name}</Text>
          <Text style={styles.changeFolderCount}>{childCount}</Text>
        </TouchableOpacity>
        {isExpanded && node.children?.map(child => renderChangeNode(child, depth + 1))}
      </View>
    );
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
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Revert failed');
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
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Cherry-pick failed');
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
    } catch (e: any) {
      tracciaErroreCreazioneBranch(branchName, e.message || 'Branch creation failed');
      Alert.alert('Error', e.message || 'Branch creation failed');
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

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  };

  // Full date for commit list (e.g. "11 Mar 2026, 00:23")
  const formatCommitDate = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return '';
    const day = dateObj.getDate();
    const month = dateObj.toLocaleDateString('en-US', { month: 'short' });
    const year = dateObj.getFullYear();
    const hours = dateObj.getHours().toString().padStart(2, '0');
    const mins = dateObj.getMinutes().toString().padStart(2, '0');
    return `${day} ${month} ${year}, ${hours}:${mins}`;
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
          <View style={{ flex: 1 }}>
            {children}
          </View>
        </LiquidGlassView>
      );
    }
    return (
      <View style={styles.modalContainer}>
        {children}
      </View>
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
      <View style={styles.backdrop} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
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

          {/* Actions Row */}
          <View style={styles.branchRow}>
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
              <View>
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
                {behindCount > 0 && (
                  <View style={styles.actionBadge}>
                    <Text style={styles.actionBadgeText}>{behindCount}</Text>
                  </View>
                )}
              </View>
              <View>
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
                {aheadCount > 0 && (
                  <View style={styles.actionBadge}>
                    <Text style={styles.actionBadgeText}>{aheadCount}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
          {/* Tabs */}
          <View style={styles.tabs}>
            {(['commits', 'branches', 'changes'] as const).map((section) => (
              <TouchableOpacity
                key={section}
                style={[styles.tab, activeSection === section && styles.tabActive]}
                onPress={() => {
                  setActiveSection(section);
                  tracciaTabGitCambiato(section);
                  // Refresh backend status when switching to Changes tab
                  if (section === 'changes') fetchBackendStatus(currentBranch);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={[styles.tabText, activeSection === section && styles.tabTextActive]}>
                    {section === 'commits' ? t('git.commit') : section === 'branches' ? t('git.branch') : t('git.changes')}
                  </Text>
                  {section === 'changes' && isGitRepo && allChangedFiles.length > 0 && (
                    <View style={styles.changesBadge}>
                      <Text style={styles.changesBadgeText}>{allChangedFiles.length}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Content */}
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="handled"
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
            ) : !isGitRepo && !repoUrl ? (
              <View style={styles.emptyState}>
                <View style={styles.connectGitIcon}>
                  <Ionicons name="git-branch-outline" size={32} color="rgba(255,255,255,0.4)" />
                </View>
                <Text style={styles.connectGitTitle}>{t('connectRepo.title')}</Text>
                <Text style={styles.connectGitSubtitle}>
                  {t('connectRepo.noAccountsAvailable')}
                </Text>
                <TouchableOpacity
                  style={styles.connectGitButton}
                  onPress={() => { setShowConnectModal(true); tracciaConnettiRepo(); }}
                >
                  <Ionicons name="add-circle-outline" size={18} color="#fff" />
                  <Text style={styles.connectGitButtonText}>{t('connectRepo.title')}</Text>
                </TouchableOpacity>
              </View>
            ) : activeSection === 'commits' ? (
              <View style={styles.commitsList}>

                {/* Branch filter pills */}
                {(branches.filter(b => !b.name.startsWith('origin/')).length > 1 || new Set(Object.values(commitBranchMap).flat()).size > 1) && (
                  <View style={styles.branchFilterContainer}>
                    <TouchableOpacity
                      style={[styles.branchFilterPill, selectedBranchFilter === null && styles.branchFilterPillActive]}
                      onPress={() => handleBranchFilterSelect(null)}
                    >
                      <Text style={[styles.branchFilterPillText, selectedBranchFilter === null && styles.branchFilterPillTextActive]}>All</Text>
                    </TouchableOpacity>
                    {branches.filter(b => !b.name.startsWith('origin/')).slice(0, 15).map(branch => (
                      <TouchableOpacity
                        key={branch.name}
                        style={[
                          styles.branchFilterPill,
                          selectedBranchFilter === branch.name && styles.branchFilterPillActive,
                          branch.isCurrent && selectedBranchFilter !== branch.name && styles.branchFilterPillCurrent,
                        ]}
                        onPress={() => handleBranchFilterSelect(branch.name)}
                      >
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: branchColorMap[branch.name] || 'rgba(255,255,255,0.3)' }} />
                        <Ionicons name="git-branch" size={11} color={selectedBranchFilter === branch.name ? '#fff' : branch.isCurrent ? AppColors.primary : 'rgba(255,255,255,0.4)'} />
                        <Text style={[styles.branchFilterPillText, selectedBranchFilter === branch.name && styles.branchFilterPillTextActive]}>{branch.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Branch filter loading */}
                {branchFilterLoading && (
                  <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={AppColors.primary} />
                  </View>
                )}

                {/* Detached HEAD — return button */}
                {isDetachedHead && (
                  <TouchableOpacity
                    style={styles.detachedBanner}
                    onPress={async () => {
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
                          useGitCacheStore.getState().clearCache(currentWorkstation!.id);
                          useFileCacheStore.getState().clearCache(currentWorkstation!.id);
                          isLoadingRef.current = false;
                          await loadGitData();
                        } else {
                          Alert.alert('Error', result.output || 'Checkout failed');
                        }
                      } catch (e: any) {
                        tracciaErroreCambioBranch(previousBranchRef.current || currentBranch || 'main', e.message || 'Checkout failed');
                        Alert.alert('Error', e.message);
                      } finally {
                        setActionLoading(null);
                      }
                    }}
                    disabled={!!actionLoading}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="return-up-back" size={14} color="#f59e0b" />
                    <Text style={styles.detachedBannerText}>Return to {previousBranchRef.current || currentBranch}</Text>
                  </TouchableOpacity>
                )}

                {!branchFilterLoading && displayCommits.map((commit, index) => {
                  // Determine if this is the detached HEAD position
                  const isDetachedHere = isDetachedHead && detachedAt && commit.shortHash === detachedAt;
                  // Determine if this commit is pushed by comparing with remoteHead
                  const isRemoteHead = remoteHead && commit.shortHash === remoteHead;
                  const isPushed = !remoteHead || (() => {
                    // If we have remoteHead, all commits at or after remoteHead index are pushed
                    const remoteIdx = displayCommits.findIndex(c => c.shortHash === remoteHead);
                    return remoteIdx >= 0 ? index >= remoteIdx : !!commit.authorAvatar;
                  })();

                  return (
                  <React.Fragment key={commit.hash || index}>
                  {/* Full-width separator — sits right below unpushed commits */}
                  {index === aheadCount && aheadCount > 0 && selectedBranchFilter === null && (
                    <View style={styles.remoteSeparator}>
                      <View style={styles.remoteSeparatorLine} />
                      <View style={styles.remoteSeparatorBadge}>
                        <Ionicons name="checkmark-circle-outline" size={11} color="#8b8b8b" />
                        <Text style={styles.remoteSeparatorText}>{t('terminal:git.pushed')}</Text>
                      </View>
                      <View style={styles.remoteSeparatorLine} />
                    </View>
                  )}
                  <View style={[styles.commitItem, isDetachedHere && styles.commitItemDetachedHere]}>
                    {/* Timeline */}
                    <View style={styles.timeline}>
                      {(() => {
                        const tc = selectedBranchFilter
                          ? (branchColorMap[selectedBranchFilter] || BRANCH_COLORS[0])
                          : commitTimelineColors[index] || BRANCH_COLORS[0];
                        return (
                          <>
                            {index > 0 && <View style={[
                              styles.timelineLine,
                              styles.timelineLineTop,
                              !isPushed && styles.timelineLineUnpushed,
                              tc && { backgroundColor: `${tc}30` },
                            ]} />}
                            <View style={[
                              styles.timelineDot,
                              commit.isHead && !isDetachedHead && [
                                styles.timelineDotHead,
                                tc && { backgroundColor: tc, shadowColor: tc },
                              ],
                              isDetachedHere && styles.timelineDotDetached,
                              !isPushed && !commit.isHead && !isDetachedHere && styles.timelineDotUnpushed,
                              tc && !commit.isHead && !isDetachedHere && { borderColor: `${tc}99` },
                            ]}>
                              {(commit.isHead && !isDetachedHead) && (
                                <View style={styles.timelineDotInner} />
                              )}
                              {isDetachedHere && (
                                <View style={styles.timelineDotInnerDetached} />
                              )}
                            </View>
                            {index < displayCommits.length - 1 && (
                              <View style={[
                                styles.timelineLine,
                                styles.timelineLineBottom,
                                !isPushed && styles.timelineLineUnpushed,
                                tc && { backgroundColor: `${tc}30` },
                              ]} />
                            )}
                          </>
                        );
                      })()}
                    </View>

                    {/* Content */}
                    <View style={styles.commitContent}>
                      {/* Badges row: HEAD + branches + tags */}
                      {(commit.isHead || isDetachedHere || (commit.branches && commit.branches.length > 0) || (commit.tags && commit.tags.length > 0)) && (
                        <View style={styles.commitBadgesRow}>
                          {/* HEAD badge */}
                          {commit.isHead && !isDetachedHead && (
                            <>
                              <View style={styles.branchBadgeInline}>
                                <Ionicons name="git-branch" size={11} color="#fff" />
                                <Text style={styles.branchBadgeInlineText}>{currentBranch}</Text>
                              </View>
                              <View style={styles.headBadgeInline}>
                                <Text style={styles.headBadgeInlineText}>HEAD</Text>
                              </View>
                            </>
                          )}
                          {/* Detached HEAD */}
                          {isDetachedHere && (
                            <View style={styles.detachedBadgeInline}>
                              <Ionicons name="warning-outline" size={10} color="#f59e0b" />
                              <Text style={styles.detachedBadgeInlineText}>HEAD (detached)</Text>
                            </View>
                          )}
                          {/* origin/branch when HEAD == remoteHead */}
                          {isRemoteHead && commit.isHead && (
                            <View style={styles.remoteBadgeInline}>
                              <Ionicons name="cloud-outline" size={10} color="rgba(255,255,255,0.7)" />
                              <Text style={styles.remoteBadgeInlineText}>origin/{currentBranch}</Text>
                            </View>
                          )}
                          {/* Other branches pointing to this commit */}
                          {commit.branches?.filter(b => b !== currentBranch && !b.startsWith('origin/')).map(b => (
                            <View key={b} style={[styles.branchRefBadge, { borderColor: `${branchColorMap[b] || '#a78bfa'}40` }]}>
                              <Ionicons name="git-branch" size={10} color={branchColorMap[b] || '#a78bfa'} />
                              <Text style={[styles.branchRefBadgeText, { color: branchColorMap[b] || '#a78bfa' }]}>{b}</Text>
                            </View>
                          ))}
                          {/* Remote branches (origin/*) — hide origin/HEAD (symref noise) and origin/currentBranch when separator already shown */}
                          {commit.branches?.filter(b => {
                            if (!b.startsWith('origin/')) return false;
                            if (b === 'origin/HEAD') return false; // symref to default branch, redundant
                            if (isRemoteHead && b === `origin/${currentBranch}`) return false; // already shown as separator or inline badge
                            return true;
                          }).map(b => (
                            <View key={b} style={styles.remoteBadgeInline}>
                              <Ionicons name="cloud-outline" size={10} color="rgba(255,255,255,0.7)" />
                              <Text style={styles.remoteBadgeInlineText}>{b}</Text>
                            </View>
                          ))}
                          {/* Tags */}
                          {commit.tags?.map(tag => (
                            <View key={tag} style={styles.tagBadge}>
                              <Ionicons name="pricetag-outline" size={10} color="#22d3ee" />
                              <Text style={styles.tagBadgeText}>{tag}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      <Text style={[styles.commitMessage, !isPushed && styles.commitMessageUnpushed]} numberOfLines={1}>
                        {commit.message}
                      </Text>
                      <View style={styles.commitMeta}>
                        {(commit.authorAvatar || linkedAccount?.avatarUrl) ? (
                          <Image source={{ uri: commit.authorAvatar || linkedAccount?.avatarUrl }} style={styles.commitAvatarSmall} />
                        ) : (
                          <View style={[styles.commitAvatarSmall, styles.commitAvatarPlaceholder]}>
                            <Ionicons name="person-outline" size={10} color="rgba(255,255,255,0.6)" />
                          </View>
                        )}
                        <Text style={styles.commitAuthor}>{commit.authorLogin || commit.author || linkedAccount?.username || ''}</Text>
                        <Text style={styles.commitHash}>{commit.shortHash}</Text>
                        <Text style={styles.commitDate}>{formatCommitDate(commit.date)}</Text>
                      </View>
                    </View>

                    {/* 3-dot menu */}
                    <TouchableOpacity
                      style={styles.commitMenuBtn}
                      onPress={() => setCommitContextMenu({ hash: commit.hash, shortHash: commit.shortHash, message: commit.message })}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="ellipsis-vertical" size={16} color="rgba(255,255,255,0.4)" />
                    </TouchableOpacity>
                  </View>
                  </React.Fragment>
                  );
                })}
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
                          onPress={() => { setShowConnectModal(true); tracciaConnettiRepo(); }}
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
              </View>
            ) : activeSection === 'branches' ? (
              <View style={styles.branchesList}>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>Local</Text>
                {branches.filter(b => !b.isRemote && !b.name.startsWith('origin/')).map((branch) => (
                  <View
                    key={branch.name}
                    style={styles.branchItem}
                  >
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
                  </View>
                ))}

                {/* Remote branches */}
                {branches.filter(b => b.isRemote || b.name.startsWith('origin/')).length > 0 && (
                  <>
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginTop: 16, marginBottom: 8, letterSpacing: 0.5 }}>Remote</Text>
                    {branches.filter(b => b.isRemote || b.name.startsWith('origin/')).map((branch) => {
                      const shortName = branch.name.replace(/^origin\//, '');
                      return (
                        <View key={branch.name} style={styles.branchItem}>
                          <View style={styles.branchItemLeft}>
                            <Ionicons name="cloud-outline" size={14} color="rgba(255,255,255,0.35)" />
                            <Text style={[styles.branchItemText, { color: 'rgba(255,255,255,0.5)' }]}>
                              {shortName}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </>
                )}

                {/* Create Branch */}
                {showCreateBranch ? (
                  <View style={styles.createBranchContainer}>
                    <TextInput
                      style={styles.createBranchInput}
                      value={newBranchName}
                      onChangeText={setNewBranchName}
                      placeholder={t('terminal:git.newBranchName')}
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoFocus
                      keyboardAppearance="dark"
                      returnKeyType="done"
                      onSubmitEditing={handleCreateBranch}
                    />
                    <View style={styles.createBranchActions}>
                      <TouchableOpacity
                        onPress={() => { setShowCreateBranch(false); setNewBranchName(''); }}
                        style={styles.createBranchCancelBtn}
                      >
                        <Text style={styles.createBranchCancelText}>{t('common:cancel')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleCreateBranch}
                        disabled={!newBranchName.trim() || actionLoading === 'createBranch'}
                        style={[styles.createBranchConfirmBtn, !newBranchName.trim() && { opacity: 0.4 }]}
                      >
                        {actionLoading === 'createBranch' ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.createBranchConfirmText}>{t('terminal:git.createBranch')}</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.addBranchBtn}
                    onPress={() => setShowCreateBranch(true)}
                  >
                    <Ionicons name="add-circle-outline" size={16} color={AppColors.primary} />
                    <Text style={styles.addBranchText}>{t('terminal:git.createBranch')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.changesContainer}>
                {allChangedFiles.length > 0 ? (
                  <>
                    {/* Select All Header */}
                    <TouchableOpacity style={styles.selectAllRow} onPress={() => { toggleSelectAll(); tracciaSelezionaTuttoGit(); }}>
                      <Ionicons
                        name={selectedFiles.size === allChangedFiles.length && allChangedFiles.length > 0 ? "checkmark-circle" : "ellipse-outline"}
                        size={18}
                        color={selectedFiles.size === allChangedFiles.length && allChangedFiles.length > 0 ? AppColors.primary : 'rgba(255,255,255,0.4)'}
                      />
                      <Text style={styles.selectAllText}>
                        {selectedFiles.size === allChangedFiles.length && allChangedFiles.length > 0 ? t('common:deselectAll') : t('common:selectAll')}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {statusRefreshing && <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />}
                        <Text style={styles.selectedCount}>{selectedFiles.size}/{allChangedFiles.length}</Text>
                      </View>
                    </TouchableOpacity>

                    {/* Bulk Discard */}
                    {selectedFiles.size > 0 && (
                      <TouchableOpacity
                        style={styles.discardSelectedBtn}
                        onPress={() => handleDiscard(Array.from(selectedFiles))}
                        disabled={actionLoading === 'discard'}
                      >
                        <Ionicons name="trash-outline" size={14} color="#FF6B6B" />
                        <Text style={styles.discardSelectedText}>
                          {t('terminal:git.discardSelected')} ({selectedFiles.size})
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* File Tree */}
                    <View style={styles.changeSection}>
                      {changeFileTree.map(node => renderChangeNode(node, 0))}
                    </View>

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
                          onPress={() => { setShowAddAccountModal(true); tracciaAccountGitCollegato('github'); }}
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
      </View>

      <AddGitAccountModal
        visible={showAddAccountModal}
        onClose={() => setShowAddAccountModal(false)}
        onAccountAdded={loadAccountInfo}
      />

      {/* Commit Files Modal — shows file list OR inline diff (no second Modal) */}
      <Modal
        visible={commitFilesModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (expandedCommitFile) {
            // Back to file list
            setExpandedCommitFile(null);
            setExpandedCommitDiff(null);
          } else {
            setCommitFilesModal(null);
          }
        }}
        statusBarTranslucent
      >
        <View style={styles.diffModalOverlay}>
          <View style={styles.diffModalContainer}>
            {/* Header — switches between file list and diff view */}
            <View style={styles.diffModalHeader}>
              {expandedCommitFile ? (
                <>
                  <TouchableOpacity
                    onPress={() => { setExpandedCommitFile(null); setExpandedCommitDiff(null); }}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={{ marginRight: 8 }}
                  >
                    <Ionicons name="arrow-back" size={20} color="#fff" />
                  </TouchableOpacity>
                  <Text style={[styles.diffModalTitle, { flex: 1 }]} numberOfLines={1}>{expandedCommitFile.split('/').pop()}</Text>
                  <TouchableOpacity onPress={() => { setCommitFilesModal(null); setExpandedCommitFile(null); setExpandedCommitDiff(null); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Ionicons name="close" size={20} color="#fff" />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.diffModalTitle} numberOfLines={1}>{commitFilesModal?.message}</Text>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{commitFilesModal?.shortHash} · {commitFiles.length} file{commitFiles.length !== 1 ? 's' : ''}</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setCommitFilesModal(null); setExpandedCommitFile(null); setExpandedCommitDiff(null); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Ionicons name="close" size={20} color="#fff" />
                  </TouchableOpacity>
                </>
              )}
            </View>

            {expandedCommitFile ? (
              /* Inline diff view */
              expandedCommitDiffLoading ? (
                <View style={styles.diffLoadingContainer}>
                  <ActivityIndicator size="large" color={AppColors.primary} />
                </View>
              ) : (
                <ScrollView style={styles.diffScroll} horizontal>
                  <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
                    {(() => {
                      let oldLine = 0;
                      let newLine = 0;
                      return (expandedCommitDiff || '').split('\n').map((line, i) => {
                        const isAdd = line.startsWith('+') && !line.startsWith('+++');
                        const isDel = line.startsWith('-') && !line.startsWith('---');
                        const isHeader = line.startsWith('@@');
                        let lineNum = '';
                        if (isHeader) {
                          const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
                          if (match) { oldLine = parseInt(match[1]); newLine = parseInt(match[2]); }
                        } else if (isAdd) {
                          lineNum = `${newLine}`;
                          newLine++;
                        } else if (isDel) {
                          lineNum = `${oldLine}`;
                          oldLine++;
                        } else if (oldLine > 0) {
                          lineNum = `${newLine}`;
                          oldLine++; newLine++;
                        }
                        return (
                          <View
                            key={i}
                            style={[
                              styles.diffLine,
                              isAdd && styles.diffLineAdd,
                              isDel && styles.diffLineDel,
                              isHeader && styles.diffLineHeader,
                            ]}
                          >
                            <Text style={styles.diffLineNum}>{lineNum}</Text>
                            <Text
                              style={[
                                styles.diffLineText,
                                isAdd && styles.diffLineTextAdd,
                                isDel && styles.diffLineTextDel,
                                isHeader && styles.diffLineTextHeader,
                              ]}
                            >
                              {line}
                            </Text>
                          </View>
                        );
                      });
                    })()}
                  </ScrollView>
                </ScrollView>
              )
            ) : commitFilesLoading ? (
              <View style={styles.diffLoadingContainer}>
                <ActivityIndicator size="large" color={AppColors.primary} />
              </View>
            ) : commitFiles.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No files changed</Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
                {(() => {
                  // Build tree from commit files
                  type CfTreeNode = { name: string; path: string; type: 'file' | 'folder'; status?: string; children?: CfTreeNode[] };
                  const root: CfTreeNode[] = [];
                  commitFiles.forEach(cf => {
                    const parts = cf.file.split('/');
                    let level = root;
                    let curPath = '';
                    parts.forEach((part, idx) => {
                      curPath = curPath ? `${curPath}/${part}` : part;
                      const isFile = idx === parts.length - 1;
                      let node = level.find(n => n.name === part);
                      if (!node) {
                        node = { name: part, path: curPath, type: isFile ? 'file' : 'folder', status: isFile ? cf.status : undefined, children: isFile ? undefined : [] };
                        level.push(node);
                      }
                      if (!isFile && node.children) level = node.children;
                    });
                  });
                  const sortTree = (nodes: CfTreeNode[]): CfTreeNode[] =>
                    [...nodes].sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1)
                      .map(n => ({ ...n, children: n.children ? sortTree(n.children) : undefined }));
                  const sorted = sortTree(root);

                  const countFiles = (n: CfTreeNode): number => n.type === 'file' ? 1 : (n.children || []).reduce((s, c) => s + countFiles(c), 0);

                  const renderNode = (node: CfTreeNode, depth: number): React.ReactNode => {
                    if (node.type === 'folder') {
                      const isExpanded = !commitCollapsedFolders.has(node.path);
                      return (
                        <View key={node.path}>
                          <TouchableOpacity
                            style={[styles.changeFolderItem, { marginLeft: depth * 16 }]}
                            onPress={() => setCommitCollapsedFolders(prev => {
                              const next = new Set(prev);
                              next.has(node.path) ? next.delete(node.path) : next.add(node.path);
                              return next;
                            })}
                          >
                            <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={12} color="rgba(255,255,255,0.4)" />
                            <Ionicons name="folder-outline" size={14} color="rgba(255,255,255,0.5)" />
                            <Text style={styles.changeFolderName}>{node.name}</Text>
                            <Text style={styles.changeFolderCount}>{countFiles(node)}</Text>
                          </TouchableOpacity>
                          {isExpanded && node.children?.map(c => renderNode(c, depth + 1))}
                        </View>
                      );
                    }
                    const statusConfig: Record<string, { color: string; icon: string; label: string }> = {
                      'A': { color: '#22c55e', icon: 'add', label: 'Added' },
                      'D': { color: '#ef4444', icon: 'remove', label: 'Deleted' },
                      'M': { color: '#f59e0b', icon: 'create-outline', label: 'Modified' },
                      'R': { color: '#3b82f6', icon: 'arrow-forward', label: 'Renamed' },
                      'C': { color: '#8b5cf6', icon: 'copy-outline', label: 'Copied' },
                    };
                    const sc = statusConfig[node.status || 'M'] || statusConfig['M'];
                    return (
                      <View key={node.path}>
                        <TouchableOpacity
                          style={[styles.commitFileItem, { marginLeft: depth * 16 }]}
                          activeOpacity={0.6}
                          onPress={async () => {
                            if (!commitFilesModal) return;
                            setExpandedCommitFile(node.path);
                            setExpandedCommitDiff(null);
                            setExpandedCommitDiffLoading(true);
                            try {
                              const authHeaders = await getAuthHeaders();
                              const res = await fetch(
                                `${config.apiUrl}/git/commit-diff/${currentWorkstation?.id}?commit=${encodeURIComponent(commitFilesModal.hash)}&file=${encodeURIComponent(node.path)}`,
                                { headers: authHeaders },
                              );
                              const data = await res.json();
                              setExpandedCommitDiff(data.diff || '');
                            } catch (e: any) {
                              setExpandedCommitDiff(`Error: ${e.message}`);
                            } finally {
                              setExpandedCommitDiffLoading(false);
                            }
                          }}
                        >
                          <View style={[styles.commitFileStatus, { backgroundColor: sc.color + '22' }]}>
                            <Ionicons name={sc.icon as any} size={14} color={sc.color} />
                          </View>
                          <Ionicons name="document-outline" size={14} color="rgba(255,255,255,0.4)" style={{ marginRight: -4 }} />
                          <Text style={[styles.commitFileName, { flex: 1 }]} numberOfLines={1}>{node.name}</Text>
                          <Text style={{ fontSize: 10, color: sc.color, fontWeight: '600', marginRight: 2 }}>{sc.label}</Text>
                          <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.3)" />
                        </TouchableOpacity>
                      </View>
                    );
                  };
                  return sorted.map(n => renderNode(n, 0));
                })()}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Diff Viewer Modal — only for Changes tab diffs */}
      <Modal
        visible={diffFile !== null && commitFilesModal === null}
        transparent
        animationType="slide"
        onRequestClose={() => setDiffFile(null)}
        statusBarTranslucent
      >
        <View style={styles.diffModalOverlay}>
          <View style={styles.diffModalContainer}>
            <View style={styles.diffModalHeader}>
              <Text style={styles.diffModalTitle} numberOfLines={1}>{diffFile}</Text>
              <TouchableOpacity onPress={() => setDiffFile(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            {diffLoading ? (
              <View style={styles.diffLoadingContainer}>
                <ActivityIndicator size="large" color={AppColors.primary} />
              </View>
            ) : (
              <ScrollView style={styles.diffScroll} horizontal>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
                  {(() => {
                    let oldLine = 0;
                    let newLine = 0;
                    return (diffContent || '').split('\n').map((line, i) => {
                      const isAdd = line.startsWith('+') && !line.startsWith('+++');
                      const isDel = line.startsWith('-') && !line.startsWith('---');
                      const isHeader = line.startsWith('@@');
                      let lineNum = '';
                      if (isHeader) {
                        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
                        if (match) { oldLine = parseInt(match[1]); newLine = parseInt(match[2]); }
                      } else if (isAdd) {
                        lineNum = `${newLine}`;
                        newLine++;
                      } else if (isDel) {
                        lineNum = `${oldLine}`;
                        oldLine++;
                      } else if (oldLine > 0) {
                        lineNum = `${newLine}`;
                        oldLine++; newLine++;
                      }
                      return (
                        <View
                          key={i}
                          style={[
                            styles.diffLine,
                            isAdd && styles.diffLineAdd,
                            isDel && styles.diffLineDel,
                            isHeader && styles.diffLineHeader,
                          ]}
                        >
                          <Text style={styles.diffLineNum}>{lineNum}</Text>
                          <Text
                            style={[
                              styles.diffLineText,
                            isAdd && styles.diffLineTextAdd,
                            isDel && styles.diffLineTextDel,
                            isHeader && styles.diffLineTextHeader,
                          ]}
                        >
                          {line}
                        </Text>
                      </View>
                      );
                    });
                  })()}
                </ScrollView>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* File Context Menu - absolute overlay instead of Modal to prevent native modal stack issues */}
      {fileContextMenu && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <TouchableOpacity
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]}
            activeOpacity={1}
            onPress={() => setFileContextMenu(null)}
          >
            <View style={[
              styles.popoverMenu,
              {
                top: Math.min(fileContextMenu.y, Dimensions.get('window').height - 140),
                right: 16,
              },
            ]}>
              <Text style={styles.popoverTitle} numberOfLines={1}>
                {fileContextMenu.file.split('/').pop()}
              </Text>
              <TouchableOpacity style={styles.popoverItem} onPress={() => handleFileMenuAction('viewDiff')}>
                <Ionicons name="git-compare-outline" size={16} color="rgba(255,255,255,0.7)" />
                <Text style={styles.popoverItemText}>{t('terminal:git.viewDiff')}</Text>
              </TouchableOpacity>
              <View style={styles.popoverDivider} />
              <TouchableOpacity style={styles.popoverItem} onPress={() => handleFileMenuAction('discard')}>
                <Ionicons name="trash-outline" size={16} color="#FF6B6B" />
                <Text style={[styles.popoverItemText, { color: '#FF6B6B' }]}>
                  {t('terminal:git.discardChanges')}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>
      )}

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
                tracciaAccountGitCollegato('picker');
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

            <Text style={styles.commitModalLabel}>Title</Text>
            <TextInput
              style={styles.commitModalInput}
              placeholder={t('terminal:git.commitMessagePlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={commitMessage}
              onChangeText={setCommitMessage}
              numberOfLines={1}
              returnKeyType="next"
            />

            <Text style={styles.commitModalLabel}>Description (optional)</Text>
            <TextInput
              style={styles.commitModalDescInput}
              placeholder="Add more details about this commit..."
              placeholderTextColor="rgba(255,255,255,0.2)"
              value={commitDescription}
              onChangeText={setCommitDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={styles.commitModalActions}>
              <TouchableOpacity
                style={[styles.commitModalBtn, !commitMessage.trim() && styles.commitModalBtnDisabled]}
                onPress={async () => {
                  const success = await handleCommit();
                  if (success) setShowCommitModal(false);
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
                style={[styles.commitModalPushBtn, !isOwnRepo && styles.pushBtnWarning, !commitMessage.trim() && styles.commitModalBtnDisabled]}
                onPress={async () => {
                  // If there's a commit message + selected files, commit silently first
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
                      // Commit succeeded silently — clear fields, then open push modal
                      setCommitMessage('');
                      setCommitDescription('');
                      setSelectedFiles(new Set());
                    } catch (e: any) {
                      tracciaErroreCommit(e.message || 'Commit failed');
                      Alert.alert(t('common:error'), e.message || t('terminal:git.commitError'));
                      setActionLoading(null);
                      return;
                    } finally {
                      setActionLoading(null);
                    }
                  }
                  // Close commit modal and open push config modal
                  setShowCommitModal(false);
                  tracciaPushEffettuato();
                  handleGitAction('push');
                }}
                disabled={!commitMessage.trim() || !!actionLoading}
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

      {/* Commit Context Menu - absolute overlay instead of Modal to prevent native modal stack issues */}
      {commitContextMenu && (
        <View style={[StyleSheet.absoluteFill, styles.commitModalBackdrop]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setCommitContextMenu(null); setNewBranchFromCommit(null); }} />
          <View
            style={styles.contextMenuContainer}
          >
            <View style={styles.contextMenuHeader}>
              <Text style={styles.contextMenuTitle} numberOfLines={1}>{commitContextMenu?.message}</Text>
              <Text style={styles.contextMenuHash}>{commitContextMenu?.shortHash}</Text>
            </View>

            {/* View Changed Files */}
            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={() => {
                if (commitContextMenu) {
                  const info = { ...commitContextMenu };
                  setCommitContextMenu(null);
                  setCommitFilesModal(info);
                  setExpandedCommitFile(null);
                  setExpandedCommitDiff(null);
                  setCommitCollapsedFolders(new Set());
                  fetchCommitFiles(info.hash);
                }
              }}
            >
              <Ionicons name="document-text-outline" size={18} color="rgba(255,255,255,0.7)" />
              <Text style={styles.contextMenuItemText}>View Changed Files</Text>
            </TouchableOpacity>

            {/* Copy SHA */}
            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={async () => {
                if (commitContextMenu) {
                  await Clipboard.setStringAsync(commitContextMenu.hash);
                  Alert.alert('Copied', `SHA ${commitContextMenu.shortHash} copied`);
                  setCommitContextMenu(null);
                }
              }}
            >
              <Ionicons name="copy-outline" size={18} color="rgba(255,255,255,0.7)" />
              <Text style={styles.contextMenuItemText}>Copy Commit SHA</Text>
            </TouchableOpacity>

            {/* Checkout Commit */}
            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={() => {
                if (!commitContextMenu) return;
                const hash = commitContextMenu.hash;
                const shortHash = commitContextMenu.shortHash;
                const msg = commitContextMenu.message;
                setCommitContextMenu(null);
                Alert.alert(
                  'Checkout Commit',
                  `Checkout ${shortHash} "${msg}"?\n\nThis will put the repository in detached HEAD state.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Checkout',
                      onPress: async () => {
                        if (!currentWorkstation?.id) return;
                        // Remember current branch before entering detached HEAD
                        if (currentBranch && !isDetachedHead) {
                          previousBranchRef.current = currentBranch;
                        }
                        setActionLoading('checkout');
                        let didStash = false;
                        try {
                          const authHeaders = await getAuthHeaders();
                          const token = linkedAccount ? await gitAccountService.getToken(linkedAccount, userId) : '';

                          // Auto-stash local changes before checkout
                          if (allChangedFiles.length > 0) {
                            const stashRes = await fetch(`${config.apiUrl}/git/stash/${currentWorkstation.id}`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', ...authHeaders, 'X-Git-Token': token || '' },
                              body: JSON.stringify({ action: 'push', message: `Auto-stash before checkout ${shortHash}` }),
                            });
                            didStash = stashRes.ok;
                          }

                          const response = await fetch(`${config.apiUrl}/git/checkout/${currentWorkstation.id}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...authHeaders },
                            body: JSON.stringify({ branch: hash }),
                          });
                          const result = await response.json();
                          if (result.success) {
                            // Restore stash after successful checkout
                            if (didStash) {
                              await fetch(`${config.apiUrl}/git/stash/${currentWorkstation.id}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', ...authHeaders, 'X-Git-Token': token || '' },
                                body: JSON.stringify({ action: 'pop' }),
                              });
                              didStash = false;
                            }
                            Alert.alert('Success', `Checked out ${shortHash}`);
                            // Invalidate caches so file tree + git data refresh
                            useGitCacheStore.getState().clearCache(currentWorkstation.id);
                            useFileCacheStore.getState().clearCache(currentWorkstation.id);
                            isLoadingRef.current = false;
                            await loadGitData();
                          } else {
                            // Restore stash on failure too
                            if (didStash) {
                              await fetch(`${config.apiUrl}/git/stash/${currentWorkstation.id}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', ...authHeaders, 'X-Git-Token': token || '' },
                                body: JSON.stringify({ action: 'pop' }),
                              });
                              didStash = false;
                            }
                            Alert.alert('Error', result.output || 'Checkout failed');
                          }
                        } catch (e: any) {
                          // Restore stash if checkout threw an exception
                          if (didStash) {
                            const ah = await getAuthHeaders().catch(() => ({}));
                            await fetch(`${config.apiUrl}/git/stash/${currentWorkstation.id}`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', ...ah },
                              body: JSON.stringify({ action: 'pop' }),
                            }).catch(() => {});
                          }
                          tracciaErroreCambioBranch(hash, e.message || 'Checkout failed');
                          Alert.alert('Error', e.message || 'Checkout failed');
                        } finally {
                          setActionLoading(null);
                        }
                      },
                    },
                  ]
                );
              }}
              disabled={!!actionLoading}
            >
              <Ionicons name="log-out-outline" size={18} color="rgba(255,255,255,0.7)" />
              <Text style={styles.contextMenuItemText}>Checkout Commit</Text>
            </TouchableOpacity>

            {/* Revert Commit */}
            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={() => {
                if (!commitContextMenu) return;
                const hash = commitContextMenu.hash;
                setCommitContextMenu(null);
                Alert.alert(
                  'Revert Commit',
                  `Revert "${commitContextMenu.message}"?\nThis creates a new commit that undoes the changes.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Revert', style: 'destructive', onPress: () => handleRevertCommit(hash) },
                  ]
                );
              }}
              disabled={!!actionLoading}
            >
              <Ionicons name="arrow-undo-outline" size={18} color="rgba(255,255,255,0.7)" />
              <Text style={styles.contextMenuItemText}>Revert Commit</Text>
            </TouchableOpacity>

            {/* New Branch from Here */}
            {!newBranchFromCommit ? (
              <TouchableOpacity
                style={styles.contextMenuItem}
                onPress={() => {
                  if (commitContextMenu) {
                    setNewBranchFromCommit(commitContextMenu.hash);
                  }
                }}
                disabled={!!actionLoading}
              >
                <Ionicons name="git-branch-outline" size={18} color="rgba(255,255,255,0.7)" />
                <Text style={styles.contextMenuItemText}>New Branch from Here</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.contextMenuBranchInput}>
                <TextInput
                  style={styles.contextMenuInput}
                  placeholder="Branch name..."
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={branchFromName}
                  onChangeText={setBranchFromName}
                  autoFocus
                />
                <TouchableOpacity
                  style={[styles.contextMenuCreateBtn, !branchFromName.trim() && { opacity: 0.4 }]}
                  onPress={() => {
                    if (branchFromName.trim() && newBranchFromCommit) {
                      handleBranchFromCommit(newBranchFromCommit, branchFromName.trim());
                      setCommitContextMenu(null);
                    }
                  }}
                  disabled={!branchFromName.trim() || !!actionLoading}
                >
                  {actionLoading === 'branch-from' ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.contextMenuCreateBtnText}>Create</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Pull Config Modal — absolute overlay */}
      {showPullModal && (
        <View style={[StyleSheet.absoluteFill, styles.commitModalBackdrop]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowPullModal(false)} />
          <View style={styles.pushModalContainer}>
            <View style={styles.pushModalHeader}>
              <Ionicons name="cloud-download-outline" size={22} color="#fff" />
              <Text style={styles.pushModalTitle}>Pull</Text>
            </View>
            <Text style={styles.pushModalSubtitle}>Pull remote changes and merge into your local branch</Text>

            {/* Remote */}
            <View style={styles.pushModalRow}>
              <Text style={styles.pushModalLabel}>Remote:</Text>
              <View style={[styles.pushModalPicker, { opacity: 0.6 }]}>
                <Ionicons name="server-outline" size={14} color="rgba(255,255,255,0.5)" />
                <Text style={styles.pushModalPickerText} numberOfLines={1}>{pullRemote}</Text>
              </View>
            </View>

            {/* Branch */}
            <View style={styles.pushModalRow}>
              <Text style={styles.pushModalLabel}>Branch:</Text>
              <TouchableOpacity
                style={styles.pushModalPicker}
                onPress={() => { setPullBranchPickerOpen(!pullBranchPickerOpen); setPullIntoPickerOpen(false); }}
              >
                <Ionicons name="git-branch-outline" size={14} color={AppColors.primary} />
                <Text style={styles.pushModalPickerText} numberOfLines={1}>{pullBranch}</Text>
                <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            </View>

            {/* Branch picker dropdown — show all branches (remote names without origin/ prefix) */}
            {pullBranchPickerOpen && (
              <View style={styles.pushBranchDropdown}>
                <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
                  {(() => {
                    // Deduplicate: show unique branch names (prefer local, strip origin/ prefix from remote)
                    const seen = new Set<string>();
                    const items: { name: string; display: string }[] = [];
                    // Local branches first
                    branches.filter(b => !b.isRemote).forEach(b => {
                      if (!seen.has(b.name)) { seen.add(b.name); items.push({ name: b.name, display: b.name }); }
                    });
                    // Then remote branches (stripped of origin/)
                    branches.filter(b => b.isRemote).forEach(b => {
                      const short = b.name.replace(/^origin\//, '');
                      if (!seen.has(short)) { seen.add(short); items.push({ name: short, display: short }); }
                    });
                    return items.map(item => (
                      <TouchableOpacity
                        key={item.name}
                        style={[styles.pushBranchOption, item.name === pullBranch && styles.pushBranchOptionActive]}
                        onPress={() => { setPullBranch(item.name); setPullBranchPickerOpen(false); }}
                      >
                        <Ionicons name="git-branch-outline" size={14} color={item.name === pullBranch ? AppColors.primary : 'rgba(255,255,255,0.5)'} />
                        <Text style={[styles.pushBranchOptionText, item.name === pullBranch && { color: AppColors.primary }]}>{item.display}</Text>
                        {item.name === pullBranch && <Ionicons name="checkmark" size={16} color={AppColors.primary} />}
                      </TouchableOpacity>
                    ));
                  })()}
                </ScrollView>
              </View>
            )}

            {/* Into — selectable local branch */}
            <View style={styles.pushModalRow}>
              <Text style={styles.pushModalLabel}>Into:</Text>
              <TouchableOpacity
                style={styles.pushModalPicker}
                onPress={() => { setPullIntoPickerOpen(!pullIntoPickerOpen); setPullBranchPickerOpen(false); }}
              >
                <Ionicons name="git-branch-outline" size={14} color={AppColors.primary} />
                <Text style={styles.pushModalPickerText} numberOfLines={1}>{pullIntoBranch || currentBranch}</Text>
                <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            </View>

            {/* Into picker dropdown — local branches only */}
            {pullIntoPickerOpen && (
              <View style={styles.pushBranchDropdown}>
                <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
                  {branches.filter(b => !b.isRemote && !b.name.startsWith('origin/')).map(b => (
                    <TouchableOpacity
                      key={b.name}
                      style={[styles.pushBranchOption, (pullIntoBranch || currentBranch) === b.name && styles.pushBranchOptionActive]}
                      onPress={() => { setPullIntoBranch(b.name); setPullIntoPickerOpen(false); }}
                    >
                      <Ionicons name="git-branch-outline" size={14} color={(pullIntoBranch || currentBranch) === b.name ? AppColors.primary : 'rgba(255,255,255,0.5)'} />
                      <Text style={[styles.pushBranchOptionText, (pullIntoBranch || currentBranch) === b.name && { color: AppColors.primary }]}>{b.name}</Text>
                      {(pullIntoBranch || currentBranch) === b.name && <Ionicons name="checkmark" size={16} color={AppColors.primary} />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Options */}
            <View style={styles.pushModalOptions}>
              <TouchableOpacity style={styles.pushModalOption} onPress={() => setPullRebase(!pullRebase)}>
                <Ionicons
                  name={pullRebase ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={pullRebase ? AppColors.primary : 'rgba(255,255,255,0.4)'}
                />
                <Text style={styles.pushModalOptionText}>Rebase instead of merge</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pushModalOption} onPress={() => setPullStash(!pullStash)}>
                <Ionicons
                  name={pullStash ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={pullStash ? AppColors.primary : 'rgba(255,255,255,0.4)'}
                />
                <Text style={styles.pushModalOptionText}>Stash and reapply local changes</Text>
              </TouchableOpacity>
            </View>

            {/* Actions */}
            <View style={styles.pushModalActions}>
              <TouchableOpacity style={styles.pushModalCancelBtn} onPress={() => setShowPullModal(false)}>
                <Text style={styles.pushModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.pushModalPushBtn, { backgroundColor: '#3b82f6' }]} onPress={executePull} disabled={!!actionLoading}>
                {actionLoading === 'pull' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.pushModalPushText}>Pull</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Push Modal — like Fork: Branch (source) + To (destination) */}
      {showPushModal && (
        <View style={[StyleSheet.absoluteFill, styles.commitModalBackdrop]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowPushModal(false)} />
          <View style={styles.pushModalContainer}>
            <View style={styles.pushModalHeader}>
              <Ionicons name="cloud-upload-outline" size={22} color="#fff" />
              <Text style={styles.pushModalTitle}>Push</Text>
            </View>

            {/* Source branch (read-only) */}
            <View style={styles.pushModalRow}>
              <Text style={styles.pushModalLabel}>Branch:</Text>
              <View style={[styles.pushModalPicker, { opacity: 0.6 }]}>
                <Ionicons name="git-branch-outline" size={14} color={AppColors.primary} />
                <Text style={styles.pushModalPickerText} numberOfLines={1}>{currentBranch}</Text>
              </View>
            </View>

            {/* Destination branch (selectable) */}
            <View style={styles.pushModalRow}>
              <Text style={styles.pushModalLabel}>To:</Text>
              <TouchableOpacity
                style={styles.pushModalPicker}
                onPress={() => setPushDestPickerOpen(!pushDestPickerOpen)}
              >
                <Ionicons name="cloud-outline" size={14} color={AppColors.primary} />
                <Text style={styles.pushModalPickerText} numberOfLines={1}>origin/{pushDestBranch}</Text>
                <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            </View>

            {/* Destination picker dropdown */}
            {pushDestPickerOpen && (
              <View style={styles.pushBranchDropdown}>
                <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
                  {branches.filter(b => !b.isRemote).map(b => (
                    <TouchableOpacity
                      key={b.name}
                      style={[styles.pushBranchOption, b.name === pushDestBranch && styles.pushBranchOptionActive]}
                      onPress={() => { setPushDestBranch(b.name); setPushDestPickerOpen(false); }}
                    >
                      <Ionicons name="cloud-outline" size={14} color={b.name === pushDestBranch ? AppColors.primary : 'rgba(255,255,255,0.5)'} />
                      <Text style={[styles.pushBranchOptionText, b.name === pushDestBranch && { color: AppColors.primary }]}>origin/{b.name}</Text>
                      {b.name === pushDestBranch && <Ionicons name="checkmark" size={16} color={AppColors.primary} />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Actions */}
            <View style={styles.pushModalActions}>
              <TouchableOpacity style={styles.pushModalCancelBtn} onPress={() => setShowPushModal(false)}>
                <Text style={styles.pushModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pushModalPushBtn} onPress={executePush} disabled={!!actionLoading}>
                {actionLoading === 'push' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.pushModalPushText}>Push</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

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
  branchSwitcherDropdown: {
    backgroundColor: 'rgba(30,30,30,0.95)',
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  branchSwitcherOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  branchSwitcherOptionActive: {
    backgroundColor: `${AppColors.primary}10`,
  },
  branchSwitcherOptionText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
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
  actionBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  actionBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
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
  changesBadge: {
    backgroundColor: '#f59e0b',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  changesBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '700',
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
  branchFilterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  branchFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  branchFilterPillActive: {
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderColor: 'rgba(139,92,246,0.5)',
  },
  branchFilterPillCurrent: {
    borderColor: 'rgba(255,255,255,0.25)',
  },
  branchFilterPillText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  branchFilterPillTextActive: {
    color: '#fff',
  },
  commitsList: {
    paddingLeft: 4,
  },
  commitItem: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 56,
  },
  commitMenuBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    alignSelf: 'center',
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
    flexWrap: 'wrap',
    gap: 4,
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
  // Remote badge (origin/main)
  remoteBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  remoteBadgeInlineText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(34, 197, 94, 0.9)',
  },
  branchRefBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  branchRefBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(167, 139, 250, 0.9)',
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(34, 211, 238, 0.9)',
  },
  // Unpushed commit styles
  timelineDotUnpushed: {
    borderColor: 'rgba(251, 146, 60, 0.6)',
  },
  timelineLineUnpushed: {
    borderLeftColor: 'rgba(251, 146, 60, 0.3)',
  },
  commitMessageUnpushed: {
    color: 'rgba(255, 255, 255, 0.85)',
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
  addBranchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    marginTop: 4,
  },
  addBranchText: {
    fontSize: 13,
    color: AppColors.primary,
    fontWeight: '500',
  },
  createBranchContainer: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  createBranchInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  createBranchActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  createBranchCancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  createBranchCancelText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  createBranchConfirmBtn: {
    backgroundColor: AppColors.primary,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  createBranchConfirmText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
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
  changeFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  changeFileName: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    flex: 1,
  },
  diffModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  diffModalContainer: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
    minHeight: '50%',
  },
  diffModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  diffModalTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    fontFamily: 'monospace',
  },
  diffLoadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  diffScroll: {
    flex: 1,
  },
  diffLine: {
    flexDirection: 'row',
    paddingVertical: 1,
    paddingHorizontal: 4,
    minWidth: '100%',
  },
  diffLineAdd: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  diffLineDel: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  diffLineHeader: {
    backgroundColor: 'rgba(96, 165, 250, 0.1)',
  },
  diffLineNum: {
    width: 36,
    fontSize: 10,
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'right',
    marginRight: 8,
    fontFamily: 'monospace',
  },
  diffLineText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'monospace',
  },
  diffLineTextAdd: {
    color: '#4ade80',
  },
  diffLineTextDel: {
    color: '#f87171',
  },
  diffLineTextHeader: {
    color: '#60a5fa',
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
  discardSelectedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    marginBottom: 12,
  },
  discardSelectedText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FF6B6B',
  },
  changeFolderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  changeFolderName: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
    flex: 1,
  },
  changeFolderCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
  },
  popoverBackdrop: {
    flex: 1,
  },
  popoverMenu: {
    position: 'absolute',
    minWidth: 180,
    backgroundColor: '#1c1c2e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 20,
    paddingVertical: 4,
  },
  popoverTitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  popoverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  popoverItemText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  popoverDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 2,
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
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
  commitModalDescInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 13,
    minHeight: 60,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  commitModalLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  // Ahead/behind pills
  aheadPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(139,92,246,0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  aheadPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: AppColors.primary,
  },
  behindPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  behindPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#f59e0b',
  },
  // Remote separator
  remoteSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
    paddingHorizontal: 8,
  },
  remoteSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  remoteSeparatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginHorizontal: 8,
  },
  remoteSeparatorText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  // Commit context menu
  contextMenuContainer: {
    width: '85%',
    maxWidth: 360,
    backgroundColor: '#1a1a1e',
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  contextMenuHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    marginBottom: 4,
  },
  contextMenuTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  contextMenuHash: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: 'rgba(255,255,255,0.4)',
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  contextMenuItemText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
  },
  contextMenuBranchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  contextMenuInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  contextMenuCreateBtn: {
    backgroundColor: AppColors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  contextMenuCreateBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  // Detached HEAD
  detachedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
    alignSelf: 'flex-start',
    marginLeft: 28,
  },
  detachedBannerText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#f59e0b',
  },
  detachedPill: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  detachedPillText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#f59e0b',
  },
  detachedBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  detachedBadgeInlineText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#f59e0b',
  },
  commitItemDetachedHere: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 8,
  },
  timelineDotDetached: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#f59e0b',
    borderWidth: 0,
    position: 'absolute',
    left: 5,
    top: 6,
  },
  timelineDotInnerDetached: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  commitFileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  commitFileStatus: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commitFileName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
  },
  commitFilePath: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 1,
  },
  inlineDiffContainer: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 6,
    marginHorizontal: 8,
    marginBottom: 6,
    maxHeight: 300,
    overflow: 'hidden',
  },
  inlineDiffLine: {
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  inlineDiffText: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: 'rgba(255,255,255,0.5)',
  },
  pushModalContainer: {
    width: '85%',
    maxWidth: 380,
    backgroundColor: 'rgba(28, 28, 32, 0.97)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 20,
  },
  pushModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  pushModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  pushModalSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 18,
  },
  pushModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  pushModalLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    width: 60,
  },
  pushModalPicker: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pushModalPickerText: {
    flex: 1,
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },
  pushBranchDropdown: {
    marginLeft: 70,
    marginTop: -6,
    marginBottom: 10,
    backgroundColor: 'rgba(40, 40, 46, 0.98)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  pushBranchOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pushBranchOptionActive: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  pushBranchOptionText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  pushModalOptions: {
    marginTop: 8,
    gap: 10,
    marginBottom: 18,
  },
  pushModalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pushModalOptionText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  pushModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  pushModalCancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  pushModalCancelText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  pushModalPushBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: AppColors.primary,
    minWidth: 70,
    alignItems: 'center',
  },
  pushModalPushText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
});
