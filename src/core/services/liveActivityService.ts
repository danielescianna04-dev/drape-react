import { Platform } from 'react-native';
import * as LiveActivity from 'expo-live-activity';

export interface PreviewActivityState {
  remainingSeconds: number;
  currentStep: string;
  progress: number; // 0.0 to 1.0
}

const ACTIVITY_CONFIG = {
  backgroundColor: '#0C0816',
  titleColor: '#FFFFFF',
  subtitleColor: '#FFFFFFB3',
  progressViewTint: '#7C5CFF',
  progressViewLabelColor: '#FFFFFF',
  timerType: 'digital' as const,
};

/**
 * Service per gestire le Live Activities (Dynamic Island) del preview
 * Solo iOS 16.2+ con Dynamic Island (iPhone 14 Pro, 15 Pro, etc.)
 *
 * Wraps expo-live-activity (Software Mansion) so the rest of the app keeps
 * the same call sites: startPreviewActivity / updatePreviewActivity /
 * endPreviewActivity / endWithSuccess / endAllActivities. The underlying
 * library handles the iOS Widget Extension generation via prebuild and
 * exposes APNs Live Activity push tokens for remote updates.
 */
class LiveActivityService {
  private activityId: string | null = null;
  private isSupported: boolean = Platform.OS === 'ios';
  private currentProjectName: string = '';
  private tokenListenerSub: { remove: () => void } | null = null;

  constructor() {
    if (this.isSupported) {
      console.log('✅ [LiveActivity] expo-live-activity loaded');
    }
  }

  private buildState(projectName: string, state: PreviewActivityState, status: 'running' | 'completed' = 'running'): LiveActivity.LiveActivityState {
    const subtitle = status === 'completed'
      ? state.currentStep
      : `${state.currentStep} • ${state.remainingSeconds}s`;
    return {
      title: projectName,
      subtitle,
      progressBar: {
        progress: Math.max(0, Math.min(1, state.progress)),
      },
    };
  }

  /**
   * Avvia una Live Activity per il preview
   */
  async startPreviewActivity(
    projectName: string,
    state: PreviewActivityState,
    _operationType: 'preview' | 'open' | 'clone' | 'create' = 'preview',
  ): Promise<boolean> {
    if (!this.isSupported) return false;
    try {
      this.currentProjectName = projectName;
      const id = LiveActivity.startActivity(
        this.buildState(projectName, state, 'running'),
        ACTIVITY_CONFIG,
      );
      if (!id) return false;
      this.activityId = id;
      return true;
    } catch (error: any) {
      // iOS Simulator does not support APNs token registration, so when the
      // plugin is configured with enablePushNotifications: true the
      // ActivityKit request fails with a UnexpectedErrorException. Treat it
      // as a non-fatal warning so the rest of the create flow keeps running.
      console.warn('[LiveActivity] Start unavailable (likely simulator without APNs):', error?.message || error);
      return false;
    }
  }

  /**
   * Aggiorna la Live Activity corrente
   */
  async updatePreviewActivity(state: PreviewActivityState): Promise<boolean> {
    if (!this.isSupported || !this.activityId) return false;
    try {
      LiveActivity.updateActivity(
        this.activityId,
        this.buildState(this.currentProjectName, state, 'running'),
      );
      return true;
    } catch (error: any) {
      console.warn('[LiveActivity] Update error:', error?.message);
      return false;
    }
  }

  /**
   * Termina la Live Activity corrente
   */
  async endPreviewActivity(): Promise<boolean> {
    if (!this.isSupported || !this.activityId) return false;
    try {
      LiveActivity.stopActivity(
        this.activityId,
        this.buildState(this.currentProjectName, {
          remainingSeconds: 0,
          currentStep: 'Done',
          progress: 1,
        }, 'completed'),
      );
      this.activityId = null;
      return true;
    } catch (error: any) {
      console.error('❌ [LiveActivity] End error:', error);
      return false;
    }
  }

  /**
   * Termina la Live Activity con un messaggio di successo finale.
   */
  async endWithSuccess(projectName: string, message: string = 'Pronto!'): Promise<boolean> {
    if (!this.isSupported || !this.activityId) return false;
    try {
      LiveActivity.stopActivity(
        this.activityId,
        {
          title: projectName,
          subtitle: message,
          progressBar: { progress: 1 },
        },
      );
      this.activityId = null;
      return true;
    } catch (error: any) {
      console.error('❌ [LiveActivity] endWithSuccess error:', error);
      return this.endPreviewActivity();
    }
  }

  /**
   * Richiedi permesso notifiche per supportare la Live Activity push token.
   * expo-live-activity non espone una API dedicata: la richiesta viene
   * gestita dal flusso standard di expo-notifications.
   */
  async requestNotificationPermission(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    try {
      const Notifications = await import('expo-notifications');
      const { status } = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: true },
      } as any);
      return status === 'granted';
    } catch (error: any) {
      console.warn('⚠️ [Notification] Permission request error:', error?.message);
      return false;
    }
  }

  /**
   * Invia una notifica push locale (es. "Preview pronta!")
   */
  async sendNotification(title: string, body: string, data?: Record<string, string>): Promise<boolean> {
    try {
      const Notifications = await import('expo-notifications');
      await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: 'default', data: data || {} },
        trigger: null,
      });
      return true;
    } catch (error: any) {
      console.warn('⚠️ [Notification] Error:', error?.message);
      return false;
    }
  }

  /**
   * Subscribe ai push token aggiornati emessi da ActivityKit.
   * Il backend usa questi token per inviare aggiornamenti APNs anche
   * quando l'app è sospesa.
   */
  onPushToken(callback: (info: { activityId: string; token: string }) => void): () => void {
    if (!this.isSupported) return () => {};
    // The native module ships with the binary; if you bumped the package
    // without rebuilding the dev client (expo run:ios), addListener throws
    // "Cannot read property 'addListener' of null". Swallow it so the rest
    // of the app still works in that case.
    try {
      const sub = LiveActivity.addActivityTokenListener((event) => {
        const id: string | undefined = event?.activityID;
        const token: string | undefined = event?.activityPushToken;
        if (id && token) callback({ activityId: id, token });
      });
      if (!sub) return () => {};
      this.tokenListenerSub = sub;
      return () => sub.remove();
    } catch (err: any) {
      console.warn('[LiveActivity] token listener unavailable (rebuild dev client?):', err?.message || err);
      return () => {};
    }
  }

  /**
   * Background task helpers (no-op via expo-live-activity).
   * Kept for API compatibility with the previous custom native module.
   * iOS still gives the JS poller the standard ~30s background grace.
   */
  async beginBackgroundTask(): Promise<boolean> { return false; }
  async endBackgroundTask(): Promise<boolean> { return false; }

  /**
   * Termina TUTTE le Live Activity attive (anche orfane).
   */
  async endAllActivities(): Promise<boolean> {
    if (!this.isSupported) return false;
    try {
      // expo-live-activity does not expose a bulk-end primitive.
      // Stopping the tracked one covers the in-session case; orphans
      // (rare: only when the app crashed mid-activity) auto-expire after
      // their staleDate or when the OS reclaims them.
      if (this.activityId) {
        LiveActivity.stopActivity(this.activityId, {
          title: this.currentProjectName || 'Drape',
          progressBar: { progress: 1 },
        });
        this.activityId = null;
      }
      return true;
    } catch (error: any) {
      console.warn('[LiveActivity] endAllActivities error:', error?.message);
      return false;
    }
  }

  isActivityActive(): boolean {
    return this.activityId !== null;
  }

  isDeviceSupported(): boolean {
    return this.isSupported;
  }

  async cleanup(): Promise<void> {
    if (this.activityId) await this.endPreviewActivity();
    if (this.tokenListenerSub) {
      this.tokenListenerSub.remove();
      this.tokenListenerSub = null;
    }
  }
}

export const liveActivityService = new LiveActivityService();
