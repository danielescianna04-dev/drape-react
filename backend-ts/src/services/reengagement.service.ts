import { firebaseService } from './firebase.service';
import { notificationService } from './notification.service';
import { log } from '../utils/logger';

interface ReengagementMessage {
  title: string;
  body: string;
}

class ReengagementService {
  private cronInterval: ReturnType<typeof setInterval> | null = null;
  private readonly INACTIVITY_THRESHOLD_DAYS = 3;

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
      // Calculate cutoff date (3 days ago)
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

        if (daysSince < 7) {
          log.debug(`[Reengagement] Already sent notification to user ${userId} ${daysSince.toFixed(1)} days ago`);
          return false;
        }
      }

      // Get personalized message
      const message = this.getReengagementMessage(userData);

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
        // Update last reengagement timestamp
        const db = firebaseService.getFirestore();
        if (db) {
          await db.collection('users').doc(userId).update({
            lastReengagementNotification: new Date().toISOString(),
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

  /**
   * Get a personalized reengagement message
   */
  private getReengagementMessage(userData?: any): ReengagementMessage {
    const messages: ReengagementMessage[] = [
      {
        title: 'Il tuo progetto ti aspetta! 🚀',
        body: 'Continua a costruire la tua app con Drape AI.',
      },
      {
        title: 'Novità in Drape! ✨',
        body: 'Nuove funzionalità disponibili. Provale ora!',
      },
      {
        title: 'Non dimenticare il tuo progetto 💡',
        body: 'Il tuo codice è pronto per essere migliorato.',
      },
      {
        title: 'Torna a programmare! 👨‍💻',
        body: 'Drape AI può aiutarti a completare il tuo progetto.',
      },
      {
        title: 'Il tuo workspace ti aspetta 🎯',
        body: 'Riprendi da dove avevi lasciato con Drape.',
      },
    ];

    // Personalize based on user data
    if (userData?.projects && userData.projects.length > 0) {
      const projectCount = userData.projects.length;
      messages.push({
        title: `${projectCount} progett${projectCount === 1 ? 'o' : 'i'} in attesa 📱`,
        body: 'Continua lo sviluppo con Drape AI.',
      });
    }

    if (userData?.plan === 'pro' || userData?.plan === 'premium') {
      messages.push({
        title: 'Il tuo piano Premium è attivo ⭐',
        body: 'Sfrutta tutte le funzionalità avanzate di Drape.',
      });
    }

    // Return random message
    return messages[Math.floor(Math.random() * messages.length)];
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
      recentCutoff.setDate(recentCutoff.getDate() - 7);
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
