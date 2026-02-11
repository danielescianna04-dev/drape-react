import { create } from 'zustand';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  deleteUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
  User,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import { doc, setDoc, getDoc, getDocs, deleteDoc, collection, query, where, serverTimestamp } from 'firebase/firestore';
import { AppState } from 'react-native';
import { auth, db } from '../../config/firebase';
import { useTerminalStore } from '../terminal/terminalStore';
import { useProjectStore } from '../projects/projectStore';
import { useTabStore } from '../tabs/tabStore';
import { gitAccountService } from '../git/gitAccountService';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { pushNotificationService } from '../services/pushNotificationService';
import { deviceService } from '../services/deviceService';
import { Alert } from 'react-native';
import i18n from '../../i18n';
import { config } from '../../config/config';

// Track previous user ID to detect user changes
let previousUserId: string | null = null;

// Presence tracking cleanup function
let presenceCleanup: (() => void) | null = null;

/**
 * Start presence tracking for admin dashboard
 * Writes to Firestore 'presence/{userId}' collection
 * Backend considers user online if lastSeen < 2 minutes ago
 */
function startPresenceTracking(userId: string) {
  const presenceRef = doc(db, 'presence', userId);
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  const startHeartbeat = () => {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
      setDoc(presenceRef, { lastSeen: serverTimestamp() }, { merge: true })
        .catch((err) => console.warn('[Auth] Failed to update presence:', err?.message || err));
    }, 30000);
  };

  const stopHeartbeat = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  };

  // Write initial presence with sessionStart
  setDoc(presenceRef, {
    lastSeen: serverTimestamp(),
    sessionStart: serverTimestamp(),
    email: auth.currentUser?.email || ''
  }).catch(err => console.warn('[Presence] Failed to set presence:', err));

  startHeartbeat();

  // Handle app state changes (background/inactive)
  const appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'background' || state === 'inactive') {
      // Stop heartbeat only — lastSeen becomes stale, backend sees user as offline after 2 min
      stopHeartbeat();
    } else if (state === 'active') {
      // Re-establish presence and restart heartbeat
      setDoc(presenceRef, {
        lastSeen: serverTimestamp(),
        sessionStart: serverTimestamp(),
        email: auth.currentUser?.email || ''
      }).catch((err) => console.warn('[Auth] Failed to restore presence on active:', err?.message || err));
      startHeartbeat();

      // Refresh subscription plan on foreground (catches renewals/cancellations while backgrounded)
      import('../iap/iapStore').then(({ useIAPStore }) => {
        useIAPStore.getState().refreshPlan();
      }).catch(() => {});
    }
  });

  // Return cleanup for logout
  return () => {
    stopHeartbeat();
    appStateSubscription.remove();
  };
}

/**
 * Stop presence tracking on logout — deletes the presence document
 */
function stopPresenceTracking(userId: string) {
  if (presenceCleanup) {
    presenceCleanup();
    presenceCleanup = null;
  }
  deleteDoc(doc(db, 'presence', userId)).catch((err) => console.warn('[Auth] Failed to delete presence:', err?.message || err));
}

export interface DrapeUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  createdAt: Date;
  plan?: 'free' | 'go' | 'pro' | 'team';
}

interface AuthState {
  user: DrapeUser | null;
  isLoading: boolean;
  isInitialized: boolean;
  isNewUser: boolean;
  error: string | null;
  deviceCheckFailed: boolean; // True if logged out due to another device

  // Actions
  initialize: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signInWithApple: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: (password?: string) => Promise<void>;
  resendVerificationEmail: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
  clearError: () => void;
  checkDeviceAccess: () => Promise<boolean>;
}

const mapFirebaseUser = (firebaseUser: User): DrapeUser => ({
  uid: firebaseUser.uid,
  email: firebaseUser.email,
  displayName: firebaseUser.displayName,
  photoURL: firebaseUser.photoURL,
  createdAt: new Date(firebaseUser.metadata.creationTime || Date.now()),
  plan: 'free', // Default plan, will be overwritten by Firestore data
});

/**
 * Load the user's plan from Firestore 'users/{uid}' document.
 * Returns the plan string or 'free' as default.
 */
type PlanId = 'free' | 'go' | 'pro' | 'team';
const VALID_PLANS: PlanId[] = ['free', 'go', 'pro', 'team'];

const loadUserPlanFromFirestore = async (uid: string): Promise<PlanId> => {
  try {
    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      const data = userDoc.data();
      const plan = data?.plan;
      if (plan && VALID_PLANS.includes(plan)) return plan as PlanId;
    }
    return 'free';
  } catch (error) {
    console.warn('[AuthStore] Failed to load user plan from Firestore:', error);
    return 'free';
  }
};

// Flag to prevent onAuthStateChanged from processing during signUp
let isSigningUp = false;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: false,
  isInitialized: false,
  isNewUser: false,
  error: null,
  deviceCheckFailed: false,

  initialize: () => {

    onAuthStateChanged(auth, async (firebaseUser) => {
      // Skip processing during signUp flow to avoid race condition
      if (isSigningUp) return;

      const newUserId = firebaseUser?.uid || null;
      const userChanged = previousUserId !== null && previousUserId !== newUserId;

      // Detect user change (switching accounts)
      if (userChanged) {

        // Reset tabs to default state
        useTabStore.getState().resetTabs();

        // Reset terminal store state (workstations, chats, etc.)
        useTerminalStore.setState({
          currentWorkstation: null,
          workstations: [],
          chatHistory: [],
          globalTerminalLog: [],
        });
      }

      // Update previous user ID tracker
      previousUserId = newUserId;

      if (firebaseUser) {
        // Block unverified email/password users
        const isEmailProvider = firebaseUser.providerData.some(p => p.providerId === 'password');
        if (isEmailProvider && !firebaseUser.emailVerified) {
          await signOut(auth);
          set({ user: null, isInitialized: true, isLoading: false });
          return;
        }

        // Check if this device is the active device
        const isActive = await deviceService.isActiveDevice(firebaseUser.uid);

        if (!isActive) {
          set({ deviceCheckFailed: true, isInitialized: true, isLoading: false });

          // Show alert and sign out
          Alert.alert(
            i18n.t('auth:errors.sessionTerminated'),
            i18n.t('auth:errors.multipleDevices'),
            [{ text: 'OK', onPress: () => signOut(auth) }]
          );
          return;
        }

        const drapeUser = mapFirebaseUser(firebaseUser);

        // Load the user's actual plan from Firestore
        const userPlan = await loadUserPlanFromFirestore(firebaseUser.uid);
        drapeUser.plan = userPlan;

        set({ user: drapeUser, isInitialized: true, isLoading: false, deviceCheckFailed: false });

        // Update terminalStore userId
        useTerminalStore.setState({ userId: firebaseUser.uid });

        // Update projectStore userId and reload projects for this user
        useProjectStore.getState().setUserId(firebaseUser.uid);
        useProjectStore.getState().loadUserProjects();

        // Sync Git accounts from Firebase (for cross-device access)
        gitAccountService.syncFromFirebase(firebaseUser.uid).catch(err => {
          console.warn('⚠️ Could not sync Git accounts:', err);
        });

        // Initialize push notifications (non-blocking)
        pushNotificationService.initialize(firebaseUser.uid).catch((err) => console.warn('[Auth] Failed to initialize push notifications:', err?.message || err));

        // Initialize IAP (non-blocking)
        import('../iap/iapStore').then(({ useIAPStore }) => {
          useIAPStore.getState().initialize();
        }).catch(err => console.warn('[Auth] IAP init failed:', err));

        // Start presence tracking for admin dashboard
        if (presenceCleanup) presenceCleanup(); // Clean up any existing
        presenceCleanup = startPresenceTracking(firebaseUser.uid);
      } else {
        // Stop presence tracking if active
        if (presenceCleanup) {
          presenceCleanup();
          presenceCleanup = null;
        }

        set({ user: null, isInitialized: true, isLoading: false });
        useTerminalStore.setState({ userId: null });

        // Clear projects on logout
        useProjectStore.setState({
          userId: 'default-user',
          projects: [],
          currentProject: null,
          currentWorkstationId: null
        });

        // Reset tabs when logging out
        useTabStore.getState().resetTabs();

        // Clear terminal store state
        useTerminalStore.setState({
          currentWorkstation: null,
          workstations: [],
          chatHistory: [],
          globalTerminalLog: [],
        });

      }
    });
  },

  signIn: async (email: string, password: string) => {
    set({ isLoading: true, error: null });

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      // Block login if email not verified (email/password users only)
      if (!userCredential.user.emailVerified) {
        await signOut(auth);
        set({ error: i18n.t('auth:emailVerification.notVerified'), isLoading: false });
        return;
      }

      const drapeUser = mapFirebaseUser(userCredential.user);

      // Load actual plan from Firestore
      drapeUser.plan = await loadUserPlanFromFirestore(userCredential.user.uid);

      set({ user: drapeUser, isLoading: false });
      useTerminalStore.setState({ userId: userCredential.user.uid });

      // Update projectStore and reload user's projects
      useProjectStore.getState().setUserId(userCredential.user.uid);
      useProjectStore.getState().loadUserProjects();

      // Register this device as the active device
      await deviceService.registerAsActiveDevice(userCredential.user.uid);

    } catch (error: any) {
      console.error('❌ [AuthStore] Sign in error:', error.code);

      let errorMessage = i18n.t('auth:errors.errorDuringLogin');
      switch (error.code) {
        case 'auth/invalid-email':
          errorMessage = i18n.t('auth:errors.invalidEmail');
          break;
        case 'auth/user-disabled':
          errorMessage = i18n.t('auth:errors.userDisabled');
          break;
        case 'auth/user-not-found':
          errorMessage = i18n.t('auth:errors.userNotFound');
          break;
        case 'auth/wrong-password':
          errorMessage = i18n.t('auth:errors.wrongPassword');
          break;
        case 'auth/invalid-credential':
          errorMessage = i18n.t('auth:errors.invalidCredentials');
          break;
        case 'auth/too-many-requests':
          errorMessage = i18n.t('auth:errors.tooManyRequests');
          break;
      }

      set({ error: errorMessage, isLoading: false });
      throw new Error(errorMessage);
    }
  },

  signUp: async (email: string, password: string, displayName: string) => {
    set({ isLoading: true, error: null });
    isSigningUp = true;

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      // Update profile with display name
      await updateProfile(userCredential.user, { displayName });

      // Create user document in Firestore (non-blocking — can be created later if it fails)
      setDoc(doc(db, 'users', userCredential.user.uid), {
        email,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(err => console.warn('[AuthStore] Firestore user doc creation deferred:', err.code));

      // Send verification email via backend (uses Resend for beautiful emails)
      fetch(`${config.apiUrl}/auth/send-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, displayName }),
      }).catch(err => console.warn('[AuthStore] Backend verification email failed, using fallback:', err));

      // Sign out — user must verify email before using the app
      await signOut(auth);

      isSigningUp = false;
      set({ isLoading: false });

    } catch (error: any) {
      isSigningUp = false;
      console.error('❌ [AuthStore] Sign up error:', error.code);

      let errorMessage = i18n.t('auth:errors.errorDuringRegistration');
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage = i18n.t('auth:errors.emailInUse');
          break;
        case 'auth/invalid-email':
          errorMessage = i18n.t('auth:errors.invalidEmail');
          break;
        case 'auth/operation-not-allowed':
          errorMessage = i18n.t('auth:errors.operationNotAllowed');
          break;
        case 'auth/weak-password':
          errorMessage = i18n.t('auth:errors.weakPassword');
          break;
      }

      set({ error: errorMessage, isLoading: false });
      throw new Error(errorMessage);
    }
  },

  logout: async () => {
    set({ isLoading: true, error: null });

    try {
      const { user } = get();

      // Reset tabs BEFORE signing out (so we have clean state for next user)
      useTabStore.getState().resetTabs();

      // Clear terminal store state
      useTerminalStore.setState({
        userId: null,
        currentWorkstation: null,
        workstations: [],
        chatHistory: [],
        globalTerminalLog: [],
      });

      // Clear projects
      useProjectStore.setState({
        userId: 'default-user',
        projects: [],
        currentProject: null,
        currentWorkstationId: null
      });

      // Unregister push notifications
      await pushNotificationService.unregisterToken().catch((err) => console.warn('[Auth] Failed to unregister push token:', err?.message || err));

      // Stop presence tracking
      if (user) {
        stopPresenceTracking(user.uid);
      }

      // Clear active device (only if not kicked by another device)
      if (user && !get().deviceCheckFailed) {
        await deviceService.clearActiveDevice(user.uid).catch((err) => console.warn('[Auth] Failed to clear active device:', err?.message || err));
      }

      // Sign out from Firebase
      await signOut(auth);
      set({ user: null, isLoading: false, deviceCheckFailed: false });

    } catch (error: any) {
      console.error('❌ [AuthStore] Logout error:', error);
      set({ error: i18n.t('auth:errors.errorDuringLogout'), isLoading: false });
      throw error;
    }
  },

  deleteAccount: async (password?: string) => {
    set({ isLoading: true, error: null });

    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error('Not authenticated');

      const uid = firebaseUser.uid;

      // Determine provider for re-authentication
      const isEmailProvider = firebaseUser.providerData.some(p => p.providerId === 'password');
      const isAppleProvider = firebaseUser.providerData.some(p => p.providerId === 'apple.com');
      const isGoogleProvider = firebaseUser.providerData.some(p => p.providerId === 'google.com');

      // Re-authenticate before deleting
      if (isEmailProvider) {
        if (!password) {
          set({ isLoading: false });
          throw new Error('password-required');
        }
        const credential = EmailAuthProvider.credential(firebaseUser.email!, password);
        await reauthenticateWithCredential(firebaseUser, credential);
      } else if (isAppleProvider) {
        const nonce = Math.random().toString(36).substring(2, 15);
        const hashedNonce = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          nonce
        );
        const appleCredential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
          nonce: hashedNonce,
        });
        if (!appleCredential.identityToken) throw new Error('Apple re-auth failed');
        const oauthCredential = new OAuthProvider('apple.com').credential({
          idToken: appleCredential.identityToken,
          rawNonce: nonce,
        });
        await reauthenticateWithCredential(firebaseUser, oauthCredential);
      } else if (isGoogleProvider) {
        // For Google, we throw a specific error so UI can trigger Google Sign-In flow
        set({ isLoading: false });
        throw new Error('google-reauth-required');
      }

      // 1. Delete all user data from Firestore
      try {
        const projectsQuery = query(collection(db, 'user_projects'), where('userId', '==', uid));
        const projectsSnap = await getDocs(projectsQuery);
        for (const d of projectsSnap.docs) {
          await deleteDoc(d.ref);
        }
      } catch (e) { console.warn('[DeleteAccount] Failed to delete user_projects:', e); }

      try {
        const gitAccountsSnap = await getDocs(collection(db, 'users', uid, 'git-accounts'));
        for (const d of gitAccountsSnap.docs) {
          await deleteDoc(d.ref);
        }
      } catch (e) { console.warn('[DeleteAccount] Failed to delete git-accounts:', e); }

      try { await deleteDoc(doc(db, 'user_configs', uid)); } catch (e) { /* ignore */ }
      try { await deleteDoc(doc(db, 'presence', uid)); } catch (e) { /* ignore */ }

      try {
        const sharedQuery = query(collection(db, 'shared-git-accounts'), where('addedBy', '==', uid));
        const sharedSnap = await getDocs(sharedQuery);
        for (const d of sharedSnap.docs) {
          await deleteDoc(d.ref);
        }
      } catch (e) { console.warn('[DeleteAccount] Failed to delete shared-git-accounts:', e); }

      try { await deleteDoc(doc(db, 'users', uid)); } catch (e) { /* ignore */ }

      // 2. Clean up local state (same as logout)
      useTabStore.getState().resetTabs();
      useTerminalStore.setState({
        userId: null,
        currentWorkstation: null,
        workstations: [],
        chatHistory: [],
        globalTerminalLog: [],
      });
      useProjectStore.setState({
        userId: 'default-user',
        projects: [],
        currentProject: null,
        currentWorkstationId: null,
      });

      // 3. Unregister push token
      await pushNotificationService.unregisterToken().catch(() => {});

      // 4. Stop presence tracking
      if (presenceCleanup) { presenceCleanup(); presenceCleanup = null; }

      // 5. Delete Firebase Auth user
      await deleteUser(firebaseUser);

      set({ user: null, isLoading: false, deviceCheckFailed: false });

    } catch (error: any) {
      console.error('[AuthStore] Delete account error:', error);

      if (error.message === 'password-required' || error.message === 'google-reauth-required') {
        set({ isLoading: false });
        throw error;
      }

      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        set({ isLoading: false });
        throw new Error('wrong-password');
      }

      if (error.code === 'ERR_CANCELED') {
        set({ isLoading: false });
        throw new Error('cancelled');
      }

      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  resendVerificationEmail: async (email: string, _password: string) => {
    try {
      const res = await fetch(`${config.apiUrl}/auth/send-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('Failed to resend verification email');
    } catch (error: any) {
      console.error('❌ [AuthStore] Resend verification error:', error.message);
      throw error;
    }
  },

  resetPassword: async (email: string) => {
    set({ isLoading: true, error: null });

    try {
      await sendPasswordResetEmail(auth, email);
      set({ isLoading: false });
    } catch (error: any) {
      console.error('❌ [AuthStore] Password reset error:', error.code);

      let errorMessage = i18n.t('auth:errors.errorDuringPasswordReset');
      switch (error.code) {
        case 'auth/invalid-email':
          errorMessage = i18n.t('auth:errors.invalidEmail');
          break;
        case 'auth/user-not-found':
          errorMessage = i18n.t('auth:errors.userNotFound');
          break;
      }

      set({ error: errorMessage, isLoading: false });
      throw new Error(errorMessage);
    }
  },

  updateDisplayName: async (name: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');
      await updateProfile(currentUser, { displayName: name });
      set({ user: { ...get().user!, displayName: name } });
    } catch (error: any) {
      console.error('[AuthStore] updateDisplayName error:', error.message);
    }
  },

  signInWithGoogle: async (idToken: string) => {
    set({ isLoading: true, error: null });

    try {
      const credential = GoogleAuthProvider.credential(idToken);
      const userCredential = await signInWithCredential(auth, credential);
      const drapeUser = mapFirebaseUser(userCredential.user);

      // Create/update user document in Firestore
      const userDocRef = doc(db, 'users', userCredential.user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          email: userCredential.user.email,
          displayName: userCredential.user.displayName,
          photoURL: userCredential.user.photoURL,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          provider: 'google',
        });
      } else {
        await setDoc(userDocRef, {
          updatedAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
        }, { merge: true });
      }

      const isNew = !userDoc.exists();

      // Load plan from Firestore user document (existing users have plan field)
      if (!isNew && userDoc.exists()) {
        const userData = userDoc.data();
        drapeUser.plan = (userData?.plan && VALID_PLANS.includes(userData.plan)) ? userData.plan as PlanId : 'free';
      }

      set({ user: drapeUser, isLoading: false, isNewUser: isNew });
      useTerminalStore.setState({ userId: userCredential.user.uid });

      // Update projectStore and reload user's projects
      useProjectStore.getState().setUserId(userCredential.user.uid);
      if (isNew) {
        useProjectStore.setState({ projects: [] });
      } else {
        useProjectStore.getState().loadUserProjects();
      }

      // Register this device as the active device
      await deviceService.registerAsActiveDevice(userCredential.user.uid);

    } catch (error: any) {
      console.error('❌ [AuthStore] Google sign in error:', error);
      const errorMessage = i18n.t('auth:errors.errorDuringGoogleSignIn');
      set({ error: errorMessage, isLoading: false });
      throw new Error(errorMessage);
    }
  },

  signInWithApple: async () => {
    set({ isLoading: true, error: null });

    try {

      // Generate nonce for security
      const nonce = Math.random().toString(36).substring(2, 15);
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        nonce
      );

      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      const { identityToken } = appleCredential;
      if (!identityToken) {
        throw new Error('No identity token received from Apple');
      }

      // Create Firebase credential
      const provider = new OAuthProvider('apple.com');
      const credential = provider.credential({
        idToken: identityToken,
        rawNonce: nonce,
      });

      const userCredential = await signInWithCredential(auth, credential);
      const drapeUser = mapFirebaseUser(userCredential.user);

      // Update display name if provided by Apple
      const fullName = appleCredential.fullName;
      if (fullName?.givenName || fullName?.familyName) {
        const displayName = [fullName.givenName, fullName.familyName]
          .filter(Boolean)
          .join(' ');
        if (displayName) {
          await updateProfile(userCredential.user, { displayName });
          drapeUser.displayName = displayName;
        }
      }

      // Create/update user document in Firestore
      const userDocRef = doc(db, 'users', userCredential.user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          email: userCredential.user.email,
          displayName: drapeUser.displayName,
          photoURL: userCredential.user.photoURL,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          provider: 'apple',
        });
      } else {
        await setDoc(userDocRef, {
          updatedAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
        }, { merge: true });
      }

      const isNew = !userDoc.exists();

      // Load plan from Firestore user document (existing users have plan field)
      if (!isNew && userDoc.exists()) {
        const userData = userDoc.data();
        drapeUser.plan = (userData?.plan && VALID_PLANS.includes(userData.plan)) ? userData.plan as PlanId : 'free';
      }

      set({ user: drapeUser, isLoading: false, isNewUser: isNew });
      useTerminalStore.setState({ userId: userCredential.user.uid });

      // Update projectStore and reload user's projects
      useProjectStore.getState().setUserId(userCredential.user.uid);
      if (isNew) {
        useProjectStore.setState({ projects: [] });
      } else {
        useProjectStore.getState().loadUserProjects();
      }

      // Register this device as the active device
      await deviceService.registerAsActiveDevice(userCredential.user.uid);

    } catch (error: any) {
      console.error('❌ [AuthStore] Apple sign in error:', error);

      let errorMessage = i18n.t('auth:errors.errorDuringAppleSignIn');
      if (error.code === 'ERR_CANCELED') {
        errorMessage = i18n.t('auth:errors.appleLoginCancelled');
      }

      set({ error: errorMessage, isLoading: false });
      throw new Error(errorMessage);
    }
  },

  clearError: () => set({ error: null }),

  checkDeviceAccess: async () => {
    const { user } = get();
    if (!user) return true;

    try {
      const isActive = await deviceService.isActiveDevice(user.uid);

      if (!isActive) {
        set({ deviceCheckFailed: true });

        Alert.alert(
          i18n.t('auth:errors.sessionTerminated'),
          i18n.t('auth:errors.multipleDevices'),
          [{ text: 'OK', onPress: () => get().logout() }]
        );
        return false;
      }

      return true;
    } catch (error) {
      console.error('[AuthStore] Device check error:', error);
      return true; // Allow on error to prevent lockouts
    }
  },
}));
