import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface BashCommandCardProps {
  /** Command input text */
  command: string;
  /** Command output text */
  output: string;
  /** Whether the command resulted in an error */
  hasError?: boolean;
}

/**
 * Card displaying a bash command with its input and output
 * Used in terminal views to show command execution results
 */
export const BashCommandCard: React.FC<BashCommandCardProps> = ({
  command,
  output,
  hasError = false,
}) => {
  const [isModalVisible, setIsModalVisible] = useState(false);

  return (
    <>
      <View style={[styles.card, hasError && styles.cardError]}>
        <View style={styles.header}>
          <Text style={styles.title}>Bash</Text>
          <TouchableOpacity
            onPress={() => setIsModalVisible(true)}
            style={styles.expandButton}
          >
            <Ionicons name="expand" size={16} color="rgba(255, 255, 255, 0.5)" />
          </TouchableOpacity>
        </View>
        <View style={styles.content}>
          <View style={styles.row}>
            <Text style={styles.label}>IN</Text>
            <Text style={styles.input} numberOfLines={2}>
              {command}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>OUT</Text>
            <Text style={styles.output} numberOfLines={3}>
              {output}
            </Text>
          </View>
        </View>
      </View>

      {/* Full screen modal */}
      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Bash Output</Text>
            <TouchableOpacity
              onPress={() => setIsModalVisible(false)}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContent}>
            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>INPUT</Text>
              <Text style={styles.modalInput}>{command}</Text>
            </View>
            <View style={styles.modalDivider} />
            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>OUTPUT</Text>
              <Text style={styles.modalOutput}>{output}</Text>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    marginBottom: 12,
  },
  cardError: {
    backgroundColor: 'rgba(40, 20, 20, 0.95)',
    borderColor: 'rgba(248, 81, 73, 0.3)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  title: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  expandButton: {
    padding: 4,
  },
  content: {
    padding: 12,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 8,
    marginHorizontal: -12,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.4)',
    width: 32,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 18,
  },
  output: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.65)',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 18,
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
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  modalInput: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.9)',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 22,
  },
  modalOutput: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.75)',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 20,
  },
  modalDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 24,
  },
});
