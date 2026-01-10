/**
 * AgentChatPanel - Enhanced chat interface with agent capabilities
 * Supports Fast mode, Planning mode, and regular AI chat
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../shared/theme/colors';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { useTabStore } from '../../../core/tabs/tabStore';
import { TerminalItemType } from '../../../shared/types';
import { useAgentStream } from '../../../hooks/useAgentStream';
import { AgentProgress } from '../../../shared/components/molecules/AgentProgress';
import { PlanApprovalModal } from '../../../shared/components/modals/PlanApprovalModal';
import axios from 'axios';

interface Props {
  onClose?: () => void;
  projectId?: string;
}

type AgentMode = 'off' | 'fast' | 'planning';

export const AgentChatPanel = ({ onClose, projectId }: Props) => {
  const [input, setInput] = useState('');
  const [agentMode, setAgentMode] = useState<AgentMode>('off');
  const [projectContext, setProjectContext] = useState<any>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);

  const scrollViewRef = useRef<ScrollView>(null);
  const agentStream = useAgentStream();

  const { currentWorkstation } = useTerminalStore();
  const { addTab, tabs } = useTabStore();

  // Load project context on mount
  useEffect(() => {
    const loadContext = async () => {
      const pid = projectId || currentWorkstation?.id || currentWorkstation?.projectId;
      if (!pid) return;

      try {
        const response = await axios.get(
          `${process.env.EXPO_PUBLIC_API_URL}/agent/context/${pid}`
        );
        if (response.data.success) {
          setProjectContext(response.data.context);
          console.log('✅ Loaded project context:', response.data.context);
        }
      } catch (error) {
        console.log('ℹ️ No project context found');
      }
    };

    loadContext();
  }, [projectId, currentWorkstation?.id, currentWorkstation?.projectId]);

  // Auto-scroll when messages change
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages, agentStream.state.events]);

  // Show plan modal when plan is ready
  useEffect(() => {
    if (agentStream.state.status === 'complete' && agentStream.state.plan && agentMode === 'planning') {
      setShowPlanModal(true);
    }
  }, [agentStream.state.status, agentStream.state.plan, agentMode]);

  const addMessage = useCallback((message: any) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input.trim();
    const pid = projectId || currentWorkstation?.id || currentWorkstation?.projectId;

    setInput('');

    // Add user message
    addMessage({
      id: Date.now().toString(),
      content: userMessage,
      type: 'user',
      timestamp: new Date(),
    });

    // Check if agent mode is enabled
    if (agentMode !== 'off' && pid) {
      // Build prompt with context
      let enhancedPrompt = userMessage;
      if (projectContext) {
        enhancedPrompt = `Project Context:
Name: ${projectContext.name}
Description: ${projectContext.description}
Industry: ${projectContext.industry || 'general'}
Features: ${projectContext.features?.join(', ') || 'none'}

User Request: ${userMessage}`;
      }

      try {
        if (agentMode === 'fast') {
          // Fast mode - execute immediately
          await agentStream.runFast(enhancedPrompt, pid);

          // Add completion message after execution
          const completeEvent = agentStream.state.events.find(e => e.type === 'complete');
          if (completeEvent) {
            addMessage({
              id: (Date.now() + 1).toString(),
              content: completeEvent.summary || 'Task completed successfully',
              type: 'agent',
              timestamp: new Date(),
              filesCreated: completeEvent.filesCreated,
              filesModified: completeEvent.filesModified,
            });
          }
        } else if (agentMode === 'planning') {
          // Planning mode - create plan first
          await agentStream.runPlan(enhancedPrompt, pid);
          // Plan modal will show automatically via useEffect
        }
      } catch (error: any) {
        addMessage({
          id: (Date.now() + 1).toString(),
          content: `Agent error: ${error.message}`,
          type: 'error',
          timestamp: new Date(),
        });
      }
    } else {
      // Regular AI chat (you can integrate your existing AI logic here)
      addMessage({
        id: (Date.now() + 1).toString(),
        content: 'Regular AI mode - integrate your existing chat logic here',
        type: 'assistant',
        timestamp: new Date(),
      });
    }
  };

  const handleApprovePlan = async () => {
    setShowPlanModal(false);
    const pid = projectId || currentWorkstation?.id || currentWorkstation?.projectId;

    if (pid) {
      try {
        await agentStream.executePlan(pid);

        // Add completion message after execution
        const completeEvent = agentStream.state.events.find(e => e.type === 'complete');
        if (completeEvent) {
          addMessage({
            id: Date.now().toString(),
            content: completeEvent.summary || 'Plan executed successfully',
            type: 'agent',
            timestamp: new Date(),
            filesCreated: completeEvent.filesCreated,
            filesModified: completeEvent.filesModified,
          });
        }
      } catch (error: any) {
        addMessage({
          id: Date.now().toString(),
          content: `Execution error: ${error.message}`,
          type: 'error',
          timestamp: new Date(),
        });
      }
    }
  };

  const handleRejectPlan = () => {
    setShowPlanModal(false);
    agentStream.reset();
    addMessage({
      id: Date.now().toString(),
      content: 'Plan rejected by user',
      type: 'system',
      timestamp: new Date(),
    });
  };

  const getMessageIcon = (type: string) => {
    switch (type) {
      case 'user': return 'person-circle';
      case 'agent': return 'flash';
      case 'assistant': return 'sparkles';
      case 'error': return 'alert-circle';
      case 'system': return 'information-circle';
      default: return 'chatbubble';
    }
  };

  const getMessageColor = (type: string) => {
    switch (type) {
      case 'user': return AppColors.primary;
      case 'agent': return AppColors.success;
      case 'assistant': return AppColors.primary;
      case 'error': return AppColors.error;
      case 'system': return AppColors.terminal.yellow;
      default: return AppColors.white.w60;
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Ionicons name="chatbubbles" size={20} color={AppColors.primary} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Agent Chat</Text>
            <Text style={styles.headerSubtitle}>
              {projectContext?.name || 'No project context'}
            </Text>
          </View>
        </View>

        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={22} color={AppColors.white.w60} />
          </TouchableOpacity>
        )}
      </View>

      {/* Agent Mode Toggle */}
      <View style={styles.modeSection}>
        <Text style={styles.modeLabel}>Mode:</Text>
        <View style={styles.modeToggle}>
          <TouchableOpacity
            onPress={() => setAgentMode('off')}
            style={[
              styles.modeButton,
              agentMode === 'off' && styles.modeButtonActive
            ]}
          >
            <Ionicons name="sparkles" size={14} color={agentMode === 'off' ? '#fff' : '#8A8A8A'} />
            <Text style={[styles.modeText, agentMode === 'off' && styles.modeTextActive]}>
              AI
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setAgentMode('fast')}
            style={[
              styles.modeButton,
              agentMode === 'fast' && styles.modeButtonActive
            ]}
          >
            <Ionicons name="flash" size={14} color={agentMode === 'fast' ? '#fff' : '#8A8A8A'} />
            <Text style={[styles.modeText, agentMode === 'fast' && styles.modeTextActive]}>
              Fast
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setAgentMode('planning')}
            style={[
              styles.modeButton,
              agentMode === 'planning' && styles.modeButtonActive
            ]}
          >
            <Ionicons name="list" size={14} color={agentMode === 'planning' ? '#fff' : '#8A8A8A'} />
            <Text style={[styles.modeText, agentMode === 'planning' && styles.modeTextActive]}>
              Plan
            </Text>
          </TouchableOpacity>
        </View>

        {/* Agent Mode Badge */}
        {agentMode !== 'off' && (
          <View style={styles.activeBadge}>
            <View style={styles.activeDot} />
            <Text style={styles.activeBadgeText}>
              {agentMode === 'fast' ? 'Fast Mode' : 'Planning Mode'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.divider} />

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={48} color={AppColors.white.w25} />
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>
              {agentMode === 'off'
                ? 'Start chatting with AI'
                : `Agent mode: ${agentMode === 'fast' ? 'Fast execution' : 'Plan & execute'}`}
            </Text>
          </View>
        ) : (
          <>
            {messages.map((message) => (
              <View key={message.id} style={styles.messageCard}>
                <View style={styles.messageHeader}>
                  <View style={[
                    styles.messageIcon,
                    { backgroundColor: getMessageColor(message.type) + '20' }
                  ]}>
                    <Ionicons
                      name={getMessageIcon(message.type)}
                      size={16}
                      color={getMessageColor(message.type)}
                    />
                  </View>
                  <Text style={styles.messageType}>
                    {message.type.charAt(0).toUpperCase() + message.type.slice(1)}
                  </Text>
                  <Text style={styles.messageTime}>
                    {new Date(message.timestamp).toLocaleTimeString('it-IT', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </Text>
                </View>

                <Text style={styles.messageContent}>{message.content}</Text>

                {message.filesCreated && message.filesCreated.length > 0 && (
                  <View style={styles.filesSection}>
                    <Text style={styles.filesLabel}>Files created:</Text>
                    {message.filesCreated.map((file: string, index: number) => (
                      <Text key={index} style={styles.fileName}>• {file}</Text>
                    ))}
                  </View>
                )}

                {message.filesModified && message.filesModified.length > 0 && (
                  <View style={styles.filesSection}>
                    <Text style={styles.filesLabel}>Files modified:</Text>
                    {message.filesModified.map((file: string, index: number) => (
                      <Text key={index} style={styles.fileName}>• {file}</Text>
                    ))}
                  </View>
                )}
              </View>
            ))}

            {/* Agent Progress (shown during execution) */}
            {agentStream.state.status === 'running' && (
              <View style={styles.agentProgressWrapper}>
                <AgentProgress
                  events={agentStream.state.events}
                  status={agentStream.state.status}
                  currentTool={agentStream.state.currentTool}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={
              agentMode === 'off'
                ? 'Message AI...'
                : agentMode === 'fast'
                ? 'Tell agent what to do...'
                : 'Describe task for planning...'
            }
            placeholderTextColor={AppColors.white.w40}
            multiline
            maxLength={1000}
            keyboardAppearance="dark"
          />

          <TouchableOpacity
            onPress={handleSend}
            disabled={!input.trim() || agentStream.state.status === 'running'}
            style={[
              styles.sendButton,
              (!input.trim() || agentStream.state.status === 'running') && styles.sendButtonDisabled
            ]}
            activeOpacity={0.7}
          >
            <Ionicons
              name="arrow-up"
              size={20}
              color={input.trim() && agentStream.state.status !== 'running' ? '#fff' : '#555'}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Plan Approval Modal */}
      <PlanApprovalModal
        visible={showPlanModal}
        plan={agentStream.state.plan}
        planContent={agentStream.state.events.find(e => e.type === 'plan_ready')?.planContent}
        onApprove={handleApprovePlan}
        onReject={handleRejectPlan}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.dark.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: AppColors.dark.surface,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: AppColors.primaryAlpha.a15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: AppColors.white.full,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    color: AppColors.white.w50,
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: AppColors.white.w10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: AppColors.dark.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: AppColors.white.w60,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: AppColors.white.w10,
    padding: 2,
    gap: 2,
  },
  modeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modeButtonActive: {
    backgroundColor: AppColors.primaryAlpha.a20,
  },
  modeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8A8A8A',
  },
  modeTextActive: {
    color: '#fff',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: AppColors.primaryAlpha.a15,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: AppColors.primaryAlpha.a20,
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: AppColors.primary,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: AppColors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: AppColors.white.w10,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    gap: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: AppColors.white.w40,
  },
  emptySubtext: {
    fontSize: 12,
    color: AppColors.white.w25,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  messageCard: {
    backgroundColor: AppColors.dark.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: AppColors.white.w10,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  messageIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageType: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: AppColors.white.w80,
  },
  messageTime: {
    fontSize: 10,
    color: AppColors.white.w40,
    fontFamily: 'monospace',
  },
  messageContent: {
    fontSize: 13,
    color: AppColors.white.full,
    lineHeight: 20,
  },
  filesSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: AppColors.white.w10,
  },
  filesLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: AppColors.white.w60,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fileName: {
    fontSize: 11,
    color: AppColors.primary,
    fontFamily: 'monospace',
    marginLeft: 4,
    marginTop: 2,
  },
  agentProgressWrapper: {
    marginTop: 8,
  },
  inputContainer: {
    padding: 12,
    backgroundColor: AppColors.dark.surface,
    borderTopWidth: 1,
    borderTopColor: AppColors.white.w10,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: AppColors.dark.surfaceAlt,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AppColors.white.w10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: AppColors.white.full,
    maxHeight: 100,
    paddingVertical: 4,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: AppColors.white.w10,
  },
});
