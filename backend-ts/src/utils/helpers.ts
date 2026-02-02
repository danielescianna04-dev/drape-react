import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { ExecResult } from '../types';

const execAsync = promisify(execCb);

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  delayMs: number,
): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (i < maxAttempts - 1) await sleep(delayMs);
    }
  }
  throw lastError;
}

export async function execShell(
  command: string,
  cwd?: string,
  timeoutMs = 30000,
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024,
      shell: '/bin/sh',
    });
    return { exitCode: 0, stdout: stdout || '', stderr: stderr || '' };
  } catch (err: any) {
    return {
      exitCode: err.code ?? 1,
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || '',
    };
  }
}

export function isBinaryFile(filePath: string): boolean {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  const { BINARY_EXTENSIONS } = require('./constants');
  return BINARY_EXTENSIONS.has(ext);
}

export function sanitizePath(basePath: string, userPath: string): string {
  const path = require('path');
  const resolved = path.resolve(basePath, userPath);
  if (!resolved.startsWith(basePath)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delayMs: number,
): T {
  let timer: NodeJS.Timeout | undefined;
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs) as unknown as NodeJS.Timeout;
  }) as unknown as T;
}
