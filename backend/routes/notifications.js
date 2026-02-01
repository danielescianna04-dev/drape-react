/**
 * Notification Routes
 * Device token registration and preference management
 */

const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const notificationService = require('../services/notification-service');

/**
 * POST /notifications/register
 * Register a device push token for a user
 */
router.post('/register', async (req, res) => {
  try {
    const { userId, token, platform } = req.body;

    if (!userId || !token) {
      return res.status(400).json({ error: 'userId and token are required' });
    }

    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // Create minimal user doc if it doesn't exist
      await userRef.set({
        pushTokens: [{ token, platform: platform || 'ios', updatedAt: new Date().toISOString() }],
      }, { merge: true });
    } else {
      // Check if token already exists, update or add
      const userData = userDoc.data();
      const existingTokens = userData.pushTokens || [];
      const tokenIndex = existingTokens.findIndex(t => t.token === token);

      if (tokenIndex >= 0) {
        // Update existing token's timestamp
        existingTokens[tokenIndex].updatedAt = new Date().toISOString();
        await userRef.update({ pushTokens: existingTokens });
      } else {
        // Add new token
        existingTokens.push({
          token,
          platform: platform || 'ios',
          updatedAt: new Date().toISOString(),
        });
        await userRef.update({ pushTokens: existingTokens });
      }
    }

    console.log(`[Notify] Token registered for user ${userId} (${platform})`);
    res.json({ success: true });
  } catch (error) {
    console.error('[Notify] Register error:', error.message);
    res.status(500).json({ error: 'Failed to register token' });
  }
});

/**
 * PUT /notifications/preferences
 * Update user notification preferences
 */
router.put('/preferences', async (req, res) => {
  try {
    const { userId, preferences } = req.body;

    if (!userId || !preferences) {
      return res.status(400).json({ error: 'userId and preferences are required' });
    }

    const db = admin.firestore();
    await db.collection('users').doc(userId).set({
      notificationPreferences: {
        operations: preferences.operations !== false,
        github: preferences.github !== false,
        reengagement: preferences.reengagement !== false,
      },
    }, { merge: true });

    console.log(`[Notify] Preferences updated for user ${userId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[Notify] Preferences error:', error.message);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * POST /notifications/test
 * Send a test notification (for debugging)
 */
router.post('/test', async (req, res) => {
  try {
    const { userId, title, body } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await notificationService.sendToUser(userId, {
      title: title || 'Test Notifica',
      body: body || 'Questa e\' una notifica di test da Drape!',
      type: 'test',
    });

    res.json({ success: true, result });
  } catch (error) {
    console.error('[Notify] Test error:', error.message);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

module.exports = router;
