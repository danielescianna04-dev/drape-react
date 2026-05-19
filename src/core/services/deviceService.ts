/**
 * Device Service (v2)
 * Identificazione device locale via SecureStore.
 * Single-device login enforcement rimosso in v2 (multi-device come default).
 */

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

const DEVICE_ID_KEY = 'drape_device_id';

class DeviceService {
  private deviceId: string | null = null;

  async getDeviceId(): Promise<string> {
    if (this.deviceId) return this.deviceId;

    try {
      const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
      if (stored) {
        this.deviceId = stored;
        return stored;
      }
    } catch (e) {
      console.warn('[deviceService] SecureStore read failed:', e);
    }

    const fresh = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${Date.now()}-${Math.random()}`,
    );
    const truncated = fresh.slice(0, 32);
    try {
      await SecureStore.setItemAsync(DEVICE_ID_KEY, truncated);
    } catch (e) {
      console.warn('[deviceService] SecureStore write failed:', e);
    }
    this.deviceId = truncated;
    return truncated;
  }

  getDeviceModelName(): string {
    return Device.modelName ?? `${Platform.OS} device`;
  }
}

export const deviceService = new DeviceService();
