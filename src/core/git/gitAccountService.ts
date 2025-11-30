import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

// Supported Git providers
export type GitProvider =
  | 'github'
  | 'github-enterprise'
  | 'gitlab'
  | 'gitlab-server'
  | 'bitbucket'
  | 'bitbucket-server'
  | 'gitea';

export interface GitProviderConfig {
  id: GitProvider;
  name: string;
  icon: string;  // Ionicons name
  color: string;
  apiUrl: string;
  authUrl?: string;
  requiresServerUrl?: boolean;  // For self-hosted instances
}

export const GIT_PROVIDERS: GitProviderConfig[] = [
  {
    id: 'github',
    name: 'GitHub',
    icon: 'logo-github',
    color: '#24292e',
    apiUrl: 'https://api.github.com',
  },
  {
    id: 'github-enterprise',
    name: 'GitHub Enterprise',
    icon: 'logo-github',
    color: '#24292e',
    apiUrl: '',
    requiresServerUrl: true,
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    icon: 'git-branch',
    color: '#FC6D26',
    apiUrl: 'https://gitlab.com/api/v4',
  },
  {
    id: 'gitlab-server',
    name: 'GitLab Server',
    icon: 'git-branch',
    color: '#FC6D26',
    apiUrl: '',
    requiresServerUrl: true,
  },
  {
    id: 'bitbucket',
    name: 'Bitbucket',
    icon: 'logo-bitbucket',
    color: '#0052CC',
    apiUrl: 'https://api.bitbucket.org/2.0',
  },
  {
    id: 'bitbucket-server',
    name: 'Bitbucket Server',
    icon: 'logo-bitbucket',
    color: '#0052CC',
    apiUrl: '',
    requiresServerUrl: true,
  },
  {
    id: 'gitea',
    name: 'Gitea',
    icon: 'git-network',
    color: '#609926',
    apiUrl: '',
    requiresServerUrl: true,
  },
];

export interface GitAccount {
  id: string;
  provider: GitProvider;
  username: string;
  displayName?: string;
  avatarUrl: string;
  email?: string;
  serverUrl?: string;  // For self-hosted instances
  addedAt: Date;
}

const TOKEN_PREFIX = 'git-token-';
const ACCOUNTS_KEY = 'git-accounts';

export const gitAccountService = {
  getProviderConfig(provider: GitProvider): GitProviderConfig | undefined {
    return GIT_PROVIDERS.find(p => p.id === provider);
  },

  async saveAccount(
    provider: GitProvider,
    token: string,
    userId: string,
    serverUrl?: string
  ): Promise<GitAccount | null> {
    try {
      // Fetch user info based on provider
      const userInfo = await this.fetchUserInfo(provider, token, serverUrl);

      const account: GitAccount = {
        id: `${userId}-${provider}-${userInfo.username}`,
        provider,
        username: userInfo.username,
        displayName: userInfo.displayName,
        avatarUrl: userInfo.avatarUrl,
        email: userInfo.email,
        serverUrl,
        addedAt: new Date(),
      };

      // Save token securely
      const tokenKey = `${TOKEN_PREFIX}${userId}-${provider}-${userInfo.username}`;
      await SecureStore.setItemAsync(tokenKey, token);

      // Save account to list
      await this.addAccountToList(account, userId);

      console.log(`✅ ${provider} account saved:`, account.username);
      return account;
    } catch (error) {
      console.error(`Error saving ${provider} account:`, error);
      throw error;
    }
  },

  async fetchUserInfo(
    provider: GitProvider,
    token: string,
    serverUrl?: string
  ): Promise<{ username: string; displayName?: string; avatarUrl: string; email?: string }> {
    const config = this.getProviderConfig(provider);
    if (!config) throw new Error(`Unknown provider: ${provider}`);

    const baseUrl = serverUrl || config.apiUrl;

    switch (provider) {
      case 'github':
      case 'github-enterprise': {
        const response = await axios.get(`${baseUrl}/user`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        });
        return {
          username: response.data.login,
          displayName: response.data.name,
          avatarUrl: response.data.avatar_url,
          email: response.data.email,
        };
      }

      case 'gitlab':
      case 'gitlab-server': {
        const response = await axios.get(`${baseUrl}/user`, {
          headers: {
            'PRIVATE-TOKEN': token,
          },
        });
        return {
          username: response.data.username,
          displayName: response.data.name,
          avatarUrl: response.data.avatar_url,
          email: response.data.email,
        };
      }

      case 'bitbucket':
      case 'bitbucket-server': {
        const response = await axios.get(`${baseUrl}/user`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        return {
          username: response.data.username || response.data.account_id,
          displayName: response.data.display_name,
          avatarUrl: response.data.links?.avatar?.href || '',
          email: response.data.email,
        };
      }

      case 'gitea': {
        const response = await axios.get(`${baseUrl}/api/v1/user`, {
          headers: {
            Authorization: `token ${token}`,
          },
        });
        return {
          username: response.data.login,
          displayName: response.data.full_name,
          avatarUrl: response.data.avatar_url,
          email: response.data.email,
        };
      }

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  },

  async addAccountToList(account: GitAccount, userId: string): Promise<void> {
    try {
      const accounts = await this.getAccounts(userId);
      const existingIndex = accounts.findIndex(
        a => a.provider === account.provider && a.username === account.username
      );

      if (existingIndex >= 0) {
        accounts[existingIndex] = account;
      } else {
        accounts.push(account);
      }

      await AsyncStorage.setItem(`${ACCOUNTS_KEY}-${userId}`, JSON.stringify(accounts));
    } catch (error) {
      console.error('Error saving account to list:', error);
    }
  },

  async getAccounts(userId: string): Promise<GitAccount[]> {
    try {
      const data = await AsyncStorage.getItem(`${ACCOUNTS_KEY}-${userId}`);
      if (data) {
        const accounts = JSON.parse(data) as GitAccount[];
        return accounts.map(a => ({
          ...a,
          addedAt: new Date(a.addedAt),
        }));
      }
      return [];
    } catch (error) {
      console.error('Error getting accounts:', error);
      return [];
    }
  },

  async getAccountsByProvider(userId: string, provider: GitProvider): Promise<GitAccount[]> {
    const accounts = await this.getAccounts(userId);
    return accounts.filter(a => a.provider === provider);
  },

  async getToken(account: GitAccount, userId: string): Promise<string | null> {
    const key = `${TOKEN_PREFIX}${userId}-${account.provider}-${account.username}`;
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error('Error retrieving token:', error);
      return null;
    }
  },

  async getDefaultAccount(userId: string): Promise<GitAccount | null> {
    const accounts = await this.getAccounts(userId);
    if (accounts.length > 0) {
      // Return most recently added
      return accounts.sort(
        (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
      )[0];
    }
    return null;
  },

  async getDefaultToken(userId: string): Promise<{ token: string; account: GitAccount } | null> {
    const account = await this.getDefaultAccount(userId);
    if (account) {
      const token = await this.getToken(account, userId);
      if (token) {
        return { token, account };
      }
    }
    return null;
  },

  // Get token for a specific repository URL
  async getTokenForRepo(userId: string, repoUrl: string): Promise<{ token: string; account: GitAccount } | null> {
    const provider = this.detectProviderFromUrl(repoUrl);
    if (!provider) return null;

    const accounts = await this.getAccountsByProvider(userId, provider);
    if (accounts.length > 0) {
      const account = accounts[0]; // Use first matching provider account
      const token = await this.getToken(account, userId);
      if (token) {
        return { token, account };
      }
    }
    return null;
  },

  detectProviderFromUrl(url: string): GitProvider | null {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('github.com')) return 'github';
    if (lowerUrl.includes('gitlab.com')) return 'gitlab';
    if (lowerUrl.includes('bitbucket.org')) return 'bitbucket';
    // For self-hosted, we'd need more context
    return null;
  },

  async deleteAccount(account: GitAccount, userId: string): Promise<void> {
    try {
      // Delete token
      const key = `${TOKEN_PREFIX}${userId}-${account.provider}-${account.username}`;
      await SecureStore.deleteItemAsync(key);

      // Remove from accounts list
      const accounts = await this.getAccounts(userId);
      const filtered = accounts.filter(
        a => !(a.provider === account.provider && a.username === account.username)
      );
      await AsyncStorage.setItem(`${ACCOUNTS_KEY}-${userId}`, JSON.stringify(filtered));

      console.log(`✅ Account deleted: ${account.provider}/${account.username}`);
    } catch (error) {
      console.error('Error deleting account:', error);
      throw error;
    }
  },

  async validateToken(provider: GitProvider, token: string, serverUrl?: string): Promise<boolean> {
    try {
      await this.fetchUserInfo(provider, token, serverUrl);
      return true;
    } catch {
      return false;
    }
  },
};
