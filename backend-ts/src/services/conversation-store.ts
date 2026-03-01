import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import { log } from '../utils/logger';
import type { ChatMessage } from './ai-provider.service';

const CONVERSATIONS_DIR = path.join(config.projectsRoot, '..', 'conversations');

interface ConversationData {
  projectId: string;
  userId: string;
  model: string;
  messages: ChatMessage[];
  updatedAt: string;
  totalTokens: { input: number; output: number };
  totalCostEur: number;
}

function conversationPath(projectId: string, userId: string): string {
  // Sanitize to prevent path traversal
  const safeProject = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(CONVERSATIONS_DIR, `${safeProject}_${safeUser}.json`);
}

export async function saveConversation(
  projectId: string,
  userId: string,
  model: string,
  messages: ChatMessage[],
  tokens: { input: number; output: number },
  costEur: number,
): Promise<void> {
  try {
    await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });
    const filePath = conversationPath(projectId, userId);
    const data: ConversationData = {
      projectId,
      userId,
      model,
      messages,
      updatedAt: new Date().toISOString(),
      totalTokens: tokens,
      totalCostEur: costEur,
    };
    await fs.writeFile(filePath, JSON.stringify(data), 'utf-8');
    log.debug(`[ConversationStore] Saved conversation for ${projectId}/${userId}`);
  } catch (error: any) {
    log.warn(`[ConversationStore] Failed to save: ${error.message}`);
  }
}

export async function loadConversation(
  projectId: string,
  userId: string,
): Promise<ConversationData | null> {
  try {
    const filePath = conversationPath(projectId, userId);
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as ConversationData;
  } catch {
    return null;
  }
}

export async function deleteConversation(
  projectId: string,
  userId: string,
): Promise<void> {
  try {
    const filePath = conversationPath(projectId, userId);
    await fs.unlink(filePath);
    log.debug(`[ConversationStore] Deleted conversation for ${projectId}/${userId}`);
  } catch { /* not found — fine */ }
}
