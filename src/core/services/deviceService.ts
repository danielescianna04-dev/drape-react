/**
 * Device Service
 * Manages unique device identification for single-device login enforcement
 */

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';

const DEVICE_ID_KEY = 'drape_device_id';

interface DeviceInfo {
  deviceId: string;
  platform: 'ios' | 'android';
  createdAt: number;
}

interface ActiveDeviceData {
  deviceId: string;
  platform: 'ios' | 'android';
  lastLoginAt: any; // Firestore Timestamp
  appVersion?: string;
}

class DeviceService {
  private deviceId: string | null = null;

  /**
   * Get or create a unique device ID
   * Stored securely and persists across app reinstalls (if keychain allows)
   */
  async getDeviceId(): Promise<string> {
    if (this.deviceId) {
      return this.deviceId;
    }

    try {
      // Try to get existing device ID
      const storedId = await SecureStore.getItemAsync(DEVICE_ID_KEY);

      if (storedId) {
        this.deviceId = storedId;
        return storedId;
      }

      // Generate new device ID
      const uuid = Crypto.randomUUID();
      const platform = Platform.OS;
      const newDeviceId = `${platform}-${uuid}`;

      // Store securely
      await SecureStore.setItemAsync(DEVICE_ID_KEY, newDeviceId);
      this.deviceId = newDeviceId;

      return newDeviceId;
    } catch (error) {
      console.error('[DeviceService] Error getting device ID:', error);
      // Fallback: generate temporary ID (won't persist)
      const fallbackId = `temp-${Platform.OS}-${Date.now()}`;
      this.deviceId = fallbackId;
      return fallbackId;
    }
  }

  /**
   * Get the device model name (e.g., "iPhone 16", "Pixel 8")
   */
  getDeviceModelName(): string {
    // Device.modelName returns the marketing name (e.g., "iPhone 16 Pro Max")
    // Device.modelId returns the internal identifier (e.g., "iPhone17,2")
    const modelName = Device.modelName;

    if (modelName) {
      return modelName;
    }

    // Fallback to platform name if model not available
    if (Platform.OS === 'ios') {
      return 'iPhone';
    } else if (Platform.OS === 'android') {
      return Device.brand ? `${Device.brand} ${Device.designName || 'Device'}` : 'Android Device';
    }

    return 'Device';
  }

  /**
   * Register this device as the active device for the user
   * This will invalidate any other devices
   */
  async registerAsActiveDevice(userId: string): Promise<void> {
    try {
      const deviceId = await this.getDeviceId();

      const userRef = doc(db, 'users', userId);

      await setDoc(userRef, {
        activeDevice: {
          deviceId,
          platform: Platform.OS as 'ios' | 'android',
          lastLoginAt: serverTimestamp(),
        }
      }, { merge: true });

    } catch (error) {
      console.error('[DeviceService] Error registering device:', error);
      throw error;
    }
  }

  /**
   * Check if this device is the active device for the user
   * Returns true if this device can continue, false if logged out elsewhere
   */
  async isActiveDevice(userId: string): Promise<boolean> {
    try {
      const deviceId = await this.getDeviceId();

      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        return true; // Allow if no user doc (first login)
      }

      const userData = userDoc.data();
      const activeDevice = userData?.activeDevice as ActiveDeviceData | undefined;

      if (!activeDevice) {
        return true; // Allow if no active device set
      }

      const isActive = activeDevice.deviceId === deviceId;

      if (!isActive) {
      }

      return isActive;
    } catch (error) {
      console.error('[DeviceService] Error checking active device:', error);
      return true; // Allow on error to prevent lockouts
    }
  }

  /**
   * Clear the active device for a user (on logout)
   */
  async clearActiveDevice(userId: string): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);

      await setDoc(userRef, {
        activeDevice: null
      }, { merge: true });

    } catch (error) {
      console.error('[DeviceService] Error clearing active device:', error);
    }
  }

  /**
   * Get info about the current active device for a user
   */
  async getActiveDeviceInfo(userId: string): Promise<ActiveDeviceData | null> {
    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        return null;
      }

      const userData = userDoc.data();
      return userData?.activeDevice as ActiveDeviceData | null;
    } catch (error) {
      console.error('[DeviceService] Error getting active device info:', error);
      return null;
    }
  }
}

export const deviceService = new DeviceService();
