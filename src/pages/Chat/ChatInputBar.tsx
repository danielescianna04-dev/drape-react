import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable,
  StyleSheet, Platform, Image, ScrollView,
} from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { SafeText } from '../../shared/components/SafeText';
import { AppColors } from '../../shared/theme/colors';
import { canUseModel } from '../../core/entitlements/planEntitlements';
import { useAuthStore } from '../../core/auth/authStore';
import { SlashMenu } from './SlashMenu';

// ── AI Models ───────────────────────────────────────────────────────
// Icon components
const createLetterIcon = (letter: string, color: string) => {
  return ({ size = 16 }: { size?: number }) => (
    <View style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: color,
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <Text style={{
        color: '#ffffff',
        fontSize: size * 0.65,
        fontWeight: 'bold',
        lineHeight: size * 0.75,
        textAlign: 'center',
      }}>{letter}</Text>
    </View>
  );
};

const DeepSeekIcon = createLetterIcon('D', '#007AFF');
const QwenIcon = createLetterIcon('Q', '#00A896');
const GemmaIcon = createLetterIcon('G', '#34A853');

export const AI_MODELS = [
  { id: 'openrouter/deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', IconComponent: DeepSeekIcon, hasThinking: false, thinkingLevels: [] as readonly string[] },
  { id: 'openrouter/deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', IconComponent: DeepSeekIcon, hasThinking: false, thinkingLevels: [] as readonly string[] },
  { id: 'openrouter/qwen/qwen3-coder', name: 'Qwen3 Coder', IconComponent: QwenIcon, hasThinking: false, thinkingLevels: [] as readonly string[] },
  { id: 'openrouter/google/gemma-4-31b-it:free', name: 'Gemma 4 31B (free)', IconComponent: GemmaIcon, hasThinking: false, thinkingLevels: [] as readonly string[] },
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
  selectedImages?: Array<{ uri: string }>;
  onRemoveImage?: (index: number) => void;

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

const TYPEWRITER_PHRASES = [
  'Ask Bynot to create a presentation about…',
  'Ask Bynot to build a landing page for my…',
  'Ask Bynot to design an app that…',
  'Ask Bynot to make a dashboard for…',
  'Ask Bynot to generate a report on…',
  'Ask Bynot to build a SaaS for…',
  'Ask Bynot to clone Airbnb but for…',
  'Ask Bynot to design a portfolio site for…',
  'Ask Bynot to make a CRM that…',
  'Ask Bynot to build an AI chatbot for…',
  'Ask Bynot to create a marketplace for…',
  'Ask Bynot to build a habit tracker that…',
  'Ask Bynot to design a todo app with…',
  'Ask Bynot to make a recipe app for…',
  'Ask Bynot to build a budget tracker that…',
  'Ask Bynot to create a meditation app for…',
  'Ask Bynot to design a fitness tracker that…',
  'Ask Bynot to build a chat app for…',
  'Ask Bynot to make a blog for…',
  'Ask Bynot to build a booking system for…',
  'Ask Bynot to design a pricing page for…',
  'Ask Bynot to create an admin panel for…',
  'Ask Bynot to build a kanban board for…',
  'Ask Bynot to make a quiz app about…',
  'Ask Bynot to build a music player that…',
  'Ask Bynot to design a checkout flow for…',
  'Ask Bynot to create a survey tool for…',
  'Ask Bynot to build a calendar app for…',
  'Ask Bynot to make an invoice generator for…',
  'Ask Bynot to build a notes app with…',
  'Ask Bynot to design an analytics dashboard for…',
  'Ask Bynot to clone Twitter but for…',
  'Ask Bynot to build a course platform for…',
  'Ask Bynot to make a job board for…',
  'Ask Bynot to build a recipe sharing site for…',
];

const useTypewriter = (phrases: string[]): string => {
  const [text, setText] = useState('');
  const idxRef = useRef(0);
  const charRef = useRef(0);
  const deletingRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    let timeout: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (!mounted) return;
      const current = phrases[idxRef.current % phrases.length];
      if (!deletingRef.current) {
        charRef.current += 1;
        setText(current.slice(0, charRef.current));
        if (charRef.current >= current.length) {
          deletingRef.current = true;
          timeout = setTimeout(tick, 1800);
          return;
        }
        timeout = setTimeout(tick, 38);
      } else {
        charRef.current -= 1;
        setText(current.slice(0, Math.max(0, charRef.current)));
        if (charRef.current <= 0) {
          deletingRef.current = false;
          idxRef.current += 1;
          timeout = setTimeout(tick, 250);
          return;
        }
        timeout = setTimeout(tick, 18);
      }
    };

    timeout = setTimeout(tick, 400);
    return () => { mounted = false; clearTimeout(timeout); };
  }, [phrases]);

  return text;
};


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
  selectedImages,
  onRemoveImage,
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
  const currentPlan = useAuthStore((s) => s.user?.plan);
  const [buildPlanMode, setBuildPlanMode] = useState<'build' | 'plan'>('build');
  const [showBuildPlanSelector, setShowBuildPlanSelector] = useState(false);

  const thinkingLevelLabels = useMemo<Record<string, string>>(() => ({
    none: t('terminal:chat.reasoningLevels.off'),
    minimal: t('terminal:chat.reasoningLevels.minimal'),
    low: t('terminal:chat.reasoningLevels.low'),
    medium: t('terminal:chat.reasoningLevels.medium'),
    high: t('terminal:chat.reasoningLevels.high'),
  }), [t]);

  const isBusy = isStreaming || isLoading;
  const hasContent = input.trim().length > 0 || hasImages;
  const animatedPlaceholder = useTypewriter(TYPEWRITER_PHRASES);

  return (
    <>
      <View
        testID={inputBarGlassId}
        nativeID={inputBarGlassId}
        style={[styles.container, hasImages && styles.containerCompactTop]}
        onLayout={onLayout}
      >
        {!glassApplied && (
          <LinearGradient
            colors={[`${AppColors.dark.surface}F9`, `${AppColors.dark.surface}EB`]}
            style={StyleSheet.absoluteFill}
          />
        )}

        {/* ── Slash menu (active when input starts with `/`) ── */}
        <SlashMenu value={input} onSelect={(v) => onChangeText(v)} />

        {/* ── Selected images preview (inside the input card, above the text) ── */}
        {selectedImages && selectedImages.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.imagesRow}
          >
            {selectedImages.map((image, index) => (
              <View key={`${image.uri}-${index}`} style={styles.imageItem}>
                <Image source={{ uri: image.uri }} style={styles.imageThumb} />
                <TouchableOpacity
                  style={styles.imageRemoveBtn}
                  onPress={() => onRemoveImage?.(index)}
                  activeOpacity={0.7}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={11} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* ── Main Input (Lovable-style) ── */}
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={onChangeText}
          placeholder={agentMode === 'terminal' ? '$ comando...' : animatedPlaceholder || 'Ask Bynot to…'}
          placeholderTextColor="rgba(255,255,255,0.45)"
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

        <View collapsable={false} style={styles.actionsRow}>
          <TouchableOpacity style={styles.toolsBtn} onPress={onToolsPress} activeOpacity={0.7}>
            <Ionicons name="add" size={24} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          <TouchableOpacity
            style={styles.planBuildPill}
            onPress={() => setShowBuildPlanSelector(true)}
            activeOpacity={0.7}
          >
            <SafeText style={styles.planBuildText}>
              {buildPlanMode === 'build' ? 'Build' : 'Plan'}
            </SafeText>
            <Ionicons name="chevron-down" size={14} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.micBtn} activeOpacity={0.7}>
            <Ionicons name="mic-outline" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={isBusy ? onStop : onSend}
            disabled={!isBusy && !hasContent}
            style={[
              styles.sendBtn,
              isBusy
                ? { backgroundColor: 'rgba(255,80,80,0.15)' }
                : hasContent
                  ? { backgroundColor: '#E5E5E5' }
                  : { backgroundColor: 'rgba(255,255,255,0.18)' },
            ]}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isBusy ? 'stop' : 'arrow-up'}
              size={18}
              color={isBusy ? '#FF5050' : hasContent ? '#000' : 'rgba(255,255,255,0.85)'}
            />
          </TouchableOpacity>
        </View>

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
              const isLocked = !canUseModel(currentPlan, model.id);

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

      {/* ── Build / Plan Dropdown ── */}
      {showBuildPlanSelector && (
        <>
          <Pressable
            style={styles.dropdownOverlay}
            onPress={() => setShowBuildPlanSelector(false)}
          />
          <View style={styles.buildPlanDropdown}>
            <TouchableOpacity
              style={styles.buildPlanDropdownItem}
              onPress={() => {
                setBuildPlanMode('build');
                setShowBuildPlanSelector(false);
              }}
            >
              <View style={styles.buildPlanItemLeft}>
                {buildPlanMode === 'build' ? (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                ) : (
                  <View style={{ width: 16 }} />
                )}
              </View>
              <View style={styles.buildPlanItemTextContainer}>
                <SafeText style={styles.buildPlanItemTitle}>Build</SafeText>
                <SafeText style={styles.buildPlanItemSubtitle}>Make changes directly</SafeText>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.buildPlanDropdownItem}
              onPress={() => {
                setBuildPlanMode('plan');
                setShowBuildPlanSelector(false);
              }}
            >
              <View style={styles.buildPlanItemLeft}>
                {buildPlanMode === 'plan' ? (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                ) : (
                  <View style={{ width: 16 }} />
                )}
              </View>
              <View style={styles.buildPlanItemTextContainer}>
                <SafeText style={styles.buildPlanItemTitle}>Plan</SafeText>
                <SafeText style={styles.buildPlanItemSubtitle}>Discuss before building</SafeText>
              </View>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── Context Info Tooltip ── */}
      {showContextInfo && (() => {
        const contextWindows: Record<string, number> = {
          'deepseek-v4-flash-free': 128000,
          'qwen3.6-plus-free': 128000,
          'nemotron-3-super-free': 128000,
          'minimax-m2.5-free': 128000,
          'big-pickle': 128000,
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
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1F1F25',
    elevation: 8,
    marginHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 10,
    paddingHorizontal: 6,
    zIndex: 10,
    overflow: 'hidden',
  },
  containerCompactTop: {
    paddingTop: 6,
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
  planBuildPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: 'transparent',
    borderRadius: 999,
    overflow: 'hidden',
  },
  planBuildText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  buildPlanDropdown: {
    position: 'absolute',
    bottom: 60,
    right: 76,
    backgroundColor: '#121214',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 8,
    minWidth: 220,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 20,
  },
  buildPlanDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderRadius: 12,
    marginVertical: 2,
  },
  buildPlanItemLeft: {
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buildPlanItemTextContainer: {
    flex: 1,
    flexDirection: 'column',
    gap: 2,
  },
  buildPlanItemTitle: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  buildPlanItemSubtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
  },

  // Main input row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 4,
    gap: 6,
  },
  micBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
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
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    fontSize: 16,
    color: AppColors.dark.titleText,
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 14,
    minHeight: 32,
    maxHeight: 240,
  },
  imagesRow: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 22,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  imageItem: {
    width: 56,
    height: 56,
    borderRadius: 10,
    marginRight: 8,
    position: 'relative',
  },
  imageThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
  },
  imageRemoveBtn: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
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
