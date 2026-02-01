/**
 * Re-engagement Service
 * Sends push notifications to users who haven't opened the app recently
 */

const admin = require('firebase-admin');
const notificationService = require('./notification-service');

class ReengagementService {
  /**
   * Check all users and send re-engagement notifications where appropriate.
   * Called by cron job daily at 10:00 AM (Europe/Rome).
   */
  /**
   * Send upgrade prompts to free users periodically.
   * Called by cron job every 2 days at 14:00 (Europe/Rome).
   */
  async checkUpgradePrompts() {
    try {
      const db = admin.firestore();

      // Query users who have push tokens
      const usersSnapshot = await db.collection('users')
        .where('pushTokens', '!=', [])
        .get();

      if (usersSnapshot.empty) return;

      const now = Date.now();
      const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
      let sent = 0;

      // Rotating upgrade messages
      const upgradeMessages = [
        {
          title: 'Sblocca più potenza',
          body: 'Con Go hai 5 progetti, 20 preview/mese e il doppio del budget AI. Provalo!',
        },
        {
          title: 'I tuoi progetti meritano di più',
          body: 'Passa a Go per 3 repo clonati, 2GB di storage e supporto email.',
        },
        {
          title: 'Stai usando il piano Free',
          body: 'Fai upgrade a Go per creare fino a 5 progetti e avere 20 preview al mese.',
        },
        {
          title: 'Budget AI quasi esaurito?',
          body: 'Con Go ottieni €5 di budget AI al mese invece di €2.50. Fai upgrade!',
        },
      ];

      for (const userDoc of usersSnapshot.docs) {
        try {
          const userData = userDoc.data();
          const userId = userDoc.id;

          // Only target free users
          const userPlan = userData.plan || 'free';
          if (userPlan !== 'free') continue;

          // Skip if user opted out of re-engagement notifications
          if (userData.notificationPreferences?.reengagement === false) continue;

          // Skip if no pushTokens
          if (!userData.pushTokens || userData.pushTokens.length === 0) continue;

          // Don't spam - max one upgrade notification per 2 days
          const lastUpgrade = userData.lastUpgradeNotification
            ? new Date(userData.lastUpgradeNotification).getTime()
            : 0;

          if (now - lastUpgrade < TWO_DAYS_MS) continue;

          // Pick a message based on a rotating index
          const msgIndex = userData.upgradeNotificationCount
            ? userData.upgradeNotificationCount % upgradeMessages.length
            : 0;
          const message = upgradeMessages[msgIndex];

          await notificationService.sendToUser(userId, {
            title: message.title,
            body: message.body,
            type: 'reengagement',
          }, {
            action: 'open_home',
            upgradePrompt: 'true',
          });

          // Update tracking fields
          await db.collection('users').doc(userId).set({
            lastUpgradeNotification: new Date().toISOString(),
            upgradeNotificationCount: (userData.upgradeNotificationCount || 0) + 1,
          }, { merge: true });

          sent++;
        } catch (error) {
          console.warn(`[Reengagement] Upgrade prompt error for user ${userDoc.id}:`, error.message);
        }
      }

      console.log(`[Reengagement] Sent ${sent} upgrade prompt notifications`);
    } catch (error) {
      console.error('[Reengagement] Upgrade prompts failed:', error.message);
    }
  }

  /**
   * Check all users and send re-engagement notifications where appropriate.
   * Called by cron job daily at 10:00 AM (Europe/Rome).
   */
  async checkAndNotify() {
    try {
      const db = admin.firestore();

      // Query users who have push tokens registered
      const usersSnapshot = await db.collection('users')
        .where('pushTokens', '!=', [])
        .get();

      if (usersSnapshot.empty) {
        console.log('[Reengagement] No users with push tokens');
        return;
      }

      const now = Date.now();
      const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      let sent = 0;

      for (const userDoc of usersSnapshot.docs) {
        try {
          const userData = userDoc.data();
          const userId = userDoc.id;

          // Skip if user opted out of re-engagement
          if (userData.notificationPreferences?.reengagement === false) continue;

          // Skip if no pushTokens
          if (!userData.pushTokens || userData.pushTokens.length === 0) continue;

          // Check lastActiveAt
          const lastActive = userData.lastActiveAt
            ? new Date(userData.lastActiveAt).getTime()
            : null;

          if (!lastActive) continue;

          const inactiveDays = Math.floor((now - lastActive) / (24 * 60 * 60 * 1000));

          // Skip if active recently (< 3 days)
          if (inactiveDays < 3) continue;

          // Skip if we already sent a notification recently
          const lastReengagement = userData.lastReengagementNotification
            ? new Date(userData.lastReengagementNotification).getTime()
            : 0;

          // Don't spam - max one re-engagement notification per 3 days
          if (now - lastReengagement < THREE_DAYS_MS) continue;

          // Choose message based on inactivity duration
          let title, body;

          if (inactiveDays >= 7) {
            title = 'I tuoi progetti ti aspettano!';
            body = `Non apri Drape da ${inactiveDays} giorni. Torna a sviluppare!`;
          } else {
            title = 'Hai progetti in corso';
            body = 'Torna su Drape per continuare a sviluppare i tuoi progetti.';
          }

          await notificationService.sendToUser(userId, {
            title,
            body,
            type: 'reengagement',
          }, {
            action: 'open_home',
          });

          // Mark that we sent a re-engagement notification
          await db.collection('users').doc(userId).set({
            lastReengagementNotification: new Date().toISOString(),
          }, { merge: true });

          sent++;
        } catch (error) {
          console.warn(`[Reengagement] Error for user ${userDoc.id}:`, error.message);
        }
      }

      console.log(`[Reengagement] Sent ${sent} re-engagement notifications`);
    } catch (error) {
      console.error('[Reengagement] Check failed:', error.message);
    }
  }
}

module.exports = new ReengagementService();
