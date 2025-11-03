import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SplashScreen } from './src/features/splash/SplashScreen';
import * as Linking from 'expo-linking';
import Animated, { FadeIn, FadeOut, SlideInRight } from 'react-native-reanimated';

import { ProjectsHomeScreen } from './src/features/projects/ProjectsHomeScreen';
import { CreateProjectScreen } from './src/features/projects/CreateProjectScreen';
import { ImportGitHubModal } from './src/features/terminal/components/ImportGitHubModal';
import { GitHubAuthModal } from './src/features/terminal/components/GitHubAuthModal';
import { ErrorBoundary } from './src/shared/components/ErrorBoundary';
import { workstationService } from './src/core/workstation/workstationService-firebase';
import { githubTokenService } from './src/core/github/githubTokenService';
import { useTerminalStore } from './src/core/terminal/terminalStore';
import ChatPage from './src/pages/Chat/ChatPage';
import { VSCodeSidebar } from './src/features/terminal/components/VSCodeSidebar';

console.log('🔵 App.tsx loaded');

type Screen = 'splash' | 'home' | 'create' | 'terminal';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('splash');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingRepoUrl, setPendingRepoUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  
  const { addWorkstation, setWorkstation } = useTerminalStore();

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
  
  console.log('🟢 App rendering, currentScreen:', currentScreen);

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
    } catch (error: any) {
      setIsImporting(false);
      console.log('🔴 Import error:', error.response?.status);
      
      if (error.response?.status === 401 && !newToken) {
        console.log('🔐 Opening auth modal for:', url);
        setPendingRepoUrl(url);
        setShowAuthModal(true);
        setShowImportModal(false);
      }
    }
  };

  if (currentScreen === 'splash') {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <SplashScreen onFinish={() => {
            console.log('🟡 Splash finished, setting screen to home');
            setCurrentScreen('home');
          }} />
          <StatusBar style="light" />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
        {currentScreen === 'home' && (
          <Animated.View
            key="home-screen"
            entering={FadeIn.duration(300)}
            exiting={FadeOut.duration(200)}
            style={{ flex: 1 }}
          >
            <ProjectsHomeScreen
              onCreateProject={() => {
                console.log('Create project');
                setCurrentScreen('create');
              }}
              onImportProject={() => {
                console.log('Import project');
                setShowImportModal(true);
              }}
              onMyProjects={() => {
                console.log('My projects');
                setCurrentScreen('terminal');
              }}
              onOpenProject={(workstation) => {
                console.log('Opening project:', workstation.name);
                setWorkstation(workstation);
                setCurrentScreen('terminal');
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
              onCreate={(projectData) => {
                console.log('Creating project:', projectData);
                setCurrentScreen('terminal');
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
              {(tab, isCardMode, cardDimensions) => (
                <ChatPage tab={tab} isCardMode={isCardMode} cardDimensions={cardDimensions} />
              )}
            </VSCodeSidebar>
          </Animated.View>
        )}
      </ErrorBoundary>

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
