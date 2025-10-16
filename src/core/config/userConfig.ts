// LIVELLO 2: Credenziali Utente (salvate nel database Firebase)
// Token personali e configurazioni specifiche dell'utente

import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';

interface UserCredentials {
  github?: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  };
  openai?: {
    apiKey: string;
  };
  anthropic?: {
    apiKey: string;
  };
  google?: {
    apiKey: string;
  };
}

interface UserPreferences {
  defaultAiModel: string;
  theme: 'light' | 'dark' | 'auto';
  terminalSettings: {
    fontSize: number;
    fontFamily: string;
  };
}

interface UserConfig {
  userId: string;
  credentials: UserCredentials;
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
}

const COLLECTION = 'user_configs';

export const userConfigService = {
  // Carica configurazione utente
  async getUserConfig(userId: string): Promise<UserConfig | null> {
    try {
      const docRef = doc(db, COLLECTION, userId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        return {
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        } as UserConfig;
      }
      
      return null;
    } catch (error) {
      console.error('Error loading user config:', error);
      return null;
    }
  },

  // Salva configurazione utente
  async saveUserConfig(config: Partial<UserConfig>): Promise<void> {
    try {
      if (!config.userId) throw new Error('userId is required');
      
      const docRef = doc(db, COLLECTION, config.userId);
      const now = new Date();
      
      await setDoc(docRef, {
        ...config,
        updatedAt: now,
        createdAt: config.createdAt || now,
      }, { merge: true });
      
    } catch (error) {
      console.error('Error saving user config:', error);
      throw error;
    }
  },

  // Salva token GitHub dell'utente
  async saveGitHubToken(userId: string, accessToken: string, refreshToken?: string): Promise<void> {
    try {
      const docRef = doc(db, COLLECTION, userId);
      
      await updateDoc(docRef, {
        'credentials.github': {
          accessToken,
          refreshToken,
          expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 ore
        },
        updatedAt: new Date(),
      });
      
    } catch (error) {
      console.error('Error saving GitHub token:', error);
      throw error;
    }
  },

  // Ottieni token GitHub dell'utente
  async getGitHubToken(userId: string): Promise<string | null> {
    try {
      const config = await this.getUserConfig(userId);
      
      if (config?.credentials?.github?.accessToken) {
        // Verifica se il token è scaduto
        const expiresAt = config.credentials.github.expiresAt;
        if (expiresAt && new Date() > expiresAt) {
          console.warn('GitHub token expired');
          return null;
        }
        
        return config.credentials.github.accessToken;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting GitHub token:', error);
      return null;
    }
  },

  // Salva API key AI dell'utente
  async saveAiApiKey(userId: string, provider: 'openai' | 'anthropic' | 'google', apiKey: string): Promise<void> {
    try {
      const docRef = doc(db, COLLECTION, userId);
      
      await updateDoc(docRef, {
        [`credentials.${provider}.apiKey`]: apiKey,
        updatedAt: new Date(),
      });
      
    } catch (error) {
      console.error('Error saving AI API key:', error);
      throw error;
    }
  },

  // Ottieni API key AI dell'utente
  async getAiApiKey(userId: string, provider: 'openai' | 'anthropic' | 'google'): Promise<string | null> {
    try {
      const config = await this.getUserConfig(userId);
      return config?.credentials?.[provider]?.apiKey || null;
    } catch (error) {
      console.error('Error getting AI API key:', error);
      return null;
    }
  },

  // Salva preferenze utente
  async saveUserPreferences(userId: string, preferences: Partial<UserPreferences>): Promise<void> {
    try {
      const docRef = doc(db, COLLECTION, userId);
      
      await updateDoc(docRef, {
        preferences: {
          ...preferences,
        },
        updatedAt: new Date(),
      });
      
    } catch (error) {
      console.error('Error saving user preferences:', error);
      throw error;
    }
  },

  // Crea configurazione default per nuovo utente
  async createDefaultConfig(userId: string): Promise<UserConfig> {
    const defaultConfig: UserConfig = {
      userId,
      credentials: {},
      preferences: {
        defaultAiModel: 'auto',
        theme: 'dark',
        terminalSettings: {
          fontSize: 14,
          fontFamily: 'monospace',
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.saveUserConfig(defaultConfig);
    return defaultConfig;
  }
};
