import { firebaseService } from './firebase.service';
import { notificationService } from './notification.service';
import { log } from '../utils/logger';

interface ReengagementMessage {
  title: string;
  body: string;
}

class ReengagementService {
  private cronInterval: ReturnType<typeof setInterval> | null = null;
  private readonly INACTIVITY_THRESHOLD_DAYS = 2;
  private readonly COOLDOWN_DAYS = 2;

  /**
   * Start the reengagement service
   */
  start(intervalMs = 86400000): void {
    if (this.cronInterval) {
      log.warn('[Reengagement] Service already running');
      return;
    }

    // Check once per day by default (86400000ms = 24 hours)
    this.cronInterval = setInterval(() => {
      this.checkAndNotify().catch(e => {
        log.error('[Reengagement] Check failed:', e.message);
      });
    }, intervalMs);

    log.info(`[Reengagement] Service started (interval: ${intervalMs}ms)`);

    // Run initial check after 1 hour
    setTimeout(() => {
      this.checkAndNotify().catch(e => {
        log.error('[Reengagement] Initial check failed:', e.message);
      });
    }, 3600000);
  }

  /**
   * Stop the reengagement service
   */
  stop(): void {
    if (this.cronInterval) {
      clearInterval(this.cronInterval);
      this.cronInterval = null;
      log.info('[Reengagement] Service stopped');
    }
  }

  /**
   * Check for inactive users and send reengagement notifications
   */
  private async checkAndNotify(): Promise<void> {
    const db = firebaseService.getFirestore();
    if (!db) {
      log.warn('[Reengagement] Firestore not initialized, skipping check');
      return;
    }

    try {
      // Calculate cutoff date
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.INACTIVITY_THRESHOLD_DAYS);
      const cutoffISO = cutoffDate.toISOString();

      log.info(`[Reengagement] Checking for users inactive since ${cutoffISO}`);

      // Query users who haven't been active recently
      const usersSnapshot = await db
        .collection('users')
        .where('lastActiveAt', '<', cutoffISO)
        .where('pushToken', '!=', null)
        .get();

      if (usersSnapshot.empty) {
        log.info('[Reengagement] No inactive users found');
        return;
      }

      log.info(`[Reengagement] Found ${usersSnapshot.size} inactive users`);

      const notifyPromises = usersSnapshot.docs.map(doc =>
        this.sendReengagementNotification(doc.id, doc.data())
      );

      const results = await Promise.allSettled(notifyPromises);

      const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
      const failed = results.length - successful;

      log.info(`[Reengagement] Notifications sent: ${successful} successful, ${failed} failed`);
    } catch (error: any) {
      log.error('[Reengagement] Error during check:', error.message);
    }
  }

  /**
   * Send reengagement notification to a specific user
   */
  private async sendReengagementNotification(
    userId: string,
    userData: any
  ): Promise<boolean> {
    try {
      // Check notification preferences
      const preferences = userData.notificationPreferences || {};
      if (preferences.reengagement === false) {
        log.debug(`[Reengagement] User ${userId} has reengagement notifications disabled`);
        return false;
      }

      // Check if we've sent a reengagement notification recently (don't spam)
      const lastReengagement = userData.lastReengagementNotification;
      if (lastReengagement) {
        const lastDate = new Date(lastReengagement);
        const daysSince = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSince < this.COOLDOWN_DAYS) {
          log.debug(`[Reengagement] Already sent notification to user ${userId} ${daysSince.toFixed(1)} days ago`);
          return false;
        }
      }

      // Get personalized message (sequential, never repeats the last one)
      const lastIndex = userData.lastReengagementMessageIndex ?? -1;
      const message = this.getReengagementMessage(lastIndex, userData);

      // Send notification
      const sent = await notificationService.sendToUser(
        userId,
        {
          title: message.title,
          body: message.body,
          type: 'reengagement',
        },
        {
          action: 'open_app',
        }
      );

      if (sent) {
        // Update last reengagement timestamp + message index
        const db = firebaseService.getFirestore();
        if (db) {
          await db.collection('users').doc(userId).update({
            lastReengagementNotification: new Date().toISOString(),
            lastReengagementMessageIndex: message.index,
          });
        }

        log.info(`[Reengagement] Sent notification to user ${userId}`);
      }

      return sent;
    } catch (error: any) {
      log.error(`[Reengagement] Error sending notification to user ${userId}:`, error.message);
      return false;
    }
  }

  private static readonly MESSAGES: ReengagementMessage[] = [
    { title: 'Il tuo progetto ti aspetta!', body: 'Continua a costruire la tua app con Drape AI.' },
    { title: 'Hai un\'idea? Realizzala ora', body: 'Descrivi la tua app e Drape la crea per te in pochi minuti.' },
    { title: 'Non dimenticare il tuo progetto', body: 'Il tuo codice è pronto per essere migliorato.' },
    { title: 'Torna a programmare!', body: 'Drape AI può aiutarti a completare il tuo progetto.' },
    { title: 'Il tuo workspace ti aspetta', body: 'Riprendi da dove avevi lasciato con Drape.' },
    { title: 'Nuove funzionalità disponibili', body: 'Abbiamo migliorato Drape. Provalo ora!' },
    { title: 'La tua app è quasi pronta', body: 'Bastano pochi minuti per completarla con Drape AI.' },
    { title: 'Crea qualcosa di nuovo oggi', body: 'React, Next.js, Flutter e tanto altro — tutto con l\'AI.' },
    { title: 'Il tuo codice ti aspetta', body: 'Apri Drape e continua lo sviluppo del tuo progetto.' },
    { title: 'Pronto per il prossimo progetto?', body: 'Descrivi la tua idea e lascia fare all\'AI.' },
  ];

  /**
   * Get reengagement message — cycles sequentially so each notification is different
   */
  private getReengagementMessage(lastIndex: number, _userData?: any): ReengagementMessage & { index: number } {
    const total = ReengagementService.MESSAGES.length;
    const nextIndex = (lastIndex + 1) % total;
    return { ...ReengagementService.MESSAGES[nextIndex], index: nextIndex };
  }

  /**
   * Manually send reengagement notification to a specific user
   */
  async notifyUser(userId: string): Promise<boolean> {
    const db = firebaseService.getFirestore();
    if (!db) {
      throw new Error('Firestore not initialized');
    }

    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) {
      throw new Error('User not found');
    }

    return this.sendReengagementNotification(userId, doc.data());
  }

  /**
   * Get reengagement statistics
   */
  async getStats(): Promise<{
    inactiveUsers: number;
    eligibleForNotification: number;
    recentlySent: number;
  }> {
    const db = firebaseService.getFirestore();
    if (!db) {
      return { inactiveUsers: 0, eligibleForNotification: 0, recentlySent: 0 };
    }

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.INACTIVITY_THRESHOLD_DAYS);
      const cutoffISO = cutoffDate.toISOString();

      const inactiveSnapshot = await db
        .collection('users')
        .where('lastActiveAt', '<', cutoffISO)
        .get();

      const eligibleSnapshot = await db
        .collection('users')
        .where('lastActiveAt', '<', cutoffISO)
        .where('pushToken', '!=', null)
        .get();

      const recentCutoff = new Date();
      recentCutoff.setDate(recentCutoff.getDate() - this.COOLDOWN_DAYS);
      const recentISO = recentCutoff.toISOString();

      const recentSnapshot = await db
        .collection('users')
        .where('lastReengagementNotification', '>', recentISO)
        .get();

      return {
        inactiveUsers: inactiveSnapshot.size,
        eligibleForNotification: eligibleSnapshot.size,
        recentlySent: recentSnapshot.size,
      };
    } catch (error: any) {
      log.error('[Reengagement] Error getting stats:', error.message);
      return { inactiveUsers: 0, eligibleForNotification: 0, recentlySent: 0 };
    }
  }
}

export const reengagementService = new ReengagementService();
