import { firebaseService } from './firebase.service';
import { log } from '../utils/logger';

interface NotificationPayload {
  title: string;
  body: string;
  type?: string;
}

class NotificationService {
  /**
   * Send a push notification to a specific user
   */
  async sendToUser(
    userId: string,
    notification: NotificationPayload,
    data?: Record<string, string>
  ): Promise<boolean> {
    try {
      const token = await this.getUserToken(userId);
      if (!token) {
        log.warn(`[Notification] No token found for user ${userId}`);
        return false;
      }

      const messaging = firebaseService.getMessaging();
      if (!messaging) {
        log.error('[Notification] Firebase messaging not initialized');
        return false;
      }

      const message = {
        token,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: data || {},
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      await messaging.send(message);
      log.info(`[Notification] Sent to user ${userId}: ${notification.title}`);
      return true;
    } catch (error: any) {
      log.error(`[Notification] Failed to send to user ${userId}:`, error.message);

      // Clean up invalid tokens
      if (
        error.code === 'messaging/registration-token-not-registered' ||
        error.code === 'messaging/invalid-registration-token'
      ) {
        log.info(`[Notification] Cleaning up invalid token for user ${userId}`);
        await this.removeUserToken(userId);
      }

      return false;
    }
  }

  /**
   * Send a push notification to multiple users
   */
  async sendToUsers(
    userIds: string[],
    notification: NotificationPayload,
    data?: Record<string, string>
  ): Promise<void> {
    log.info(`[Notification] Sending to ${userIds.length} users: ${notification.title}`);

    const results = await Promise.allSettled(
      userIds.map(id => this.sendToUser(id, notification, data))
    );

    const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
    const failed = results.length - successful;

    log.info(`[Notification] Batch complete: ${successful} sent, ${failed} failed`);
  }

  /**
   * Get a user's FCM token from Firebase
   */
  private async getUserToken(userId: string): Promise<string | null> {
    try {
      const db = firebaseService.getFirestore();
      if (!db) {
        log.error('[Notification] Firestore not initialized');
        return null;
      }

      const doc = await db.collection('users').doc(userId).get();
      if (!doc.exists) {
        log.warn(`[Notification] User ${userId} not found`);
        return null;
      }

      const data = doc.data();
      return data?.pushToken || null;
    } catch (error: any) {
      log.error(`[Notification] Error getting token for user ${userId}:`, error.message);
      return null;
    }
  }

  /**
   * Remove a user's FCM token (called when token is invalid)
   */
  private async removeUserToken(userId: string): Promise<void> {
    try {
      const db = firebaseService.getFirestore();
      if (!db) return;

      await db.collection('users').doc(userId).update({
        pushToken: null,
        pushTokenRemovedAt: new Date().toISOString(),
      });

      log.info(`[Notification] Removed token for user ${userId}`);
    } catch (error: any) {
      log.error(`[Notification] Error removing token for user ${userId}:`, error.message);
    }
  }

  /**
   * Check if user has notifications enabled
   */
  async areNotificationsEnabled(userId: string): Promise<boolean> {
    try {
      const db = firebaseService.getFirestore();
      if (!db) return false;

      const doc = await db.collection('users').doc(userId).get();
      if (!doc.exists) return false;

      const data = doc.data();
      const preferences = data?.notificationPreferences || {};

      // Default to true if not explicitly set
      return preferences.enabled !== false;
    } catch (error: any) {
      log.error(`[Notification] Error checking preferences for user ${userId}:`, error.message);
      return false;
    }
  }

  /**
   * Get user notification preferences
   */
  async getPreferences(userId: string): Promise<Record<string, any>> {
    try {
      const db = firebaseService.getFirestore();
      if (!db) return {};

      const doc = await db.collection('users').doc(userId).get();
      if (!doc.exists) return {};

      const data = doc.data();
      return data?.notificationPreferences || {};
    } catch (error: any) {
      log.error(`[Notification] Error getting preferences for user ${userId}:`, error.message);
      return {};
    }
  }
}

export const notificationService = new NotificationService();
