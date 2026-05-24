import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BynotLogo } from '../../../shared/components/icons';

interface WelcomeViewProps {
  onStartChat?: () => void;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({ onStartChat }) => {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      {/* Content */}
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <BynotLogo size={74} />
        </View>

        {/* Title */}
        <Text style={styles.title}>Bynot</Text>
        <Text style={styles.subtitle}>
          {t('terminal:welcome.subtitle')}
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


