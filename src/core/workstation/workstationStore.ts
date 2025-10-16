import { create } from 'zustand';
import { googleCloudService } from '../cloud/googleCloudService';

interface Project {
  id: string;
  name: string;
  type: 'git' | 'local';
  gitUrl?: string;
  status: 'idle' | 'starting' | 'running' | 'stopping';
  webUrl?: string;
  port?: number;
  cloudPath?: string;
}

interface WorkstationState {
  projects: Project[];
  activeProject: Project | null;
  
  // Actions
  createProject: (name: string, type: 'git' | 'local', gitUrl?: string) => Promise<void>;
  startProject: (projectId: string) => Promise<void>;
  stopProject: (projectId: string) => Promise<void>;
  setActiveProject: (project: Project | null) => void;
  loadProjects: () => Promise<void>;
  saveProject: (projectId: string, files: any) => Promise<void>;
}

export const useWorkstationStore = create<WorkstationState>((set, get) => ({
  projects: [],
  activeProject: null,

  createProject: async (name: string, type: 'git' | 'local', gitUrl?: string) => {
    const project: Project = {
      id: Date.now().toString(),
      name,
      type,
      gitUrl,
      status: 'idle'
    };
    
    // Save to Google Cloud if local project
    if (type === 'local') {
      const cloudPath = await googleCloudService.saveProject(project.id, {
        name,
        files: {},
        created: new Date().toISOString()
      });
      project.cloudPath = cloudPath;
    }
    
    set(state => ({
      projects: [...state.projects, project]
    }));
  },

  startProject: async (projectId: string) => {
    set(state => ({
      projects: state.projects.map(p => 
        p.id === projectId ? { ...p, status: 'starting' } : p
      )
    }));

    // Simulate container startup
    setTimeout(() => {
      const port = 3000 + Math.floor(Math.random() * 1000);
      set(state => ({
        projects: state.projects.map(p => 
          p.id === projectId ? { 
            ...p, 
            status: 'running',
            webUrl: `http://localhost:${port}`,
            port 
          } : p
        )
      }));
    }, 3000);
  },

  stopProject: async (projectId: string) => {
    set(state => ({
      projects: state.projects.map(p => 
        p.id === projectId ? { ...p, status: 'stopping' } : p
      )
    }));

    setTimeout(() => {
      set(state => ({
        projects: state.projects.map(p => 
          p.id === projectId ? { 
            ...p, 
            status: 'idle',
            webUrl: undefined,
            port: undefined 
          } : p
        )
      }));
    }, 1000);
  },

  setActiveProject: (project: Project | null) => {
    set({ activeProject: project });
  },

  loadProjects: async () => {
    try {
      const cloudProjects = await googleCloudService.listProjects();
      const projects = cloudProjects.map(cp => ({
        id: cp.id,
        name: cp.name,
        type: 'local' as const,
        status: 'idle' as const,
        cloudPath: `gs://drape-projects/projects/${cp.id}`
      }));
      
      set({ projects });
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  },

  saveProject: async (projectId: string, files: any) => {
    try {
      await googleCloudService.saveProject(projectId, files);
    } catch (error) {
      console.error('Failed to save project:', error);
    }
  }
}));
