import { auth } from '../../config/firebase';

/**
 * Get the current Firebase auth token for API calls.
 * Returns null if user is not authenticated.
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const user = auth.currentUser;
    if (user) {
      return await user.getIdToken();
    }
  } catch (error) {
    console.warn('[API] Failed to get auth token:', error);
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
