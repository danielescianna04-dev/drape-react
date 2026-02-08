import * as jose from 'jose';
import * as fs from 'fs';
import { config } from '../config';
import { log } from '../utils/logger';

// Apple's App Store Server API endpoints
const APPLE_API_URLS = {
  sandbox: 'https://api.storekit-sandbox.itunes.apple.com',
  production: 'https://api.storekit.itunes.apple.com',
};

// Map Apple product IDs to Drape plan names
const PRODUCT_TO_PLAN: Record<string, string> = {
  'com.drape.app.go.monthly.v2': 'go',
  'com.drape.app.go.yearly.v2': 'go',
  'com.drape.app.pro.monthly.v2': 'pro',
  'com.drape.app.pro.yearly.v2': 'pro',
};

export interface SubscriptionStatus {
  isActive: boolean;
  plan: string;
  productId: string;
  expiresAt: Date | null;
  originalTransactionId: string;
  environment: string;
}

class AppleIAPService {
  private privateKey: jose.KeyLike | null = null;

  private async getAuthToken(): Promise<string> {
    if (!this.privateKey) {
      const keyPem = fs.readFileSync(config.appleIapKeyPath, 'utf8');
      this.privateKey = await jose.importPKCS8(keyPem, 'ES256');
    }

    const now = Math.floor(Date.now() / 1000);

    const jwt = await new jose.SignJWT({})
      .setProtectedHeader({
        alg: 'ES256',
        kid: config.appleIapKeyId,
        typ: 'JWT',
      })
      .setIssuer(config.appleIapIssuerId)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .setAudience('appstoreconnect-v1')
      .setSubject(config.appleIapBundleId)
      .sign(this.privateKey);

    return jwt;
  }

  async verifyAndGetStatus(transactionId: string): Promise<SubscriptionStatus> {
    const token = await this.getAuthToken();
    const env = config.appleIapEnvironment as 'sandbox' | 'production';
    const baseUrl = APPLE_API_URLS[env];

    const response = await fetch(
      `${baseUrl}/inApps/v1/subscriptions/${transactionId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!response.ok) {
      const text = await response.text();
      log.error(`[Apple IAP] API error ${response.status}: ${text}`);
      throw new Error(`Apple API error: ${response.status}`);
    }

    const data = await response.json();

    const latestTransaction = data.data?.[0]?.lastTransactions?.[0];

    if (!latestTransaction) {
      return {
        isActive: false,
        plan: 'free',
        productId: '',
        expiresAt: null,
        originalTransactionId: transactionId,
        environment: env,
      };
    }

    const transactionInfo = this.decodeJWSPayload(latestTransaction.signedTransactionInfo);
    const productId = transactionInfo.productId;
    const plan = PRODUCT_TO_PLAN[productId] || 'free';
    const expiresAt = transactionInfo.expiresDate ? new Date(transactionInfo.expiresDate) : null;
    const isActive = latestTransaction.status === 1 || latestTransaction.status === 3;

    return {
      isActive,
      plan: isActive ? plan : 'free',
      productId,
      expiresAt,
      originalTransactionId: transactionInfo.originalTransactionId || transactionId,
      environment: transactionInfo.environment || env,
    };
  }

  async decodeNotification(signedPayload: string): Promise<{
    notificationType: string;
    subtype?: string;
    transactionInfo: any;
    renewalInfo: any;
  }> {
    const payload = this.decodeJWSPayload(signedPayload);

    const transactionInfo = payload.data?.signedTransactionInfo
      ? this.decodeJWSPayload(payload.data.signedTransactionInfo)
      : null;

    const renewalInfo = payload.data?.signedRenewalInfo
      ? this.decodeJWSPayload(payload.data.signedRenewalInfo)
      : null;

    return {
      notificationType: payload.notificationType,
      subtype: payload.subtype,
      transactionInfo,
      renewalInfo,
    };
  }

  private decodeJWSPayload(jws: string): any {
    const parts = jws.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWS format');
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  }
}

export const appleIAPService = new AppleIAPService();
