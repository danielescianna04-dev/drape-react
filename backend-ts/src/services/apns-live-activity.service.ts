import apn from 'apn';
import { log } from '../utils/logger';

interface LiveActivityState {
  projectName: string;
  remainingSeconds: number;
  currentStep: string;
  progress: number; // 0..1
  status: 'running' | 'completed' | 'failed' | 'verification_failed';
}

class ApnsLiveActivityService {
  private provider: apn.Provider | null = null;
  private warned = false;

  private getProvider(): apn.Provider | null {
    if (this.provider) return this.provider;
    const keyPath = process.env.APNS_KEY_PATH;
    const keyId = process.env.APNS_KEY_ID;
    const teamId = process.env.APNS_TEAM_ID;
    if (!keyPath || !keyId || !teamId) {
      if (!this.warned) {
        log.warn('[APNs] not configured (APNS_KEY_PATH/KEY_ID/TEAM_ID missing) — Live Activity remote updates disabled');
        this.warned = true;
      }
      return null;
    }
    const production = process.env.APNS_ENVIRONMENT === 'production';
    this.provider = new apn.Provider({
      token: { key: keyPath, keyId, teamId },
      production,
    });
    return this.provider;
  }

  async sendUpdate(token: string, state: LiveActivityState): Promise<boolean> {
    const provider = this.getProvider();
    if (!provider) return false;
    const bundleId = process.env.APNS_BUNDLE_ID || 'com.drape.app.dev';

    const note = new apn.Notification();
    note.topic = `${bundleId}.push-type.liveactivity`;
    note.priority = 10;
    // apn typings predate liveactivity — cast to any
    (note as any).pushType = 'liveactivity';
    note.expiry = Math.floor(Date.now() / 1000) + 3600;

    // Content-state shape must match expo-live-activity's LiveActivityState:
    //   { title, subtitle?, progressBar: { progress } }
    const subtitle = state.status === 'running'
      ? `${state.currentStep} • ${state.remainingSeconds}s`
      : state.currentStep;
    const aps: Record<string, any> = {
      timestamp: Math.floor(Date.now() / 1000),
      event: state.status === 'running' ? 'update' : 'end',
      'content-state': {
        title: state.projectName,
        subtitle,
        progressBar: { progress: Math.max(0, Math.min(1, state.progress)) },
      },
    };
    if (state.status !== 'running') {
      aps['dismissal-date'] = Math.floor(Date.now() / 1000) + 3;
    }
    note.payload = { aps };

    try {
      const result = await provider.send(note, token);
      if (result.failed.length > 0) {
        log.warn(`[APNs] live activity push failed: ${JSON.stringify(result.failed[0].response)}`);
        return false;
      }
      return true;
    } catch (err: any) {
      log.error(`[APNs] send error: ${err?.message || err}`);
      return false;
    }
  }

  shutdown(): void {
    this.provider?.shutdown();
    this.provider = null;
  }
}

export const apnsLiveActivity = new ApnsLiveActivityService();
