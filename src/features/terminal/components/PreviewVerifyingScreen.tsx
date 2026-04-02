import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  statusMessage?: string;
}

export const PreviewVerifyingScreen = ({ statusMessage }: Props) => (
  <View style={styles.container}>
    <View style={styles.iconContainer}>
      <Ionicons name="shield-checkmark-outline" size={36} color="#8B5CF6" />
    </View>
    <ActivityIndicator size="small" color="#8B5CF6" style={styles.spinner} />
    <Text style={styles.title}>Controllo qualità in corso...</Text>
    {statusMessage ? (
      <Text style={styles.subtitle}>{statusMessage}</Text>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  spinner: {
    marginBottom: 16,
  },
  title: {
    color: '#ddd',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  subtitle: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
  },
});
