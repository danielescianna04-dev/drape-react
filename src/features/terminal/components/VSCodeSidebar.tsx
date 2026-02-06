import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Dimensions, TouchableWithoutFeedback, InteractionManager } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, Easing, withSpring, FadeInDown, ZoomIn, FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
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
import { GitSheet } from './GitSheet';
import { VerticalIconSwitcher } from './VerticalIconSwitcher';
import { IntegrationsFAB } from './IntegrationsFAB';
import { Tab, useTabStore } from '../../../core/tabs/tabStore';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { SidebarProvider } from '../context/SidebarContext';
import { IconButton } from '../../../shared/components/atoms';

type PanelType = 'files' | 'chat' | 'multitasking' | 'vertical' | 'settings' | 'preview' | 'git' | 'terminal' | null;

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
  const [forceHideToggle, setForceHideToggle] = useState(false);
  const [isGitSheetVisible, setIsGitSheetVisible] = useState(false);
  const [isIntegrationsFABVisible, setIsIntegrationsFABVisible] = useState(false);
  const { tabs, setActiveTab, addTab, activeTabId } = useTabStore();
  const [showPreviewPanel, setShowPreviewPanel] = useState(false);
  const previewServerUrl = useTerminalStore((state) => state.previewServerUrl);
  const apiUrl = useTabStore((state) => state.apiUrl);

  // Shared values - MUST be declared before useEffect that uses them
  const trackpadTranslation = useSharedValue(0);
  const isTrackpadActive = useSharedValue(false);
  const trackpadScale = useSharedValue(1);
  const trackpadBrightness = useSharedValue(0);
  const sidebarTranslateX = useSharedValue(0);
  const skipZoomAnimation = useSharedValue(false);
  const pillTranslateY = useSharedValue(SCREEN_HEIGHT / 2 - 40); // Initial center position
  const prevShowPreviewPanel = React.useRef(showPreviewPanel);

  // Panel slide animation
  const panelSlideX = useSharedValue(-280); // Start off-screen to the left
  const [renderedPanel, setRenderedPanel] = useState<PanelType>(null);
  const prevActivePanel = React.useRef<PanelType>(null);

  // Check if panel type is a "slideable" panel (not multitasking, vertical, or preview)
  const isSlideablePanel = (panel: PanelType) =>
    panel && panel !== 'multitasking' && panel !== 'vertical' && panel !== 'preview';

  // Animate panel when activePanel changes
  useEffect(() => {
    const wasSlideablePanel = isSlideablePanel(prevActivePanel.current);
    const isNowSlideablePanel = isSlideablePanel(activePanel);

    if (isNowSlideablePanel) {
      if (wasSlideablePanel && prevActivePanel.current !== activePanel) {
        // Switching between panels (e.g., files -> chat)
        // Keep panel open, just swap content immediately (no animation to avoid flash)
        panelSlideX.value = 0;
        setRenderedPanel(activePanel);
      } else if (!wasSlideablePanel) {
        // Opening a panel from closed state - slide in
        setRenderedPanel(activePanel);
        panelSlideX.value = withTiming(0, {
          duration: 300,
          easing: Easing.out(Easing.cubic)
        });
      } else {
        // Same panel, just update
        setRenderedPanel(activePanel);
      }
    } else if (wasSlideablePanel) {
      // Closing a panel - animate out then unmount
      panelSlideX.value = withTiming(-280, {
        duration: 250,
        easing: Easing.in(Easing.cubic)
      });
      // Delay unmounting until animation completes
      const timeout = setTimeout(() => {
        setRenderedPanel(null);
      }, 250);
      prevActivePanel.current = activePanel;
      return () => clearTimeout(timeout);
    }

    prevActivePanel.current = activePanel;
  }, [activePanel]);

  const panelAnimatedStyle = useAnimatedStyle(() => {
    // Calculate opacity based on position (0 = fully visible, -280 = hidden)
    const slideOpacity = Math.max(0, Math.min(1, (panelSlideX.value + 280) / 280));
    return {
      transform: [{ translateX: panelSlideX.value }],
      opacity: slideOpacity,
    };
  });

  // Auto-close sidebar when opening a preview (either as tab or panel)
  // Only trigger when showPreviewPanel JUST became true (not when closing other panels)
  useEffect(() => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    const isPreviewTabActive = activeTab?.type === 'preview' || activeTab?.type === 'browser';

    // Check if showPreviewPanel just became true (rising edge)
    const previewJustOpened = showPreviewPanel && !prevShowPreviewPanel.current;
    prevShowPreviewPanel.current = showPreviewPanel;

    // Only auto-hide if preview JUST opened OR preview tab became active
    if ((previewJustOpened || isPreviewTabActive) && !isSidebarHidden) {
      // Delay animation until after interactions (preview mounting) complete
      const task = InteractionManager.runAfterInteractions(() => {
        console.log('👁️ [VSCodeSidebar] Preview activated, auto-hiding sidebar');
        sidebarTranslateX.value = withTiming(-50, { duration: 300, easing: Easing.out(Easing.cubic) });
        setIsSidebarHidden(true);
      });
      return () => task.cancel();
    }
  }, [activeTabId, showPreviewPanel]);

  const getTabIcon = useCallback((tabType: string) => {
    switch (tabType) {
      case 'files': return 'folder';
      case 'chat': return 'chatbubbles';
      case 'multitasking': return 'grid-outline';
      case 'settings': return 'settings';
      case 'tasks': return 'list-circle';
      default: return 'folder';
    }
  }, []);

  const togglePanel = useCallback((panel: PanelType) => {
    if (panel === 'preview') {
      setShowPreviewPanel(prev => !prev);
      setActivePanel(null); // Clear other panels when toggling preview
    } else {
      setActivePanel(prev => (prev === panel ? null : panel));
      // Optionally hide preview when opening other panels? No, user wants it "sotto"
    }
  }, []);

  const handleGitClick = useCallback(() => {
    // Open git sheet instead of creating a tab
    setIsGitSheetVisible(true);
  }, []);

  const handleIntegrationsClick = useCallback(() => {
    setIsIntegrationsFABVisible(prev => !prev);
  }, []);

  const handleEnvVarsClick = useCallback(() => {
    // Open as tab instead of panel
    setShowPreviewPanel(false); // Close preview when switching to env vars
    const envVarsTab = tabs.find(t => t.id === 'env-vars');
    if (envVarsTab) {
      setActiveTab('env-vars');
    } else {
      addTab({
        id: 'env-vars',
        type: 'envVars',
        title: 'Variabili Ambiente',
        data: {},
      });
    }
  }, [tabs, setActiveTab, addTab]);

  const handleSupabasePress = useCallback(() => {
    // Open as tab instead of panel (keep FAB visible)
    const supabaseTab = tabs.find(t => t.id === 'integration-supabase');
    if (supabaseTab) {
      setActiveTab('integration-supabase');
    } else {
      addTab({
        id: 'integration-supabase',
        type: 'integration',
        title: 'Supabase',
        data: { integration: 'supabase' },
      });
    }
  }, [tabs, setActiveTab, addTab]);

  const handleFigmaPress = useCallback(() => {
    // Open as tab instead of panel (keep FAB visible)
    const figmaTab = tabs.find(t => t.id === 'integration-figma');
    if (figmaTab) {
      setActiveTab('integration-figma');
    } else {
      addTab({
        id: 'integration-figma',
        type: 'integration',
        title: 'Figma',
        data: { integration: 'figma' },
      });
    }
  }, [tabs, setActiveTab, addTab]);

  const openVerticalPanel = useCallback(() => {
    setIsVerticalPanelMounted(true);
  }, []);

  const closeVerticalPanel = useCallback(() => {
    setIsVerticalPanelMounted(false);
  }, []);

  const hideSidebar = useCallback(() => {
    sidebarTranslateX.value = withTiming(-50, { duration: 300, easing: Easing.out(Easing.cubic) });
    setIsSidebarHidden(true);
  }, []);

  const showSidebar = useCallback(() => {
    sidebarTranslateX.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
    setIsSidebarHidden(false);
  }, []);

  const handleClosePanel = useCallback(() => {
    setActivePanel(null);
  }, []);

  // Gestures
  const tapGesture = Gesture.Tap()
    .onEnd(() => {
      'worklet';
      sidebarTranslateX.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
      runOnJS(setIsSidebarHidden)(false);
    });

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      'worklet';
      pillTranslateY.value = event.absoluteY - 32;
    })
    .onEnd((event) => {
      'worklet';
      if (event.translationX > 15) {
        sidebarTranslateX.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
        runOnJS(setIsSidebarHidden)(false);
      }
    });

  const edgeSwipeGesture = Gesture.Race(panGesture, tapGesture);

  const pillAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pillTranslateY.value }],
  }));

  const sidebarSwipeGesture = Gesture.Pan()
    .onUpdate((event) => {
      'worklet';
      // Allow swipe left to close - follow finger with resistance
      if (event.translationX < 0) {
        sidebarTranslateX.value = Math.max(event.translationX * 0.8, -50);
      }
    })
    .onEnd((event) => {
      'worklet';
      // Close if swiped left enough or with velocity
      if (event.translationX < -10 || event.velocityX < -150) {
        sidebarTranslateX.value = withTiming(-50, { duration: 200, easing: Easing.out(Easing.cubic) });
        runOnJS(setIsSidebarHidden)(true);
      } else {
        sidebarTranslateX.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.cubic) });
      }
    })
    .activeOffsetX([-3, 1000])  // Very sensitive to left swipes
    .failOffsetY([-15, 15]);    // Cancel if vertical scroll detected

  const sidebarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sidebarTranslateX.value }],
  }));

  return (
    <SidebarProvider value={{ sidebarTranslateX, isSidebarHidden, hideSidebar, showSidebar, forceHideToggle, setForceHideToggle }}>
      {isSidebarHidden && !forceHideToggle && (
        <View style={styles.edgeSwipeArea} pointerEvents="box-none">
          <GestureDetector gesture={edgeSwipeGesture}>
            <Animated.View style={[styles.slidePillContainer, pillAnimatedStyle]}>
              {isLiquidGlassSupported ? (
                <LiquidGlassView style={styles.slidePillGlass}>
                  <Ionicons name="chevron-forward" size={10} color="rgba(255,255,255,0.5)" />
                </LiquidGlassView>
              ) : (
                <>
                  <View style={[styles.slidePillBlur, { backgroundColor: AppColors.dark.backgroundAlt, opacity: 0.9 }]} />
                  <Ionicons name="chevron-forward" size={10} color="rgba(255,255,255,0.3)" />
                </>
              )}
            </Animated.View>
          </GestureDetector>
        </View>
      )}

      <GestureDetector gesture={sidebarSwipeGesture}>
        <Animated.View
          style={[styles.iconBar, sidebarAnimatedStyle]}
          onStartShouldSetResponder={() => true}
          entering={FadeIn.duration(400)}
        >
          {/* Top icons */}
          <View style={styles.topIcons}>
            <Animated.View entering={FadeInDown.delay(100).duration(500)}>
              <IconButton
                iconName="grid-outline"
                size={24}
                color={AppColors.icon.default}
                onPress={() => {
                  setActivePanel(null);
                  setShowPreviewPanel(false); // Go back to tabs (hide preview)
                }}
                isActive={(activePanel === null || activePanel === 'multitasking') && !showPreviewPanel}
                activeColor={AppColors.primary}
                accessibilityLabel="Tabs view"
              />
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(200).duration(500)}>
              <IconButton iconName="folder" size={24} color={AppColors.icon.default} onPress={() => togglePanel('files')} isActive={activePanel === 'files'} activeColor={AppColors.primary} accessibilityLabel="Files panel" />
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(300).duration(500)}>
              <IconButton iconName="chatbubbles" size={24} color={AppColors.icon.default} onPress={() => togglePanel('chat')} isActive={activePanel === 'chat'} activeColor={AppColors.primary} accessibilityLabel="Chat panel" />
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(400).duration(500)}>
              <IconButton iconName="eye" size={24} color={AppColors.icon.default} onPress={() => togglePanel('preview')} isActive={showPreviewPanel} activeColor={AppColors.primary} accessibilityLabel="Preview panel" />
            </Animated.View>
          </View>

          {/* Center section with wheel - lowered */}
          <View style={styles.centerSection}>
            <View style={{ height: 160 }} />
            <Animated.View entering={FadeInDown.delay(500).duration(500)}>
              <VerticalIconSwitcher
                icons={[
                  { name: 'git-branch-outline', action: handleGitClick },
                  { name: 'key-outline', action: handleEnvVarsClick },
                ]}
                onIconChange={() => { }}
              />
            </Animated.View>
          </View>

          {/* Bottom icons - always at bottom */}
          <View style={styles.bottomIcons}>
            <Animated.View entering={FadeInDown.delay(600).duration(500)}>
              <IconButton iconName="exit-outline" size={24} color={AppColors.icon.default} onPress={onExit} accessibilityLabel="Exit" />
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(700).duration(500)}>
              <IconButton iconName="settings" size={24} color={AppColors.icon.default} onPress={() => togglePanel('settings')} isActive={activePanel === 'settings'} activeColor={AppColors.primary} accessibilityLabel="Settings panel" />
            </Animated.View>
          </View>
        </Animated.View>
      </GestureDetector>

      <View style={{ flex: 1, backgroundColor: AppColors.dark.backgroundAlt }}>
        {/* Preview Panel - Persistent "under" other panels */}
        {showPreviewPanel && (
          <PreviewPanel
            onClose={() => {
              setShowPreviewPanel(false);
              if (activePanel === 'preview') setActivePanel(null);
            }}
            previewUrl={previewServerUrl || apiUrl || ""}
            projectName="Project Preview"
          />
        )}

        {/* Backdrop overlay - tap to close panel with subtle blur */}
        {renderedPanel && renderedPanel !== 'multitasking' && renderedPanel !== 'vertical' && (
          <TouchableWithoutFeedback onPress={() => setActivePanel(null)}>
            <BlurView intensity={25} tint="dark" style={styles.panelBackdrop} />
          </TouchableWithoutFeedback>
        )}

        {/* Global Panels Container - ensures all menus are above the blur */}
        <Animated.View style={[styles.panelsContainer, panelAnimatedStyle]} pointerEvents="box-none">
          {renderedPanel === 'files' && <Sidebar onClose={handleClosePanel} onOpenAllProjects={onOpenAllProjects} />}
          {renderedPanel === 'chat' && <ChatPanel onClose={handleClosePanel} onHidePreview={() => setShowPreviewPanel(false)} />}
          {renderedPanel === 'settings' && <SettingsPanel onClose={handleClosePanel} />}
          {renderedPanel === 'git' && <GitPanel onClose={handleClosePanel} />}
        </Animated.View>

        <TabBar isCardMode={activePanel === 'multitasking' || activePanel === 'vertical'} />

        {activePanel !== 'multitasking' && (
          <Animated.View style={{ flex: 1 }} entering={FadeInDown.delay(300).duration(800)}>
            <ContentRenderer children={children} animatedStyle={{}} onPinchOut={() => togglePanel('multitasking')} swipeEnabled={false} />
          </Animated.View>
        )}

        {isVerticalPanelMounted && (
          <>
            <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: AppColors.dark.backgroundAlt }]} />
            <Animated.View style={StyleSheet.absoluteFillObject}>
              <VerticalCardSwitcher onClose={closeVerticalPanel} trackpadTranslation={trackpadTranslation} isTrackpadActive={isTrackpadActive} skipZoomAnimation={skipZoomAnimation}>
                {(tab, isCardMode, cardDimensions) => children && children(tab, isCardMode, cardDimensions)}
              </VerticalCardSwitcher>
            </Animated.View>
          </>
        )}

        {activePanel === 'multitasking' && (
          <MultitaskingPanel onClose={() => togglePanel(null)}>
            {(tab, isCardMode, cardDimensions, animatedStyle) => children && children(tab, isCardMode, cardDimensions, animatedStyle)}
          </MultitaskingPanel>
        )}
      </View>

      {/* Git Sheet - overlays everything */}
      <GitSheet
        visible={isGitSheetVisible}
        onClose={() => setIsGitSheetVisible(false)}
      />

      {/* Integrations FAB - draggable floating buttons */}
      <IntegrationsFAB
        visible={isIntegrationsFABVisible}
        onSupabasePress={handleSupabasePress}
        onFigmaPress={handleFigmaPress}
        onClose={() => setIsIntegrationsFABVisible(false)}
      />
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
    backgroundColor: AppColors.dark.backgroundAlt,
    paddingTop: 44,
    paddingBottom: 20,
    zIndex: 1200,
    alignItems: 'center',
  },
  topIcons: {
    alignItems: 'center',
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
  },
  bottomIcons: {
    alignItems: 'center',
    paddingBottom: 10,
  },
  edgeSwipeArea: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 30, // Only cover the pill toggle area
    zIndex: 1210,
  },
  slidePillContainer: {
    position: 'absolute',
    left: 0,
    width: 18,
    height: 64,
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    borderTopRightRadius: 30,
    borderBottomRightRadius: 30,
    borderWidth: 0.8,
    borderLeftWidth: 0,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  slidePillBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  slidePillGlass: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slidePillGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  slidePillIndicator: {
    position: 'absolute',
    left: 1.5,
    width: 2,
    height: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 1,
  },
  panelBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1050,
  },
  panelsContainer: {
    ...StyleSheet.absoluteFillObject,
    left: 0,
    zIndex: 1100,
  },
});
