import { create } from 'zustand';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  User,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../config/firebase';
import { useTerminalStore } from '../terminal/terminalStore';
import { useProjectStore } from '../projects/projectStore';
import { useTabStore } from '../tabs/tabStore';
import { gitAccountService } from '../git/gitAccountService';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

// Track previous user ID to detect user changes
let previousUserId: string | null = null;

export interface DrapeUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  createdAt: Date;
}

interface AuthState {
  user: DrapeUser | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  initialize: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signInWithApple: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  clearError: () => void;
}

const mapFirebaseUser = (firebaseUser: User): DrapeUser => ({
  uid: firebaseUser.uid,
  email: firebaseUser.email,
  displayName: firebaseUser.displayName,
  photoURL: firebaseUser.photoURL,
  createdAt: new Date(firebaseUser.metadata.creationTime || Date.now()),
});

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  initialize: () => {
    console.log('🔐 [AuthStore] Initializing auth listener...');

    onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('🔐 [AuthStore] Auth state changed:', firebaseUser?.email || 'null');

      const newUserId = firebaseUser?.uid || null;
      const userChanged = previousUserId !== null && previousUserId !== newUserId;

      // Detect user change (switching accounts)
      if (userChanged) {
        console.log('🔄 [AuthStore] USER CHANGED from', previousUserId, 'to', newUserId);
        console.log('🗑️ [AuthStore] Resetting all user-specific state...');

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
        const drapeUser = mapFirebaseUser(firebaseUser);
        set({ user: drapeUser, isInitialized: true, isLoading: false });

        // Update terminalStore userId
        useTerminalStore.setState({ userId: firebaseUser.uid });

        // Update projectStore userId and reload projects for this user
        useProjectStore.getState().setUserId(firebaseUser.uid);
        useProjectStore.getState().loadUserProjects();

        console.log('✅ [AuthStore] User logged in:', drapeUser.email);

        // Sync Git accounts from Firebase (for cross-device access)
        gitAccountService.syncFromFirebase(firebaseUser.uid).catch(err => {
          console.warn('⚠️ Could not sync Git accounts:', err);
        });
      } else {
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

        console.log('🔐 [AuthStore] User logged out, all state reset');
      }
    });
  },

  signIn: async (email: string, password: string) => {
    set({ isLoading: true, error: null });

    try {
      console.log('🔐 [AuthStore] Signing in:', email);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const drapeUser = mapFirebaseUser(userCredential.user);

      set({ user: drapeUser, isLoading: false });
      useTerminalStore.setState({ userId: userCredential.user.uid });

      // Update projectStore and reload user's projects
      useProjectStore.getState().setUserId(userCredential.user.uid);
      useProjectStore.getState().loadUserProjects();

      console.log('✅ [AuthStore] Sign in successful:', drapeUser.email);
    } catch (error: any) {
      console.error('❌ [AuthStore] Sign in error:', error.code);

      let errorMessage = 'Errore durante l\'accesso';
      switch (error.code) {
        case 'auth/invalid-email':
          errorMessage = 'Email non valida';
          break;
        case 'auth/user-disabled':
          errorMessage = 'Account disabilitato';
          break;
        case 'auth/user-not-found':
          errorMessage = 'Utente non trovato';
          break;
        case 'auth/wrong-password':
          errorMessage = 'Password errata';
          break;
        case 'auth/invalid-credential':
          errorMessage = 'Credenziali non valide';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Troppi tentativi. Riprova più tardi';
          break;
      }

      set({ error: errorMessage, isLoading: false });
      throw new Error(errorMessage);
    }
  },

  signUp: async (email: string, password: string, displayName: string) => {
    set({ isLoading: true, error: null });

    try {
      console.log('🔐 [AuthStore] Creating account:', email);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      // Update profile with display name
      await updateProfile(userCredential.user, { displayName });

      // Create user document in Firestore
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        email,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const drapeUser = mapFirebaseUser(userCredential.user);
      drapeUser.displayName = displayName; // Override since it wasn't updated in time

      set({ user: drapeUser, isLoading: false });
      useTerminalStore.setState({ userId: userCredential.user.uid });

      // Update projectStore (new user has no projects yet)
      useProjectStore.getState().setUserId(userCredential.user.uid);
      useProjectStore.setState({ projects: [] });

      console.log('✅ [AuthStore] Sign up successful:', drapeUser.email);
    } catch (error: any) {
      console.error('❌ [AuthStore] Sign up error:', error.code);

      let errorMessage = 'Errore durante la registrazione';
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'Email già in uso';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Email non valida';
          break;
        case 'auth/operation-not-allowed':
          errorMessage = 'Operazione non consentita';
          break;
        case 'auth/weak-password':
          errorMessage = 'Password troppo debole (minimo 6 caratteri)';
          break;
      }

      set({ error: errorMessage, isLoading: false });
      throw new Error(errorMessage);
    }
  },

  logout: async () => {
    set({ isLoading: true, error: null });

    try {
      console.log('🔐 [AuthStore] Logging out...');

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

      // Sign out from Firebase
      await signOut(auth);
      set({ user: null, isLoading: false });

      console.log('✅ [AuthStore] Logout successful, all state reset');
    } catch (error: any) {
      console.error('❌ [AuthStore] Logout error:', error);
      set({ error: 'Errore durante il logout', isLoading: false });
      throw error;
    }
  },

  resetPassword: async (email: string) => {
    set({ isLoading: true, error: null });

    try {
      console.log('🔐 [AuthStore] Sending password reset:', email);
      await sendPasswordResetEmail(auth, email);
      set({ isLoading: false });
      console.log('✅ [AuthStore] Password reset email sent');
    } catch (error: any) {
      console.error('❌ [AuthStore] Password reset error:', error.code);

      let errorMessage = 'Errore durante il reset della password';
      switch (error.code) {
        case 'auth/invalid-email':
          errorMessage = 'Email non valida';
          break;
        case 'auth/user-not-found':
          errorMessage = 'Utente non trovato';
          break;
      }

      set({ error: errorMessage, isLoading: false });
      throw new Error(errorMessage);
    }
  },

  signInWithGoogle: async (idToken: string) => {
    set({ isLoading: true, error: null });

    try {
      console.log('🔐 [AuthStore] Signing in with Google...');
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

      set({ user: drapeUser, isLoading: false });
      useTerminalStore.setState({ userId: userCredential.user.uid });

      // Update projectStore and reload user's projects
      useProjectStore.getState().setUserId(userCredential.user.uid);
      useProjectStore.getState().loadUserProjects();

      console.log('✅ [AuthStore] Google sign in successful:', drapeUser.email);
    } catch (error: any) {
      console.error('❌ [AuthStore] Google sign in error:', error);
      const errorMessage = 'Errore durante l\'accesso con Google';
      set({ error: errorMessage, isLoading: false });
      throw new Error(errorMessage);
    }
  },

  signInWithApple: async () => {
    set({ isLoading: true, error: null });

    try {
      console.log('🔐 [AuthStore] Signing in with Apple...');

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

      set({ user: drapeUser, isLoading: false });
      useTerminalStore.setState({ userId: userCredential.user.uid });

      // Update projectStore and reload user's projects
      useProjectStore.getState().setUserId(userCredential.user.uid);
      useProjectStore.getState().loadUserProjects();

      console.log('✅ [AuthStore] Apple sign in successful:', drapeUser.email);
    } catch (error: any) {
      console.error('❌ [AuthStore] Apple sign in error:', error);

      let errorMessage = 'Errore durante l\'accesso con Apple';
      if (error.code === 'ERR_CANCELED') {
        errorMessage = 'Accesso annullato';
      }

      set({ error: errorMessage, isLoading: false });
      throw new Error(errorMessage);
    }
  },

  clearError: () => set({ error: null }),
}));
