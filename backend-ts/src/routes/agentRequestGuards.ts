import { ValidationError } from '../middleware/error-handler';
import { verifyProjectOwnership } from '../middleware/auth';
import { log } from '../utils/logger';

export const getAgentUserId = (req: { userId?: string }) => req.userId || 'anonymous';

export const requireField = (value: unknown, message: string) => {
  if (
    value == null ||
    (typeof value === 'string' && !value.trim())
  ) {
    throw new ValidationError(message);
  }
};

export const requireBooleanField = (value: unknown, message: string) => {
  if (typeof value !== 'boolean') {
    throw new ValidationError(message);
  }
};

export async function ensureProjectOwnership(userId: string, projectId: string, context: string) {
  const isOwner = await verifyProjectOwnership(userId, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${userId} tried to access project ${projectId} without ownership (${context})`);
    return false;
  }
  return true;
}
