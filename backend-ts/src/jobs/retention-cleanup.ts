import { dataRetentionService } from '../services/data-retention.service';
import { log } from '../utils/logger';

/**
 * GDPR Data Retention Cleanup Job
 *
 * Runs every 24 hours to enforce data retention policies:
 *  - Deletes analytics events (user_events) older than 90 days
 *  - Deletes stale presence documents older than 30 days
 *
 * Started on server boot via `startRetentionCleanupJob()`.
 * Can be stopped gracefully via `stopRetentionCleanupJob()`.
 */

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const INITIAL_DELAY_MS = 2 * 60 * 60 * 1000; // 2 hours after startup

let cleanupInterval: ReturnType<typeof setInterval> | null = null;
let initialTimeout: ReturnType<typeof setTimeout> | null = null;

async function runCleanup(): Promise<void> {
  try {
    const result = await dataRetentionService.runAll();
    log.info(`[RetentionJob] Cleanup complete — analytics: ${result.analyticsDeleted}, presence: ${result.presenceDeleted}`);
  } catch (error: any) {
    log.error(`[RetentionJob] Cleanup failed: ${error.message}`);
  }
}

/**
 * Start the retention cleanup job.
 * Runs an initial cleanup after a delay, then repeats every 24 hours.
 */
export function startRetentionCleanupJob(): void {
  if (cleanupInterval) {
    log.warn('[RetentionJob] Job already running');
    return;
  }

  log.info(`[RetentionJob] Scheduled — initial run in ${INITIAL_DELAY_MS / 1000}s, then every ${CLEANUP_INTERVAL_MS / 1000}s`);

  // Run initial cleanup after delay (don't block startup)
  initialTimeout = setTimeout(() => {
    runCleanup();
  }, INITIAL_DELAY_MS);

  // Schedule recurring cleanup
  cleanupInterval = setInterval(() => {
    runCleanup();
  }, CLEANUP_INTERVAL_MS);
}

/**
 * Stop the retention cleanup job (for graceful shutdown).
 */
export function stopRetentionCleanupJob(): void {
  if (initialTimeout) {
    clearTimeout(initialTimeout);
    initialTimeout = null;
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    log.info('[RetentionJob] Stopped');
  }
}
