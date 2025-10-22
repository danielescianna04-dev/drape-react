import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../shared/theme/colors';
import { useTerminalStore } from '../../../core/terminal/terminalStore';

interface Props {
  onClose: () => void;
  onSelectTab: (type: string, id: string) => void;
}

export const MultitaskingPanel = ({ onClose, onSelectTab }: Props) => {
  const { workstations, removeWorkstation } = useTerminalStore();

  const tabs = [
    ...workstations.map(ws => ({
      id: ws.id,
      type: 'project',
      title: ws.name || 'Unnamed Project',
      subtitle: ws.language || 'Unknown',
      icon: 'folder' as const,
      color: AppColors.primary,
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
      <LinearGradient 
        colors={['rgba(0,0,0,0.95)', 'rgba(0,0,0,0.98)']} 
        style={StyleSheet.absoluteFill} 
      />
      
      <View style={styles.header}>
        <Text style={styles.tabCount}>{tabs.length} {tabs.length === 1 ? 'Scheda' : 'Schede'}</Text>
        <TouchableOpacity onPress={onClose} style={styles.doneButton}>
          <Text style={styles.doneText}>Fine</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {tabs.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="albums-outline" size={64} color="rgba(255,255,255,0.2)" />
            <Text style={styles.emptyText}>Nessuna scheda aperta</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={styles.card}
                onPress={() => {
                  onSelectTab(tab.type, tab.id);
                  onClose();
                }}
                activeOpacity={0.9}
              >
                <View style={styles.cardPreview}>
                  <LinearGradient
                    colors={['rgba(139, 124, 246, 0.1)', 'rgba(139, 124, 246, 0.05)']}
                    style={styles.previewGradient}
                  />
                  <View style={styles.previewContent}>
                    <Ionicons name={tab.icon} size={32} color={tab.color} />
                    <Text style={styles.previewTitle} numberOfLines={2}>{tab.title}</Text>
                    <Text style={styles.previewSubtitle}>{tab.subtitle}</Text>
                  </View>
                </View>
                
                <View style={styles.cardFooter}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{tab.title}</Text>
                  <TouchableOpacity 
                    onPress={(e) => handleCloseTab(e, tab.id, tab.type)}
                    style={styles.closeButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close" size={16} color="rgba(255,255,255,0.6)" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.newTabButton}>
          <Ionicons name="add" size={24} color={AppColors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 2000,
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
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  doneButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: AppColors.primary,
  },
  doneText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
  },
  emptyText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  card: {
    width: '47%',
    aspectRatio: 0.7,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  cardPreview: {
    flex: 1,
    position: 'relative',
  },
  previewGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  previewContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 16,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  previewSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  cardTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  closeButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 40,
    paddingTop: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  newTabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(139, 124, 246, 0.2)',
    borderWidth: 2,
    borderColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
