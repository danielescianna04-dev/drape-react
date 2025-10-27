import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnUI, interpolate } from 'react-native-reanimated';
import { useTabStore, Tab } from '../../../core/tabs/tabStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  children: (tab: Tab, isCardMode: boolean, cardDimensions: { width: number, height: number }) => React.ReactNode;
  onClose: () => void;
  onScrollRef?: (scrollFn: (dy: number) => void) => void;
  onScrollEnd?: () => void;
}

export const VerticalCardSwitcher = ({ children, onClose, onScrollRef, onScrollEnd }: Props) => {
  const { tabs, activeTabId, setActiveTab } = useTabStore();
  const scrollPosition = useSharedValue(0);
  const activeIndex = tabs.findIndex(t => t.id === activeTabId);
  const startY = useRef(0);
  const lastPosition = useRef(0);
  const SWIPE_THRESHOLD = 50;
  const SENSITIVITY = 3;

  const SPRING_CONFIG = {
    damping: 40,
    stiffness: 300,
    mass: 1,
  };

  useEffect(() => {
    scrollPosition.value = withSpring(activeIndex * SCREEN_HEIGHT, SPRING_CONFIG);
  }, [activeIndex]);

  useEffect(() => {
    if (onScrollRef) {
      onScrollRef((dy: number) => {
        if (dy === -1) {
          const currentPos = lastPosition.current;
          const currentIndex = activeIndex * SCREEN_HEIGHT;
          const delta = currentPos - currentIndex;
          
          console.log('🔄 Snap - pos:', currentPos, 'target:', currentIndex, 'delta:', delta);
          
          if (Math.abs(delta) > SWIPE_THRESHOLD) {
            let newIndex = activeIndex;
            
            // delta > 0 means scrolled up (next tab)
            // delta < 0 means scrolled down (prev tab)
            if (delta > SWIPE_THRESHOLD && activeIndex < tabs.length - 1) {
              newIndex = activeIndex + 1;
              console.log('⬆️ Next tab:', newIndex);
            } else if (delta < -SWIPE_THRESHOLD && activeIndex > 0) {
              newIndex = activeIndex - 1;
              console.log('⬇️ Previous tab:', newIndex);
            }
            
            if (newIndex !== activeIndex && tabs[newIndex]) {
              console.log('✅ Switching to:', tabs[newIndex].title);
              setActiveTab(tabs[newIndex].id);
            } else {
              scrollPosition.value = withSpring(currentIndex, SPRING_CONFIG);
            }
          } else {
            console.log('❌ Not enough delta');
            scrollPosition.value = withSpring(currentIndex, SPRING_CONFIG);
          }
          
          startY.current = 0;
          lastPosition.current = 0;
          if (onScrollEnd) onScrollEnd();
          return;
        }
        
        if (startY.current === 0) {
          startY.current = dy;
        }
        
        const rawDelta = dy - startY.current;
        const delta = rawDelta * SENSITIVITY;
        
        const newPos = activeIndex * SCREEN_HEIGHT - delta;
        
        console.log('📍 Moving - delta:', delta, 'newPos:', newPos);
        scrollPosition.value = newPos;
        lastPosition.current = newPos;
      });
    }
  }, [onScrollRef, activeIndex, tabs]);

  return (
    <View style={styles.container}>
      {tabs.map((tab, index) => {
        const animatedStyle = useAnimatedStyle(() => {
          const inputRange = [
            (index - 1) * SCREEN_HEIGHT,
            index * SCREEN_HEIGHT,
            (index + 1) * SCREEN_HEIGHT,
          ];
          
          const translateY = interpolate(
            scrollPosition.value,
            inputRange,
            [SCREEN_HEIGHT, 0, -SCREEN_HEIGHT],
            'clamp'
          );
          
          const scale = interpolate(
            scrollPosition.value,
            inputRange,
            [0.92, 1, 0.92],
            'clamp'
          );
          
          const opacity = interpolate(
            scrollPosition.value,
            inputRange,
            [0.3, 1, 0.3],
            'clamp'
          );
          
          return {
            transform: [{ translateY }, { scale }],
            opacity,
          };
        });

        return (
          <Animated.View key={tab.id} style={[styles.screen, animatedStyle]}>
            {children(tab, true, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT })}
          </Animated.View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  screen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
