import axios from 'axios';
import { auth } from '../../config/firebase';

const apiClient = axios.create();

apiClient.interceptors.request.use(async (config) => {
  try {
    // Wait for Firebase to restore auth state from AsyncStorage before first request
    await auth.authStateReady();
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (error) {
    console.warn('[API] Failed to get auth token:', error);
  }
  return config;
});

// Response interceptor for error handling + token retry on 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response) {
      const status = error.response.status;
      if (status === 401 && !error.config._tokenRetried) {
        // Force-refresh token and retry once
        try {
          const user = auth.currentUser;
          if (user) {
            const freshToken = await user.getIdToken(true);
            error.config._tokenRetried = true;
            error.config.headers.Authorization = `Bearer ${freshToken}`;
            return apiClient.request(error.config);
          }
        } catch (refreshError) {
          console.warn('[API] Token refresh failed:', refreshError);
        }
        console.warn('[API] Unauthorized - token may be expired');
      } else if (status === 429) {
        console.warn('[API] Rate limited - too many requests');
      } else if (status >= 500) {
        console.warn('[API] Server error:', status);
      }
    } else if (error.request) {
      console.warn('[API] Network error - no response received');
    }
    return Promise.reject(error);
  }
);

export default apiClient;
