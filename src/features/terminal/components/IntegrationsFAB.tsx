import React, { useEffect } from 'react';
import { StyleSheet, Dimensions, Pressable } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppColors } from '../../../shared/theme/colors';
import { FigmaLogo } from '../../../shared/components/icons/FigmaLogo';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const FAB_SIZE = 48;
const ICON_BUTTON_SIZE = 44;
const STORAGE_KEY = 'integrations_fab_position';

// Margins from screen edges
const MARGIN = 16; // Padding from right edge
const TOP_MARGIN = 100; // Below status bar and header
const BOTTOM_MARGIN = 150; // Above bottom bar
const LEFT_MARGIN = 60; // After sidebar

interface IntegrationsFABProps {
  visible: boolean;
  onSupabasePress: () => void;
  onFigmaPress: () => void;
  onClose: () => void;
}

export const IntegrationsFAB: React.FC<IntegrationsFABProps> = ({
  visible,
  onSupabasePress,
  onFigmaPress,
  onClose,
}) => {
  // Position values - default to top right (with padding from edges)
  const translateX = useSharedValue(SCREEN_WIDTH - FAB_SIZE - MARGIN);
  const translateY = useSharedValue(TOP_MARGIN);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const scale = useSharedValue(0);
  const isDragging = useSharedValue(false);

  // Load saved position on mount
  useEffect(() => {
    const loadPosition = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const { x, y } = JSON.parse(saved);
          translateX.value = x;
          translateY.value = y;
        }
      } catch (e) {
        console.log('Failed to load FAB position:', e);
      }
    };
    loadPosition();
  }, []);

  // Save position when drag ends
  const savePosition = async (x: number, y: number) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ x, y }));
    } catch (e) {
      console.log('Failed to save FAB position:', e);
    }
  };

  // Animate visibility
  useEffect(() => {
    scale.value = withTiming(visible ? 1 : 0, {
      duration: 200,
      easing: Easing.out(Easing.ease),
    });
  }, [visible]);

  // Clamp position within screen bounds (keep away from edges)
  const clampPosition = (x: number, y: number) => {
    'worklet';
    const totalHeight = FAB_SIZE + ICON_BUTTON_SIZE * 2 + 60; // FAB + 2 buttons + padding
    const clampedX = Math.max(LEFT_MARGIN, Math.min(x, SCREEN_WIDTH - FAB_SIZE - MARGIN));
    const clampedY = Math.max(TOP_MARGIN, Math.min(y, SCREEN_HEIGHT - totalHeight - BOTTOM_MARGIN));
    return { x: clampedX, y: clampedY };
  };

  // Drag gesture
  const dragGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      startX.value = translateX.value;
      startY.value = translateY.value;
      isDragging.value = true;
    })
    .onUpdate((event) => {
      'worklet';
      const newX = startX.value + event.translationX;
      const newY = startY.value + event.translationY;
      const clamped = clampPosition(newX, newY);
      translateX.value = clamped.x;
      translateY.value = clamped.y;
    })
    .onEnd(() => {
      'worklet';
      isDragging.value = false;
      runOnJS(savePosition)(translateX.value, translateY.value);
    });

  // Container animated style
  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: scale.value,
  }));

  // Drag indicator style
  const dragIndicatorStyle = useAnimatedStyle(() => ({
    opacity: isDragging.value ? 0.8 : 0.4,
  }));

  if (!visible && scale.value === 0) {
    return null;
  }

  return (
    <GestureDetector gesture={dragGesture}>
      <Animated.View style={[styles.container, containerStyle]}>
        {/* Drag handle bar */}
        <Animated.View style={[styles.dragHandle, dragIndicatorStyle]} />

        {/* Supabase button */}
        <Pressable
          style={({ pressed }) => [
            styles.iconButton,
            styles.supabaseButton,
            pressed && styles.pressed,
          ]}
          onPress={onSupabasePress}
        >
          <Ionicons name="flash" size={20} color="#3ECF8E" />
        </Pressable>

        {/* Figma button */}
        <Pressable
          style={({ pressed }) => [
            styles.iconButton,
            styles.figmaButton,
            pressed && styles.pressed,
          ]}
          onPress={onFigmaPress}
        >
          <FigmaLogo size={18} />
        </Pressable>

        {/* Close button */}
        <Pressable
          style={({ pressed }) => [
            styles.closeButton,
            pressed && styles.pressed,
          ]}
          onPress={onClose}
        >
          <Ionicons name="close" size={14} color="rgba(255,255,255,0.4)" />
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 9999,
    alignItems: 'center',
    backgroundColor: 'rgba(20, 20, 22, 0.92)',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dragHandle: {
    width: 20,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 8,
  },
  iconButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  supabaseButton: {},
  figmaButton: {},
  pressed: {
    opacity: 0.5,
  },
  closeButton: {
    padding: 6,
    marginTop: 4,
  },
});
