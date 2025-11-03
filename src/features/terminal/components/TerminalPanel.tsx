import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../shared/theme/colors';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { TerminalItemType } from '../../../shared/types';

interface Props {
  onClose: () => void;
}

export const TerminalPanel = ({ onClose }: Props) => {
  const scrollViewRef = useRef<ScrollView>(null);
  const { terminalItems, isLoading, clearTerminal } = useTerminalStore();

  // Auto-scroll to bottom when new items are added
  useEffect(() => {
    if (scrollViewRef.current && terminalItems.length > 0) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [terminalItems]);

  const getItemColor = (type: TerminalItemType) => {
    switch (type) {
      case TerminalItemType.COMMAND:
        return AppColors.primary;
      case TerminalItemType.OUTPUT:
        return '#FFFFFF';
      case TerminalItemType.ERROR:
        return '#FF6B6B';
      case TerminalItemType.SYSTEM:
        return '#FFA500';
      default:
        return 'rgba(255, 255, 255, 0.7)';
    }
  };

  const getItemIcon = (type: TerminalItemType) => {
    switch (type) {
      case TerminalItemType.COMMAND:
        return 'chevron-forward';
      case TerminalItemType.OUTPUT:
        return 'return-down-forward';
      case TerminalItemType.ERROR:
        return 'alert-circle';
      case TerminalItemType.SYSTEM:
        return 'information-circle';
      default:
        return 'ellipse';
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0a0a0a', '#000000']}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="terminal" size={24} color={AppColors.primary} />
          <Text style={styles.headerTitle}>Terminale</Text>
        </View>
        <View style={styles.headerActions}>
          {terminalItems.length > 0 && (
            <TouchableOpacity
              onPress={clearTerminal}
              style={styles.clearButton}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={18} color="rgba(255, 255, 255, 0.6)" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <View style={styles.closeButtonBg}>
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Terminal Status */}
      <View style={styles.statusBar}>
        <View style={styles.statusIndicator}>
          <View style={[styles.statusDot, isLoading && styles.statusDotActive]} />
          <Text style={styles.statusText}>
            {isLoading ? 'In esecuzione...' : 'Pronto'}
          </Text>
        </View>
        <Text style={styles.itemCount}>{terminalItems.length} elementi</Text>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {terminalItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="terminal-outline" size={48} color="rgba(255, 255, 255, 0.3)" />
            <Text style={styles.emptyText}>Terminale vuoto</Text>
            <Text style={styles.emptySubtext}>
              I comandi eseguiti e il loro output appariranno qui
            </Text>
          </View>
        ) : (
          <View style={styles.terminalList}>
            {terminalItems.map((item, index) => (
              <View key={item.id || index} style={styles.terminalItem}>
                <View style={styles.terminalItemHeader}>
                  <View style={styles.terminalItemLeft}>
                    <Ionicons
                      name={getItemIcon(item.type)}
                      size={14}
                      color={getItemColor(item.type)}
                    />
                    <Text style={[styles.terminalItemType, { color: getItemColor(item.type) }]}>
                      {item.type.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.terminalItemTime}>
                    {formatTimestamp(item.timestamp)}
                  </Text>
                </View>

                <View style={styles.terminalItemContent}>
                  <Text
                    style={[
                      styles.terminalItemText,
                      { color: getItemColor(item.type) }
                    ]}
                    selectable
                  >
                    {item.content}
                  </Text>

                  {item.errorDetails && (
                    <View style={styles.errorDetails}>
                      <Ionicons name="information-circle-outline" size={14} color="#FF6B6B" />
                      <Text style={styles.errorDetailsText}>{item.errorDetails}</Text>
                    </View>
                  )}

                  {item.exitCode !== undefined && item.exitCode !== 0 && (
                    <View style={styles.exitCode}>
                      <Text style={styles.exitCodeText}>Exit Code: {item.exitCode}</Text>
                    </View>
                  )}
                </View>
              </View>
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
    width: 400,
    zIndex: 1002,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clearButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  statusDotActive: {
    backgroundColor: AppColors.primary,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  itemCount: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 18,
  },
  terminalList: {
    gap: 12,
  },
  terminalItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  terminalItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  terminalItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  terminalItemType: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  terminalItemTime: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.4)',
    fontFamily: 'monospace',
  },
  terminalItemContent: {
    padding: 12,
  },
  terminalItemText: {
    fontSize: 13,
    fontFamily: 'monospace',
    lineHeight: 20,
  },
  errorDetails: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
    padding: 8,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.2)',
  },
  errorDetailsText: {
    flex: 1,
    fontSize: 12,
    color: '#FF6B6B',
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  exitCode: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 165, 0, 0.1)',
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  exitCodeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFA500',
    fontFamily: 'monospace',
  },
});
