import axios from 'axios';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const GITHUB_CLIENT_ID = 'Ov23likDO7phRcPUBcrk';
const GITHUB_API_BASE = 'https://api.github.com';
const TOKEN_KEY = 'github_token';
const USER_KEY = 'github_user';

// Backend proxy URL
const BACKEND_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  private: boolean;
  stargazers_count: number;
  forks_count: number;
  clone_url: string;
  html_url: string;
  updated_at: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  public_repos: number;
}

// Storage adapter
const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  },
  
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  },
  
  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  },
};

class GitHubService {
  async getStoredToken(): Promise<string | null> {
    return await storage.getItem(TOKEN_KEY);
  }

  async getStoredUser(): Promise<GitHubUser | null> {
    const userData = await storage.getItem(USER_KEY);
    return userData ? JSON.parse(userData) : null;
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getStoredToken();
    return !!token;
  }

  // OAuth Web Flow - Redirect to GitHub
  startOAuthFlow(): void {
    if (Platform.OS !== 'web') {
      console.warn('OAuth flow is only supported on web platform');
      return;
    }
    
    const redirectUri = window.location.origin;
    const scope = 'repo,user:email,read:user';
    const state = Math.random().toString(36).substring(7);
    
    // Save state for verification
    localStorage.setItem('github_oauth_state', state);
    
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
    
    window.location.href = authUrl;
  }

  // Handle OAuth callback
  async handleOAuthCallback(code: string, state: string): Promise<boolean> {
    try {
      // Verify state
      const savedState = localStorage.getItem('github_oauth_state');
      if (state !== savedState) {
        console.error('State mismatch');
        return false;
      }
      
      // Exchange code for token via backend
      const response = await axios.post(`${BACKEND_URL}/github/exchange-code`, {
        code,
        redirect_uri: window.location.origin,
      });

      if (response.data.access_token) {
        await storage.setItem(TOKEN_KEY, response.data.access_token);
        
        // Fetch and store user info
        const user = await this.fetchCurrentUser();
        if (user) {
          await storage.setItem(USER_KEY, JSON.stringify(user));
        }
        
        // Clean up
        localStorage.removeItem('github_oauth_state');
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('OAuth callback error:', error);
      return false;
    }
  }

  async fetchCurrentUser(): Promise<GitHubUser | null> {
    const token = await this.getStoredToken();
    if (!token) return null;

    try {
      const response = await axios.get(`${GITHUB_API_BASE}/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      return response.data;
    } catch (error) {
      console.error('Fetch user error:', error);
      return null;
    }
  }

  async fetchRepositories(): Promise<GitHubRepository[]> {
    const token = await this.getStoredToken();
    if (!token) return [];

    try {
      const response = await axios.get(`${GITHUB_API_BASE}/user/repos`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
        params: {
          sort: 'updated',
          per_page: 100,
          affiliation: 'owner,collaborator',
        },
      });
      return response.data;
    } catch (error) {
      console.error('Fetch repos error:', error);
      return [];
    }
  }

  async logout(): Promise<void> {
    await storage.deleteItem(TOKEN_KEY);
    await storage.deleteItem(USER_KEY);
  }
}

export const githubService = new GitHubService();
