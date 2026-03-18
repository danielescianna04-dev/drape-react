import { firebaseService } from './firebase.service';
import { log } from '../utils/logger';

/**
 * GDPR Article 5(1)(e) — Storage Limitation / Data Retention
 *
 * Automated cleanup of stale data to comply with retention policies:
 *  - user_events:  analytics events older than 90 days are deleted
 *  - presence:     presence documents where lastSeen > 30 days ago are deleted
 *
 * Uses Firestore batch operations (max 500 per batch) for efficient deletion.
 */
class DataRetentionService {
  private readonly ANALYTICS_RETENTION_DAYS = 90;
  private readonly PRESENCE_RETENTION_DAYS = 30;
  private readonly BATCH_SIZE = 500;

  /**
   * Delete user_events documents older than 90 days.
   * Events use Firestore serverTimestamp() for the `timestamp` field.
   */
  async cleanupOldAnalytics(): Promise<number> {
    const db = firebaseService.getFirestore();
    if (!db) {
      log.warn('[DataRetention] Firestore not initialized, skipping analytics cleanup');
      return 0;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.ANALYTICS_RETENTION_DAYS);

    log.info(`[DataRetention] Cleaning up user_events older than ${cutoffDate.toISOString()}`);

    let totalDeleted = 0;

    try {
      // Process in batches to avoid memory issues with large collections
      let hasMore = true;

      while (hasMore) {
        const snapshot = await db
          .collection('user_events')
          .where('timestamp', '<', cutoffDate)
          .limit(this.BATCH_SIZE)
          .get();

        if (snapshot.empty) {
          hasMore = false;
          break;
        }

        const batch = db.batch();
        for (const doc of snapshot.docs) {
          batch.delete(doc.ref);
        }
        await batch.commit();

        totalDeleted += snapshot.size;
        log.info(`[DataRetention] Deleted batch of ${snapshot.size} old analytics events (total: ${totalDeleted})`);

        // If we got fewer than BATCH_SIZE, there are no more to delete
        if (snapshot.size < this.BATCH_SIZE) {
          hasMore = false;
        }
      }

      log.info(`[DataRetention] Analytics cleanup complete: ${totalDeleted} events deleted`);
    } catch (error: any) {
      log.error(`[DataRetention] Analytics cleanup error: ${error.message}`);
    }

    return totalDeleted;
  }

  /**
   * Delete presence documents where lastSeen is older than 30 days.
   * These are stale sessions that never properly cleaned up.
   */
  async cleanupOldPresence(): Promise<number> {
    const db = firebaseService.getFirestore();
    if (!db) {
      log.warn('[DataRetention] Firestore not initialized, skipping presence cleanup');
      return 0;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.PRESENCE_RETENTION_DAYS);

    log.info(`[DataRetention] Cleaning up presence documents older than ${cutoffDate.toISOString()}`);

    let totalDeleted = 0;

    try {
      let hasMore = true;

      while (hasMore) {
        const snapshot = await db
          .collection('presence')
          .where('lastSeen', '<', cutoffDate)
          .limit(this.BATCH_SIZE)
          .get();

        if (snapshot.empty) {
          hasMore = false;
          break;
        }

        const batch = db.batch();
        for (const doc of snapshot.docs) {
          batch.delete(doc.ref);
        }
        await batch.commit();

        totalDeleted += snapshot.size;

        if (snapshot.size < this.BATCH_SIZE) {
          hasMore = false;
        }
      }

      log.info(`[DataRetention] Presence cleanup complete: ${totalDeleted} documents deleted`);
    } catch (error: any) {
      log.error(`[DataRetention] Presence cleanup error: ${error.message}`);
    }

    return totalDeleted;
  }

  /**
   * Run all retention cleanup tasks.
   */
  async runAll(): Promise<{ analyticsDeleted: number; presenceDeleted: number }> {
    log.info('[DataRetention] Starting retention cleanup...');

    const [analyticsDeleted, presenceDeleted] = await Promise.all([
      this.cleanupOldAnalytics(),
      this.cleanupOldPresence(),
    ]);

    log.info(`[DataRetention] Retention cleanup complete — analytics: ${analyticsDeleted}, presence: ${presenceDeleted}`);

    return { analyticsDeleted, presenceDeleted };
  }
}

export const dataRetentionService = new DataRetentionService();
