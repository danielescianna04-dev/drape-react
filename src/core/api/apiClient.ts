import axios from 'axios';
import { Alert, AppState } from 'react-native';
import i18next from 'i18next';
import { supabase } from '../../lib/supabase/client';

const apiClient = axios.create();

// Prevent showing multiple concurrent re-login alerts
let authAlertShown = false;

// Track when app returns from background — suppress re-login for a grace period
let recentlyResumed = false;
let resumeTimer: ReturnType<typeof setTimeout> | null = null;

AppState.addEventListener('change', (nextState) => {
  if (nextState === 'active') {
    recentlyResumed = true;
    if (resumeTimer) clearTimeout(resumeTimer);
    // 5s grace period after returning from background — don't prompt re-login
    resumeTimer = setTimeout(() => { recentlyResumed = false; }, 5000);
  }
});

function showReloginAlert(): void {
  // Don't prompt re-login right after returning from background (e.g. from Safari OAuth)
  if (authAlertShown || recentlyResumed) return;
  authAlertShown = true;

  import('../auth/authStore').then(({ useAuthStore }) => {
    const { user, signOut: logout } = useAuthStore.getState();
    if (!user) {
      authAlertShown = false;
      return;
    }
    Alert.alert(
      i18next.t('common:authRequired'),
      i18next.t('common:connectionLost'),
      [{
        text: i18next.t('common:login'),
        onPress: () => {
          authAlertShown = false;
          logout();
        },
      }],
      { onDismiss: () => { authAlertShown = false; } }
    );
  }).catch(() => { authAlertShown = false; });
}

apiClient.interceptors.request.use(async (config) => {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
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
          const { data, error: refreshError } = await supabase.auth.refreshSession();
          const freshToken = data.session?.access_token;
          if (refreshError) throw refreshError;
          if (freshToken) {
            error.config._tokenRetried = true;
            error.config.headers.Authorization = `Bearer ${freshToken}`;
            return apiClient.request(error.config);
          }
        } catch (refreshError) {
          console.warn('[API] Token refresh failed:', refreshError);
        }
        console.warn('[API] Unauthorized - token may be expired');
      } else if (status === 401 && error.config._tokenRetried) {
        // Retry with fresh token also failed → session is truly invalid
        console.warn('[API] Persistent auth failure — prompting re-login');
        showReloginAlert();
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
