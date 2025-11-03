import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../shared/theme/colors';

const { width } = Dimensions.get('window');

export type TabType = 'chat' | 'terminal' | 'github' | 'browser' | 'file' | 'preview';

interface TabTypeOption {
  type: TabType;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  gradient: string[];
}

const tabTypes: TabTypeOption[] = [
  {
    type: 'chat',
    title: 'Chat AI',
    description: 'Conversa con l\'intelligenza artificiale',
    icon: 'chatbubbles',
    gradient: ['rgba(139, 124, 246, 0.2)', 'rgba(139, 124, 246, 0.05)'],
  },
  {
    type: 'terminal',
    title: 'Terminal',
    description: 'Esegui comandi nel terminale',
    icon: 'terminal',
    gradient: ['rgba(0, 208, 132, 0.2)', 'rgba(0, 208, 132, 0.05)'],
  },
  {
    type: 'github',
    title: 'GitHub',
    description: 'Gestisci repository e commit',
    icon: 'logo-github',
    gradient: ['rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0.05)'],
  },
  {
    type: 'browser',
    title: 'Browser',
    description: 'Naviga sul web',
    icon: 'globe',
    gradient: ['rgba(74, 144, 226, 0.2)', 'rgba(74, 144, 226, 0.05)'],
  },
  {
    type: 'preview',
    title: 'Preview',
    description: 'Anteprima live dell\'app',
    icon: 'eye',
    gradient: ['rgba(255, 107, 107, 0.2)', 'rgba(255, 107, 107, 0.05)'],
  },
  {
    type: 'file',
    title: 'File',
    description: 'Apri un file del progetto',
    icon: 'document-text',
    gradient: ['rgba(255, 165, 0, 0.2)', 'rgba(255, 165, 0, 0.05)'],
  },
];

const getIconColor = (type: TabType): string => {
  switch (type) {
    case 'chat': return AppColors.primary;
    case 'terminal': return '#00D084';
    case 'github': return '#FFFFFF';
    case 'browser': return '#4A90E2';
    case 'preview': return '#FF6B6B';
    case 'file': return '#FFA500';
    default: return '#FFFFFF';
  }
};

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectType: (type: TabType) => void;
}

export const TabTypeSelector = ({ visible, onClose, onSelectType }: Props) => {
  const handleSelect = (type: TabType) => {
    onSelectType(type);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity activeOpacity={1}>
            <LinearGradient
              colors={['#1a1a1a', '#0a0a0a']}
              style={styles.modalGradient}
            >
              {/* Header */}
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderLeft}>
                  <LinearGradient
                    colors={['rgba(139, 124, 246, 0.2)', 'rgba(139, 124, 246, 0.05)']}
                    style={styles.iconCircle}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Ionicons name="add-circle" size={24} color={AppColors.primary} />
                  </LinearGradient>
                  <View>
                    <Text style={styles.modalTitle}>Nuova Scheda</Text>
                    <Text style={styles.modalSubtitle}>Scegli il tipo di scheda da aprire</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.7}>
                  <Ionicons name="close" size={22} color="rgba(255, 255, 255, 0.7)" />
                </TouchableOpacity>
              </View>

              {/* Tab Types Grid */}
              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.tabTypesGrid}
                showsVerticalScrollIndicator={false}
              >
                {tabTypes.map((tabType) => (
                  <TouchableOpacity
                    key={tabType.type}
                    style={styles.tabTypeCard}
                    onPress={() => handleSelect(tabType.type)}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={tabType.gradient}
                      style={styles.tabTypeCardGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <View style={styles.tabTypeIconContainer}>
                        <Ionicons name={tabType.icon} size={32} color={getIconColor(tabType.type)} />
                      </View>
                      <Text style={styles.tabTypeTitle}>{tabType.title}</Text>
                      <Text style={styles.tabTypeDescription}>{tabType.description}</Text>

                      <View style={styles.tabTypeArrow}>
                        <Ionicons name="chevron-forward" size={18} color="rgba(255, 255, 255, 0.4)" />
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: width > 600 ? 600 : '100%',
    maxHeight: '85%',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  modalGradient: {
    width: '100%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.3)',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  modalSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  scrollView: {
    maxHeight: 500,
  },
  tabTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
    gap: 14,
  },
  tabTypeCard: {
    width: width > 600 ? '47%' : '46%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  tabTypeCardGradient: {
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    minHeight: 170,
    position: 'relative',
  },
  tabTypeIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  tabTypeTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  tabTypeDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 19,
    marginBottom: 8,
    fontWeight: '500',
  },
  tabTypeArrow: {
    position: 'absolute',
    bottom: 18,
    right: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
