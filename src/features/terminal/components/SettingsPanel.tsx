import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, interpolate } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import { AppColors, withOpacity } from '../../../shared/theme/colors';
import { useSidebarOffset } from '../../../features/terminal/context/SidebarContext';
import { useUIStore } from '../../../core/terminal/uiStore';
import { PanelHeader } from '../../../shared/components/organisms';

interface Props {
  onClose: () => void;
}

/**
 * Settings panel for app configuration
 * AI model selection, behavior settings, and app info
 */
export const SettingsPanel = ({ onClose }: Props) => {
  const { t } = useTranslation();
  const { sidebarTranslateX } = useSidebarOffset();
  const {
    selectedModel,
    autoApprove,
    isTerminalMode,
    isToolsExpanded,
    setSelectedModel,
    setAutoApprove,
    setIsTerminalMode,
    setIsToolsExpanded,
  } = useUIStore();

  const animatedStyle = useAnimatedStyle(() => {
    // Quando la sidebar è a -50 (nascosta), noi vogliamo traslare di -44 per arrivare a 0
    const translateX = interpolate(sidebarTranslateX.value, [-50, 0], [-44, 0]);

    // Quando è chiusa (sidebar a -50), allarghiamo il contenuto riducendo il padding destro
    const paddingRight = interpolate(sidebarTranslateX.value, [-50, 0], [20, 64]);

    // Aggiungiamo un po' di padding a sinistra solo quando è a tutto schermo
    const paddingLeft = interpolate(sidebarTranslateX.value, [-50, 0], [20, 0]);

    return {
      transform: [{ translateX }],
      paddingRight,
      paddingLeft,
    };
  });

  const models = [
    { id: 'claude-4-5-opus', name: 'Claude 4.6 Opus', description: 'Anthropic - Potenza creativa illimitata', icon: 'infinite' },
    { id: 'claude-4-5-sonnet', name: 'Claude 4.5 Sonnet', description: 'Anthropic - Equilibrio perfetto e codice d\'élite', icon: 'sparkles' },
    { id: 'gpt-5-3', name: 'GPT 5.3', description: 'OpenAI - Intelligenza versatile di ultima generazione', icon: 'bulb' },
    { id: 'gemini-3-0-pro', name: 'Gemini 3.0 Pro', description: 'Google - Ragionamento multimodale avanzato', icon: 'planet' },
    { id: 'gemini-3-0-flash', name: 'Gemini 3.0 Flash', description: 'Google - Risposte istantanee ad alta efficienza', icon: 'flash' },
  ];

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={['rgba(20, 20, 22, 0.7)', 'rgba(0, 0, 0, 0.98)']}
          style={StyleSheet.absoluteFill}
        />
      </BlurView>

      <PanelHeader
        title={t('settings:title')}
        icon="settings-outline"
        onClose={onClose}
        style={styles.header}
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Modello AI */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>{t('settings:aiModel.title')}</Text>
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          </View>
          <Text style={styles.sectionDescription}>
            {t('settings:aiModel.description')}
          </Text>

          {models.map((model) => {
            const isSelected = selectedModel === model.id;
            return (
              <TouchableOpacity
                key={model.id}
                onPress={() => setSelectedModel(model.id)}
                activeOpacity={0.8}
                style={styles.modelContainer}
              >
                <BlurView intensity={isSelected ? 30 : 15} tint="light" style={[styles.modelCard, isSelected && styles.modelCardSelected]}>
                  {isSelected && (
                    <LinearGradient
                      colors={[withOpacity(AppColors.primary, 0.15), 'transparent']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                  )}

                  <View style={[styles.modelIconBox, { backgroundColor: isSelected ? AppColors.primary : 'rgba(255,255,255,0.05)' }]}>
                    <Ionicons name={model.icon as any} size={18} color={isSelected ? '#fff' : 'rgba(255,255,255,0.4)'} />
                  </View>

                  <View style={styles.modelInfo}>
                    <View style={styles.modelHeader}>
                      <Text style={[styles.modelName, isSelected && styles.modelNameSelected]}>{model.name}</Text>
                      {isSelected && (
                        <View style={styles.pulseContainer}>
                          <View style={styles.pulseDot} />
                        </View>
                      )}
                    </View>
                    <Text style={styles.modelDescription}>{model.description}</Text>
                  </View>

                  {isSelected && (
                    <View style={styles.selectedCheck}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                </BlurView>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Comportamento */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings:behavior.title')}</Text>

          <View style={styles.settingsGroup}>
            <View style={styles.settingItem}>
              <View style={styles.settingIconWrapper}>
                <Ionicons name="flash-outline" size={18} color={autoApprove ? AppColors.primary : "rgba(255, 255, 255, 0.4)"} />
              </View>
              <View style={styles.settingInfo}>
                <Text style={styles.settingName}>{t('settings:behavior.autoApprove')}</Text>
                <Text style={styles.settingDescription}>
                  {t('settings:behavior.autoApproveDesc')}
                </Text>
              </View>
              <Switch
                value={autoApprove}
                onValueChange={setAutoApprove}
                trackColor={{ false: 'rgba(255,255,255,0.1)', true: AppColors.primary }}
                thumbColor="#ffffff"
                ios_backgroundColor="rgba(255,255,255,0.1)"
              />
            </View>

            <View style={styles.settingItem}>
              <View style={styles.settingIconWrapper}>
                <Ionicons name="terminal-outline" size={18} color={isTerminalMode ? AppColors.primary : "rgba(255, 255, 255, 0.4)"} />
              </View>
              <View style={styles.settingInfo}>
                <Text style={styles.settingName}>{t('settings:behavior.terminalMode')}</Text>
                <Text style={styles.settingDescription}>
                  {t('settings:behavior.terminalModeDesc')}
                </Text>
              </View>
              <Switch
                value={isTerminalMode}
                onValueChange={setIsTerminalMode}
                trackColor={{ false: 'rgba(255,255,255,0.1)', true: AppColors.primary }}
                thumbColor="#ffffff"
                ios_backgroundColor="rgba(255,255,255,0.1)"
              />
            </View>

            <View style={styles.settingItem}>
              <View style={styles.settingIconWrapper}>
                <Ionicons name="grid-outline" size={18} color={isToolsExpanded ? AppColors.primary : "rgba(255, 255, 255, 0.4)"} />
              </View>
              <View style={styles.settingInfo}>
                <Text style={styles.settingName}>{t('settings:behavior.expandedTools')}</Text>
                <Text style={styles.settingDescription}>
                  {t('settings:behavior.expandedToolsDesc')}
                </Text>
              </View>
              <Switch
                value={isToolsExpanded}
                onValueChange={setIsToolsExpanded}
                trackColor={{ false: 'rgba(255,255,255,0.1)', true: AppColors.primary }}
                thumbColor="#ffffff"
                ios_backgroundColor="rgba(255,255,255,0.1)"
              />
            </View>
          </View>
        </View>

        {/* Sistema */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings:system.title')}</Text>

          <BlurView intensity={10} tint="light" style={styles.infoGroup}>
            <View style={styles.infoItem}>
              <Ionicons name="cube-outline" size={16} color="rgba(255,255,255,0.4)" />
              <Text style={styles.infoLabel}>{t('settings:system.version')}</Text>
              <Text style={styles.infoValue}>{Constants.expoConfig?.version || '1.0.0'}</Text>
            </View>

            <View style={[styles.infoItem, { borderBottomWidth: 0 }]}>
              <Ionicons name="earth-outline" size={16} color="rgba(255,255,255,0.4)" />
              <Text style={styles.infoLabel}>{t('settings:system.region')}</Text>
              <Text style={styles.infoValue}>Europe (Milan)</Text>
            </View>
          </BlurView>
        </View>
      </ScrollView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 44,
    right: -50,
    top: 0,
    bottom: 0,
    zIndex: 1002,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 8,
    backgroundColor: 'transparent',
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: 24,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  proBadge: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: AppColors.primary,
    borderRadius: 4,
  },
  proBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#fff',
  },
  sectionDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.4)',
    marginBottom: 20,
    lineHeight: 18,
  },
  modelContainer: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  modelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
  },
  modelCardSelected: {
    borderColor: 'rgba(155, 138, 255, 0.5)',
    backgroundColor: 'rgba(155, 138, 255, 0.08)',
  },
  modelIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  modelInfo: {
    flex: 1,
  },
  modelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  modelName: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  modelNameSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  modelDescription: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  pulseContainer: {
    marginLeft: 8,
    width: 6,
    height: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: AppColors.primary,
  },
  selectedCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    marginRight: 2,
  },
  settingsGroup: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  settingIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  settingInfo: {
    flex: 1,
  },
  settingName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 1,
  },
  settingDescription: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  infoGroup: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
    paddingVertical: 8,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
  },
  infoLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.3)',
    marginLeft: 12,
    flex: 1,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
  },
});
