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
    <View style={styles.container}>
      {/* Content */}
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Ionicons name="terminal" size={64} color={AppColors.primary} />
        </View>

        {/* Title */}
        <Text style={styles.title}>Drape</Text>
        <Text style={styles.subtitle}>
          Mobile-first AI IDE{'\n'}con supporto multi-model
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingTop: '40%',
    paddingHorizontal: 24,
  },
  logoContainer: {
    marginBottom: 24,
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
});


