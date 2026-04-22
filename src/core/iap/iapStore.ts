import { create } from 'zustand';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { iapService, IAPProduct, IAPError } from './iapService';
import { getProductId, PRODUCT_TO_PLAN } from './iapConstants';
import { useAuthStore } from '../auth/authStore';

type AppPlan = 'free' | 'go' | 'pro' | 'team';

interface IAPState {
  products: IAPProduct[];
  currentProductId: string | null;
  isLoadingProducts: boolean;
  isPurchasing: boolean;
  isRestoring: boolean;
  error: IAPError | null;
  showCelebration: boolean;
  celebrationPlan: string | null;

  initialize: () => Promise<void>;
  loadProducts: (forceRefresh?: boolean) => Promise<void>;
  purchase: (plan: 'go' | 'pro', cycle: 'monthly' | 'yearly') => Promise<void>;
  restorePurchases: () => Promise<{ success: boolean; plan?: string }>;
  refreshPlan: () => Promise<void>;
  clearError: () => void;
  closeCelebration: () => void;
}

export const useIAPStore = create<IAPState>((set, get) => ({
  products: [],
  currentProductId: null,
  isLoadingProducts: false,
  isPurchasing: false,
  isRestoring: false,
  error: null,
  showCelebration: false,
  celebrationPlan: null,

  initialize: async () => {
    await iapService.initialize();
    await get().refreshPlan();
    await get().loadProducts();
  },

  loadProducts: async (forceRefresh = false) => {
    set({ isLoadingProducts: true });
    try {
      const products = await iapService.getProducts(forceRefresh);
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
          const normalizedPlan = resultPlan as AppPlan;
          // Update plan directly in authStore from the server response
          const user = useAuthStore.getState().user;
          if (user) {
            useAuthStore.setState({ user: { ...user, plan: normalizedPlan } });
          }
          set({ isPurchasing: false, currentProductId: productId, showCelebration: true, celebrationPlan: normalizedPlan });
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
      if (result.success && result.plan && result.plan !== 'free') {
        const normalizedPlan = result.plan as AppPlan;
        const user = useAuthStore.getState().user;
        if (user) {
          useAuthStore.setState({ user: { ...user, plan: normalizedPlan } });
        }
      }
      set({ isRestoring: false });
      return result;
    } catch {
      set({ isRestoring: false, error: 'unknown' });
      return { success: false };
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
        const rawPlan = typeof data?.plan === 'string' ? data.plan.toLowerCase() : 'free';
        // Legacy: 'starter' → 'free'. 'team' preserved (treated as Pro by entitlements).
        const plan = (rawPlan === 'starter' ? 'free' : rawPlan) as AppPlan;
        const productId = data?.subscription?.productId || null;
        const expiresAt = data?.subscription?.expiresAt || null;
        const isActive = data?.subscription?.isActive;
        useAuthStore.setState({
          user: {
            ...user,
            plan,
            subscription: productId ? { productId, expiresAt, isActive } : undefined,
          },
        });
        set({ currentProductId: productId });
      }
    } catch (err) {
      console.warn('[IAP] Failed to refresh plan:', err);
    }
  },

  clearError: () => set({ error: null }),
  closeCelebration: () => set({ showCelebration: false, celebrationPlan: null }),
}));
