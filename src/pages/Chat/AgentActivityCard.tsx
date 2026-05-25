import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Platform, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolateColor,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import { renderStatusFromPool } from './chatToolFormatting';
import { AppColors } from '../../shared/theme/colors';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  state: 'running' | 'done';
  poolKey: string;
  file: string;
  onPress?: () => void;
  /** Shown only in 'done' state, on the left. */
  onShowDetails?: () => void;
  /** Shown only in 'done' state, on the right as the primary action. */
  onStartPreview?: () => void;
}

const SUBTITLE_INTERVAL_MS = 2500;

const getToolTitle = (poolKey: string, state: 'running' | 'done'): string => {
  // 'done' = the whole agent task finished, not just the last tool.
  // Uniform completion title (vs the per-tool labels we use while running)
  // so the user knows the whole job is over, not just one step.
  if (state === 'done') return 'Tutto pronto';

  if (poolKey === 'read') return 'Leggo il file';
  if (poolKey === 'write') return 'Creo il file';
  if (poolKey === 'edit') return 'Modifico il file';
  if (poolKey === 'delete') return 'Elimino il file';
  if (poolKey === 'move') return 'Sposto il file';
  if (poolKey === 'folder') return 'Creo una cartella';
  if (poolKey === 'list') return 'Sfoglio le cartelle';
  if (poolKey === 'glob') return 'Cerco i file';
  if (poolKey === 'search') return 'Frugo nel codice';
  if (poolKey === 'bash_npm') return 'Installo librerie';
  if (poolKey === 'bash_build') return 'Costruisco l\'app';
  if (poolKey === 'bash_test') return 'Faccio i controlli';
  if (poolKey === 'bash_other') return 'Eseguo comandi';
  if (poolKey === 'web_fetch') return 'Visito pagina web';
  if (poolKey === 'web_search') return 'Cerco su internet';
  if (poolKey === 'diagnostics') return 'Scansiono errori';
  if (poolKey === 'todo') return 'Organizzo il piano';
  if (poolKey === 'skill') return 'Imparo abilità';
  if (poolKey === 'memory') return 'Consulto la memoria';
  if (poolKey === 'subagent') return 'Lavoro in squadra';
  if (poolKey === 'lsp') return 'Studio il progetto';
  if (poolKey === 'question') return 'Ti chiedo conferma';
  return 'Lavoro in corso';
};

interface AnimatedTextProps {
  text: string;
  style?: any;
  numberOfLines?: number;
}

/**
 * Text component with premium cross-fade and slide transitions.
 * When text updates, it fades out/slides, updates state, and fades back in/slides up.
 */
const AnimatedText: React.FC<AnimatedTextProps> = ({ text, style, numberOfLines }) => {
  const [currentText, setCurrentText] = useState(text);
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (text !== currentText) {
      opacity.value = withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) }, (isFinished) => {
        if (isFinished) {
          runOnJS(setCurrentText)(text);
          translateY.value = 8;
          opacity.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) });
          translateY.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.quad) });
        }
      });
    }
  }, [text, currentText]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ translateY: translateY.value }],
    };
  });

  return (
    <Animated.Text style={[style, animatedStyle]} numberOfLines={numberOfLines}>
      {currentText}
    </Animated.Text>
  );
};

/**
 * Lovable-style activity card shown in chat while the AI is running tools.
 * 
 * Clean, non-technical, active design with animated transitions:
 *   • Semi-transparent dark container with thin borders.
 *   • Title displaying friendly active statuses in Italian.
 *   • Filename displayed as a monospaced badge next to the title.
 *   • Shimmering subtitle showing friendly status in Italian.
 *   • Animated FadeInDown transitions when text updates.
 */
export const AgentActivityCard: React.FC<Props> = ({ state, poolKey, file, onPress, onShowDetails, onStartPreview }) => {
  const shimmer = useSharedValue(0);
  const dotScale = useSharedValue(1);
  const dotOpacity = useSharedValue(0.6);

  // Rotating copy as plain state — picked from the pool on a timer.
  const [subtitle, setSubtitle] = useState<string>(() => renderStatusFromPool(poolKey, ''));

  // Reset the subtitle immediately on pool key / file change
  const poolRef = useRef<{ poolKey: string; file: string }>({ poolKey, file });
  useEffect(() => {
    if (poolRef.current.poolKey !== poolKey || poolRef.current.file !== file) {
      poolRef.current = { poolKey, file };
      setSubtitle(renderStatusFromPool(poolKey, ''));
    } else {
      poolRef.current = { poolKey, file };
    }
  }, [poolKey, file]);

  // Self-rotation timer for the subtitle text
  useEffect(() => {
    if (state !== 'running') return;
    const subTimer = setInterval(() => {
      setSubtitle(renderStatusFromPool(poolRef.current.poolKey, ''));
    }, SUBTITLE_INTERVAL_MS);
    return () => {
      clearInterval(subTimer);
    };
  }, [state]);

  // Shimmer breathing animation for the subtitle
  useEffect(() => {
    if (state !== 'running') {
      cancelAnimation(shimmer);
      shimmer.value = 0;
      return;
    }
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(shimmer);
    };
  }, [state, shimmer]);

  // Pulse animation for the active state dot
  useEffect(() => {
    if (state !== 'running') {
      cancelAnimation(dotScale);
      cancelAnimation(dotOpacity);
      dotScale.value = 1;
      dotOpacity.value = 0;
      return;
    }
    dotScale.value = 1;
    dotOpacity.value = 0.6;
    dotScale.value = withRepeat(
      withTiming(2, { duration: 1200, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    dotOpacity.value = withRepeat(
      withTiming(0, { duration: 1200, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(dotScale);
      cancelAnimation(dotOpacity);
    };
  }, [state]);

  const subtitleStyle = useAnimatedStyle(() => {
    if (state === 'done') return { color: 'rgba(255, 255, 255, 0.45)' };
    const color = interpolateColor(
      shimmer.value,
      [0, 0.5, 1],
      [
        'rgba(255, 255, 255, 0.45)',
        'rgba(255, 255, 255, 0.85)',
        'rgba(255, 255, 255, 0.45)',
      ],
    );
    return { color };
  }, [state]);

  const pulseStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: dotScale.value }],
      opacity: dotOpacity.value,
    };
  });

  const title = getToolTitle(poolKey, state);

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.85 : 1}
      onPress={onPress}
      disabled={!onPress}
      style={styles.cardOuter}
    >
      <BlurView intensity={18} tint="dark" style={styles.cardBlur}>
        <View style={styles.cardContent}>
          <View style={styles.mainRow}>
            <View style={styles.textColumn}>
              <View style={styles.headerRow}>
                <View style={styles.statusDotWrapper}>
                  {state === 'running' ? (
                    <>
                      <Animated.View style={[styles.pulseRing, pulseStyle]} />
                      <View style={styles.activeDot} />
                    </>
                  ) : (
                    <View style={styles.doneDot} />
                  )}
                </View>
                <AnimatedText text={title} style={styles.title} />
                {file && state === 'running' ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText} numberOfLines={1}>
                      {file}
                    </Text>
                  </View>
                ) : null}
              </View>
              <AnimatedText
                text={state === 'done' ? 'La tua app è pronta. Apri la preview per vederla.' : subtitle}
                style={[styles.subtitle, subtitleStyle]}
              />
            </View>
            {onPress && state === 'running' ? (
              <View style={styles.chevronWrapper}>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color="rgba(255, 255, 255, 0.4)"
                />
              </View>
            ) : null}
          </View>
          {state === 'done' && (onShowDetails || onStartPreview) ? (
            <View style={styles.actionsRow}>
              {onShowDetails ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={onShowDetails}
                  style={[styles.actionBtn, styles.actionBtnGhost]}
                >
                  <Ionicons name="list-outline" size={15} color="rgba(255,255,255,0.85)" />
                  <Text style={styles.actionBtnGhostText}>Dettagli</Text>
                </TouchableOpacity>
              ) : null}
              {onStartPreview ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={onStartPreview}
                  style={[styles.actionBtn, styles.actionBtnPrimary]}
                >
                  <Ionicons name="play" size={14} color="#FFFFFF" />
                  <Text style={styles.actionBtnPrimaryText}>Avvia preview</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      </BlurView>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  cardOuter: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(109, 76, 255, 0.16)', // Premium violet border
    backgroundColor: 'rgba(18, 17, 26, 0.6)', // Deep semi-transparent violet-surface
    overflow: 'hidden',
  },
  cardBlur: {
    width: '100%',
  },
  cardContent: {
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  textColumn: {
    flex: 1,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusDotWrapper: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: AppColors.primary, // Premium violet
  },
  pulseRing: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: AppColors.primary,
  },
  doneDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: AppColors.success, // Success green
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.1,
  },
  badge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    maxWidth: '70%',
  },
  badgeText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  chevronWrapper: {
    paddingLeft: 4,
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  actionBtnGhost: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  actionBtnGhostText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  actionBtnPrimary: {
    backgroundColor: AppColors.primary,
  },
  actionBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
});
