/**
 * Notification Service
 * Sends push notifications via Firebase Admin (APNs/FCM)
 */

const admin = require('firebase-admin');

class NotificationService {
  /**
   * Send a push notification to a specific user
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
      const tokens = (userData.pushTokens || [])
        .map(t => t.token)
        .filter(Boolean);

      if (tokens.length === 0) {
        console.log(`[Notify] User ${userId} has no push tokens`);
        return null;
      }

      // Check user preferences
      const prefs = userData.notificationPreferences || {};
      const type = notification.type || data.type || 'general';

      if (type === 'reengagement' && prefs.reengagement === false) return null;
      if (type === 'github_activity' && prefs.github === false) return null;
      if ((type === 'operation_complete' || type === 'clone_complete' || type === 'project_created') && prefs.operations === false) return null;

      const message = {
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
          type: type,
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              'mutable-content': 1,
            },
          },
        },
        tokens: tokens,
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      console.log(`[Notify] Sent to ${userId}: ${notification.title} (${response.successCount}/${tokens.length} delivered)`);

      // Clean up invalid tokens
      await this._cleanupFailedTokens(userId, tokens, response);

      return response;
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
   * Remove tokens that are no longer valid
   */
  async _cleanupFailedTokens(userId, tokens, response) {
    const tokensToRemove = [];

    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const code = resp.error?.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          tokensToRemove.push(tokens[idx]);
        }
      }
    });

    if (tokensToRemove.length > 0) {
      try {
        const db = admin.firestore();
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        const userData = userDoc.data();
        const currentTokens = userData.pushTokens || [];

        const updatedTokens = currentTokens.filter(
          t => !tokensToRemove.includes(t.token)
        );

        await userRef.update({ pushTokens: updatedTokens });
        console.log(`[Notify] Removed ${tokensToRemove.length} invalid tokens for ${userId}`);
      } catch (error) {
        console.warn(`[Notify] Failed to cleanup tokens for ${userId}:`, error.message);
      }
    }
  }
}

module.exports = new NotificationService();
