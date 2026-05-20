import { create } from 'zustand';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase/client';
import {
  signInWithEmail,
  signUpWithEmail,
  signOut as supaSignOut,
  sendPasswordReset,
  signInWithApple as supaSignInWithApple,
  signInWithGoogle as supaSignInWithGoogle,
  getSession,
  onAuthStateChange,
  type AppleSignInOptions,
} from '../../lib/supabase/auth';

/**
 * Drape user shape — backward compatible con Firebase consumers.
 * `uid` rimane (mappa supabase user.id), così tutti i consumer esistenti
 * (terminalStore, projectStore, components che leggono user?.uid) funzionano.
 */
export type DrapeUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  plan: 'free' | 'pro' | 'enterprise';
  emailVerified: boolean;
  photoURL: string | null;
};

type AuthState = {
  user: DrapeUser | null;
  session: Session | null;
  isNewUser: boolean;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;

  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithApple: (opts: AppleSignInOptions) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  checkEmailVerified: () => Promise<boolean>;
  updateDisplayName: (name: string) => Promise<void>;
  refreshConsentAwareServices: () => Promise<void>;
  clearError: () => void;
  initialize: () => Promise<() => void>;
};

function mapSupabaseUser(supaUser: SupabaseUser | null, plan: DrapeUser['plan'] = 'free'): DrapeUser | null {
  if (!supaUser) return null;
  return {
    uid: supaUser.id,
    email: supaUser.email ?? null,
    displayName:
      (supaUser.user_metadata?.display_name as string | undefined) ??
      (supaUser.user_metadata?.full_name as string | undefined) ??
      null,
    plan,
    emailVerified: !!supaUser.email_confirmed_at,
    photoURL: (supaUser.user_metadata?.avatar_url as string | undefined) ?? null,
  };
}

async function fetchProfile(userId: string): Promise<{ plan: DrapeUser['plan']; displayName: string | null } | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return { plan: 'free', displayName: data.display_name ?? null };
}

/**
 * "Pending new user" flag — persiste tra refresh per sapere se un utente
 * appena registrato deve passare per l'onboarding. Memoria locale in modulo,
 * non in Zustand (così non triggera re-render).
 */
let _pendingNewUser = false;
export function setPendingNewUser(v: boolean): void {
  _pendingNewUser = v;
}
export function peekPendingNewUser(): boolean {
  return _pendingNewUser;
}
export function clearPendingNewUser(): void {
  _pendingNewUser = false;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isNewUser: false,
  isInitialized: false,
  isLoading: false,
  error: null,

  async signIn(email, password) {
    set({ isLoading: true, error: null });
    try {
      const { session } = await signInWithEmail(email, password);
      const supaUser = session?.user ?? null;
      const profile = supaUser ? await fetchProfile(supaUser.id) : null;
      const user = mapSupabaseUser(supaUser, profile?.plan);
      if (user && profile?.displayName) user.displayName = profile.displayName;
      set({ session, user, isLoading: false, isNewUser: false });
    } catch (err: any) {
      set({ isLoading: false, error: err?.message ?? 'Sign in failed' });
      throw err;
    }
  },

  async signUp(email, password, displayName) {
    set({ isLoading: true, error: null });
    try {
      const { session } = await signUpWithEmail(email, password, displayName);
      const supaUser = session?.user ?? null;
      const user = mapSupabaseUser(supaUser, 'free');
      if (user && displayName) user.displayName = displayName;
      set({ session, user, isLoading: false, isNewUser: true });
      setPendingNewUser(true);
    } catch (err: any) {
      set({ isLoading: false, error: err?.message ?? 'Sign up failed' });
      throw err;
    }
  },

  async signInWithApple(opts) {
    set({ isLoading: true, error: null });
    try {
      const { session } = await supaSignInWithApple(opts);
      const supaUser = session?.user ?? null;
      const profile = supaUser ? await fetchProfile(supaUser.id) : null;
      const user = mapSupabaseUser(supaUser, profile?.plan);
      if (user && profile?.displayName) user.displayName = profile.displayName;
      set({ session, user, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err?.message ?? 'Apple sign-in failed' });
      throw err;
    }
  },

  async signInWithGoogle(idToken) {
    set({ isLoading: true, error: null });
    try {
      const { session } = await supaSignInWithGoogle(idToken);
      const supaUser = session?.user ?? null;
      const profile = supaUser ? await fetchProfile(supaUser.id) : null;
      const user = mapSupabaseUser(supaUser, profile?.plan);
      if (user && profile?.displayName) user.displayName = profile.displayName;
      set({ session, user, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err?.message ?? 'Google sign-in failed' });
      throw err;
    }
  },

  async signOut() {
    set({ isLoading: true, error: null });
    try {
      await supaSignOut();
      set({ session: null, user: null, isLoading: false, isNewUser: false });
    } catch (err: any) {
      set({ isLoading: false, error: err?.message ?? 'Sign out failed' });
      throw err;
    }
  },

  async resetPassword(email) {
    set({ isLoading: true, error: null });
    try {
      await sendPasswordReset(email);
      set({ isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err?.message ?? 'Password reset failed' });
      throw err;
    }
  },

  async resendVerificationEmail() {
    const email = get().user?.email;
    if (!email) throw new Error('No email on file');
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw error;
  },

  async checkEmailVerified() {
    const { data } = await supabase.auth.getUser();
    const verified = !!data.user?.email_confirmed_at;
    const user = get().user;
    if (user) set({ user: { ...user, emailVerified: verified } });
    return verified;
  },

  async updateDisplayName(name) {
    const user = get().user;
    if (!user) throw new Error('Not authenticated');
    const { error: authError } = await supabase.auth.updateUser({
      data: { display_name: name },
    });
    if (authError) throw authError;
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ display_name: name })
      .eq('id', user.uid);
    if (profileError) throw profileError;
    set({ user: { ...user, displayName: name } });
  },

  async refreshConsentAwareServices() {
    // TODO v2: re-implementare consent-aware service refresh
    // (push notifications, device service, ecc.)
  },

  clearError() {
    set({ error: null });
  },

  async initialize() {
    set({ isLoading: true });
    try {
      const session = await getSession();
      const supaUser = session?.user ?? null;
      const profile = supaUser ? await fetchProfile(supaUser.id) : null;
      const user = mapSupabaseUser(supaUser, profile?.plan);
      if (user && profile?.displayName) user.displayName = profile.displayName;
      set({ session, user, isLoading: false, isInitialized: true });
    } catch (err: any) {
      set({ isLoading: false, isInitialized: true, error: err?.message ?? null });
    }

    const unsub = onAuthStateChange(async (session) => {
      const supaUser = session?.user ?? null;
      if (!supaUser) {
        set({ session: null, user: null });
        return;
      }
      const profile = await fetchProfile(supaUser.id);
      const user = mapSupabaseUser(supaUser, profile?.plan);
      if (user && profile?.displayName) user.displayName = profile.displayName;
      set({ session, user });
    });

    return unsub;
  },
}));
