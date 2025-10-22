import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../shared/theme/colors';
import { useTerminalStore } from '../../../core/terminal/terminalStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 100;
const CARD_HEIGHT = SCREEN_HEIGHT * 0.7;

interface Props {
  onClose: () => void;
  onSelectTab: (type: string, id: string) => void;
}

export const MultitaskingPanel = ({ onClose, onSelectTab }: Props) => {
  const { workstations, removeWorkstation } = useTerminalStore();
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const tabs = [
    ...workstations.map(ws => ({
      id: ws.id,
      type: 'project',
      title: ws.name || 'Unnamed Project',
      subtitle: ws.language || 'Unknown',
      icon: 'folder' as const,
    })),
  ];

  const handleCloseTab = (e: any, id: string, type: string) => {
    e.stopPropagation();
    if (type === 'project') {
      removeWorkstation(id);
    }
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.header}>
        <Text style={styles.tabCount}>{tabs.length} {tabs.length === 1 ? 'Scheda' : 'Schede'}</Text>
        <TouchableOpacity onPress={onClose} style={styles.doneButton}>
          <Text style={styles.doneText}>Fine</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH);
          setCurrentIndex(index);
        }}
      >
        {tabs.map((tab, index) => (
          <TouchableOpacity
            key={tab.id}
            style={styles.card}
            onPress={() => {
              onSelectTab(tab.type, tab.id);
              onClose();
            }}
            activeOpacity={0.95}
          >
            <View style={styles.cardInner}>
              <LinearGradient
                colors={['rgba(139, 124, 246, 0.1)', 'rgba(124, 111, 229, 0.05)']}
                style={styles.cardGradient}
              />
              
              <TouchableOpacity 
                onPress={(e) => handleCloseTab(e, tab.id, tab.type)}
                style={styles.closeButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close-circle" size={28} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>

              <View style={styles.cardContent}>
                <View style={styles.iconContainer}>
                  <Ionicons name={tab.icon} size={48} color={AppColors.primary} />
                </View>
                <Text style={styles.cardTitle}>{tab.title}</Text>
                <Text style={styles.cardSubtitle}>{tab.subtitle}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.pagination}>
        {tabs.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              currentIndex === index && styles.dotActive
            ]}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 50,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.95)',
    zIndex: 1500,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  tabCount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  doneButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: AppColors.primary,
  },
  doneText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 25,
    alignItems: 'center',
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    marginHorizontal: 25,
    borderRadius: 24,
    overflow: 'hidden',
  },
  cardInner: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  cardGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
  },
  cardContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(139, 124, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(139, 124, 246, 0.4)',
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  cardSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 30,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: {
    width: 24,
    backgroundColor: AppColors.primary,
  },
});
