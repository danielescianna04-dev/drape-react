import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, where, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../config/firebase';
import { WorkstationInfo } from '../../shared/types';
import axios from 'axios';
import { config } from '../../config/config';

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
      console.log('📂 [saveGitProject] Created new project:', docRef.id, 'name:', repoName);

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
        console.log('🚀 [HolyGrail] Creating project:', project.id);
        result = await axios.post(`${FLY_API_BASE}/project/create`, {
          projectId: project.id,
          repositoryUrl: project.repositoryUrl,
        });
        console.log('🚀 [HolyGrail] Project created:', result.data);
        return {
          workstationId: project.id,
          status: 'created'
        };
      }

      // Legacy Coder path
      if (project.type === 'git' && project.repositoryUrl) {
        // Progetto Git - clona da repository
        result = await axios.post(`${API_BASE_URL}/workstation/create`, {
          repositoryUrl: project.repositoryUrl,
          userId: project.userId,
          projectId: project.id,
          projectType: 'git',
          githubToken: token,
        });
      } else {
        // Progetto personale - carica da Cloud Storage
        result = await axios.post(`${API_BASE_URL}/workstation/create`, {
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
        console.log('🔐 [createWorkstationForProject] Auth required (401)');
      } else {
        console.error('Error creating workstation:', error);
      }
      throw error;
    }
  },

  async getWorkstationFiles(workstationId: string, repositoryUrl?: string, githubToken?: string): Promise<string[]> {
    try {
      // 🚀 HOLY GRAIL: Use Fly.io API
      if (USE_HOLY_GRAIL) {
        console.log('🚀 [HolyGrail] Getting files for:', workstationId);
        const response = await axios.get(`${FLY_API_BASE}/project/${workstationId}/files`, {
          timeout: 30000
        });
        console.log('🚀 [HolyGrail] Got', response.data.files?.length || 0, 'files');
        return (response.data.files || []).map((f: any) => typeof f === 'string' ? f : f.path);
      }

      // Legacy Coder path below
      const url = repositoryUrl
        ? `${API_BASE_URL}/workstation/${workstationId}/files?repositoryUrl=${encodeURIComponent(repositoryUrl)}`
        : `${API_BASE_URL}/workstation/${workstationId}/files`;

      console.log('🌐 Making request to:', url);
      console.log('🌐 API_BASE_URL:', API_BASE_URL);
      console.log('🌐 workstationId:', workstationId);
      console.log('🌐 repositoryUrl:', repositoryUrl);
      console.log('🌐 Has GitHub token:', !!githubToken);

      // Create a custom axios instance with extended timeout for cloning operations
      const axiosLongTimeout = axios.create({
        timeout: 600000 // 10 minutes for large repository clones
      });

      // Add Authorization header if token is provided
      const headers: Record<string, string> = {};
      if (githubToken) {
        headers['Authorization'] = `Bearer ${githubToken}`;
      }

      console.log('🌐 About to make GET request...');
      const response = await axiosLongTimeout.get(url, { headers });
      console.log('🌐 Response received:', response.status);
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
        console.log('🔐 [getWorkstationFiles] Auth required:', error.response?.status);
      } else {
        console.error('Error getting workstation files:', error);
      }

      // Handle 401 with requiresAuth
      if (error.response?.status === 401 && error.response?.data?.requiresAuth) {
        const authError = new Error(error.response?.data?.error || 'Repository privata. È necessario autenticarsi.');
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
      const response = await axios.post(`${API_BASE_URL}/terminal/execute`, {
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
        console.log('🚀 [HolyGrail] Reading file:', filePath);
        const response = await axios.get(
          `${FLY_API_BASE}/project/${projectId}/file?path=${encodeURIComponent(filePath)}`
        );
        return response.data.content;
      }

      // Legacy Coder path
      const url = repositoryUrl
        ? `${API_BASE_URL}/workstation/${projectId}/file-content?filePath=${encodeURIComponent(filePath)}&repositoryUrl=${encodeURIComponent(repositoryUrl)}`
        : `${API_BASE_URL}/workstation/${projectId}/file-content?filePath=${encodeURIComponent(filePath)}`;

      const response = await axios.get(url);
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
        console.log('🚀 [HolyGrail] Saving file:', filePath);
        await axios.post(`${FLY_API_BASE}/project/${projectId}/file`, {
          path: filePath,
          content
        });
        return;
      }

      // Legacy Coder path
      await axios.post(`${API_BASE_URL}/workstation/${projectId}/file-content`, {
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

      const response = await axios.get(url);
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

      console.log('🗑️🗑️🗑️ [DELETE] Starting delete');
      console.log('🗑️ [DELETE] Original projectId:', projectId);
      console.log('🗑️ [DELETE] Clean projectId:', cleanProjectId);
      console.log('🗑️ [DELETE] API_BASE_URL:', API_BASE_URL);

      // 1. Prima elimina i file clonati dal backend (try both IDs)
      for (const id of [projectId, cleanProjectId]) {
        try {
          console.log('🗑️ [DELETE] Trying backend delete for:', id);
          const response = await axios.delete(`${API_BASE_URL}/workstation/${id}?force=true`);
          console.log('✅ [DELETE] Backend response for', id, ':', JSON.stringify(response.data));
        } catch (backendError: any) {
          console.warn('⚠️ [DELETE] Backend error for', id, ':', backendError?.response?.data || backendError?.message);
        }
      }

      // 2. Poi elimina da Firebase (use clean ID for Firebase document)
      console.log('🗑️ [DELETE] Deleting from Firebase collection:', COLLECTION, 'doc:', cleanProjectId);
      try {
        await deleteDoc(doc(db, COLLECTION, cleanProjectId));
        console.log('✅ [DELETE] Firebase document deleted:', cleanProjectId);
      } catch (fbError: any) {
        console.error('❌ [DELETE] Firebase error:', fbError);
        // Also try with original ID just in case
        if (cleanProjectId !== projectId) {
          console.log('🗑️ [DELETE] Retrying Firebase delete with original ID:', projectId);
          await deleteDoc(doc(db, COLLECTION, projectId));
          console.log('✅ [DELETE] Firebase document deleted with original ID');
        } else {
          throw fbError;
        }
      }

      console.log('🗑️🗑️🗑️ [DELETE] Complete for projectId:', projectId);
    } catch (error) {
      console.error('❌ [DELETE] Error:', error);
      throw error;
    }
  },

  // Aggiorna account GitHub collegato al progetto
  async updateProjectGitHubAccount(projectId: string, githubUsername: string): Promise<void> {
    try {
      console.log('🔗 Linking GitHub account to project:', { projectId, githubUsername });
      await updateDoc(doc(db, COLLECTION, projectId), {
        githubAccountUsername: githubUsername,
      });
      console.log('✅ GitHub account linked successfully');
    } catch (error) {
      console.error('Error updating project GitHub account:', error);
      throw error;
    }
  },

  // Rimuovi account GitHub dal progetto
  async removeProjectGitHubAccount(projectId: string): Promise<void> {
    try {
      console.log('🔓 Unlinking GitHub account from project:', projectId);
      await updateDoc(doc(db, COLLECTION, projectId), {
        githubAccountUsername: null,
      });
      console.log('✅ GitHub account unlinked successfully');
    } catch (error) {
      console.error('Error removing project GitHub account:', error);
      throw error;
    }
  },

  // Segna progetto come clonato
  async markProjectAsCloned(projectId: string): Promise<void> {
    try {
      console.log('✓ Marking project as cloned:', projectId);
      await updateDoc(doc(db, COLLECTION, projectId), {
        cloned: true,
      });
      console.log('✅ Project marked as cloned');
    } catch (error) {
      console.error('Error marking project as cloned:', error);
      throw error;
    }
  },

  // Aggiorna workstation (nome, ecc.)
  async updateWorkstation(workstationId: string, updates: Partial<{ name: string }>): Promise<void> {
    try {
      const cleanId = workstationId.startsWith('ws-') ? workstationId.substring(3) : workstationId;
      console.log('📝 Updating workstation:', cleanId, updates);
      await updateDoc(doc(db, COLLECTION, cleanId), updates);
      console.log('✅ Workstation updated');
    } catch (error) {
      console.error('Error updating workstation:', error);
      throw error;
    }
  },

  // Update lastAccessed timestamp when project is opened
  async updateLastAccessed(projectId: string): Promise<void> {
    try {
      // Use the original projectId - AI-generated projects use full 'ws-' prefix
      console.log('🕐 Updating lastAccessed for project:', projectId);
      await updateDoc(doc(db, COLLECTION, projectId), {
        lastAccessed: new Date(),
      });
      console.log('✅ lastAccessed updated');
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
      console.log('📂 Created new workstation:', docRef.id);

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
    console.log('Legacy saveWorkstation called:', workstation);
  },

  async getWorkstations(): Promise<WorkstationInfo[]> {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) {
        console.log('⚠️ getWorkstations: No authenticated user');
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
