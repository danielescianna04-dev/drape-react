export type ContainerState = 'creating' | 'running' | 'stopping' | 'stopped' | 'error';

export interface ContainerInfo {
  id: string;
  projectId: string;
  agentUrl: string;
  previewPort: number | null;
  serverId: string;
  state: ContainerState;
  image: string;
  createdAt: number;
  lastUsed: number;
}

export interface CreateContainerOptions {
  projectId: string;
  memoryMb?: number;
  cpus?: number;
  image?: string;
}

export interface DockerServer {
  id: string;
  host: string;
  port: number;
  isLocal: boolean;
  docker: import('dockerode');
}
