import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../shared/theme/colors';
import { githubService } from '../../../core/github/githubService';

export const GitHubConnect: React.FC = () => {
  const handleConnect = () => {
    githubService.startOAuthFlow();
  };

  return (
    <View style={styles.container}>
      <Ionicons name="logo-github" size={64} color="rgba(255, 255, 255, 0.3)" />
      <Text style={styles.emptyTitle}>Connetti GitHub</Text>
      <Text style={styles.emptyText}>
        Collega il tuo account GitHub per accedere alle tue repository
      </Text>
      
      <TouchableOpacity style={styles.connectButton} onPress={handleConnect}>
        <LinearGradient
          colors={[AppColors.primary, AppColors.primaryShade]}
          style={styles.connectGradient}
        >
          <Ionicons name="logo-github" size={20} color="#FFFFFF" />
          <Text style={styles.connectButtonText}>Connetti con GitHub</Text>
        </LinearGradient>
      </TouchableOpacity>

      <Text style={styles.infoText}>
        Verrai reindirizzato su GitHub per autorizzare l'accesso
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 24,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  connectButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  connectGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  connectButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  infoText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 16,
    textAlign: 'center',
  },
});
