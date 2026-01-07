import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SplashScreen } from './src/features/splash/SplashScreen';
import * as Linking from 'expo-linking';
import Animated, { FadeIn, FadeOut, SlideInRight } from 'react-native-reanimated';

import { ProjectsHomeScreen } from './src/features/projects/ProjectsHomeScreen';
import { NavigationContainer } from '@react-navigation/native';
import { CreateProjectScreen } from './src/features/projects/CreateProjectScreen';
import { AllProjectsScreen } from './src/features/projects/AllProjectsScreen';
import { SettingsScreen } from './src/features/settings/SettingsScreen';
import { ImportGitHubModal } from './src/features/terminal/components/ImportGitHubModal';
import { GitHubAuthModal } from './src/features/terminal/components/GitHubAuthModal';
import { LoadingModal } from './src/shared/components/molecules/LoadingModal';
import { GitAuthPopup } from './src/features/terminal/components/GitAuthPopup';
import { ErrorBoundary } from './src/shared/components/ErrorBoundary';
import { workstationService } from './src/core/workstation/workstationService-firebase';
import { githubTokenService } from './src/core/github/githubTokenService';
import { gitAccountService } from './src/core/git/gitAccountService';
import { requestGitAuth } from './src/core/github/gitAuthStore';
import { useTerminalStore } from './src/core/terminal/terminalStore';
import { useTabStore } from './src/core/tabs/tabStore';
import { useAuthStore } from './src/core/auth/authStore';
import { AuthScreen } from './src/features/auth/AuthScreen';
import ChatPage from './src/pages/Chat/ChatPage';
import { VSCodeSidebar } from './src/features/terminal/components/VSCodeSidebar';
import { FileViewer } from './src/features/terminal/components/FileViewer';
import { NetworkConfigProvider } from './src/providers/NetworkConfigProvider';
import { migrateGitAccounts } from './src/core/migrations/migrateGitAccounts';
import { config } from './src/config/config';
import { useCloneStatusStore } from './src/core/clone/cloneStatusStore';
import { useFileCacheStore } from './src/core/cache/fileCacheStore';

console.log('App.tsx loaded');

type Screen = 'splash' | 'auth' | 'home' | 'create' | 'terminal' | 'allProjects' | 'settings';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('splash');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingRepoUrl, setPendingRepoUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  const { addWorkstation, setWorkstation, clearGlobalTerminalLog, globalTerminalLog } = useTerminalStore();
  const { addTerminalItem: addTerminalItemToStore, clearTerminalItems, updateTerminalItemsByType } = useTabStore();
  const { user, isInitialized, initialize } = useAuthStore();

  // Track projects currently being cloned to prevent duplicates
  const cloningProjects = useRef<Set<string>>(new Set());

  // Track import in progress to prevent double calls
  const importInProgress = useRef(false);

  // Initialize auth listener on app start
  useEffect(() => {
    initialize();
  }, []);

  // Navigate to home when user logs in
  useEffect(() => {
    if (isInitialized && user && currentScreen === 'auth') {
      console.log('🔐 [App] User authenticated, navigating to home');
      setCurrentScreen('home');
    }
  }, [user, isInitialized, currentScreen]);

  // Helper function to check auth BEFORE opening project
  // Returns token if auth successful, empty string if no auth needed (public repo), null if cancelled
  const checkAuthBeforeOpen = async (
    githubUrl: string,
    workstationName: string,
    linkedGithubAccount?: string
  ): Promise<string | null> => {
    console.log('🔐🔐🔐 [checkAuthBeforeOpen] START');
    console.log('🔐 [checkAuthBeforeOpen] githubUrl:', githubUrl);
    console.log('🔐 [checkAuthBeforeOpen] linkedGithubAccount:', linkedGithubAccount);

    const userId = useTerminalStore.getState().userId || 'anonymous';
    const match = githubUrl.match(/github\.com\/([^\/]+)\//);
    const owner = match ? match[1] : 'unknown';

    console.log('🔐 [checkAuthBeforeOpen] userId:', userId, 'owner:', owner);

    // Check if we have accounts - use getAllAccounts to include Firebase accounts (cross-device sync)
    const accounts = await gitAccountService.getAllAccounts(userId);
    console.log('🔐 [checkAuthBeforeOpen] gitAccountService accounts count:', accounts.length);

    // If NO accounts at all, DON'T block - let the clone proceed without auth
    // The backend will determine if auth is needed (public vs private repo)
    if (accounts.length === 0) {
      console.log('🔐🔐🔐 [checkAuthBeforeOpen] NO ACCOUNTS - proceeding without auth (may be public repo)');
      return ''; // Empty string = no token, but proceed anyway
    }

    // Try to get token for this repository using gitAccountService
    const tokenResult = await gitAccountService.getTokenForRepo(userId, githubUrl);
    let token = tokenResult?.token || null;

    console.log('🔐 [checkAuthBeforeOpen] token found via gitAccountService:', !!token);

    // If we have accounts but no token for this specific repo, still allow proceeding
    // The clone process will request auth if needed (for private repos)
    if (!token) {
      console.log('🔐 [checkAuthBeforeOpen] No token for this repo, but has accounts - proceeding');
      return ''; // Empty string = proceed without pre-auth
    }

    console.log('🔐 [checkAuthBeforeOpen] Using existing token');
    return token;
  };

  // Helper function to clone repository with auth popup if needed
  const cloneRepositoryWithAuth = async (
    projectId: string,
    githubUrl: string,
    tabId: string,
    workstationName: string,
    linkedGithubAccount?: string, // Account GitHub già collegato al progetto
    preAuthToken?: string | null // Token already obtained from checkAuthBeforeOpen
  ) => {
    // Prevent duplicate clones for the same project
    if (cloningProjects.current.has(projectId)) {
      console.log('🔄 [cloneRepositoryWithAuth] SKIPPING - already cloning:', projectId);
      return;
    }

    // Mark as cloning
    cloningProjects.current.add(projectId);
    console.log('🔄 [cloneRepositoryWithAuth] Starting clone for:', githubUrl);

    const userId = useTerminalStore.getState().userId || 'anonymous';
    const match = githubUrl.match(/github\.com\/([^\/]+)\//);
    const owner = match ? match[1] : 'unknown';
    const repoName = githubUrl.split('/').pop()?.replace('.git', '') || workstationName;

    console.log('🔄 [cloneRepositoryWithAuth] userId:', userId, 'owner:', owner);
    console.log('🔄 [cloneRepositoryWithAuth] linkedGithubAccount:', linkedGithubAccount);

    // Use pre-authenticated token if provided, or try to get one from saved accounts
    let token = preAuthToken || null;
    let usedAccountUsername = linkedGithubAccount || owner;

    // If no pre-auth token, check if we have one saved (but DON'T show popup yet)
    if (!token) {
      const tokenResult = await gitAccountService.getTokenForRepo(userId, githubUrl);
      token = tokenResult?.token || null;
      console.log('🔄 [cloneRepositoryWithAuth] Found saved token:', !!token);
    }

    // If we have a token, save the account to the project
    if (token) {
      try {
        const validation = await githubTokenService.validateToken(token);
        if (validation.valid && validation.username) {
          usedAccountUsername = validation.username;
          console.log('🔗 [cloneRepositoryWithAuth] Saving GitHub account to project:', usedAccountUsername);
          await workstationService.updateProjectGitHubAccount(projectId, usedAccountUsername);
        }
      } catch (e) {
        console.log('⚠️ Could not validate token:', e);
      }
    }

    // DON'T show auth popup here - try to clone first
    // The backend will tell us if auth is needed (401 for private repos)
    console.log('🔄 [cloneRepositoryWithAuth] Proceeding to clone (token:', token ? 'yes' : 'no', ')');

    addTerminalItemToStore(tabId, {
      id: `loading-${Date.now()}`,
      type: 'loading',
      content: 'Cloning repository to workstation',
      timestamp: new Date(),
    });

    try {
      console.log('🔄 [cloneRepositoryWithAuth] Calling getWorkstationFiles...');
      console.log('🔄 [cloneRepositoryWithAuth] projectId:', projectId);
      console.log('🔄 [cloneRepositoryWithAuth] githubUrl:', githubUrl);
      console.log('🔄 [cloneRepositoryWithAuth] token:', token ? token.substring(0, 10) + '...' : 'none');

      await workstationService.getWorkstationFiles(projectId, githubUrl, token || undefined);

      console.log('🔄 [cloneRepositoryWithAuth] Clone successful!');

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
    } catch (err: any) {
      updateTerminalItemsByType(tabId, 'loading', {
        type: 'system',
        content: 'Cloning repository to workstation'
      });

      // Check if it's an auth error - silently show popup (NO error message)
      console.log('🔄 [cloneRepositoryWithAuth] Error:', err.response?.status, err.message);
      console.log('🔄 [cloneRepositoryWithAuth] requiresAuth:', err.requiresAuth);

      const isAuthError = err.requiresAuth || err.response?.status === 401;
      if (isAuthError) {
        console.log('🔄 [cloneRepositoryWithAuth] Auth error - showing popup silently...');
        try {
          const newToken = await requestGitAuth(
            `Repository privato. Autenticazione richiesta per "${repoName}"`,
            { repositoryUrl: githubUrl, owner }
          );
          console.log('🔄 [cloneRepositoryWithAuth] Got new token, retrying...');

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
        } catch (authErr: any) {
          // Only show error if user didn't just cancel
          if (authErr.message !== 'User cancelled') {
            addTerminalItemToStore(tabId, {
              id: `error-${Date.now()}`,
              type: 'error',
              content: `✗ ${authErr.message || 'Autenticazione fallita'}`,
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
          content: `✗ ${err.message || 'Failed to clone repository'}`,
          timestamp: new Date(),
        });
      }
    } finally {
      // Remove from cloning set when done (success or failure)
      cloningProjects.current.delete(projectId);
      console.log('🔄 [cloneRepositoryWithAuth] Removed from cloning set:', projectId);
    }
  };

  const handleDeepLink = (url: string) => {
    const { path } = Linking.parse(url);
    if (path) {
      const githubUrlIndex = path.indexOf('github.com');
      if (githubUrlIndex > -1) {
        const githubUrl = path.substring(githubUrlIndex);
        handleImportRepo(githubUrl);
      }
    }
  };

  // Run migration on app startup to sync old accounts to new storage
  useEffect(() => {
    const runMigration = async () => {
      const userId = useTerminalStore.getState().userId || 'anonymous';
      await migrateGitAccounts(userId);
    };
    runMigration();
  }, []);

  // Load chat history from AsyncStorage on app startup
  useEffect(() => {
    const loadChatHistory = async () => {
      console.log('📥 [App] Loading chat history from AsyncStorage...');
      await useTerminalStore.getState().loadChats();
      const chatCount = useTerminalStore.getState().chatHistory.length;
      console.log('✅ [App] Chat history loaded:', chatCount, 'chats');
    };
    loadChatHistory();
  }, []);

  useEffect(() => {
    const handleInitialUrl = async () => {
      try {
        const url = await Linking.getInitialURL();
        console.log('Initial URL:', url);
        if (url) {
          handleDeepLink(url);
        }
      } catch (error) {
        console.error('Error getting initial URL:', error);
      }
    };

    handleInitialUrl();

    const subscription = Linking.addEventListener('url', ({ url }) => {
      console.log('Received URL:', url);
      try {
        handleDeepLink(url);
      } catch (error) {
        console.error('Error handling deep link:', error);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleImportRepo = async (url: string, newToken?: string, forceCopy?: boolean) => {
    // Guard against double calls
    if (importInProgress.current) {
      console.log('📥 [handleImportRepo] SKIPPING - import already in progress');
      return;
    }

    console.log('📥📥📥 [handleImportRepo] START - import for:', url);
    importInProgress.current = true;

    // Set global loading message
    setLoadingMessage('Cloning repository...');

    try {
      setIsImporting(true);
      const userId = useTerminalStore.getState().userId || 'anonymous';

      const match = url.match(/github\.com\/([^\/]+)\//);
      const owner = match ? match[1] : 'unknown';
      const repoName = url.split('/').pop()?.replace('.git', '') || 'repository';

      console.log('📥 [handleImportRepo] userId:', userId, 'owner:', owner, 'repoName:', repoName);

      // Check if a project with this repo already exists (unless forceCopy is true)
      if (!forceCopy) {
        const existingProject = await workstationService.checkExistingProject(url, userId);
        if (existingProject) {
          console.log('📥 [handleImportRepo] Project already exists:', existingProject.name, 'id:', existingProject.id, 'cloned:', existingProject.cloned);

          // If project exists but is NOT cloned, it's an incomplete import (e.g., auth failed)
          // Continue with this project instead of showing dialog
          if (!existingProject.cloned) {
            console.log('📥 [handleImportRepo] Project not cloned yet - continuing with existing project');
            // Don't create a new project, use the existing one
            const project = existingProject;

            let githubToken = newToken;
            if (!githubToken) {
              const tokenResult = await gitAccountService.getTokenForRepo(userId, url);
              githubToken = tokenResult?.token || null;
            }

            const wsResult = await workstationService.createWorkstationForProject(project, githubToken);

            const workstation = {
              id: wsResult.workstationId || project.id,
              projectId: project.id,
              name: project.name,
              language: 'Unknown',
              status: wsResult.status as any,
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
                } catch (err: any) {
                  updateTerminalItemsByType(currentTab.id, 'loading', {
                    type: 'system',
                    content: 'Cloning repository to workstation'
                  });

                  const isAuthError = err.requiresAuth || err.response?.status === 401;
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
                    } catch (authErr: any) {
                      if (authErr.message !== 'User cancelled') {
                        addTerminalItemToStore(currentTab.id, {
                          id: `error-${Date.now()}`,
                          type: 'error',
                          content: `✗ ${authErr.message || 'Autenticazione fallita'}`,
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
                      content: `✗ ${err.message || 'Failed to clone repository'}`,
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
                onPress: async () => {
                  // Open the existing project
                  console.log('📥 [handleImportRepo] Opening existing project:', existingProject.id);
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
                  setWorkstation(workstation);
                  setCurrentScreen('terminal');
                },
              },
              {
                text: 'Crea copia',
                onPress: () => {
                  // Re-call with forceCopy=true
                  handleImportRepo(url, newToken, true);
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
        console.log('📥 [handleImportRepo] gitAccountService accounts count:', accounts.length);

        // If NO accounts, try without auth first (works for public repos)
        // Auth will be requested later if clone fails with 401
        if (accounts.length === 0) {
          console.log('📥📥📥 [handleImportRepo] NO ACCOUNTS - trying without auth (public repo)');
          githubToken = null; // Will try clone without token first
        } else {
          // Have accounts - check if we have token for this repo
          const tokenResult = await gitAccountService.getTokenForRepo(userId, url);
          const existingToken = tokenResult?.token || null;
          console.log('📥 [handleImportRepo] hasExistingToken:', !!existingToken);

          // If only one account and has token, use it silently
          if (accounts.length === 1 && existingToken) {
            githubToken = existingToken;
          } else {
            // Multiple accounts or no token - let clone try without auth first
            // If it's a private repo, auth will be requested on 401
            console.log('📥📥📥 [handleImportRepo] Will try clone, auth on demand if needed');
            githubToken = existingToken; // Use existing if available, null otherwise
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

      // If creating a copy, count existing copies and use next number
      let copyNumber: number | undefined;
      if (forceCopy) {
        const existingCount = await workstationService.countExistingCopies(url, userId);
        copyNumber = existingCount; // First copy will be "copia 1" (when existingCount=1)
        console.log('📥 [handleImportRepo] Creating copy #', copyNumber);
      }

      const project = await workstationService.saveGitProject(url, userId, copyNumber);
      const wsResult = await workstationService.createWorkstationForProject(project, githubToken);

      const workstation = {
        id: wsResult.workstationId || project.id,
        projectId: project.id,
        name: project.name,
        language: 'Unknown',
        status: wsResult.status as any,
        createdAt: project.createdAt,
        files: [],
        githubUrl: project.repositoryUrl,
        folderId: null,
      };

      // SEED CACHE: If files returned, cache them immediately
      if (wsResult.files && wsResult.files.length > 0) {
        console.log(`🚀 [handleImportRepo] Seeding cache for imported project: ${wsResult.files.length} files`);
        // For file explorer, we store simpler paths - ensure they are strings
        const filePaths = wsResult.files.map((f: any) => typeof f === 'string' ? f : f.path);
        useFileCacheStore.getState().setFiles(project.id, filePaths);
      }

      addWorkstation(workstation);
      setWorkstation(workstation);
      setShowImportModal(false);
      setIsImporting(false);
      importInProgress.current = false;

      // Stop loading only when ready to navigate
      setLoadingMessage('');

      // DEBUG: Log tab state and global log before clearing
      const { activeTabId, tabs: tabsBefore } = useTabStore.getState();
      const { globalTerminalLog: globalLogBefore } = useTerminalStore.getState();
      console.log('📥📥📥 [IMPORT] === STATE BEFORE CLEAR ===');
      console.log('📥 [IMPORT] activeTabId:', activeTabId);
      console.log('📥 [IMPORT] Total tabs:', tabsBefore.length);
      console.log('📥 [IMPORT] 🌍 globalTerminalLog items:', globalLogBefore.length);
      tabsBefore.forEach(t => {
        console.log(`📥 [IMPORT] Tab "${t.id}": ${t.terminalItems?.length || 0} items`);
      });

      // Clear the current tab BEFORE navigating to avoid showing old items
      if (activeTabId) {
        console.log('📥 [IMPORT] Clearing tab:', activeTabId);
        clearTerminalItems(activeTabId);
      }

      // ALSO clear the global terminal log!
      console.log('📥 [IMPORT] 🌍 Clearing globalTerminalLog');
      clearGlobalTerminalLog();

      // DEBUG: Log state after clearing
      const { tabs: tabsAfter } = useTabStore.getState();
      const { globalTerminalLog: globalLogAfter } = useTerminalStore.getState();
      console.log('📥📥📥 [IMPORT] === STATE AFTER CLEAR ===');
      console.log('📥 [IMPORT] 🌍 globalTerminalLog items:', globalLogAfter.length);
      tabsAfter.forEach(t => {
        console.log(`📥 [IMPORT] Tab "${t.id}": ${t.terminalItems?.length || 0} items`);
      });

      setCurrentScreen('terminal');

      // Add loading message to chat and clone repository
      setTimeout(async () => {
        const { activeTabId: currentActiveTabId, tabs } = useTabStore.getState();
        console.log('📥📥📥 [IMPORT] === TAB STATE IN setTimeout ===');
        console.log('📥 [IMPORT] currentActiveTabId:', currentActiveTabId);
        tabs.forEach(t => {
          console.log(`📥 [IMPORT] Tab "${t.id}": ${t.terminalItems?.length || 0} items`);
        });

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
          } catch (err: any) {
            updateTerminalItemsByType(currentTab.id, 'loading', {
              type: 'system',
              content: 'Cloning repository to workstation'
            });

            // Check if it's an auth error - silently show popup (NO error message)
            const isAuthError = err.requiresAuth || err.response?.status === 401;
            if (isAuthError) {
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
              } catch (authErr: any) {
                // Only show error if user didn't just cancel
                if (authErr.message !== 'User cancelled') {
                  addTerminalItemToStore(currentTab.id, {
                    id: `error-${Date.now()}`,
                    type: 'error',
                    content: `✗ ${authErr.message || 'Autenticazione fallita'}`,
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
              addTerminalItemToStore(currentTab.id, {
                id: `error-${Date.now()}`,
                type: 'error',
                content: `✗ ${err.message || 'Failed to clone repository'}`,
                timestamp: new Date(),
              });
            }
          }
        }
      }, 100);
    } catch (error: any) {
      setIsImporting(false);
      setLoadingMessage(''); // Clear loading on error

      // If auth error, silently show popup (NO error message, NO console.error)
      const isAuthError = error.requiresAuth || error.response?.status === 401;
      if (!isAuthError) {
        // Only log as error if it's NOT an expected auth error
        console.error('Import error:', error.response?.status, error.message);
      } else {
        console.log('🔐 [handleImportRepo] Auth required, showing popup...');
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
          handleImportRepo(url, token, forceCopy);
        } catch (err) {
          // User cancelled, do nothing - no error shown
        }
      } else {
        // Reset flag if not retrying
        importInProgress.current = false;
      }
    } finally {
      // Ensure flag is reset even if we forgot somewhere
      // (Note: will be reset before this in retry cases)
      if (importInProgress.current) {
        importInProgress.current = false;
      }
      if (loadingMessage) {
        setLoadingMessage('');
      }
    }
  };

  // Handle splash screen finish - check auth state
  const handleSplashFinish = () => {
    if (isInitialized && user) {
      setCurrentScreen('home');
    } else if (isInitialized && !user) {
      setCurrentScreen('auth');
    } else {
      // Auth not initialized yet, wait a bit
      setCurrentScreen('auth');
    }
  };

  if (currentScreen === 'splash') {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        <SafeAreaProvider style={{ backgroundColor: '#000' }}>
          <SplashScreen onFinish={handleSplashFinish} />
          <StatusBar style="light" />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  // Show auth screen if not logged in
  if (currentScreen === 'auth' || (!user && isInitialized)) {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        <SafeAreaProvider style={{ backgroundColor: '#000' }}>
          <AuthScreen />
          <StatusBar style="light" />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  // Show loading if auth not initialized
  if (!isInitialized) {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        <SafeAreaProvider style={{ backgroundColor: '#000' }}>
          <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color="#9B8AFF" />
          </View>
          <StatusBar style="light" />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
      <SafeAreaProvider style={{ backgroundColor: '#000' }}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <NetworkConfigProvider>
            <ErrorBoundary>
              {currentScreen === 'home' && (
                <Animated.View
                  key="home-screen"
                  entering={FadeIn.duration(300)}
                  exiting={FadeOut.duration(200)}
                  style={{ flex: 1 }}
                >
                  <NavigationContainer independent={true}>
                    <ProjectsHomeScreen
                      onCreateProject={() => setCurrentScreen('create')}
                      onImportProject={() => setShowImportModal(true)}
                      onMyProjects={() => setCurrentScreen('allProjects')}
                      onSettings={() => setCurrentScreen('settings')}
                      onOpenProject={async (workstation) => {
                        const githubUrl = workstation.githubUrl || workstation.repositoryUrl;

                        // Check if we're switching to a DIFFERENT project
                        const currentWorkstation = useTerminalStore.getState().currentWorkstation;
                        const isSameProject = currentWorkstation?.id === workstation.id ||
                          currentWorkstation?.projectId === workstation.projectId;

                        console.log('🚀 [onOpenProject-Home] Opening project:', workstation.name,
                          'isSameProject:', isSameProject);

                        // NAVIGATE IMMEDIATELY - auth/clone happens in background
                        // Only clear terminal items when switching to a DIFFERENT project
                        if (!isSameProject) {
                          // Clear global terminal log
                          clearGlobalTerminalLog();

                          // Find the most recent chat for this project
                          const { chatHistory } = useTerminalStore.getState();
                          const projectChats = chatHistory.filter(c =>
                            c.repositoryId === workstation.id || c.repositoryId === workstation.projectId
                          );
                          const mostRecentChat = projectChats.sort((a, b) =>
                            new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
                          )[0];

                          const { activeTabId: preNavTabId, updateTab } = useTabStore.getState();

                          if (mostRecentChat && mostRecentChat.messages && mostRecentChat.messages.length > 0) {
                            // Load the most recent chat with its messages
                            console.log('📥 [onOpenProject-Home] Loading recent chat:', mostRecentChat.id, 'with', mostRecentChat.messages.length, 'messages');
                            if (preNavTabId) {
                              updateTab(preNavTabId, {
                                title: mostRecentChat.title,
                                data: { chatId: mostRecentChat.id },
                                terminalItems: mostRecentChat.messages
                              });
                            }
                          } else {
                            // No existing chat - clear items and start fresh
                            console.log('🗑️ [onOpenProject-Home] Different project - clearing tab:', preNavTabId);
                            if (preNavTabId) {
                              clearTerminalItems(preNavTabId);
                            }
                          }
                        } else {
                          console.log('✅ [onOpenProject-Home] Same project - preserving chat messages');
                        }

                        // INSTANT navigation - no blocking auth check
                        setWorkstation(workstation);
                        setCurrentScreen('terminal');

                        // Background operations (auth check + clone sync)
                        setTimeout(async () => {
                          const { activeTabId, tabs } = useTabStore.getState();
                          const currentTab = tabs.find(t => t.id === activeTabId);

                          if (currentTab && githubUrl) {
                            // Get auth token in background (non-blocking for UI)
                            let authToken: string | null = null;
                            try {
                              authToken = await checkAuthBeforeOpen(
                                githubUrl,
                                workstation.name,
                                workstation.githubAccountUsername
                              );
                              // If user cancelled auth popup, authToken will be null
                              // We still continue - clone might work for public repos
                            } catch (e) {
                              console.warn('Auth check failed, continuing without token:', e);
                            }

                            // Start clone status tracking
                            const repoName = githubUrl.split('/').pop()?.replace('.git', '') || 'repository';
                            useCloneStatusStore.getState().startClone(workstation.id, repoName);

                            // Trigger clone to ensure files are in Coder workspace
                            console.log('📂 [onOpenProject-Home] Triggering clone to sync files...');
                            fetch(`${config.apiUrl}/preview/clone`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                workstationId: workstation.id,
                                repositoryUrl: githubUrl,
                                githubToken: authToken || null,
                              }),
                            }).then(r => r.json()).then(result => {
                              if (result.success) {
                                console.log('✅ [Clone] Files synced to workspace');
                                useCloneStatusStore.getState().completeClone(workstation.id);
                                // Clear file cache so it refreshes with new files
                                useFileCacheStore.getState().clearCache(workstation.id);
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
                                authToken // Pass the pre-authenticated token
                              );
                            }
                          }
                        }, 50); // Reduced delay for faster background start
                      }}
                    />
                  </NavigationContainer>
                </Animated.View>
              )}

              {currentScreen === 'create' && (
                <Animated.View
                  key="create-screen"
                  entering={SlideInRight.duration(300)}
                  exiting={FadeOut.duration(200)}
                  style={{ flex: 1 }}
                >
                  <CreateProjectScreen
                    onBack={() => setCurrentScreen('home')}
                    onCreate={(workstation) => {
                      // 1. Set the new workstation
                      setWorkstation(workstation);

                      // 2. Clear previous tabs to avoid "zombie" state
                      useTabStore.getState().clearTabs();

                      // 3. SEED THE CACHE with the files returned by backend (instant loading!)
                      if (workstation.files && workstation.files.length > 0) {
                        const filePaths = workstation.files.map((f: any) =>
                          typeof f === 'string' ? f : f.path
                        );
                        console.log(`🚀 [App] Seeding cache with ${filePaths.length} files for new project`);
                        useFileCacheStore.getState().setFiles(
                          workstation.projectId || workstation.id,
                          filePaths
                        );
                      }

                      setCurrentScreen('terminal');

                      // Add welcome message to chat
                      setTimeout(() => {
                        const { activeTabId, tabs } = useTabStore.getState();
                        const currentTab = tabs.find(t => t.id === activeTabId);

                        if (currentTab) {
                          clearTerminalItems(currentTab.id);
                          addTerminalItemToStore(currentTab.id, {
                            id: `welcome-${Date.now()}`,
                            type: 'system',
                            content: `Project "${workstation.name}" created successfully!`,
                            timestamp: new Date(),
                          });
                          addTerminalItemToStore(currentTab.id, {
                            id: `info-${Date.now()}`,
                            type: 'output',
                            content: `Language: ${workstation.language || 'Not specified'}\nYou can start coding or ask the AI for help.`,
                            timestamp: new Date(),
                          });
                        }
                      }, 100);
                    }}
                  />
                </Animated.View>
              )}

              {currentScreen === 'terminal' && (
                <Animated.View
                  key="terminal-screen"
                  entering={FadeIn.duration(400)}
                  exiting={FadeOut.duration(200)}
                  style={{ flex: 1 }}
                >
                  <VSCodeSidebar
                    onExit={() => setCurrentScreen('home')}
                  >
                    {(tab, isCardMode, cardDimensions) => {
                      // Render different components based on tab type
                      if (tab.type === 'file') {
                        return (
                          <FileViewer
                            visible={true}
                            filePath={tab.data?.filePath || ''}
                            projectId={tab.data?.projectId || ''}
                            repositoryUrl={tab.data?.repositoryUrl}
                            userId={tab.data?.userId || 'anonymous'}
                            onClose={() => { }}
                          />
                        );
                      }

                      // Default to ChatPage for all other types
                      return (
                        <ChatPage tab={tab} isCardMode={isCardMode} cardDimensions={cardDimensions} />
                      );
                    }}
                  </VSCodeSidebar>
                </Animated.View>
              )}

              {currentScreen === 'allProjects' && (
                <Animated.View
                  key="all-projects-screen"
                  entering={SlideInRight.duration(300)}
                  exiting={FadeOut.duration(200)}
                  style={{ flex: 1 }}
                >
                  <AllProjectsScreen
                    onClose={() => setCurrentScreen('home')}
                    onOpenProject={async (workstation) => {
                      const githubUrl = workstation.githubUrl || workstation.repositoryUrl;

                      // Check if we're switching to a DIFFERENT project
                      const currentWorkstation = useTerminalStore.getState().currentWorkstation;
                      const isSameProject = currentWorkstation?.id === workstation.id ||
                        currentWorkstation?.projectId === workstation.projectId;

                      console.log('🚀 [onOpenProject-All] Opening project:', workstation.name,
                        'isSameProject:', isSameProject);

                      // NAVIGATE IMMEDIATELY - auth/clone happens in background
                      // Only clear terminal items when switching to a DIFFERENT project
                      if (!isSameProject) {
                        // Clear global terminal log
                        clearGlobalTerminalLog();

                        // Find the most recent chat for this project
                        const { chatHistory } = useTerminalStore.getState();
                        const projectChats = chatHistory.filter(c =>
                          c.repositoryId === workstation.id || c.repositoryId === workstation.projectId
                        );
                        const mostRecentChat = projectChats.sort((a, b) =>
                          new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
                        )[0];

                        const { activeTabId: preNavTabId, updateTab } = useTabStore.getState();

                        if (mostRecentChat && mostRecentChat.messages && mostRecentChat.messages.length > 0) {
                          // Load the most recent chat with its messages
                          console.log('📥 [onOpenProject-All] Loading recent chat:', mostRecentChat.id, 'with', mostRecentChat.messages.length, 'messages');
                          if (preNavTabId) {
                            updateTab(preNavTabId, {
                              title: mostRecentChat.title,
                              data: { chatId: mostRecentChat.id },
                              terminalItems: mostRecentChat.messages
                            });
                          }
                        } else {
                          // No existing chat - clear items and start fresh
                          console.log('🗑️ [onOpenProject-All] Different project - clearing tab:', preNavTabId);
                          if (preNavTabId) {
                            clearTerminalItems(preNavTabId);
                          }
                        }
                      } else {
                        console.log('✅ [onOpenProject-All] Same project - preserving chat messages');
                      }

                      // INSTANT navigation - no blocking auth check
                      setWorkstation(workstation);
                      setCurrentScreen('terminal');

                      // Background operations (auth check + clone sync)
                      setTimeout(async () => {
                        const { activeTabId, tabs } = useTabStore.getState();
                        const currentTab = tabs.find(t => t.id === activeTabId);

                        if (currentTab && githubUrl) {
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

                          // Check if project is already cloned - skip clone if so
                          if (workstation.cloned) {
                            console.log('✅ [onOpenProject-All] Project already cloned, skipping full clone');
                          } else {
                            // Project not cloned yet - do the clone
                            await cloneRepositoryWithAuth(
                              workstation.projectId || workstation.id,
                              githubUrl,
                              currentTab.id,
                              workstation.name,
                              workstation.githubAccountUsername,
                              authToken // Pass the pre-authenticated token
                            );
                          }
                        }
                      }, 50); // Reduced delay for faster background start
                    }}
                  />
                </Animated.View>
              )}

              {currentScreen === 'settings' && (
                <Animated.View
                  key="settings-screen"
                  entering={SlideInRight.duration(300)}
                  exiting={FadeOut.duration(200)}
                  style={{ flex: 1 }}
                >
                  <SettingsScreen
                    onClose={() => setCurrentScreen('home')}
                  />
                </Animated.View>
              )}
            </ErrorBoundary>
          </NetworkConfigProvider>
        </View>

        <ImportGitHubModal
          visible={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImport={handleImportRepo}
          isLoading={isImporting}
        />
        <GitHubAuthModal
          visible={showAuthModal}
          onClose={() => {
            setShowAuthModal(false);
            setPendingRepoUrl('');
          }}
          onAuthenticated={(token) => {
            setShowAuthModal(false);
            if (pendingRepoUrl) {
              handleImportRepo(pendingRepoUrl, token);
              setPendingRepoUrl('');
            }
          }}
        />
        <LoadingModal
          visible={!!loadingMessage}
          message={loadingMessage}
        />
        <GitAuthPopup />
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
