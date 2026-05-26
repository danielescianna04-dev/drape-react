// v2 stub: IAP non in scope per il lancio (Bynot è free, vedi piano sez. 10).
// TODO post-PMF: integrare RevenueCat o reintrodurre IAP nativa.

import { create } from 'zustand';
import type { IAPProduct, IAPError } from './iapService';

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

export const useIAPStore = create<IAPState>((set) => ({
  products: [],
  currentProductId: null,
  isLoadingProducts: false,
  isPurchasing: false,
  isRestoring: false,
  error: null,
  showCelebration: false,
  celebrationPlan: null,

  async initialize() {
    // v2 stub
  },
  async loadProducts(_forceRefresh?: boolean) {
    set({ products: [] });
  },
  async purchase(_plan, _cycle) {
    set({ error: { code: 'NOT_IMPLEMENTED', message: 'IAP non disponibile in v2' } as unknown as IAPError });
  },
  async restorePurchases() {
    return { success: false };
  },
  async refreshPlan() {
    // v2 stub: plan resta 'free' per tutti
  },
  clearError() {
    set({ error: null });
  },
  closeCelebration() {
    set({ showCelebration: false, celebrationPlan: null });
  },
}));
