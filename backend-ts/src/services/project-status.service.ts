import { firebaseService } from './firebase.service';
import { log } from '../utils/logger';

export type ProjectCreationStatus =
  | 'creating'
  | 'generating'
  | 'ready'
  | 'completed'
  | 'verification_failed'
  | 'failed';

type ProjectStatusExtra = Record<string, any>;

export async function updateProjectCreationStatus(
  userId: string,
  projectId: string,
  status: ProjectCreationStatus,
  extra: ProjectStatusExtra = {},
): Promise<void> {
  if (!userId || userId === 'anonymous' || !projectId) return;

  try {
    const db = firebaseService.getDb();
    const now = new Date().toISOString();
    const payload: ProjectStatusExtra = {
      projectId,
      userId,
      status,
      updatedAt: now,
      ...extra,
    };

    if ((status === 'ready' || status === 'completed') && !payload.completedAt) {
      payload.completedAt = now;
    }
    if (status === 'failed' && !payload.failedAt) {
      payload.failedAt = now;
    }

    await Promise.allSettled([
      db.collection('users').doc(userId).collection('projects').doc(projectId).set(payload, { merge: true }),
      db.collection('user_projects').doc(projectId).set(payload, { merge: true }),
    ]);
  } catch (error: any) {
    log.warn(`[ProjectStatus] Failed to update ${userId}:${projectId} to ${status}: ${error?.message || error}`);
  }
}
