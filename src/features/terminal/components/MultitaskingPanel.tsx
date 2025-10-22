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
  const { workstations } = useTerminalStore();

  const tabs = [
    ...workstations.map(ws => ({
      id: ws.id,
      type: 'project',
      title: ws.name || 'Unnamed Project',
      subtitle: ws.language || 'Unknown',
      icon: 'folder' as const,
    })),
  ];

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1e1e1e', '#1a1a1a']} style={StyleSheet.absoluteFill} />
      
      <View style={styles.header}>
        <Text style={styles.title}>Schede Aperte</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={20} color="#888" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {tabs.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="albums-outline" size={48} color="rgba(255,255,255,0.2)" />
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
                activeOpacity={0.7}
              >
                <View style={styles.cardContent}>
                  <Ionicons name={tab.icon} size={24} color={AppColors.primary} />
                  <Text style={styles.cardTitle} numberOfLines={1}>{tab.title}</Text>
                  <Text style={styles.cardSubtitle} numberOfLines={1}>{tab.subtitle}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 50,
    top: 0,
    bottom: 0,
    width: '70%',
    maxWidth: 320,
    zIndex: 1000,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  closeButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 12,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 12,
  },
  grid: {
    gap: 12,
  },
  card: {
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  cardContent: {
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  cardSubtitle: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
});
