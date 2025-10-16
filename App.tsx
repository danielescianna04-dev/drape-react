import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SplashScreen } from './src/features/splash/SplashScreen';
import { TerminalScreen } from './src/features/terminal/TerminalScreen';
import { useFirebaseData } from './src/core/firebase/useFirebaseData';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  
  // Load Firebase data
  useFirebaseData();

  if (showSplash) {
    return (
      <>
        <SplashScreen onFinish={() => setShowSplash(false)} />
        <StatusBar style="light" />
      </>
    );
  }

  return (
    <>
      <TerminalScreen />
      <StatusBar style="light" />
    </>
  );
}
