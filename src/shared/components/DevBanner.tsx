import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigationStore } from '../../core/navigation/navigationStore';

const IS_DEV = process.env.EXPO_PUBLIC_ENV === 'development' || process.env.EXPO_PUBLIC_ENV === 'preview';

export const DevBanner = () => {
  const navigateTo = useNavigationStore((s) => s.navigateTo);
  if (!IS_DEV) return null;

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name="code-slash" size={14} color="#F59E0B" />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.label}>DEV ENVIRONMENT</Text>
        <Text style={styles.details}>
          Firebase: drape-dev  •  API: dev.drape.info
        </Text>
      </View>
      <TouchableOpacity style={styles.aiSdkButton} onPress={() => navigateTo('aiSdkTest')}>
        <Text style={styles.aiSdkButtonText}>AI SDK</Text>
      </TouchableOpacity>
      <View style={styles.dot} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
  },
  label: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  details: {
    color: 'rgba(245, 158, 11, 0.6)',
    fontSize: 10,
    marginTop: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  aiSdkButton: {
    backgroundColor: 'rgba(154, 166, 255, 0.18)',
    borderColor: 'rgba(154, 166, 255, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  aiSdkButtonText: {
    color: '#9aa6ff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
