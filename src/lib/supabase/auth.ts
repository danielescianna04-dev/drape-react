import { supabase } from './client';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';

export type AppleSignInOptions = {
  identityToken?: string;
  nonce?: string;
  legalAcceptance?: { tosAcceptedAt?: boolean; ageConfirmedAt?: boolean };
};

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpWithEmail(email: string, password: string, displayName?: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName ?? '' } },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

export async function signInWithApple(opts: AppleSignInOptions = {}) {
  if (!opts.identityToken) throw new Error('identityToken required for Apple sign-in');
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: opts.identityToken,
    nonce: opts.nonce,
  });
  if (error) throw error;
  return data;
}

export async function signInWithGoogle(idToken: string) {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error) throw error;
  return data;
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentUser(): Promise<SupabaseUser | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export function onAuthStateChange(cb: (session: Session | null) => void) {
  const sub = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session);
  });
  return () => sub.data.subscription.unsubscribe();
}

export async function deleteAccount() {
  // Supabase non espone delete client-side: serve backend con service_role.
  // Chiamiamo nostro endpoint /api/auth/delete-account
  throw new Error('deleteAccount: implement backend endpoint /api/auth/delete-account');
}
