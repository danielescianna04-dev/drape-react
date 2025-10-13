import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../shared/theme/colors';

const colors = AppColors.dark;

export const WelcomeView = () => {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[AppColors.primary, AppColors.primaryShade]}
        style={styles.iconContainer}
      >
        <Ionicons name="terminal" size={48} color="#fff" />
      </LinearGradient>

      <Text style={[styles.title, { color: colors.titleText }]}>
        Welcome to Drape Terminal
      </Text>

      <Text style={[styles.subtitle, { color: colors.bodyText }]}>
        AI-powered mobile development environment
      </Text>

      <View style={styles.features}>
        <FeatureItem icon="code-slash" text="Execute code in multiple languages" />
        <FeatureItem icon="chatbubbles" text="Chat with AI (GPT, Claude, Gemini)" />
        <FeatureItem icon="git-branch" text="GitHub integration" />
      </View>
    </View>
  );
};

const FeatureItem = ({ icon, text }: any) => (
  <View style={styles.featureItem}>
    <Ionicons name={icon} size={20} color={AppColors.primary} />
    <Text style={[styles.featureText, { color: colors.bodyText }]}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
  },
  features: {
    width: '100%',
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 14,
  },
});
