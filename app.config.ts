import { ExpoConfig, ConfigContext } from 'expo/config';

const IS_DEV = process.env.EXPO_PUBLIC_ENV === 'development' || process.env.EXPO_PUBLIC_ENV === 'preview';

const config: ExpoConfig = {
  name: IS_DEV ? 'Drape Dev' : 'Drape',
  slug: 'drape-react',
  version: '2.0.2',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  scheme: IS_DEV ? 'drape-dev' : 'drape',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#0A0A0C',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: IS_DEV ? 'com.drape.app.dev' : 'com.drape.app',
    infoPlist: {
      UIUserInterfaceStyle: 'Dark',
      NSPhotoLibraryUsageDescription: "L'app necessita di accedere alla tua galleria per caricare immagini nella chat.",
      NSPhotoLibraryAddUsageDescription: "L'app necessita di salvare immagini nella tua galleria.",
      NSCameraUsageDescription: "L'app necessita di accedere alla fotocamera per scattare foto da inviare nella chat.",
      NSMicrophoneUsageDescription: "L'app utilizza il microfono per dettare la descrizione del progetto.",
      NSSpeechRecognitionUsageDescription: "L'app utilizza il riconoscimento vocale per convertire la voce in testo.",
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ['remote-notification'],
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: false,
        NSAllowsLocalNetworking: true,
        NSAllowsArbitraryLoadsInWebContent: true,
        NSExceptionDomains: {
          'drape.info': {
            NSExceptionAllowsInsecureHTTPLoads: false,
            NSIncludesSubdomains: true,
          },
        },
      },
    },
    appleTeamId: '3699SN779P',
  },
  android: {
    package: IS_DEV ? 'com.drape.app.dev' : 'com.drape.app',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    permissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
    ],
  },
  web: {
    favicon: './assets/favicon.png',
  },
  extra: {
    eas: {
      projectId: 'ec6c855f-5325-47b4-8d13-982ba9a83a1c',
    },
  },
  runtimeVersion: '2.0.2',
  updates: {
    url: 'https://u.expo.dev/ec6c855f-5325-47b4-8d13-982ba9a83a1c',
    requestHeaders: {
      'expo-channel-name': IS_DEV ? 'preview' : 'production',
    },
  },
  owner: 'drape01',
  plugins: [
    'expo-web-browser',
    'expo-apple-authentication',
    [
      'expo-image-picker',
      {
        photosPermission: "L'app necessita di accedere alla tua galleria per caricare immagini nella chat.",
        cameraPermission: "L'app necessita di accedere alla fotocamera per scattare foto da inviare nella chat.",
      },
    ],
    'expo-media-library',
    [
      'expo-speech-recognition',
      {
        microphonePermission: "L'app utilizza il microfono per dettare la descrizione del progetto.",
        speechRecognitionPermission: "L'app utilizza il riconoscimento vocale per convertire la voce in testo.",
      },
    ],
    [
      'expo-build-properties',
      {
        ios: {
          useFrameworks: 'static',
        },
      },
    ],
    './plugins/withAllowHTTP.js',
    './plugins/withLiveActivity.js',
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#9B8AFF',
      },
    ],
  ],
};

export default config;
