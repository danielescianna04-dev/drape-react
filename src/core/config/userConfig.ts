// LIVELLO 2: Credenziali Utente (salvate in Supabase user_configs table)
// Token personali e configurazioni specifiche dell'utente

import { supabase } from '../../lib/supabase/client';

interface UserCredentials {
  github?: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: string; // ISO date string in JSONB
  };
  openai?: { apiKey: string };
  anthropic?: { apiKey: string };
  google?: { apiKey: string };
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

export const userConfigService = {
  async getUserConfig(userId: string): Promise<UserConfig | null> {
    const { data, error } = await supabase
      .from('user_configs')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.error('[userConfig] getUserConfig:', error);
      return null;
    }
    if (!data) return null;
    return {
      userId: data.user_id,
      credentials: (data.credentials as unknown as UserCredentials) ?? {},
      preferences: (data.preferences as unknown as UserPreferences) ?? {
        defaultAiModel: 'auto',
        theme: 'dark',
        terminalSettings: { fontSize: 14, fontFamily: 'monospace' },
      },
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  },

  async saveUserConfig(config: Partial<UserConfig>): Promise<void> {
    if (!config.userId) throw new Error('userId is required');
    const { error } = await supabase
      .from('user_configs')
      .upsert({
        user_id: config.userId,
        credentials: (config.credentials ?? {}) as any,
        preferences: (config.preferences ?? undefined) as any,
      });
    if (error) throw error;
  },

  async saveGitHubToken(userId: string, accessToken: string, refreshToken?: string): Promise<void> {
    const current = await this.getUserConfig(userId);
    const credentials: UserCredentials = current?.credentials ?? {};
    credentials.github = {
      accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    };
    await this.saveUserConfig({ userId, credentials, preferences: current?.preferences });
  },

  async getGitHubToken(userId: string): Promise<string | null> {
    const config = await this.getUserConfig(userId);
    const gh = config?.credentials?.github;
    if (!gh?.accessToken) return null;
    if (gh.expiresAt && new Date() > new Date(gh.expiresAt)) {
      console.warn('GitHub token expired');
      return null;
    }
    return gh.accessToken;
  },

  async saveAiApiKey(
    userId: string,
    provider: 'openai' | 'anthropic' | 'google',
    apiKey: string,
  ): Promise<void> {
    const current = await this.getUserConfig(userId);
    const credentials: UserCredentials = current?.credentials ?? {};
    credentials[provider] = { apiKey };
    await this.saveUserConfig({ userId, credentials, preferences: current?.preferences });
  },

  async getAiApiKey(userId: string, provider: 'openai' | 'anthropic' | 'google'): Promise<string | null> {
    const config = await this.getUserConfig(userId);
    return config?.credentials?.[provider]?.apiKey ?? null;
  },

  async saveUserPreferences(userId: string, preferences: Partial<UserPreferences>): Promise<void> {
    const current = await this.getUserConfig(userId);
    const next = { ...(current?.preferences ?? {}), ...preferences } as UserPreferences;
    await this.saveUserConfig({ userId, credentials: current?.credentials, preferences: next });
  },

  async createDefaultConfig(userId: string): Promise<UserConfig> {
    const defaultConfig: UserConfig = {
      userId,
      credentials: {},
      preferences: {
        defaultAiModel: 'auto',
        theme: 'dark',
        terminalSettings: { fontSize: 14, fontFamily: 'monospace' },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.saveUserConfig(defaultConfig);
    return defaultConfig;
  },
};
