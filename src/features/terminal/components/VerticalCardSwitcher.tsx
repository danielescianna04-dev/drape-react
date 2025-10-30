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
  const lastTime = useRef(0);
  const velocity = useRef(0);
  const maxVelocity = useRef(0);
  const touchCount = useRef(0);
  const firstDirection = useRef<'up' | 'down' | null>(null);
  const SWIPE_THRESHOLD = 50; // Increased from 10 - must drag at least 50px
  const FLICK_VELOCITY_THRESHOLD = 0.5; // Increased from 0.3
  const SENSITIVITY = 4; // Decreased from 6

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
          const currentIndex = activeIndex * SCREEN_HEIGHT;
          
          // If lastPosition was never set (no movement), initialize it now
          if (lastPosition.current === 0 && activeIndex > 0) {
            lastPosition.current = currentIndex;
            console.log('⚠️ lastPosition was 0, resetting to:', currentIndex);
          }
          
          const currentPos = lastPosition.current;
          const delta = currentPos - currentIndex;
          const vel = maxVelocity.current;
          const touches = touchCount.current;
          
          console.log('🔄 Snap - activeIndex:', activeIndex, 'currentPos:', currentPos.toFixed(0), 'currentIndex:', currentIndex.toFixed(0), 'delta:', delta.toFixed(0), 'maxVel:', vel.toFixed(2));
          
          let newIndex = activeIndex;
          
          // Fast flick
          if (Math.abs(vel) > FLICK_VELOCITY_THRESHOLD) {
            if (vel > 0 && activeIndex < tabs.length - 1) {
              newIndex = activeIndex + 1;
              console.log('⚡ Flick up - next tab');
            } else if (vel < 0 && activeIndex > 0) {
              newIndex = activeIndex - 1;
              console.log('⚡ Flick down - prev tab');
            }
          }
          // Normal swipe - check distance
          else if (Math.abs(delta) > SWIPE_THRESHOLD) {
            if (delta > SWIPE_THRESHOLD && activeIndex < tabs.length - 1) {
              newIndex = activeIndex + 1;
              console.log('⬆️ Next tab');
            } else if (delta < -SWIPE_THRESHOLD && activeIndex > 0) {
              newIndex = activeIndex - 1;
              console.log('⬇️ Previous tab');
            }
          }
            
          if (newIndex !== activeIndex && tabs[newIndex]) {
            console.log('✅ Switching to:', tabs[newIndex].title);
            setActiveTab(tabs[newIndex].id);
          } else {
            scrollPosition.value = withSpring(currentIndex, SPRING_CONFIG);
          }
          
          startY.current = 0;
          lastPosition.current = 0;
          lastTime.current = 0;
          velocity.current = 0;
          maxVelocity.current = 0;
          touchCount.current = 0;
          firstDirection.current = null;
          if (onScrollEnd) onScrollEnd();
          return;
        }
        
        if (startY.current === 0) {
          const currentIndex = activeIndex * SCREEN_HEIGHT;
          startY.current = dy;
          lastTime.current = Date.now();
          touchCount.current = 0;
          lastPosition.current = currentIndex; // Initialize to current position
          console.log('🎬 Touch start - activeIndex:', activeIndex, 'lastPosition set to:', currentIndex);
        }
        
        touchCount.current++;
        
        const rawDelta = dy - startY.current;
        const delta = rawDelta * SENSITIVITY;
        
        // Detect direction on first significant movement
        if (!firstDirection.current && Math.abs(rawDelta) > 3) {
          firstDirection.current = rawDelta > 0 ? 'down' : 'up';
          console.log('🎯 Direction detected:', firstDirection.current);
        }
        
        const newPos = activeIndex * SCREEN_HEIGHT - delta;
        
        // Calculate velocity
        const now = Date.now();
        const timeDelta = now - lastTime.current;
        if (timeDelta > 0) {
          const posDelta = newPos - lastPosition.current;
          velocity.current = posDelta / timeDelta;
          // Track peak velocity
          if (Math.abs(velocity.current) > Math.abs(maxVelocity.current)) {
            maxVelocity.current = velocity.current;
          }
        }
        lastTime.current = now;
        
        console.log('📍 Moving - delta:', delta.toFixed(0), 'vel:', velocity.current.toFixed(2), 'max:', maxVelocity.current.toFixed(2));
        
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
