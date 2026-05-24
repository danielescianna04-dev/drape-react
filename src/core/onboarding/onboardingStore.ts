import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY_PREFIX = '@bynot_onboarding_v3_';
const OLD_KEY_PREFIX_V2 = '@bynot_onboarding_v2_';
const OLD_GLOBAL_KEY = '@bynot_onboarding_v2';
const OLD_TUTORIAL_KEY = '@bynot_tutorial_completed';

export interface OnboardingStep {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'createProject',
    titleKey: 'tutorial.createNew',
    descriptionKey: 'tutorial.createNewDesc',
    icon: 'add',
  },
  {
    id: 'importGithub',
    titleKey: 'tutorial.importGithub',
    descriptionKey: 'tutorial.importGithubDesc',
    icon: 'logo-github',
  },
];

interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChatFeature {
  titleKey: string;
  descriptionKey: string;
  icon: string;
}

export const CHAT_FEATURES: ChatFeature[] = [
  {
    titleKey: 'tutorial.talkToAI',
    descriptionKey: 'tutorial.talkToAIDesc',
    icon: 'chatbubble-ellipses',
  },
  {
    titleKey: 'tutorial.livePreview',
    descriptionKey: 'tutorial.livePreviewDesc',
    icon: 'eye',
  },
  {
    titleKey: 'tutorial.exploreFiles',
    descriptionKey: 'tutorial.exploreFilesDesc',
    icon: 'folder-open',
  },
];

interface OnboardingState {
  isActive: boolean;
  currentStepIndex: number;
  targetRect: TargetRect | null;
  isLoaded: boolean;
  userId: string | null;
  completed: boolean;
  chatWelcomeSeen: boolean;

  initialize: (userId: string) => Promise<void>;
  start: () => void;
  advanceStep: () => void;
  skipOnboarding: () => void;
  setTargetRect: (rect: TargetRect | null) => void;
  dismissChatWelcome: () => void;
}

const getKey = (userId: string) =>
  `${ONBOARDING_KEY_PREFIX}${userId}_home`;

const getChatKey = (userId: string) =>
  `${ONBOARDING_KEY_PREFIX}${userId}_chat_welcome`;

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  isActive: false,
  currentStepIndex: 0,
  targetRect: null,
  isLoaded: false,
  userId: null,
  completed: false,
  chatWelcomeSeen: false,

  initialize: async (userId: string) => {
    set({ userId });

    try {
      const key = getKey(userId);
      const chatKey = getChatKey(userId);
      const [done, chatDone] = await Promise.all([
        AsyncStorage.getItem(key),
        AsyncStorage.getItem(chatKey),
      ]);

      // Migration: check old keys
      if (!done) {
        const [oldV2, oldGlobal, oldTutorial] = await Promise.all([
          AsyncStorage.getItem(`${OLD_KEY_PREFIX_V2}${userId}`),
          AsyncStorage.getItem(OLD_GLOBAL_KEY),
          AsyncStorage.getItem(OLD_TUTORIAL_KEY),
        ]);
        if (oldV2 || oldGlobal || oldTutorial) {
          await Promise.all([
            AsyncStorage.setItem(key, 'true'),
            AsyncStorage.setItem(chatKey, 'true'),
          ]);
          set({ isLoaded: true, isActive: false, completed: true, chatWelcomeSeen: true });
          return;
        }
      }

      const completed = !!done;
      const chatWelcomeSeen = !!chatDone;
      set({ isLoaded: true, completed, chatWelcomeSeen });

      // Spotlight tutorial disabled — no longer needed
    } catch {
      set({ isLoaded: true });
    }
  },

  start: () => {
    if (get().completed) return;
    set({ isActive: true, currentStepIndex: 0, targetRect: null });
  },

  advanceStep: () => {
    const { currentStepIndex, userId } = get();
    const nextIndex = currentStepIndex + 1;

    if (nextIndex >= ONBOARDING_STEPS.length) {
      set({
        isActive: false,
        currentStepIndex: 0,
        targetRect: null,
        completed: true,
      });
      if (userId) {
        AsyncStorage.setItem(getKey(userId), 'true').catch(() => {});
      }
    } else {
      set({ currentStepIndex: nextIndex, targetRect: null });
    }
  },

  skipOnboarding: () => {
    const { userId } = get();
    set({
      isActive: false,
      currentStepIndex: 0,
      targetRect: null,
      completed: true,
    });
    if (userId) {
      AsyncStorage.setItem(getKey(userId), 'true').catch(() => {});
    }
  },

  dismissChatWelcome: () => {
    const { userId } = get();
    set({ chatWelcomeSeen: true });
    if (userId) {
      AsyncStorage.setItem(getChatKey(userId), 'true').catch(() => {});
    }
  },

  setTargetRect: (rect) => set({ targetRect: rect }),
}));
