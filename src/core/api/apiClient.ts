import axios from 'axios';
import { auth } from '../../config/firebase';

const apiClient = axios.create();

apiClient.interceptors.request.use(async (config) => {
  try {
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

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const status = error.response.status;
      if (status === 401) {
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
