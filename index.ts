// Polyfills required by @ai-sdk/react on React Native — must be imported
// before any AI SDK code is evaluated (see ai-sdk Expo guide).
import structuredClone from '@ungap/structured-clone';
import '@stardazed/streams-text-encoding';

if (typeof (globalThis as any).structuredClone !== 'function') {
  (globalThis as any).structuredClone = structuredClone;
}

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
