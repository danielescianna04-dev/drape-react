import React, { useRef } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { SharedValue } from 'react-native-reanimated';
import { WelcomeScreen } from './WelcomeScreen';
import { TerminalItem as TerminalItemComponent } from '../../features/terminal/components/TerminalItem';
import { SafeText } from '../../shared/components/SafeText';
import { ThinkingIndicator } from '../../shared/components/atoms/ThinkingIndicator';
import { AgentProgress } from '../../shared/components/molecules/AgentProgress';
import { AppColors } from '../../shared/theme/colors';
import { TerminalItemType, type TerminalItem } from '../../shared/types';
import type { AgentToolEvent } from '../../hooks/api/useAgentStream';
import { useUIStore } from '../../core/terminal/uiStore';
import { parseActivityCard } from './chatToolFormatting';
import { AgentActivityCard } from './AgentActivityCard';

export interface ProcessedChatItem {
  item: TerminalItem;
  isOutputAfterTerminalCommand: boolean;
  isNextItemAI: boolean;
  outputItem?: TerminalItem;
  shouldShowLoading: boolean;
}

interface Props {
  processedTerminalItems: ProcessedChatItem[];
  terminalItemsLength: number;
  scrollViewRef: React.RefObject<FlatList>;
  scrollPaddingBottom: number;
  isCardMode: boolean;
  styles: ReturnType<typeof StyleSheet.create>;
  contentHeightRef: React.MutableRefObject<number>;
  layoutHeightRef: React.MutableRefObject<number>;
  isNearBottomRef: React.MutableRefObject<boolean>;
  scrollLockUntilRef: React.MutableRefObject<number>;
  isUserScrollActiveRef: React.MutableRefObject<boolean>;
  isLoading: boolean;
  agentStreaming: boolean;
  agentEvents: AgentToolEvent[];
  agentCurrentTool: string | null;
  budgetInfo?: { spentEur?: number; budgetEur?: number } | null;
  keyboardHeight: SharedValue<number>;
  onSuggestionPress: (text: string) => void;
  onScrollToBottom: (animated?: boolean) => void;
  onSetNearBottomState: (nearBottom: boolean) => void;
  onRetryTool: (tool: string, input: Record<string, unknown>) => void | Promise<void>;
  onOpenPlans: () => void;
}

export const ChatMessageList: React.FC<Props> = ({
  processedTerminalItems,
  terminalItemsLength,
  scrollViewRef,
  scrollPaddingBottom,
  isCardMode,
  styles,
  contentHeightRef,
  layoutHeightRef,
  isNearBottomRef,
  scrollLockUntilRef,
  isUserScrollActiveRef,
  isLoading,
  agentStreaming,
  agentEvents,
  agentCurrentTool,
  budgetInfo,
  keyboardHeight,
  onSuggestionPress,
  onScrollToBottom,
  onSetNearBottomState,
  onRetryTool,
  onOpenPlans,
}) => {
  const { t } = useTranslation(['terminal', 'chat', 'common']);
  const parseAgentStatus = (content?: string | null): { phase?: string; message?: string } | null => {
    if (!content?.startsWith('__AGENT_STATUS__')) return null;
    try {
      return JSON.parse(content.slice('__AGENT_STATUS__'.length));
    } catch {
      return { message: content.replace('__AGENT_STATUS__', '').trim() };
    }
  };
  const renderCountRef = useRef(0);
  const lastContentHeightRef = useRef<number | null>(null);
  renderCountRef.current += 1;
  if (renderCountRef.current <= 25) {
    console.log('[ChatMessageListDebug] render', {
      count: renderCountRef.current,
      terminalItemsLength,
      processedLength: processedTerminalItems.length,
      isLoading,
      agentStreaming,
    });
  }

  if (terminalItemsLength === 0) {
    return (
      <View style={[styles.output, isCardMode && styles.outputCardMode]}>
        <WelcomeScreen
          keyboardHeight={keyboardHeight}
          onSuggestionPress={onSuggestionPress}
        />
      </View>
    );
  }

  return (
    <FlatList
      ref={scrollViewRef}
      style={[styles.output, isCardMode && styles.outputCardMode]}
      contentContainerStyle={[styles.outputContent, { paddingBottom: scrollPaddingBottom }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      data={processedTerminalItems}
      keyExtractor={(processed, index) => processed.item.id || `item-${index}`}
      onContentSizeChange={(_w, h) => {
        if (lastContentHeightRef.current === h) return;
        lastContentHeightRef.current = h;
        contentHeightRef.current = h;
        if (terminalItemsLength === 0) return;
        if (isNearBottomRef.current) {
          onScrollToBottom(!(isLoading || agentStreaming));
        }
      }}
      onLayout={(e) => { layoutHeightRef.current = e.nativeEvent.layout.height; }}
      onScrollBeginDrag={() => { isUserScrollActiveRef.current = true; }}
      onScrollEndDrag={() => { isUserScrollActiveRef.current = false; }}
      onMomentumScrollBegin={() => { isUserScrollActiveRef.current = true; }}
      onMomentumScrollEnd={(e) => {
        isUserScrollActiveRef.current = false;
        const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
        const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
        onSetNearBottomState(distanceFromBottom < 220);
      }}
      onScroll={(e) => {
        const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
        const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
        if (Date.now() < scrollLockUntilRef.current) return;
        if ((isLoading || agentStreaming) && !isUserScrollActiveRef.current) return;
        onSetNearBottomState(distanceFromBottom < 220);
      }}
      scrollEventThrottle={16}
      renderItem={({ item: processed }) => {
        const { item, isNextItemAI, outputItem, shouldShowLoading } = processed;

        // Lovable-style activity card while the agent is running tools.
        // Detected via a sentinel prefix in item.content (see chatToolFormatting
        // .encodeActivityCard). The card is replaced by real text the moment
        // the model starts streaming its final reply.
        const activity = parseActivityCard(item.content);
        if (activity) {
          return (
            <View style={{ marginHorizontal: 16, marginVertical: 8 }}>
              <AgentActivityCard
                state={activity.state}
                title={activity.title}
                subtitle={activity.subtitle}
              />
            </View>
          );
        }

        if ((item as any).isAgentProgress) {
          const isRunning = agentStreaming;
          return (
            <View style={{ marginBottom: 16 }}>
              <AgentProgress
                events={agentEvents}
                status={isRunning ? 'running' : 'complete'}
                currentTool={isRunning ? agentCurrentTool : null}
              />
            </View>
          );
        }

        if (item.content === '__PREVIEW_RETRY__') {
          return (
            <TouchableOpacity
              onPress={() => { useUIStore.getState().requestOpenPreview(); }}
              activeOpacity={0.85}
              style={{
                marginHorizontal: 16,
                marginVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                paddingVertical: 14,
                paddingHorizontal: 20,
                borderRadius: 22,
                backgroundColor: 'rgba(139, 92, 246, 0.2)',
                borderWidth: 1,
                borderColor: 'rgba(139, 92, 246, 0.35)',
              }}
            >
              <Ionicons name="play" size={18} color="#A78BFA" />
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#A78BFA' }}>Avvia preview</Text>
            </TouchableOpacity>
          );
        }

        if (item.content === '__PREVIEW_READY__') {
          return (
            <TouchableOpacity
              onPress={() => { useUIStore.getState().requestOpenPreview(); }}
              activeOpacity={0.88}
              style={{
                marginHorizontal: 16,
                marginVertical: 12,
                padding: 16,
                borderRadius: 24,
                backgroundColor: 'rgba(63, 185, 80, 0.12)',
                borderWidth: 1,
                borderColor: 'rgba(63, 185, 80, 0.24)',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Ionicons name="sparkles" size={18} color="#3FB950" />
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#E6EDF3' }}>Preview pronta</Text>
              </View>
              <Text style={{ fontSize: 13, lineHeight: 19, color: 'rgba(230,237,243,0.72)', marginBottom: 12 }}>
                La prima versione del progetto e pronta da aprire. Puoi entrare subito e continuare a rifinirla dalla chat.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 12, borderRadius: 18, backgroundColor: 'rgba(63, 185, 80, 0.16)' }}>
                <Ionicons name="play" size={16} color="#3FB950" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#3FB950' }}>Apri preview</Text>
              </View>
            </TouchableOpacity>
          );
        }

        const agentStatus = parseAgentStatus(item.content);
        if (agentStatus?.message) {
          const phaseLabelMap: Record<string, string> = {
            generation: 'Creazione',
            warmup: 'Preview',
            fix: 'Auto-fix',
            verify: 'Verify',
          };
          const phaseLabel = phaseLabelMap[String(agentStatus.phase || '')] || 'Stato';
          return (
            <View
              style={{
                marginHorizontal: 16,
                marginVertical: 8,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 18,
                backgroundColor: 'rgba(167, 139, 250, 0.10)',
                borderWidth: 1,
                borderColor: 'rgba(167, 139, 250, 0.18)',
                gap: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="flash" size={14} color="#A78BFA" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#A78BFA', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {phaseLabel}
                </Text>
              </View>
              <Text style={{ fontSize: 14, lineHeight: 20, color: 'rgba(230,237,243,0.88)' }}>
                {agentStatus.message}
              </Text>
            </View>
          );
        }

        if (item.content === '__CONTEXT_COMPACTING__' || item.content === '__CONTEXT_COMPACTED__') {
          const isCompacting = item.content === '__CONTEXT_COMPACTING__';
          return (
            <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 6, gap: 8 }}>
              <View style={{ flex: 1, height: 0.5, backgroundColor: 'rgba(255,255,255,0.08)' }} />
              {isCompacting
                ? <ActivityIndicator size="small" color={AppColors.primary} style={{ marginHorizontal: 4 }} />
                : <Ionicons name="flash" size={12} color={AppColors.primary} />}
              <SafeText style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: '500' }}>
                {isCompacting ? t('terminal:preview.contextCompacting') : t('terminal:preview.contextCompacted')}
              </SafeText>
              <View style={{ flex: 1, height: 0.5, backgroundColor: 'rgba(255,255,255,0.08)' }} />
            </View>
          );
        }

        if (item.content?.startsWith('__BUDGET_WARNING_')) {
          const pct = parseInt(item.content.replace('__BUDGET_WARNING_', '').replace('__', ''), 10) || 75;
          const tone = pct >= 90 ? '#FF6B6B' : '#FFB86C';
          return (
            <TouchableOpacity
              key={item.id}
              onPress={onOpenPlans}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginHorizontal: 16,
                marginVertical: 6,
                backgroundColor: pct >= 90 ? 'rgba(255,80,80,0.1)' : 'rgba(255,184,108,0.1)',
                borderRadius: 12,
                padding: 10,
                gap: 8,
                borderWidth: 1,
                borderColor: pct >= 90 ? 'rgba(255,80,80,0.15)' : 'rgba(255,184,108,0.15)',
              }}
            >
              <Ionicons name="warning" size={14} color={tone} />
              <Text style={{ fontSize: 12, color: tone, fontWeight: '500', flex: 1 }}>
                {t('terminal:preview.budgetWarning', { pct })}
              </Text>
              <Ionicons name="arrow-forward" size={12} color={tone} />
            </TouchableOpacity>
          );
        }

        if (item.content === '__BUDGET_EXCEEDED__') {
          const budgetLimit = budgetInfo?.budgetEur ?? 1.0;
          return (
            <View key={item.id} style={{ marginHorizontal: 16, marginVertical: 12, borderRadius: 24, overflow: 'hidden' }}>
              <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={{
                borderRadius: 24,
                borderWidth: 1,
                borderColor: 'rgba(255,80,80,0.2)',
                padding: 20,
              }}>
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <View style={{
                    width: 44, height: 44, borderRadius: 22,
                    backgroundColor: 'rgba(255,80,80,0.12)',
                    justifyContent: 'center', alignItems: 'center',
                    marginBottom: 12,
                  }}>
                    <Ionicons name="flash" size={22} color="#FF6B6B" />
                  </View>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: -0.3 }}>
                    {t('terminal:preview.aiBudgetExceeded')}
                  </Text>
                  <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 4, textAlign: 'center', lineHeight: 18 }}>
                    {t('terminal:preview.budgetUsed')}
                  </Text>
                </View>
                <View style={{
                  backgroundColor: 'rgba(139,124,246,0.08)',
                  borderRadius: 16,
                  padding: 14,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(139,124,246,0.15)',
                }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: AppColors.primary, marginBottom: 6 }}>
                    {t('terminal:preview.budgetGoFeature')}
                  </Text>
                  <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 18 }}>
                    {t('terminal:preview.budgetGoDesc', { count: Math.round(7.5 / budgetLimit) })}
                  </Text>
                </View>
                <TouchableOpacity onPress={onOpenPlans} activeOpacity={0.85} style={{ borderRadius: 28, overflow: 'hidden' }}>
                  <LinearGradient
                    colors={['#8B7CF6', '#7C6CF0']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ paddingVertical: 14, alignItems: 'center', borderRadius: 28 }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff', letterSpacing: -0.2 }}>
                      {t('terminal:preview.upgradeCta')}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 10 }}>
                  {t('terminal:preview.budgetReset')}
                </Text>
              </View>
            </View>
          );
        }

        return (
          <TerminalItemComponent
            item={item}
            isNextItemOutput={isNextItemAI}
            outputItem={outputItem}
            isLoading={shouldShowLoading}
            onRetryTool={onRetryTool}
            onPlanApprove={undefined}
            onPlanReject={undefined}
          />
        );
      }}
      ListFooterComponent={terminalItemsLength > 0 ? (
        <>
          {(isLoading || agentStreaming) &&
            !processedTerminalItems.some((p) => p.item.isThinking) &&
            (processedTerminalItems.length === 0 ||
              processedTerminalItems[processedTerminalItems.length - 1]?.item?.type === TerminalItemType.USER_MESSAGE) && (
              <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                <View style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.08)',
                }}>
                  <ThinkingIndicator
                    textStyle={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, fontStyle: 'italic' }}
                  />
                </View>
              </View>
            )}
        </>
      ) : null}
    />
  );
};
