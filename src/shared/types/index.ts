export enum TerminalItemType {
  COMMAND = 'command',
  OUTPUT = 'output',
  ERROR = 'error',
  SYSTEM = 'system',
  LOADING = 'loading',
}

export interface TerminalItem {
  id?: string;
  content: string;
  type: TerminalItemType;
  timestamp: Date;
  errorDetails?: string;
  exitCode?: number;
  previewUrl?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  description?: string; // Preview of first message
  createdAt: Date;
  lastUsed: Date;
  messages: TerminalItem[];
  aiModel: string;
  folderId?: string;
  repositoryId?: string;
  repositoryName?: string;
}

export interface ChatFolder {
  id: string;
  name: string;
  icon: string;
  color: string;
  createdAt: Date;
}

export interface GitHubRepository {
  id: string;
  name: string;
  fullName: string;
  description?: string;
  language: string;
  isPrivate: boolean;
  stars: number;
  forks: number;
  updatedAt: Date;
  cloneUrl: string;
  avatarUrl?: string;
}

export interface GitHubUser {
  login: string;
  name?: string;
  avatarUrl?: string;
}

export interface WorkstationInfo {
  id: string;
  name: string;
  language: string;
  status: 'creating' | 'running' | 'stopped' | 'idle' | 'ready';
  url?: string;
  webUrl?: string;
  folderId?: string | null;
  repositoryUrl?: string;
  createdAt: Date;
  files: any[];
}

export interface ProjectFolder {
  id: string;
  name: string;
  parentId: string | null;
  isExpanded: boolean;
  createdAt: Date;
}

export interface AutocompleteOption {
  text: string;
  description?: string;
}
