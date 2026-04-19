import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';
import { GlassCard } from './GlassCard';
import { SettingItem } from './SettingItem';
import { LANGUAGES, LanguageCode } from '../../../i18n';
import { AppColors } from '../../../shared/theme/colors';
import { useUIStore } from '../../../core/terminal/uiStore';

interface AppearanceSectionProps {
  language: LanguageCode;
  loading: boolean;
  onLanguageChange: (lang: LanguageCode) => void;
  t: (key: string) => string;
}

export const AppearanceSection: React.FC<AppearanceSectionProps> = ({
  language,
  loading,
  onLanguageChange,
  t,
}) => {
  const simpleToolView = useUIStore((s) => s.simpleToolView);
  const setSimpleToolView = useUIStore((s) => s.setSimpleToolView);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('appearance.title')}</Text>
      <GlassCard key={loading ? 'loading-app' : 'loaded-app'}>
        <View style={[styles.sectionCard, isLiquidGlassSupported && styles.sectionCardGlass]}>
          <SettingItem
            icon="language-outline"
            iconColor="#60A5FA"
            title={t('language.title')}
            subtitle={LANGUAGES[language].nativeName}
            showChevron={false}
            rightElement={
              <View style={styles.languageSwitcher}>
                {(Object.keys(LANGUAGES) as LanguageCode[]).map((langCode) => (
                  <TouchableOpacity
                    key={langCode}
                    style={[
                      styles.languageOption,
                      language === langCode && styles.languageOptionActive
                    ]}
                    onPress={() => onLanguageChange(langCode)}
                  >
                    <Text style={[
                      styles.languageOptionText,
                      language === langCode && styles.languageOptionTextActive
                    ]}>
                      {LANGUAGES[langCode].flag}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            }
          />
          <SettingItem
            icon="sparkles-outline"
            iconColor="#A78BFA"
            title="Modalità semplice"
            subtitle="Mostra le azioni dell'AI in linguaggio umano invece dei comandi tecnici"
            showChevron={false}
            rightElement={
              <Switch
                value={simpleToolView}
                onValueChange={setSimpleToolView}
                trackColor={{ false: 'rgba(255,255,255,0.1)', true: AppColors.primary }}
                thumbColor="#ffffff"
                ios_backgroundColor="rgba(255,255,255,0.1)"
              />
            }
            isLast
          />
        </View>
      </GlassCard>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: -0.3,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionCard: {
    padding: 4,
    backgroundColor: 'rgba(20,20,22,0.5)',
    borderRadius: 16,
  },
  sectionCardGlass: {
    backgroundColor: 'transparent',
  },
  languageSwitcher: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 2,
  },
  languageOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  languageOptionActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  languageOptionText: {
    fontSize: 16,
    opacity: 0.5,
  },
  languageOptionTextActive: {
    opacity: 1,
  },
});
