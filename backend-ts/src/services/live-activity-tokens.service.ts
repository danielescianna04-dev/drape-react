import { log } from '../utils/logger';

interface ActivityToken {
  userId: string;
  activityId: string;
  token: string; // hex APNs Live Activity push token
  createdAt: number;
  taskId?: string; // associated project creation taskId once known
}

class LiveActivityTokenStore {
  private tokens = new Map<string, ActivityToken>(); // key = activityId

  register(userId: string, activityId: string, token: string): void {
    this.tokens.set(activityId, { userId, activityId, token, createdAt: Date.now() });
    log.info(`[LiveActivity] registered token for activity ${activityId} (user ${userId})`);
  }

  associateTask(activityId: string, taskId: string): void {
    const entry = this.tokens.get(activityId);
    if (entry) {
      entry.taskId = taskId;
      this.tokens.set(activityId, entry);
    }
  }

  /**
   * Associate every still-unbound activity for this user with the given
   * taskId. Used by the client right after it learns the projectId from
   * the server: any Live Activity tokens it sent during the same session
   * are retroactively bound to the new task.
   */
  associateAllForUser(userId: string, taskId: string): void {
    for (const entry of this.tokens.values()) {
      if (entry.userId === userId && !entry.taskId) {
        entry.taskId = taskId;
      }
    }
  }

  byTaskId(taskId: string): ActivityToken[] {
    return Array.from(this.tokens.values()).filter(t => t.taskId === taskId);
  }

  remove(activityId: string): void {
    this.tokens.delete(activityId);
  }

  // Cleanup tokens older than 1 hour
  cleanup(): void {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [id, entry] of this.tokens.entries()) {
      if (entry.createdAt < cutoff) this.tokens.delete(id);
    }
  }
}

export const liveActivityTokens = new LiveActivityTokenStore();
setInterval(() => liveActivityTokens.cleanup(), 10 * 60 * 1000);
