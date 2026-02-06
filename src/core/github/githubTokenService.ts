import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../api/apiClient';

const TOKEN_PREFIX = 'github-token-';
const ACCOUNTS_KEY = 'github-accounts';

export interface GitHubAccount {
  id: string;
  username: string;
  avatarUrl: string;
  owner: string; // repository owner this token is for
  email?: string;
  addedAt: Date;
}

export const githubTokenService = {
  async saveToken(owner: string, token: string, userId: string): Promise<GitHubAccount | null> {
    const key = `${TOKEN_PREFIX}${userId}-${owner}`;
    try {
      await SecureStore.setItemAsync(key, token);

      // Fetch user info and save account
      const account = await this.fetchAndSaveAccount(owner, token, userId);
      return account;
    } catch (error) {
      console.error('Error saving GitHub token:', error);
      throw error;
    }
  },

  async fetchAndSaveAccount(owner: string, token: string, userId: string): Promise<GitHubAccount | null> {
    try {
      // Fetch user info from GitHub
      const response = await apiClient.get('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      const userData = response.data;
      const account: GitHubAccount = {
        id: `${userId}-${owner}`,
        username: userData.login,
        avatarUrl: userData.avatar_url,
        owner,
        email: userData.email,
        addedAt: new Date(),
      };

      // Save account to list
      await this.addAccountToList(account, userId);
      return account;
    } catch (error) {
      console.error('Error fetching GitHub user info:', error);
      // Still save a basic account entry
      const account: GitHubAccount = {
        id: `${userId}-${owner}`,
        username: owner,
        avatarUrl: '',
        owner,
        addedAt: new Date(),
      };
      await this.addAccountToList(account, userId);
      return account;
    }
  },

  async addAccountToList(account: GitHubAccount, userId: string): Promise<void> {
    try {
      const accounts = await this.getAccounts(userId);
      const existingIndex = accounts.findIndex(a => a.owner === account.owner);

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

  async getAccounts(userId: string): Promise<GitHubAccount[]> {
    try {
      const data = await AsyncStorage.getItem(`${ACCOUNTS_KEY}-${userId}`);
      if (data) {
        const accounts = JSON.parse(data) as GitHubAccount[];
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

  async getToken(owner: string, userId: string): Promise<string | null> {
    const key = `${TOKEN_PREFIX}${userId}-${owner}`;
    try {
      const token = await SecureStore.getItemAsync(key);
      if (token) {
      } else {
      }
      return token;
    } catch (error) {
      console.error('Error retrieving GitHub token:', error);
      return null;
    }
  },

  async getDefaultToken(userId: string): Promise<{ token: string; owner: string } | null> {
    try {
      const accounts = await this.getAccounts(userId);
      if (accounts.length > 0) {
        // Return the most recently added account's token
        const sortedAccounts = accounts.sort(
          (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
        );
        const owner = sortedAccounts[0].owner;
        const token = await this.getToken(owner, userId);
        if (token) {
          return { token, owner };
        }
      }
      return null;
    } catch (error) {
      console.error('Error getting default token:', error);
      return null;
    }
  },

  async deleteToken(owner: string, userId: string): Promise<void> {
    const key = `${TOKEN_PREFIX}${userId}-${owner}`;
    try {
      await SecureStore.deleteItemAsync(key);

      // Remove from accounts list
      const accounts = await this.getAccounts(userId);
      const filtered = accounts.filter(a => a.owner !== owner);
      await AsyncStorage.setItem(`${ACCOUNTS_KEY}-${userId}`, JSON.stringify(filtered));

    } catch (error) {
      console.error('Error deleting GitHub token:', error);
      throw error;
    }
  },

  async validateToken(token: string): Promise<{ valid: boolean; username?: string; avatarUrl?: string }> {
    try {
      const response = await apiClient.get('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      return {
        valid: true,
        username: response.data.login,
        avatarUrl: response.data.avatar_url,
      };
    } catch (error) {
      return { valid: false };
    }
  },

  async hasAnyToken(userId: string): Promise<boolean> {
    const accounts = await this.getAccounts(userId);
    return accounts.length > 0;
  },
};
