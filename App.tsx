import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SplashScreen } from './src/features/splash/SplashScreen';
import * as Linking from 'expo-linking';
import Animated, { FadeIn, FadeOut, SlideInRight } from 'react-native-reanimated';

import { ProjectsHomeScreen } from './src/features/projects/ProjectsHomeScreen';
import { CreateProjectScreen } from './src/features/projects/CreateProjectScreen';
import { AllProjectsScreen } from './src/features/projects/AllProjectsScreen';
import { GitManagementScreen } from './src/features/projects/GitManagementScreen';
import { ImportGitHubModal } from './src/features/terminal/components/ImportGitHubModal';
import { GitHubAuthModal } from './src/features/terminal/components/GitHubAuthModal';
import { GitAuthPopup } from './src/features/terminal/components/GitAuthPopup';
import { ErrorBoundary } from './src/shared/components/ErrorBoundary';
import { workstationService } from './src/core/workstation/workstationService-firebase';
import { githubTokenService } from './src/core/github/githubTokenService';
import { requestGitAuth } from './src/core/github/gitAuthStore';
import { useTerminalStore } from './src/core/terminal/terminalStore';
import { useTabStore } from './src/core/tabs/tabStore';
import ChatPage from './src/pages/Chat/ChatPage';
import { VSCodeSidebar } from './src/features/terminal/components/VSCodeSidebar';
import { FileViewer } from './src/features/terminal/components/FileViewer';
import { NetworkConfigProvider } from './src/providers/NetworkConfigProvider';

console.log('App.tsx loaded');

type Screen = 'splash' | 'home' | 'create' | 'terminal' | 'allProjects' | 'gitSettings';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('splash');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingRepoUrl, setPendingRepoUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const { addWorkstation, setWorkstation } = useTerminalStore();
  const { addTerminalItem: addTerminalItemToStore, clearTerminalItems, updateTerminalItemsByType } = useTabStore();

  // Helper function to clone repository with auth popup if needed
  const cloneRepositoryWithAuth = async (
    projectId: string,
    githubUrl: string,
    tabId: string,
    workstationName: string,
    linkedGithubAccount?: string // Account GitHub già collegato al progetto
  ) => {
    console.log('🔄 [cloneRepositoryWithAuth] Starting clone for:', githubUrl);

    const userId = useTerminalStore.getState().userId || 'anonymous';
    const match = githubUrl.match(/github\.com\/([^\/]+)\//);
    const owner = match ? match[1] : 'unknown';
    const repoName = githubUrl.split('/').pop()?.replace('.git', '') || workstationName;

    console.log('🔄 [cloneRepositoryWithAuth] userId:', userId, 'owner:', owner);
    console.log('🔄 [cloneRepositoryWithAuth] linkedGithubAccount:', linkedGithubAccount);

    // Check if we have accounts and need to choose
    const accounts = await githubTokenService.getAccounts(userId);

    // Prima prova con l'account già collegato al progetto
    let token = linkedGithubAccount
      ? await githubTokenService.getToken(linkedGithubAccount, userId)
      : await githubTokenService.getToken(owner, userId);

    let usedAccountUsername = linkedGithubAccount || owner;

    console.log('🔄 [cloneRepositoryWithAuth] accounts:', accounts.length, 'hasToken:', !!token);

    // Show popup if:
    // 1. Multiple accounts exist and no specific token for this owner - let user choose
    // 2. No token at all - need to authenticate
    const needsAuth = !token;
    const hasMultipleAccounts = accounts.length > 1 && !linkedGithubAccount;

    if (needsAuth || hasMultipleAccounts) {
      console.log('🔄 [cloneRepositoryWithAuth] Showing popup - needsAuth:', needsAuth, 'hasMultipleAccounts:', hasMultipleAccounts);
      try {
        token = await requestGitAuth(
          hasMultipleAccounts
            ? `Scegli un account per "${repoName}"`
            : `Autenticazione richiesta per "${repoName}"`,
          { repositoryUrl: githubUrl, owner }
        );
        console.log('🔄 [cloneRepositoryWithAuth] Got token from popup');

        // Get the username of the account that was authenticated
        const validation = await githubTokenService.validateToken(token);
        if (validation.valid && validation.username) {
          usedAccountUsername = validation.username;

          // Salva l'account GitHub nel progetto
          console.log('🔗 [cloneRepositoryWithAuth] Saving GitHub account to project:', usedAccountUsername);
          await workstationService.updateProjectGitHubAccount(projectId, usedAccountUsername);
        }
      } catch {
        // User cancelled
        console.log('🔄 [cloneRepositoryWithAuth] User cancelled auth');
        addTerminalItemToStore(tabId, {
          id: `cancelled-${Date.now()}`,
          type: 'system',
          content: 'Autenticazione annullata',
          timestamp: new Date(),
        });
        return;
      }
    }

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

      // Check if it's an auth error - show popup
      console.log('🔄 [cloneRepositoryWithAuth] Error:', err.response?.status, err.message);
      console.log('🔄 [cloneRepositoryWithAuth] Full error:', err);

      if (err.response?.status === 401) {
        console.log('🔄 [cloneRepositoryWithAuth] 401 error - showing auth popup...');
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
          addTerminalItemToStore(tabId, {
            id: `error-${Date.now()}`,
            type: 'error',
            content: `✗ ${authErr.message || 'Autenticazione annullata'}`,
            timestamp: new Date(),
          });
        }
      } else {
        addTerminalItemToStore(tabId, {
          id: `error-${Date.now()}`,
          type: 'error',
          content: `✗ ${err.message || 'Failed to clone repository'}`,
          timestamp: new Date(),
        });
      }
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

  const handleImportRepo = async (url: string, newToken?: string) => {
    console.log('📥 [handleImportRepo] Starting import for:', url);
    try {
      setIsImporting(true);
      const userId = useTerminalStore.getState().userId || 'anonymous';

      const match = url.match(/github\.com\/([^\/]+)\//);
      const owner = match ? match[1] : 'unknown';
      const repoName = url.split('/').pop()?.replace('.git', '') || 'repository';

      console.log('📥 [handleImportRepo] userId:', userId, 'owner:', owner, 'repoName:', repoName);

      let githubToken = newToken;

      if (!githubToken) {
        // Check if we have multiple accounts or need to choose
        const accounts = await githubTokenService.getAccounts(userId);
        const existingToken = await githubTokenService.getToken(owner, userId);

        console.log('📥 [handleImportRepo] accounts:', accounts.length, 'hasExistingToken:', !!existingToken);

        if (accounts.length > 1 || !existingToken) {
          // Multiple accounts: let user choose which to use
          // Or no token for this owner: prompt for auth
          console.log('📥 [handleImportRepo] Showing auth popup...');
          try {
            setShowImportModal(false);
            githubToken = await requestGitAuth(
              accounts.length > 1
                ? `Scegli un account per clonare "${repoName}"`
                : `Autenticazione richiesta per clonare "${repoName}"`,
              { repositoryUrl: url, owner }
            );
            console.log('📥 [handleImportRepo] Got token from popup');
          } catch (err) {
            // User cancelled
            console.log('📥 [handleImportRepo] User cancelled auth');
            setIsImporting(false);
            return;
          }
        } else {
          githubToken = existingToken;
        }
      } else {
        await githubTokenService.saveToken(owner, githubToken, userId);
      }

      const project = await workstationService.saveGitProject(url, userId);
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
      setCurrentScreen('terminal');

      // Add loading message to chat and clone repository
      setTimeout(async () => {
        const { activeTabId, tabs } = useTabStore.getState();
        const currentTab = tabs.find(t => t.id === activeTabId);

        if (currentTab) {
          addTerminalItemToStore(currentTab.id, {
            id: `loading-${Date.now()}`,
            type: 'loading',
            content: 'Cloning repository to workstation',
            timestamp: new Date(),
          });

          try {
            await workstationService.getWorkstationFiles(workstation.projectId, url, githubToken || undefined);

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

            // Check if it's an auth error - show popup
            if (err.response?.status === 401) {
              try {
                const token = await requestGitAuth(
                  `Repository privato. Autenticazione richiesta per "${repoName}"`,
                  { repositoryUrl: url, owner }
                );
                // Retry clone with new token
                await workstationService.getWorkstationFiles(workstation.projectId, url, token);
                addTerminalItemToStore(currentTab.id, {
                  id: `success-${Date.now()}`,
                  type: 'output',
                  content: `✓ Repository cloned successfully: ${repoName}`,
                  timestamp: new Date(),
                });
              } catch (authErr: any) {
                addTerminalItemToStore(currentTab.id, {
                  id: `error-${Date.now()}`,
                  type: 'error',
                  content: `✗ ${authErr.message || 'Autenticazione annullata'}`,
                  timestamp: new Date(),
                });
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
      console.error('Import error:', error.response?.status);

      // If 401, use the new popup system
      if (error.response?.status === 401 && !newToken) {
        setShowImportModal(false);
        try {
          const token = await requestGitAuth(
            'Repository privato. Autenticazione GitHub richiesta.',
            { repositoryUrl: url, owner: url.match(/github\.com\/([^\/]+)\//)?.[1] }
          );
          // Retry with new token
          handleImportRepo(url, token);
        } catch (err) {
          // User cancelled, do nothing
        }
      }
    }
  };

  if (currentScreen === 'splash') {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        <SafeAreaProvider style={{ backgroundColor: '#000' }}>
          <SplashScreen onFinish={() => setCurrentScreen('home')} />
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
            <ProjectsHomeScreen
              onCreateProject={() => setCurrentScreen('create')}
              onImportProject={() => setShowImportModal(true)}
              onMyProjects={() => setCurrentScreen('allProjects')}
              onSettings={() => setCurrentScreen('gitSettings')}
              onOpenProject={async (workstation) => {
                setWorkstation(workstation);
                setCurrentScreen('terminal');

                setTimeout(async () => {
                  const { activeTabId, tabs } = useTabStore.getState();
                  const currentTab = tabs.find(t => t.id === activeTabId);

                  const githubUrl = workstation.githubUrl || workstation.repositoryUrl;
                  if (currentTab && githubUrl) {
                    clearTerminalItems(currentTab.id);
                    await cloneRepositoryWithAuth(
                      workstation.projectId || workstation.id,
                      githubUrl,
                      currentTab.id,
                      workstation.name,
                      workstation.githubAccountUsername
                    );
                  }
                }, 100);
              }}
            />
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
                setWorkstation(workstation);
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
                      onClose={() => {}}
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
                setWorkstation(workstation);
                setCurrentScreen('terminal');

                setTimeout(async () => {
                  const { activeTabId, tabs } = useTabStore.getState();
                  const currentTab = tabs.find(t => t.id === activeTabId);

                  const githubUrl = workstation.githubUrl || workstation.repositoryUrl;
                  if (currentTab && githubUrl) {
                    clearTerminalItems(currentTab.id);
                    await cloneRepositoryWithAuth(
                      workstation.projectId || workstation.id,
                      githubUrl,
                      currentTab.id,
                      workstation.name,
                      workstation.githubAccountUsername
                    );
                  }
                }, 100);
              }}
            />
          </Animated.View>
        )}

        {currentScreen === 'gitSettings' && (
          <Animated.View
            key="git-settings-screen"
            entering={SlideInRight.duration(300)}
            exiting={FadeOut.duration(200)}
            style={{ flex: 1 }}
          >
            <GitManagementScreen
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
      <GitAuthPopup />
      <StatusBar style="light" />
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
