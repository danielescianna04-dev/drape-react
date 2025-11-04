import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { AppColors } from '../../../shared/theme/colors';

const { width, height } = Dimensions.get('window');

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
      animationType="slide"
      onRequestClose={onClose}
    >
      <BlurView intensity={40} style={styles.modalOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />

        <View style={styles.modalContainer}>
          <TouchableOpacity activeOpacity={1}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Nuova Scheda</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <View style={styles.closeButtonCircle}>
                  <Ionicons name="close" size={18} color="#8E8E93" />
                </View>
              </TouchableOpacity>
            </View>

            {/* Tab Types Grid */}
            <View style={styles.gridContainer}>
              {tabTypes.map((tabType) => (
                <TouchableOpacity
                  key={tabType.type}
                  style={styles.card}
                  onPress={() => handleSelect(tabType.type)}
                  activeOpacity={0.6}
                >
                  <LinearGradient
                    colors={[tabType.gradient[0], tabType.gradient[1]]}
                    style={styles.cardGradient}
                  >
                    <View style={styles.iconContainer}>
                      <Ionicons name={tabType.icon} size={32} color={getIconColor(tabType.type)} />
                    </View>
                    <Text style={styles.cardTitle}>{tabType.title}</Text>
                    <Text style={styles.cardDescription} numberOfLines={2}>
                      {tabType.description}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </View>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    width: width > 600 ? '85%' : '90%',
    maxWidth: 500,
    backgroundColor: 'rgba(28, 28, 30, 0.98)',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  closeButton: {
    padding: 4,
  },
  closeButtonCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(142, 142, 147, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    paddingTop: 0,
    gap: 12,
    paddingBottom: 24,
  },
  card: {
    width: (width > 600 ? 500 * 0.85 : width * 0.9 - 32 - 12) / 2 - 6,
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardGradient: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  cardDescription: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    lineHeight: 14,
    fontWeight: '400',
  },
});
