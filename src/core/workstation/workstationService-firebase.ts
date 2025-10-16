import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { WorkstationInfo } from '../../shared/types';
import axios from 'axios';

const COLLECTION = 'user_projects';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export interface UserProject {
  id: string;
  name: string;
  type: 'git' | 'personal';
  repositoryUrl?: string; // Per progetti Git
  userId: string;
  createdAt: Date;
  lastAccessed: Date;
  workstationId?: string;
  status: 'creating' | 'running' | 'stopped';
}

export const workstationService = {
  // Salva progetto Git su Firebase
  async saveGitProject(repositoryUrl: string, userId: string): Promise<UserProject> {
    try {
      const repoName = this.getRepositoryName(repositoryUrl);
      
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

  // Carica progetti utente da Firebase
  async getUserProjects(userId: string): Promise<UserProject[]> {
    try {
      const q = query(
        collection(db, COLLECTION), 
        where('userId', '==', userId),
        orderBy('lastAccessed', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        lastAccessed: doc.data().lastAccessed?.toDate() || new Date(),
      })) as UserProject[];
    } catch (error) {
      console.error('Error getting user projects:', error);
      return [];
    }
  },

  // Crea workstation per progetto
  async createWorkstationForProject(project: UserProject): Promise<{ workstationId: string; status: string }> {
    try {
      let result;
      
      if (project.type === 'git' && project.repositoryUrl) {
        // Progetto Git - clona da repository
        result = await axios.post(`${API_BASE_URL}/workstation/create`, {
          repositoryUrl: project.repositoryUrl,
          userId: project.userId,
          projectId: project.id,
          projectType: 'git'
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
    } catch (error) {
      console.error('Error creating workstation:', error);
      throw error;
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

  // Elimina progetto
  async deleteProject(projectId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, COLLECTION, projectId));
    } catch (error) {
      console.error('Error deleting project:', error);
      throw error;
    }
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
    return [];
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
