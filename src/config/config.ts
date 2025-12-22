// Google Cloud Run configuration
const PRODUCTION_URL = 'https://drape-ai-backend-xxxxx-uc.a.run.app';

// Auto-detect local IP from environment (set by scripts/get-local-ip.js)
const LOCAL_IP = process.env.EXPO_PUBLIC_LOCAL_IP || '192.168.1.10';
const LOCAL_URL = `http://${LOCAL_IP}:3000`;
const LOCAL_WS_URL = `ws://${LOCAL_IP}:3000`;

// Coder (workspace) URL
const CODER_URL = process.env.EXPO_PUBLIC_CODER_URL || 'http://drape.info';

const isProduction = process.env.EXPO_PUBLIC_ENV === 'production';

export const config = {
  // Backend URLs
  apiUrl: process.env.EXPO_PUBLIC_API_URL || (isProduction ? PRODUCTION_URL : LOCAL_URL),
  wsUrl: process.env.EXPO_PUBLIC_WS_URL || (isProduction ? PRODUCTION_URL.replace('https://', 'wss://') : LOCAL_WS_URL),

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
