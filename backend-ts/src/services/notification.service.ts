import { firebaseService } from './firebase.service';
import { log } from '../utils/logger';

interface NotificationPayload {
  title: string;
  body: string;
  type?: string;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
}

class NotificationService {
  private readonly EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

  /**
   * Send a push notification to a specific user via Expo Push API
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

      // Validate it's an Expo push token
      if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
        log.warn(`[Notification] Invalid Expo token format for user ${userId}: ${token.substring(0, 20)}...`);
        return false;
      }

      const message: ExpoPushMessage = {
        to: token,
        title: notification.title,
        body: notification.body,
        data: {
          ...data,
          type: notification.type,
        },
        sound: 'default',
        badge: 1,
      };

      const response = await fetch(this.EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      const result = await response.json();

      if (result.data?.[0]?.status === 'ok') {
        log.info(`[Notification] Sent to user ${userId}: ${notification.title}`);
        return true;
      }

      // Handle errors
      if (result.data?.[0]?.status === 'error') {
        const error = result.data[0];
        log.error(`[Notification] Failed for user ${userId}: ${error.message}`);

        // Clean up invalid tokens
        if (error.details?.error === 'DeviceNotRegistered') {
          log.info(`[Notification] Cleaning up invalid token for user ${userId}`);
          await this.removeUserToken(userId);
        }
      }

      return false;
    } catch (error: any) {
      log.error(`[Notification] Failed to send to user ${userId}:`, error.message);
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
   * Send notifications in batch (up to 100 at a time for Expo)
   */
  async sendBatch(
    tokens: string[],
    notification: NotificationPayload,
    data?: Record<string, string>
  ): Promise<void> {
    const validTokens = tokens.filter(t =>
      t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken[')
    );

    if (validTokens.length === 0) {
      log.warn('[Notification] No valid Expo tokens in batch');
      return;
    }

    // Expo supports batches of up to 100 messages
    const chunks: string[][] = [];
    for (let i = 0; i < validTokens.length; i += 100) {
      chunks.push(validTokens.slice(i, i + 100));
    }

    for (const chunk of chunks) {
      const messages: ExpoPushMessage[] = chunk.map(token => ({
        to: token,
        title: notification.title,
        body: notification.body,
        data: {
          ...data,
          type: notification.type,
        },
        sound: 'default',
        badge: 1,
      }));

      try {
        await fetch(this.EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(messages),
        });
      } catch (error: any) {
        log.error('[Notification] Batch send error:', error.message);
      }
    }
  }

  /**
   * Get a user's push token from Firebase
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

      // Check new pushToken field first (single token)
      if (data?.pushToken) {
        return data.pushToken;
      }

      // Fallback to pushTokens array
      if (data?.pushTokens && Array.isArray(data.pushTokens) && data.pushTokens.length > 0) {
        // Get the most recent token
        const sorted = [...data.pushTokens].sort((a, b) =>
          (b.updatedAt || '').localeCompare(a.updatedAt || '')
        );
        return sorted[0]?.token || null;
      }

      return null;
    } catch (error: any) {
      log.error(`[Notification] Error getting token for user ${userId}:`, error.message);
      return null;
    }
  }

  /**
   * Remove a user's push token (called when token is invalid)
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
