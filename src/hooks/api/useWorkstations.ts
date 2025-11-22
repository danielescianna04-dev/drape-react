import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { WorkstationAPI, Workstation, CreateWorkstationParams, WorkstationFile, ProjectDetectionResult } from '@/services/api/workstationAPI';

// Query Keys
export const workstationKeys = {
  all: ['workstations'] as const,
  lists: () => [...workstationKeys.all, 'list'] as const,
  list: () => [...workstationKeys.lists()] as const,
  details: () => [...workstationKeys.all, 'detail'] as const,
  detail: (id: string) => [...workstationKeys.details(), id] as const,
  files: (id: string) => [...workstationKeys.detail(id), 'files'] as const,
  filesInPath: (id: string, path: string) => [...workstationKeys.files(id), path] as const,
  fileContent: (id: string, path: string) => [...workstationKeys.detail(id), 'file', path] as const,
  projectDetection: (id: string) => [...workstationKeys.detail(id), 'project-detection'] as const,
};

// Hooks

/**
 * Fetch all workstations
 */
export const useWorkstations = () => {
  return useQuery({
    queryKey: workstationKeys.list(),
    queryFn: () => WorkstationAPI.listWorkstations(),
  });
};

/**
 * Fetch single workstation
 */
export const useWorkstation = (id: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: workstationKeys.detail(id),
    queryFn: () => WorkstationAPI.getWorkstation(id),
    enabled: enabled && !!id,
  });
};

/**
 * Create new workstation
 */
export const useCreateWorkstation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: CreateWorkstationParams) => WorkstationAPI.createWorkstation(params),
    onSuccess: () => {
      // Invalidate workstations list to refetch
      queryClient.invalidateQueries({ queryKey: workstationKeys.list() });
    },
  });
};

/**
 * Delete workstation
 */
export const useDeleteWorkstation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => WorkstationAPI.deleteWorkstation(id),
    onSuccess: (_, id) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: workstationKeys.detail(id) });
      // Invalidate list
      queryClient.invalidateQueries({ queryKey: workstationKeys.list() });
    },
  });
};

/**
 * Start workstation
 */
export const useStartWorkstation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => WorkstationAPI.startWorkstation(id),
    onSuccess: (data, id) => {
      // Update workstation in cache
      queryClient.setQueryData(workstationKeys.detail(id), data);
      // Invalidate list
      queryClient.invalidateQueries({ queryKey: workstationKeys.list() });
    },
  });
};

/**
 * Stop workstation
 */
export const useStopWorkstation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => WorkstationAPI.stopWorkstation(id),
    onSuccess: (data, id) => {
      // Update workstation in cache
      queryClient.setQueryData(workstationKeys.detail(id), data);
      // Invalidate list
      queryClient.invalidateQueries({ queryKey: workstationKeys.list() });
    },
  });
};

/**
 * List files in workstation
 */
export const useWorkstationFiles = (id: string, path: string = '/', enabled: boolean = true) => {
  return useQuery({
    queryKey: workstationKeys.filesInPath(id, path),
    queryFn: () => WorkstationAPI.listFiles(id, path),
    enabled: enabled && !!id,
  });
};

/**
 * Read file content
 */
export const useFileContent = (id: string, path: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: workstationKeys.fileContent(id, path),
    queryFn: () => WorkstationAPI.readFile(id, path),
    enabled: enabled && !!id && !!path,
  });
};

/**
 * Write file content
 */
export const useWriteFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, path, content }: { id: string; path: string; content: string }) =>
      WorkstationAPI.writeFile(id, path, content),
    onSuccess: (_, { id, path }) => {
      // Invalidate file content cache
      queryClient.invalidateQueries({ queryKey: workstationKeys.fileContent(id, path) });
      // Invalidate files list for the directory
      const dirPath = path.substring(0, path.lastIndexOf('/'));
      queryClient.invalidateQueries({ queryKey: workstationKeys.filesInPath(id, dirPath) });
    },
  });
};

/**
 * Delete file
 */
export const useDeleteFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, path }: { id: string; path: string }) =>
      WorkstationAPI.deleteFile(id, path),
    onSuccess: (_, { id, path }) => {
      // Remove file content from cache
      queryClient.removeQueries({ queryKey: workstationKeys.fileContent(id, path) });
      // Invalidate files list
      const dirPath = path.substring(0, path.lastIndexOf('/'));
      queryClient.invalidateQueries({ queryKey: workstationKeys.filesInPath(id, dirPath) });
    },
  });
};

/**
 * Detect project type
 */
export const useProjectDetection = (id: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: workstationKeys.projectDetection(id),
    queryFn: () => WorkstationAPI.detectProject(id),
    enabled: enabled && !!id,
    staleTime: 1000 * 60 * 10, // 10 minutes - project type doesn't change often
  });
};

/**
 * Execute command in workstation
 */
export const useExecuteCommand = () => {
  return useMutation({
    mutationFn: ({ id, command }: { id: string; command: string }) =>
      WorkstationAPI.executeCommand(id, command),
  });
};
