import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Platform, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { TerminalItem as TerminalItemType, TerminalItemType as ItemType } from '../../../shared/types';
import { AppColors } from '../../../shared/theme/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { CollapsibleCodeBlock } from './CollapsibleCodeBlock';

const colors = AppColors.dark;

interface Props {
  item: TerminalItemType;
  isNextItemOutput?: boolean;
  outputItem?: TerminalItemType; // For terminal commands, include the output
  isLoading?: boolean; // For animated loading indicator
}

export const TerminalItem = ({ item, isNextItemOutput, outputItem, isLoading = false }: Props) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [dotCount, setDotCount] = useState(1);
  const [loadingDots, setLoadingDots] = useState('.');

  // 🔍 LOGGING DETTAGLIATO - Log di ogni item renderizzato
  useEffect(() => {
    const content = (item.content || '').substring(0, 200); // Primi 200 caratteri
    const outputContent = outputItem ? (outputItem.content || '').substring(0, 200) : null;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 TERMINAL ITEM RENDERED`);
    console.log(`🔹 Type: ${item.type}`);
    console.log(`🔹 Content Preview: "${content}${(item.content || '').length > 200 ? '...' : ''}"`);
    console.log(`🔹 Content Length: ${(item.content || '').length} chars`);
    if (outputItem) {
      console.log(`🔸 Has Output Item: YES`);
      console.log(`🔸 Output Type: ${outputItem.type}`);
      console.log(`🔸 Output Preview: "${outputContent}${(outputItem.content || '').length > 200 ? '...' : ''}"`);
    } else {
      console.log(`🔸 Has Output Item: NO`);
    }

    // Log se è un tool specifico
    const itemContent = item.content || '';
    if (itemContent.startsWith('Read ')) {
      console.log(`🛠️  TOOL: READ FILE`);
      console.log(`   File: ${itemContent.split('\n')[0].replace('Read ', '')}`);
    } else if (itemContent.startsWith('Write ')) {
      console.log(`🛠️  TOOL: WRITE FILE`);
    } else if (itemContent.startsWith('Edit ')) {
      console.log(`🛠️  TOOL: EDIT FILE`);
    } else if (itemContent.startsWith('Glob ')) {
      console.log(`🛠️  TOOL: GLOB FILES`);
      const lines = itemContent.split('\n');
      console.log(`   Pattern: ${lines[0].replace('Glob pattern: ', '')}`);
      console.log(`   Result: ${lines[1]}`);
    } else if (itemContent.startsWith('Search ')) {
      console.log(`🛠️  TOOL: SEARCH IN FILES`);
    } else if (itemContent.startsWith('List files')) {
      console.log(`🛠️  TOOL: LIST FILES`);
    } else if (itemContent.startsWith('Execute:')) {
      console.log(`🛠️  TOOL: EXECUTE COMMAND`);
    } else if (item.type === 'COMMAND') {
      console.log(`⌨️  COMMAND DETECTED`);
    } else if (item.type === 'USER_MESSAGE') {
      console.log(`👤 USER MESSAGE`);
    } else if (item.type === 'OUTPUT') {
      console.log(`📤 OUTPUT MESSAGE`);
    } else if (item.type === 'ERROR') {
      console.log(`❌ ERROR MESSAGE`);
    } else if (item.type === 'LOADING') {
      console.log(`⏳ LOADING STATE`);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }, [item, outputItem]);

  // Animation effect - fade in and slide
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
    if (item?.type === ItemType.LOADING) {
      const interval = setInterval(() => {
        setDotCount((prev) => (prev >= 3 ? 1 : prev + 1));
      }, 500);
      return () => clearInterval(interval);
    }
  }, [item?.type]);

  // Determine if we should show thinking state (either from parent isLoading or item.isThinking)
  const showThinking = isLoading || item?.isThinking;

  // Pulse animation for loading thread dot
  useEffect(() => {
    if (showThinking) {
      const pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      pulseAnimation.start();
      return () => pulseAnimation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [showThinking]);

  // Animated loading dots (cycles through '.', '..', '...')
  useEffect(() => {
    if (showThinking) {
      const interval = setInterval(() => {
        setLoadingDots(prev => {
          if (prev === '.') return '..';
          if (prev === '..') return '...';
          return '.';
        });
      }, 500);
      return () => clearInterval(interval);
    } else {
      setLoadingDots('.');
    }
  }, [showThinking]);

  // IMPORTANT: All hooks must be called before any conditional return!
  // Skip rendering empty placeholder messages (created for post-tool streaming)
  // BUT: Don't skip if showThinking is true - we want to show "Thinking..." indicator
  if (!item || item.content == null || (typeof item.content === 'string' && item.content.trim() === '' && !showThinking)) {
    return null;
  }

  const getTextColor = () => {
    switch (item.type) {
      case ItemType.COMMAND:
        return AppColors.primary;
      case ItemType.USER_MESSAGE:
        return colors.bodyText;
      case ItemType.ERROR:
        return AppColors.error;
      case ItemType.SYSTEM:
        return AppColors.warning;
      default:
        return colors.bodyText;
    }
  };

  const isTerminalCommand = item.type === ItemType.COMMAND && (item.content || '').match(/^(ls|cd|pwd|mkdir|rm|cp|mv|cat|echo|touch|grep|find|chmod|chown|ps|kill|top|df|du|tar|zip|unzip|wget|curl|git|npm|node|python|pip|java|gcc|make|docker|kubectl)/i);

  // Check if this is a user message
  const isUserMessage = item.type === ItemType.USER_MESSAGE;

  // Determine dot color based on item type and success
  let dotColor = '#6E7681'; // Default gray
  if (item.type === ItemType.COMMAND && isTerminalCommand && outputItem) {
    // Only check for actual errors (starting with "Error:" or "ERROR:")
    const hasError = (outputItem.content || '').match(/^Error:/i) ||
      (outputItem.content || '').match(/^ERROR:/i);
    dotColor = hasError ? '#F85149' : '#3FB950'; // Red for error, green for success
  } else if (item.type === ItemType.ERROR) {
    dotColor = '#F85149'; // Red for errors
  } else if (item.type === ItemType.OUTPUT) {
    // Check if this is a tool result (Read, Write, Edit, etc.)
    const content = item.content || '';
    const isToolResult = content.startsWith('Read ') ||
      content.startsWith('Write ') ||
      content.startsWith('Edit ') ||
      content.startsWith('List files') ||
      content.startsWith('Search ') ||
      content.startsWith('Execute:') ||
      content.startsWith('Glob ');

    if (isToolResult) {
      // Check if it has an error at the BEGINNING of the content (not in the middle)
      // Only the first 3 lines could contain an actual error message from the tool
      const firstLines = content.split('\n').slice(0, 3).join('\n');
      const hasError = firstLines.match(/^Error:/m) ||
        firstLines.match(/^ERROR:/m) ||
        firstLines.includes('└─ Error:') ||
        firstLines.includes('└─ Failed');
      dotColor = hasError ? '#F85149' : '#3FB950'; // Red for error, green for success
    }
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
          <Animated.View
            style={[
              styles.threadDot,
              { backgroundColor: dotColor },
              showThinking && { opacity: pulseAnim }
            ]}
          />
          {isNextItemOutput && <View style={styles.threadLine} />}
        </View>
      )}

      {/* Main content */}
      <View style={[styles.contentContainer, isUserMessage && styles.userMessageContainer]}>
        {item.type === ItemType.COMMAND && (
          (() => {
            // First check if output is a formatted tool result - if so, hide the COMMAND completely
            // Note: Glob is NOT included here because we want to show it as OUTPUT
            const isFormattedToolOutput = outputItem && (
              (outputItem.content || '').startsWith('Read ') ||
              (outputItem.content || '').startsWith('Write ') ||
              (outputItem.content || '').startsWith('Edit ')
            );

            // If it's a formatted tool output, don't render the COMMAND at all
            if (isFormattedToolOutput) {
              return null;
            }

            // Otherwise, render the command normally
            return isTerminalCommand && outputItem ? (
              // Terminal command with output - show as card with title
              (() => {
                // Only consider it an error if it starts with "Error:" or "ERROR:"
                const hasError = (outputItem.content || '').match(/^Error:/i) ||
                  (outputItem.content || '').match(/^ERROR:/i);

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
                      <View style={styles.toolBadge}>
                        <Ionicons name="document-text-outline" size={12} color="#58A6FF" />
                        <Text style={styles.toolBadgeText}>READ</Text>
                      </View>
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
            );
          })()
        )}

        {item.type === ItemType.USER_MESSAGE && (
          <View style={styles.userMessageBlock}>
            <View style={styles.userMessageCard}>
              <Text style={styles.userMessage}>{item.content || ''}</Text>
            </View>
          </View>
        )}

        {item.type === ItemType.OUTPUT && (
          // Check if this is a tool executing indicator
          (item.content || '').startsWith('Executing: ') ? (
            (() => {
              const toolName = (item.content || '').replace('Executing: ', '');
              // Map tool names to friendly names and icons
              const toolConfig: Record<string, { icon: string; label: string; color: string }> = {
                'read_file': { icon: 'document-text-outline', label: 'Reading', color: '#58A6FF' },
                'glob_files': { icon: 'search-outline', label: 'Searching', color: '#A371F7' },
                'edit_file': { icon: 'create-outline', label: 'Editing', color: '#3FB950' },
                'write_file': { icon: 'save-outline', label: 'Writing', color: '#3FB950' },
                'search_in_files': { icon: 'code-slash-outline', label: 'Searching', color: '#FFA657' },
                'list_files': { icon: 'folder-outline', label: 'Listing', color: '#58A6FF' },
              };
              const config = toolConfig[toolName] || { icon: 'cog-outline', label: 'Executing', color: '#8B949E' };

              return (
                <View style={styles.readFileInline}>
                  <View style={[styles.toolBadge, { backgroundColor: `${config.color}15`, borderColor: `${config.color}30` }]}>
                    <Ionicons name={config.icon as any} size={12} color={config.color} />
                    <Text style={[styles.toolBadgeText, { color: config.color }]}>{config.label.toUpperCase()}</Text>
                  </View>
                  <Animated.View style={{ opacity: pulseAnim }}>
                    <Text style={[styles.readFileName, { color: 'rgba(255,255,255,0.5)' }]}>...</Text>
                  </Animated.View>
                </View>
              );
            })()
          ) : // Check if this is a Read tool result
            (item.content || '').startsWith('Read ') ? (
              (() => {
                const content = item.content || '';
                const lines = content.split('\n');
                const fullHeader = lines[0]; // "Read filename.ts"
                const fileName = fullHeader.replace('Read ', ''); // Extract just the filename
                const stats = lines[1]; // "└─ X lines"
                const fileContent = lines.slice(3).join('\n'); // Skip empty line

                return (
                  <View style={styles.readFileInline}>
                    <View style={styles.toolBadge}>
                      <Ionicons name="document-text-outline" size={12} color="#58A6FF" />
                      <Text style={styles.toolBadgeText}>READ</Text>
                    </View>
                    <Text style={styles.readFileName}>{fileName}</Text>
                  </View>
                );
              })()
            ) : // Check if this is a Glob tool result
              (item.content || '').startsWith('Glob ') ? (
                (() => {
                  const content = item.content || '';
                  const lines = content.split('\n');
                  const fullHeader = lines[0]; // "Glob pattern: **/*.ts"
                  const pattern = fullHeader.replace('Glob pattern: ', ''); // Extract pattern
                  const stats = lines[1]; // "└─ Found X file(s)"

                  return (
                    <View>
                      <View style={styles.readFileInline}>
                        <View style={[styles.toolBadge, styles.toolBadgeGlob]}>
                          <Ionicons name="search-outline" size={12} color="#A371F7" />
                          <Text style={[styles.toolBadgeText, { color: '#A371F7' }]}>GLOB</Text>
                        </View>
                        <Text style={styles.readFileName}>{pattern}</Text>
                      </View>
                      {stats && (
                        <Text style={styles.globStats}>{stats}</Text>
                      )}
                    </View>
                  );
                })()
              ) : // Check if this is a file edit output (standalone, without COMMAND)

                (item.content || '').startsWith('Edit ') ? (
                  (() => {
                    const lines = (item.content || '').split('\n');
                    const editHeader = lines[0]; // "Edit file.txt"
                    const editSubheader = lines[1]; // "└─ Applied change"
                    const codeLines = lines.slice(2); // Skip empty line and get code

                    const fileName = editHeader.replace('Edit ', '');

                    // Inline expansion state specific to this item rendering
                    // Note: Since we are inside a map/render function, we can't use hooks here directly for *each* item if not careful.
                    // But TerminalItem IS the component for individual item.
                    // So we can use a state in TerminalItem component.
                    // However, TerminalItem renders ONE item. So `isDiffExpanded` state is fine.

                    return (
                      <View>
                        {/* Header with badge */}
                        <View style={styles.readFileInline}>
                          <View style={[styles.toolBadge, styles.toolBadgeEdit]}>
                            <Ionicons name="create-outline" size={12} color="#3FB950" />
                            <Text style={[styles.toolBadgeText, { color: '#3FB950' }]}>EDIT</Text>
                          </View>
                          <Text style={styles.readFileName}>{fileName}</Text>
                        </View>

                        {/* Card with collapsible code */}
                        <View style={[styles.editCard, !isExpanded && { maxHeight: 'auto' }]}>
                          <View style={styles.editContent}>
                            {codeLines.slice(0, isExpanded ? undefined : 4).map((line, index) => {
                              const isAddedLine = line.startsWith('+ ');
                              const isRemovedLine = line.startsWith('- ');
                              const isContextLine = line.startsWith('  ');

                              // Calculate line number (approximate since we don't have context)
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
                                  {/* Removing line numbers for diffs as they might be misleading without proper context counting */}
                                  {/* <Text style={styles.lineNumber}>{lineNumber}</Text> */}
                                  <Text
                                    style={[
                                      styles.terminalOutputLine,
                                      isAddedLine && { color: '#3FB950' },
                                      isRemovedLine && { color: '#F85149' },
                                      isContextLine && { color: '#8B949E' },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {line}
                                  </Text>
                                </View>
                              );
                            })}

                            {!isExpanded && codeLines.length > 4 && (
                              <View style={styles.expandOverlay}>
                                <LinearGradient
                                  colors={['transparent', 'rgba(20, 20, 20, 0.95)']}
                                  style={styles.gradientOverlay}
                                />
                                <TouchableOpacity
                                  onPress={() => setIsExpanded(true)}
                                  style={styles.showMoreButton}
                                >
                                  <Text style={styles.showMoreText}>Show {codeLines.length - 4} more lines</Text>
                                  <Ionicons name="chevron-down" size={14} color="#8B949E" />
                                </TouchableOpacity>
                              </View>
                            )}

                            {isExpanded && codeLines.length > 4 && (
                              <TouchableOpacity
                                onPress={() => setIsExpanded(false)}
                                style={styles.showLessButton}
                              >
                                <Text style={styles.showMoreText}>Show less</Text>
                                <Ionicons name="chevron-up" size={14} color="#8B949E" />
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      </View>
                    );
                  })()
                ) : isTerminalCommand ? (
                  // Regular terminal output
                  <Text style={styles.terminalOutput}>{item.content || ''}</Text>
                ) : (
                  <View style={styles.assistantMessageContent}>
                    {showThinking && !item.content ? (
                      <Text style={styles.loadingText}>Thinking{loadingDots}</Text>
                    ) : (
                      <View style={{ overflow: 'hidden', flex: 1 }}>
                        <Markdown style={markdownStyles} rules={markdownRules}>{item.content || ''}</Markdown>
                      </View>
                    )}
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

        {item.type === ItemType.BACKEND_LOG && (
          <View style={styles.backendLogBlock}>
            <View style={styles.backendLogHeader}>
              <Ionicons name="server-outline" size={12} color="#8B949E" />
              <Text style={styles.backendLogLabel}>BACKEND</Text>
              <Text style={styles.backendLogTime}>
                {item.timestamp ? new Date(item.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
              </Text>
            </View>
            <Text style={styles.backendLogText}>{item.content || ''}</Text>
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
    bottom: -24, // Reduced from -40 to prevent line from extending too far
    width: 2,
    backgroundColor: 'rgba(110, 118, 129, 0.3)',
    zIndex: 1,
  },
  contentContainer: {
    flex: 1,
    overflow: 'hidden', // Prevent content from overflowing horizontally
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
  toolBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(88, 166, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(88, 166, 255, 0.3)',
  },
  toolBadgeGlob: {
    backgroundColor: 'rgba(163, 113, 247, 0.15)',
    borderColor: 'rgba(163, 113, 247, 0.3)',
  },
  toolBadgeEdit: {
    backgroundColor: 'rgba(63, 185, 80, 0.15)',
    borderColor: 'rgba(63, 185, 80, 0.3)',
  },
  toolBadgeSearch: {
    backgroundColor: 'rgba(255, 166, 87, 0.15)',
    borderColor: 'rgba(255, 166, 87, 0.3)',
  },
  toolBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#58A6FF',
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
  globStats: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#6E7681',
    marginLeft: 20,
    marginTop: 2,
  },
  globFileList: {
    marginTop: 8,
    marginLeft: 20,
  },
  globFile: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 2,
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
  expandOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 8,
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  showMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 10,
  },
  showLessButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  showMoreText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8B949E',
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '75%',
    alignSelf: 'flex-end',
  },
  assistantMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  assistantMessageContent: {
    flex: 1,
    marginTop: 3, // Align text baseline with thread dot center
    overflow: 'hidden', // Prevent markdown content from overflowing
  },
  loadingText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.5)',
    fontStyle: 'italic',
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
    paddingVertical: 4,
  },
  systemText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'left',
    fontWeight: '400',
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

// Markdown styles (Claude Code-inspired)
// Define rules outside component to avoid recreation

const markdownRules = {
  fence: (node, children, parent, styles) => {
    return (
      <CollapsibleCodeBlock
        key={node.key}
        content={node.content}
        language={node.source}
      />
    );
  },
  code_block: (node, children, parent, styles) => {
    return (
      <CollapsibleCodeBlock
        key={node.key}
        content={node.content}
      />
    );
  },
};

const markdownStyles = {
  body: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 22,
    marginTop: 0, // Remove any default top margin
    paddingTop: 0, // Remove any default top padding
    borderWidth: 0, // Remove any borders
  },
  heading1: {
    fontSize: 20,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.95)',
    marginBottom: 12,
    marginTop: 16,
  },
  heading2: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.95)',
    marginBottom: 10,
    marginTop: 14,
  },
  heading3: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.90)',
    marginBottom: 8,
    marginTop: 12,
  },
  paragraph: {
    marginTop: 0, // Ensure first paragraph aligns with thread dot
    marginBottom: 12,
    lineHeight: 22,
    borderBottomWidth: 0, // Explicitly remove any bottom border
    borderWidth: 0,
  },
  strong: {
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.95)',
  },
  em: {
    fontStyle: 'italic',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  code_inline: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.95)',
  },
  code_block: {
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 12,
    marginVertical: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  fence: {
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 12,
    marginVertical: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  bullet_list: {
    marginBottom: 12,
  },
  ordered_list: {
    marginBottom: 12,
  },
  list_item: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  bullet_list_icon: {
    width: 20,
    marginRight: 8,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  ordered_list_icon: {
    width: 20,
    marginRight: 8,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(139, 148, 158, 0.5)',
    paddingLeft: 12,
    marginLeft: 0,
    marginVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    paddingVertical: 8,
  },
  hr: {
    backgroundColor: 'transparent', // Hide horizontal rules completely
    height: 0,
    marginVertical: 0,
    display: 'none',
  },
  link: {
    color: '#58A6FF',
    textDecorationLine: 'none',
    textDecorationStyle: 'solid',
    textDecorationColor: 'transparent',
    fontWeight: '600',
  },
  // Remove underline from any inline HTML tags
  html_inline: {
    textDecorationLine: 'none',
  },
  html_block: {
    textDecorationLine: 'none',
  },
  softbreak: {
    textDecorationLine: 'none',
  },
  hardbreak: {
    textDecorationLine: 'none',
  },
  text: {
    textDecorationLine: 'none',
  },
  table: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    marginVertical: 8,
  },
  tr: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  th: {
    padding: 8,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.95)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  td: {
    padding: 8,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  // Backend Log styles
  backendLogBlock: {
    backgroundColor: 'rgba(30, 35, 45, 0.6)',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#58A6FF',
  },
  backendLogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  backendLogLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#58A6FF',
    letterSpacing: 0.5,
    flex: 1,
  },
  backendLogTime: {
    fontSize: 10,
    color: '#8B949E',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  backendLogText: {
    fontSize: 12,
    color: '#C9D1D9',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 18,
  },
};
