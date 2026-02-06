import { create } from 'zustand';
import { workstationService, UserProject } from '../workstation/workstationService-firebase';
import { getAuthHeaders } from '../api/getAuthToken';

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
      const projects = await workstationService.getUserProjects(userId);

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

      // STEP 1: Check visibility BEFORE creating anything
      const apiUrl = workstationService.getApiUrl();
      const authHeaders = await getAuthHeaders();
      const visibilityResponse = await fetch(`${apiUrl}/repo/check-visibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ repositoryUrl, githubToken }),
      });

      const visibilityData = await visibilityResponse.json();

      if (!visibilityResponse.ok || visibilityData.requiresAuth) {
        set({ isLoading: false });
        const authError = new Error('Authentication required');
        (authError as any).requiresAuth = true;
        (authError as any).repositoryUrl = repositoryUrl;
        throw authError;
      }

      // Save to Firebase
      const project = await workstationService.saveGitProject(repositoryUrl, userId);

      // Create workstation
      const workstation = await workstationService.createWorkstationForProject(project, githubToken);

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

      // Save to Firebase
      const project = await workstationService.savePersonalProject(name, userId);

      // Create workstation
      const workstation = await workstationService.createWorkstationForProject(project);

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

      // Create workstation for existing project
      const workstation = await workstationService.createWorkstationForProject(project);

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

      await workstationService.deleteProject(projectId);

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
