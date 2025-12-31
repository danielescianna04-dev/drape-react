// Google Cloud Run configuration
const PRODUCTION_URL = 'https://drape-ai-backend-xxxxx-uc.a.run.app';

// Auto-detect local IP from Metro bundler or environment
const getLocalIP = (): string => {
  // @ts-ignore - __DEV__ is a React Native global
  if (typeof __DEV__ === 'undefined' || !__DEV__) {
    // Production: use env or default
    return process.env.EXPO_PUBLIC_LOCAL_IP || '192.168.1.44';
  }

  // Development: Try multiple detection methods
  let detectedIP: string | null = null;

  // Method 1: Expo Constants (most reliable for Expo/EAS builds)
  try {
    // @ts-ignore - dynamic require
    const Constants = require('expo-constants').default;

    // Try all possible Expo host locations
    const hostUri =
      Constants?.expoConfig?.hostUri ||
      Constants?.manifest?.hostUri ||
      Constants?.manifest?.debuggerHost ||
      Constants?.manifest2?.extra?.expoClient?.hostUri ||
      Constants?.manifest2?.extra?.expoGo?.debuggerHost;

    if (hostUri) {
      const host = hostUri.split(':')[0];
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        detectedIP = host;
        console.log('🔍 [Config] Auto-discovered IP from Expo Constants:', detectedIP);
      }
    }
  } catch (e) {
    // Not using Expo Constants, try other methods
  }

  // Method 2: NativeModules sourceCode URL (React Native internals)
  if (!detectedIP) {
    try {
      // @ts-ignore
      const { SourceCode } = require('react-native').NativeModules;
      if (SourceCode?.scriptURL) {
        const match = SourceCode.scriptURL.match(/\/\/([^:\/]+)/);
        if (match && match[1] && match[1] !== 'localhost' && match[1] !== '127.0.0.1') {
          detectedIP = match[1];
          console.log('🔍 [Config] Auto-discovered IP from SourceCode:', detectedIP);
        }
      }
    } catch (e) {
      // SourceCode not available
    }
  }

  // Method 3: Check if API_URL in env already has correct host
  if (!detectedIP && process.env.EXPO_PUBLIC_API_URL) {
    const match = process.env.EXPO_PUBLIC_API_URL.match(/\/\/([^:\/]+)/);
    if (match && match[1] && match[1] !== 'localhost' && match[1] !== '127.0.0.1') {
      detectedIP = match[1];
      console.log('🔍 [Config] Using IP from EXPO_PUBLIC_API_URL:', detectedIP);
    }
  }

  // Fallback to environment variables or hardcoded default
  const finalIP = detectedIP || process.env.EXPO_PUBLIC_LOCAL_IP || process.env.LOCAL_IP || '192.168.1.44';

  if (!detectedIP) {
    console.log('⚠️ [Config] Could not auto-detect IP, using fallback:', finalIP);
  }

  return finalIP;
};

const LOCAL_IP = getLocalIP();
const LOCAL_URL = `http://${LOCAL_IP}:3000`;
const LOCAL_WS_URL = `ws://${LOCAL_IP}:3000`;

// Coder (workspace) URL
const CODER_URL = process.env.EXPO_PUBLIC_CODER_URL || 'http://drape.info';

const isProduction = process.env.EXPO_PUBLIC_ENV === 'production';

export const config = {
  // Backend URLs
  apiUrl: isProduction ? PRODUCTION_URL : (process.env.EXPO_PUBLIC_API_URL || LOCAL_URL),
  wsUrl: isProduction ? PRODUCTION_URL.replace('https://', 'wss://') : (process.env.EXPO_PUBLIC_WS_URL || LOCAL_WS_URL),

  // Coder workspace URL (for Agent communication)
  coderUrl: CODER_URL,

  // Endpoints
  endpoints: {
    health: '/health',
    ai: '/ai',
    agent: '/agent',
    terminal: '/terminal/execute',
    chat: '/ai/chat',
  },

  // AI Models
  aiModels: {
    auto: 'auto',
    gpt4: 'gpt-4',
    claude: 'claude-3',
    gemini: 'gemini-pro',
  },

  // GitHub OAuth
  github: {
    clientId: process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID || '',
    redirectUri: 'drape://github-callback',
  },

  // Google Cloud Project
  googleCloud: {
    projectId: 'drape-mobile-ide',
    region: 'us-central1',
    repository: 'drape-repo',
  },

  // Configuration
  settings: {
    enableLogging: !isProduction,
    enableDebugMode: !isProduction,
    apiTimeout: isProduction ? 30000 : 60000, // Increased to 60s for cloning operations
    retryAttempts: isProduction ? 3 : 1,
    maxConcurrentConnections: isProduction ? 5 : 1,
  },
};
