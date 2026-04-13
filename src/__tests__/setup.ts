import '@testing-library/jest-dom';
import { vi } from 'vitest';
import React from 'react';

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

// Mock react-native enough for store/hook imports in web-based vitest runs
vi.mock('react-native', () => {
  const makeComponent = (tag: string) =>
    React.forwardRef<any, any>((props, ref) =>
      React.createElement(tag, { ...props, ref }, props.children)
    );

  return {
    Alert: { alert: vi.fn() },
    AppState: {
      currentState: 'active',
      addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
    Platform: {
      OS: 'ios',
      select: (options: Record<string, any>) => options.ios ?? options.default,
    },
    Dimensions: {
      get: vi.fn(() => ({ width: 390, height: 844 })),
    },
    View: makeComponent('div'),
    Text: makeComponent('span'),
    TouchableOpacity: makeComponent('button'),
    TextInput: makeComponent('input'),
    Modal: makeComponent('div'),
    ScrollView: makeComponent('div'),
    ActivityIndicator: makeComponent('div'),
    StyleSheet: {
      create: <T>(styles: T) => styles,
      absoluteFillObject: {},
    },
  };
});

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
