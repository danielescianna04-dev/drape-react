import React, { useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable,
  StyleSheet, Platform,
} from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { SafeText } from '../../shared/components/SafeText';
import { AppColors } from '../../shared/theme/colors';

// ── AI Models ───────────────────────────────────────────────────────
// Icon components
const AnthropicIcon = ({ size = 16 }: { size?: number }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#D4A574', justifyContent: 'center', alignItems: 'center' }}>
    <Text style={{ color: '#fff', fontSize: size * 0.6, fontWeight: '900' }}>A</Text>
  </View>
);
const OpenAIIcon = ({ size = 16 }: { size?: number }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#10A37F', justifyContent: 'center', alignItems: 'center' }}>
    <Text style={{ color: '#fff', fontSize: size * 0.55, fontWeight: '800' }}>G</Text>
  </View>
);
const GoogleIcon = ({ size = 16 }: { size?: number }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#4285F4', justifyContent: 'center', alignItems: 'center' }}>
    <Text style={{ color: '#fff', fontSize: size * 0.55, fontWeight: '800' }}>G</Text>
  </View>
);

export const AI_MODELS = [
  { id: 'claude-4-7-opus', name: 'Claude 4.7 Opus', IconComponent: AnthropicIcon, hasThinking: true, thinkingLevels: ['medium'], isPremium: true },
  { id: 'claude-4-6-sonnet', name: 'Claude 4.6 Sonnet', IconComponent: AnthropicIcon, hasThinking: true },
  { id: 'gpt-5-4', name: 'GPT 5.4', IconComponent: OpenAIIcon, hasThinking: false, isPremium: true },
  { id: 'glm-5.1', name: 'GLM 5.1', IconComponent: OpenAIIcon, hasThinking: false },
  { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro', IconComponent: GoogleIcon, hasThinking: true, thinkingLevels: ['none', 'low', 'high'], isPremium: true },
  { id: 'gemini-3-flash', name: 'Gemini 3.0 Flash', IconComponent: GoogleIcon, hasThinking: true, thinkingLevels: ['none', 'minimal', 'low', 'medium', 'high'] },
] as const;

// ── Props ───────────────────────────────────────────────────────────
export interface ChatInputBarProps {
  // Input state
  input: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onStop: () => void;

  // Mode
  agentMode: 'fast' | 'terminal';
  onToggleMode: (mode: 'fast' | 'terminal') => void;

  // Loading
  isStreaming: boolean;
  isLoading: boolean;

  // Images
  hasImages: boolean;

  // Model
  selectedModel: string;
  currentModelName: string;
  showModelSelector: boolean;
  onToggleModelSelector: () => void;
  onCloseDropdown: () => void;
  onSelectModel: (modelId: string) => void;
  isPaidUser: boolean;
  onLockedModelPress: (model: typeof AI_MODELS[number]) => void;

  // Thinking
  thinkingLevel: string;
  onSetThinkingLevel: (level: string) => void;

  // Context
  contextUsage: number;
  showContextInfo: boolean;
  onToggleContextInfo: (show: boolean) => void;

  // Budget
  budgetInfo: { spentEur: number; budgetEur: number; percent: number } | null;
  onBudgetPress: () => void;

  // Tools
  onToolsPress: () => void;

  // Glass
  inputBarGlassId: string;
  glassApplied?: boolean;
  onLayout?: (e: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => void;

  // Animations
  aiModeAnimatedStyle?: Record<string, unknown>;
  dropdownAnimatedStyle?: Record<string, unknown>;

  // Project context bar
  repoName?: string;
  branchName?: string;
  hasEnvVars?: boolean;
  onOpenGit?: () => void;
  onOpenBranch?: () => void;
  onOpenEnvVars?: () => void;
}

export const ChatInputBar = React.memo(({
  input,
  onChangeText,
  onSend,
  onStop,
  agentMode,
  onToggleMode,
  isStreaming,
  isLoading,
  hasImages,
  selectedModel,
  currentModelName,
  showModelSelector,
  onToggleModelSelector,
  onCloseDropdown,
  onSelectModel,
  isPaidUser,
  onLockedModelPress,
  thinkingLevel,
  onSetThinkingLevel,
  contextUsage,
  showContextInfo,
  onToggleContextInfo,
  budgetInfo,
  onBudgetPress,
  onToolsPress,
  inputBarGlassId,
  glassApplied,
  onLayout,
  aiModeAnimatedStyle,
  dropdownAnimatedStyle,
  repoName,
  branchName,
  hasEnvVars,
  onOpenGit,
  onOpenBranch,
  onOpenEnvVars,
}: ChatInputBarProps) => {
  const { t } = useTranslation(['chat', 'terminal']);

  const thinkingLevelLabels = useMemo<Record<string, string>>(() => ({
    none: t('terminal:chat.reasoningLevels.off'),
    minimal: t('terminal:chat.reasoningLevels.minimal'),
    low: t('terminal:chat.reasoningLevels.low'),
    medium: t('terminal:chat.reasoningLevels.medium'),
    high: t('terminal:chat.reasoningLevels.high'),
  }), [t]);

  const isBusy = isStreaming || isLoading;
  const hasContent = input.trim().length > 0 || hasImages;

  return (
    <>
      <View
        testID={inputBarGlassId}
        nativeID={inputBarGlassId}
        style={[styles.container, hasImages && styles.containerWithImages]}
        onLayout={onLayout}
      >
        {!glassApplied && (
          <LinearGradient
            colors={[`${AppColors.dark.surface}F9`, `${AppColors.dark.surface}EB`]}
            style={StyleSheet.absoluteFill}
          />
        )}

        {/* ── Top Controls ── */}
        <View style={styles.topControls}>
          {/* Spacer — mode toggle removed, all input goes through AI */}
          <View />

          {/* Right controls */}
          <View style={styles.rightControls}>
            {/* Budget bar */}
            {!isPaidUser && budgetInfo && (
              <TouchableOpacity onPress={onBudgetPress} activeOpacity={0.7} style={styles.budgetBtn}>
                <View style={styles.budgetTrack}>
                  <View style={[styles.budgetFill, {
                    width: `${Math.min(budgetInfo.percent, 100)}%` as `${number}%`,
                    backgroundColor: budgetInfo.percent >= 85 ? '#FF6B6B' : budgetInfo.percent >= 60 ? '#FFB86C' : '#10B981',
                  }]} />
                </View>
              </TouchableOpacity>
            )}

            {/* Context usage ring */}
            {contextUsage > 0 && (() => {
              const sz = 18, sw = 2;
              const r = (sz - sw) / 2;
              const c = 2 * Math.PI * r;
              const off = c * (1 - contextUsage / 100);
              const col = contextUsage >= 90 ? '#FF6B6B' : contextUsage >= 60 ? '#FFB86C' : 'rgba(255,255,255,0.25)';
              return (
                <TouchableOpacity onPress={() => onToggleContextInfo(true)} activeOpacity={0.7} style={{ width: sz, height: sz, justifyContent: 'center', alignItems: 'center' }}>
                  <Svg width={sz} height={sz} style={{ transform: [{ rotate: '-90deg' }] }}>
                    <Circle cx={sz / 2} cy={sz / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={sw} fill="none" />
                    <Circle cx={sz / 2} cy={sz / 2} r={r} stroke={col} strokeWidth={sw} fill="none" strokeDasharray={`${c}`} strokeDashoffset={off} strokeLinecap="round" />
                  </Svg>
                </TouchableOpacity>
              );
            })()}

            {/* Model selector */}
            <TouchableOpacity style={styles.modelBtn} onPress={onToggleModelSelector}>
              <SafeText style={styles.modelText}>{currentModelName}</SafeText>
              <Ionicons name={showModelSelector ? 'chevron-up' : 'chevron-down'} size={12} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Main Input Row ── */}
        <View collapsable={false} style={styles.inputRow}>
          <TouchableOpacity style={styles.toolsBtn} onPress={onToolsPress} activeOpacity={0.7}>
            <Ionicons name="add" size={24} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            value={input}
            onChangeText={onChangeText}
            placeholder={agentMode === 'terminal' ? '$ comando...' : t('chat:placeholderFast')}
            placeholderTextColor={AppColors.dark.bodyText}
            multiline
            maxLength={1000}
            onSubmitEditing={onSend}
            keyboardAppearance="dark"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            textContentType="none"
            keyboardType="default"
          />

          <TouchableOpacity
            onPress={isBusy ? onStop : onSend}
            disabled={!isBusy && !hasContent}
            style={[
              styles.sendBtn,
              isBusy
                ? { backgroundColor: 'rgba(255,80,80,0.15)' }
                : hasContent
                  ? { backgroundColor: AppColors.primary }
                  : { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
            ]}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isBusy ? 'stop' : 'arrow-up'}
              size={16}
              color={isBusy ? '#FF5050' : hasContent ? '#fff' : 'rgba(255,255,255,0.3)'}
            />
          </TouchableOpacity>
        </View>

        {/* ── Project Context Bar — inside input bar ── */}
        {repoName && (
          <View style={styles.contextBar2}>
            <TouchableOpacity style={styles.contextChip} activeOpacity={0.6} onPress={onOpenGit}>
              <Ionicons name="logo-github" size={14} color="rgba(255,255,255,0.5)" />
              <Text style={styles.contextChipText} numberOfLines={1}>{repoName}</Text>
            </TouchableOpacity>
            {branchName && (
              <TouchableOpacity style={styles.contextChip} activeOpacity={0.6} onPress={onOpenBranch}>
                <Ionicons name="git-branch-outline" size={14} color="rgba(255,255,255,0.5)" />
                <Text style={styles.contextChipText} numberOfLines={1}>{branchName}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.contextChip, { borderRightWidth: 0 }]} activeOpacity={0.6} onPress={onOpenEnvVars}>
              <Ionicons name="document-text-outline" size={14} color={hasEnvVars ? '#10B981' : 'rgba(255,255,255,0.3)'} />
              <Text style={[styles.contextChipText, !hasEnvVars && { color: 'rgba(255,255,255,0.3)' }]}>.env</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Model Dropdown ── */}
      {showModelSelector && (
        <>
          <Pressable style={styles.dropdownOverlay} onPress={onCloseDropdown} />
          <Animated.View testID="modelDropdownGlass" style={[styles.dropdown, dropdownAnimatedStyle]}>
            {AI_MODELS.map((model) => {
              const Icon = model.IconComponent;
              const isSelected = selectedModel === model.id;
              const hasLevels = 'thinkingLevels' in model && Array.isArray((model as typeof AI_MODELS[number] & { thinkingLevels?: readonly string[] }).thinkingLevels);
              const isLocked = ('isPremium' in model && model.isPremium) && !isPaidUser;

              return (
                <TouchableOpacity
                  key={model.id}
                  style={[styles.dropdownItem, isSelected && styles.dropdownItemActive, isLocked && { opacity: 0.45 }]}
                  onPress={() => {
                    if (isLocked) { onLockedModelPress(model); return; }
                    onSelectModel(model.id);
                    if (hasLevels) {
                      const def = model.id.includes('flash') ? 'medium' : 'low';
                      onSetThinkingLevel(def);
                    }
                  }}
                >
                  <Icon size={16} />
                  <SafeText style={[styles.dropdownText, isSelected && styles.dropdownTextActive]}>{model.name}</SafeText>
                  {isLocked ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ backgroundColor: AppColors.primary, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                        <SafeText style={{ fontSize: 9, fontWeight: '900', color: '#fff' }}>GO</SafeText>
                      </View>
                      <Ionicons name="lock-closed" size={13} color="rgba(255,255,255,0.35)" />
                    </View>
                  ) : isSelected ? (
                    <Ionicons name="checkmark-circle" size={16} color={AppColors.primary} />
                  ) : null}
                </TouchableOpacity>
              );
            })}

            {/* Thinking levels */}
            {(() => {
              const currentModel = AI_MODELS.find(m => m.id === selectedModel);
              const modelLevels: readonly string[] = (currentModel && 'thinkingLevels' in currentModel) ? (currentModel as typeof AI_MODELS[number] & { thinkingLevels: readonly string[] }).thinkingLevels : [];
              const allLevels = ['minimal', 'low', 'medium', 'high'];
              return (
                <View style={styles.thinkingContainer}>
                  <SafeText style={styles.thinkingLabel}>{t('terminal:preview.thinkingLevel')}</SafeText>
                  <View style={styles.thinkingOptions}>
                    {allLevels.map((level) => {
                      const isAvailable = modelLevels.includes(level);
                      const isActive = isAvailable && thinkingLevel === level;
                      return (
                        <TouchableOpacity
                          key={level}
                          style={[styles.thinkingChip, isActive && styles.thinkingChipActive, !isAvailable && { opacity: 0.25 }]}
                          onPress={() => isAvailable && onSetThinkingLevel(level)}
                          disabled={!isAvailable}
                        >
                          <SafeText style={[styles.thinkingChipText, isActive && styles.thinkingChipTextActive]}>
                            {thinkingLevelLabels[level] || level}
                          </SafeText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })()}
          </Animated.View>
        </>
      )}

      {/* ── Context Info Tooltip ── */}
      {showContextInfo && (() => {
        const contextWindows: Record<string, number> = {
          'claude-4-7-opus': 1000000, 'claude-opus-4-7': 1000000, 'claude-4-6-opus': 1000000, 'claude-4-6-sonnet': 200000, 'claude-haiku-3.5': 200000,
          'claude-sonnet-4': 200000, 'gemini-3-flash': 1000000, 'gemini-3.1-pro': 1000000,
          'gpt-5-4': 128000, 'glm-5.1': 202752, 'llama-3.3-70b': 128000,
        };
        const windowK = Math.round((contextWindows[selectedModel] || 200000) / 1000);
        const compactionAt = 90;
        const remaining = Math.max(0, compactionAt - contextUsage);
        return (
          <>
            <Pressable style={{ position: 'absolute', top: -500, left: -500, right: -500, bottom: -500 }} onPress={() => onToggleContextInfo(false)} />
            <View style={styles.contextTooltip}>
              <SafeText style={styles.contextTitle}>{t('chat:context.title', { percent: contextUsage })}</SafeText>
              <SafeText style={styles.contextBody}>
                {contextUsage < compactionAt
                  ? t('chat:context.beforeCompaction', { threshold: compactionAt, remaining })
                  : t('chat:context.compactionActive')}
              </SafeText>
              <View style={styles.contextBar}>
                <View style={[styles.contextBarFill, {
                  width: `${contextUsage}%`,
                  backgroundColor: contextUsage >= 90 ? '#FF6B6B' : contextUsage >= 60 ? '#FFB86C' : 'rgba(255,255,255,0.25)',
                }]} />
              </View>
              <SafeText style={styles.contextWindow}>{t('chat:context.window', { size: windowK })}</SafeText>
            </View>
          </>
        );
      })()}
    </>
  );
});

ChatInputBar.displayName = 'ChatInputBar';

// ── Styles ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    elevation: 8,
    marginHorizontal: 20,
    zIndex: 10,
    overflow: 'hidden',
  },
  containerWithImages: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 0,
  },

  // Top controls
  topControls: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 4,
    overflow: 'visible',
    zIndex: 100,
  },
  modeToggleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modeToggle: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 3,
    gap: 1,
  },
  modeBtn: {
    width: 30,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
  },
  modeBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  rightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // Budget
  budgetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 12,
  },
  budgetTrack: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  budgetFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Model selector
  modelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  modelText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
  },

  // Main input row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  // Project context bar (inside input bar)
  contextBar2: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 6,
  },
  contextChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(255,255,255,0.08)',
  },
  contextChipText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '500',
  },
  toolsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: AppColors.dark.titleText,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 300,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },

  // Model dropdown
  dropdownOverlay: {
    position: 'absolute',
    top: -500,
    left: -500,
    right: -500,
    bottom: -500,
    zIndex: 998,
  },
  dropdown: {
    position: 'absolute',
    bottom: '100%',
    right: 16,
    marginBottom: 8,
    backgroundColor: '#1a1a1e',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 6,
    minWidth: 200,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 20,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderRadius: 12,
    marginHorizontal: 3,
    marginVertical: 2,
  },
  dropdownItemActive: {
    backgroundColor: AppColors.primaryAlpha.a22,
  },
  dropdownText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  dropdownTextActive: {
    color: AppColors.white.full,
    fontWeight: '700',
  },

  // Thinking levels
  thinkingContainer: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    marginTop: 4,
  },
  thinkingLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 8,
    fontWeight: '500',
  },
  thinkingOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  thinkingChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  thinkingChipActive: {
    backgroundColor: AppColors.primaryAlpha.a22,
    borderColor: AppColors.primary,
  },
  thinkingChipText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  thinkingChipTextActive: {
    color: AppColors.primary,
    fontWeight: '600',
  },

  // Context tooltip
  contextTooltip: {
    position: 'absolute',
    bottom: '100%',
    right: 0,
    marginBottom: 8,
    backgroundColor: 'rgba(30,30,35,0.95)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: 220,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  contextTitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  contextBody: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    lineHeight: 16,
  },
  contextBar: {
    marginTop: 8,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  contextBarFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  contextWindow: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    marginTop: 4,
  },
});
