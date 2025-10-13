import axios from 'axios';
import { GitHubRepository, GitHubUser } from '../../shared/types';

const GITHUB_API = 'https://api.github.com';

export class GitHubService {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
  }

  private getHeaders() {
    return {
      Authorization: `token ${this.token}`,
      Accept: 'application/vnd.github.v3+json',
    };
  }

  async getUser(): Promise<GitHubUser> {
    const response = await axios.get(`${GITHUB_API}/user`, {
      headers: this.getHeaders(),
    });
    return {
      login: response.data.login,
      name: response.data.name,
      avatarUrl: response.data.avatar_url,
    };
  }

  async getRepositories(): Promise<GitHubRepository[]> {
    const response = await axios.get(`${GITHUB_API}/user/repos`, {
      headers: this.getHeaders(),
      params: {
        sort: 'updated',
        per_page: 100,
      },
    });

    return response.data.map((repo: any) => ({
      id: repo.id.toString(),
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      language: repo.language || 'Unknown',
      isPrivate: repo.private,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      updatedAt: new Date(repo.updated_at),
      cloneUrl: repo.clone_url,
      avatarUrl: repo.owner.avatar_url,
    }));
  }

  async cloneRepository(cloneUrl: string): Promise<void> {
    // TODO: Implement clone via backend
    console.log('Cloning repository:', cloneUrl);
  }
}

export const githubService = new GitHubService();
