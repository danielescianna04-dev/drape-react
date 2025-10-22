import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
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
        colors={['#0a0a0f', '#1a1a2e', '#0f0f1e']} 
        style={StyleSheet.absoluteFill} 
      />
      
      <View style={styles.header}>
        <View>
          <Text style={styles.tabCount}>{tabs.length}</Text>
          <Text style={styles.tabLabel}>{tabs.length === 1 ? 'Scheda' : 'Schede'}</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.doneButton}>
          <LinearGradient
            colors={['#8B7CF6', '#7C6FE5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.doneGradient}
          >
            <Text style={styles.doneText}>Fine</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {tabs.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="albums-outline" size={72} color="rgba(139, 124, 246, 0.3)" />
            </View>
            <Text style={styles.emptyText}>Nessuna scheda aperta</Text>
            <Text style={styles.emptySubtext}>Tocca + per iniziare</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {tabs.map((tab, index) => (
              <TouchableOpacity
                key={tab.id}
                style={[styles.card, { 
                  transform: [{ scale: 1 }],
                  opacity: 1,
                }]}
                onPress={() => {
                  onSelectTab(tab.type, tab.id);
                  onClose();
                }}
                activeOpacity={0.95}
              >
                <View style={styles.cardShadow} />
                <View style={styles.cardInner}>
                  <View style={styles.cardPreview}>
                    <LinearGradient
                      colors={[
                        'rgba(139, 124, 246, 0.15)',
                        'rgba(124, 111, 229, 0.1)',
                        'rgba(139, 124, 246, 0.05)'
                      ]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.previewGradient}
                    />
                    <View style={styles.previewContent}>
                      <View style={styles.iconContainer}>
                        <Ionicons name={tab.icon} size={36} color={tab.color} />
                      </View>
                      <Text style={styles.previewTitle} numberOfLines={2}>{tab.title}</Text>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{tab.subtitle}</Text>
                      </View>
                    </View>
                  </View>
                  
                  <View style={styles.cardFooter}>
                    <View style={styles.footerContent}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{tab.title}</Text>
                      <TouchableOpacity 
                        onPress={(e) => handleCloseTab(e, tab.id, tab.type)}
                        style={styles.closeButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <View style={styles.closeButtonInner}>
                          <Ionicons name="close" size={14} color="#FFFFFF" />
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.newTabButton} activeOpacity={0.8}>
          <LinearGradient
            colors={['rgba(139, 124, 246, 0.3)', 'rgba(124, 111, 229, 0.2)']}
            style={styles.newTabGradient}
          >
            <Ionicons name="add" size={28} color="#FFFFFF" />
          </LinearGradient>
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
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  tabCount: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -2,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
    marginTop: -4,
  },
  doneButton: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#8B7CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  doneGradient: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  doneText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 120,
  },
  emptyIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(139, 124, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  card: {
    width: '47%',
    aspectRatio: 0.65,
    marginBottom: 8,
  },
  cardShadow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: 20,
    backgroundColor: '#8B7CF6',
    opacity: 0.15,
    shadowColor: '#8B7CF6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  cardInner: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
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
    gap: 16,
    padding: 20,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(139, 124, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(139, 124, 246, 0.3)',
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(139, 124, 246, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.4)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardFooter: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  footerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  closeButton: {
    marginLeft: 8,
  },
  closeButtonInner: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 50,
    paddingTop: 24,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  newTabButton: {
    borderRadius: 32,
    overflow: 'hidden',
    shadowColor: '#8B7CF6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  newTabGradient: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(139, 124, 246, 0.5)',
    borderRadius: 32,
  },
});
