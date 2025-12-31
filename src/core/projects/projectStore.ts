import { create } from 'zustand';
import { workstationService, UserProject } from '../workstation/workstationService-firebase';

interface ProjectState {
  projects: UserProject[];
  currentProject: UserProject | null;
  currentWorkstationId: string | null;
  isLoading: boolean;
  userId: string;

  // Actions
  loadUserProjects: () => Promise<void>;
  createGitProject: (repositoryUrl: string) => Promise<void>;
  createPersonalProject: (name: string) => Promise<void>;
  selectProject: (project: UserProject) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  setUserId: (userId: string) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  currentWorkstationId: null,
  isLoading: false,
  userId: 'default-user', // TODO: Get from auth

  loadUserProjects: async () => {
    const { userId } = get();
    set({ isLoading: true });

    try {
      console.log('📋 Loading projects for user:', userId);
      const projects = await workstationService.getUserProjects(userId);
      console.log('✅ Projects loaded:', projects.length, 'projects -', projects.map(p => p.name).join(', '));

      set({ projects, isLoading: false });
    } catch (error) {
      console.error('❌ Failed to load projects:', error);
      set({ isLoading: false });
    }
  },

  createGitProject: async (repositoryUrl: string, githubToken?: string) => {
    const { userId, loadUserProjects } = get();
    set({ isLoading: true });

    try {
      console.log('🔗 Creating Git project:', repositoryUrl);

      // STEP 1: Check visibility BEFORE creating anything
      console.log('🔍 Checking repo visibility before import...');
      const apiUrl = workstationService.getApiUrl();
      const visibilityResponse = await fetch(`${apiUrl}/repo/check-visibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryUrl, githubToken }),
      });

      const visibilityData = await visibilityResponse.json();

      if (!visibilityResponse.ok || visibilityData.requiresAuth) {
        console.log('🔐 Repository requires authentication');
        set({ isLoading: false });
        const authError = new Error('Authentication required');
        (authError as any).requiresAuth = true;
        (authError as any).repositoryUrl = repositoryUrl;
        throw authError;
      }

      console.log('✅ Repository is accessible, proceeding...');

      // Save to Firebase
      const project = await workstationService.saveGitProject(repositoryUrl, userId);
      console.log('✅ Git project saved to Firebase:', project.name);

      // Create workstation
      const workstation = await workstationService.createWorkstationForProject(project, githubToken);
      console.log('✅ Workstation created:', workstation.workstationId);

      // Reload projects
      await loadUserProjects();

      set({
        currentProject: project,
        currentWorkstationId: workstation.workstationId,
        isLoading: false
      });

    } catch (error) {
      console.error('❌ Failed to create Git project:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  createPersonalProject: async (name: string) => {
    const { userId, loadUserProjects } = get();
    set({ isLoading: true });

    try {
      console.log('📁 Creating personal project:', name);

      // Save to Firebase
      const project = await workstationService.savePersonalProject(name, userId);
      console.log('✅ Personal project saved to Firebase:', project.name);

      // Create workstation
      const workstation = await workstationService.createWorkstationForProject(project);
      console.log('✅ Workstation created:', workstation.workstationId);

      // Reload projects
      await loadUserProjects();

      set({
        currentProject: project,
        currentWorkstationId: workstation.workstationId,
        isLoading: false
      });

    } catch (error) {
      console.error('❌ Failed to create personal project:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  selectProject: async (project: UserProject) => {
    set({ isLoading: true });

    try {
      console.log('🎯 Selecting project:', project.name);

      // Create workstation for existing project
      const workstation = await workstationService.createWorkstationForProject(project);
      console.log('✅ Workstation created for existing project:', workstation.workstationId);

      set({
        currentProject: project,
        currentWorkstationId: workstation.workstationId,
        isLoading: false
      });

    } catch (error) {
      console.error('❌ Failed to select project:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  deleteProject: async (projectId: string) => {
    set({ isLoading: true });

    try {
      console.log('🗑️ Deleting project:', projectId);

      await workstationService.deleteProject(projectId);
      console.log('✅ Project deleted from Firebase');

      // Reload projects
      const { loadUserProjects } = get();
      await loadUserProjects();

      // Clear current project if it was deleted
      const { currentProject } = get();
      if (currentProject?.id === projectId) {
        set({ currentProject: null, currentWorkstationId: null });
      }

    } catch (error) {
      console.error('❌ Failed to delete project:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  setUserId: (userId: string) => {
    set({ userId });
  }
}));
