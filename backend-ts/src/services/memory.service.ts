import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import { log } from '../utils/logger';

const MEMORY_DIR = path.join(config.projectsRoot, '..', 'memory');

function memoryPath(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(MEMORY_DIR, `${safe}.md`);
}

/**
 * Read persistent project memory.
 * Returns null if no memory exists for this project.
 */
export async function readMemory(projectId: string): Promise<string | null> {
  try {
    return await fs.readFile(memoryPath(projectId), 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Write/update persistent project memory.
 * Overwrites the entire memory file.
 */
export async function writeMemory(projectId: string, content: string): Promise<void> {
  await fs.mkdir(MEMORY_DIR, { recursive: true });
  await fs.writeFile(memoryPath(projectId), content, 'utf-8');
  log.info(`[Memory] Saved memory for project ${projectId} (${content.length} chars)`);
}
