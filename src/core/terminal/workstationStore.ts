import { create } from 'zustand';
import { workstationService } from '../workstation/workstationService-firebase';
import { useTabStore } from '../tabs/tabStore';
import {
  GitHubRepository,
  GitHubUser,
  WorkstationInfo,
  ProjectFolder,
} from '../../shared/types';

export interface WorkstationState {
  // GitHub
  isGitHubConnected: boolean;
  isConnectingToGitHub: boolean;
  gitHubUsername: string | null;
  gitHubToken: string | null;
  gitHubRepositories: GitHubRepository[];
  selectedRepository: GitHubRepository | null;
  gitHubUser: GitHubUser | null;
  showGitHubSidebar: boolean;

  // Workstation
  currentWorkstation: WorkstationInfo | null;
  workstations: WorkstationInfo[];
  projectFolders: ProjectFolder[];
  isCreatingWorkstation: boolean;
  userId: string | null;
  currentProjectInfo: any | null;

  // Actions - GitHub
  setGitHubConnected: (connected: boolean) => void;
  setGitHubUser: (user: GitHubUser | null) => void;
  setGitHubRepositories: (repos: GitHubRepository[]) => void;
  setSelectedRepository: (repo: GitHubRepository | null) => void;
  setShowGitHubSidebar: (show: boolean) => void;

  // Actions - Workstation
  setWorkstation: (workstation: WorkstationInfo | null) => void;
  addWorkstation: (workstation: WorkstationInfo) => void;
  loadWorkstations: (workstations: WorkstationInfo[]) => void;
  setProjectFolders: (folders: ProjectFolder[]) => void;
  removeWorkstation: (workstationId: string) => Promise<void>;
  addProjectFolder: (folder: ProjectFolder) => void;
  setProjectInfo: (projectInfo: any | null) => void;
  removeProjectFolder: (folderId: string) => void;
  toggleFolderExpanded: (folderId: string) => void;
  moveProjectToFolder: (projectId: string, folderId: string | null) => void;
  reorderWorkstations: (draggedId: string, targetId: string) => void;
  setWorkstationFiles: (workstationId: string, files: string[]) => void;
}

export const useWorkstationStore = create<WorkstationState>((set) => ({
    // Initial state - GitHub
    isGitHubConnected: false,
    isConnectingToGitHub: false,
    gitHubUsername: null,
    gitHubToken: null,
    gitHubRepositories: [],
    selectedRepository: null,
    gitHubUser: null,
    showGitHubSidebar: false,

    // Initial state - Workstation
    currentWorkstation: null,
    workstations: [],
    projectFolders: [],
    isCreatingWorkstation: false,
    userId: null,
    currentProjectInfo: null,

    // Actions - GitHub
    setGitHubConnected: (connected) => set({ isGitHubConnected: connected }),
    setGitHubUser: (user) => set({ gitHubUser: user }),
    setGitHubRepositories: (repos) => set({ gitHubRepositories: repos }),
    setSelectedRepository: (repo) => set({ selectedRepository: repo }),
    setShowGitHubSidebar: (show) => set({ showGitHubSidebar: show }),

    // Actions - Workstation
    setWorkstation: (workstation) =>
      set((state) => {
        // If switching to a different workstation (or clearing it), reset preview state in uiStore
        if (state.currentWorkstation?.id !== workstation?.id) {
          // Lazy import to avoid circular dependency
          const { useUIStore } = require('./uiStore');
          const uiState = useUIStore.getState();
          const savedMachineId = workstation?.id ? uiState.projectMachineIds[workstation.id] : null;
          useUIStore.setState({
            previewUrl: null,
            previewServerStatus: 'stopped' as const,
            previewServerUrl: null,
            flyMachineId: savedMachineId,
          });
          return {
            currentWorkstation: workstation,
          };
        }
        return { currentWorkstation: workstation };
      }),
    addWorkstation: (workstation) =>
      set((state) => {
        // Reset preview state in uiStore for the new workstation
        const { useUIStore } = require('./uiStore');
        useUIStore.setState({
          previewUrl: null,
          previewServerStatus: 'stopped' as const,
          previewServerUrl: null,
          flyMachineId: null,
        });
        return {
          workstations: [...state.workstations, workstation],
          currentWorkstation: workstation,
        };
      }),
    loadWorkstations: (workstations) => set({ workstations }),
    setProjectFolders: (folders) => set({ projectFolders: folders }),
    setProjectInfo: (projectInfo) => set({ currentProjectInfo: projectInfo }),
    removeWorkstation: async (workstationId) => {
      // Get the workstation to find the correct projectId
      const state = useWorkstationStore.getState();
      const workstation = state.workstations.find(w => w.id === workstationId);

      // Determine the Firebase document ID (projectId without ws- prefix)
      let projectIdToDelete = workstationId;
      if (workstation?.projectId) {
        projectIdToDelete = workstation.projectId;
      } else if (workstationId.startsWith('ws-')) {
        projectIdToDelete = workstationId.substring(3);
      }

      // 1. Reset ALL tabs to default state
      useTabStore.getState().resetTabs();

      // 2. Clear global terminal log and stop preview (cross-store side effect)
      const { useUIStore } = require('./uiStore');
      useUIStore.setState({
        globalTerminalLog: [],
        previewUrl: null,
        previewServerStatus: 'stopped' as const,
        previewServerUrl: null,
      });

      // 3. Delete from backend and Firebase
      try {
        await workstationService.deleteProject(projectIdToDelete);
      } catch (error) {
        console.error('❌ [WorkstationStore] Error deleting project:', error);
      }

      // 4. Remove from local store
      set((state) => ({
        workstations: state.workstations.filter((w) => w.id !== workstationId),
        currentWorkstation: state.currentWorkstation?.id === workstationId ? null : state.currentWorkstation,
      }));

    },
    addProjectFolder: (folder) =>
      set((state) => ({
        projectFolders: [...state.projectFolders, folder],
      })),
    removeProjectFolder: (folderId) =>
      set((state) => ({
        projectFolders: state.projectFolders.filter((f) => f.id !== folderId && f.parentId !== folderId),
        workstations: state.workstations.map((w) =>
          w.folderId === folderId ? { ...w, folderId: null } : w
        ),
      })),
    toggleFolderExpanded: (folderId) =>
      set((state) => ({
        projectFolders: state.projectFolders.map((f) =>
          f.id === folderId ? { ...f, isExpanded: !f.isExpanded } : f
        ),
      })),
    moveProjectToFolder: (projectId, folderId) =>
      set((state) => ({
        workstations: state.workstations.map((w) =>
          w.id === projectId ? { ...w, folderId } : w
        ),
      })),
    reorderWorkstations: (draggedId, targetId) =>
      set((state) => {
        const rootProjects = state.workstations.filter((w) => !w.folderId);
        const otherProjects = state.workstations.filter((w) => w.folderId);

        const draggedIndex = rootProjects.findIndex((w) => w.id === draggedId);
        const targetIndex = rootProjects.findIndex((w) => w.id === targetId);

        if (draggedIndex === -1 || targetIndex === -1) return state;

        const newRootProjects = [...rootProjects];
        const [removed] = newRootProjects.splice(draggedIndex, 1);
        newRootProjects.splice(targetIndex, 0, removed);

        return { workstations: [...newRootProjects, ...otherProjects] };
      }),
    setWorkstationFiles: (workstationId, files) =>
      set((state) => ({
        workstations: state.workstations.map((w) =>
          w.id === workstationId ? { ...w, files } : w
        ),
        currentWorkstation:
          state.currentWorkstation?.id === workstationId
            ? { ...state.currentWorkstation, files }
            : state.currentWorkstation,
      })),
}));
