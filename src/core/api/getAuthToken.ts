import { signOut } from 'firebase/auth';
import { decode as decodeBase64 } from 'base-64';
import { auth } from '../../config/firebase';

type FirebaseTokenPayload = {
  aud?: string;
  iss?: string;
  user_id?: string;
  sub?: string;
};

function parseFirebaseTokenPayload(token: string): FirebaseTokenPayload | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
    const decoded = decodeBase64(normalized + padding);
    return JSON.parse(decoded) as FirebaseTokenPayload;
  } catch (error) {
    console.warn('[API] Failed to parse auth token payload:', error);
    return null;
  }
}

async function validateTokenProject(token: string): Promise<boolean> {
  const expectedProjectId = auth.app.options.projectId;
  if (!expectedProjectId) return true;

  const payload = parseFirebaseTokenPayload(token);
  if (!payload) return true;

  const audience = payload.aud;
  const issuer = payload.iss;
  const issuerMatches = typeof issuer === 'string' && issuer.includes(`https://securetoken.google.com/${expectedProjectId}`);

  return audience === expectedProjectId && issuerMatches;
}

/**
 * Get the current Firebase auth token for API calls.
 * Returns null if user is not authenticated.
 */
export async function getAuthToken(forceRefresh = false): Promise<string | null> {
  try {
    await auth.authStateReady?.();
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken(forceRefresh);
      const isValidForCurrentProject = await validateTokenProject(token);

      if (!isValidForCurrentProject) {
        console.warn('[API] Auth token belongs to a different Firebase project. Signing out stale session.');
        await signOut(auth).catch(() => {});
        return null;
      }

      return token;
    }
  } catch (error: any) {
    const code = error?.code || '';
    const msg = error?.message || String(error);
    console.warn(`[API] Failed to get auth token (forceRefresh=${forceRefresh}):`, code, msg);

    // If the refresh token itself is expired/revoked, sign out so user can re-login
    if (
      forceRefresh &&
      (code === 'auth/user-token-expired' ||
       code === 'auth/user-disabled' ||
       code === 'auth/invalid-refresh-token' ||
       msg.includes('TOKEN_EXPIRED') ||
       msg.includes('INVALID_REFRESH_TOKEN'))
    ) {
      console.warn('[API] Refresh token expired/revoked — forcing sign-out');
      await signOut(auth).catch(() => {});
    }
  }
  return null;
}

/**
 * Get auth headers object for fetch/XHR calls.
 * Returns an object with Authorization header if user is authenticated.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}
