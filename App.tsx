import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SplashScreen } from './src/features/splash/SplashScreen';
import { AuthScreen } from './src/features/auth/AuthScreen';
import { TerminalScreen } from './src/features/terminal/TerminalScreen';

console.log('🔵 App.tsx loaded');

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  console.log('🟢 App rendering, showSplash:', showSplash, 'isAuthenticated:', isAuthenticated);

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

  if (!isAuthenticated) {
    return (
      <>
        <AuthScreen onAuthenticated={() => {
          console.log('🟢 User authenticated');
          setIsAuthenticated(true);
        }} />
        <StatusBar style="light" />
      </>
    );
  }

  console.log('🟢 Rendering TerminalScreen');
  return (
    <>
      <TerminalScreen />
      <StatusBar style="light" />
    </>
  );
}
