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
  id: string;
  name: string;
  fullName: string;
  description?: string;
  language: string;
  isPrivate: boolean;
  stars: number;
  forks: number;
  updatedAt: Date;
  cloneUrl: string;
  avatarUrl?: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  public_repos: number;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: Date;
    avatar_url?: string;
    login?: string;
  };
  committer: {
    name: string;
    email: string;
    date: Date;
  };
  url: string;
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
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

      const repos: GitHubRepository[] = response.data.map((repo: any) => ({
        id: repo.id.toString(),
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        language: repo.language,
        isPrivate: repo.private,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        updatedAt: new Date(repo.updated_at),
        cloneUrl: repo.clone_url,
        avatarUrl: repo.owner.avatar_url,
      }));

      return repos;
    } catch (error) {
      console.error('Fetch repos error:', error);
      return [];
    }
  }

  async logout(): Promise<void> {
    await storage.deleteItem(TOKEN_KEY);
    await storage.deleteItem(USER_KEY);
  }

  // Fetch commits for a repository
  async fetchCommits(repoUrl: string, token?: string, page = 1, perPage = 30): Promise<GitHubCommit[]> {
    try {
      // Extract owner/repo from URL
      const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        console.error('Invalid GitHub URL:', repoUrl);
        return [];
      }
      const owner = match[1];
      const repo = match[2].replace('.git', '');

      // Use provided token or stored token
      const authToken = token || await this.getStoredToken();

      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
      };
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      const response = await axios.get(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits`, {
        headers,
        params: {
          page,
          per_page: perPage,
        },
      });

      const commits: GitHubCommit[] = response.data.map((commit: any) => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: {
          name: commit.commit.author.name,
          email: commit.commit.author.email,
          date: new Date(commit.commit.author.date),
          avatar_url: commit.author?.avatar_url,
          login: commit.author?.login,
        },
        committer: {
          name: commit.commit.committer.name,
          email: commit.commit.committer.email,
          date: new Date(commit.commit.committer.date),
        },
        url: commit.html_url,
      }));

      return commits;
    } catch (error: any) {
      console.error('Fetch commits error:', error);
      if (error.response?.status === 404) {
        throw new Error('Repository non trovato o privato');
      }
      throw error;
    }
  }

  // Fetch commit details including files changed
  async fetchCommitDetails(repoUrl: string, sha: string, token?: string): Promise<GitHubCommit & { files: any[] }> {
    try {
      const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        throw new Error('Invalid GitHub URL');
      }
      const owner = match[1];
      const repo = match[2].replace('.git', '');

      const authToken = token || await this.getStoredToken();
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
      };
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      const response = await axios.get(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${sha}`, {
        headers,
      });

      return {
        sha: response.data.sha,
        message: response.data.commit.message,
        author: {
          name: response.data.commit.author.name,
          email: response.data.commit.author.email,
          date: new Date(response.data.commit.author.date),
          avatar_url: response.data.author?.avatar_url,
          login: response.data.author?.login,
        },
        committer: {
          name: response.data.commit.committer.name,
          email: response.data.commit.committer.email,
          date: new Date(response.data.commit.committer.date),
        },
        url: response.data.html_url,
        stats: response.data.stats,
        files: response.data.files || [],
      };
    } catch (error) {
      console.error('Fetch commit details error:', error);
      throw error;
    }
  }
  // Get commits using owner and repo directly
  async getCommits(owner: string, repo: string, token?: string, page = 1, perPage = 30): Promise<GitHubCommit[]> {
    try {
      const authToken = token || await this.getStoredToken();
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
      };
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      const response = await axios.get(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits`, {
        headers,
        params: {
          page,
          per_page: perPage,
        },
      });

      const commits: GitHubCommit[] = response.data.map((commit: any) => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: {
          name: commit.commit.author.name,
          email: commit.commit.author.email,
          date: new Date(commit.commit.author.date),
          avatar_url: commit.author?.avatar_url,
          login: commit.author?.login,
        },
        committer: {
          name: commit.commit.committer.name,
          email: commit.commit.committer.email,
          date: new Date(commit.commit.committer.date),
        },
        url: commit.html_url,
      }));

      return commits;
    } catch (error: any) {
      console.error('Get commits error:', error);
      if (error.response?.status === 404) {
        throw new Error('Repository non trovato o privato');
      }
      throw error;
    }
  }

  // Get branches using owner and repo
  async getBranches(owner: string, repo: string, token?: string): Promise<any[]> {
    try {
      const authToken = token || await this.getStoredToken();
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
      };
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      const response = await axios.get(`${GITHUB_API_BASE}/repos/${owner}/${repo}/branches`, {
        headers,
      });

      return response.data;
    } catch (error) {
      console.error('Get branches error:', error);
      return [];
    }
  }
}

export const githubService = new GitHubService();
