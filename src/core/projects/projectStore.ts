import { create } from 'zustand';
import { supabase } from '../../lib/supabase/client';
import { useAuthStore } from '../auth/authStore';

/**
 * v2 UserProject — modello unificato. In v1 esistevano UserProject + Workstation
 * come entità separate (progetto = metadata Firebase, workstation = container Docker).
 * In v2 sono la stessa cosa, una riga in `public.projects`.
 */
export interface UserProject {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  template?: string | null;
  repositoryUrl?: string | null;
  type?: 'personal' | 'git';
  createdAt: string;
  updatedAt: string;
}

interface ProjectState {
  projects: UserProject[];
  currentProject: UserProject | null;
  currentWorkstationId: string | null;
  isLoading: boolean;
  userId: string;

  loadUserProjects: () => Promise<void>;
  createGitProject: (repositoryUrl: string, githubToken?: string) => Promise<void>;
  createPersonalProject: (name: string) => Promise<void>;
  selectProject: (project: UserProject) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  setUserId: (userId: string) => void;
}

const getEffectiveUserId = (storedUserId: string): string | null => {
  const u = useAuthStore.getState().user;
  return u?.uid || (storedUserId && storedUserId !== 'default-user' ? storedUserId : null);
};

function rowToProject(r: any): UserProject {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    description: r.description,
    template: r.template,
    repositoryUrl: r.repository_url ?? null,
    type: r.template === 'git' ? 'git' : 'personal',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  currentWorkstationId: null,
  isLoading: false,
  userId: '',

  async loadUserProjects() {
    const { userId } = get();
    const effectiveUserId = getEffectiveUserId(userId);
    if (!effectiveUserId) {
      set({ projects: [], currentProject: null, currentWorkstationId: null, isLoading: false });
      return;
    }

    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      set({ projects: (data ?? []).map(rowToProject), isLoading: false });
    } catch (error) {
      console.error('[projectStore] loadUserProjects:', error);
      set({ isLoading: false });
    }
  },

  async createGitProject(repositoryUrl: string, _githubToken?: string) {
    const { userId, loadUserProjects } = get();
    const effectiveUserId = getEffectiveUserId(userId);
    if (!effectiveUserId) throw new Error('User not authenticated');

    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          user_id: effectiveUserId,
          name: repositoryUrl.split('/').pop()?.replace('.git', '') ?? 'imported',
          description: `git: ${repositoryUrl}`,
          template: 'git',
        })
        .select('*')
        .single();
      if (error) throw error;

      const project = rowToProject(data);
      await loadUserProjects();
      set({ currentProject: project, currentWorkstationId: project.id, isLoading: false });
    } catch (error) {
      console.error('[projectStore] createGitProject:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  async createPersonalProject(name: string) {
    const { userId, loadUserProjects } = get();
    const effectiveUserId = getEffectiveUserId(userId);
    if (!effectiveUserId) throw new Error('User not authenticated');

    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert({ user_id: effectiveUserId, name, template: 'personal' })
        .select('*')
        .single();
      if (error) throw error;

      const project = rowToProject(data);
      await loadUserProjects();
      set({ currentProject: project, currentWorkstationId: project.id, isLoading: false });
    } catch (error) {
      console.error('[projectStore] createPersonalProject:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  async selectProject(project: UserProject) {
    set({ currentProject: project, currentWorkstationId: project.id });
  },

  async deleteProject(projectId: string) {
    set({ isLoading: true });
    try {
      const { error } = await supabase.from('projects').delete().eq('id', projectId);
      if (error) throw error;
      await get().loadUserProjects();
      const { currentProject } = get();
      if (currentProject?.id === projectId) {
        set({ currentProject: null, currentWorkstationId: null });
      }
      set({ isLoading: false });
    } catch (error) {
      console.error('[projectStore] deleteProject:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  setUserId(userId: string) {
    set({ userId });
  },
}));
