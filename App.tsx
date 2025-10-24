import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SplashScreen } from './src/features/splash/SplashScreen';
import TerminalScreen from './src/features/terminal/TerminalScreen';
import { ProjectsHomeScreen } from './src/features/projects/ProjectsHomeScreen';
import { CreateProjectScreen } from './src/features/projects/CreateProjectScreen';
import { ImportGitHubModal } from './src/features/terminal/components/ImportGitHubModal';
import { GitHubAuthModal } from './src/features/terminal/components/GitHubAuthModal';
import { ErrorBoundary } from './src/shared/components/ErrorBoundary';
import { workstationService } from './src/core/workstation/workstationService-firebase';
import { githubTokenService } from './src/core/github/githubTokenService';
import { useTerminalStore } from './src/core/terminal/terminalStore';
import { AppNavigator } from './src/navigation/AppNavigator'; // New import

console.log('🔵 App.tsx loaded');

type Screen = 'splash' | 'home' | 'create' | 'app'; // Changed 'terminal' to 'app'

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('splash');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingRepoUrl, setPendingRepoUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  
  const { addWorkstation, setWorkstation } = useTerminalStore();
  
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
      setCurrentScreen('app'); // Changed from 'terminal' to 'app'
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
      <>
        <SplashScreen onFinish={() => {
          console.log('🟡 Splash finished');
          setCurrentScreen('home');
        }} />
        <StatusBar style="light" />
      </>
    );
  }

  if (currentScreen === 'home') {
    return (
      <>
        <ErrorBoundary>
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
              setCurrentScreen('app'); // Changed from 'terminal' to 'app'
            }}
            onOpenProject={(workstation) => {
              console.log('Opening project:', workstation.name);
              setWorkstation(workstation);
              setCurrentScreen('app'); // Changed from 'terminal' to 'app'
            }}
          />
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
      </>
    );
  }

  if (currentScreen === 'create') {
    return (
      <>
        <ErrorBoundary>
          <CreateProjectScreen
            onBack={() => setCurrentScreen('home')}
            onCreate={(projectData) => {
              console.log('Creating project:', projectData);
              setCurrentScreen('app'); // Changed from 'terminal' to 'app'
            }}
          />
        </ErrorBoundary>
        <StatusBar style="light" />
      </>
    );
  }

  // Render AppNavigator for tabbed interface
  if (currentScreen === 'app') {
    console.log('🟢 Rendering AppNavigator');
    return (
      <>
        <ErrorBoundary>
          <AppNavigator />
        </ErrorBoundary>
        <StatusBar style="light" />
      </>
    );
  }

  // Fallback for any unhandled screen state (should not happen)
  console.log('🟢 Rendering TerminalScreen (Fallback)');
  return (
    <>
      <ErrorBoundary>
        <TerminalScreen />
      </ErrorBoundary>
      <StatusBar style="light" />
    </>
  );
}
