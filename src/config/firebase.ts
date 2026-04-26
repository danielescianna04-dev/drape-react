import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import * as FirebaseAuth from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

const IS_DEV = process.env.EXPO_PUBLIC_ENV === 'development' || process.env.EXPO_PUBLIC_ENV === 'preview';

const DEV_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyApLi3ZCoaJxE9PKV617LczwOGnffyHca4',
  authDomain: 'drape-dev.firebaseapp.com',
  projectId: 'drape-dev',
  storageBucket: 'drape-dev.firebasestorage.app',
  messagingSenderId: '127888670449',
  appId: '1:127888670449:web:d7de3fe78034aaa74b3350',
};

const PROD_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCcqg1ys35IXuUhWfv369TJlL4_EXpPWvg',
  authDomain: 'drapev2.firebaseapp.com',
  projectId: 'drapev2',
  storageBucket: 'drapev2.firebasestorage.app',
  messagingSenderId: '76009555388',
  appId: '1:76009555388:web:09793732ba27903dccd7b9',
};

// Do not read EXPO_PUBLIC_FIREBASE_* from .env here: local .env is often prod,
// while dev builds must always point at the isolated drape-dev project.
const firebaseConfig = IS_DEV ? DEV_FIREBASE_CONFIG : PROD_FIREBASE_CONFIG;

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
