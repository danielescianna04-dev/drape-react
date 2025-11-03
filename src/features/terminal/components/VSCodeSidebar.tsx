import React, { useState, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { AppColors } from '../../../shared/theme/colors';
import { Sidebar } from './Sidebar';
import { MultitaskingPanel } from './MultitaskingPanel';
import { VerticalCardSwitcher } from './VerticalCardSwitcher';
import { ContentRenderer } from './ContentRenderer';
import { TabBar } from './TabBar';
import { Tab } from '../../../core/tabs/tabStore';

type PanelType = 'files' | 'chat' | 'terminal' | 'multitasking' | 'vertical' | 'settings' | null;

interface Props {
  onOpenAllProjects?: () => void;
  children?: (tab: Tab, isCardMode: boolean, cardDimensions: { width: number, height: number }, animatedStyle?: any) => React.ReactNode;
}

export const VSCodeSidebar = ({ onOpenAllProjects, children }: Props) => {
  const [activePanel, setActivePanel] = useState<PanelType>(null);

  // Shared value to communicate with VerticalCardSwitcher
  const trackpadTranslation = useSharedValue(0);
  const isTrackpadActive = useSharedValue(false);

  // Reanimated values for smooth trackpad feedback
  const trackpadScale = useSharedValue(1);
  const trackpadBrightness = useSharedValue(0);

  const togglePanel = useCallback((panel: PanelType) => {
    setActivePanel(prev => prev === panel ? null : panel);
  }, []);

  const openVerticalPanel = useCallback(() => {
    setActivePanel('vertical');
  }, []);

  const closeVerticalPanel = useCallback(() => {
    setActivePanel(null);
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

  // Pan gesture on trackpad - like iOS home indicator
  const handleTabSwitch = useCallback((targetIndex: number) => {
    const { tabs, setActiveTab } = useTabStore.getState();
    if (targetIndex >= 0 && targetIndex < tabs.length) {
      setActiveTab(tabs[targetIndex].id);
    }
  }, []);

  const trackpadPanGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      isTrackpadActive.value = true;
      trackpadScale.value = withSpring(0.95, { damping: 15, stiffness: 300 });
      trackpadBrightness.value = withSpring(1, { damping: 15, stiffness: 300 });
      runOnJS(openVerticalPanel)();
    })
    .onChange((event) => {
      'worklet';
      trackpadTranslation.value = event.translationY;
    })
    .onEnd((event) => {
      'worklet';
      // Calculate which tab to switch to based on translation
      const amplifiedValue = trackpadTranslation.value * 3;
      const { tabs, activeTabId } = useTabStore.getState();
      const currentIndex = tabs.findIndex(t => t.id === activeTabId);

      // Use Dimensions to get screen height in worklet
      const screenHeight = 844; // Will use actual value
      const threshold = screenHeight * 0.3; // 30% of screen height

      let targetIndex = currentIndex;

      // Swiping down (positive translation) = go to previous tab (lower index)
      // Swiping up (negative translation) = go to next tab (higher index)
      if (amplifiedValue > threshold && currentIndex > 0) {
        targetIndex = currentIndex - 1;
      } else if (amplifiedValue < -threshold && currentIndex < tabs.length - 1) {
        targetIndex = currentIndex + 1;
      }

      // Switch tab if different from current
      if (targetIndex !== currentIndex) {
        runOnJS(handleTabSwitch)(targetIndex);
      }

      isTrackpadActive.value = false;
      trackpadScale.value = withSpring(1, { damping: 15, stiffness: 300 });
      trackpadBrightness.value = withSpring(0, { damping: 15, stiffness: 300 });
      trackpadTranslation.value = 0;
      runOnJS(closeVerticalPanel)();
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
      
      <TabBar isCardMode={activePanel === 'multitasking' || activePanel === 'vertical'} />

      {/* Render VerticalCardSwitcher when active */}
      {activePanel === 'vertical' && (
        <VerticalCardSwitcher
          onClose={closeVerticalPanel}
          trackpadTranslation={trackpadTranslation}
          isTrackpadActive={isTrackpadActive}
        >
          {(tab, isCardMode, cardDimensions) => children && children(tab, isCardMode, cardDimensions)}
        </VerticalCardSwitcher>
      )}

      {/* Overlay other panels on top */}
      {activePanel === 'multitasking' && (
        <MultitaskingPanel onClose={() => togglePanel(null)}>
          {(tab, isCardMode, cardDimensions, animatedStyle) => children && children(tab, isCardMode, cardDimensions, animatedStyle)}
        </MultitaskingPanel>
      )}

      {/* Show normal content when not in card mode or multitasking */}
      {activePanel !== 'vertical' && activePanel !== 'multitasking' && (
        <ContentRenderer children={children} animatedStyle={{}} />
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
