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
import { ImportGitHubModal } from './src/features/terminal/components/ImportGitHubModal';
import { GitHubAuthModal } from './src/features/terminal/components/GitHubAuthModal';
import { ErrorBoundary } from './src/shared/components/ErrorBoundary';
import { workstationService } from './src/core/workstation/workstationService-firebase';
import { githubTokenService } from './src/core/github/githubTokenService';
import { useTerminalStore } from './src/core/terminal/terminalStore';
import { useTabStore } from './src/core/tabs/tabStore';
import ChatPage from './src/pages/Chat/ChatPage';
import { VSCodeSidebar } from './src/features/terminal/components/VSCodeSidebar';
import { FileViewer } from './src/features/terminal/components/FileViewer';
import { NetworkConfigProvider } from './src/providers/NetworkConfigProvider';

console.log('🔵 App.tsx loaded');

type Screen = 'splash' | 'home' | 'create' | 'terminal' | 'allProjects';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('splash');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingRepoUrl, setPendingRepoUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const { addWorkstation, setWorkstation } = useTerminalStore();
  const { addTerminalItem: addTerminalItemToStore, clearTerminalItems, updateTerminalItemsByType } = useTabStore();

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
    try {
      setIsImporting(true);
      const userId = useTerminalStore.getState().userId || 'anonymous';

      const match = url.match(/github\.com\/([^\/]+)\//);
      const owner = match ? match[1] : 'unknown';

      let githubToken = newToken;
      if (!githubToken) {
        githubToken = await githubTokenService.getToken(owner, userId);
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
      setWorkstation(workstation); // Set as current workstation
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

          // Clone repository and update loading message
          try {
            await workstationService.getWorkstationFiles(workstation.projectId, url);

            // Stop loading animation by changing type to system
            updateTerminalItemsByType(currentTab.id, 'loading', {
              type: 'system',
              content: 'Cloning repository to workstation'
            });

            const repoName = url.split('/').pop()?.replace('.git', '') || project.name;
            addTerminalItemToStore(currentTab.id, {
              id: `success-${Date.now()}`,
              type: 'output',
              content: `✓ Repository cloned successfully: ${repoName}`,
              timestamp: new Date(),
            });
          } catch (err: any) {
            // Stop loading animation
            updateTerminalItemsByType(currentTab.id, 'loading', {
              type: 'system',
              content: 'Cloning repository to workstation'
            });

            addTerminalItemToStore(currentTab.id, {
              id: `error-${Date.now()}`,
              type: 'error',
              content: `✗ ${err.message || 'Failed to clone repository'}`,
              timestamp: new Date(),
            });
          }
        }
      }, 100);
    } catch (error: any) {
      setIsImporting(false);
      console.error('Import error:', error.response?.status);

      if (error.response?.status === 401 && !newToken) {
        setPendingRepoUrl(url);
        setShowAuthModal(true);
        setShowImportModal(false);
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
              onOpenProject={async (workstation) => {
                setWorkstation(workstation);
                setCurrentScreen('terminal');

                setTimeout(async () => {
                  const { activeTabId, tabs } = useTabStore.getState();
                  const currentTab = tabs.find(t => t.id === activeTabId);

                  if (currentTab && workstation.githubUrl) {
                    clearTerminalItems(currentTab.id);

                    addTerminalItemToStore(currentTab.id, {
                      id: `loading-${Date.now()}`,
                      type: 'loading',
                      content: 'Cloning repository to workstation',
                      timestamp: new Date(),
                    });

                    try {
                      await workstationService.getWorkstationFiles(workstation.projectId || workstation.id, workstation.githubUrl);

                      updateTerminalItemsByType(currentTab.id, 'loading', {
                        type: 'system',
                        content: 'Cloning repository to workstation'
                      });

                      const repoName = workstation.githubUrl.split('/').pop()?.replace('.git', '') || workstation.name;
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

                      addTerminalItemToStore(currentTab.id, {
                        id: `error-${Date.now()}`,
                        type: 'error',
                        content: `✗ ${err.message || 'Failed to clone repository'}`,
                        timestamp: new Date(),
                      });
                    }
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

                  if (currentTab && workstation.githubUrl) {
                    clearTerminalItems(currentTab.id);

                    addTerminalItemToStore(currentTab.id, {
                      id: `loading-${Date.now()}`,
                      type: 'loading',
                      content: 'Cloning repository to workstation',
                      timestamp: new Date(),
                    });

                    try {
                      await workstationService.getWorkstationFiles(workstation.projectId || workstation.id, workstation.githubUrl);

                      updateTerminalItemsByType(currentTab.id, 'loading', {
                        type: 'system',
                        content: 'Cloning repository to workstation'
                      });

                      const repoName = workstation.githubUrl.split('/').pop()?.replace('.git', '') || workstation.name;
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

                      addTerminalItemToStore(currentTab.id, {
                        id: `error-${Date.now()}`,
                        type: 'error',
                        content: `✗ ${err.message || 'Failed to clone repository'}`,
                        timestamp: new Date(),
                      });
                    }
                  }
                }, 100);
              }}
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
      <StatusBar style="light" />
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
