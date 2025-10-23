import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SplashScreen } from './src/features/splash/SplashScreen';
import TerminalScreen from './src/features/terminal/TerminalScreen';
import { ProjectsHomeScreen } from './src/features/projects/ProjectsHomeScreen';
import { CreateProjectScreen } from './src/features/projects/CreateProjectScreen';
import { ErrorBoundary } from './src/shared/components/ErrorBoundary';

console.log('🔵 App.tsx loaded');

type Screen = 'splash' | 'home' | 'create' | 'terminal';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('splash');
  
  console.log('🟢 App rendering, currentScreen:', currentScreen);

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
              setCurrentScreen('terminal');
            }}
            onMyProjects={() => {
              console.log('My projects');
              setCurrentScreen('terminal');
            }}
          />
        </ErrorBoundary>
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
              setCurrentScreen('terminal');
            }}
          />
        </ErrorBoundary>
        <StatusBar style="light" />
      </>
    );
  }

  console.log('🟢 Rendering TerminalScreen');
  return (
    <>
      <ErrorBoundary>
        <TerminalScreen />
      </ErrorBoundary>
      <StatusBar style="light" />
    </>
  );
}
