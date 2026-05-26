/**
 * PreviewPreparingState — Gorgeous, modern loading/start screen for the preview.
 * Replaces the old terminal logs / basic window with a premium layered card deck stack,
 * clean status indicators, and control buttons matching Screenshot 2.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Share,
  Alert,
  Animated as RNAnimated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppColors } from '../../../../shared/theme/colors';
import { useTabStore } from '../../../../core/tabs/tabStore';

const THINKING_PHRASES = [
  'Thinking…',
  'Working on it…',
  'Building your app…',
  'Generating components…',
  'Wiring things up…',
  'Designing the UI…',
  'Drafting the layout…',
  'Crunching the details…',
  'Connecting the pieces…',
  'Almost there…',
];

const useThinkingTypewriter = (active: boolean): string => {
  const [text, setText] = useState(THINKING_PHRASES[0]);
  const idxRef = useRef(0);
  const charRef = useRef(THINKING_PHRASES[0].length);
  const deletingRef = useRef(true);

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    let timeout: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (!mounted) return;
      const current = THINKING_PHRASES[idxRef.current % THINKING_PHRASES.length];
      if (!deletingRef.current) {
        charRef.current += 1;
        setText(current.slice(0, charRef.current));
        if (charRef.current >= current.length) {
          deletingRef.current = true;
          timeout = setTimeout(tick, 1400);
          return;
        }
        timeout = setTimeout(tick, 42);
      } else {
        charRef.current -= 1;
        setText(current.slice(0, Math.max(0, charRef.current)));
        if (charRef.current <= 0) {
          deletingRef.current = false;
          idxRef.current += 1;
          timeout = setTimeout(tick, 220);
          return;
        }
        timeout = setTimeout(tick, 22);
      }
    };

    timeout = setTimeout(tick, 400);
    return () => { mounted = false; clearTimeout(timeout); };
  }, [active]);

  return text;
};

export interface PreviewPreparingStateProps {
  projectName?: string;
  isStarting: boolean;
  statusMessage?: string;
  onStart: () => void;
  onClose: () => void;
  onRefresh?: () => void;
  previewUrl?: string;
  onUrlChange?: (url: string) => void;
  onMic?: () => void;
}

export const PreviewPreparingState: React.FC<PreviewPreparingStateProps> = ({
  projectName = 'bynot cloud',
  isStarting,
  statusMessage,
  onStart,
  onClose,
  onRefresh,
  previewUrl,
  onUrlChange,
  onMic,
}) => {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  const cardWidth = Math.min(screenWidth * 0.88, 340);
  const cardHeight = 360;

  // Show "Thinking..." pill when the active chat tab is processing.
  const isChatThinking = useTabStore((state) => {
    const chatTab = state.tabs.find((tab) => tab.type === 'chat');
    if (!chatTab) return false;
    if (chatTab.isLoading) return true;
    return (chatTab.terminalItems || []).some((item: any) => item?.isThinking);
  });
  const thinkingText = useThinkingTypewriter(isChatThinking);

  // Shimmer/pulse opacity for the thinking pill text.
  const shimmerOpacity = useRef(new RNAnimated.Value(0.45)).current;
  useEffect(() => {
    if (!isChatThinking) {
      shimmerOpacity.setValue(0.45);
      return;
    }
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(shimmerOpacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        RNAnimated.timing(shimmerOpacity, {
          toValue: 0.35,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => { loop.stop(); };
  }, [isChatThinking, shimmerOpacity]);

  // Header pill text defaults to "Getting ready..." if starting, or "Ready to start" if idle
  const headerText = statusMessage || (isStarting ? 'Getting ready...' : 'Ready to start');

  const handleStartPress = () => {
    if (!isStarting) {
      onStart();
    }
  };

  const handleShare = async () => {
    if (!previewUrl) {
      Alert.alert('Preview non pronta', 'Avvia la preview prima di condividere.');
      return;
    }
    try {
      await Share.share({ message: previewUrl, url: previewUrl });
    } catch {
      // user cancelled or share failed silently
    }
  };

  const handleMicPress = () => {
    if (onMic) onMic();
    else onClose();
  };

  const handleSlashPress = () => {
    if (!previewUrl) {
      Alert.alert('Preview non pronta', 'Avvia la preview prima di modificare il path.');
      return;
    }
    let currentPath = '/';
    let basePath = previewUrl.replace(/^https?:\/\//, '');
    const slashIdx = basePath.indexOf('/');
    if (slashIdx !== -1) {
      currentPath = basePath.slice(slashIdx) || '/';
      basePath = basePath.slice(0, slashIdx);
    }
    Alert.prompt(
      'Path della preview',
      `https://${basePath}`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Vai',
          onPress: (raw) => {
            const input = (raw ?? '').trim() || '/';
            const path = input.startsWith('/') ? input : `/${input}`;
            const next = `https://${basePath}${path}`;
            if (onUrlChange && next !== previewUrl) onUrlChange(next);
          },
        },
      ],
      'plain-text',
      currentPath,
    );
  };

  return (
    <View style={s.root}>
      {/* Premium dark gradient background — same as chat home */}
      <LinearGradient
        colors={AppColors.gradient.dark}
        locations={[0, 0.3, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* TOP HEADER PILL */}
      <View style={[s.headerContainer, { paddingTop: Math.max(insets.top, 20) }]}>
        <View style={s.headerPill}>
          {isStarting ? (
            <ActivityIndicator size="small" color="#A1A1AA" style={s.headerSpinner} />
          ) : (
            <Ionicons name="play-circle-outline" size={16} color="#A1A1AA" style={s.headerSpinner} />
          )}
          <Text style={s.headerPillText}>{headerText}</Text>
        </View>
      </View>

      {/* CENTER: CARD DECK STACK */}
      <View style={s.centerContainer}>
        {/* Decorative back cards — peek out from above the front card, non-interactive */}
        <View
          pointerEvents="none"
          style={[s.deckCard, s.cardPeekTop4, { width: cardWidth - 80, height: cardHeight }]}
        />
        <View
          pointerEvents="none"
          style={[s.deckCard, s.cardPeekTop3, { width: cardWidth - 60, height: cardHeight }]}
        />
        <View
          pointerEvents="none"
          style={[s.deckCard, s.cardPeekTop2, { width: cardWidth - 40, height: cardHeight }]}
        />
        <View
          pointerEvents="none"
          style={[s.deckCard, s.cardPeekTop1, { width: cardWidth - 20, height: cardHeight }]}
        />

        {/* Layer 1: Front active card */}
        <TouchableOpacity
          activeOpacity={isStarting ? 1 : 0.9}
          onPress={handleStartPress}
          style={[s.deckCard, s.cardFront, { width: cardWidth, height: cardHeight }]}
        >
          {/* Mock Browser/App Canvas Placeholder */}
          <View style={s.canvasPlaceholder}>
            {/* Mock browser header dots */}
            <View style={s.mockBrowserHeader}>
              <View style={s.mockDots}>
                <View style={[s.mockDot, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
                <View style={[s.mockDot, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
                <View style={[s.mockDot, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
              </View>
              <View style={s.mockUrlBar} />
            </View>

            {/* Mock layout grid elements */}
            <View style={s.mockContentContainer}>
              <View style={s.mockSidebar} />
              <View style={s.mockMainContent}>
                <View style={s.mockHeroBlock} />
                <View style={s.mockRow}>
                  <View style={s.mockCol} />
                  <View style={s.mockCol} />
                  <View style={s.mockCol} />
                </View>
              </View>
            </View>
          </View>

          {/* Project Details */}
          <View style={s.projectDetails}>
            <Text style={s.projectTitle} numberOfLines={1}>
              Bynot Cloud
            </Text>
            <Text style={s.projectDesc} numberOfLines={3}>
              Describe features, get full apps. Data, hosting, auth, AI included.
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* BOTTOM AREA */}
      <View style={[s.bottomContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        {isChatThinking && (
          <RNAnimated.View style={[s.statusPill, { opacity: shimmerOpacity }]}>
            <Ionicons name="bulb-outline" size={16} color="#A1A1AA" style={s.statusIcon} />
            <Text style={s.statusText}>{thinkingText || 'Thinking…'}</Text>
          </RNAnimated.View>
        )}

        {/* Control Footer Row */}
        <View style={s.footerRow}>
          {/* Back button on the left */}
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.8}
            style={s.chatButton}
          >
            <Ionicons name="chevron-back" size={16} color="#FFFFFF" style={s.chatIcon} />
            <Text style={s.chatButtonText}>Chat</Text>
          </TouchableOpacity>

          {/* Icon buttons row on the right */}
          <View style={s.actionRow}>
            {/* Microphone Button */}
            <TouchableOpacity onPress={handleMicPress} style={s.actionButton} activeOpacity={0.7}>
              <Ionicons name="mic-outline" size={18} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Refresh/Retry Button */}
            <TouchableOpacity
              onPress={onRefresh || onStart}
              style={s.actionButton}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh-outline" size={18} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Slash Command Button */}
            <TouchableOpacity onPress={handleSlashPress} style={s.actionButton} activeOpacity={0.7}>
              <Text style={s.slashText}>/</Text>
            </TouchableOpacity>

            {/* Share/Upload Button */}
            <TouchableOpacity onPress={handleShare} style={s.actionButton} activeOpacity={0.7}>
              <Ionicons name="share-outline" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // TOP HEADER PILL
  headerContainer: {
    width: '100%',
    alignItems: 'center',
  },
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E20',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  headerSpinner: {
    marginRight: 8,
  },
  headerPillText: {
    color: '#E4E4E7',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  // CENTER CARD DECK
  centerContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minHeight: 400,
  },
  deckCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  cardFront: {
    backgroundColor: '#1E1E20',
    padding: 16,
    zIndex: 10,
  },
  cardPeekTop1: {
    backgroundColor: '#18181A',
    position: 'absolute',
    alignSelf: 'center',
    transform: [{ translateY: -14 }],
    opacity: 0.7,
    zIndex: 8,
  },
  cardPeekTop2: {
    backgroundColor: '#161618',
    position: 'absolute',
    alignSelf: 'center',
    transform: [{ translateY: -28 }],
    opacity: 0.5,
    zIndex: 6,
  },
  cardPeekTop3: {
    backgroundColor: '#131315',
    position: 'absolute',
    alignSelf: 'center',
    transform: [{ translateY: -42 }],
    opacity: 0.32,
    zIndex: 4,
  },
  cardPeekTop4: {
    backgroundColor: '#101012',
    position: 'absolute',
    alignSelf: 'center',
    transform: [{ translateY: -56 }],
    opacity: 0.18,
    zIndex: 2,
  },
  // Inner Front Card Layout
  canvasPlaceholder: {
    height: 180,
    backgroundColor: '#151516',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
    overflow: 'hidden',
    padding: 8,
  },
  mockBrowserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 16,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  mockDots: {
    flexDirection: 'row',
    gap: 4,
    marginRight: 12,
  },
  mockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  mockUrlBar: {
    flex: 1,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 5,
    maxWidth: 120,
  },
  mockContentContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  mockSidebar: {
    width: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 6,
  },
  mockMainContent: {
    flex: 1,
    gap: 8,
  },
  mockHeroBlock: {
    flex: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 8,
  },
  mockRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  mockCol: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 6,
  },
  projectDetails: {
    marginTop: 20,
    paddingHorizontal: 4,
  },
  projectTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  projectDesc: {
    fontSize: 14,
    color: '#A1A1AA',
    lineHeight: 20,
  },
  // BOTTOM CONTAINER & FOOTER
  bottomContainer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 16,
  },
  statusPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    backgroundColor: '#1E1E20',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 11,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 12,
  },
  statusIcon: {
    marginRight: 6,
  },
  statusText: {
    color: '#E4E4E7',
    fontSize: 12,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 360,
    marginTop: 4,
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#27272A',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  chatIcon: {
    marginRight: 4,
  },
  chatButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#27272A',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slashText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
});
