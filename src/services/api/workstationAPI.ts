import { apiService } from './APIService';

export interface Workstation {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'starting' | 'stopping';
  ipAddress?: string;
  port?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkstationParams {
  name: string;
  template?: string;
}

export interface WorkstationFile {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
}

export interface ProjectDetectionResult {
  type: string;
  port?: number;
  startCommand?: string;
  buildCommand?: string;
  framework?: string;
}

export class WorkstationAPI {
  private static basePath = '/workstation';

  // List all workstations
  static async listWorkstations(): Promise<Workstation[]> {
    return apiService.get<Workstation[]>(`${this.basePath}`);
  }

  // Get single workstation
  static async getWorkstation(id: string): Promise<Workstation> {
    return apiService.get<Workstation>(`${this.basePath}/${id}`);
  }

  // Create workstation
  static async createWorkstation(params: CreateWorkstationParams): Promise<Workstation> {
    return apiService.post<Workstation>(`${this.basePath}`, params);
  }

  // Delete workstation
  static async deleteWorkstation(id: string): Promise<void> {
    return apiService.delete(`${this.basePath}/${id}`);
  }

  // Start workstation
  static async startWorkstation(id: string): Promise<Workstation> {
    return apiService.post<Workstation>(`${this.basePath}/${id}/start`);
  }

  // Stop workstation
  static async stopWorkstation(id: string): Promise<Workstation> {
    return apiService.post<Workstation>(`${this.basePath}/${id}/stop`);
  }

  // List files in workstation
  static async listFiles(id: string, path: string = '/'): Promise<WorkstationFile[]> {
    return apiService.get<WorkstationFile[]>(`${this.basePath}/${id}/files`, {
      params: { path },
    });
  }

  // Read file content
  static async readFile(id: string, path: string): Promise<string> {
    return apiService.get<string>(`${this.basePath}/${id}/files/read`, {
      params: { path },
    });
  }

  // Write file content
  static async writeFile(id: string, path: string, content: string): Promise<void> {
    return apiService.post(`${this.basePath}/${id}/files/write`, {
      path,
      content,
    });
  }

  // Delete file
  static async deleteFile(id: string, path: string): Promise<void> {
    return apiService.delete(`${this.basePath}/${id}/files`, {
      params: { path },
    });
  }

  // Detect project type
  static async detectProject(id: string): Promise<ProjectDetectionResult> {
    return apiService.get<ProjectDetectionResult>(`${this.basePath}/${id}/detect-project`);
  }

  // Execute command in workstation
  static async executeCommand(id: string, command: string): Promise<{ output: string }> {
    return apiService.post<{ output: string }>(`${this.basePath}/${id}/execute`, {
      command,
    });
  }
}
