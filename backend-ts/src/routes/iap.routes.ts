import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { requireAuth } from '../middleware/auth';
import { config } from '../config';
import { appleIAPService } from '../services/apple-iap.service';
import { firebaseService } from '../services/firebase.service';
import { log } from '../utils/logger';

export const iapRouter = Router();

const PRODUCT_TO_PLAN: Record<string, string> = {
  'com.drape.app.go.monthly.v2': 'go',
  'com.drape.app.go.yearly.v2': 'go',
  'com.drape.app.pro.monthly.v2': 'pro',
  'com.drape.app.pro.yearly.v2': 'pro',
};

// POST /iap/verify-receipt
iapRouter.post('/verify-receipt', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const { transactionId, productId: clientProductId } = req.body;

  if (!transactionId) {
    return res.status(400).json({ success: false, error: 'transactionId is required' });
  }

  try {
    const status = await appleIAPService.verifyAndGetStatus(transactionId);

    log.info(`[IAP] Verified for user ${userId}: plan=${status.plan}, active=${status.isActive}, expires=${status.expiresAt}`);

    const db = firebaseService.getFirestore();
    if (db) {
      await db.collection('users').doc(userId).set({
        plan: status.plan,
        subscription: {
          productId: status.productId,
          originalTransactionId: status.originalTransactionId,
          expiresAt: status.expiresAt?.toISOString() || null,
          isActive: status.isActive,
          environment: status.environment,
          updatedAt: new Date().toISOString(),
        },
      }, { merge: true });
    }

    res.json({
      success: true,
      plan: status.plan,
      isActive: status.isActive,
      expiresAt: status.expiresAt?.toISOString() || null,
    });
  } catch (error: any) {
    log.error(`[IAP] Verification failed for user ${userId}:`, error.message);

    // Fallback for Xcode StoreKit Testing ONLY (local transactions can't be verified with Apple)
    // DISABLED in production — only works in sandbox environment
    if (config.appleIapEnvironment === 'sandbox' && clientProductId && PRODUCT_TO_PLAN[clientProductId]) {
      const fallbackPlan = PRODUCT_TO_PLAN[clientProductId];
      log.warn(`[IAP] Using fallback for StoreKit testing: plan=${fallbackPlan}, productId=${clientProductId}`);

      try {
        const db = firebaseService.getFirestore();
        if (db) {
          await db.collection('users').doc(userId).set({
            plan: fallbackPlan,
            subscription: {
              productId: clientProductId,
              originalTransactionId: transactionId,
              isActive: true,
              environment: 'xcode',
              updatedAt: new Date().toISOString(),
            },
          }, { merge: true });
        }
      } catch (dbErr: any) {
        log.warn(`[IAP] Firestore update failed (fallback still succeeds): ${dbErr.message}`);
      }

      return res.json({ success: true, plan: fallbackPlan, isActive: true });
    }

    res.status(500).json({ success: false, error: 'Receipt verification failed' });
  }
}));

// POST /iap/apple-webhook — Apple App Store Server Notifications v2
iapRouter.post('/apple-webhook', asyncHandler(async (req, res) => {
  const { signedPayload } = req.body;

  if (!signedPayload) {
    return res.status(400).json({ error: 'Missing signedPayload' });
  }

  try {
    const notification = await appleIAPService.decodeNotification(signedPayload);

    log.info(`[IAP Webhook] ${notification.notificationType}${notification.subtype ? '/' + notification.subtype : ''}`);

    const txInfo = notification.transactionInfo;
    if (!txInfo) {
      res.sendStatus(200);
      return;
    }

    const originalTransactionId = txInfo.originalTransactionId;
    const productId = txInfo.productId;

    const db = firebaseService.getFirestore();
    if (!db) {
      res.sendStatus(200);
      return;
    }

    // Find user by originalTransactionId
    const usersSnapshot = await db.collection('users')
      .where('subscription.originalTransactionId', '==', originalTransactionId)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      log.warn(`[IAP Webhook] No user found for transaction ${originalTransactionId}`);
      res.sendStatus(200);
      return;
    }

    const userDoc = usersSnapshot.docs[0];
    const userId = userDoc.id;

    let newPlan: string;
    let isActive: boolean;

    switch (notification.notificationType) {
      case 'SUBSCRIBED':
      case 'DID_RENEW':
        newPlan = PRODUCT_TO_PLAN[productId] || 'free';
        isActive = true;
        break;

      case 'DID_CHANGE_RENEWAL_STATUS':
        if (notification.subtype === 'AUTO_RENEW_DISABLED') {
          log.info(`[IAP Webhook] User ${userId} disabled auto-renew`);
          await db.collection('users').doc(userId).set(
            { subscription: { autoRenewEnabled: false, updatedAt: new Date().toISOString() } },
            { merge: true },
          );
          res.sendStatus(200);
          return;
        }
        newPlan = PRODUCT_TO_PLAN[productId] || 'free';
        isActive = true;
        break;

      case 'EXPIRED':
      case 'GRACE_PERIOD_EXPIRED':
      case 'REFUND':
      case 'REVOKE':
        newPlan = 'free';
        isActive = false;
        break;

      case 'DID_FAIL_TO_RENEW':
        if (notification.subtype === 'GRACE_PERIOD') {
          log.info(`[IAP Webhook] User ${userId} in grace period`);
          newPlan = PRODUCT_TO_PLAN[productId] || 'free';
          isActive = true;
        } else {
          newPlan = 'free';
          isActive = false;
        }
        break;

      default:
        log.info(`[IAP Webhook] Unhandled type: ${notification.notificationType}`);
        res.sendStatus(200);
        return;
    }

    await db.collection('users').doc(userId).set({
      plan: newPlan,
      subscription: {
        isActive,
        productId,
        expiresAt: txInfo.expiresDate ? new Date(txInfo.expiresDate).toISOString() : null,
        updatedAt: new Date().toISOString(),
      },
    }, { merge: true });

    log.info(`[IAP Webhook] Updated user ${userId}: plan=${newPlan}, active=${isActive}`);

    res.sendStatus(200);
  } catch (error: any) {
    log.error('[IAP Webhook] Error:', error.message);
    // Always respond 200 to prevent Apple from retrying endlessly
    res.sendStatus(200);
  }
}));
