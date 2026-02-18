import { NativeModules, Platform } from 'react-native';

const { PreviewActivityModule } = NativeModules;

// Debug: log all available native modules to find the right name
if (Platform.OS === 'ios') {
  console.log('[LiveActivity] PreviewActivityModule found:', !!PreviewActivityModule);
  console.log('[LiveActivity] Available NativeModules:', Object.keys(NativeModules).filter(k => k.toLowerCase().includes('preview') || k.toLowerCase().includes('activity')));
}

export interface PreviewActivityState {
  remainingSeconds: number;
  currentStep: string;
  progress: number; // 0.0 to 1.0
}

/**
 * Service per gestire le Live Activities (Dynamic Island) del preview
 * Solo iOS 16.1+ con Dynamic Island (iPhone 14 Pro, 15 Pro, etc.)
 */
class LiveActivityService {
  private activityId: string | null = null;
  private isSupported: boolean = Platform.OS === 'ios';

  constructor() {
    if (PreviewActivityModule) {
      console.log('✅ [LiveActivity] Native module found, isSupported:', this.isSupported);
    } else {
      console.warn('⚠️ [LiveActivity] Native module NOT found - Dynamic Island will not work');
    }
  }

  /**
   * Avvia una Live Activity per il preview
   */
  async startPreviewActivity(projectName: string, state: PreviewActivityState, operationType: 'preview' | 'open' | 'clone' | 'create' = 'preview'): Promise<boolean> {
    if (!this.isSupported || !PreviewActivityModule) {
      return false;
    }

    try {
      const id = await PreviewActivityModule.startActivity(
        projectName,
        operationType,
        state.remainingSeconds,
        state.currentStep,
        state.progress
      );
      this.activityId = id;
      return true;
    } catch (error: any) {
      console.error('❌ [LiveActivity] Start error:', error);
      return false;
    }
  }

  /**
   * Aggiorna la Live Activity corrente
   */
  async updatePreviewActivity(state: PreviewActivityState): Promise<boolean> {
    if (!this.isSupported || !PreviewActivityModule || !this.activityId) {
      return false;
    }

    try {
      await PreviewActivityModule.updateActivity(
        state.remainingSeconds,
        state.currentStep,
        state.progress
      );
      return true;
    } catch (error: any) {
      // "No active Live Activity" is expected when activity already ended — ignore silently
      if (error?.message?.includes('No active')) {
        this.activityId = null;
      } else {
        console.warn('[LiveActivity] Update error:', error?.message);
      }
      return false;
    }
  }

  /**
   * Termina la Live Activity corrente
   */
  async endPreviewActivity(): Promise<boolean> {
    if (!this.isSupported || !PreviewActivityModule || !this.activityId) {
      return false;
    }

    try {
      await PreviewActivityModule.endActivity();
      this.activityId = null;
      return true;
    } catch (error: any) {
      console.error('❌ [LiveActivity] End error:', error);
      return false;
    }
  }

  /**
   * Termina la Live Activity con animazione di successo:
   * - Aggiorna a "Pronto!" con progress 100%
   * - Mostra nella Dynamic Island per 1.5s
   * - Poi scompare gradualmente
   */
  async endWithSuccess(projectName: string, message: string = 'Pronto!'): Promise<boolean> {
    if (!this.isSupported || !PreviewActivityModule || !this.activityId) {
      return false;
    }

    try {
      await PreviewActivityModule.endActivityWithSuccess(projectName, message);
      this.activityId = null;
      return true;
    } catch (error: any) {
      console.error('❌ [LiveActivity] endWithSuccess error:', error);
      return this.endPreviewActivity();
    }
  }

  /**
   * Richiedi permesso notifiche all'avvio dell'app (non-blocking, silenzioso se gia' concesso)
   */
  async requestNotificationPermission(): Promise<boolean> {
    if (Platform.OS !== 'ios' || !PreviewActivityModule) {
      return false;
    }

    try {
      const granted = await PreviewActivityModule.requestNotificationPermission();
      return granted;
    } catch (error: any) {
      console.warn('⚠️ [Notification] Permission request error:', error.message);
      return false;
    }
  }

  /**
   * Invia una notifica push locale (es. "Preview pronta!")
   * Usa expo-notifications per garantire che il tap venga catturato dal response listener.
   */
  async sendNotification(title: string, body: string, data?: Record<string, string>): Promise<boolean> {
    try {
      const Notifications = await import('expo-notifications');
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: 'default',
          data: data || {},
        },
        trigger: null, // fire immediately
      });
      return true;
    } catch (error: any) {
      console.warn('⚠️ [Notification] Error:', error.message);
      return false;
    }
  }

  /**
   * Richiedi tempo extra di esecuzione in background (~30s).
   * Chiamare quando l'app va in background durante un'operazione attiva.
   */
  async beginBackgroundTask(): Promise<boolean> {
    if (!this.isSupported || !PreviewActivityModule) return false;
    try {
      return await PreviewActivityModule.beginBackgroundTask();
    } catch {
      return false;
    }
  }

  /**
   * Rilascia il background task. Chiamare quando l'app torna in foreground
   * o l'operazione è completata.
   */
  async endBackgroundTask(): Promise<boolean> {
    if (!this.isSupported || !PreviewActivityModule) return false;
    try {
      return await PreviewActivityModule.endBackgroundTask();
    } catch {
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
    if (this.activityId) {
      await this.endPreviewActivity();
    }
  }
}

export const liveActivityService = new LiveActivityService();
