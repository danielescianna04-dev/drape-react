import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  useWindowDimensions,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../shared/theme/colors';
import { useConsentStore, isConsentComplete } from '../services/consentService';

const TERMS_URL = 'https://www.bynot-dev.it/terms-of-service.html';
const PRIVACY_URL = 'https://www.bynot-dev.it/privacy-policy.html';

interface ConsentBannerProps {
  mode?: 'modal' | 'screen' | 'embedded' | 'step';
  onResolved?: () => void;
  forceShow?: boolean;
}

export const ConsentBanner = ({ mode = 'modal', onResolved, forceShow = false }: ConsentBannerProps) => {
  const { t } = useTranslation(['common', 'auth']);
  const { acceptAll } = useConsentStore();
  const storedConsent = useConsentStore(s => s.consent);
  const consentGiven = isConsentComplete(storedConsent);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const [showRejected, setShowRejected] = useState(false);
  const contentPaddingBottom = mode === 'screen' ? 18 : insets.bottom + 24;
  const compact = height < 860;
  const isStepMode = mode === 'step';

  // Don't show if consent already given
  if (consentGiven && !forceShow) return null;

  const handleAcceptAll = async () => {
    await acceptAll();
    onResolved?.();
  };

  const renderRejectedContent = () => (
    <View style={[styles.content, compact && styles.contentCompact, isStepMode && styles.stepContent, { paddingBottom: contentPaddingBottom }]}>
      <View style={[styles.header, compact && styles.headerCompact, isStepMode && styles.stepHeader]}>
        <View style={[styles.iconContainer, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
          <Ionicons name="close-circle" size={28} color="#EF4444" />
        </View>
        <Text style={[styles.title, compact && styles.titleCompact]}>{t('common:consent.rejectedTitle')}</Text>
        <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>{t('common:consent.rejectedMessage')}</Text>
      </View>
      <TouchableOpacity
        style={[styles.acceptAllButton, isStepMode && styles.stepAcceptAllButton]}
        onPress={() => setShowRejected(false)}
        activeOpacity={0.9}
      >
        <LinearGradient
          colors={[AppColors.primary, '#8B5CF6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.acceptAllGradient}
        >
          <Text style={styles.acceptAllText}>{t('common:consent.goBack')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderConsentContent = () => (
    <View style={[styles.content, compact && styles.contentCompact, isStepMode && styles.stepContent, { paddingBottom: contentPaddingBottom }]}>
      <View style={[styles.header, compact && styles.headerCompact, isStepMode && styles.stepHeader]}>
        <View style={styles.iconContainer}>
          <Ionicons name="shield-checkmark" size={28} color={AppColors.primary} />
        </View>
        <Text style={[styles.title, compact && styles.titleCompact]}>{t('common:consent.title')}</Text>
        <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>{t('common:consent.subtitle')}</Text>
      </View>

      <View style={[styles.infoSection, compact && styles.infoSectionCompact, isStepMode && styles.stepInfoSection]}>
        <View style={[styles.infoCard, compact && styles.infoCardCompact, isStepMode && styles.stepInfoCard]}>
          <View style={styles.infoHeader}>
            <Ionicons name="analytics-outline" size={18} color={AppColors.white.w60} />
            <Text style={[styles.infoLabel, compact && styles.infoLabelCompact]}>{t('common:consent.analytics')}</Text>
          </View>
          <Text
            style={[styles.infoDescription, compact && styles.infoDescriptionCompact]}
            numberOfLines={compact ? 2 : 4}
          >
            {t('common:consent.analyticsDesc')}
          </Text>
        </View>

        <View style={[styles.infoCard, compact && styles.infoCardCompact, isStepMode && styles.stepInfoCard]}>
          <View style={styles.infoHeader}>
            <Ionicons name="notifications-outline" size={18} color={AppColors.white.w60} />
            <Text style={[styles.infoLabel, compact && styles.infoLabelCompact]}>{t('common:consent.pushNotifications')}</Text>
          </View>
          <Text
            style={[styles.infoDescription, compact && styles.infoDescriptionCompact]}
            numberOfLines={compact ? 2 : 4}
          >
            {t('common:consent.pushNotificationsDesc')}
          </Text>
        </View>

        <View style={[styles.infoCard, compact && styles.infoCardCompact, isStepMode && styles.stepInfoCard]}>
          <View style={styles.infoHeader}>
            <Ionicons name="eye-outline" size={18} color={AppColors.white.w60} />
            <Text style={[styles.infoLabel, compact && styles.infoLabelCompact]}>{t('common:consent.presenceTracking')}</Text>
          </View>
          <Text
            style={[styles.infoDescription, compact && styles.infoDescriptionCompact]}
            numberOfLines={compact ? 2 : 4}
          >
            {t('common:consent.presenceTrackingDesc')}
          </Text>
        </View>
      </View>

      <Text style={[styles.legalText, compact && styles.legalTextCompact, isStepMode && styles.stepLegalText]}>
        {t('common:consent.legalPrefix')}{' '}
        <Text
          style={styles.legalLink}
          onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}
        >
          {t('common:consent.privacyPolicy')}
        </Text>
        {' '}{t('common:consent.legalAnd')}{' '}
        <Text
          style={styles.legalLink}
          onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}
        >
          {t('common:consent.termsOfService')}
        </Text>
        .
      </Text>

      <View style={[styles.buttons, compact && styles.buttonsCompact, isStepMode && styles.stepButtons]}>
        <TouchableOpacity
          style={[styles.acceptAllButton, isStepMode && styles.stepAcceptAllButton]}
          onPress={handleAcceptAll}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={[AppColors.primary, '#8B5CF6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.acceptAllGradient, compact && styles.acceptAllGradientCompact]}
          >
            <Text style={styles.acceptAllText}>{t('common:consent.acceptAll')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );

  const cardContent = showRejected ? renderRejectedContent() : renderConsentContent();

  // Rejected state — shows a blocking message requiring the user to go back
  if (mode === 'screen') {
    return (
      <View style={styles.screen}>
        <LinearGradient
          colors={AppColors.gradient.dark}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.screenGradient}
        >
          <View style={styles.screenOverlay} />
          <View style={[styles.screenContent, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
            <View style={[styles.container, styles.screenContainer]}>
              {cardContent}
            </View>
          </View>
        </LinearGradient>
      </View>
    );
  }

  if (mode === 'step') {
    return <View style={styles.stepContainer}>{cardContent}</View>;
  }

  if (mode === 'embedded') {
    return (
      <View style={[styles.container, styles.embeddedContainer]}>
        {cardContent}
      </View>
    );
  }

  return (
    <Modal visible={true} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {cardContent}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: AppColors.dark.background,
  },
  screenGradient: {
    flex: 1,
  },
  screenOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 2, 10, 0.72)',
  },
  screenContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '92%',
    backgroundColor: AppColors.dark.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  screenContainer: {
    alignSelf: 'center',
    width: '100%',
    maxHeight: '100%',
  },
  embeddedContainer: {
    width: '100%',
    maxWidth: '100%',
    maxHeight: '100%',
    alignSelf: 'stretch',
  },
  stepContainer: {
    width: '100%',
    alignSelf: 'stretch',
  },
  content: {
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  stepContent: {
    paddingTop: 8,
    paddingHorizontal: 2,
  },
  contentCompact: {
    paddingTop: 16,
    paddingHorizontal: 18,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  stepHeader: {
    marginBottom: 34,
  },
  headerCompact: {
    marginBottom: 14,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: AppColors.primaryAlpha.a15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: AppColors.dark.titleText,
    textAlign: 'center',
    marginBottom: 12,
  },
  titleCompact: {
    fontSize: 18,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: AppColors.dark.bodyText,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
  subtitleCompact: {
    fontSize: 12,
    lineHeight: 18,
  },
  infoSection: {
    gap: 10,
    marginBottom: 24,
  },
  stepInfoSection: {
    gap: 18,
    marginBottom: 34,
  },
  infoSectionCompact: {
    marginBottom: 18,
  },
  infoCard: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  stepInfoCard: {
    borderRadius: 20,
  },
  infoCardCompact: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: AppColors.dark.titleText,
  },
  infoLabelCompact: {
    fontSize: 14,
  },
  infoDescription: {
    fontSize: 12,
    color: AppColors.dark.bodyTextMuted,
    lineHeight: 18,
    marginLeft: 28,
  },
  infoDescriptionCompact: {
    fontSize: 11,
    lineHeight: 16,
  },
  legalText: {
    fontSize: 12,
    color: AppColors.dark.bodyTextMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  stepLegalText: {
    marginBottom: 36,
    paddingHorizontal: 14,
  },
  legalTextCompact: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 16,
  },
  legalLink: {
    color: AppColors.primary,
    textDecorationLine: 'underline',
  },
  buttons: {
    gap: 18,
  },
  stepButtons: {
    paddingBottom: 4,
  },
  buttonsCompact: {
    gap: 10,
  },
  acceptAllButton: {
    borderRadius: 26,
    overflow: 'hidden',
  },
  stepAcceptAllButton: {
    width: '100%',
    alignSelf: 'center',
  },
  acceptAllGradient: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
  },
  acceptAllGradientCompact: {
    height: 46,
    borderRadius: 23,
  },
  acceptAllText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
});
