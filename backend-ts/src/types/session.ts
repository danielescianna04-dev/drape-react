import { ProjectInfo } from './project';

export interface Session {
  containerId: string;
  projectId: string;
  agentUrl: string;
  previewPort: number | null;
  serverId: string;
  createdAt: number;
  lastUsed: number;
  projectInfo?: ProjectInfo;
  preparedAt?: number;
}
