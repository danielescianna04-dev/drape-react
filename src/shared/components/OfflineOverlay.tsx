import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const OfflineOverlay: React.FC = () => {
  const [isOffline, setIsOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  const { t } = useTranslation('common');
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(!(state.isConnected && state.isInternetReachable !== false));
    });
    return () => unsubscribe();
  }, []);

  const handleRetry = async () => {
    setChecking(true);
    const state = await NetInfo.fetch();
    setIsOffline(!(state.isConnected && state.isInternetReachable !== false));
    setChecking(false);
  };

  if (!isOffline) return null;

  return (
    <View style={[styles.overlay, { paddingTop: insets.top + 60 }]}>
      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color="rgba(255,255,255,0.6)" />
        </View>
        <Text style={styles.title}>{t('offline.title')}</Text>
        <Text style={styles.message}>{t('offline.message')}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={handleRetry}
          disabled={checking}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh-outline" size={18} color="#fff" />
          <Text style={styles.retryText}>
            {checking ? '...' : t('offline.retry')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.95)',
    zIndex: 9999,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  card: {
    alignItems: 'center',
    maxWidth: 300,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  retryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
