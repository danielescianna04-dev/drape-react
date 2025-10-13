import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../shared/theme/colors';

interface WelcomeViewProps {
  onStartChat?: () => void;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({ onStartChat }) => {
  return (
    <LinearGradient
      colors={['#1a1a2e', '#0f0f1e', '#000000']}
      style={styles.container}
    >
      {/* Radial Gradient Background - simulato con blur */}
      <View style={styles.gradientWrapper}>
        <LinearGradient
          colors={[AppColors.primary, AppColors.primaryShade, 'transparent']}
          style={styles.gradient}
        />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <LinearGradient
            colors={[AppColors.primary, AppColors.primaryShade]}
            style={styles.logoBackground}
          >
            <Ionicons name="terminal" size={48} color="#FFFFFF" />
          </LinearGradient>
        </View>

        {/* Title */}
        <Text style={styles.title}>Drape</Text>
        <Text style={styles.subtitle}>
          Mobile-first AI IDE{'\n'}con supporto multi-model
        </Text>

        {/* Start Button - più visibile */}
        <TouchableOpacity style={styles.startButton} onPress={onStartChat} activeOpacity={0.8}>
          <LinearGradient
            colors={['rgba(111, 92, 255, 0.25)', 'rgba(111, 92, 255, 0.15)']}
            style={styles.buttonGradient}
          >
            <Ionicons name="sparkles" size={18} color="#FFFFFF" />
            <Text style={styles.startButtonText}>Scrivi un messaggio per iniziare</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradientWrapper: {
    position: 'absolute',
    top: '15%',
    left: '50%',
    width: 400,
    height: 400,
    marginLeft: -200,
    borderRadius: 200,
    overflow: 'hidden',
    opacity: 0.4,
  },
  gradient: {
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingTop: '25%',
    paddingHorizontal: 24,
  },
  logoContainer: {
    marginBottom: 24,
  },
  logoBackground: {
    width: 96,
    height: 96,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.8,
    shadowRadius: 24,
    elevation: 15,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
  },
  startButton: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(111, 92, 255, 0.5)',
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  startButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});


