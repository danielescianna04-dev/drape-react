/**
 * i18n Configuration
 * Internationalization setup for Italian and English
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import Italian translations using require for Metro bundler compatibility
const it_common = require('./locales/it/common.json');
const it_settings = require('./locales/it/settings.json');
const it_projects = require('./locales/it/projects.json');
const it_terminal = require('./locales/it/terminal.json');
const it_errors = require('./locales/it/errors.json');
const it_auth = require('./locales/it/auth.json');

// Import English translations
const en_common = require('./locales/en/common.json');
const en_settings = require('./locales/en/settings.json');
const en_projects = require('./locales/en/projects.json');
const en_terminal = require('./locales/en/terminal.json');
const en_errors = require('./locales/en/errors.json');
const en_auth = require('./locales/en/auth.json');

// Supported languages
export const LANGUAGES = {
  it: { nativeName: 'Italiano', flag: '🇮🇹' },
  en: { nativeName: 'English', flag: '🇬🇧' },
} as const;

export type LanguageCode = keyof typeof LANGUAGES;

// Storage key for persisted language preference
const LANGUAGE_STORAGE_KEY = '@drape/language';

// Resources object with all translations
const resources = {
  it: {
    common: it_common,
    settings: it_settings,
    projects: it_projects,
    terminal: it_terminal,
    errors: it_errors,
    auth: it_auth,
  },
  en: {
    common: en_common,
    settings: en_settings,
    projects: en_projects,
    terminal: en_terminal,
    errors: en_errors,
    auth: en_auth,
  },
};

/**
 * Detect device language, fallback to Italian
 */
const getDeviceLanguage = (): LanguageCode => {
  const deviceLang = Localization.getLocales()[0]?.languageCode;
  return deviceLang === 'it' ? 'it' : 'en'; // Italian only if device is Italian, otherwise English
};

// Initialize i18next
i18n.use(initReactI18next).init({
  resources,
  lng: getDeviceLanguage(),
  fallbackLng: 'it',
  defaultNS: 'common',
  ns: ['common', 'settings', 'projects', 'terminal', 'errors', 'auth'],
  interpolation: {
    escapeValue: false, // React already escapes
  },
  react: {
    useSuspense: false, // For React Native compatibility
  },
});

/**
 * Change language and persist to AsyncStorage
 */
export const setLanguage = async (lang: LanguageCode): Promise<void> => {
  await i18n.changeLanguage(lang);
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch (error) {
    console.warn('[i18n] Failed to persist language preference:', error);
  }
};

/**
 * Load persisted language preference from AsyncStorage
 */
export const loadLanguage = async (): Promise<LanguageCode> => {
  try {
    const storedLang = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (storedLang === 'it' || storedLang === 'en') {
      await i18n.changeLanguage(storedLang);
      return storedLang;
    }
  } catch (error) {
    console.warn('[i18n] Failed to load language preference:', error);
  }
  return i18n.language as LanguageCode;
};

/**
 * Get current language
 */
export const getCurrentLanguage = (): LanguageCode => {
  return i18n.language as LanguageCode;
};

export default i18n;
