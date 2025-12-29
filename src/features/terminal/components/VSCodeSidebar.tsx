import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Dimensions, TouchableWithoutFeedback } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, Easing, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
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
  const [isGitSheetVisible, setIsGitSheetVisible] = useState(false);
  const [isIntegrationsFABVisible, setIsIntegrationsFABVisible] = useState(false);
  const { tabs, setActiveTab, addTab, activeTabId } = useTabStore();

  // Auto-close sidebar when opening a preview
  useEffect(() => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if ((activeTab?.type === 'preview' || activeTab?.type === 'browser') && !isSidebarHidden) {
      console.log('👁️ [VSCodeSidebar] Preview active, auto-hiding sidebar');
      sidebarTranslateX.value = withTiming(-50, { duration: 300, easing: Easing.out(Easing.cubic) });
      setIsSidebarHidden(true);
    }
  }, [activeTabId]); // Only check when active tab changes

  // Shared values
  const trackpadTranslation = useSharedValue(0);
  const isTrackpadActive = useSharedValue(false);
  const trackpadScale = useSharedValue(1);
  const trackpadBrightness = useSharedValue(0);
  const sidebarTranslateX = useSharedValue(0);
  const skipZoomAnimation = useSharedValue(false);

  const togglePanel = useCallback((panel: PanelType) => {
    setActivePanel(prev => (prev === panel ? null : panel));
  }, []);

  const handleTerminalClick = useCallback(() => {
    setActivePanel(null);
    const aiTerminalTab = tabs.find(t => t.id === 'terminal-ai');
    if (aiTerminalTab) {
      setActiveTab('terminal-ai');
    } else {
      addTab({
        id: 'terminal-ai',
        type: 'terminal',
        title: 'Terminal AI',
        data: { sourceTabId: 'all' },
      });
    }
  }, [tabs, setActiveTab, addTab]);

  const handleGitClick = useCallback(() => {
    // Open git sheet instead of creating a tab
    setIsGitSheetVisible(true);
  }, []);

  const handleIntegrationsClick = useCallback(() => {
    setIsIntegrationsFABVisible(prev => !prev);
  }, []);

  const handleEnvVarsClick = useCallback(() => {
    // Open as tab instead of panel
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

  // Gestures
  const edgeSwipeGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      sidebarTranslateX.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
      runOnJS(setIsSidebarHidden)(false);
    });

  const sidebarSwipeGesture = Gesture.Pan()
    .onUpdate((event) => {
      'worklet';
      if (event.translationX < 0 && Math.abs(event.translationX) > Math.abs(event.translationY)) {
        sidebarTranslateX.value = Math.max(event.translationX, -50);
      }
    })
    .onEnd((event) => {
      'worklet';
      // Easier to close: smaller threshold (-15px instead of -25px) and lower velocity (-200 instead of -400)
      if (event.translationX < -15 || event.velocityX < -200) {
        sidebarTranslateX.value = withTiming(-50, { duration: 200, easing: Easing.out(Easing.cubic) });
        runOnJS(setIsSidebarHidden)(true);
      } else {
        sidebarTranslateX.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.cubic) });
      }
    })
    .activeOffsetX([-5, 1000])  // More sensitive to left swipes
    .activeOffsetY([-80, 80])   // More tolerant of vertical movement
    .hitSlop({ right: 200, top: 50, bottom: 50 });  // Larger touch area

  const sidebarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sidebarTranslateX.value }],
  }));

  return (
    <SidebarProvider value={{ sidebarTranslateX, isSidebarHidden }}>
      {isSidebarHidden && (
        <GestureDetector gesture={edgeSwipeGesture}>
          <TouchableWithoutFeedback onPress={() => {
            sidebarTranslateX.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
            setIsSidebarHidden(false);
          }}>
            <View style={styles.edgeSwipeArea}>
              <View style={styles.slidePill}>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.9)" />
              </View>
            </View>
          </TouchableWithoutFeedback>
        </GestureDetector>
      )}

      <GestureDetector gesture={sidebarSwipeGesture}>
        <Animated.View style={[styles.iconBar, sidebarAnimatedStyle]}>
          {/* Top icons */}
          <View style={styles.topIcons}>
            <IconButton iconName="grid-outline" size={24} color={AppColors.icon.default} onPress={() => setActivePanel(null)} isActive={activePanel === null || activePanel === 'multitasking'} activeColor={AppColors.primary} accessibilityLabel="Tabs view" />
            <IconButton iconName="folder" size={24} color={AppColors.icon.default} onPress={() => togglePanel('files')} isActive={activePanel === 'files'} activeColor={AppColors.primary} accessibilityLabel="Files panel" />
            <IconButton iconName="chatbubbles" size={24} color={AppColors.icon.default} onPress={() => togglePanel('chat')} isActive={activePanel === 'chat'} activeColor={AppColors.primary} accessibilityLabel="Chat panel" />
            <IconButton iconName="eye" size={24} color={AppColors.icon.default} onPress={() => togglePanel('preview')} isActive={activePanel === 'preview'} activeColor={AppColors.primary} accessibilityLabel="Preview panel" />
          </View>

          {/* Center section with wheel - lowered */}
          <View style={styles.centerSection}>
            <View style={{ height: 160 }} />
            <VerticalIconSwitcher
              icons={[
                { name: 'terminal-outline', action: handleTerminalClick },
                { name: 'git-branch-outline', action: handleGitClick },
                { name: 'key-outline', action: handleEnvVarsClick },
                // { name: 'extension-puzzle-outline', action: handleIntegrationsClick },
                { name: 'settings-outline', action: () => togglePanel('settings') },
              ]}
              onIconChange={() => { }}
            />
          </View>

          {/* Bottom icons - always at bottom */}
          <View style={styles.bottomIcons}>
            <IconButton iconName="exit-outline" size={24} color={AppColors.icon.default} onPress={onExit} accessibilityLabel="Exit" />
            <IconButton iconName="settings" size={24} color={AppColors.icon.default} onPress={() => togglePanel('settings')} isActive={activePanel === 'settings'} activeColor={AppColors.primary} accessibilityLabel="Settings panel" />
          </View>
        </Animated.View>
      </GestureDetector>

      <View style={{ flex: 1, backgroundColor: AppColors.dark.backgroundAlt }}>
        {/* Backdrop overlay - tap to close panel */}
        {activePanel && activePanel !== 'multitasking' && activePanel !== 'vertical' && (
          <TouchableWithoutFeedback onPress={() => setActivePanel(null)}>
            <View style={styles.panelBackdrop} />
          </TouchableWithoutFeedback>
        )}

        {activePanel === 'files' && <Sidebar onClose={() => setActivePanel(null)} onOpenAllProjects={onOpenAllProjects} />}
        {activePanel === 'chat' && <ChatPanel onClose={() => setActivePanel(null)} />}
        {activePanel === 'preview' && <PreviewPanel onClose={() => setActivePanel(null)} previewUrl="http://localhost:3001" projectName="Project Preview" />}
        {activePanel === 'settings' && <SettingsPanel onClose={() => setActivePanel(null)} />}
        {activePanel === 'git' && <GitPanel onClose={() => setActivePanel(null)} />}

        <TabBar isCardMode={activePanel === 'multitasking' || activePanel === 'vertical'} />

        {activePanel !== 'multitasking' && (
          <Animated.View style={{ flex: 1 }}>
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
    zIndex: 1001,
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
    width: 32,
    zIndex: 1001,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  slidePill: {
    width: 24,
    height: 72,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  panelBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 999,
  },
});
