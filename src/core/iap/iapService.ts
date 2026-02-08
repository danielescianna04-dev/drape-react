import { Platform, Alert } from 'react-native';
import { config } from '../../config/config';
import { getAuthHeaders } from '../api/getAuthToken';
import { ALL_PRODUCT_IDS } from './iapConstants';

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
              this.onPurchaseComplete?.(result.plan);
            } else {
              this.pendingProductId = null;
              this.onPurchaseError?.('unknown');
            }
          } catch (err) {
            console.error('[IAP] Verify failed:', err);
            this.pendingProductId = null;
            this.onPurchaseError?.('network');
          }
        }
      });

      this.purchaseErrorSub = iap.purchaseErrorListener((error: any) => {
        console.warn('[IAP] Purchase error:', JSON.stringify(error));
        if (error.code === 'user-cancelled' || error.code === 'E_USER_CANCELLED') {
          this.onPurchaseError?.('cancelled');
        } else {
          this.onPurchaseError?.('unknown');
        }
      });
    } catch (err) {
      console.error('[IAP] Init failed:', err);
    }
  }

  async getProducts(): Promise<IAPProduct[]> {
    if (this.products.length > 0) return this.products;

    if (!this.initialized) {
      await this.initialize();
    }

    const iap = await getIap();
    if (!iap) return [];

    try {
      // v14 API: fetchProducts for subscription products
      const products = await iap.fetchProducts({ skus: ALL_PRODUCT_IDS });
      console.log('[IAP] Fetched products:', products?.length);
      if (!products) return [];

      this.products = products.map((s: any) => ({
        productId: s.productId,
        localizedPrice: s.localizedPrice || s.price || '',
        title: s.title || '',
        description: s.description || '',
        currency: s.currency || '',
        price: s.price || '',
      }));
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
      Alert.alert('Errore', 'In-App Purchase non disponibile su questo dispositivo');
      callbacks.onError('not_available');
      return;
    }

    if (!this.initialized) {
      Alert.alert('Errore', 'Impossibile connettersi all\'App Store. Riprova.');
      callbacks.onError('not_available');
      return;
    }

    this.onPurchaseComplete = callbacks.onComplete;
    this.onPurchaseError = callbacks.onError;
    this.pendingProductId = productId;

    try {
      console.log('[IAP] Requesting purchase:', productId);
      await iap.requestPurchase({ request: { apple: { sku: productId } } });
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
