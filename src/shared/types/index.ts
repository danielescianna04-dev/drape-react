export enum TerminalItemType {
  COMMAND = 'command',
  OUTPUT = 'output',
  ERROR = 'error',
  SYSTEM = 'system',
  LOADING = 'loading',
  USER_MESSAGE = 'user_message', // User message in chat (not a terminal command)
  BACKEND_LOG = 'backend_log', // Real-time backend log
  TOOL_USE = 'tool_use', // Rich visualization for agent tool tools
}

export type TerminalSource = 'preview' | 'chat' | 'terminal' | 'ai' | 'system';

export interface TerminalItem {
  id?: string;
  content: string;
  type: TerminalItemType;
  timestamp: Date;
  errorDetails?: string;
  exitCode?: number;
  previewUrl?: string;
  source?: TerminalSource; // Where the command originated from
  isThinking?: boolean; // Show "Thinking..." indicator for AI response placeholder
  thinkingContent?: string; // The actual thinking text from Claude (extended thinking)
  isAgentProgress?: boolean; // Show agent progress UI for this item
  agentEvents?: any[]; // Snapshot of tool events for this specific run
  images?: {
    uri: string;
    base64?: string;
    type?: string;
  }[]; // Attached images (for multimodal support)
  toolInfo?: {
    tool: string;
    input: any;
    output?: any;
    status: 'running' | 'completed' | 'error';
  };
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
  githubUrl?: string; // Alternative to repositoryUrl for GitHub links
  githubAccountUsername?: string; // Account GitHub collegato a questo progetto
  createdAt: Date;
  lastOpened?: Date; // Last time project was opened
  files: any[];
  projectId?: string; // ID del progetto Firebase
  cloned?: boolean; // Se il progetto è già stato clonato
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
