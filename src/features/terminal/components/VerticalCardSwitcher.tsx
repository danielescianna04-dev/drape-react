import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, PanResponder } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate, Extrapolate } from 'react-native-reanimated';
import { useTabStore } from '../../../core/tabs/tabStore';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_HEIGHT = SCREEN_HEIGHT * 0.7;
const CARD_SPACING = 20;

interface Props {
  children: (isCardMode: boolean, cardDimensions: { width: number, height: number }, animatedStyle?: any) => React.ReactNode;
  onClose: () => void;
}

export const VerticalCardSwitcher = ({ children, onClose }: Props) => {
  const { tabs, activeTabId, setActiveTab } = useTabStore();
  const translateY = useSharedValue(0);
  const activeIndex = tabs.findIndex(t => t.id === activeTabId);

  useEffect(() => {
    translateY.value = withTiming(-activeIndex * (CARD_HEIGHT + CARD_SPACING), {
      duration: 300,
    });
  }, [activeIndex]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        translateY.value = -activeIndex * (CARD_HEIGHT + CARD_SPACING) + gestureState.dy;
      },
      onPanResponderRelease: (_, gestureState) => {
        const newIndex = Math.round(-translateY.value / (CARD_HEIGHT + CARD_SPACING));
        const clampedIndex = Math.max(0, Math.min(tabs.length - 1, newIndex));
        
        translateY.value = withTiming(-clampedIndex * (CARD_HEIGHT + CARD_SPACING));
        
        if (clampedIndex !== activeIndex) {
          setActiveTab(tabs[clampedIndex].id);
        }
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <Animated.View style={styles.cardsContainer} {...panResponder.panHandlers}>
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          
          const cardStyle = useAnimatedStyle(() => {
            const inputRange = [
              (index - 1) * (CARD_HEIGHT + CARD_SPACING),
              index * (CARD_HEIGHT + CARD_SPACING),
              (index + 1) * (CARD_HEIGHT + CARD_SPACING),
            ];
            
            const scale = interpolate(
              -translateY.value,
              inputRange,
              [0.85, 1, 0.85],
              Extrapolate.CLAMP
            );
            
            const opacity = interpolate(
              -translateY.value,
              inputRange,
              [0.5, 1, 0.5],
              Extrapolate.CLAMP
            );

            return {
              transform: [
                { translateY: translateY.value + index * (CARD_HEIGHT + CARD_SPACING) },
                { scale }
              ],
              opacity,
            };
          });

          return (
            <Animated.View key={tab.id} style={[styles.card, cardStyle]}>
              {isActive && children(true, { width: 300, height: CARD_HEIGHT })}
            </Animated.View>
          );
        })}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  cardsContainer: {
    flex: 1,
  },
  card: {
    position: 'absolute',
    width: 300,
    height: CARD_HEIGHT,
    left: 50,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(139, 124, 246, 0.5)',
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
});
