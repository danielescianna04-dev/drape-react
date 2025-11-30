import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS, interpolate, Easing } from 'react-native-reanimated';
import { AppColors } from '../../../shared/theme/colors';
import { Sidebar } from './Sidebar';
import { MultitaskingPanel } from './MultitaskingPanel';
import { VerticalCardSwitcher } from './VerticalCardSwitcher';
import { ContentRenderer } from './ContentRenderer';
import { TabBar } from './TabBar';
import { SettingsPanel } from './SettingsPanel';
import { ChatPanel } from './ChatPanel';
import { PreviewPanel } from './PreviewPanel';
import { GitPanel } from './GitPanel';
import { VerticalIconSwitcher } from './VerticalIconSwitcher';
import { Tab, useTabStore } from '../../../core/tabs/tabStore';
import { SidebarProvider } from '../context/SidebarContext';
import { IconButton } from '../../../shared/components/atoms';

type PanelType = 'files' | 'chat' | 'multitasking' | 'vertical' | 'settings' | 'preview' | 'git' | null;

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface Props {
  onOpenAllProjects?: () => void;
  onExit?: () => void;
  children?: (tab: Tab, isCardMode: boolean, cardDimensions: { width: number, height: number }, animatedStyle?: any) => React.ReactNode;
}

export const VSCodeSidebar = ({ onOpenAllProjects, onExit, children }: Props) => {
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [isVerticalPanelMounted, setIsVerticalPanelMounted] = useState(false);
  const [isSidebarHidden, setIsSidebarHidden] = useState(false);
  const { tabs, activeTabId, setActiveTab, addTab } = useTabStore();

  // Shared value to communicate with VerticalCardSwitcher
  const trackpadTranslation = useSharedValue(0);
  const isTrackpadActive = useSharedValue(false);

  // Reanimated values for smooth trackpad feedback
  const trackpadScale = useSharedValue(1);
  const trackpadBrightness = useSharedValue(0);
  const verticalPanelOpacity = useSharedValue(0);

  // Sidebar hide/show animation
  const sidebarTranslateX = useSharedValue(0);

  const togglePanel = useCallback((panel: PanelType) => {
    setActivePanel(prev => {
      // If clicking the same panel, close it
      if (prev === panel) return null;
      // Otherwise, open the new panel (automatically closes the old one)
      return panel;
    });
  }, []);

  // Handle terminal icon click - open/create AI terminal tab showing ALL commands from ALL chats
  const handleTerminalClick = useCallback(() => {
    // Set terminal as active panel for highlighting
    setActivePanel('terminal');

    // Look for existing AI terminal tab (has specific ID 'terminal-ai')
    // This is different from manual terminals created by the user
    const aiTerminalTab = tabs.find(t => t.id === 'terminal-ai');

    if (aiTerminalTab) {
      // AI terminal already exists - just switch to it
      setActiveTab('terminal-ai');
    } else {
      // Create new AI terminal tab showing ALL commands from ALL chats
      // sourceTabId: 'all' means show commands from all chat tabs
      addTab({
        id: 'terminal-ai', // Fixed ID for AI terminal
        type: 'terminal',
        title: 'Terminal AI',
        data: { sourceTabId: 'all' }, // Show commands from ALL tabs
      });
    }
  }, [tabs, setActiveTab, addTab]);

  // Handle git icon click - open/create GitHub tab as a full page
  const handleGitClick = useCallback(() => {
    // Close any open panel
    setActivePanel(null);

    // Look for existing GitHub tab
    const gitHubTab = tabs.find(t => t.id === 'github-main');

    if (gitHubTab) {
      // GitHub tab already exists - just switch to it
      setActiveTab('github-main');
    } else {
      // Create new GitHub tab
      addTab({
        id: 'github-main',
        type: 'github',
        title: 'Git',
        data: {},
      });
    }
  }, [tabs, setActiveTab, addTab]);

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

  // Sidebar hide/show handlers
  const toggleSidebar = useCallback(() => {
    const newHiddenState = !isSidebarHidden;
    setIsSidebarHidden(newHiddenState);
    sidebarTranslateX.value = withTiming(newHiddenState ? -50 : 0, {
      duration: 250,
      easing: Easing.out(Easing.cubic),
    });
  }, [isSidebarHidden]);

  // Swipe gesture on sidebar to hide it
  const sidebarSwipeGesture = Gesture.Pan()
    .onUpdate((event) => {
      'worklet';
      // Only allow swipe left (negative translation) when horizontal movement is dominant
      if (event.translationX < 0 && Math.abs(event.translationX) > Math.abs(event.translationY)) {
        sidebarTranslateX.value = Math.max(event.translationX, -50);
      }
    })
    .onEnd((event) => {
      'worklet';
      // Swipe left to hide - balanced thresholds to avoid conflict with vertical scroll
      if (event.translationX < -25 || event.velocityX < -400) {
        sidebarTranslateX.value = withTiming(-50, {
          duration: 200,
          easing: Easing.out(Easing.cubic),
        });
        runOnJS(setIsSidebarHidden)(true);
      } else {
        // Snap back if not swiped enough - no bounce
        sidebarTranslateX.value = withTiming(0, {
          duration: 150,
          easing: Easing.out(Easing.cubic),
        });
      }
    })
    .activeOffsetX([-10, 1000]) // Require more horizontal movement before activating
    .activeOffsetY([-50, 50]) // Block if too much vertical movement (let vertical scroll handle it)
    .hitSlop({ right: 100 }); // Extend touch area 100px to the right of the sidebar

  // Swipe gesture from left edge to show sidebar
  const edgeSwipeGesture = Gesture.Pan()
    .onUpdate((event) => {
      'worklet';
      // Only allow swipe right (positive translation) up to 0
      if (event.translationX > 0) {
        const newValue = Math.min(event.translationX - 50, 0);
        sidebarTranslateX.value = newValue;
      }
    })
    .onEnd((event) => {
      'worklet';
      // Swipe right to show - if swiped more than 25px or fast velocity
      if (event.translationX > 25 || event.velocityX > 500) {
        sidebarTranslateX.value = withTiming(0, {
          duration: 250,
          easing: Easing.out(Easing.cubic),
        });
        runOnJS(setIsSidebarHidden)(false);
      } else {
        // Snap back to hidden
        sidebarTranslateX.value = withTiming(-50, {
          duration: 250,
          easing: Easing.out(Easing.cubic),
        });
      }
    })
    .activeOffsetX([-1000, 5]); // Block left swipe, allow right swipe easily

  const sidebarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sidebarTranslateX.value }],
  }));

  return (
    <SidebarProvider value={{ sidebarTranslateX }}>
      {/* Edge swipe area - only visible when sidebar is hidden */}
      {isSidebarHidden && (
        <GestureDetector gesture={edgeSwipeGesture}>
          <View style={styles.edgeSwipeArea}>
            <View style={styles.edgeIndicator} />
          </View>
        </GestureDetector>
      )}

      <GestureDetector gesture={sidebarSwipeGesture}>
        <Animated.View style={[styles.iconBar, sidebarAnimatedStyle]}>
          {/* Tabs/Home button - returns to tabs view */}
          <IconButton
            iconName="albums"
            size={24}
            color="#888"
            onPress={() => setActivePanel(null)}
            isActive={activePanel === null}
            activeColor={AppColors.primary}
            accessibilityLabel="Tabs view"
          />

          <IconButton
            iconName="folder"
            size={24}
            color="#888"
            onPress={() => togglePanel('files')}
            isActive={activePanel === 'files'}
            activeColor={AppColors.primary}
            accessibilityLabel="Files panel"
          />

          <IconButton
            iconName="chatbubbles"
            size={24}
            color="#888"
            onPress={() => togglePanel('chat')}
            isActive={activePanel === 'chat'}
            activeColor={AppColors.primary}
            accessibilityLabel="Chat panel"
          />

          <IconButton
            iconName="terminal"
            size={24}
            color="#888"
            onPress={handleTerminalClick}
            isActive={activePanel === 'terminal'}
            activeColor={AppColors.primary}
            accessibilityLabel="Terminal"
          />

          <IconButton
            iconName="eye"
            size={24}
            color="#888"
            onPress={() => togglePanel('preview')}
            isActive={activePanel === 'preview'}
            activeColor={AppColors.primary}
            accessibilityLabel="Preview panel"
          />

          <View style={styles.spacer} />

          {/* Vertical Icon Switcher - swipe to select pages */}
          <View style={styles.spacer} />

          <VerticalIconSwitcher
            icons={[
              { name: 'grid-outline', action: () => setActivePanel(null) },
              { name: 'folder-outline', action: () => togglePanel('files') },
              { name: 'terminal-outline', action: handleTerminalClick },
              { name: 'git-branch-outline', action: handleGitClick },
              { name: 'settings-outline', action: () => togglePanel('settings') },
            ]}
            onIconChange={(index) => {}}
          />

          <View style={styles.spacer} />

          <IconButton
            iconName="exit-outline"
            size={24}
            color="#888"
            onPress={onExit}
            accessibilityLabel="Exit"
          />

          <IconButton
            iconName="settings"
            size={24}
            color="#888"
            onPress={() => togglePanel('settings')}
            isActive={activePanel === 'settings'}
            activeColor={AppColors.primary}
            accessibilityLabel="Settings panel"
          />
        </Animated.View>
      </GestureDetector>

      {/* Content area - TabBar will animate its position via context */}
      <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
        {activePanel === 'files' && (
          <Sidebar
            onClose={() => setActivePanel(null)}
            onOpenAllProjects={onOpenAllProjects}
          />
        )}

        {activePanel === 'chat' && (
          <ChatPanel onClose={() => setActivePanel(null)} />
        )}

        {activePanel === 'preview' && (
          <PreviewPanel
            onClose={() => setActivePanel(null)}
            previewUrl="http://localhost:3001"
            projectName="Project Preview"
          />
        )}

        {activePanel === 'settings' && (
          <SettingsPanel onClose={() => setActivePanel(null)} />
        )}

        {activePanel === 'git' && (
          <GitPanel onClose={() => setActivePanel(null)} />
        )}

        <TabBar isCardMode={activePanel === 'multitasking' || activePanel === 'vertical'} />

        {/* Show normal content always (behind vertical panel) */}
        {activePanel !== 'multitasking' && (
          <Animated.View style={[
            { flex: 1 },
            isVerticalPanelMounted && contentRendererAnimatedStyle
          ]}>
            <ContentRenderer
              children={children}
              animatedStyle={{}}
              onPinchOut={() => togglePanel('multitasking')}
              swipeEnabled={false}
            />
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
      </View>
    </SidebarProvider>
  );
};

const styles = StyleSheet.create({
  iconBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 44,
    backgroundColor: '#0a0a0a',
    paddingTop: 60,
    paddingBottom: 20,
    zIndex: 1001,
  },
  iconButton: {
    width: 44,
    height: 44,
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
  edgeSwipeArea: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 60,
    zIndex: 1002,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 4,
  },
  edgeIndicator: {
    width: 3,
    height: 50,
    backgroundColor: 'rgba(139, 124, 246, 0.4)',
    borderRadius: 1.5,
  },
});
