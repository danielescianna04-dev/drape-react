import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Platform, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { TerminalItem as TerminalItemType, TerminalItemType as ItemType } from '../../../shared/types';
import { AppColors } from '../../../shared/theme/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

const colors = AppColors.dark;

interface Props {
  item: TerminalItemType;
  isNextItemOutput?: boolean;
  outputItem?: TerminalItemType; // For terminal commands, include the output
}

export const TerminalItem = ({ item, isNextItemOutput, outputItem }: Props) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [dotCount, setDotCount] = useState(1);


  // Protezione per content null/undefined
  if (!item || item.content == null) {
    return null;
  }
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Animated dots for loading state
  useEffect(() => {
    if (item.type === ItemType.LOADING) {
      const interval = setInterval(() => {
        setDotCount((prev) => (prev >= 3 ? 1 : prev + 1));
      }, 500);
      return () => clearInterval(interval);
    }
  }, [item.type]);

  const getTextColor = () => {
    switch (item.type) {
      case ItemType.COMMAND:
        return AppColors.primary;
      case ItemType.ERROR:
        return AppColors.error;
      case ItemType.SYSTEM:
        return AppColors.warning;
      default:
        return colors.bodyText;
    }
  };

  const isTerminalCommand = item.type === ItemType.COMMAND && (item.content || '').match(/^(ls|cd|pwd|mkdir|rm|cp|mv|cat|echo|touch|grep|find|chmod|chown|ps|kill|top|df|du|tar|zip|unzip|wget|curl|git|npm|node|python|pip|java|gcc|make|docker|kubectl)/i);

  // Check if this is a user message (COMMAND that is not a terminal command)
  const isUserMessage = item.type === ItemType.COMMAND && !isTerminalCommand;

  // Determine dot color based on item type and success
  let dotColor = '#6E7681'; // Default gray
  if (item.type === ItemType.COMMAND && isTerminalCommand && outputItem) {
    // Only check for actual errors (starting with "Error:" or "ERROR:")
    const hasError = (outputItem.content || '').match(/^Error:/i) ||
                     (outputItem.content || '').match(/^ERROR:/i);
    dotColor = hasError ? '#F85149' : '#3FB950'; // Red for error, green for success
  } else if (item.type === ItemType.ERROR) {
    dotColor = '#F85149'; // Red for errors
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {/* Thread line and dot on the left - only for AI messages and bash commands */}
      {!isUserMessage && (
        <View style={styles.threadContainer}>
          <View style={[styles.threadDot, { backgroundColor: dotColor }]} />
          {isNextItemOutput && <View style={styles.threadLine} />}
        </View>
      )}

      {/* Main content */}
      <View style={[styles.contentContainer, isUserMessage && styles.userMessageContainer]}>
      {item.type === ItemType.COMMAND && (
        isTerminalCommand && outputItem ? (
          // Terminal command with output - show as card with title
          (() => {
            const hasError = (outputItem.content || '').toLowerCase().includes('error') ||
                             (outputItem.content || '').startsWith('Error:');

            // Check if this is a read file command (cat)
            const isCatCommand = (item.content || '').trim().startsWith('cat ');

            if (isCatCommand) {
              // Extract file path and line count from output
              // Output format: "Reading: filename\n140 lines\n\ncontent..."
              const outputText = outputItem.content || '';
              const lines = outputText.split('\n');

              // Extract filename from first line "Reading: filename"
              const fileNameMatch = lines[0]?.match(/Reading:\s*(.+)/);
              const fileName = fileNameMatch ? fileNameMatch[1] : (item.content || '').replace('cat ', '').trim();

              // Extract line count from second line "140 lines"
              const lineCountMatch = lines[1]?.match(/(\d+)\s+lines?/);
              const lineCount = lineCountMatch ? lineCountMatch[1] : lines.length;

              // Show inline format: READ filename (X lines)
              return (
                <View style={styles.readFileInline}>
                  <Text style={styles.readFileLabel}>READ</Text>
                  <Text style={styles.readFileName}>{fileName}</Text>
                  <Text style={styles.readFileInfo}>({lineCount} lines)</Text>
                </View>
              );
            }

            return (
              <View style={[styles.bashCard, hasError && styles.bashCardError]}>
                <View style={styles.bashHeader}>
                  <Text style={styles.bashTitle}>Bash</Text>
              <TouchableOpacity
                onPress={() => setIsModalVisible(true)}
                style={styles.expandButton}
              >
                <Ionicons name="expand" size={16} color="rgba(255, 255, 255, 0.5)" />
              </TouchableOpacity>
            </View>
            <View style={styles.bashContent}>
              <View style={styles.bashRow}>
                <Text style={styles.bashLabel}>IN</Text>
                <Text style={styles.bashInput} numberOfLines={2}>{item.content || ''}</Text>
              </View>
              <View style={styles.bashDivider} />
              <View style={styles.bashRow}>
                <Text style={styles.bashLabel}>OUT</Text>
                <Text style={styles.bashOutput} numberOfLines={3}>{outputItem.content || ''}</Text>
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
                    <Text style={styles.modalInput}>{item.content || ''}</Text>
                  </View>
                  <View style={styles.modalDivider} />
                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>OUTPUT</Text>
                    <Text style={styles.modalOutput}>{outputItem.content || ''}</Text>
                  </View>
                </ScrollView>
              </View>
            </Modal>
              </View>
            );
          })()
        ) : isTerminalCommand ? (
          <View style={styles.terminalCommand}>
            <Text style={styles.terminalPrompt}>$ </Text>
            <Text style={styles.terminalText}>{item.content || ''}</Text>
          </View>
        ) : (
          <View style={styles.userMessageBlock}>
            <View style={styles.userMessageCard}>
              <Text style={styles.userMessage}>{item.content || ''}</Text>
            </View>
          </View>
        )
      )}

      {item.type === ItemType.OUTPUT && (
        // Check if this is a file edit output (standalone, without COMMAND)
        (item.content || '').startsWith('Edit ') ? (
          (() => {
            const lines = (item.content || '').split('\n');
            const editHeader = lines[0]; // "Edit file.txt"
            const editSubheader = lines[1]; // "└─ Added X lines"
            const codeLines = lines.slice(2); // Skip empty line and get code

            return (
              <View>
                {/* Header and stats outside the card */}
                <Text style={styles.editFileHeader}>{editHeader}</Text>
                {editSubheader && (
                  <Text style={styles.editFileStats}>{editSubheader}</Text>
                )}

                {/* Card with code only, no header */}
                <View style={styles.editCard}>
                  <TouchableOpacity
                    onPress={() => setIsModalVisible(true)}
                    style={styles.editExpandButton}
                  >
                    <Text style={styles.editExpandText}>Click to expand</Text>
                  </TouchableOpacity>
                  <View style={styles.editContent}>
                    {codeLines.map((line, index) => {
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
                              styles.terminalOutputLine,
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
                    {(item.content || '').split('\n').map((line, index) => {
                      const isAddedLine = line.startsWith('+ ');
                      const isEditHeader = line.startsWith('Edit ');
                      const isEditSubheader = line.startsWith('└─');

                      return (
                        <View
                          key={index}
                          style={[
                            isAddedLine && styles.addedLine,
                          ]}
                        >
                          <Text
                            style={[
                              styles.modalOutput,
                              isEditHeader && styles.editHeader,
                              isEditSubheader && styles.editSubheader,
                              isAddedLine && { color: '#3FB950' },
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
            );
          })()
        ) : isTerminalCommand ? (
          // Regular terminal output
          <Text style={styles.terminalOutput}>{item.content || ''}</Text>
        ) : (
          <View style={styles.assistantMessageContent}>
            <Text style={styles.assistantMessage}>{item.content || ''}</Text>
          </View>
        )
      )}

      {item.type === ItemType.ERROR && (
        <View style={styles.messageBlock}>
          <Text style={styles.errorName}>Error</Text>
          <Text style={styles.errorMessage}>{item.content || ''}</Text>
        </View>
      )}

      {item.type === ItemType.SYSTEM && (
        item.content === 'Cloning repository to workstation' ? (
          // Show as Git Clone card when it's the cloning message (finished loading)
          <View style={styles.loadingCard}>
            <View style={styles.loadingHeader}>
              <Text style={styles.loadingTitle}>Git Clone</Text>
            </View>
            <View style={styles.loadingBody}>
              <View style={styles.loadingRow}>
                <Text style={styles.loadingLabel}>STATUS</Text>
                <Text style={styles.loadingStatus}>{item.content}</Text>
              </View>
            </View>
          </View>
        ) : (
          // Normal system message
          <View style={styles.systemBlock}>
            <Text style={styles.systemText}>{item.content || ''}</Text>
          </View>
        )
      )}

      {item.type === ItemType.LOADING && (
        <View style={styles.loadingCard}>
          <View style={styles.loadingHeader}>
            <Text style={styles.loadingTitle}>Git Clone</Text>
          </View>
          <View style={styles.loadingBody}>
            <View style={styles.loadingRow}>
              <Text style={styles.loadingLabel}>STATUS</Text>
              <Text style={styles.loadingStatus}>
                {item.content || ''}
                {'.'.repeat(dotCount)}
              </Text>
            </View>
          </View>
        </View>
      )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: 16,
    marginTop: 8, // Add space above each message card
  },
  threadContainer: {
    width: 32,
    alignItems: 'center',
    position: 'relative',
  },
  threadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#6E7681',
    marginTop: 8,
    zIndex: 2,
  },
  threadLine: {
    position: 'absolute',
    top: 18,
    bottom: -40,
    width: 2,
    backgroundColor: 'rgba(110, 118, 129, 0.3)',
    zIndex: 1,
  },
  contentContainer: {
    flex: 1,
  },
  userMessageContainer: {
    marginLeft: 0, // No thread container for user messages
  },
  readFileInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  readFileLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8B949E',
    letterSpacing: 0.5,
  },
  readFileName: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  readFileInfo: {
    fontSize: 12,
    color: '#6E7681',
  },
  // Terminal styles
  terminalCommand: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  terminalPrompt: {
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#00FF88',
    fontWeight: '600',
  },
  terminalText: {
    flex: 1,
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: 'rgba(255, 255, 255, 0.95)',
    lineHeight: 22,
  },
  terminalOutput: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 20,
    marginBottom: 12,
  },
  terminalOutputLine: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#C9D1D9',
    lineHeight: 20,
    flex: 1,
  },
  addedLine: {
    color: '#3FB950',
    backgroundColor: 'rgba(63, 185, 80, 0.1)',
    paddingLeft: 4,
  },
  removedLine: {
    color: '#F85149',
    backgroundColor: 'rgba(248, 81, 73, 0.1)',
    paddingLeft: 4,
  },
  editHeader: {
    color: '#58A6FF',
    fontWeight: '600',
    marginTop: 4,
  },
  editSubheader: {
    color: '#8B949E',
    fontSize: 12,
    marginBottom: 8,
  },
  editFileHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: '#58A6FF',
    marginBottom: 4,
  },
  editFileStats: {
    fontSize: 12,
    color: '#8B949E',
    marginBottom: 8,
  },
  editCard: {
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    position: 'relative',
  },
  editContent: {
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
    userSelect: 'none',
  },
  editExpandButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  editExpandText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  // Bash card styles (terminal command + output grouped)
  bashCard: {
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    marginBottom: 12,
  },
  bashCardError: {
    backgroundColor: 'rgba(40, 20, 20, 0.95)',
    borderColor: 'rgba(248, 81, 73, 0.3)',
  },
  bashHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  bashTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  expandButton: {
    padding: 4,
  },
  bashContent: {
    padding: 12,
  },
  bashRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bashDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 8,
    marginHorizontal: -12, // Extend to card edges (compensate for bashContent padding)
  },
  bashLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.4)',
    width: 32,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  bashInput: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 18,
  },
  bashOutput: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.65)',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 18,
  },
  // Modal styles
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
    paddingTop: 60, // Safe area
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
  // Minimal professional chat styles
  messageBlock: {
    marginBottom: 4,
  },
  userMessageBlock: {
    marginBottom: 4,
    alignItems: 'flex-start',
  },
  userMessageCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  assistantMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  assistantMessageContent: {
    flex: 1,
  },
  userName: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 4,
    textAlign: 'right',
  },
  assistantName: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'left',
  },
  errorName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E85D75',
    marginBottom: 4,
  },
  userMessage: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.95)',
    lineHeight: 22,
    fontWeight: '400',
  },
  assistantMessage: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 22,
    fontWeight: '400',
    textAlign: 'left',
  },
  errorMessage: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 20,
    fontWeight: '400',
  },
  systemBlock: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 6,
  },
  systemText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    fontWeight: '500',
  },
  // Loading card styles (same as bash card)
  loadingCard: {
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    marginBottom: 12,
  },
  loadingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  loadingTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  loadingBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  loadingLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(139, 124, 246, 0.6)',
    letterSpacing: 0.5,
    width: 48,
    flexShrink: 0,
  },
  loadingStatus: {
    flex: 1,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: 'rgba(139, 124, 246, 0.9)',
    lineHeight: 18,
  },
});
