import React, { useState, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS, interpolate } from 'react-native-reanimated';
import { AppColors } from '../../../shared/theme/colors';
import { Sidebar } from './Sidebar';
import { MultitaskingPanel } from './MultitaskingPanel';
import { VerticalCardSwitcher } from './VerticalCardSwitcher';
import { ContentRenderer } from './ContentRenderer';
import { TabBar } from './TabBar';
import { SettingsPanel } from './SettingsPanel';
import { ChatPanel } from './ChatPanel';
import { TerminalPanel } from './TerminalPanel';
import { Tab, useTabStore } from '../../../core/tabs/tabStore';

type PanelType = 'files' | 'chat' | 'terminal' | 'multitasking' | 'vertical' | 'settings' | null;

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface Props {
  onOpenAllProjects?: () => void;
  onExit?: () => void;
  children?: (tab: Tab, isCardMode: boolean, cardDimensions: { width: number, height: number }, animatedStyle?: any) => React.ReactNode;
}

export const VSCodeSidebar = ({ onOpenAllProjects, onExit, children }: Props) => {
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [isVerticalPanelMounted, setIsVerticalPanelMounted] = useState(false);
  const { tabs, activeTabId, setActiveTab } = useTabStore();

  // Shared value to communicate with VerticalCardSwitcher
  const trackpadTranslation = useSharedValue(0);
  const isTrackpadActive = useSharedValue(false);

  // Reanimated values for smooth trackpad feedback
  const trackpadScale = useSharedValue(1);
  const trackpadBrightness = useSharedValue(0);
  const verticalPanelOpacity = useSharedValue(0);

  const togglePanel = useCallback((panel: PanelType) => {
    setActivePanel(prev => prev === panel ? null : panel);
  }, []);

  const openVerticalPanel = useCallback(() => {
    // First set mounted and start black background fade in
    setIsVerticalPanelMounted(true);

    // Immediately start opacity animation (will make black bg appear)
    verticalPanelOpacity.value = withSpring(1, {
      damping: 20,
      stiffness: 180,
      mass: 0.6,
    });

    // Then update panel state
    setActivePanel('vertical');
  }, []);

  const skipZoomAnimation = useSharedValue(false);

  const closeVerticalPanel = useCallback(() => {
    setActivePanel(null);
    setIsVerticalPanelMounted(false);
    verticalPanelOpacity.value = 0;
  }, []);

  const closeVerticalPanelQuick = useCallback(() => {
    // Quick close for fast flicks - instant fade to black
    verticalPanelOpacity.value = withSpring(0, {
      damping: 50,
      stiffness: 500,
      mass: 0.1,
    });

    // Keep mounted longer to prevent seeing white content behind
    setTimeout(() => {
      setActivePanel(null);
    }, 200);

    setTimeout(() => {
      setIsVerticalPanelMounted(false);
    }, 300);
  }, []);

  const closeVerticalPanelDelayed = useCallback(() => {
    // Animate opacity out first
    verticalPanelOpacity.value = withSpring(0, {
      damping: 20,
      stiffness: 180,
      mass: 0.6,
    });

    // Delay unmounting to allow smooth animation to complete (Apple-style)
    setTimeout(() => {
      setActivePanel(null);
    }, 500);

    // Unmount after animation completes
    setTimeout(() => {
      setIsVerticalPanelMounted(false);
    }, 600);
  }, []);

  const trackpadAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: trackpadScale.value }],
      backgroundColor: trackpadBrightness.value > 0
        ? '#202020'
        : '#1a1a1a',
      borderColor: trackpadBrightness.value > 0
        ? 'rgba(139, 124, 246, 0.5)'
        : 'rgba(139, 124, 246, 0.25)',
      borderWidth: trackpadBrightness.value > 0 ? 2 : 1.5,
    };
  });

  const contentRendererAnimatedStyle = useAnimatedStyle(() => {
    // Keep completely hidden while panel is visible - no crossfade at all
    // This eliminates all flashes by ensuring only one view is visible at a time
    const opacity = verticalPanelOpacity.value > 0.05 ? 0 : 1;

    return {
      opacity,
    };
  });

  // Background stays solid black until very end
  const blackBackgroundAnimatedStyle = useAnimatedStyle(() => {
    // Keep at full opacity until panel is almost gone
    const opacity = interpolate(
      verticalPanelOpacity.value,
      [0, 0.05, 1],
      [0, 1, 1] // Snap to full opacity quickly, stay solid
    );
    return { opacity };
  });

  const verticalPanelAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: verticalPanelOpacity.value,
    };
  });

  // Pan gesture on trackpad - like iOS home indicator
  const handleTabSwitch = useCallback((targetIndex: number) => {
    if (targetIndex >= 0 && targetIndex < tabs.length) {
      setActiveTab(tabs[targetIndex].id);
    }
  }, [tabs, setActiveTab]);

  const currentIndex = tabs.findIndex(t => t.id === activeTabId);
  const tabsLength = tabs.length;
  const hasOpenedPanel = useSharedValue(false);

  const trackpadPanGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      isTrackpadActive.value = true;
      hasOpenedPanel.value = false;
      trackpadScale.value = withSpring(0.95, { damping: 15, stiffness: 300 });
      trackpadBrightness.value = withSpring(1, { damping: 15, stiffness: 300 });
      // Open panel immediately for responsive feel
      runOnJS(openVerticalPanel)();
      hasOpenedPanel.value = true;
    })
    .onChange((event) => {
      'worklet';
      trackpadTranslation.value = event.translationY;
    })
    .onEnd((event) => {
      'worklet';
      // Calculate which tab to switch to based on final scroll position AND velocity
      const amplifiedValue = trackpadTranslation.value * 3;
      const velocityY = event.velocityY;

      // Calculate final scroll position
      const basePosition = currentIndex * SCREEN_HEIGHT;
      const finalScrollPosition = basePosition - amplifiedValue;

      // Find nearest tab index based on scroll position
      let nearestIndex = Math.round(finalScrollPosition / SCREEN_HEIGHT);

      // VELOCITY-BASED SWITCHING (like iPhone home indicator)
      // If user does a quick swipe (high velocity), switch even with small distance
      const VELOCITY_THRESHOLD = 800; // Increased for more intentional swipes
      const QUICK_SWIPE_DISTANCE = 30; // Reduced minimum distance

      if (Math.abs(velocityY) > VELOCITY_THRESHOLD && Math.abs(trackpadTranslation.value) > QUICK_SWIPE_DISTANCE) {
        // Quick swipe detected - switch based on direction
        if (velocityY < 0 && currentIndex < tabsLength - 1) {
          // Swiping up (negative velocity) = next tab
          nearestIndex = currentIndex + 1;
        } else if (velocityY > 0 && currentIndex > 0) {
          // Swiping down (positive velocity) = previous tab
          nearestIndex = currentIndex - 1;
        }
      }

      // Add hysteresis: need to cross 40% threshold to switch tabs
      // This makes it less jittery, especially for down swipes
      const distanceFromCurrent = nearestIndex - currentIndex;
      const scrollPercentage = Math.abs(finalScrollPosition - basePosition) / SCREEN_HEIGHT;

      if (Math.abs(distanceFromCurrent) === 1 && scrollPercentage < 0.4) {
        // Not enough distance to switch, stay on current
        nearestIndex = currentIndex;
      }

      const targetIndex = Math.max(0, Math.min(tabsLength - 1, nearestIndex));

      // Smooth Apple-style animations - animate trackpad UI
      trackpadScale.value = withSpring(1, { damping: 20, stiffness: 180, mass: 0.6 });
      trackpadBrightness.value = withSpring(0, { damping: 20, stiffness: 180, mass: 0.6 });

      // Signal gesture ended - this triggers snap animation in VerticalCardSwitcher
      isTrackpadActive.value = false;

      // Smoothly reset translation to 0 (this helps with the visual feedback)
      trackpadTranslation.value = withSpring(0, { damping: 20, stiffness: 180, mass: 0.6 });

      // Switch tab if different from current
      if (targetIndex !== currentIndex) {
        runOnJS(handleTabSwitch)(targetIndex);
      }

      // Detect if this was a quick flick (high velocity = quick gesture)
      const wasQuickFlick = Math.abs(velocityY) > VELOCITY_THRESHOLD;

      // Set flag to skip zoom animation for quick flicks
      skipZoomAnimation.value = wasQuickFlick;

      // Close panel with appropriate timing
      if (wasQuickFlick) {
        // Quick flick - close faster (no delay, just fade out)
        runOnJS(closeVerticalPanelQuick)();
      } else if (hasOpenedPanel.value) {
        // Slow drag - full animation
        runOnJS(closeVerticalPanelDelayed)();
      } else {
        // Panel never really engaged - instant close
        runOnJS(closeVerticalPanel)();
      }
    })
    .minDistance(0)
    .activeOffsetY([-5, 5]);


  return (
    <>
      <View style={styles.iconBar}>
        <TouchableOpacity 
          style={[styles.iconButton, activePanel === 'files' && styles.iconButtonActive]}
          onPress={() => togglePanel('files')}
        >
          <Ionicons name="folder" size={24} color={activePanel === 'files' ? AppColors.primary : '#888'} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.iconButton, activePanel === 'chat' && styles.iconButtonActive]}
          onPress={() => togglePanel('chat')}
        >
          <Ionicons name="chatbubbles" size={24} color={activePanel === 'chat' ? AppColors.primary : '#888'} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.iconButton, activePanel === 'terminal' && styles.iconButtonActive]}
          onPress={() => togglePanel('terminal')}
        >
          <Ionicons name="terminal" size={24} color={activePanel === 'terminal' ? AppColors.primary : '#888'} />
        </TouchableOpacity>

        <View style={styles.spacer} />

        {/* iPhone-like fluid trackpad - swipe to switch tabs */}
        <GestureDetector gesture={trackpadPanGesture}>
          <Animated.View style={[styles.trackpad, trackpadAnimatedStyle]} />
        </GestureDetector>

        <TouchableOpacity 
          style={[styles.iconButton, activePanel === 'multitasking' && styles.iconButtonActive]}
          onPress={() => togglePanel('multitasking')}
        >
          <Ionicons name="albums" size={24} color={activePanel === 'multitasking' ? AppColors.primary : '#888'} />
        </TouchableOpacity>

        <View style={styles.spacer} />

        <TouchableOpacity
          style={styles.iconButton}
          onPress={onExit}
        >
          <Ionicons name="exit-outline" size={24} color="#888" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.iconButton, activePanel === 'settings' && styles.iconButtonActive]}
          onPress={() => togglePanel('settings')}
        >
          <Ionicons name="settings" size={24} color={activePanel === 'settings' ? AppColors.primary : '#888'} />
        </TouchableOpacity>
      </View>

      {activePanel === 'files' && (
        <Sidebar
          onClose={() => setActivePanel(null)}
          onOpenAllProjects={onOpenAllProjects}
        />
      )}

      {activePanel === 'chat' && (
        <ChatPanel onClose={() => setActivePanel(null)} />
      )}

      {activePanel === 'terminal' && (
        <TerminalPanel onClose={() => setActivePanel(null)} />
      )}

      {activePanel === 'settings' && (
        <SettingsPanel onClose={() => setActivePanel(null)} />
      )}

      <TabBar isCardMode={activePanel === 'multitasking' || activePanel === 'vertical'} />

      {/* Show normal content always (behind vertical panel) */}
      {activePanel !== 'multitasking' && (
        <Animated.View style={[
          { flex: 1 },
          isVerticalPanelMounted && contentRendererAnimatedStyle
        ]}>
          <ContentRenderer children={children} animatedStyle={{}} />
        </Animated.View>
      )}

      {/* Render VerticalCardSwitcher on top (keeps it during animation) */}
      {isVerticalPanelMounted && (
        <>
          {/* Solid black background layer - stays opaque until panel is gone */}
          <Animated.View style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: '#0a0a0a',
            },
            blackBackgroundAnimatedStyle
          ]} />

          {/* Panel content with opacity animation */}
          <Animated.View style={[
            StyleSheet.absoluteFillObject,
            verticalPanelAnimatedStyle
          ]}>
            <VerticalCardSwitcher
              onClose={closeVerticalPanel}
              trackpadTranslation={trackpadTranslation}
              isTrackpadActive={isTrackpadActive}
              skipZoomAnimation={skipZoomAnimation}
            >
              {(tab, isCardMode, cardDimensions) => children && children(tab, isCardMode, cardDimensions)}
            </VerticalCardSwitcher>
          </Animated.View>
        </>
      )}

      {/* Overlay other panels on top */}
      {activePanel === 'multitasking' && (
        <MultitaskingPanel onClose={() => togglePanel(null)}>
          {(tab, isCardMode, cardDimensions, animatedStyle) => children && children(tab, isCardMode, cardDimensions, animatedStyle)}
        </MultitaskingPanel>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  iconBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 50,
    backgroundColor: '#0a0a0a',
    borderRightWidth: 1,
    borderRightColor: '#1a1a1a',
    paddingTop: 60,
    paddingBottom: 20,
    zIndex: 1001,
  },
  iconButton: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
  },
  iconButtonActive: {
    borderLeftColor: AppColors.primary,
    backgroundColor: 'rgba(139, 124, 246, 0.1)',
  },
  spacer: {
    flex: 1,
  },
  trackpad: {
    width: 38,
    height: 180,
    marginHorizontal: 6,
    marginBottom: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: 'rgba(139, 124, 246, 0.25)',
  },
});
