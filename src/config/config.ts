// Google Cloud Run configuration
const PRODUCTION_URL = 'https://drape-ai-backend-xxxxx-uc.a.run.app';
const LOCAL_URL = 'http://192.168.0.229:3001';

const isProduction = process.env.EXPO_PUBLIC_ENV === 'production';

export const config = {
  // Backend URLs
  apiUrl: process.env.EXPO_PUBLIC_API_URL || (isProduction ? PRODUCTION_URL : LOCAL_URL),
  wsUrl: process.env.EXPO_PUBLIC_WS_URL || (isProduction ? PRODUCTION_URL.replace('https://', 'wss://') : 'ws://192.168.0.229:3001'),
  
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
    apiTimeout: isProduction ? 30000 : 10000,
    retryAttempts: isProduction ? 3 : 1,
    maxConcurrentConnections: isProduction ? 5 : 1,
  },
};
