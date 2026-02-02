export interface Result<T = void> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface FileEntry {
  path: string;
  size?: number;
  isDirectory?: boolean;
  modifiedAt?: string;
}

export interface FileContent {
  path: string;
  content: string;
  isBinary: boolean;
  size: number;
}

export interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

export type ProgressCallback = (step: string, message: string) => void;

export interface PreviewResult {
  success: boolean;
  previewUrl?: string;
  agentUrl?: string;
  containerId?: string;
  projectInfo?: import('./project').ProjectInfo;
  error?: string;
}
