import '@testing-library/jest-dom';
import { vi } from 'vitest';

// @testing-library/react has automatic cleanup enabled by default

// Mock AsyncStorage
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
}));

// Mock Expo modules
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

// Mock Firebase
vi.mock('../../config/firebase', () => ({
  db: {},
  auth: {},
}));

// Mock Reanimated
vi.mock('react-native-reanimated', () => ({
  useSharedValue: vi.fn(() => ({ value: 0 })),
  useAnimatedStyle: vi.fn(() => ({})),
  withSpring: vi.fn((value) => value),
  withTiming: vi.fn((value) => value),
}));
