import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { ValidationError } from '../middleware/error-handler';
import { notificationService } from '../services/notification.service';
import { firebaseService } from '../services/firebase.service';
import { log } from '../utils/logger';

export const notificationRouter = Router();

/**
 * POST /notifications/register
 * Register a user's FCM token for push notifications
 */
notificationRouter.post('/register', asyncHandler(async (req, res) => {
  const { userId, token, platform } = req.body;

  if (!userId || !token) {
    throw new ValidationError('userId and token are required');
  }

  log.info(`[Notifications] Registering token for user ${userId} (platform: ${platform || 'ios'})`);

  const db = firebaseService.getFirestore();
  if (!db) {
    throw new Error('Firestore not initialized');
  }

  try {
    await db.collection('users').doc(userId).set(
      {
        pushToken: token,
        pushPlatform: platform || 'ios',
        pushTokenUpdatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    log.info(`[Notifications] Token registered successfully for user ${userId}`);

    res.json({
      success: true,
      message: 'Token registered successfully',
    });
  } catch (error: any) {
    log.error(`[Notifications] Failed to register token for user ${userId}:`, error.message);
    throw error;
  }
}));

/**
 * POST /notifications/send
 * Send a push notification to a specific user
 */
notificationRouter.post('/send', asyncHandler(async (req, res) => {
  const { userId, title, body, data } = req.body;

  if (!userId || !title || !body) {
    throw new ValidationError('userId, title, and body are required');
  }

  log.info(`[Notifications] Sending notification to user ${userId}: ${title}`);

  try {
    const result = await notificationService.sendToUser(
      userId,
      { title, body },
      data
    );

    res.json({
      success: result,
      message: result ? 'Notification sent successfully' : 'Failed to send notification',
    });
  } catch (error: any) {
    log.error(`[Notifications] Error sending notification to user ${userId}:`, error.message);
    throw error;
  }
}));

/**
 * POST /notifications/send-batch
 * Send a push notification to multiple users
 */
notificationRouter.post('/send-batch', asyncHandler(async (req, res) => {
  const { userIds, title, body, data } = req.body;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new ValidationError('userIds must be a non-empty array');
  }

  if (!title || !body) {
    throw new ValidationError('title and body are required');
  }

  log.info(`[Notifications] Sending batch notification to ${userIds.length} users: ${title}`);

  try {
    await notificationService.sendToUsers(
      userIds,
      { title, body },
      data
    );

    res.json({
      success: true,
      message: `Batch notification sent to ${userIds.length} users`,
    });
  } catch (error: any) {
    log.error('[Notifications] Error sending batch notification:', error.message);
    throw error;
  }
}));

/**
 * POST /notifications/preferences
 * Update notification preferences for a user
 */
notificationRouter.post('/preferences', asyncHandler(async (req, res) => {
  const { userId, preferences } = req.body;

  if (!userId) {
    throw new ValidationError('userId is required');
  }

  if (!preferences || typeof preferences !== 'object') {
    throw new ValidationError('preferences must be an object');
  }

  log.info(`[Notifications] Updating preferences for user ${userId}`);

  const db = firebaseService.getFirestore();
  if (!db) {
    throw new Error('Firestore not initialized');
  }

  try {
    await db.collection('users').doc(userId).set(
      {
        notificationPreferences: preferences,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    log.info(`[Notifications] Preferences updated for user ${userId}:`, preferences);

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      preferences,
    });
  } catch (error: any) {
    log.error(`[Notifications] Failed to update preferences for user ${userId}:`, error.message);
    throw error;
  }
}));

/**
 * GET /notifications/preferences/:userId
 * Get notification preferences for a user
 */
notificationRouter.get('/preferences/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    throw new ValidationError('userId is required');
  }

  const db = firebaseService.getFirestore();
  if (!db) {
    // Return default preferences if Firestore is not initialized
    return res.json({
      success: true,
      preferences: {
        enabled: true,
        githubActivity: true,
        reengagement: true,
        projectUpdates: true,
      },
    });
  }

  try {
    const doc = await db.collection('users').doc(userId).get();

    if (!doc.exists) {
      // Return default preferences for new users
      return res.json({
        success: true,
        preferences: {
          enabled: true,
          githubActivity: true,
          reengagement: true,
          projectUpdates: true,
        },
      });
    }

    const preferences = doc.data()?.notificationPreferences || {
      enabled: true,
      githubActivity: true,
      reengagement: true,
      projectUpdates: true,
    };

    res.json({
      success: true,
      preferences,
    });
  } catch (error: any) {
    log.error(`[Notifications] Failed to get preferences for user ${userId}:`, error.message);
    throw error;
  }
}));

/**
 * DELETE /notifications/unregister/:userId
 * Unregister a user's FCM token
 */
notificationRouter.delete('/unregister/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    throw new ValidationError('userId is required');
  }

  log.info(`[Notifications] Unregistering token for user ${userId}`);

  const db = firebaseService.getFirestore();
  if (!db) {
    throw new Error('Firestore not initialized');
  }

  try {
    await db.collection('users').doc(userId).update({
      pushToken: null,
      pushTokenRemovedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    log.info(`[Notifications] Token unregistered for user ${userId}`);

    res.json({
      success: true,
      message: 'Token unregistered successfully',
    });
  } catch (error: any) {
    log.error(`[Notifications] Failed to unregister token for user ${userId}:`, error.message);
    throw error;
  }
}));

/**
 * POST /notifications/test/:userId
 * Send a test notification to a user
 */
notificationRouter.post('/test/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    throw new ValidationError('userId is required');
  }

  log.info(`[Notifications] Sending test notification to user ${userId}`);

  try {
    const result = await notificationService.sendToUser(
      userId,
      {
        title: 'Test Notification',
        body: 'This is a test notification from Drape',
        type: 'test',
      },
      {
        test: 'true',
        timestamp: new Date().toISOString(),
      }
    );

    res.json({
      success: result,
      message: result
        ? 'Test notification sent successfully'
        : 'Failed to send test notification',
    });
  } catch (error: any) {
    log.error(`[Notifications] Failed to send test notification to user ${userId}:`, error.message);
    throw error;
  }
}));
