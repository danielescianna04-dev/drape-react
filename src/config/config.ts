// Hetzner Docker-Native backend (TypeScript)
// HTTPS via drape.info (nginx reverse proxy + Let's Encrypt)
const PRODUCTION_URL = 'https://drape.info';
const PRODUCTION_WS_URL = 'wss://drape.info';

// Dev: point to Hetzner (same as production)
const LOCAL_URL = 'https://drape.info';
const LOCAL_WS_URL = 'wss://drape.info';

// Coder (workspace) URL
const CODER_URL = process.env.EXPO_PUBLIC_CODER_URL || 'http://drape.info';

// @ts-ignore - __DEV__ is a React Native global (false in release builds)
const isProduction = process.env.EXPO_PUBLIC_ENV === 'production' || (typeof __DEV__ !== 'undefined' && !__DEV__);

export const config = {
  // Backend URLs
  apiUrl: isProduction ? PRODUCTION_URL : (process.env.EXPO_PUBLIC_API_URL || LOCAL_URL),
  wsUrl: isProduction ? PRODUCTION_WS_URL : (process.env.EXPO_PUBLIC_WS_URL || LOCAL_WS_URL),

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
