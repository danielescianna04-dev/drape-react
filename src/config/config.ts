// Hetzner Docker-Native backend (TypeScript)
// HTTPS via bynot.it (nginx reverse proxy + Let's Encrypt)
const PRODUCTION_URL = 'https://bynot.it';
const PRODUCTION_WS_URL = 'wss://bynot.it';

// Dev: point to Hetzner dev backend
const LOCAL_URL = 'https://dev.bynot.it';
const LOCAL_WS_URL = 'wss://dev.bynot.it';

// Coder (workspace) URL
const CODER_URL = process.env.EXPO_PUBLIC_CODER_URL || 'https://bynot.it';

// @ts-ignore - __DEV__ is a React Native global (false in release builds)
const isProduction = process.env.EXPO_PUBLIC_ENV === 'production' || (typeof __DEV__ !== 'undefined' && !__DEV__);

export const config = {
  // Backend URLs
  apiUrl: process.env.EXPO_PUBLIC_API_URL || (isProduction ? PRODUCTION_URL : LOCAL_URL),
  wsUrl: process.env.EXPO_PUBLIC_WS_URL || (isProduction ? PRODUCTION_WS_URL : LOCAL_WS_URL),

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
    redirectUri: 'bynot://github-callback',
  },

  // Google Cloud Project
  googleCloud: {
    projectId: 'bynotv2',
    region: 'us-central1',
    repository: 'bynot-repo',
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
