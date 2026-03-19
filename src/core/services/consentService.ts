import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const CONSENT_STORAGE_KEY = '@drape_gdpr_consent';

export interface ConsentState {
  analytics: boolean;
  pushNotifications: boolean;
  presenceTracking: boolean;
}

export interface ConsentStoreState {
  consent: ConsentState | null;
  hasLoaded: boolean;
  loadConsent: () => Promise<void>;
  setConsent: (consent: ConsentState) => Promise<void>;
  acceptAll: () => Promise<void>;
  /** Returns true only when the required consent is fully granted */
  hasGivenConsent: () => boolean;
}

export function isConsentComplete(consent: ConsentState | null | undefined): consent is ConsentState {
  return !!consent && consent.analytics && consent.pushNotifications && consent.presenceTracking;
}

export const useConsentStore = create<ConsentStoreState>((set, get) => ({
  consent: null,
  hasLoaded: false,

  loadConsent: async () => {
    try {
      const stored = await AsyncStorage.getItem(CONSENT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ConsentState;
        set({ consent: parsed, hasLoaded: true });
      } else {
        set({ hasLoaded: true });
      }
    } catch (error) {
      console.warn('[ConsentService] Failed to load consent:', error);
      set({ hasLoaded: true });
    }
  },

  setConsent: async (consent: ConsentState) => {
    try {
      await AsyncStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent));
      set({ consent });
    } catch (error) {
      console.warn('[ConsentService] Failed to save consent:', error);
    }
  },

  acceptAll: async () => {
    const consent: ConsentState = {
      analytics: true,
      pushNotifications: true,
      presenceTracking: true,
    };
    await get().setConsent(consent);
  },

  hasGivenConsent: () => {
    return isConsentComplete(get().consent);
  },
}));

// Standalone helper functions for use outside React components

export async function getConsent(): Promise<ConsentState | null> {
  const state = useConsentStore.getState();
  if (state.hasLoaded) return state.consent;
  // If store hasn't loaded yet, read directly from AsyncStorage
  try {
    const stored = await AsyncStorage.getItem(CONSENT_STORAGE_KEY);
    if (stored) return JSON.parse(stored) as ConsentState;
    return null;
  } catch {
    return null;
  }
}

export function getConsentSync(): ConsentState | null {
  return useConsentStore.getState().consent;
}

export async function setConsent(consent: ConsentState): Promise<void> {
  return useConsentStore.getState().setConsent(consent);
}

export function hasGivenConsent(): boolean {
  return useConsentStore.getState().hasGivenConsent();
}

/** Check if a specific consent category is granted.
 *  When consent has not been set yet (no GDPR screen shown), default to true (opt-out model).
 *  Once the consent screen is available and the user makes a choice, their preference is respected. */
export function isConsentGranted(category: keyof ConsentState): boolean {
  const consent = useConsentStore.getState().consent;
  if (!consent) return true;
  return consent[category] === true;
}
