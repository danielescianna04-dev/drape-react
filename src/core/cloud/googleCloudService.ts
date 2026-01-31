import { config } from '../../config/config';

// Simplified Google Cloud service for React Native
class GoogleCloudService {
  private apiUrl = config.apiUrl;

  async saveProject(projectId: string, files: any) {
    try {
      const response = await fetch(`${this.apiUrl}/projects/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const response = await fetch(`${this.apiUrl}/projects/${projectId}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to load project:', error);
      return null;
    }
  }

  async listProjects() {
    try {
      const response = await fetch(`${this.apiUrl}/projects`);
      const data = await response.json();
      return data.projects || [];
    } catch (error) {
      console.error('Failed to list projects:', error);
      return [];
    }
  }
}

export const googleCloudService = new GoogleCloudService();
