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

export default apiClient;
