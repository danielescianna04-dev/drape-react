import { NativeModules, Platform } from 'react-native';

const { PreviewActivityModule } = NativeModules;

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
  private isSupported: boolean = Platform.OS === 'ios' && Platform.Version >= '16.1';

  constructor() {
    console.log('🟣 [LiveActivity] Platform.OS:', Platform.OS);
    console.log('🟣 [LiveActivity] Platform.Version:', Platform.Version);
    console.log('🟣 [LiveActivity] PreviewActivityModule available:', !!PreviewActivityModule);
    console.log('🟣 [LiveActivity] isSupported:', this.isSupported);

    if (PreviewActivityModule) {
      console.log('✅ [LiveActivity] Native module loaded successfully');
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
      console.log(`🟣 [LiveActivity] Starting for project: ${projectName} (${operationType})`, state);
      const id = await PreviewActivityModule.startActivity(
        projectName,
        operationType,
        state.remainingSeconds,
        state.currentStep,
        state.progress
      );
      this.activityId = id;
      console.log(`✅ [LiveActivity] Started with ID: ${id}`);
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
      console.error('❌ [LiveActivity] Update error:', error);
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
      console.log(`✅ [LiveActivity] Ended activity ${this.activityId}`);
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
      console.log(`🎉 [LiveActivity] Ending with success for: ${projectName} - "${message}"`);
      await PreviewActivityModule.endActivityWithSuccess(projectName, message);
      this.activityId = null;
      console.log(`✅ [LiveActivity] Success animation completed`);
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
      console.log(`🔔 [Notification] Permission: ${granted ? 'granted' : 'denied'}`);
      return granted;
    } catch (error: any) {
      console.warn('⚠️ [Notification] Permission request error:', error.message);
      return false;
    }
  }

  /**
   * Invia una notifica push locale (es. "Preview pronta!")
   */
  async sendNotification(title: string, body: string): Promise<boolean> {
    if (Platform.OS !== 'ios' || !PreviewActivityModule) {
      return false;
    }

    try {
      await PreviewActivityModule.sendLocalNotification(title, body);
      console.log(`🔔 [Notification] Sent: ${title} - ${body}`);
      return true;
    } catch (error: any) {
      console.warn('⚠️ [Notification] Error:', error.message);
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
      console.log('🧹 [LiveActivity] Cleanup: ending active activity');
      await this.endPreviewActivity();
    }
  }
}

export const liveActivityService = new LiveActivityService();
