import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SplashScreen } from './src/features/splash/SplashScreen';
import { TerminalScreen } from './src/features/terminal/TerminalScreen';
import { ErrorBoundary } from './src/shared/components/ErrorBoundary';

console.log('🔵 App.tsx loaded');

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  
  console.log('🟢 App rendering, showSplash:', showSplash);

  if (showSplash) {
    return (
      <>
        <SplashScreen onFinish={() => {
          console.log('🟡 Splash finished');
          setShowSplash(false);
        }} />
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
