import { config } from '../../config/config';

// LIVELLO 1: Credenziali Sistema (da GitHub Secrets al build)
// Queste sono iniettate durante il build e permettono all'app di funzionare

interface SystemConfig {
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
  googleCloud: {
    projectId: string;
    region: string;
    // Service account viene gestito lato backend
  };
  github: {
    clientId: string;
    // Client secret è solo lato backend
  };
  backend: {
    apiUrl: string;
    wsUrl: string;
  };
}

// Configurazione sistema - iniettata al build da GitHub Secrets
export const getSystemConfig = (): SystemConfig => {
  // In sviluppo: usa .env locale
  // In produzione: usa variabili iniettate da GitHub Actions
  return {
    firebase: {
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'dev-api-key',
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'dev-project.firebaseapp.com',
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'dev-project',
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'dev-project.appspot.com',
      messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '123456789',
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:123456789:web:abcdef',
    },
    googleCloud: {
      projectId: process.env.EXPO_PUBLIC_GCP_PROJECT_ID || 'drape-mobile-ide',
      region: process.env.EXPO_PUBLIC_GCP_REGION || 'us-central1',
    },
    github: {
      clientId: process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID || 'dev-client-id',
    },
    backend: {
      apiUrl: config.apiUrl,
      wsUrl: config.wsUrl,
    }
  };
};

// Helper per verificare se siamo in produzione
export const isProduction = (): boolean => {
  return process.env.EXPO_PUBLIC_ENV === 'production';
};

// Helper per logging sicuro (non logga credenziali in produzione)
export const safeLog = (message: string, data?: any) => {
  if (!isProduction()) {
    console.log(message, data);
  }
};
