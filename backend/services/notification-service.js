/**
 * Notification Service
 * Sends push notifications via Expo Push API
 */

const admin = require('firebase-admin');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

class NotificationService {
  /**
   * Send a push notification to a specific user via Expo Push API
   * @param {string} userId - Firebase user ID
   * @param {Object} notification - { title, body, type }
   * @param {Object} data - Extra data payload (for deep linking)
   */
  async sendToUser(userId, notification, data = {}) {
    try {
      const db = admin.firestore();
      const userDoc = await db.collection('users').doc(userId).get();

      if (!userDoc.exists) {
        console.log(`[Notify] User ${userId} not found`);
        return null;
      }

      const userData = userDoc.data();

      // Get token - check pushToken first, then pushTokens array
      let token = userData.pushToken;
      if (!token && userData.pushTokens?.length > 0) {
        const sorted = [...userData.pushTokens].sort((a, b) =>
          (b.updatedAt || '').localeCompare(a.updatedAt || '')
        );
        token = sorted[0]?.token;
      }

      if (!token) {
        console.log(`[Notify] User ${userId} has no push token`);
        return null;
      }

      // Validate Expo token format
      if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
        console.log(`[Notify] Invalid Expo token for ${userId}: ${token.substring(0, 25)}...`);
        return null;
      }

      // Check user preferences
      const prefs = userData.notificationPreferences || {};
      const type = notification.type || data.type || 'general';

      if (type === 'reengagement' && prefs.reengagement === false) return null;
      if (type === 'github_activity' && prefs.github === false) return null;
      if ((type === 'operation_complete' || type === 'clone_complete' || type === 'project_created') && prefs.operations === false) return null;

      const message = {
        to: token,
        title: notification.title,
        body: notification.body,
        data: {
          ...data,
          type: type,
        },
        sound: 'default',
        badge: 1,
      };

      const response = await fetch(EXPO_PUSH_URL, {
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
        console.log(`[Notify] Sent to ${userId}: ${notification.title}`);
        return result;
      }

      if (result.data?.[0]?.status === 'error') {
        const error = result.data[0];
        console.error(`[Notify] Failed for ${userId}: ${error.message}`);

        if (error.details?.error === 'DeviceNotRegistered') {
          await this._removeToken(userId);
        }
      }

      return null;
    } catch (error) {
      console.error(`[Notify] Error sending to ${userId}:`, error.message);
      return null;
    }
  }

  /**
   * Send notification to multiple users
   */
  async sendToUsers(userIds, notification, data = {}) {
    const results = await Promise.allSettled(
      userIds.map(uid => this.sendToUser(uid, notification, data))
    );
    return results;
  }

  /**
   * Remove invalid token
   */
  async _removeToken(userId) {
    try {
      const db = admin.firestore();
      await db.collection('users').doc(userId).update({
        pushToken: null,
        pushTokenRemovedAt: new Date().toISOString(),
      });
      console.log(`[Notify] Removed invalid token for ${userId}`);
    } catch (error) {
      console.warn(`[Notify] Failed to remove token for ${userId}:`, error.message);
    }
  }
}

module.exports = new NotificationService();
