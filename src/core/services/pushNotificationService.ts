import { Platform } from 'react-native';
import { doc, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { config } from '../../config/config';
import { getAuthHeaders } from '../api/getAuthToken';
import { useNavigationStore } from '../navigation/navigationStore';
import { useTerminalStore } from '../terminal/terminalStore';

// Lazy-load expo-notifications to avoid crash when native module isn't compiled
let Notifications: typeof import('expo-notifications') | null = null;
let notificationsAvailable = false;

async function getNotifications() {
  if (Notifications) return Notifications;
  try {
    Notifications = await import('expo-notifications');
    notificationsAvailable = true;
    return Notifications;
  } catch {
    console.warn('[Push] expo-notifications native module not available');
    notificationsAvailable = false;
    return null;
  }
}

// Setup foreground notification handler (lazy)
async function setupNotificationHandler() {
  const N = await getNotifications();
  if (!N) return;
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

// Initialize handler at import time but don't crash if unavailable
setupNotificationHandler();

class PushNotificationService {
  private token: string | null = null;
  private userId: string | null = null;
  private responseListener: any = null;
  private receivedListener: any = null;

  /**
   * Initialize push notifications for a logged-in user.
   * Call this after successful authentication.
   */
  async initialize(userId: string): Promise<void> {
    this.userId = userId;

    const N = await getNotifications();
    if (!N) return;

    try {
      // Request permission
      const { status: existingStatus } = await N.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await N.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        return;
      }

      // Get Expo push token (works with Expo's push service)
      const tokenData = await N.getExpoPushTokenAsync({
        projectId: 'ec6c855f-5325-47b4-8d13-982ba9a83a1c',
      });
      this.token = tokenData.data;

      // Register token in Firestore and backend
      await this.registerToken(userId, this.token);

      // Update lastActiveAt
      await this.updateLastActive(userId);

      // Setup notification listeners
      await this.setupListeners();
    } catch (error: any) {
      console.warn('[Push] Init error:', error.message);
    }
  }

  /**
   * Register device token in Firestore and backend
   */
  private async registerToken(userId: string, token: string): Promise<void> {
    try {
      // Save to Firestore
      await setDoc(doc(db, 'users', userId), {
        pushTokens: arrayUnion({
          token,
          platform: Platform.OS,
          updatedAt: new Date().toISOString(),
        }),
      }, { merge: true });

      // Register with backend
      const authHeaders = await getAuthHeaders();
      await fetch(`${config.apiUrl}/notifications/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ userId, token, platform: Platform.OS }),
      }).catch(() => {});

    } catch (error: any) {
      console.warn('[Push] Token registration error:', error.message);
    }
  }

  /**
   * Unregister device token on logout
   */
  async unregisterToken(): Promise<void> {
    if (!this.userId || !this.token) return;

    try {
      await setDoc(doc(db, 'users', this.userId), {
        pushTokens: arrayRemove({
          token: this.token,
          platform: Platform.OS,
        }),
      }, { merge: true });

    } catch (error: any) {
      console.warn('[Push] Unregister error:', error.message);
    }

    await this.cleanup();
  }

  /**
   * Update lastActiveAt timestamp for re-engagement tracking
   */
  async updateLastActive(userId: string): Promise<void> {
    try {
      await setDoc(doc(db, 'users', userId), {
        lastActiveAt: new Date().toISOString(),
      }, { merge: true });
    } catch (error: any) {
      // Silent - non-critical
    }
  }

  /**
   * Setup listeners for notification received and tap response
   */
  private async setupListeners(): Promise<void> {
    const N = await getNotifications();
    if (!N) return;

    // Remove previous listeners
    await this.cleanup();

    // When notification is received while app is foregrounded
    this.receivedListener = N.addNotificationReceivedListener(notification => {
    });

    // When user taps a notification
    this.responseListener = N.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;

      this.handleNotificationTap(data);
    });
  }

  /**
   * Handle notification tap - navigate to appropriate screen
   */
  private handleNotificationTap(data: Record<string, any>): void {
    const { type, projectId, workstationId } = data;

    switch (type) {
      case 'operation_complete':
      case 'clone_complete':
      case 'project_created':
        // Navigate to terminal with the project
        if (projectId || workstationId) {
          const terminalStore = useTerminalStore.getState();
          const workstation = terminalStore.workstations.find(
            w => w.projectId === projectId || w.id === workstationId
          );
          if (workstation) {
            terminalStore.setWorkstation(workstation);
            useNavigationStore.getState().navigateTo('terminal');
          }
        }
        break;

      case 'github_activity':
        useNavigationStore.getState().navigateTo('home');
        break;

      case 'reengagement':
        useNavigationStore.getState().navigateTo('home');
        break;

      default:
        useNavigationStore.getState().navigateTo('home');
        break;
    }
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(userId: string, preferences: {
    operations?: boolean;
    github?: boolean;
    reengagement?: boolean;
  }): Promise<void> {
    try {
      await setDoc(doc(db, 'users', userId), {
        notificationPreferences: preferences,
      }, { merge: true });

      // Sync to backend
      const prefAuthHeaders = await getAuthHeaders();
      await fetch(`${config.apiUrl}/notifications/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...prefAuthHeaders },
        body: JSON.stringify({ userId, preferences }),
      }).catch(() => {});

    } catch (error: any) {
      console.warn('[Push] Preferences error:', error.message);
    }
  }

  /**
   * Get current notification preferences
   */
  async getPreferences(userId: string): Promise<{
    operations: boolean;
    github: boolean;
    reengagement: boolean;
  }> {
    // Default: all enabled
    return { operations: true, github: true, reengagement: true };
  }

  /**
   * Cleanup listeners
   */
  private async cleanup(): Promise<void> {
    const N = await getNotifications();
    if (N) {
      if (this.responseListener) {
        N.removeNotificationSubscription(this.responseListener);
        this.responseListener = null;
      }
      if (this.receivedListener) {
        N.removeNotificationSubscription(this.receivedListener);
        this.receivedListener = null;
      }
    }
    this.token = null;
    this.userId = null;
  }
}

export const pushNotificationService = new PushNotificationService();
