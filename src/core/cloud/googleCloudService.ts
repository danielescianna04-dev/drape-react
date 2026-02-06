import { config } from '../../config/config';
import { getAuthHeaders } from '../api/getAuthToken';

// Simplified Google Cloud service for React Native
class GoogleCloudService {
  private apiUrl = config.apiUrl;

  async saveProject(projectId: string, files: any) {
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${this.apiUrl}/projects/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(files)
      });
      return await response.json();
    } catch (error) {
      console.error('Failed to save project:', error);
      return null;
    }
  }

  async loadProject(projectId: string) {
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${this.apiUrl}/projects/${projectId}`, {
        headers: authHeaders,
      });
      return await response.json();
    } catch (error) {
      console.error('Failed to load project:', error);
      return null;
    }
  }

  async listProjects() {
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${this.apiUrl}/projects`, {
        headers: authHeaders,
      });
      const data = await response.json();
      return data.projects || [];
    } catch (error) {
      console.error('Failed to list projects:', error);
      return [];
    }
  }
}

export const googleCloudService = new GoogleCloudService();
