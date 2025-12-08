import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../shared/theme/colors';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { PanelHeader } from '../../../shared/components/organisms';

interface Props {
  onClose: () => void;
}

/**
 * Settings panel for app configuration
 * AI model selection, behavior settings, and app info
 */
export const SettingsPanel = ({ onClose }: Props) => {
  const {
    selectedModel,
    autoApprove,
    isTerminalMode,
    isToolsExpanded,
    setSelectedModel,
    setAutoApprove,
    setIsTerminalMode,
    setIsToolsExpanded,
  } = useTerminalStore();

  const models = [
    { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', description: 'Anthropic - Migliore qualità', icon: 'sparkles' },
    { id: 'gpt-oss-120b', name: 'GPT OSS 120B', description: 'OpenAI via Groq - Potente e gratuito', icon: 'logo-capacitor' },
    { id: 'gpt-oss-20b', name: 'GPT OSS 20B', description: 'OpenAI via Groq - Veloce', icon: 'flash' },
    { id: 'llama-4-scout', name: 'Llama 4 Scout', description: 'Meta via Groq - Bilanciato', icon: 'paw' },
    { id: 'qwen-3-32b', name: 'Qwen 3 32B', description: 'Alibaba via Groq - Ottimo per codice', icon: 'code-slash' },
  ];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0a0a0a', '#000000']}
        style={StyleSheet.absoluteFill}
      />

      <PanelHeader
        title="Impostazioni"
        icon="settings"
        onClose={onClose}
        style={styles.header}
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Modello AI */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Modello AI</Text>
          <Text style={styles.sectionDescription}>
            Seleziona il modello di intelligenza artificiale da utilizzare
          </Text>

          {models.map((model) => (
            <TouchableOpacity
              key={model.id}
              style={[
                styles.modelOption,
                selectedModel === model.id && styles.modelOptionSelected
              ]}
              onPress={() => setSelectedModel(model.id)}
              activeOpacity={0.7}
            >
              <View style={styles.modelInfo}>
                <View style={styles.modelHeader}>
                  <Text style={styles.modelName}>{model.name}</Text>
                  {selectedModel === model.id && (
                    <View style={styles.checkIconContainer}>
                      <Ionicons name="checkmark-circle" size={20} color={AppColors.primary} />
                    </View>
                  )}
                </View>
                <Text style={styles.modelDescription}>{model.description}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Comportamento */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Comportamento</Text>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingHeader}>
                <Ionicons name="flash" size={18} color="rgba(255, 255, 255, 0.7)" />
                <Text style={styles.settingName}>Approvazione Automatica</Text>
              </View>
              <Text style={styles.settingDescription}>
                Esegui automaticamente i comandi suggeriti dall'AI
              </Text>
            </View>
            <Switch
              value={autoApprove}
              onValueChange={setAutoApprove}
              trackColor={{ false: '#3a3a3a', true: AppColors.primary }}
              thumbColor="#ffffff"
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingHeader}>
                <Ionicons name="terminal" size={18} color="rgba(255, 255, 255, 0.7)" />
                <Text style={styles.settingName}>Modalità Terminale</Text>
              </View>
              <Text style={styles.settingDescription}>
                Visualizza l'output del terminale in tempo reale
              </Text>
            </View>
            <Switch
              value={isTerminalMode}
              onValueChange={setIsTerminalMode}
              trackColor={{ false: '#3a3a3a', true: AppColors.primary }}
              thumbColor="#ffffff"
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingHeader}>
                <Ionicons name="hammer" size={18} color="rgba(255, 255, 255, 0.7)" />
                <Text style={styles.settingName}>Strumenti Espansi</Text>
              </View>
              <Text style={styles.settingDescription}>
                Mostra tutti gli strumenti disponibili nella barra laterale
              </Text>
            </View>
            <Switch
              value={isToolsExpanded}
              onValueChange={setIsToolsExpanded}
              trackColor={{ false: '#3a3a3a', true: AppColors.primary }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        {/* Informazioni */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informazioni</Text>

          <View style={styles.infoItem}>
            <View style={styles.infoIconContainer}>
              <Ionicons name="information-circle" size={20} color={AppColors.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Versione</Text>
              <Text style={styles.infoValue}>1.0.0</Text>
            </View>
          </View>

          <View style={styles.infoItem}>
            <View style={styles.infoIconContainer}>
              <Ionicons name="logo-github" size={20} color={AppColors.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Repository</Text>
              <Text style={styles.infoValue}>github.com/drape/drape-react</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 44,
    top: 0,
    bottom: 0,
    width: 350,
    zIndex: 1002,
  },
  header: {
    paddingTop: 60,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginTop: 24,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 16,
    lineHeight: 18,
  },
  modelOption: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  modelOptionSelected: {
    backgroundColor: 'rgba(139, 124, 246, 0.1)',
    borderColor: AppColors.primary,
  },
  modelInfo: {
    flex: 1,
  },
  modelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modelName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modelDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  checkIconContainer: {
    marginLeft: 8,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  settingName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  settingDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    lineHeight: 18,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  infoIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(139, 124, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
});
