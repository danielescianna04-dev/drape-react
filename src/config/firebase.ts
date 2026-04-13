import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import * as FirebaseAuth from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

const IS_DEV = process.env.EXPO_PUBLIC_ENV === 'development' || process.env.EXPO_PUBLIC_ENV === 'preview';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || (IS_DEV ? 'AIzaSyApLi3ZCoaJxE9PKV617LczwOGnffyHca4' : 'AIzaSyAJkZyI2b_77f8XWfP1anWdmWlaTotx930'),
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || (IS_DEV ? 'drape-dev.firebaseapp.com' : 'drapev2.firebaseapp.com'),
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || (IS_DEV ? 'drape-dev' : 'drapev2'),
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || (IS_DEV ? 'drape-dev.firebasestorage.app' : 'drapev2.firebasestorage.app'),
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || (IS_DEV ? '127888670449' : '76009555388'),
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || (IS_DEV ? '1:127888670449:web:d7de3fe78034aaa74b3350' : '1:76009555388:ios:2152442e43e04855ccd7b9'),
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

let auth;
try {
  const getReactNativePersistence = (FirebaseAuth as any).getReactNativePersistence;
  if (typeof getReactNativePersistence === 'function') {
    auth = FirebaseAuth.initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
  } else {
    auth = FirebaseAuth.getAuth(app);
  }
} catch {
  auth = FirebaseAuth.getAuth(app);
}

export { app, db, auth };
