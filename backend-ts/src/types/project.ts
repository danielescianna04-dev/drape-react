export type ProjectType = 'nextjs' | 'vite' | 'expo' | 'nodejs' | 'static' | 'python' | 'go' | 'unknown';
export type PackageManager = 'npm' | 'pnpm' | 'yarn';

export interface ProjectInfo {
  type: ProjectType;
  description: string;
  startCommand: string;
  port: number;
  installCommand?: string;
  packageManager?: PackageManager;
  disableTurbopack?: boolean;
}

export interface ProjectMetadata {
  projectId: string;
  userId?: string;
  name?: string;
  repositoryUrl?: string;
  createdAt?: string;
  template?: string;
}

export interface ProjectContext {
  name: string;
  description: string;
  technology: string;
  industry?: string;
  features?: string[];
  createdAt?: string;
}
