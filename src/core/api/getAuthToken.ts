import { supabase } from '../../lib/supabase/client';

/**
 * Get the current Supabase access token for API calls.
 * Returns null if user is not authenticated.
 */
export async function getAuthToken(forceRefresh = false): Promise<string | null> {
  try {
    if (forceRefresh) {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.warn('[API] Failed to refresh session:', error.message);
        return null;
      }
      return data.session?.access_token ?? null;
    }
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn('[API] Failed to get session:', error.message);
      return null;
    }
    return data.session?.access_token ?? null;
  } catch (error: any) {
    console.warn('[API] getAuthToken error:', error?.message ?? error);
    return null;
  }
}

/**
 * Get auth headers object for fetch/XHR calls.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
