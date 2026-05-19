import { useState } from 'react';
import { Alert, Animated, Dimensions, Share } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { workstationService } from '../../core/workstation/workstationService';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { useAuthStore } from '../../core/auth/authStore';
import { filePrefetchService } from '../../core/cache/filePrefetchService';
import { useFileCacheStore } from '../../core/cache/fileCacheStore';
import apiClient from '../../core/api/apiClient';
import { config } from '../../config/config';
import { getAuthHeaders } from '../../core/api/getAuthToken';
import { gitAccountService } from '../../core/git/gitAccountService';
import { githubService, GitHubCommit } from '../../core/github/githubService';
import { useGitCacheStore } from '../../core/cache/gitCacheStore';
import { liveActivityService } from '../../core/services/liveActivityService';
import {
  tracciaProgettoAperto,
  tracciaErrore,
  tracciaProgettoEliminato,
  tracciaProgettoDuplicato,
  tracciaProgettoCondiviso,
  tracciaProgettoRinominato,
  tracciaErroreAperturaProgetto,
} from '../../core/services/analyticsService';
import { TFunction } from 'i18next';
import type { WorkstationInfo } from '../../shared/types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface UseProjectActionsParams {
  onOpenProject: (workstation: WorkstationInfo) => void;
  t: TFunction;
  user: { uid?: string } | null;
  sheetAnim: Animated.Value;
  progressTimerRef: React.MutableRefObject<NodeJS.Timeout | null>;
  currentProgressRef: React.MutableRefObject<number>;
  animateProgressTo: (targetProgress: number, step: string, duration?: number) => Promise<void>;
  setIsLoadingProject: (v: boolean) => void;
  setLoadingProjectName: (v: string) => void;
  setLoadingProgress: (v: number) => void;
  setLoadingStep: (v: string) => void;
  loadingProjectName: string;
  loadRecentProjects: (silent?: boolean) => Promise<void>;
  setRecentProjects: React.Dispatch<React.SetStateAction<WorkstationInfo[]>>;
  resetLoadingState: () => void;
}

export function useProjectActions({
  onOpenProject,
  t,
  user,
  sheetAnim,
  progressTimerRef,
  currentProgressRef,
  animateProgressTo,
  setIsLoadingProject,
  setLoadingProjectName,
  setLoadingProgress,
  setLoadingStep,
  loadingProjectName,
  loadRecentProjects,
  setRecentProjects,
  resetLoadingState,
}: UseProjectActionsParams) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedProject, setSelectedProject] = useState<WorkstationInfo | null>(null);
  const [repoVisibility, setRepoVisibility] = useState<'loading' | 'public' | 'private' | 'unknown'>('unknown');
  const [showCommits, setShowCommits] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isDuplicating, setIsDuplicating] = useState(false);

  const checkRepoVisibility = async (repoUrl: string) => {
    try {
      setRepoVisibility('loading');
      const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        setRepoVisibility('unknown');
        return;
      }
      const owner = match[1];
      const repo = match[2].replace('.git', '');

      const response = await apiClient.get(`https://api.github.com/repos/${owner}/${repo}`, {
        timeout: 5000,
        validateStatus: (status) => status < 500,
      });

      if (response.status === 200) {
        setRepoVisibility(response.data.private ? 'private' : 'public');
      } else if (response.status === 404) {
        setRepoVisibility('private');
      } else {
        setRepoVisibility('unknown');
      }
    } catch (error) {
      setRepoVisibility('unknown');
    }
  };

  const handleBrowseFiles = async () => {
    const PROJECT_MARKERS = [
      'package.json', 'index.html', 'requirements.txt', 'setup.py',
      'Cargo.toml', 'go.mod', 'pubspec.yaml', 'pom.xml', 'build.gradle',
      'Gemfile', 'composer.json', 'tsconfig.json', 'Makefile', 'CMakeLists.txt',
    ];

    const SKIP_PATTERNS = [
      'node_modules/', '.git/', 'dist/', 'build/', '.next/', '__pycache__/',
      '.DS_Store', 'Thumbs.db',
    ];

    const shouldSkip = (name: string) =>
      SKIP_PATTERNS.some(p => name.includes(p));

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const validAssets = result.assets.filter(f => !shouldSkip(f.name));
      if (validAssets.length === 0) {
        Alert.alert(t('common:error'), t('projects:file.noValidFileSelected'));
        return;
      }

      const hasMarker = validAssets.some(f =>
        PROJECT_MARKERS.some(m => f.name === m || f.name.endsWith(`/${m}`))
      );
      if (!hasMarker) {
        Alert.alert(
          t('file.invalidProjectTitle'),
          t('file.invalidProjectMessage')
        );
        return;
      }

      const markerFile = validAssets.find(f => PROJECT_MARKERS.includes(f.name));
      const projectName = markerFile
        ? markerFile.name.replace(/\.[^.]+$/, '') === markerFile.name
          ? t('file.localProject')
          : markerFile.name.replace(/\.[^.]+$/, '')
        : validAssets[0].name.replace(/\.[^.]+$/, '');

      setLoadingProjectName(projectName);
      currentProgressRef.current = 5;
      setLoadingProgress(5);
      setLoadingStep(t('progress.readingFiles'));
      setIsLoadingProject(true);

      const files: { path: string; content: string }[] = [];
      for (const asset of validAssets) {
        try {
          if (asset.size && asset.size > 1024 * 1024) continue;
          const content = await FileSystem.readAsStringAsync(asset.uri);
          files.push({ path: asset.name, content });
        } catch {
          // Skip unreadable files (binary, etc.)
        }
      }

      if (files.length === 0) {
        setIsLoadingProject(false);
        Alert.alert(t('common:error'), t('file.unableToReadSelected'));
        return;
      }

      await animateProgressTo(25, t('progress.creatingProject'), 500);

      const userId = user?.uid || 'anonymous';
      const project = await workstationService.savePersonalProject(projectName, userId, 'local');

      await animateProgressTo(45, t('progress.preparingWorkspace'), 500);
      await workstationService.createWorkstationForProject(project);

      await animateProgressTo(65, t('progress.uploadingFiles'), 500);
      await apiClient.post(`${config.apiUrl}/fly/project/${project.id}/upload-files`, { files }, { timeout: 60000 });

      await animateProgressTo(100, t('actions.opening'), 400);
      await new Promise(resolve => setTimeout(resolve, 200));

      onOpenProject({
        ...project,
        files: files.map(f => f.path),
        language: t('file.unknownLanguage'),
        folderId: null,
      });

      setTimeout(() => {
        resetLoadingState();
      }, 200);

    } catch (error: unknown) {
      console.error('Error opening local project:', error);
      setIsLoadingProject(false);
      setLoadingProjectName('');
      setLoadingProgress(0);
      setLoadingStep('');

      const axiosError = error as { response?: { data?: { error?: string; limits?: { maxLocal?: number; maxStorageMb?: number } } }; message?: string };
      const errCode = axiosError?.response?.data?.error;
      if (errCode === 'LOCAL_LIMIT_EXCEEDED') {
        const max = axiosError.response?.data?.limits?.maxLocal || '?';
        tracciaErrore('Local limit exceeded: ' + max, 'project_local');
        Alert.alert(t('alerts.localLimitTitle'), t('alerts.localLimitMessage', { max }));
      } else if (errCode === 'STORAGE_LIMIT_EXCEEDED') {
        const maxMb = axiosError.response?.data?.limits?.maxStorageMb || '?';
        tracciaErrore('Storage limit exceeded: ' + maxMb + 'MB', 'project_local');
        Alert.alert(t('alerts.storageFullTitle'), t('alerts.storageFullMessage', { maxMb }));
      } else {
        const msg = error instanceof Error ? error.message : 'Error opening project';
        tracciaErrore(msg, 'project_local');
        Alert.alert(t('common:error'), msg || t('projects:file.errorOpeningProject'));
      }
    }
  };

  const handleProjectOpen = async (project: WorkstationInfo) => {
   try {
    const startTime = Date.now();

    setLoadingProjectName(project.name);
    currentProgressRef.current = 5;
    setLoadingProgress(5);
    setLoadingStep(t('progress.preparing'));
    setIsLoadingProject(true);

    liveActivityService.startPreviewActivity(project.name, {
      remainingSeconds: 60,
      currentStep: t('progress.preparingLive'),
      progress: 0.05,
    }, 'open').catch((err) => console.warn('[Project] Failed to start live activity:', err?.message || err));

    const { currentWorkstation } = useTerminalStore.getState();
    if (currentWorkstation && currentWorkstation.id !== project.id) {
      await animateProgressTo(12, 'Cambio progetto...', 500);
    }

    const repoUrl = project.repositoryUrl || project.githubUrl;
    const userId = useTerminalStore.getState().userId || 'anonymous';

    workstationService.updateLastAccessed(project.id);

    const { isCacheValid } = useFileCacheStore.getState();
    const hasCachedFiles = isCacheValid(project.id);
    const { projectMachineIds } = useTerminalStore.getState();
    const existingMachineId = projectMachineIds[project.id];

    const isSameWorkstation = currentWorkstation?.id === project.id;

    if (hasCachedFiles && existingMachineId && isSameWorkstation) {

      await animateProgressTo(100, t('actions.opening'), 400);

      if (liveActivityService.isActivityActive()) {
        liveActivityService.endWithSuccess(project.name, t('actions.opened')).catch((err) => console.warn('[Project] Failed to end live activity:', err?.message || err));
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      onOpenProject(project);
      tracciaProgettoAperto(project.name);

      setTimeout(() => {
        resetLoadingState();
      }, 200);

      const backgroundUpdate = async () => {
        const gitPromises: Promise<unknown>[] = [];

        if (repoUrl && repoUrl.includes('github.com')) {
          gitPromises.push(
            (async () => {
              try {
                const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(\.git)?$/) || repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
                if (!match) return;
                const [, owner, repo] = match;
                const accounts = await gitAccountService.getAllAccounts(userId);
                const githubAccount = accounts.find(a => a.provider === 'github');
                const token = githubAccount ? await gitAccountService.getToken(githubAccount, userId) : null;
                const [commitsData, branchesData] = await Promise.all([
                  githubService.getCommits(owner, repo, token || undefined).catch(() => []),
                  githubService.getBranches(owner, repo, token || undefined).catch(() => [])
                ]);
                if (commitsData?.length > 0) {
                  const currentBranch = branchesData?.find((b: { name: string }) => b.name === 'main' || b.name === 'master')?.name || 'main';
                  useGitCacheStore.getState().setGitData(project.id, {
                    commits: commitsData.map((c: GitHubCommit, index: number) => ({
                      hash: c.sha,
                      shortHash: c.sha.substring(0, 7),
                      message: c.message.split('\n')[0],
                      author: c.author.name,
                      authorEmail: c.author.email,
                      authorAvatar: c.author.avatar_url,
                      authorLogin: c.author.login,
                      date: new Date(c.author.date).toISOString(),
                      isHead: index === 0,
                      branch: index === 0 ? currentBranch : undefined,
                      url: c.url,
                    })),
                    branches: branchesData?.map((b: { name: string }) => ({ name: b.name, isCurrent: b.name === currentBranch, isRemote: true })) || [],
                    status: null,
                    currentBranch,
                    isGitRepo: true
                  });
                }
              } catch (e) { }
            })()
          );
        }

        gitPromises.push(filePrefetchService.prefetchFiles(project.id, repoUrl, true));
        await Promise.all(gitPromises).catch((err) => console.warn('[Project] Background git update failed:', err?.message || err));
      };
      backgroundUpdate();
      return;
    }

    // === SLOW PATH: No cache, do full prefetch ===
    let vmCompleted = false;

    if (repoUrl && !existingMachineId) {
      try {
        animateProgressTo(25, t('progress.allocatingVm'), 1200);

        const tokenData = await gitAccountService.getTokenForRepo(userId, repoUrl).catch(() => null);
        const token = tokenData?.token || null;

        animateProgressTo(55, t('progress.syncingFiles'), 16000);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);

        try {
          const cloneAuthHeaders = await getAuthHeaders();
          console.log('[Home] VM warmup request:', { projectId: project.id, userId, hasAuth: !!cloneAuthHeaders['Authorization'] });
          var response = await fetch(`${config.apiUrl}/fly/clone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...cloneAuthHeaders },
            body: JSON.stringify({
              workstationId: project.id,
              repositoryUrl: repoUrl,
              githubToken: token,
            }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        const data = await response.json();

        if (!response.ok) {
          if (data?.error === 'CLONE_LIMIT_EXCEEDED') {
            throw new Error(t('alerts.cloneLimitMessage', { max: data.limits?.maxCloned || 1 }));
          }
          if (data?.error === 'STORAGE_LIMIT_EXCEEDED') {
            throw new Error(t('alerts.storageFullMessage', { maxMb: data.limits?.maxStorageMb || 500 }));
          }
          if (data?.error === 'PROJECT_LIMIT_EXCEEDED') {
            throw new Error(t('alerts.localLimitMessage', { max: data.limits?.maxCreated || 2 }));
          }
          const errorMsg = data?.error || data?.message || t('alerts.serverUnavailable');
          console.error('❌ [Home] VM warmup failed:', response.status, errorMsg);
          throw new Error(errorMsg);
        }

        if (data.projectInfo) {
          useTerminalStore.getState().setProjectInfo(data.projectInfo);
        }

        animateProgressTo(65, t('progress.detectingProject'), 500);
        vmCompleted = true;
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.warn('⚠️ [Home] VM warmup error:', errMsg);
        if (e instanceof Error && e.name === 'AbortError') {
          throw new Error(t('alerts.cloneTimeout'));
        }
        if (errMsg.includes('riprova') || errMsg.includes('richieste')) {
          throw e;
        }
      }
    } else if (existingMachineId && isSameWorkstation) {
      vmCompleted = true;
    } else if (existingMachineId && !isSameWorkstation) {
    }

    if (vmCompleted) {
      const parallelFetches: Promise<unknown>[] = [];

      if (repoUrl && repoUrl.includes('github.com')) {
        parallelFetches.push(
          (async () => {
            try {
              const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(\.git)?$/) || repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
              if (!match) return null;

              const [, owner, repo] = match;
              animateProgressTo(75, t('progress.loadingGitData'), 1200);

              const accounts = await gitAccountService.getAllAccounts(userId);
              const githubAccount = accounts.find(a => a.provider === 'github');
              const token = githubAccount ? await gitAccountService.getToken(githubAccount, userId) : null;

              const [commitsData, branchesData] = await Promise.all([
                githubService.getCommits(owner, repo, token || undefined).catch(() => []),
                githubService.getBranches(owner, repo, token || undefined).catch(() => [])
              ]);

              if (commitsData && commitsData.length > 0) {
                const currentBranch = branchesData?.find((b: { name: string }) => b.name === 'main' || b.name === 'master')?.name || 'main';

                useGitCacheStore.getState().setGitData(project.id, {
                  commits: commitsData.map((c: GitHubCommit, index: number) => ({
                    hash: c.sha,
                    shortHash: c.sha.substring(0, 7),
                    message: c.message.split('\n')[0],
                    author: c.author.name,
                    authorEmail: c.author.email,
                    authorAvatar: c.author.avatar_url,
                    authorLogin: c.author.login,
                    date: new Date(c.author.date).toISOString(),
                    isHead: index === 0,
                    branch: index === 0 ? currentBranch : undefined,
                    url: c.url,
                  })),
                  branches: branchesData?.map((b: { name: string }) => ({
                    name: b.name,
                    isCurrent: b.name === currentBranch,
                    isRemote: true,
                  })) || [],
                  status: null,
                  currentBranch,
                  isGitRepo: true
                });

              }
              return commitsData;
            } catch (e: unknown) {
              console.warn('⚠️ [Home] Git prefetch error:', e instanceof Error ? e.message : String(e));
              return null;
            }
          })()
        );
      }

      if (filePrefetchService.needsPrefetch(project.id)) {
        parallelFetches.push(
          (async () => {
            try {
              animateProgressTo(85, t('progress.loadingFiles'), 1500);
              const result = await filePrefetchService.prefetchFiles(project.id, repoUrl);
              return result;
            } catch (e: unknown) {
              console.warn('⚠️ [Home] File prefetch error:', e instanceof Error ? e.message : String(e));
              return null;
            }
          })()
        );
      }

      try {
        await Promise.race([
          Promise.all(parallelFetches),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Data prefetch timeout')), 10000))
        ]);
      } catch (_e: unknown) {
        console.warn('⚠️ [Home] Data prefetch timeout, continuing anyway');
      }
    }

    await animateProgressTo(100, t('actions.opening'), 800);

    if (liveActivityService.isActivityActive()) {
      liveActivityService.endWithSuccess(project.name, t('actions.opened')).catch((err) => console.warn('[Project] Failed to end live activity:', err?.message || err));
    }

    await new Promise(resolve => setTimeout(resolve, 200));

    onOpenProject(project);
    tracciaProgettoAperto(project.name);

    setTimeout(() => {
      resetLoadingState();
    }, 300);
   } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [Home] handleProjectOpen error:', errMsg);
    tracciaErrore(errMsg, 'project_open');
    tracciaErroreAperturaProgetto(loadingProjectName || 'unknown', errMsg);
    liveActivityService.endPreviewActivity().catch((err) => console.warn('[Project] Failed to end preview activity:', err instanceof Error ? err.message : String(err)));
    resetLoadingState();
    Alert.alert(t('common:error'), errMsg || t('all.unableToLoad'));
   }
  };

  const handleOpenMenu = (project: WorkstationInfo) => {
    setSelectedProject(project);
    setRepoVisibility('unknown');
    setMenuVisible(true);

    const repoUrl = project.repositoryUrl || project.githubUrl;
    if (repoUrl && repoUrl.includes('github.com')) {
      checkRepoVisibility(repoUrl);
    }

    Animated.spring(sheetAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const handleCloseMenu = () => {
    Animated.timing(sheetAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setMenuVisible(false);
      setSelectedProject(null);
    });
  };

  const handleDeleteProject = async () => {
    if (!selectedProject) return;

    Alert.alert(
      t('actions.delete'),
      t('actions.deleteConfirm', { name: selectedProject.name }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('common:delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const deletedProjectId = selectedProject.id;
              tracciaProgettoEliminato(selectedProject.name);
              await useTerminalStore.getState().removeWorkstation(deletedProjectId);
              setRecentProjects(prev => prev.filter((p) => p.id !== deletedProjectId));
              handleCloseMenu();
              setTimeout(() => {
                loadRecentProjects(true).catch(() => {});
              }, 1500);
            } catch (error) {
              console.error('❌ [Home] Error deleting project:', error);
              Alert.alert(t('common:error'), t('all.unableToLoad'));
            }
          },
        },
      ]
    );
  };

  const handleDuplicateProject = async () => {
    if (!selectedProject) return;
    tracciaProgettoDuplicato(selectedProject.name);
    setIsDuplicating(true);
    try {
      const duplicatedProject = {
        ...selectedProject,
        id: undefined,
        name: `${selectedProject.name} (${t('common:copy')})`,
        createdAt: new Date(),
      };

      const newWorkstation = await workstationService.createWorkstation(duplicatedProject);
      handleCloseMenu();
      loadRecentProjects();
      Alert.alert(t('common:success'), `${t('actions.duplicate')}: "${newWorkstation.name}"`);
    } catch (error) {
      console.error('Error duplicating project:', error);
      Alert.alert(t('common:error'), t('all.unableToLoad'));
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleShareProject = async () => {
    if (!selectedProject) return;
    tracciaProgettoCondiviso(selectedProject.name);
    const repoUrl = selectedProject.repositoryUrl || selectedProject.githubUrl;

    try {
      if (repoUrl) {
        await Share.share({
          message: `${t('projects:actions.shareMessage', { name: selectedProject.name })}\n${repoUrl}`,
          url: repoUrl,
          title: selectedProject.name,
        });
      } else {
        await Share.share({
          message: t('actions.shareMessage', { name: selectedProject.name }),
          title: selectedProject.name,
        });
      }
    } catch (error) {
      console.error('Error sharing project:', error);
    }
  };

  const handleOpenRename = () => {
    if (!selectedProject) return;
    const project = selectedProject;
    setNewProjectName(project.name);
    Animated.timing(sheetAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setMenuVisible(false);
      // Re-set selectedProject since handleCloseMenu would clear it
      setSelectedProject(project);
    });
    setTimeout(() => setShowRenameModal(true), 300);
  };

  const handleConfirmRename = async () => {
    if (!selectedProject || !newProjectName.trim()) return;

    if (newProjectName.trim() === selectedProject.name) {
      setShowRenameModal(false);
      return;
    }

    try {
      tracciaProgettoRinominato(selectedProject.name, newProjectName.trim());
      await workstationService.updateWorkstation(selectedProject.id, {
        name: newProjectName.trim()
      });
      setShowRenameModal(false);
      setSelectedProject(null);
      loadRecentProjects();
      Alert.alert(t('common:success'), t('actions.renameProject'));
    } catch (error) {
      console.error('Error renaming project:', error);
      Alert.alert(t('common:error'), t('all.unableToLoad'));
    }
  };

  return {
    // Menu state
    menuVisible,
    selectedProject,
    setSelectedProject,
    repoVisibility,
    showCommits,
    setShowCommits,
    showRenameModal,
    setShowRenameModal,
    newProjectName,
    setNewProjectName,
    isDuplicating,
    // Handlers
    handleBrowseFiles,
    handleProjectOpen,
    handleOpenMenu,
    handleCloseMenu,
    handleDeleteProject,
    handleDuplicateProject,
    handleShareProject,
    handleOpenRename,
    handleConfirmRename,
  };
}
