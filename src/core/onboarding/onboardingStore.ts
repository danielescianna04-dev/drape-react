import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY_PREFIX = '@drape_onboarding_v2_';
const OLD_GLOBAL_KEY = '@drape_onboarding_v2'; // Legacy global key (not per-user)
const OLD_TUTORIAL_KEY = '@drape_tutorial_completed';

export interface OnboardingStep {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: string;
  screen: 'home' | 'chat';
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'createProject',
    titleKey: 'tutorial.createNew',
    descriptionKey: 'tutorial.createNewDesc',
    icon: 'add',
    screen: 'home',
  },
  {
    id: 'importGithub',
    titleKey: 'tutorial.importGithub',
    descriptionKey: 'tutorial.importGithubDesc',
    icon: 'logo-github',
    screen: 'home',
  },
  {
    id: 'talkToAI',
    titleKey: 'tutorial.talkToAI',
    descriptionKey: 'tutorial.talkToAIDesc',
    icon: 'chatbubble-ellipses',
    screen: 'chat',
  },
  {
    id: 'livePreview',
    titleKey: 'tutorial.livePreview',
    descriptionKey: 'tutorial.livePreviewDesc',
    icon: 'eye',
    screen: 'chat',
  },
  {
    id: 'exploreFiles',
    titleKey: 'tutorial.exploreFiles',
    descriptionKey: 'tutorial.exploreFilesDesc',
    icon: 'folder-open',
    screen: 'chat',
  },
];

interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OnboardingState {
  isActive: boolean;
  currentStep: number;
  targetRect: TargetRect | null;
  isLoaded: boolean;
  userId: string | null;

  initialize: (userId: string) => Promise<void>;
  startOnboarding: () => void;
  advanceStep: () => void;
  skipOnboarding: () => void;
  completeOnboarding: () => void;
  setTargetRect: (rect: TargetRect | null) => void;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  isActive: false,
  currentStep: 0,
  targetRect: null,
  isLoaded: false,
  userId: null,

  initialize: async (userId: string) => {
    const key = `${ONBOARDING_KEY_PREFIX}${userId}`;
    set({ userId });

    try {
      // Check if onboarding was completed for THIS user
      const completed = await AsyncStorage.getItem(key);
      if (completed) {
        set({ isLoaded: true, isActive: false });
        return;
      }

      // Migration: check old global key (pre per-user) or old tutorial key
      const [oldGlobal, oldTutorial] = await Promise.all([
        AsyncStorage.getItem(OLD_GLOBAL_KEY),
        AsyncStorage.getItem(OLD_TUTORIAL_KEY),
      ]);
      if (oldGlobal || oldTutorial) {
        await AsyncStorage.setItem(key, 'true');
        set({ isLoaded: true, isActive: false });
        return;
      }

      // New user — show onboarding after a short delay
      set({ isLoaded: true });
      setTimeout(() => {
        set({ isActive: true, currentStep: 0 });
      }, 1000);
    } catch {
      set({ isLoaded: true });
    }
  },

  startOnboarding: () => set({ isActive: true, currentStep: 0 }),

  advanceStep: () => {
    const { currentStep } = get();
    const nextStep = currentStep + 1;
    if (nextStep >= ONBOARDING_STEPS.length) {
      get().completeOnboarding();
    } else {
      set({ currentStep: nextStep, targetRect: null });
    }
  },

  skipOnboarding: () => {
    const { userId } = get();
    set({ isActive: false, currentStep: 0, targetRect: null });
    if (userId) {
      AsyncStorage.setItem(`${ONBOARDING_KEY_PREFIX}${userId}`, 'true').catch(() => {});
    }
  },

  completeOnboarding: () => {
    const { userId } = get();
    set({ isActive: false, currentStep: 0, targetRect: null });
    if (userId) {
      AsyncStorage.setItem(`${ONBOARDING_KEY_PREFIX}${userId}`, 'true').catch(() => {});
    }
  },

  setTargetRect: (rect) => set({ targetRect: rect }),
}));
