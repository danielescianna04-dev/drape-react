export enum TerminalItemType {
  COMMAND = 'command',
  OUTPUT = 'output',
  ERROR = 'error',
  SYSTEM = 'system',
}

export interface TerminalItem {
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
  status: 'creating' | 'running' | 'stopped';
  url?: string;
}

export interface AutocompleteOption {
  text: string;
  description?: string;
}
