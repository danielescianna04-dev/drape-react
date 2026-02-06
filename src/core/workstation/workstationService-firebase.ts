import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, where, updateDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../../config/firebase';
import { WorkstationInfo } from '../../shared/types';
import apiClient from '../api/apiClient';
import { config } from '../../config/config';
import i18n from '../../i18n';

const COLLECTION = 'user_projects';
const API_BASE_URL = config.apiUrl;

// 🚀 HOLY GRAIL MODE - Uses Fly.io MicroVMs instead of Coder
const USE_HOLY_GRAIL = true;
const FLY_API_BASE = `${config.apiUrl}/fly`;

export interface UserProject {
  id: string;
  name: string;
  type: 'git' | 'personal' | 'template';
  repositoryUrl?: string; // Per progetti Git
  githubAccountUsername?: string; // Account GitHub collegato a questo progetto
  userId: string;
  createdAt: Date;
  lastAccessed: Date;
  workstationId?: string;
  status: 'creating' | 'running' | 'stopped';
  cloned?: boolean; // Se il progetto è già stato clonato (per evitare clone multipli)
}

export const workstationService = {
  // Get API URL for external calls
  getApiUrl(): string {
    return API_BASE_URL;
  },

  // Check if a project with same repositoryUrl already exists for this user
  async checkExistingProject(repositoryUrl: string, userId: string): Promise<UserProject | null> {
    try {
      const existingQuery = query(
        collection(db, COLLECTION),
        where('userId', '==', userId),
        where('repositoryUrl', '==', repositoryUrl)
      );
      const existingSnapshot = await getDocs(existingQuery);

      if (!existingSnapshot.empty) {
        const existingDoc = existingSnapshot.docs[0];
        return {
          id: existingDoc.id,
          ...existingDoc.data()
        } as UserProject;
      }
      return null;
    } catch (error) {
      console.error('Error checking existing project:', error);
      return null;
    }
  },

  // Count existing projects with same repositoryUrl for this user
  async countExistingCopies(repositoryUrl: string, userId: string): Promise<number> {
    try {
      const existingQuery = query(
        collection(db, COLLECTION),
        where('userId', '==', userId),
        where('repositoryUrl', '==', repositoryUrl)
      );
      const existingSnapshot = await getDocs(existingQuery);
      return existingSnapshot.size;
    } catch (error) {
      console.error('Error counting existing copies:', error);
      return 0;
    }
  },

  // Salva progetto Git su Firebase
  async saveGitProject(repositoryUrl: string, userId: string, copyNumber?: number): Promise<UserProject> {
    try {
      let repoName = this.getRepositoryName(repositoryUrl);

      // Add copy number to name if creating a copy
      if (copyNumber && copyNumber > 0) {
        repoName = `${repoName} (copia ${copyNumber})`;
      }

      const project: Omit<UserProject, 'id'> = {
        name: repoName,
        type: 'git',
        repositoryUrl,
        userId,
        createdAt: new Date(),
        lastAccessed: new Date(),
        status: 'creating'
      };

      const docRef = await addDoc(collection(db, COLLECTION), project);

      return {
        ...project,
        id: docRef.id
      };
    } catch (error) {
      console.error('Error saving Git project:', error);
      throw error;
    }
  },

  // Salva progetto personale su Firebase
  async savePersonalProject(name: string, userId: string): Promise<UserProject> {
    try {
      const project: Omit<UserProject, 'id'> = {
        name,
        type: 'personal',
        userId,
        createdAt: new Date(),
        lastAccessed: new Date(),
        status: 'creating'
      };

      const docRef = await addDoc(collection(db, COLLECTION), project);

      return {
        ...project,
        id: docRef.id
      };
    } catch (error) {
      console.error('Error saving personal project:', error);
      throw error;
    }
  },

  // Save project with a specific ID (used for AI-created projects where backend generates the ID)
  async saveProjectWithId(projectId: string, name: string, userId: string, technology?: string): Promise<UserProject> {
    try {
      const project: Omit<UserProject, 'id'> = {
        name,
        type: 'personal',
        userId,
        createdAt: new Date(),
        lastAccessed: new Date(),
        status: 'running',
      };

      await setDoc(doc(db, COLLECTION, projectId), project);

      return { ...project, id: projectId };
    } catch (error) {
      console.error('Error saving project with ID:', error);
      throw error;
    }
  },

  // Carica progetti utente da Firebase
  async getUserProjects(userId: string): Promise<UserProject[]> {
    try {
      const q = query(
        collection(db, COLLECTION),
        where('userId', '==', userId)
        // orderBy('lastAccessed', 'desc') // TODO: Uncomment after creating index
      );

      const querySnapshot = await getDocs(q);
      const projects = querySnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        lastAccessed: doc.data().lastAccessed?.toDate() || new Date(),
      })) as UserProject[];

      return projects;
    } catch (error) {
      console.error('Error getting user projects:', error);
      return [];
    }
  },

  // Crea workstation per progetto
  async createWorkstationForProject(project: UserProject, token?: string): Promise<{ workstationId: string; status: string; files?: string[] }> {
    try {
      let result;

      // 🚀 HOLY GRAIL: Use Fly.io API for project creation
      if (USE_HOLY_GRAIL) {
        const url = `${FLY_API_BASE}/project/create`;
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        result = await apiClient.post(url, {
          projectId: project.id,
          repositoryUrl: project.repositoryUrl,
          githubToken: token, // Also pass in body for cloneRepository
        }, { headers, timeout: 30000 });

        return {
          workstationId: project.id,
          status: 'created'
        };
      }

      // Legacy Coder path
      if (project.type === 'git' && project.repositoryUrl) {
        // Progetto Git - clona da repository
        result = await apiClient.post(`${API_BASE_URL}/workstation/create`, {
          repositoryUrl: project.repositoryUrl,
          userId: project.userId,
          projectId: project.id,
          projectType: 'git',
          githubToken: token,
        });
      } else {
        // Progetto personale - carica da Cloud Storage
        result = await apiClient.post(`${API_BASE_URL}/workstation/create`, {
          projectName: project.name,
          userId: project.userId,
          projectId: project.id,
          projectType: 'personal'
        });
      }

      return result.data;
    } catch (error: any) {
      // Use console.log for expected auth errors (401) to avoid error overlay
      if (error.response?.status === 401) {
      } else {
        console.error('❌ [createWorkstation]', error.message);
      }
      throw error;
    }
  },

  async getWorkstationFiles(workstationId: string, repositoryUrl?: string, githubToken?: string): Promise<string[]> {
    try {
      // 🚀 HOLY GRAIL: Use Fly.io API
      if (USE_HOLY_GRAIL) {
        // HolyGrail: get files via backend API
        const headers: Record<string, string> = {};
        if (githubToken) {
          headers['Authorization'] = `Bearer ${githubToken}`;
        }

        const response = await apiClient.get(`${FLY_API_BASE}/project/${workstationId}/files`, {
          params: {
            githubToken,
            repositoryUrl // Pass repo URL so backend can clone if missing
          },
          headers,
          timeout: 45000 // Slightly longer for potential clone
        });
        // Files loaded from backend
        return (response.data.files || []).map((f: any) => typeof f === 'string' ? f : f.path);
      }

      // Legacy Coder path below
      const url = repositoryUrl
        ? `${API_BASE_URL}/workstation/${workstationId}/files?repositoryUrl=${encodeURIComponent(repositoryUrl)}`
        : `${API_BASE_URL}/workstation/${workstationId}/files`;

      // Add Authorization header if token is provided
      const headers: Record<string, string> = {};
      if (githubToken) {
        headers['Authorization'] = `Bearer ${githubToken}`;
      }

      const response = await apiClient.get(url, { headers, timeout: 600000 });
      const files = response.data.files || [];

      // Convert file objects to path strings for compatibility
      return files.map((file: any) => {
        // If it's already a string, return it
        if (typeof file === 'string') return file;
        // If it's an object with path property, return the path
        if (file && typeof file === 'object' && file.path) return file.path;
        // If it's an object with name property, return the name
        if (file && typeof file === 'object' && file.name) return file.name;
        // Fallback
        return String(file);
      });
    } catch (error: any) {
      // Don't use console.error for expected auth errors to avoid error overlay on phone
      if (error.response?.status === 401 || error.response?.status === 403) {
      } else {
        console.error('Error getting workstation files:', error);
      }

      // Handle 401 with requiresAuth
      if (error.response?.status === 401 && error.response?.data?.requiresAuth) {
        const authError = new Error(error.response?.data?.error || i18n.t('errors:workspace.privateRepoAuthRequired'));
        (authError as any).requiresAuth = true;
        (authError as any).isPrivate = error.response?.data?.isPrivate;
        throw authError;
      }

      // Handle specific error cases with better messages
      if (error.response?.status === 403) {
        throw new Error(error.response?.data?.error || 'Repository is private or not found');
      }

      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        throw new Error('Request timeout - server is taking too long to respond');
      }

      if (error.message === 'Network Error' || !error.response) {
        throw new Error('Cannot connect to server - check your network connection');
      }

      // Propagate all other errors instead of silently returning empty array
      throw new Error(error.response?.data?.error || error.message || 'Failed to get repository files');
    }
  },

  // Esegui comando su workstation
  async executeCommand(command: string, workstationId: string): Promise<{
    output: string;
    error?: string;
    exitCode: number;
    previewUrl?: string | null;
  }> {
    try {
      const response = await apiClient.post(`${API_BASE_URL}/terminal/execute`, {
        command,
        workstationId
      });

      return response.data;
    } catch (error) {
      console.error('Error executing command:', error);
      throw error;
    }
  },

  // Leggi contenuto file
  async getFileContent(projectId: string, filePath: string, repositoryUrl?: string): Promise<string> {
    try {
      // 🚀 HOLY GRAIL: Use Fly.io API
      if (USE_HOLY_GRAIL) {
        // Read file via backend API
        const response = await apiClient.get(
          `${FLY_API_BASE}/project/${projectId}/file?path=${encodeURIComponent(filePath)}`
        );
        return response.data.content;
      }

      // Legacy Coder path
      const url = repositoryUrl
        ? `${API_BASE_URL}/workstation/${projectId}/file-content?filePath=${encodeURIComponent(filePath)}&repositoryUrl=${encodeURIComponent(repositoryUrl)}`
        : `${API_BASE_URL}/workstation/${projectId}/file-content?filePath=${encodeURIComponent(filePath)}`;

      const response = await apiClient.get(url);
      return response.data.content;
    } catch (error: any) {
      console.error('Error getting file content:', error);
      throw new Error(error.response?.data?.error || error.message || 'Failed to load file');
    }
  },

  // Salva contenuto file
  async saveFileContent(projectId: string, filePath: string, content: string, repositoryUrl?: string): Promise<void> {
    try {
      // 🚀 HOLY GRAIL: Use Fly.io API
      if (USE_HOLY_GRAIL) {
        // Save file via backend API
        await apiClient.post(`${FLY_API_BASE}/project/${projectId}/file`, {
          path: filePath,
          content
        });
        return;
      }

      // Legacy Coder path
      await apiClient.post(`${API_BASE_URL}/workstation/${projectId}/file-content`, {
        filePath,
        content,
        repositoryUrl
      });
    } catch (error: any) {
      console.error('Error saving file content:', error);
      throw new Error(error.response?.data?.error || error.message || 'Failed to save file');
    }
  },

  // Cerca nei contenuti dei file
  async searchInFiles(projectId: string, query: string, repositoryUrl?: string): Promise<{ file: string; line: number; content: string; match: string }[]> {
    try {
      const url = repositoryUrl
        ? `${API_BASE_URL}/workstation/${projectId}/search?query=${encodeURIComponent(query)}&repositoryUrl=${encodeURIComponent(repositoryUrl)}`
        : `${API_BASE_URL}/workstation/${projectId}/search?query=${encodeURIComponent(query)}`;

      const response = await apiClient.get(url);
      return response.data.results || [];
    } catch (error: any) {
      console.error('Error searching in files:', error);
      throw new Error(error.response?.data?.error || error.message || 'Failed to search in files');
    }
  },

  // Elimina progetto (da Firebase E dal backend)
  async deleteProject(projectId: string): Promise<void> {
    try {
      // Handle both formats: "projectId" or "ws-projectId"
      const cleanProjectId = projectId.startsWith('ws-') ? projectId.substring(3) : projectId;

      // 1. Prima elimina i file clonati dal backend (try both IDs)
      for (const id of [projectId, cleanProjectId]) {
        try {
          const response = await apiClient.delete(`${API_BASE_URL}/workstation/${id}?force=true`);
        } catch (backendError: any) {
          console.warn('⚠️ [DELETE] Backend error for', id, ':', backendError?.response?.data || backendError?.message);
        }
      }

      // 2. Poi elimina da Firebase (use clean ID for Firebase document)
      try {
        await deleteDoc(doc(db, COLLECTION, cleanProjectId));
      } catch (fbError: any) {
        console.error('❌ [DELETE] Firebase error:', fbError);
        // Also try with original ID just in case
        if (cleanProjectId !== projectId) {
          await deleteDoc(doc(db, COLLECTION, projectId));
        } else {
          throw fbError;
        }
      }

    } catch (error) {
      console.error('❌ [DELETE] Error:', error);
      throw error;
    }
  },

  // Aggiorna account GitHub collegato al progetto
  async updateProjectGitHubAccount(projectId: string, githubUsername: string): Promise<void> {
    try {
      await updateDoc(doc(db, COLLECTION, projectId), {
        githubAccountUsername: githubUsername,
      });
    } catch (error) {
      console.error('Error updating project GitHub account:', error);
      throw error;
    }
  },

  // Rimuovi account GitHub dal progetto
  async removeProjectGitHubAccount(projectId: string): Promise<void> {
    try {
      await updateDoc(doc(db, COLLECTION, projectId), {
        githubAccountUsername: null,
      });
    } catch (error) {
      console.error('Error removing project GitHub account:', error);
      throw error;
    }
  },

  // Segna progetto come clonato
  async markProjectAsCloned(projectId: string): Promise<void> {
    try {
      await updateDoc(doc(db, COLLECTION, projectId), {
        cloned: true,
      });
    } catch (error) {
      console.error('Error marking project as cloned:', error);
      throw error;
    }
  },

  // Aggiorna workstation (nome, ecc.)
  async updateWorkstation(workstationId: string, updates: Partial<{ name: string }>): Promise<void> {
    try {
      const cleanId = workstationId.startsWith('ws-') ? workstationId.substring(3) : workstationId;
      await updateDoc(doc(db, COLLECTION, cleanId), updates);
    } catch (error) {
      console.error('Error updating workstation:', error);
      throw error;
    }
  },

  // Update lastAccessed timestamp when project is opened
  async updateLastAccessed(projectId: string): Promise<void> {
    try {
      // Use the original projectId - AI-generated projects use full 'ws-' prefix
      await updateDoc(doc(db, COLLECTION, projectId), {
        lastAccessed: new Date(),
      });
    } catch (error) {
      console.error('Error updating lastAccessed:', error);
      // Don't throw - this is a non-critical update
    }
  },

  // Crea nuovo workstation (duplica)
  async createWorkstation(workstation: Partial<WorkstationInfo>): Promise<WorkstationInfo> {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const project: Omit<UserProject, 'id'> = {
        name: workstation.name || 'Nuovo Progetto',
        type: workstation.repositoryUrl ? 'git' : 'personal',
        repositoryUrl: workstation.repositoryUrl,
        userId,
        createdAt: new Date(),
        lastAccessed: new Date(),
        status: 'creating',
      };

      const docRef = await addDoc(collection(db, COLLECTION), project);

      return {
        id: docRef.id,
        name: project.name,
        language: workstation.language || 'Unknown',
        status: project.status as any,
        createdAt: project.createdAt,
        files: [],
        repositoryUrl: project.repositoryUrl,
        folderId: null,
        projectId: docRef.id,
      };
    } catch (error) {
      console.error('Error creating workstation:', error);
      throw error;
    }
  },

  // Alias per compatibilità
  async deleteWorkstation(workstationId: string): Promise<void> {
    return this.deleteProject(workstationId);
  },

  // Helper per estrarre nome repository
  getRepositoryName(repositoryUrl: string): string {
    if (!repositoryUrl) return 'unknown';

    try {
      const url = new URL(repositoryUrl);
      const pathParts = url.pathname.split('/');
      const repoName = pathParts[pathParts.length - 1];
      return repoName.replace('.git', '');
    } catch {
      return repositoryUrl.split('/').pop()?.replace('.git', '') || 'unknown';
    }
  },

  // Helper per validare URL repository
  isValidRepositoryUrl(url: string): boolean {
    const patterns = [
      /^https:\/\/github\.com\/[\w\-\.]+\/[\w\-\.]+/,
      /^git@github\.com:[\w\-\.]+\/[\w\-\.]+\.git$/,
      /^https:\/\/gitlab\.com\/[\w\-\.]+\/[\w\-\.]+/,
      /^https:\/\/bitbucket\.org\/[\w\-\.]+\/[\w\-\.]+/
    ];

    return patterns.some(pattern => pattern.test(url));
  },

  // Legacy methods per compatibilità
  async saveWorkstation(workstation: WorkstationInfo): Promise<void> {
  },

  async getWorkstations(): Promise<WorkstationInfo[]> {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) {
        return [];
      }
      const projects = await this.getUserProjects(userId);

      return projects.map(project => ({
        id: project.id,
        name: project.name,
        language: 'Unknown',
        status: project.status as any,
        createdAt: project.createdAt,
        lastOpened: project.lastAccessed,
        files: [],
        repositoryUrl: project.repositoryUrl,
        githubAccountUsername: project.githubAccountUsername,
        folderId: null,
        projectId: project.id,
        cloned: project.cloned,
        type: project.type,
      }));
    } catch (error) {
      console.error('Error getting workstations:', error);
      return [];
    }
  },

  async createEmptyWorkstation(name: string): Promise<WorkstationInfo> {
    const workstation: WorkstationInfo = {
      id: 'ws-' + Date.now(),
      name,
      language: 'javascript',
      url: '',
      status: 'creating',
      repositoryUrl: '',
      createdAt: new Date(),
      files: [],
    };
    return workstation;
  }
};
