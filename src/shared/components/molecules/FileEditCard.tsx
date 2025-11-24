import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface FileEditCardProps {
  /** File path being edited */
  filePath: string;
  /** Edit stats (e.g., "Added 5 lines") */
  stats?: string;
  /** Array of diff lines with prefixes (+, -, or two spaces) */
  diffLines: string[];
}

/**
 * Card displaying file edit diffs with syntax highlighting
 * Used to show code changes in terminal views
 */
export const FileEditCard: React.FC<FileEditCardProps> = ({
  filePath,
  stats,
  diffLines,
}) => {
  const [isModalVisible, setIsModalVisible] = useState(false);

  return (
    <>
      <View>
        {/* Header and stats outside the card */}
        <Text style={styles.header}>Edit {filePath}</Text>
        {stats && <Text style={styles.stats}>{stats}</Text>}

        {/* Card with code only, no header */}
        <View style={styles.card}>
          <TouchableOpacity
            onPress={() => setIsModalVisible(true)}
            style={styles.expandButton}
          >
            <Text style={styles.expandText}>Click to expand</Text>
          </TouchableOpacity>
          <View style={styles.content}>
            {diffLines.map((line, index) => {
              const isAddedLine = line.startsWith('+ ');
              const isRemovedLine = line.startsWith('- ');
              const isContextLine = line.startsWith('  ');

              // Skip empty lines at the beginning
              if (line.trim() === '' && index === 0) return null;

              // Calculate line number (starting from 1)
              const lineNumber = index + 1;

              return (
                <View
                  key={index}
                  style={[
                    styles.diffLine,
                    isAddedLine && styles.addedLine,
                    isRemovedLine && styles.removedLine,
                  ]}
                >
                  <Text style={styles.lineNumber}>{lineNumber}</Text>
                  <Text
                    style={[
                      styles.codeLine,
                      isAddedLine && { color: '#3FB950' },
                      isRemovedLine && { color: '#F85149' },
                      isContextLine && { color: '#8B949E' },
                    ]}
                  >
                    {line}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Full screen modal for file edit */}
        <Modal
          visible={isModalVisible}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setIsModalVisible(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>File Edit</Text>
              <TouchableOpacity
                onPress={() => setIsModalVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              <View style={styles.modalSection}>
                <Text style={styles.modalFilePath}>{filePath}</Text>
                {stats && <Text style={styles.modalStats}>{stats}</Text>}
                {diffLines.map((line, index) => {
                  const isAddedLine = line.startsWith('+ ');
                  const isRemovedLine = line.startsWith('- ');

                  return (
                    <View
                      key={index}
                      style={[
                        isAddedLine && styles.addedLine,
                        isRemovedLine && styles.removedLine,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modalCode,
                          isAddedLine && { color: '#3FB950' },
                          isRemovedLine && { color: '#F85149' },
                        ]}
                      >
                        {line}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </Modal>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  header: {
    fontSize: 14,
    fontWeight: '600',
    color: '#58A6FF',
    marginBottom: 4,
  },
  stats: {
    fontSize: 12,
    color: '#8B949E',
    marginBottom: 8,
  },
  card: {
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    position: 'relative',
  },
  content: {
    padding: 12,
  },
  diffLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  lineNumber: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#6E7681',
    minWidth: 40,
    textAlign: 'right',
    paddingRight: 12,
  },
  codeLine: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#C9D1D9',
    lineHeight: 20,
    flex: 1,
  },
  addedLine: {
    backgroundColor: 'rgba(63, 185, 80, 0.1)',
    paddingLeft: 4,
  },
  removedLine: {
    backgroundColor: 'rgba(248, 81, 73, 0.1)',
    paddingLeft: 4,
  },
  expandButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  expandText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 60,
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  closeButton: {
    padding: 8,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  modalSection: {
    marginBottom: 24,
  },
  modalFilePath: {
    fontSize: 16,
    fontWeight: '600',
    color: '#58A6FF',
    marginBottom: 8,
  },
  modalStats: {
    fontSize: 14,
    color: '#8B949E',
    marginBottom: 16,
  },
  modalCode: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.75)',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 20,
  },
});
