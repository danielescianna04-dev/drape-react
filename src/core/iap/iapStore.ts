import { create } from 'zustand';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { iapService, IAPProduct, IAPError } from './iapService';
import { getProductId, PRODUCT_TO_PLAN } from './iapConstants';
import { useAuthStore } from '../auth/authStore';

interface IAPState {
  products: IAPProduct[];
  currentProductId: string | null;
  isLoadingProducts: boolean;
  isPurchasing: boolean;
  isRestoring: boolean;
  error: IAPError | null;

  initialize: () => Promise<void>;
  loadProducts: () => Promise<void>;
  purchase: (plan: 'go' | 'pro', cycle: 'monthly' | 'yearly') => Promise<void>;
  restorePurchases: () => Promise<void>;
  refreshPlan: () => Promise<void>;
  clearError: () => void;
}

export const useIAPStore = create<IAPState>((set, get) => ({
  products: [],
  currentProductId: null,
  isLoadingProducts: false,
  isPurchasing: false,
  isRestoring: false,
  error: null,

  initialize: async () => {
    await iapService.initialize();
    await get().refreshPlan();
    await get().loadProducts();
  },

  loadProducts: async () => {
    set({ isLoadingProducts: true });
    try {
      const products = await iapService.getProducts();
      set({ products, isLoadingProducts: false });
    } catch {
      set({ isLoadingProducts: false });
    }
  },

  purchase: async (plan, cycle) => {
    const productId = getProductId(plan, cycle);
    set({ isPurchasing: true, error: null });

    try {
      await iapService.requestPurchase(productId, {
        onComplete: async (resultPlan) => {
          // Update plan directly in authStore from the server response
          const user = useAuthStore.getState().user;
          if (user) {
            useAuthStore.setState({ user: { ...user, plan: resultPlan } });
          }
          set({ isPurchasing: false, currentProductId: productId });
        },
        onError: (error) => {
          if (error !== 'cancelled') {
            console.warn('[IAP] Purchase error:', error);
          }
          set({ isPurchasing: false, error });
        },
      });
    } catch (err: any) {
      console.error('[IAP] Purchase exception:', err.message);
      set({ isPurchasing: false, error: 'unknown' });
    }
  },

  restorePurchases: async () => {
    set({ isRestoring: true, error: null });
    try {
      const result = await iapService.restorePurchases();
      if (result.success && result.plan) {
        const user = useAuthStore.getState().user;
        if (user) {
          useAuthStore.setState({ user: { ...user, plan: result.plan } });
        }
      }
      set({ isRestoring: false });
    } catch {
      set({ isRestoring: false, error: 'unknown' });
    }
  },

  refreshPlan: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        const data = userDoc.data();
        const plan = data?.plan || 'starter';
        const productId = data?.subscription?.productId || null;
        useAuthStore.setState({ user: { ...user, plan } });
        set({ currentProductId: productId });
      }
    } catch (err) {
      console.warn('[IAP] Failed to refresh plan:', err);
    }
  },

  clearError: () => set({ error: null }),
}));
