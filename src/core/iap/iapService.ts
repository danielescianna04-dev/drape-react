import { Platform, Alert } from 'react-native';
import i18next from 'i18next';
import { config } from '../../config/config';
import { getAuthHeaders } from '../api/getAuthToken';
import { ALL_PRODUCT_IDS } from './iapConstants';
import { tracciaAcquistoAvviato, tracciaAcquistoCompletato, tracciaErroreAcquisto } from '../services/analyticsService';

// Lazy-load react-native-iap to avoid crashes when native module isn't available
let RNIap: typeof import('react-native-iap') | null = null;

async function getIap() {
  if (RNIap) return RNIap;
  try {
    RNIap = await import('react-native-iap');
    return RNIap;
  } catch {
    console.warn('[IAP] react-native-iap native module not available');
    return null;
  }
}

export type IAPProduct = {
  productId: string;
  localizedPrice: string;
  title: string;
  description: string;
  currency: string;
  price: string;
  introductoryPrice?: string;
  introductoryPricePaymentMode?: string;
  introductoryPriceNumberOfPeriods?: number;
  introductoryPriceSubscriptionPeriod?: string;
};

export type IAPError =
  | 'cancelled'
  | 'already_subscribed'
  | 'network'
  | 'unknown'
  | 'not_available';

class IAPService {
  private initialized = false;
  private products: IAPProduct[] = [];
  private purchaseUpdateSub: any = null;
  private purchaseErrorSub: any = null;
  private onPurchaseComplete: ((plan: string) => void) | null = null;
  private onPurchaseError: ((error: IAPError) => void) | null = null;
  private pendingProductId: string | null = null;

  async initialize(): Promise<void> {
    if (this.initialized || Platform.OS !== 'ios') return;

    const iap = await getIap();
    if (!iap) return;

    try {
      await iap.initConnection();
      this.initialized = true;
      console.log('[IAP] Connection initialized');

      // Listen for purchase completions
      this.purchaseUpdateSub = iap.purchaseUpdatedListener(async (purchase: any) => {
        // Use the productId we requested, not what StoreKit reports
        // (StoreKit may report the OLD subscription on upgrade/downgrade)
        const productId = this.pendingProductId || purchase.productId;
        console.log('[IAP] Purchase update:', purchase.productId, '→ using:', productId, purchase.transactionId);
        const transactionId = purchase.transactionId;
        if (transactionId) {
          try {
            const result = await this.verifyOnServer(transactionId, productId);
            if (result.success) {
              await iap.finishTransaction({ purchase, isConsumable: false });
              this.pendingProductId = null;
              tracciaAcquistoCompletato(productId, result.plan);
              this.onPurchaseComplete?.(result.plan);
            } else {
              this.pendingProductId = null;
              tracciaErroreAcquisto(productId, 'verification_failed');
              this.onPurchaseError?.('unknown');
            }
          } catch (err) {
            console.error('[IAP] Verify failed:', err);
            this.pendingProductId = null;
            tracciaErroreAcquisto(productId, 'network');
            this.onPurchaseError?.('network');
          }
        }
      });

      this.purchaseErrorSub = iap.purchaseErrorListener((error: any) => {
        console.warn('[IAP] Purchase error:', JSON.stringify(error));
        if (error.code === 'user-cancelled' || error.code === 'E_USER_CANCELLED') {
          tracciaErroreAcquisto(this.pendingProductId || 'unknown', 'cancelled');
          this.onPurchaseError?.('cancelled');
        } else {
          tracciaErroreAcquisto(this.pendingProductId || 'unknown', error.code || 'unknown');
          this.onPurchaseError?.('unknown');
        }
      });
    } catch (err) {
      console.error('[IAP] Init failed:', err);
    }
  }

  async getProducts(forceRefresh = false): Promise<IAPProduct[]> {
    if (forceRefresh) {
      this.products = [];
    }

    if (this.products.length > 0) return this.products;

    if (!this.initialized) {
      await this.initialize();
    }

    const iap = await getIap();
    if (!iap) return [];

    try {
      // v14 API: type 'subs' is required to get subscription fields (intro price, periods, etc.)
      const products = await iap.fetchProducts({ skus: ALL_PRODUCT_IDS, type: 'subs' });
      console.log('[IAP] Fetched products:', products?.length);
      if (!products) return [];

      this.products = products.map((s: any) => {
        // Log ALL fields for debugging
        console.log(`[IAP] RAW PRODUCT ${s.productId || s.id}:`, JSON.stringify(s, null, 2).substring(0, 2000));

        let introAmount: string | undefined;

        // 1. Cross-platform subscriptionOffers (v14 preferred)
        if (!introAmount && s.subscriptionOffers) {
          const offers = Array.isArray(s.subscriptionOffers) ? s.subscriptionOffers : [];
          const introOffer = offers.find((o: any) => o.type === 'introductory' || o.type === 'Introductory');
          if (introOffer?.price != null) {
            introAmount = String(introOffer.price);
          }
        }

        // 2. subscriptionInfoIOS.introductoryOffer
        if (!introAmount && s.subscriptionInfoIOS?.introductoryOffer) {
          const offer = s.subscriptionInfoIOS.introductoryOffer;
          if (offer.price != null) {
            introAmount = String(offer.price);
          }
        }

        // 3. Direct iOS fields
        if (!introAmount && s.introductoryPriceAsAmountIOS != null) {
          introAmount = String(s.introductoryPriceAsAmountIOS);
        } else if (!introAmount && s.introductoryPriceIOS) {
          const match = s.introductoryPriceIOS.match(/[\d,.]+/);
          introAmount = match ? match[0].replace(',', '.') : undefined;
        }

        // 4. discountsIOS (already parsed by bridge)
        if (!introAmount && s.discountsIOS) {
          const discounts = Array.isArray(s.discountsIOS) ? s.discountsIOS : (() => { try { return JSON.parse(s.discountsIOS); } catch { return null; } })();
          if (discounts?.[0]?.price != null) {
            introAmount = String(discounts[0].price);
          }
        }

        // 5. Legacy field names
        if (!introAmount && s.introductoryPrice) {
          introAmount = String(s.introductoryPrice);
        }

        console.log(`[IAP] ${s.productId || s.id}: introAmount=${introAmount}`);

        return {
          productId: s.productId || s.id,
          localizedPrice: s.localizedPrice || s.displayPrice || s.price || '',
          title: s.title || s.displayName || '',
          description: s.description || '',
          currency: s.currency || '',
          price: s.price != null ? String(s.price) : (s.displayPrice || ''),
          introductoryPrice: introAmount,
          introductoryPricePaymentMode: s.introductoryPricePaymentModeIOS || undefined,
          introductoryPriceNumberOfPeriods: s.introductoryPriceNumberOfPeriodsIOS ? Number(s.introductoryPriceNumberOfPeriodsIOS) : undefined,
          introductoryPriceSubscriptionPeriod: s.introductoryPriceSubscriptionPeriodIOS || undefined,
        };
      });
      return this.products;
    } catch (err) {
      console.error('[IAP] Failed to fetch subscriptions:', err);
      return [];
    }
  }

  async requestPurchase(
    productId: string,
    callbacks: { onComplete: (plan: string) => void; onError: (error: IAPError) => void },
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const iap = await getIap();
    if (!iap) {
      Alert.alert(i18next.t('common:error'), i18next.t('common:iapUnavailable'));
      callbacks.onError('not_available');
      return;
    }

    if (!this.initialized) {
      Alert.alert(i18next.t('common:error'), i18next.t('common:iapConnectionError'));
      callbacks.onError('not_available');
      return;
    }

    this.onPurchaseComplete = callbacks.onComplete;
    this.onPurchaseError = callbacks.onError;
    this.pendingProductId = productId;

    try {
      console.log('[IAP] Requesting purchase:', productId);
      tracciaAcquistoAvviato(productId);
      await iap.requestPurchase({ request: { apple: { sku: productId } }, type: 'subs' });
    } catch (err: any) {
      console.error('[IAP] requestPurchase catch:', err);
      if (err.code === 'user-cancelled' || err.code === 'E_USER_CANCELLED') {
        callbacks.onError('cancelled');
      } else {
        callbacks.onError('unknown');
      }
    }
  }

  async restorePurchases(): Promise<{ success: boolean; plan?: string }> {
    if (!this.initialized) {
      await this.initialize();
    }

    const iap = await getIap();
    if (!iap) return { success: false };

    try {
      const purchases = await iap.getAvailablePurchases();

      if (!purchases || purchases.length === 0) {
        return { success: true, plan: 'free' };
      }

      const latest = purchases.sort(
        (a: any, b: any) => (b.transactionDate || 0) - (a.transactionDate || 0),
      )[0] as any;

      if (latest.transactionId) {
        const result = await this.verifyOnServer(latest.transactionId);
        return { success: result.success, plan: result.plan };
      }

      return { success: false };
    } catch (err) {
      console.error('[IAP] Restore failed:', err);
      return { success: false };
    }
  }

  private async verifyOnServer(transactionId: string, productId?: string): Promise<{ success: boolean; plan: string }> {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${config.apiUrl}/iap/verify-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ transactionId, productId }),
    });

    if (!response.ok) throw new Error(`Verify failed: ${response.status}`);
    return response.json();
  }

  async cleanup(): Promise<void> {
    const iap = await getIap();
    if (!iap) return;

    this.purchaseUpdateSub?.remove();
    this.purchaseErrorSub?.remove();
    this.purchaseUpdateSub = null;
    this.purchaseErrorSub = null;

    try { await iap.endConnection(); } catch {}
    this.initialized = false;
    this.products = [];
  }
}

export const iapService = new IAPService();
