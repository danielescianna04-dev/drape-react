import { useState, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import { workstationService } from '../core/workstation/workstationService-firebase';
import { githubTokenService } from '../core/github/githubTokenService';
import { gitAccountService } from '../core/git/gitAccountService';
import { requestGitAuth } from '../core/github/gitAuthStore';
import { useTerminalStore } from '../core/terminal/terminalStore';
import { useTabStore } from '../core/tabs/tabStore';
import { useAuthStore } from '../core/auth/authStore';
import { useCloneStatusStore } from '../core/clone/cloneStatusStore';
import { useFileCacheStore } from '../core/cache/fileCacheStore';
import { liveActivityService } from '../core/services/liveActivityService';
import { tracciaEntrataNelProgetto, tracciaErrore } from '../core/services/analyticsService';
import { getAuthToken } from '../core/api/getAuthToken';
import { parseGitUrl, checkRepoAccess } from './gitProviders';
import { config } from '../config/config';
import type { WorkstationInfo } from '../shared/types';
import i18n from '../i18n';

type Screen = 'splash' | 'auth' | 'consent' | 'onboarding' | 'onboardingFlow' | 'firstProjectChoice' | 'home' | 'create' | 'terminal' | 'allProjects' | 'settings' | 'plans';

interface UseAppProjectActionsParams {
  setCurrentScreen: (screen: Screen | ((prev: Screen) => Screen)) => void;
  currentScreen: Screen;
  isFirstCreate: boolean;
  setIsFirstCreate: (v: boolean) => void;
  setOnboardingDraft: (v: { experienceLevel: string | null; referralSource: string | null }) => void;
  setOnboardingInitialStep: (v: 'welcome' | 'consent' | 'experience' | 'referral') => void;
}

export function useAppProjectActions({
  setCurrentScreen,
  currentScreen,
  isFirstCreate,
  setIsFirstCreate,
  setOnboardingDraft,
  setOnboardingInitialStep,
}: UseAppProjectActionsParams) {
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingRepoUrl, setPendingRepoUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [limitModal, setLimitModal] = useState<{ message: string } | null>(null);
  const [pendingFirstProjectImportFromScreen, setPendingFirstProjectImportFromScreen] = useState<{
    previousWorkstationId: string | null;
  } | null>(null);

  const { addWorkstation, setWorkstation, clearGlobalTerminalLog, currentWorkstation } = useTerminalStore();
  const { addTerminalItem: addTerminalItemToStore, clearTerminalItems, updateTerminalItemsByType } = useTabStore();

  // Track projects currently being cloned to prevent duplicates
  const cloningProjects = useRef<Set<string>>(new Set());

  // Track import in progress to prevent double calls
  const importInProgress = useRef(false);

  const finalizeFirstProjectSetup = useCallback(() => {
    if (!isFirstCreate) return;

    const userId = useAuthStore.getState().user?.uid;
    if (userId) {
      useAuthStore.setState((state) => ({
        user: state.user ? { ...state.user, hasCreatedFirstProject: true } : state.user,
      }));

      workstationService.markFirstProjectCreated(userId)
        .catch((e: unknown) => console.warn('[App] Failed to mark first project:', e instanceof Error ? e.message : String(e)));
    }

    setOnboardingDraft({ experienceLevel: null, referralSource: null });
    setOnboardingInitialStep('welcome');
    setIsFirstCreate(false);
  }, [isFirstCreate, setOnboardingDraft, setOnboardingInitialStep, setIsFirstCreate]);

  // Helper function to check auth BEFORE opening project
  const checkAuthBeforeOpen = useCallback(async (
    githubUrl: string,
    workstationName: string,
    linkedGithubAccount?: string
  ): Promise<string | null> => {
    const userId = useTerminalStore.getState().userId || 'anonymous';

    // Check if we have accounts - use getAllAccounts to include Firebase accounts (cross-device sync)
    const accounts = await gitAccountService.getAllAccounts(userId);

    // If NO accounts at all, DON'T block - let the clone proceed without auth
    if (accounts.length === 0) {
      return ''; // Empty string = no token, but proceed anyway
    }

    // Try to get token for this repository using gitAccountService
    const tokenResult = await gitAccountService.getTokenForRepo(userId, githubUrl);
    let token = tokenResult?.token || null;

    // If we have accounts but no token for this specific repo, still allow proceeding
    if (!token) {
      return ''; // Empty string = proceed without pre-auth
    }

    return token;
  }, []);

  // Helper function to clone repository with auth popup if needed
  const cloneRepositoryWithAuth = useCallback(async (
    projectId: string,
    githubUrl: string,
    tabId: string,
    workstationName: string,
    linkedGithubAccount?: string,
    preAuthToken?: string | null
  ) => {
    // Prevent duplicate clones for the same project
    if (cloningProjects.current.has(projectId)) {
      return;
    }

    // Mark as cloning
    cloningProjects.current.add(projectId);
    const userId = useTerminalStore.getState().userId || 'anonymous';
    const match = githubUrl.match(/github\.com\/([^\/]+)\//);
    const owner = match ? match[1] : 'unknown';
    const repoName = githubUrl.split('/').pop()?.replace('.git', '') || workstationName;

    // Use pre-authenticated token if provided, or try to get one from saved accounts
    let token = preAuthToken || null;
    let usedAccountUsername = linkedGithubAccount || owner;

    // If no pre-auth token, check if we have one saved (but DON'T show popup yet)
    if (!token) {
      const tokenResult = await gitAccountService.getTokenForRepo(userId, githubUrl);
      token = tokenResult?.token || null;
    }

    // If we have a token, save the account to the project
    if (token) {
      try {
        const validation = await githubTokenService.validateToken(token);
        if (validation.valid && validation.username) {
          usedAccountUsername = validation.username;
          await workstationService.updateProjectGitHubAccount(projectId, usedAccountUsername);
        }
      } catch (e) {
        // Could not validate token
      }
    }

    addTerminalItemToStore(tabId, {
      id: `loading-${Date.now()}`,
      type: 'loading',
      content: 'Cloning repository to workstation',
      timestamp: new Date(),
    });

    try {
      await workstationService.getWorkstationFiles(projectId, githubUrl, token || undefined);

      // Mark project as cloned in Firebase
      await workstationService.markProjectAsCloned(projectId);

      updateTerminalItemsByType(tabId, 'loading', {
        type: 'system',
        content: 'Cloning repository to workstation'
      });

      addTerminalItemToStore(tabId, {
        id: `success-${Date.now()}`,
        type: 'output',
        content: `✓ Repository cloned successfully: ${repoName}`,
        timestamp: new Date(),
      });

      // End Live Activity with success + notification (if active from handleImportRepo)
      if (liveActivityService.isActivityActive()) {
        liveActivityService.endWithSuccess(repoName, 'Clonato!').catch(() => {});
        liveActivityService.sendNotification('Repository clonato!', `${repoName} e' pronto`, { type: 'clone_complete' }).catch(() => {});
      }
    } catch (err: unknown) {
      updateTerminalItemsByType(tabId, 'loading', {
        type: 'system',
        content: 'Cloning repository to workstation'
      });

      // Check if it's an auth error - silently show popup (NO error message)
      const errObj = err as { requiresAuth?: boolean; response?: { status?: number }; message?: string };
      const isAuthError = errObj.requiresAuth || errObj.response?.status === 401;
      if (isAuthError) {
        try {
          const newToken = await requestGitAuth(
            `Repository privato. Autenticazione richiesta per "${repoName}"`,
            { repositoryUrl: githubUrl, owner }
          );
          addTerminalItemToStore(tabId, {
            id: `retry-${Date.now()}`,
            type: 'loading',
            content: 'Ritentando con nuove credenziali...',
            timestamp: new Date(),
          });

          // Retry clone with new token
          await workstationService.getWorkstationFiles(projectId, githubUrl, newToken);

          // Mark project as cloned
          await workstationService.markProjectAsCloned(projectId);

          updateTerminalItemsByType(tabId, 'loading', {
            type: 'system',
            content: 'Ritentando con nuove credenziali...'
          });

          addTerminalItemToStore(tabId, {
            id: `success-${Date.now()}`,
            type: 'output',
            content: `✓ Repository cloned successfully: ${repoName}`,
            timestamp: new Date(),
          });

          // End Live Activity with success + notification
          if (liveActivityService.isActivityActive()) {
            liveActivityService.endWithSuccess(repoName, 'Clonato!').catch(() => {});
            liveActivityService.sendNotification('Repository clonato!', `${repoName} e' pronto`, { type: 'clone_complete' }).catch(() => {});
          }
        } catch (authErr: unknown) {
          liveActivityService.endPreviewActivity().catch(() => {});
          const authErrMsg = authErr instanceof Error ? authErr.message : String(authErr);
          // Only show error if user didn't just cancel
          if (authErrMsg !== 'Authentication cancelled') {
            addTerminalItemToStore(tabId, {
              id: `error-${Date.now()}`,
              type: 'error',
              content: `✗ ${authErrMsg || 'Autenticazione fallita'}`,
              timestamp: new Date(),
            });
          } else {
            // User cancelled - just show a system message, not an error
            addTerminalItemToStore(tabId, {
              id: `cancelled-${Date.now()}`,
              type: 'system',
              content: 'Autenticazione annullata',
              timestamp: new Date(),
            });
          }
        }
      } else {
        addTerminalItemToStore(tabId, {
          id: `error-${Date.now()}`,
          type: 'error',
          content: `✗ ${errObj.message || 'Failed to clone repository'}`,
          timestamp: new Date(),
        });
      }
    } finally {
      // Remove from cloning set when done (success or failure)
      cloningProjects.current.delete(projectId);
    }
  }, [addTerminalItemToStore, updateTerminalItemsByType]);

  const handleImportRepo = useCallback(async (url: string, newToken?: string, forceCopy?: boolean, branch?: string, skipLimitCheck?: boolean) => {
    // Guard against double calls
    if (importInProgress.current) {
      return;
    }

    importInProgress.current = true;

    const importModalWasOpen = showImportModal;
    if (importModalWasOpen) {
      setShowImportModal(false);
      // iOS cannot reliably stack the loading/auth modals on top of the import modal.
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    // Set global loading message
    setLoadingMessage('Cloning repository...');

    try {
      setIsImporting(true);
      const userId = useTerminalStore.getState().userId || 'anonymous';

      // Parse URL for any Git provider
      const parsed = parseGitUrl(url);
      const { owner, repo: repoName, provider } = parsed;

      // Start Live Activity (Dynamic Island)
      liveActivityService.startPreviewActivity(repoName, {
        remainingSeconds: 90,
        currentStep: 'Clonazione repository...',
        progress: 0,
      }, 'clone').catch(() => {});


      // Check if a project with this repo already exists (unless forceCopy is true)
      if (!forceCopy) {
        const existingProject = await workstationService.checkExistingProject(url, userId);
        if (existingProject) {

          // If project exists but is NOT cloned, it's an incomplete import (e.g., auth failed)
          // Continue with this project instead of showing dialog
          if (!existingProject.cloned) {
            // Don't create a new project, use the existing one
            const project = existingProject;

            let githubToken = newToken;
            if (!githubToken) {
              const tokenResult = await gitAccountService.getTokenForRepo(userId, url);
              githubToken = tokenResult?.token || null;
            }

            const wsResult = await workstationService.createWorkstationForProject(project, githubToken, branch);

            const workstation = {
              id: wsResult.workstationId || project.id,
              projectId: project.id,
              name: project.name,
              language: 'Unknown',
              status: (wsResult.status || 'running') as 'creating' | 'running' | 'stopped' | 'idle' | 'ready',
              createdAt: project.createdAt,
              files: [],
              githubUrl: project.repositoryUrl,
              folderId: null,
            };

            addWorkstation(workstation);
            setWorkstation(workstation);
            setShowImportModal(false);
            setIsImporting(false);
            importInProgress.current = false;
            setLoadingMessage(''); // Clear loading
            finalizeFirstProjectSetup();

            // Clear state and navigate
            const { activeTabId: currentActiveTabId } = useTabStore.getState();
            if (currentActiveTabId) {
              clearTerminalItems(currentActiveTabId);
            }
            clearGlobalTerminalLog();
            setCurrentScreen('terminal');

            // Clone repository
            setTimeout(async () => {
              const { activeTabId, tabs } = useTabStore.getState();
              const currentTab = tabs.find(t => t.id === activeTabId);
              const repoName = url.split('/').pop()?.replace('.git', '') || 'repository';

              if (currentTab) {
                addTerminalItemToStore(currentTab.id, {
                  id: `loading-${Date.now()}`,
                  type: 'loading',
                  content: 'Cloning repository to workstation',
                  timestamp: new Date(),
                });

                try {
                  await workstationService.getWorkstationFiles(workstation.projectId, url, githubToken || undefined);
                  await workstationService.markProjectAsCloned(workstation.projectId);

                  updateTerminalItemsByType(currentTab.id, 'loading', {
                    type: 'system',
                    content: 'Cloning repository to workstation'
                  });

                  addTerminalItemToStore(currentTab.id, {
                    id: `success-${Date.now()}`,
                    type: 'output',
                    content: `✓ Repository cloned successfully: ${repoName}`,
                    timestamp: new Date(),
                  });

                  // End Live Activity with success + notification
                  if (liveActivityService.isActivityActive()) {
                    liveActivityService.endWithSuccess(repoName, 'Clonato!').catch(() => {});
                  }
                  liveActivityService.sendNotification('Repository clonato!', `${repoName} e' pronto`, { type: 'clone_complete' }).catch(() => {});
                } catch (err: unknown) {
                  updateTerminalItemsByType(currentTab.id, 'loading', {
                    type: 'system',
                    content: 'Cloning repository to workstation'
                  });

                  const errObj2 = err as { requiresAuth?: boolean; response?: { status?: number }; message?: string };
                  const isAuthError = errObj2.requiresAuth || errObj2.response?.status === 401;
                  if (isAuthError) {
                    try {
                      const match = url.match(/github\.com\/([^\/]+)\//);
                      const owner = match ? match[1] : 'unknown';
                      const token = await requestGitAuth(
                        `Repository privato. Autenticazione richiesta per "${repoName}"`,
                        { repositoryUrl: url, owner }
                      );

                      addTerminalItemToStore(currentTab.id, {
                        id: `retry-loading-${Date.now()}`,
                        type: 'loading',
                        content: 'Ritentando con nuove credenziali...',
                        timestamp: new Date(),
                      });

                      await workstationService.getWorkstationFiles(workstation.projectId, url, token);
                      await workstationService.markProjectAsCloned(workstation.projectId);

                      updateTerminalItemsByType(currentTab.id, 'loading', {
                        type: 'system',
                        content: 'Ritentando con nuove credenziali...'
                      });

                      addTerminalItemToStore(currentTab.id, {
                        id: `success-${Date.now()}`,
                        type: 'output',
                        content: `✓ Repository cloned successfully: ${repoName}`,
                        timestamp: new Date(),
                      });

                      // End Live Activity with success + notification
                      if (liveActivityService.isActivityActive()) {
                        liveActivityService.endWithSuccess(repoName, 'Clonato!').catch(() => {});
                      }
                      liveActivityService.sendNotification('Repository clonato!', `${repoName} e' pronto`, { type: 'clone_complete' }).catch(() => {});
                    } catch (authErr: unknown) {
                      liveActivityService.endPreviewActivity().catch(() => {});
                      const authMsg = authErr instanceof Error ? authErr.message : String(authErr);
                      if (authMsg !== 'Authentication cancelled') {
                        addTerminalItemToStore(currentTab.id, {
                          id: `error-${Date.now()}`,
                          type: 'error',
                          content: `✗ ${authMsg || 'Autenticazione fallita'}`,
                          timestamp: new Date(),
                        });
                      } else {
                        addTerminalItemToStore(currentTab.id, {
                          id: `cancelled-${Date.now()}`,
                          type: 'system',
                          content: 'Autenticazione annullata',
                          timestamp: new Date(),
                        });
                      }
                    }
                  } else {
                    addTerminalItemToStore(currentTab.id, {
                      id: `error-${Date.now()}`,
                      type: 'error',
                      content: `✗ ${errObj2.message || 'Failed to clone repository'}`,
                      timestamp: new Date(),
                    });
                  }
                }
              }
            }, 100);

            return;
          }

          // Project exists AND is cloned - show dialog
          setIsImporting(false);
          importInProgress.current = false;
          setShowImportModal(false);
          setLoadingMessage(''); // Clear loading

          // Ask user what they want to do
          Alert.alert(
            'Repository già importata',
            `Hai già un progetto "${existingProject.name}" per questa repository.`,
            [
              {
                text: 'Annulla',
                style: 'cancel',
              },
              {
                text: 'Apri esistente',
                onPress: () => {
                  // Open the existing project
                  const workstation = {
                    id: `ws-${existingProject.id.toLowerCase()}`,
                    projectId: existingProject.id,
                    name: existingProject.name,
                    language: 'Unknown',
                    status: 'running' as const,
                    createdAt: existingProject.createdAt,
                    files: [],
                    githubUrl: existingProject.repositoryUrl,
                    repositoryUrl: existingProject.repositoryUrl,
                    folderId: null,
                    cloned: existingProject.cloned || false,
                  };
                  finalizeFirstProjectSetup();
                  setWorkstation(workstation);
                  setCurrentScreen('terminal');
                },
              },
              {
                text: 'Crea copia',
                onPress: () => {
                  // Re-call with forceCopy=true
                  handleImportRepo(url, newToken, true, branch);
                },
              },
            ]
          );
          return;
        }
      }

      let githubToken = newToken;

      if (!githubToken) {
        // Check if we have accounts - use getAllAccounts to include Firebase accounts (cross-device sync)
        const accounts = await gitAccountService.getAllAccounts(userId);

        // If NO accounts, try without auth first (works for public repos)
        if (accounts.length === 0) {
          githubToken = null;
        } else {
          // Have accounts - check if we have token for this repo
          const tokenResult = await gitAccountService.getTokenForRepo(userId, url);
          const existingToken = tokenResult?.token || null;

          // If only one account and has token, use it silently
          if (accounts.length === 1 && existingToken) {
            githubToken = existingToken;
          } else {
            githubToken = existingToken;
          }
        }
      } else {
        // Save token to both services to keep them in sync
        await githubTokenService.saveToken(owner, githubToken, userId);
        try {
          await gitAccountService.saveAccount('github', githubToken, userId);
        } catch (err) {
          console.warn('⚠️ Could not sync token to gitAccountService:', err);
        }
      }

      // Verify repo accessibility BEFORE creating the project
      try {
        const { accessible, status } = await checkRepoAccess(githubToken, parsed);

        if (!accessible) {
          // Hide loading modal AND import modal to avoid covering the auth popup
          setLoadingMessage('');
          setShowImportModal(false);
          // Wait for modals to dismiss before showing auth popup
          await new Promise(resolve => setTimeout(resolve, 500));

          // Update Live Activity
          liveActivityService.updatePreviewActivity({
            remainingSeconds: 60,
            currentStep: 'Autenticazione richiesta...',
            progress: 0.2,
          }).catch(() => {});

          try {
            const providerName = provider === 'github' ? 'GitHub' : provider === 'gitlab' ? 'GitLab' : provider === 'bitbucket' ? 'Bitbucket' : 'Git';
            const authToken = await requestGitAuth(
              `Repository privato o non accessibile.\nCollega un account ${providerName} per clonare "${repoName}".`,
              { repositoryUrl: url, owner }
            );

            if (authToken) {
              githubToken = authToken;
              setLoadingMessage('Verifica accesso...');

              // Re-verify with new token
              const recheck = await checkRepoAccess(authToken, parsed);

              if (!recheck.accessible) {
                throw new Error(
                  recheck.status === 404
                    ? `Repository non trovata o non accessibile con questo account.\n\nVerifica che:\n• L'URL sia corretto\n• L'account collegato abbia accesso alla repository\n• La repository non sia stata eliminata`
                    : recheck.status === 403
                      ? `L'account collegato non ha i permessi per accedere a questa repository. Prova con un account diverso.`
                      : `Impossibile accedere alla repository. Verifica l'URL e riprova.`
                );
              }
              // Auth successful, restore loading for clone
              setLoadingMessage('Cloning repository...');
            }
          } catch (authErr: unknown) {
            liveActivityService.endPreviewActivity().catch(() => {});
            const authMsg3 = authErr instanceof Error ? authErr.message : String(authErr);
            if (authMsg3 === 'Authentication cancelled') {
              throw new Error('__CANCELLED__');
            }
            throw authErr;
          }
        }
      } catch (accessErr: unknown) {
        const accessMsg = accessErr instanceof Error ? accessErr.message : String(accessErr);
        if (accessMsg === '__CANCELLED__') {
          // User cancelled — silent return
          setIsImporting(false);
          setPendingFirstProjectImportFromScreen(null);
          importInProgress.current = false;
          setLoadingMessage('');
          liveActivityService.endPreviewActivity().catch(() => {});
          return;
        }
        if (accessMsg?.includes('non ha accesso')) {
          Alert.alert('Accesso negato', accessMsg);
          setIsImporting(false);
          setPendingFirstProjectImportFromScreen(null);
          importInProgress.current = false;
          setLoadingMessage('');
          liveActivityService.endPreviewActivity().catch(() => {});
          return;
        }
        // Network errors etc. — let clone try anyway
        console.warn('📥 [handleImportRepo] Repo access check failed (network?):', accessMsg);
      }

      // Pre-check clone limits using lifetime counters (never reset on delete)
      const userPlan = useAuthStore.getState().user?.plan || 'free';
      const planCloneLimits: Record<string, number> = { free: 1, go: 5, pro: 25, team: 100 };
      const maxCloned = planCloneLimits[userPlan] || 1;
      const lifetimeCounts = await workstationService.getLifetimeCreationCounts(userId);
      if (!skipLimitCheck && lifetimeCounts.cloned >= maxCloned) {
        importInProgress.current = false;
        setIsImporting(false);
        setPendingFirstProjectImportFromScreen(null);
        setLoadingMessage('');
        setShowImportModal(false);
        setTimeout(() => {
          setLimitModal({ message: i18n.t('projects:limit.cloneLimitReached', { max: maxCloned, plan: userPlan }) });
        }, 400);
        return;
      }

      // If creating a copy, count existing copies and use next number
      let copyNumber: number | undefined;
      if (forceCopy) {
        const existingCount = await workstationService.countExistingCopies(url, userId);
        copyNumber = existingCount;
      }

      const project = await workstationService.saveGitProject(url, userId, copyNumber);
      let wsResult;
      try {
        const cloneTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Clone timeout: la repository impiega troppo tempo. Riprova più tardi.')), 60000)
        );
        wsResult = await Promise.race([
          workstationService.createWorkstationForProject(project, githubToken, branch),
          cloneTimeout,
        ]) as { workstationId?: string; status?: string; files?: { path: string }[] | string[] };
      } catch (wsError: unknown) {
        // Clone failed or timed out — clean up the project doc created above
        await workstationService.deleteProject(project.id).catch(() => {});
        const wsMsg = wsError instanceof Error ? wsError.message : String(wsError);
        tracciaErrore(wsMsg?.includes('timeout') ? 'Clone timeout' : (wsMsg || 'Clone fallito'), 'import_clone');
        throw wsError;
      }

      const workstation = {
        id: wsResult.workstationId || project.id,
        projectId: project.id,
        name: project.name,
        language: 'Unknown',
        status: (wsResult.status || 'running') as 'creating' | 'running' | 'stopped' | 'idle' | 'ready',
        createdAt: project.createdAt,
        files: [],
        githubUrl: project.repositoryUrl,
        folderId: null,
      };

      // SEED CACHE: If files returned, cache them immediately
      if (wsResult.files && wsResult.files.length > 0) {
        const filePaths = wsResult.files.map((f: string | { path: string }) => typeof f === 'string' ? f : f.path);
        useFileCacheStore.getState().setFiles(project.id, filePaths);
      }

      addWorkstation(workstation);
      setWorkstation(workstation);
      setShowImportModal(false);
      setIsImporting(false);
      importInProgress.current = false;

      // Stop loading only when ready to navigate
      setLoadingMessage('');

      const { activeTabId } = useTabStore.getState();

      // Clear the current tab BEFORE navigating to avoid showing old items
      if (activeTabId) {
        clearTerminalItems(activeTabId);
      }

      // ALSO clear the global terminal log!
      clearGlobalTerminalLog();

      tracciaEntrataNelProgetto(workstation.name || repoName);

      // Navigate BEFORE finalizing first project — prevents useEffect from
      // re-navigating to firstProjectChoice during the state update
      setCurrentScreen('terminal');
      finalizeFirstProjectSetup();

      // Add loading message to chat and clone repository
      setTimeout(async () => {
        const { activeTabId: currentActiveTabId, tabs } = useTabStore.getState();

        const currentTab = tabs.find(t => t.id === currentActiveTabId);

        if (currentTab) {

          addTerminalItemToStore(currentTab.id, {
            id: `loading-${Date.now()}`,
            type: 'loading',
            content: 'Cloning repository to workstation',
            timestamp: new Date(),
          });

          try {
            await workstationService.getWorkstationFiles(workstation.projectId, url, githubToken || undefined);

            // Mark project as cloned
            await workstationService.markProjectAsCloned(workstation.projectId);

            updateTerminalItemsByType(currentTab.id, 'loading', {
              type: 'system',
              content: 'Cloning repository to workstation'
            });

            addTerminalItemToStore(currentTab.id, {
              id: `success-${Date.now()}`,
              type: 'output',
              content: `✓ Repository cloned successfully: ${repoName}`,
              timestamp: new Date(),
            });

            // End Live Activity with success + notification
            if (liveActivityService.isActivityActive()) {
              liveActivityService.endWithSuccess(repoName, 'Clonato!').catch(() => {});
            }
            liveActivityService.sendNotification('Repository clonato!', `${repoName} e' pronto`, { type: 'clone_complete' }).catch(() => {});
          } catch (err: unknown) {
            updateTerminalItemsByType(currentTab.id, 'loading', {
              type: 'system',
              content: 'Cloning repository to workstation'
            });

            // Check if it's an auth error - silently show popup (NO error message)
            const errObj3 = err as { requiresAuth?: boolean; response?: { status?: number }; message?: string };
            const isAuthError = errObj3.requiresAuth || errObj3.response?.status === 401;
            if (isAuthError) {
              // Update Live Activity step
              liveActivityService.updatePreviewActivity({
                remainingSeconds: 60,
                currentStep: 'Autenticazione...',
                progress: 0.3,
              }).catch(() => {});

              try {
                const token = await requestGitAuth(
                  `Repository privato. Autenticazione richiesta per "${repoName}"`,
                  { repositoryUrl: url, owner }
                );

                // Show retry loading message
                addTerminalItemToStore(currentTab.id, {
                  id: `retry-loading-${Date.now()}`,
                  type: 'loading',
                  content: 'Ritentando con nuove credenziali...',
                  timestamp: new Date(),
                });

                // Update Live Activity
                liveActivityService.updatePreviewActivity({
                  remainingSeconds: 45,
                  currentStep: 'Clonazione con credenziali...',
                  progress: 0.5,
                }).catch(() => {});

                // Retry clone with new token
                await workstationService.getWorkstationFiles(workstation.projectId, url, token);

                // Mark project as cloned
                await workstationService.markProjectAsCloned(workstation.projectId);

                // Update loading to system
                updateTerminalItemsByType(currentTab.id, 'loading', {
                  type: 'system',
                  content: 'Ritentando con nuove credenziali...'
                });

                addTerminalItemToStore(currentTab.id, {
                  id: `success-${Date.now()}`,
                  type: 'output',
                  content: `✓ Repository cloned successfully: ${repoName}`,
                  timestamp: new Date(),
                });

                // End Live Activity with success + notification
                if (liveActivityService.isActivityActive()) {
                  liveActivityService.endWithSuccess(repoName, 'Clonato!').catch(() => {});
                }
                liveActivityService.sendNotification('Repository clonato!', `${repoName} e' pronto`, { type: 'clone_complete' }).catch(() => {});
              } catch (authErr: unknown) {
                liveActivityService.endPreviewActivity().catch(() => {});
                const authMsg4 = authErr instanceof Error ? authErr.message : String(authErr);
                // Only show error if user didn't just cancel
                if (authMsg4 !== 'Authentication cancelled') {
                  addTerminalItemToStore(currentTab.id, {
                    id: `error-${Date.now()}`,
                    type: 'error',
                    content: `✗ ${authMsg4 || 'Autenticazione fallita'}`,
                    timestamp: new Date(),
                  });
                } else {
                  // User cancelled - just show a system message, not an error
                  addTerminalItemToStore(currentTab.id, {
                    id: `cancelled-${Date.now()}`,
                    type: 'system',
                    content: 'Autenticazione annullata',
                    timestamp: new Date(),
                  });
                }
              }
            } else {
              liveActivityService.endPreviewActivity().catch(() => {});
              // Clone failed — delete the project so it doesn't count toward limits
              await workstationService.deleteProject(workstation.projectId).catch(() => {});
              tracciaErrore(errObj3.message || 'Clone fallito', 'import_clone_files');
              addTerminalItemToStore(currentTab.id, {
                id: `error-${Date.now()}`,
                type: 'error',
                content: `✗ ${errObj3.message || 'Failed to clone repository'}`,
                timestamp: new Date(),
              });
            }
          }
        }
      }, 100);
    } catch (error: unknown) {
      liveActivityService.endPreviewActivity().catch(() => {});
      setIsImporting(false);
      setPendingFirstProjectImportFromScreen(null);
      setLoadingMessage(''); // Clear loading on error

      // Handle limit errors (403 with specific error codes)
      const errFinal = error as { requiresAuth?: boolean; response?: { status?: number; data?: { error?: string; message?: string } }; message?: string };
      const errorCode = errFinal.response?.data?.error;
      const errorMsg = errFinal.response?.data?.message;
      console.error('🔴 [Import] 403 details:', { errorCode, errorMsg, status: errFinal.response?.status, data: errFinal.response?.data });
      if (errFinal.response?.status === 403 && (errorCode === 'CLONE_LIMIT_EXCEEDED' || errorCode === 'PROJECT_LIMIT_EXCEEDED' || errorCode === 'STORAGE_LIMIT_EXCEEDED')) {
        importInProgress.current = false;
        // Close import modal first — iOS can't present two modals simultaneously
        setShowImportModal(false);
        setTimeout(() => {
          setLimitModal({ message: errorMsg || i18n.t('projects:alerts.cloneLimitMessage', { max: 1 }) });
        }, 400);
        return;
      }

      // Handle 403 that's not a limit error — likely ownership or access issue
      if (errFinal.response?.status === 403 && !errorCode) {
        importInProgress.current = false;
        setLoadingMessage('');
        Alert.alert(
          'Errore di accesso',
          errorMsg || 'Non è stato possibile creare il progetto. Il server ha rifiutato la richiesta. Riprova o contatta il supporto.',
        );
        return;
      }

      // If auth error, silently show popup (NO error message, NO console.error)
      const isAuthError = errFinal.requiresAuth || errFinal.response?.status === 401;
      if (!isAuthError) {
        // Only log as error if it's NOT an expected auth error
        console.error('Import error:', errFinal.response?.status, errFinal.message);
      }
      if (isAuthError && !newToken) {
        setShowImportModal(false);
        // Reset flag before retry to allow the new call
        importInProgress.current = false;
        try {
          const token = await requestGitAuth(
            'Repository privato. Autenticazione GitHub richiesta.',
            { repositoryUrl: url, owner: url.match(/github\.com\/([^\/]+)\//)?.[1] }
          );
          // Retry with new token
          handleImportRepo(url, token, forceCopy, branch);
        } catch (err) {
          // User cancelled, do nothing - no error shown
        }
      } else {
        // Reset flag if not retrying
        importInProgress.current = false;
      }
    } finally {
      // Ensure flag is reset even if we forgot somewhere
      if (importInProgress.current) {
        importInProgress.current = false;
      }
      if (loadingMessage) {
        setLoadingMessage('');
      }
    }
  }, [showImportModal, addWorkstation, setWorkstation, clearGlobalTerminalLog, addTerminalItemToStore, clearTerminalItems, updateTerminalItemsByType, finalizeFirstProjectSetup, setCurrentScreen]);

  const handleFirstProjectClone = useCallback(async (url: string, branch?: string) => {
    const previousWorkstationId = useTerminalStore.getState().currentWorkstation?.id || null;

    await handleImportRepo(url, undefined, undefined, branch, true);

    const nextWorkstation = useTerminalStore.getState().currentWorkstation;
    const nextWorkstationId = nextWorkstation?.id || null;

    if (
      currentScreen === 'firstProjectChoice' &&
      nextWorkstationId &&
      nextWorkstationId !== previousWorkstationId
    ) {
      finalizeFirstProjectSetup();
      setCurrentScreen('terminal');
    }
  }, [handleImportRepo, currentScreen, finalizeFirstProjectSetup, setCurrentScreen]);

  // handleOpenProject: used by both ProjectsHomeScreen and AllProjectsScreen
  const handleOpenProject = useCallback(async (workstation: WorkstationInfo, opts?: { fromAllProjects?: boolean }) => {
    const githubUrl = workstation.githubUrl || workstation.repositoryUrl;

    // Check if we're switching to a DIFFERENT project
    const current = useTerminalStore.getState().currentWorkstation;
    const isSameProject = current?.id === workstation.id;

    // NAVIGATE IMMEDIATELY - auth/clone happens in background
    if (!isSameProject) {
      clearGlobalTerminalLog();

      if (opts?.fromAllProjects) {
        // Find the most recent chat for this project
        const { chatHistory } = useTerminalStore.getState();
        const projectChats = chatHistory.filter((c: { repositoryId?: string }) =>
          c.repositoryId === workstation.id || c.repositoryId === workstation.projectId
        );
        const mostRecentChat = projectChats.sort((a: { lastUsed?: string | Date }, b: { lastUsed?: string | Date }) =>
          new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
        )[0];

        const { activeTabId: preNavTabId, updateTab } = useTabStore.getState();

        if (mostRecentChat && mostRecentChat.messages && mostRecentChat.messages.length > 0) {
          if (preNavTabId) {
            updateTab(preNavTabId, {
              title: mostRecentChat.title,
              data: { chatId: mostRecentChat.id },
              terminalItems: mostRecentChat.messages
            });
          }
        } else {
          if (preNavTabId) {
            clearTerminalItems(preNavTabId);
          }
        }
      } else {
        // From home screen: save/restore tabs
        if (current?.id) {
          useTabStore.getState().saveProjectTabs(current.id);
        }
        useTabStore.getState().restoreProjectTabs(workstation.id);
      }
    }

    // INSTANT navigation - no blocking auth check
    setWorkstation(workstation);
    setCurrentScreen('terminal');

    // Background operations (auth check + clone sync)
    setTimeout(async () => {
      const { activeTabId, tabs } = useTabStore.getState();
      const currentTab = tabs.find(t => t.id === activeTabId);
      const apiToken = await getAuthToken(true);
      const apiHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(apiToken ? { 'Authorization': `Bearer ${apiToken}` } : {}),
      };

      if (currentTab) {
        if (githubUrl) {
          // Get auth token in background (non-blocking for UI)
          let authToken: string | null = null;
          try {
            authToken = await checkAuthBeforeOpen(
              githubUrl,
              workstation.name,
              workstation.githubAccountUsername
            );
          } catch (e) {
            console.warn('Auth check failed, continuing without token:', e);
          }

          // Start clone status tracking
          const repoName = githubUrl.split('/').pop()?.replace('.git', '') || 'repository';
          useCloneStatusStore.getState().startClone(workstation.id, repoName);

          // Trigger clone to ensure files are in Coder workspace
          fetch(`${config.apiUrl}/fly/clone`, {
            method: 'POST',
            headers: apiHeaders,
            body: JSON.stringify({
              workstationId: workstation.id,
              repositoryUrl: githubUrl,
              githubToken: authToken || null,
              userId: useAuthStore.getState().user?.email || 'anonymous',
            }),
          }).then(r => r.json()).then(result => {
            if (result.success) {
              useCloneStatusStore.getState().completeClone(workstation.id);
              useFileCacheStore.getState().clearCache(workstation.id);
              if (result.projectInfo) {
                useTerminalStore.getState().setProjectInfo(result.projectInfo);
              }
            } else {
              console.warn('⚠️ [Clone] Sync issue:', result.error || result.message);
              useCloneStatusStore.getState().failClone(workstation.id, result.error || result.message);
            }
          }).catch(e => {
            console.warn('Clone sync error:', e.message);
            useCloneStatusStore.getState().failClone(workstation.id, e.message);
          });

          // If not marked as cloned, do the full clone with auth
          if (!workstation.cloned) {
            await cloneRepositoryWithAuth(
              workstation.projectId || workstation.id,
              githubUrl,
              currentTab.id,
              workstation.name,
              workstation.githubAccountUsername,
              authToken
            );
          }
        } else {
          // No githubUrl - project might be already on VM or a local project.
          fetch(`${config.apiUrl}/fly/clone`, {
            method: 'POST',
            headers: apiHeaders,
            body: JSON.stringify({
              projectId: workstation.id,
            }),
          }).then(r => r.json()).then(result => {
            if (result.success || result.machineId) {
            } else {
              console.warn('⚠️ [VM] Start issue:', result.error || result.message);
            }
          }).catch(e => {
            console.warn('VM start error:', e.message);
          });
        }
      }
    }, 50);
  }, [clearGlobalTerminalLog, clearTerminalItems, setWorkstation, setCurrentScreen, checkAuthBeforeOpen, cloneRepositoryWithAuth]);

  return {
    // State
    showImportModal,
    setShowImportModal,
    showAuthModal,
    setShowAuthModal,
    pendingRepoUrl,
    setPendingRepoUrl,
    isImporting,
    loadingMessage,
    limitModal,
    setLimitModal,
    pendingFirstProjectImportFromScreen,
    setPendingFirstProjectImportFromScreen,
    // Actions
    checkAuthBeforeOpen,
    cloneRepositoryWithAuth,
    handleImportRepo,
    handleFirstProjectClone,
    handleOpenProject,
    finalizeFirstProjectSetup,
    // Store values passed through
    currentWorkstation,
  };
}
