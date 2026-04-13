import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { gitAccountService, GitAccount } from '../../../../core/git/gitAccountService';
import { useTerminalStore } from '../../../../core/terminal/terminalStore';
import { useGitCacheStore } from '../../../../core/cache/gitCacheStore';
import { useFileCacheStore } from '../../../../core/cache/fileCacheStore';
import { config } from '../../../../config/config';
import { getAuthHeaders } from '../../../../core/api/getAuthToken';
import { githubService, GitHubCommit } from '../../../../core/github/githubService';
import { useTranslation } from 'react-i18next';
import {
  buildChangedFiles,
  buildGitChangeTree,
  getBranchColorMap,
  getCommitTimelineColors,
} from '../gitSheetUtils';
import type { GitBranch, GitCommit, GitStatus } from '../views/gitHubViewUtils';
import type { WorkstationInfo } from '../../../../shared/types';
import {
  buildGithubCommitRefMap,
  buildGithubCommits,
  buildGitStatusFromBackend,
  mergeLocalAndRemoteBranches,
  parseGitHubRepoUrl,
} from './gitSheetDataUtils';

export function useGitSheetData(
  visible: boolean,
  currentWorkstation: WorkstationInfo | null,
  initialTab?: string,
) {
  const { t } = useTranslation(['terminal', 'common']);
  const userId = useTerminalStore.getState().userId || 'anonymous';

  // Account state
  const [gitAccounts, setGitAccounts] = useState<GitAccount[]>([]);
  const [linkedAccount, setLinkedAccount] = useState<GitAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Git data states
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [currentBranch, _setCurrentBranch] = useState<string>('main');
  const setCurrentBranch = (branch: string) => {
    if (!branch || branch.startsWith('(HEAD detached')) return;
    _setCurrentBranch(branch);
  };
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [gitLoading, setGitLoading] = useState(false);
  const [statusRefreshing, setStatusRefreshing] = useState(false);
  const [remoteHead, setRemoteHead] = useState<string | null>(null);
  const [aheadCount, setAheadCount] = useState(0);
  const [behindCount, setBehindCount] = useState(0);
  const [commitBranchMap, setCommitBranchMap] = useState<Record<string, string[]>>({});
  const [isDetachedHead, setIsDetachedHead] = useState(false);
  const [detachedAt, setDetachedAt] = useState<string | null>(null);

  // Branch filter state
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string | null>(null);
  const [filteredCommits, setFilteredCommits] = useState<GitCommit[]>([]);
  const [branchFilterLoading, setBranchFilterLoading] = useState(false);
  const [branchCommitsCache, setBranchCommitsCache] = useState<Record<string, GitCommit[]>>({});

  // Refs
  const accountsRef = useRef<GitAccount[]>([]);
  const isLoadingRef = useRef(false);
  const hasStartedRef = useRef(false);
  const skipAutoFilterRef = useRef(false);
  const fetchStatusAbortRef = useRef<AbortController | null>(null);
  const previousBranchRef = useRef<string>('main');

  // ─── Data loading functions ───────────────────────────────────────────

  const loadAccountInfo = async (): Promise<GitAccount[]> => {
    try {
      const accounts = await gitAccountService.getAllAccounts(userId);
      setGitAccounts(accounts);
      accountsRef.current = accounts;

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

  const fetchBackendStatus = async (currentBranchName: string) => {
    if (!currentWorkstation?.id) return;
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
              const merged = mergeLocalAndRemoteBranches(backendBranches, prev);

              const cached = useGitCacheStore.getState().getGitData(currentWorkstation!.id);
              if (cached) {
                useGitCacheStore.getState().setGitData(currentWorkstation!.id, {
                  ...cached,
                  branches: merged.map(b => ({ name: b.name, isCurrent: b.isCurrent, isRemote: b.isRemote })),
                });
              }

              return merged;
            });

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
        const changes = localData.changes;
        if (changes) {
          setGitStatus(buildGitStatusFromBackend(changes));
        }

        if (localData.branch) {
          setCurrentBranch(localData.branch);
        }

        if (localData.remoteHead) setRemoteHead(localData.remoteHead);
        if (localData.ahead !== undefined) setAheadCount(localData.ahead);
        if (localData.behind !== undefined) setBehindCount(localData.behind);
        setIsDetachedHead(!!localData.isDetachedHead);
        setDetachedAt(localData.detachedAt || null);
        if (localData.commitBranches) setCommitBranchMap(localData.commitBranches);

        if (skipAutoFilterRef.current) {
          skipAutoFilterRef.current = false;
        }

        if (localData.commits && localData.commits.length > 0) {
          setCommits(prev => {
            const existingHashes = new Set(prev.map(c => c.shortHash || c.hash?.substring(0, 7)));
            const localOnly: GitCommit[] = localData.commits
              .filter((lc: { hash?: string }) => !existingHashes.has(lc.hash?.substring(0, 7)))
              .map((lc: { hash?: string; message?: string; authorDate?: string }) => ({
                hash: lc.hash,
                shortHash: lc.hash?.substring(0, 7),
                message: lc.message,
                author: '',
                date: lc.authorDate ? new Date(lc.authorDate) : new Date(),
                isHead: false,
              }));

            if (localOnly.length > 0) {
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

        const cached = useGitCacheStore.getState().getGitData(currentWorkstation!.id);
        if (cached) {
          useGitCacheStore.getState().setGitData(currentWorkstation!.id, {
            ...cached,
            status: buildGitStatusFromBackend(changes),
          });
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
        console.warn('[GitSheet] Backend status failed:', e.message);
      }
    } finally {
      setStatusRefreshing(false);
      if (fetchStatusAbortRef.current === abortController) {
        fetchStatusAbortRef.current = null;
      }
    }
  };

  const loadGitData = async (passedAccounts?: GitAccount[], overrideRepoUrl?: string) => {
    if (!currentWorkstation?.id) return;

    if (isLoadingRef.current) {
      return;
    }
    isLoadingRef.current = true;

    const totalStart = Date.now();
    setGitLoading(true);
    setErrorMsg(null);
    setSelectedBranchFilter(null);
    setFilteredCommits([]);
    setBranchCommitsCache({});

    const repoUrl = overrideRepoUrl || currentWorkstation?.repositoryUrl || currentWorkstation?.githubUrl;
    const repoInfo = parseGitHubRepoUrl(repoUrl);
    let localCurrentBranch = 'main';

    try {
      if (repoInfo) {
        const { owner, repo } = repoInfo;

        try {
          let token: string | null = null;
          const accounts = passedAccounts || accountsRef.current;
          const githubAccount = accounts.find(a => a.provider === 'github');
          if (githubAccount) {
            token = await gitAccountService.getToken(githubAccount, userId);
          }

          const [commitsData, branchesData, tagsData] = await Promise.all([
            githubService.getCommits(owner, repo, token),
            githubService.getBranches(owner, repo, token),
            githubService.getTags(owner, repo, token),
          ]);

          if (commitsData && commitsData.length > 0) {
            localCurrentBranch = branchesData?.find((b: { name: string }) => b.name === 'main' || b.name === 'master')?.name || 'main';
            const refsMap = buildGithubCommitRefMap(branchesData, tagsData);
            const githubCommits: GitCommit[] = buildGithubCommits(commitsData, localCurrentBranch, refsMap);

            setCommits(githubCommits);
            setCurrentBranch(localCurrentBranch);
            setIsGitRepo(true);

            if (branchesData && branchesData.length > 0) {
              const githubBranches: GitBranch[] = branchesData.map((b: { name: string }) => ({
                name: b.name,
                isCurrent: b.name === localCurrentBranch,
                isRemote: true,
              }));
              setBranches(githubBranches);
            }

            useGitCacheStore.getState().setGitData(currentWorkstation.id, {
              commits: githubCommits.map(c => ({ ...c, date: c.date.toISOString() })),
              branches: branchesData?.map((b: { name: string }) => ({ name: b.name, isCurrent: b.name === localCurrentBranch, isRemote: true })) || [],
              status: null,
              currentBranch: localCurrentBranch,
              isGitRepo: true
            });

            setGitLoading(false);
            fetchBackendStatus(localCurrentBranch);
            return;
          }
        } catch (ghError: unknown) {
          console.warn(`[GitSheet] GitHub API failed after ${Date.now() - totalStart}ms:`, ghError instanceof Error ? ghError.message : String(ghError));
        }
      }

      await fetchBackendStatus(localCurrentBranch);

    } catch (error) {
      console.error('Error loading git data:', error);
      if (commits.length === 0) {
        setErrorMsg(t('terminal:git.unableToLoadData'));
      }
    } finally {
      setGitLoading(false);
      isLoadingRef.current = false;
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
    } catch (e: unknown) {
      setDiffContent(`Error loading diff: ${e instanceof Error ? e.message : String(e)}`);
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
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load commit files');
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
      return data;
    } catch (e: unknown) {
      setDiffContent(`Error loading diff: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    } finally {
      setDiffLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setSelectedBranchFilter(null);
    setFilteredCommits([]);
    isLoadingRef.current = false;
    await Promise.all([loadAccountInfo(), loadGitData()]);
    setRefreshing(false);
  };

  const handleBranchFilterSelect = useCallback(async (branchName: string | null) => {
    setSelectedBranchFilter(branchName);
    if (branchName === null) { setFilteredCommits([]); return; }

    if (branchCommitsCache[branchName]) { setFilteredCommits(branchCommitsCache[branchName]); return; }

    const repoUrl = currentWorkstation?.repositoryUrl || currentWorkstation?.githubUrl;
    const repoInfo = parseGitHubRepoUrl(repoUrl);
    if (!repoInfo) return;
    const { owner, repo } = repoInfo;

    setBranchFilterLoading(true);
    try {
      const accounts = accountsRef.current;
      const githubAccount = accounts.find(a => a.provider === 'github');
      let token: string | null = null;
      if (githubAccount) token = await gitAccountService.getToken(githubAccount, userId);

      const commitsData = await githubService.getCommits(owner, repo, token || undefined, 1, 30, branchName);
      if (commitsData && commitsData.length > 0) {
        const branchCommits: GitCommit[] = commitsData.map((c: GitHubCommit, index: number) => ({
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
    } catch (err: unknown) {
      console.warn(`[GitSheet] Failed to fetch commits for branch ${branchName}:`, err instanceof Error ? err.message : String(err));
      setSelectedBranchFilter(null);
      setFilteredCommits([]);
    } finally {
      setBranchFilterLoading(false);
    }
  }, [currentWorkstation, userId, branchCommitsCache]);

  // ─── Diff / commit-files state (needed by actions too) ────────────────

  const [diffFile, setDiffFile] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [commitFiles, setCommitFiles] = useState<{ status: string; file: string }[]>([]);
  const [commitFilesLoading, setCommitFilesLoading] = useState(false);

  // ─── Main loading effect ──────────────────────────────────────────────

  useEffect(() => {
    if (visible && currentWorkstation?.id) {
      if (hasStartedRef.current) {
        return;
      }
      hasStartedRef.current = true;

      const cachedData = useGitCacheStore.getState().getGitData(currentWorkstation.id);
      const isCacheValid = useGitCacheStore.getState().isCacheValid(currentWorkstation.id, 5 * 60 * 1000);

      if (cachedData && isCacheValid) {
        setCommits(cachedData.commits.map(c => ({ ...c, date: new Date(c.date) })));
        setBranches(cachedData.branches);
        setCurrentBranch(cachedData.currentBranch);
        setIsGitRepo(cachedData.isGitRepo);
        setGitLoading(false);
        setLoading(false);

        loadAccountInfo().then(accounts => loadGitData(accounts || [])).catch((err) => console.warn('[Git] Background refresh failed:', err?.message || err));
        return;
      }

      setGitLoading(true);

      const timeoutId = setTimeout(() => {
        const cachedCount = accountsRef.current.length;
        console.warn(`[GitSheet] loadAccountInfo timeout (10s) - using ${cachedCount} cached accounts`);
        loadGitData(accountsRef.current);
      }, 10000);

      loadAccountInfo().then((accounts) => {
        clearTimeout(timeoutId);
        loadGitData(accounts || []);
      }).catch((err) => {
        console.error('[GitSheet] loadAccountInfo failed:', err);
        clearTimeout(timeoutId);
        loadGitData([]);
      });
    } else if (!visible) {
      setGitLoading(false);
      setAccountsLoaded(false);
      isLoadingRef.current = false;
      hasStartedRef.current = false;
      setSelectedBranchFilter(null);
      setFilteredCommits([]);
      setBranchFilterLoading(false);
      setBranchCommitsCache({});
    }
  }, [visible, currentWorkstation?.id]);

  // ─── Derived / memoized data ──────────────────────────────────────────

  const displayCommits = useMemo(() => {
    if (selectedBranchFilter === null) return commits;
    if (Object.keys(commitBranchMap).length > 0) {
      return commits.filter(c => {
        const hash = c.shortHash || c.hash?.substring(0, 7);
        if (!hash) return true;
        const bs = commitBranchMap[hash];
        if (!bs) return true;
        return bs.includes(selectedBranchFilter);
      });
    }
    return filteredCommits;
  }, [selectedBranchFilter, commits, filteredCommits, commitBranchMap]);

  const branchColorMap = useMemo(() => getBranchColorMap(branches), [branches]);

  const commitTimelineColors = useMemo(
    () => getCommitTimelineColors(displayCommits, currentBranch, branchColorMap, commitBranchMap),
    [displayCommits, currentBranch, branchColorMap, commitBranchMap],
  );

  const allChangedFiles = useMemo(() => buildChangedFiles(gitStatus), [gitStatus]);
  const changeFileTree = useMemo(() => buildGitChangeTree(allChangedFiles), [allChangedFiles]);

  return {
    // Account state
    gitAccounts,
    setGitAccounts,
    linkedAccount,
    setLinkedAccount,
    loading,
    accountsLoaded,
    refreshing,
    errorMsg,

    // Git data state
    commits,
    branches,
    gitStatus,
    currentBranch,
    isGitRepo,
    gitLoading,
    statusRefreshing,
    remoteHead,
    aheadCount,
    behindCount,
    commitBranchMap,
    isDetachedHead,
    detachedAt,

    // Branch filter state
    selectedBranchFilter,
    setSelectedBranchFilter,
    filteredCommits,
    branchFilterLoading,
    branchCommitsCache,

    // Diff / commit-files state
    diffFile,
    setDiffFile,
    diffContent,
    setDiffContent,
    diffLoading,
    commitFiles,
    commitFilesLoading,

    // Derived data
    displayCommits,
    branchColorMap,
    commitTimelineColors,
    allChangedFiles,
    changeFileTree,

    // Refs
    accountsRef,
    isLoadingRef,
    hasStartedRef,
    skipAutoFilterRef,
    previousBranchRef,

    // Functions
    loadAccountInfo,
    loadGitData,
    fetchBackendStatus,
    fetchDiff,
    fetchCommitFiles,
    fetchCommitDiff,
    handleRefresh,
    handleBranchFilterSelect,

    // userId for actions
    userId,
    t,
  };
}
