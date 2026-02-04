/**
 * Language Store
 * Zustand store for managing language preference
 */

import { create } from 'zustand';
import { setLanguage, loadLanguage, getCurrentLanguage, LanguageCode } from './index';

interface LanguageState {
  // Current language
  language: LanguageCode;
  isInitialized: boolean;

  // Actions
  setLanguage: (lang: LanguageCode) => Promise<void>;
  initialize: () => Promise<void>;
}

export const useLanguageStore = create<LanguageState>((set) => ({
  language: 'it',
  isInitialized: false,

  /**
   * Change language and persist
   */
  setLanguage: async (lang: LanguageCode) => {
    await setLanguage(lang);
    set({ language: lang });
  },

  /**
   * Initialize language from storage or device
   */
  initialize: async () => {
    const lang = await loadLanguage();
    set({ language: lang, isInitialized: true });
  },
}));

// Selector for current language
export const selectLanguage = (state: LanguageState) => state.language;
export const selectIsInitialized = (state: LanguageState) => state.isInitialized;
