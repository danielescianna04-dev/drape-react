import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, TextInput, ScrollView, Keyboard, ActivityIndicator, LayoutAnimation } from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LiquidGlassView } from '@callstack/liquid-glass';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../shared/theme/colors';
import { useNavigationStore } from '../../../core/navigation/navigationStore';
import { TodoList } from '../../../shared/components/molecules/TodoList';
import { stripToolCallXml } from '../../../shared/utils/stripToolCallXml';

/** Strip markdown code blocks and truncate for the compact preview chat overlay. */
function cleanPreviewText(text: string): string {
  if (!text) return text;
  let cleaned = stripToolCallXml(text);
  // Replace fenced code blocks (```...```) with a short label
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '[code]');
  // Replace inline backtick spans that look like full lines of code (>60 chars)
  cleaned = cleaned.replace(/`[^`]{60,}`/g, '[code]');
  // Collapse multiple consecutive [code] markers
  cleaned = cleaned.replace(/(\[code\]\s*){2,}/g, '[code] ');
  // Truncate if still too long
  cleaned = cleaned.trim();
  if (cleaned.length > 300) {
    cleaned = cleaned.slice(0, 300) + '…';
  }
  return cleaned;
}

export interface AIMessage {
  type: 'text' | 'tool_start' | 'tool_result' | 'user' | 'thinking' | 'budget_exceeded';
  content: string;
  tool?: string;
  toolId?: string;
  success?: boolean;
  filePath?: string;
  pattern?: string;
  selectedElement?: { selector: string; tag?: string };
  isThinking?: boolean;
}

export interface PreviewAIChatProps {
  // State
  isInputExpanded: boolean;
  isMessagesCollapsed: boolean;
  showPastChats: boolean;
  message: string;
  aiMessages: AIMessage[];
  activeTools: string[];
  isAiLoading: boolean;
  agentStreaming: boolean;
  keyboardHeight: number;
  selectedElement: { selector: string; text: string; tag?: string; className?: string; id?: string; innerHTML?: string } | null;
  isInspectMode: boolean;
  currentTodos: any[];
  previewChatId: string | null;
  chatHistory: any[];
  currentWorkstationId: string | undefined;

  // Refs
  inputRef: React.RefObject<TextInput>;
  aiScrollViewRef: React.RefObject<any>;
  fabContentOpacity: Animated.Value;

  // Layout
  bottomInset: number;

  // Callbacks
  onExpandFab: () => void;
  onCollapseFab: () => void;
  setMessage: (msg: string) => void;
  setIsMessagesCollapsed: (v: boolean) => void;
  setShowPastChats: (v: boolean) => void;
  onSendMessage: () => void;
  onStopAgent: () => void;
  onToggleInspectMode: () => void;
  onClearSelectedElement: () => void;
  onSelectParentElement: () => void;
  onLoadPastChat: (chat: any) => void;
  onStartNewChat: () => void;
}

export const PreviewAIChat: React.FC<PreviewAIChatProps> = ({
  isInputExpanded,
  isMessagesCollapsed,
  showPastChats,
  message,
  aiMessages,
  activeTools,
  isAiLoading,
  agentStreaming,
  keyboardHeight,
  selectedElement,
  isInspectMode,
  currentTodos,
  previewChatId,
  chatHistory,
  currentWorkstationId,
  inputRef,
  aiScrollViewRef,
  fabContentOpacity,
  bottomInset,
  onExpandFab,
  onCollapseFab,
  setMessage,
  setIsMessagesCollapsed,
  setShowPastChats,
  onSendMessage,
  onStopAgent,
  onToggleInspectMode,
  onClearSelectedElement,
  onSelectParentElement,
  onLoadPastChat,
  onStartNewChat,
}) => {
  const inspectScale = useSharedValue(1);
  const messagesOpacity = useSharedValue(isMessagesCollapsed ? 0 : 1);
  const messagesHeight = useSharedValue(isMessagesCollapsed ? 0 : 1);
  const pastChatsProgress = useSharedValue(showPastChats ? 1 : 0);

  React.useEffect(() => {
    inspectScale.value = withSpring(isInspectMode ? 1.25 : 1, { damping: 20, stiffness: 120, overshootClamping: true });
  }, [isInspectMode]);

  React.useEffect(() => {
    const timing = { duration: 250, easing: Easing.out(Easing.cubic) };
    if (isMessagesCollapsed) {
      messagesOpacity.value = withTiming(0, { duration: 150 });
      messagesHeight.value = withTiming(0, timing);
    } else {
      messagesHeight.value = withTiming(1, timing);
      messagesOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [isMessagesCollapsed]);

  React.useEffect(() => {
    const timing = { duration: 200, easing: Easing.out(Easing.cubic) };
    pastChatsProgress.value = withTiming(showPastChats ? 1 : 0, timing);
  }, [showPastChats]);

  const inspectAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: inspectScale.value }],
  }));

  const messagesAnimStyle = useAnimatedStyle(() => ({
    opacity: messagesOpacity.value,
    maxHeight: messagesHeight.value * 200,
    overflow: 'hidden' as const,
  }));

  const pastChatsAnimStyle = useAnimatedStyle(() => ({
    opacity: pastChatsProgress.value,
    maxHeight: pastChatsProgress.value * 300,
    overflow: 'hidden' as const,
  }));

  return (
    <Reanimated.View style={[styles.fabInputWrapper, { bottom: keyboardHeight > 0 ? keyboardHeight + 6 : bottomInset + 8, left: isInputExpanded ? 12 : undefined }]}>

      {/* Animated FAB that expands into input */}
      <Animated.View
        style={[
          styles.fabAnimated,
          isInputExpanded ? { width: '100%' } : { width: 44, height: 44 },
        ]}
      >
        {isInputExpanded ? (
        <BlurView intensity={90} tint="dark" style={[styles.fabBlur, { alignItems: 'stretch', paddingHorizontal: 0 }]}>
            <Animated.View style={{ flex: 1, flexDirection: 'column', opacity: fabContentOpacity }}>

              {/* AI Messages - integrated into FAB */}
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Ionicons name="sparkles" size={12} color="#fff" />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)' }}>
                        {activeTools.length > 0 ? `${activeTools[activeTools.length - 1]}` : 'AI'}
                      </Text>
                      {activeTools.length > 0 && (
                        <ActivityIndicator size="small" color={AppColors.primary} />
                      )}
                      {/* Past Conversations pill */}
                      {(() => {
                        const previewChats = chatHistory.filter(
                          (c: any) => c.id?.startsWith('preview-') && c.repositoryId === currentWorkstationId
                        );
                        if (previewChats.length === 0 && !previewChatId) return null;
                        return (
                          <TouchableOpacity
                            onPress={() => {
                              LayoutAnimation.configureNext({
                                duration: 200,
                                update: { type: LayoutAnimation.Types.easeInEaseOut },
                              });
                              setShowPastChats(!showPastChats);
                            }}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              marginLeft: 4,
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              borderRadius: 10,
                              backgroundColor: 'rgba(255,255,255,0.08)',
                              gap: 4,
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: '500' }} numberOfLines={1}>
                              {previewChatId
                                ? (previewChats.find((c: any) => c.id === previewChatId)?.title?.slice(0, 20) || 'Chat')
                                : 'Cronologia'}
                            </Text>
                            <Ionicons
                              name={showPastChats ? "chevron-up" : "chevron-down"}
                              size={10}
                              color="rgba(255,255,255,0.3)"
                            />
                          </TouchableOpacity>
                        );
                      })()}
                    </View>
                    <TouchableOpacity onPress={() => {
                      LayoutAnimation.configureNext({
                        duration: 200,
                        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                        update: { type: LayoutAnimation.Types.easeInEaseOut },
                        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                      });
                      setIsMessagesCollapsed(!isMessagesCollapsed);
                    }} style={{ padding: 4 }} activeOpacity={0.7}>
                      <Ionicons name={isMessagesCollapsed ? "chevron-up" : "chevron-down"} size={16} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                  </View>
                  {/* Past chats dropdown */}
                  <Reanimated.View style={pastChatsAnimStyle}>
                    {(() => {
                      const previewChats = chatHistory.filter(
                        (c: any) => c.id?.startsWith('preview-') && c.repositoryId === currentWorkstationId
                      );
                      if (previewChats.length === 0 && !previewChatId) return null;
                      return (
                        <View style={{
                          marginHorizontal: 12,
                          marginBottom: 6,
                          backgroundColor: 'rgba(255,255,255,0.06)',
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: 'rgba(255,255,255,0.08)',
                          overflow: 'hidden',
                        }}>
                          <TouchableOpacity
                            onPress={onStartNewChat}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingHorizontal: 12,
                              paddingVertical: 10,
                              gap: 8,
                              borderBottomWidth: previewChats.length > 0 ? 0.5 : 0,
                              borderBottomColor: 'rgba(255,255,255,0.06)',
                            }}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="add-circle-outline" size={14} color={AppColors.primary} />
                            <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>Nuova chat</Text>
                          </TouchableOpacity>
                          {previewChats.slice(0, 5).map((chat: any) => (
                            <TouchableOpacity
                              key={chat.id}
                              onPress={() => onLoadPastChat(chat)}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingHorizontal: 12,
                                paddingVertical: 10,
                                gap: 8,
                                backgroundColor: chat.id === previewChatId ? 'rgba(139, 124, 246, 0.1)' : 'transparent',
                              }}
                              activeOpacity={0.7}
                            >
                              <Ionicons
                                name={chat.id === previewChatId ? "chatbubble" : "chatbubble-outline"}
                                size={12}
                                color={chat.id === previewChatId ? AppColors.primary : 'rgba(255,255,255,0.4)'}
                              />
                              <Text
                                style={{
                                  flex: 1,
                                  fontSize: 12,
                                  color: chat.id === previewChatId ? '#fff' : 'rgba(255,255,255,0.5)',
                                  fontWeight: chat.id === previewChatId ? '600' : '400',
                                }}
                                numberOfLines={1}
                              >
                                {chat.title}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      );
                    })()}
                  </Reanimated.View>
                  <Reanimated.View style={messagesAnimStyle}>
                  <ScrollView
                    ref={aiScrollViewRef}
                    style={{ paddingHorizontal: 8 }}
                    showsVerticalScrollIndicator={false}
                    onContentSizeChange={() => aiScrollViewRef.current?.scrollToEnd({ animated: true })}
                  >
                    {(aiMessages || []).length === 0 && !isAiLoading && (
                      <View style={{ paddingVertical: 14, paddingHorizontal: 4 }}>
                        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
                          Seleziona un elemento e chiedi modifiche
                        </Text>
                      </View>
                    )}
                    {(aiMessages || []).map((msg, index) => {
                      // Skip empty messages — thinking closed without content, empty text after XML strip
                      if (msg.type === 'thinking' && !msg.content?.trim() && !msg.isThinking) return null;
                      if (msg.type === 'text' && !msg.content?.trim()) return null;
                      // Skip text messages that are only code (no explanation)
                      if (msg.type === 'text' && cleanPreviewText(msg.content).replace(/\[code\]/g, '').trim() === '') return null;
                      if (msg.type === 'user') {
                        return (
                          <View key={index} style={[styles.aiMessageRow, { justifyContent: 'flex-end', paddingRight: 4, marginBottom: 10, alignItems: 'flex-end' }]}>
                            <View style={{ alignItems: 'flex-end' }}>
                              {msg.selectedElement && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(138, 43, 226, 0.2)', borderRadius: 8 }}>
                                  <Ionicons name="code-slash" size={10} color="#A855F7" style={{ marginRight: 4 }} />
                                  <Text style={{ color: '#A855F7', fontSize: 10 }}>{`<${msg.selectedElement.tag}>`}</Text>
                                </View>
                              )}
                              <LinearGradient colors={['#007AFF', '#0055FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.userMessageBubble}>
                                <Text style={styles.userMessageText}>{msg.content}</Text>
                              </LinearGradient>
                            </View>
                          </View>
                        );
                      }
                      if (msg.type === 'thinking') {
                        return (
                          <View key={index} style={styles.aiMessageRow}>
                            <View style={styles.aiThreadContainer}>
                              <Animated.View style={[styles.aiThreadDot, { backgroundColor: '#6E6E80' }]} />
                            </View>
                            <View style={styles.aiMessageContent}>
                              <Text style={styles.aiThinkingText}>
                                {msg.content || (msg.isThinking ? 'Thinking...' : '')}
                              </Text>
                            </View>
                          </View>
                        );
                      }
                      if (msg.type === 'budget_exceeded') {
                        return (
                          <View key={index} style={{ marginVertical: 8, marginHorizontal: 4, backgroundColor: 'rgba(139, 124, 246, 0.1)', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(139, 124, 246, 0.2)' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Ionicons name="flash" size={14} color={AppColors.primary} style={{ marginRight: 8 }} />
                              <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff' }}>Budget AI esaurito</Text>
                            </View>
                            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                              Passa a Go per continuare
                            </Text>
                            <TouchableOpacity
                              onPress={() => useNavigationStore.getState().navigateTo('plans')}
                              style={{ marginTop: 10, backgroundColor: AppColors.primary, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 }}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="rocket-outline" size={14} color="#fff" />
                              <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Passa a Go</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      }
                      if (msg.type === 'tool_start' || msg.type === 'tool_result') {
                        // Hide signal_completion from UI
                        if (msg.tool === 'signal_completion') return null;
                        const toolConfig: Record<string, { icon: string; label: string; color: string }> = {
                          'Read': { icon: 'document-text-outline', label: 'READ', color: '#58A6FF' },
                          'Edit': { icon: 'create-outline', label: 'EDIT', color: '#3FB950' },
                          'Write': { icon: 'document-outline', label: 'WRITE', color: '#3FB950' },
                          'Glob': { icon: 'folder-outline', label: 'GLOB', color: '#A371F7' },
                          'Grep': { icon: 'search-outline', label: 'GREP', color: '#FFA657' },
                          'Bash': { icon: 'terminal-outline', label: 'BASH', color: '#F0883E' },
                          'Task': { icon: 'git-branch-outline', label: 'TASK', color: '#DB61A2' },
                          'WebFetch': { icon: 'globe-outline', label: 'FETCH', color: '#79C0FF' },
                          'WebSearch': { icon: 'search-outline', label: 'SEARCH', color: '#79C0FF' },
                          'TodoWrite': { icon: 'checkbox-outline', label: 'TODO', color: '#F9826C' },
                          'AskUserQuestion': { icon: 'help-circle-outline', label: 'ASK', color: '#D29922' },
                          'read_file': { icon: 'document-text-outline', label: 'READ', color: '#58A6FF' },
                          'edit_file': { icon: 'create-outline', label: 'EDIT', color: '#3FB950' },
                          'write_file': { icon: 'document-outline', label: 'WRITE', color: '#3FB950' },
                          'run_command': { icon: 'terminal-outline', label: 'BASH', color: '#F0883E' },
                          'list_directory': { icon: 'folder-open-outline', label: 'LIST', color: '#A371F7' },
                          'glob_search': { icon: 'folder-outline', label: 'GLOB', color: '#A371F7' },
                          'grep_search': { icon: 'search-outline', label: 'GREP', color: '#FFA657' },
                          'launch_sub_agent': { icon: 'git-branch-outline', label: 'AGENT', color: '#DB61A2' },
                          'signal_completion': { icon: 'checkmark-circle-outline', label: 'DONE', color: '#3FB950' },
                        };
                        const cfg = toolConfig[msg.tool || ''] || { icon: 'cog-outline', label: msg.tool?.replace(/_/g, ' ').toUpperCase().slice(0, 8) || 'TOOL', color: '#8B949E' };
                        const isComplete = msg.type === 'tool_result';
                        const isSuccess = msg.success !== false;
                        const displayName = msg.filePath ? msg.filePath.split('/').pop() || msg.filePath : msg.pattern || '';
                        return (
                          <View key={index} style={styles.aiMessageRow}>
                            <View style={styles.aiThreadContainer}>
                              <View style={[styles.aiThreadDot, { backgroundColor: isComplete ? (isSuccess ? '#3FB950' : '#F85149') : cfg.color }]} />
                            </View>
                            <View style={styles.aiToolRow}>
                              <View style={[styles.aiToolBadge, { backgroundColor: `${cfg.color}15`, borderColor: `${cfg.color}30` }]}>
                                <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
                                <Text style={[styles.aiToolBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                              </View>
                              {displayName ? <Text style={styles.aiToolFileName} numberOfLines={1}>{displayName}</Text> : null}
                              {!isComplete ? (
                                <ActivityIndicator size="small" color={cfg.color} style={{ marginLeft: 8 }} />
                              ) : (
                                <Ionicons name={isSuccess ? 'checkmark-circle' : 'close-circle'} size={16} color={isSuccess ? '#3FB950' : '#F85149'} style={{ marginLeft: 8 }} />
                              )}
                            </View>
                          </View>
                        );
                      }
                      // Default: text message
                      return (
                        <View key={index} style={styles.aiMessageRow}>
                          <View style={styles.aiThreadContainer}>
                            <View style={[styles.aiThreadDot, { backgroundColor: '#6E6E80' }]} />
                          </View>
                          <View style={styles.aiMessageContent}>
                            <Text style={styles.aiResponseText}>{cleanPreviewText(msg.content)}</Text>
                          </View>
                        </View>
                      );
                    })}
                    {isAiLoading && (aiMessages.length === 0 || aiMessages[aiMessages.length - 1]?.type === 'user') && (
                      <View style={styles.aiMessageRow}>
                        <View style={styles.aiThreadContainer}>
                          <Animated.View style={[styles.aiThreadDot, { backgroundColor: '#6E6E80' }]} />
                        </View>
                        <View style={styles.aiMessageContent}>
                          <Text style={styles.aiThinkingText}>Thinking...</Text>
                        </View>
                      </View>
                    )}
                    {/* TodoList - show current todos from agent */}
                    {currentTodos.length > 0 && (
                      <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
                        <TodoList todos={currentTodos} />
                      </View>
                    )}
                  </ScrollView>
                  </Reanimated.View>
                  <View style={{ height: 0.5, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 8 }} />

                </>

              {/* Context Bar - Selected Element (Inside Input) */}
              {selectedElement && (
                <>
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 12,
                    paddingTop: 10,
                    paddingBottom: 8,
                    gap: 6,
                  }}>
                    {/* Parent button */}
                    <TouchableOpacity
                      onPress={onSelectParentElement}
                      style={{
                        padding: 6,
                        borderRadius: 12,
                        backgroundColor: 'rgba(255,255,255,0.08)',
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="arrow-up" size={14} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                    {/* Element tag badge — liquid glass */}
                    <View style={{
                      flex: 1,
                      flexShrink: 1,
                      borderRadius: 14,
                      overflow: 'hidden',
                    }}>
                      <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
                      <LiquidGlassView
                        style={[StyleSheet.absoluteFill, { borderRadius: 14 }]}
                        interactive={true}
                        effect="regular"
                        colorScheme="dark"
                      />
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        gap: 6,
                        borderRadius: 14,
                        borderWidth: 0.5,
                        borderColor: 'rgba(255,255,255,0.1)',
                      }}>
                        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '500' }}>
                          {(() => {
                            const tag = selectedElement.tag?.toLowerCase() || '';
                            const labels: Record<string, string> = { h1: 'Titolo', h2: 'Titolo', h3: 'Titolo', h4: 'Titolo', h5: 'Titolo', h6: 'Titolo', p: 'Testo', span: 'Testo', a: 'Link', button: 'Bottone', img: 'Immagine', video: 'Video', input: 'Input', textarea: 'Input', select: 'Menu', div: 'Sezione', section: 'Sezione', nav: 'Navigazione', header: 'Header', footer: 'Footer', ul: 'Lista', ol: 'Lista', li: 'Elemento', form: 'Form', label: 'Etichetta', svg: 'Icona' };
                            return labels[tag] || tag.toUpperCase();
                          })()}
                        </Text>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                          {selectedElement.text || selectedElement.selector}
                        </Text>
                      </View>
                    </View>
                    {/* Close button */}
                    <TouchableOpacity onPress={onClearSelectedElement} style={{ padding: 4, flexShrink: 0 }}>
                      <Ionicons name="close" size={16} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                  </View>
                  {/* Divider */}
                  <View style={{ height: 0.5, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 12 }} />
                </>
              )}

              <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingRight: 4, paddingTop: 2 }}>
                {/* Collapse Button */}
                <TouchableOpacity
                  onPress={onCollapseFab}
                  style={styles.previewInputButton}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color="rgba(255, 255, 255, 0.5)"
                  />
                </TouchableOpacity>

                {/* Inspect Mode Button */}
                <Reanimated.View style={inspectAnimStyle}>
                  <TouchableOpacity
                    onPress={onToggleInspectMode}
                    style={styles.previewInputButton}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={isInspectMode ? "scan" : "scan-outline"}
                      size={isInspectMode ? 22 : 18}
                      color={isInspectMode ? AppColors.primary : 'rgba(255, 255, 255, 0.5)'}
                    />
                  </TouchableOpacity>
                </Reanimated.View>

                {/* Text Input */}
                <TextInput
                  ref={inputRef}
                  style={styles.previewInput}
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Chiedi modifiche..."
                  placeholderTextColor="rgba(255, 255, 255, 0.35)"
                  multiline
                  maxLength={500}
                  onSubmitEditing={onSendMessage}
                  keyboardAppearance="dark"
                  returnKeyType="send"
                />

                {/* Dismiss Keyboard Button - only show when keyboard is open */}
                {keyboardHeight > 0 && (
                  <TouchableOpacity
                    onPress={() => Keyboard.dismiss()}
                    style={styles.previewInputButton}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="chevron-down"
                      size={18}
                      color="rgba(255, 255, 255, 0.5)"
                    />
                  </TouchableOpacity>
                )}

                {/* Send/Stop Button */}
                <TouchableOpacity
                  onPress={agentStreaming || isAiLoading ? onStopAgent : onSendMessage}
                  disabled={!agentStreaming && !isAiLoading && !message.trim()}
                  style={styles.previewSendButton}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.previewSendButtonInner,
                    (agentStreaming || isAiLoading) ? styles.previewSendButtonStop : (message.trim() && styles.previewSendButtonActive)
                  ]}>
                    <Ionicons
                      name={agentStreaming || isAiLoading ? "stop" : "arrow-up"}
                      size={16}
                      color={(agentStreaming || isAiLoading) ? '#fff' : (message.trim() ? '#fff' : 'rgba(255, 255, 255, 0.3)')}
                    />
                  </View>
                </TouchableOpacity>
              </View>
            </Animated.View>
        </BlurView>
        ) : (
          <TouchableOpacity
            onPress={onExpandFab}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 22 }}
            activeOpacity={0.8}
          >
            <Ionicons name="pencil" size={18} color="#fff" />
          </TouchableOpacity>
        )
        }
      </Animated.View>
    </Reanimated.View>
  );
};

const styles = StyleSheet.create({
  fabInputWrapper: {
    position: 'absolute',
    right: 12,
    alignItems: 'flex-end',
    zIndex: 200,
  },
  fabAnimated: {
    minHeight: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(20, 20, 28, 0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  fabBlur: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  previewInputButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  previewInputButtonActive: {
    backgroundColor: 'transparent',
  },
  previewInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 8,
    maxHeight: 100,
    lineHeight: 20,
  },
  previewSendButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSendButtonInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSendButtonActive: {
    backgroundColor: AppColors.primary,
  },
  previewSendButtonStop: {
    backgroundColor: '#FF6B6B',
  },
  // AI message styles
  aiMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  aiThreadContainer: {
    width: 20,
    alignItems: 'center',
    paddingTop: 6,
  },
  aiThreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  aiMessageContent: {
    flex: 1,
  },
  aiThinkingText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    fontStyle: 'italic',
  },
  aiResponseText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 20,
  },
  aiToolRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiToolBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  aiToolBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  aiToolFileName: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    marginLeft: 8,
    fontFamily: 'monospace',
    maxWidth: 150,
  },
  userMessageBubble: {
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  userMessageText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
});
