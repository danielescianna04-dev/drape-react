import { useState, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { config } from '../../config/config';
import { useToastStore } from '../../core/toast/toastStore';
import i18n from '../../i18n';

// @ts-ignore
const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

const APP_VERSION = Constants.expoConfig?.version ?? '2.2.0';

interface VersionCheckResponse {
  minVersion: string;
  currentVersion: string;
  forceUpdate: boolean;
  storeUrl: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export function useOTAUpdates() {
  const [forceNativeUpdate, setForceNativeUpdate] = useState(false);
  const [storeUrl, setStoreUrl] = useState('https://apps.apple.com/app/id6758354741');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      // 1. Backend version check (force native update?)
      try {
        const resp = await withTimeout(
          fetch(`${config.apiUrl}/version-check?appVersion=${APP_VERSION}`),
          5000,
        );
        const data: VersionCheckResponse = await resp.json();
        if (data.forceUpdate) {
          setForceNativeUpdate(true);
          if (data.storeUrl) setStoreUrl(data.storeUrl);
          return; // Don't check OTA if native update is required
        }
      } catch {
        // Non-blocking — don't prevent app startup
      }

      // 2. Expo OTA update check (only in production builds)
      if (isDev) return;

      try {
        const checkResult = await withTimeout(Updates.checkForUpdateAsync(), 10000);
        if (!checkResult.isAvailable) return;

        useToastStore.getState().showToast({
          message: i18n.t('common:ota.downloading'),
          icon: 'cloud-download-outline',
          type: 'info',
          duration: 15000,
        });

        await withTimeout(Updates.fetchUpdateAsync(), 30000);

        useToastStore.getState().hideToast();

        Alert.alert(
          i18n.t('common:ota.ready'),
          '',
          [
            { text: i18n.t('common:ota.later'), style: 'cancel' },
            {
              text: i18n.t('common:ota.restartNow'),
              onPress: () => Updates.reloadAsync(),
            },
          ],
        );
      } catch (e: any) {
        useToastStore.getState().hideToast();
        console.warn('[OTA] Update check failed:', e?.message || e);
      }
    })();
  }, []);

  return { forceNativeUpdate, storeUrl };
}
