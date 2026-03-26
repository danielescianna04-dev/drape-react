import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableWithoutFeedback, TouchableOpacity, InteractionManager, Keyboard, AppState, Modal } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, Easing, withSpring, FadeInDown, ZoomIn, FadeIn, interpolate, Extrapolate } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { GlassCard } from '../../../features/settings/components/GlassCard';
import { AppColors } from '../../../shared/theme/colors';
import { removeAllGlassEffects } from '../../../shared/components/NativeGlassView';
import { Sidebar } from './Sidebar';
import { MultitaskingPanel } from './MultitaskingPanel';
import { VerticalCardSwitcher } from './VerticalCardSwitcher';
import { ContentRenderer } from './ContentRenderer';
import { TabBar } from './TabBar';
import { ChatPanel } from './ChatPanel';
import { PreviewPanel } from './PreviewPanel';
import { GitPanel } from './GitPanel';
import { GitSheet } from './GitSheet';
import { VerticalIconSwitcher } from './VerticalIconSwitcher';
import { IntegrationsFAB } from './IntegrationsFAB';
import { Tab, useTabStore } from '../../../core/tabs/tabStore';
import { useUIStore } from '../../../core/terminal/uiStore';
import { useWorkstationStore } from '../../../core/terminal/workstationStore';
import { SidebarProvider } from '../context/SidebarContext';
import { IconButton } from '../../../shared/components/atoms';
import { config } from '../../../config/config';
import { getAuthHeaders } from '../../../core/api/getAuthToken';
import { tracciaPannelloAperto, tracciaPannelloChiuso, tracciaLayoutGriglia, tracciaSidebarToggle } from '../../../core/services/analyticsService';

type PanelType = 'files' | 'chat' | 'multitasking' | 'vertical' | 'preview' | 'git' | 'terminal' | null;

const SCREEN_HEIGHT = Dimensions.get('window').height;
const PILL_HEIGHT = 64;
const PILL_VERTICAL_PADDING = 80;

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
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const menuProgress = useSharedValue(0); // 0 = button, 1 = expanded menu

  const MENU_WIDTH = 230;
  const BTN_SIZE = 40;

  // Preview state from store
  const previewCurrentUrl = useUIStore((state) => state.previewCurrentUrl);
  const previewViewportMode = useUIStore((state) => state.previewViewportMode);
  const previewHandlers = useUIStore((state) => state.previewHandlers);
  const previewPublishInfo = useUIStore((state) => state.previewPublishInfo);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const isPreviewActive = activeTab?.type === 'preview' || activeTab?.type === 'browser';
  const isPreviewShowing = isPreviewActive;
  const MENU_HEIGHT = isPreviewShowing ? 230 : 52;

  const openMenu = useCallback(() => {
    setShowHeaderMenu(true);
    menuProgress.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.cubic) });
  }, []);

  const closeMenu = useCallback(() => {
    menuProgress.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) });
    setTimeout(() => setShowHeaderMenu(false), 220);
  }, []);

  const morphStyle = useAnimatedStyle(() => {
    const p = menuProgress.value;
    return {
      width: BTN_SIZE + (MENU_WIDTH - BTN_SIZE) * p,
      height: BTN_SIZE + (MENU_HEIGHT - BTN_SIZE) * p,
      borderRadius: 20 - 4 * p, // 20 → 16
    };
  });

  const dotsOpacity = useAnimatedStyle(() => ({
    opacity: 1 - menuProgress.value,
    position: 'absolute' as const,
  }));

  const menuItemsOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(menuProgress.value, [0.4, 1], [0, 1], Extrapolate.CLAMP),
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(menuProgress.value, [0, 1], [0, 1]),
  }));
  const [isPreviewPanelMounted, setIsPreviewPanelMounted] = useState(false);
  const previewServerUrl = useUIStore((state) => state.previewServerUrl);
  const projectPreviewUrls = useUIStore((state) => state.projectPreviewUrls);
  const setIsSidebarOpen = useUIStore((state) => state.setIsSidebarOpen);
  const openPreviewRequested = useUIStore((state) => state.openPreviewRequested);
  const openGitSheetRequested = useUIStore((state) => state.openGitSheetRequested);
  const openGitSheetTab = useUIStore((state) => state.openGitSheetTab);
  const openEnvVarsRequested = useUIStore((state) => state.openEnvVarsRequested);
  const flyMachineId = useUIStore((state) => state.flyMachineId);
  const currentWorkstation = useWorkstationStore((state) => state.currentWorkstation);

  // Shared values - MUST be declared before useEffect that uses them
  const trackpadTranslation = useSharedValue(0);
  const isTrackpadActive = useSharedValue(false);
  const trackpadScale = useSharedValue(1);
  const trackpadBrightness = useSharedValue(0);
  const sidebarTranslateX = useSharedValue(0);
  const skipZoomAnimation = useSharedValue(false);
  const pillTranslateY = useSharedValue(SCREEN_HEIGHT / 2 - 40); // Initial center position
  // Auto-open preview when requested (e.g. after AI fix) — opens as a tab
  React.useEffect(() => {
    if (openPreviewRequested) {
      useUIStore.getState().setOpenPreviewRequested(false);
      openPreviewTab();
      setActivePanel(null);
    }
  }, [openPreviewRequested]);

  React.useEffect(() => {
    if (openGitSheetRequested) {
      useUIStore.setState({ openGitSheetRequested: false });
      setIsGitSheetVisible(true);
    }
  }, [openGitSheetRequested]);

  React.useEffect(() => {
    if (openEnvVarsRequested) {
      useUIStore.getState().setOpenEnvVarsRequested(false);
      const existing = tabs.find(t => t.id === 'env-vars');
      if (existing) setActiveTab('env-vars');
      else addTab({ id: 'env-vars', type: 'envVars' as any, title: 'Environment Variables', data: {} });
    }
  }, [openEnvVarsRequested]);

  const openPreviewTab = useCallback(() => {
    const existing = tabs.find(t => t.id === 'preview');
    if (existing) {
      setActiveTab('preview');
    } else {
      addTab({
        id: 'preview',
        type: 'preview',
        title: 'Preview',
        data: {},
      });
    }
  }, [tabs, setActiveTab, addTab]);

  // ============ HEARTBEAT: Keep container alive while user is in project ============
  useEffect(() => {
    if (!currentWorkstation?.id || !flyMachineId) return;

    const projectId = currentWorkstation.projectId || currentWorkstation.id;
    const apiUrl = config.apiUrl;
    let interval: ReturnType<typeof setInterval> | null = null;

    const sendHeartbeat = () => {
      getAuthHeaders().then(authHeaders => fetch(`${apiUrl}/fly/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ projectId }),
      })).catch(() => {});
    };

    const startHeartbeat = () => {
      if (interval) return;
      sendHeartbeat(); // Immediate first call
      interval = setInterval(sendHeartbeat, 30000);
    };

    const stopHeartbeat = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };

    startHeartbeat();

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        stopHeartbeat();
      } else if (state === 'active') {
        startHeartbeat();
      }
    });

    return () => {
      stopHeartbeat();
      appStateSub.remove();
    };
  }, [currentWorkstation?.id, currentWorkstation?.projectId, flyMachineId]);

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
      // Closing — delay unmount until drawer close animation completes
      const timeout = setTimeout(() => {
        setRenderedPanel(null);
      }, 320);
      prevActivePanel.current = activePanel;
      return () => clearTimeout(timeout);
    }

    prevActivePanel.current = activePanel;
  }, [activePanel]);

  const panelAnimatedStyle = useAnimatedStyle(() => {
    const slideOpacity = Math.max(0, Math.min(1, (panelSlideX.value + 280) / 280));
    return {
      transform: [{ translateX: panelSlideX.value }],
      opacity: slideOpacity,
    };
  });

  // ═══ DRAWER ANIMATION — optimized for 0-frame-delay, GPU-only compositing ═══
  const DRAWER_WIDTH = 300;
  const drawerProgress = useSharedValue(0); // 0 = closed, 1 = open
  const SPRING_CONFIG = { damping: 20, stiffness: 300, mass: 0.6, restDisplacementThreshold: 0.01 };

  // Drive animation from UI thread immediately — no JS→render→useEffect delay
  useEffect(() => {
    drawerProgress.value = withSpring(activePanel === 'chat' ? 1 : 0, SPRING_CONFIG);
  }, [activePanel]);

  // Hamburger → X: static dimensions, only animate transform/opacity (GPU-only)
  const hamburgerTopStyle = useAnimatedStyle(() => {
    'worklet';
    const p = drawerProgress.value;
    return { transform: [{ translateY: p * 6 }, { rotate: `${p * 45}deg` }] } as any;
  });
  const hamburgerMidStyle = useAnimatedStyle(() => {
    'worklet';
    return { opacity: Math.max(0, 1 - drawerProgress.value * 3.33) };
  });
  const hamburgerBotStyle = useAnimatedStyle(() => {
    'worklet';
    const p = drawerProgress.value;
    return { transform: [{ translateY: p * -6 }, { rotate: `${p * -45}deg` }] } as any;
  });

  // Outer wrapper: ONLY translateX (pure GPU compositing, zero layout)
  const mainContentSlide = useAnimatedStyle(() => {
    'worklet';
    return { transform: [{ translateX: drawerProgress.value * DRAWER_WIDTH }] };
  });

  // Border decoration: opacity-only animation on a separate layer (GPU-only, no clip recalc)
  const borderDecorationStyle = useAnimatedStyle(() => {
    'worklet';
    return { opacity: drawerProgress.value };
  });

  // Overlay dim: opacity-only (GPU-only)
  const drawerOverlayOpacity = useAnimatedStyle(() => {
    'worklet';
    return { opacity: drawerProgress.value };
  });

  useEffect(() => {
    const isOverlayOpen = Boolean(renderedPanel)
      || isVerticalPanelMounted
      || activePanel === 'multitasking'
      || activePanel === 'vertical'
      || isGitSheetVisible;
    setIsSidebarOpen(isOverlayOpen);
  }, [renderedPanel, isVerticalPanelMounted, activePanel, isGitSheetVisible, setIsSidebarOpen]);

  // Auto-close sidebar when opening a preview (either as tab or panel)
  // Auto-hide sidebar when preview tab becomes active
  useEffect(() => {
    if (isPreviewActive && !isSidebarHidden) {
      setForceHideToggle(false);
      const task = InteractionManager.runAfterInteractions(() => {
        sidebarTranslateX.value = withTiming(-50, { duration: 300, easing: Easing.out(Easing.cubic) });
        setIsSidebarHidden(true);
      });
      return () => task.cancel();
    }
  }, [isPreviewActive]);

  // Safety: if preview is active, never keep the sidebar reopen toggle force-hidden.
  useEffect(() => {
    if (isPreviewActive && forceHideToggle) {
      setForceHideToggle(false);
    }
  }, [isPreviewActive, forceHideToggle]);

  const getTabIcon = useCallback((tabType: string) => {
    switch (tabType) {
      case 'files': return 'folder';
      case 'chat': return 'chatbubbles';
      case 'multitasking': return 'grid-outline';
      case 'tasks': return 'list-circle';
      default: return 'folder';
    }
  }, []);

  const togglePanel = useCallback((panel: PanelType) => {
    Keyboard.dismiss();
    if (panel === 'preview') {
      tracciaPannelloAperto('preview');
      openPreviewTab();
      setActivePanel(null);
      return;
    } else {
      setActivePanel(prev => {
        if (prev === panel) { if (panel) tracciaPannelloChiuso(panel); return null; }
        if (panel) tracciaPannelloAperto(panel);
        return panel;
      });
    }
  }, []);

  const handleGitClick = useCallback(() => {
    tracciaPannelloAperto('git');
    setIsGitSheetVisible(true);
  }, []);

  const handleIntegrationsClick = useCallback(() => {
    setIsIntegrationsFABVisible(prev => !prev);
  }, []);

  const handleEnvVarsClick = useCallback(() => {
    Keyboard.dismiss();
    tracciaPannelloAperto('envVars');
    setShowPreviewPanel(false);
    const envVarsTab = tabs.find(t => t.id === 'env-vars');
    if (envVarsTab) {
      setActiveTab('env-vars');
    } else {
      addTab({
        id: 'env-vars',
        type: 'envVars',
        title: 'Environment Variables',
        data: {},
      });
    }
  }, [tabs, setActiveTab, addTab]);

  const handleShellClick = useCallback(() => {
    Keyboard.dismiss();
    tracciaPannelloAperto('terminal');
    setShowPreviewPanel(false);
    const shellTab = tabs.find(t => t.id === 'shell');
    if (shellTab) {
      setActiveTab('shell');
    } else {
      addTab({
        id: 'shell',
        type: 'shell' as any,
        title: 'Logs',
        data: {},
      });
    }
  }, [tabs, setActiveTab, addTab]);

  const handleBuildReportClick = useCallback(() => {
    Keyboard.dismiss();
    setShowPreviewPanel(false);
    const reportTab = tabs.find(t => t.id === 'build-report');
    if (reportTab) {
      setActiveTab('build-report');
    } else {
      addTab({
        id: 'build-report',
        type: 'buildReport' as any,
        title: 'Build Report',
        data: {},
      });
    }
  }, [tabs, setActiveTab, addTab]);

  const handleTerminalClick = useCallback(() => {
    Keyboard.dismiss();
    tracciaPannelloAperto('pty');
    setShowPreviewPanel(false);
    const ptyTab = tabs.find(t => t.id === 'interactive-terminal');
    if (ptyTab) {
      setActiveTab('interactive-terminal');
    } else {
      addTab({
        id: 'interactive-terminal',
        type: 'pty' as any,
        title: 'Terminal',
        data: {},
      });
    }
  }, [tabs, setActiveTab, addTab]);

  const handleDatabaseClick = useCallback(() => {
    Keyboard.dismiss();
    tracciaPannelloAperto('database');
    setShowPreviewPanel(false);
    const dbTab = tabs.find(t => t.id === 'database');
    if (dbTab) {
      setActiveTab('database');
    } else {
      addTab({
        id: 'database',
        type: 'database' as any,
        title: 'Database',
        data: {},
      });
    }
  }, [tabs, setActiveTab, addTab]);

  const handleSupabasePress = useCallback(() => {
    Keyboard.dismiss();
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
    Keyboard.dismiss();
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
    tracciaSidebarToggle('false');
  }, []);

  const showSidebar = useCallback(() => {
    sidebarTranslateX.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
    setIsSidebarHidden(false);
    tracciaSidebarToggle('true');
  }, []);

  const handleClosePanel = useCallback(() => {
    setActivePanel(prev => { if (prev) tracciaPannelloChiuso(prev); return null; });
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
      const rawY = event.absoluteY - PILL_HEIGHT / 2;
      const minY = PILL_VERTICAL_PADDING;
      const maxY = SCREEN_HEIGHT - PILL_HEIGHT - PILL_VERTICAL_PADDING;
      pillTranslateY.value = Math.min(Math.max(rawY, minY), maxY);
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

  // Memoize heavy content so drawer state changes don't re-render it
  const memoizedContent = React.useMemo(() => (
    <Animated.View style={{ flex: 1 }} entering={FadeInDown.delay(300).duration(800)}>
      <ContentRenderer children={children} animatedStyle={{}} swipeEnabled={false} />
    </Animated.View>
  ), [children]);

  const memoizedChatPanel = React.useMemo(() => (
    <ChatPanel onClose={handleClosePanel} onHidePreview={() => setShowPreviewPanel(false)} onExit={() => { removeAllGlassEffects(); onExit?.(); }} />
  ), [handleClosePanel]);

  return (
    <SidebarProvider value={{ sidebarTranslateX, isSidebarHidden, hideSidebar, showSidebar, forceHideToggle, setForceHideToggle }}>
      {/* ─── DRAPEMOB: Sidebar, TabBar, Panels — COMMENTED OUT ─── */}
      {/* Old sidebar edge swipe pill */}
      {/* Old sidebar icon bar (GestureDetector + Animated.View with styles.iconBar) */}
      {/* Old TabBar */}
      {/* Old panels (files, chat, git) backdrop and containers */}
      {/* Old VerticalCardSwitcher, MultitaskingPanel */}

      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {/* Chat drawer — always mounted behind main content */}
        <View style={styles.drawerPanel} pointerEvents={activePanel === 'chat' ? 'auto' : 'none'}>
          {memoizedChatPanel}
        </View>

        {/* Main content — outer: GPU translateX only; inner: fixed borderRadius clip */}
        <Animated.View style={[StyleSheet.absoluteFillObject, mainContentSlide]}>
        {/* Border decoration — OUTSIDE overflow:hidden so border is visible */}
        <Animated.View style={[StyleSheet.absoluteFillObject, borderDecorationStyle, { borderRadius: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }]} pointerEvents="none" />
        <View style={[StyleSheet.absoluteFillObject, { borderRadius: 40, overflow: 'hidden', backgroundColor: AppColors.dark.backgroundAlt }]}>
          {/* Header */}
          <View style={styles.minimalHeader}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => togglePanel('chat')}>
              <GlassCard style={styles.headerButtonGlass}>
                <View style={styles.headerButton}>
                  <View style={{ width: 18, height: 14, justifyContent: 'space-between' }}>
                    <Animated.View style={[{ width: 18, height: 2, borderRadius: 1, backgroundColor: '#fff' }, hamburgerTopStyle]} />
                    <Animated.View style={[{ width: 14, height: 2, borderRadius: 1, backgroundColor: '#fff' }, hamburgerMidStyle]} />
                    <Animated.View style={[{ width: 18, height: 2, borderRadius: 1, backgroundColor: '#fff' }, hamburgerBotStyle]} />
                  </View>
                </View>
              </GlassCard>
            </TouchableOpacity>

            {/* Navigation + URL bar — only when preview is visible */}
            {isPreviewShowing && <>
              <TouchableOpacity
                onPress={() => previewHandlers.goBack?.()}
                activeOpacity={0.7}
                style={{ width: 28, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}
              >
                <Ionicons name="chevron-back" size={18} color="rgba(255, 255, 255, 0.5)" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => previewHandlers.goForward?.()}
                activeOpacity={0.7}
                style={{ width: 28, height: 40, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="chevron-forward" size={18} color="rgba(255, 255, 255, 0.5)" />
              </TouchableOpacity>
              <GlassCard style={{ borderRadius: 20, overflow: 'hidden', flex: 1, marginLeft: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', height: 40, paddingHorizontal: 14, gap: 6 }}>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: previewCurrentUrl ? '#00D084' : '#666' }} />
                  <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }} numberOfLines={1}>
                    {(() => {
                      try {
                        const url = new URL(previewCurrentUrl);
                        const match = url.pathname.match(/^\/preview\/[^/]+(\/.*)?$/);
                        return match?.[1] || '/';
                      } catch { return '/'; }
                    })()}
                  </Text>
                </View>
              </GlassCard>
            </>}
          </View>

          {/* 3-dot morph button */}
          {showHeaderMenu && (
            <TouchableWithoutFeedback onPress={closeMenu}>
              <Animated.View style={[styles.menuBackdrop, backdropAnimatedStyle]} />
            </TouchableWithoutFeedback>
          )}
          <View style={styles.morphButtonWrapper} pointerEvents="box-none">
            <TouchableOpacity activeOpacity={1} onPress={showHeaderMenu ? closeMenu : openMenu}>
              <GlassCard style={{ borderRadius: 20, overflow: 'hidden' }}>
                <Animated.View style={[styles.morphButton, morphStyle]}>
                  <Animated.View style={[styles.dotsContainer, dotsOpacity]}>
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#fff' }} />
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#fff' }} />
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#fff' }} />
                  </Animated.View>
                  <Animated.View style={[styles.menuContent, menuItemsOpacity]}>
                    <TouchableOpacity
                      style={styles.menuItem}
                      activeOpacity={0.6}
                      onPress={() => {
                        closeMenu();
                        setTimeout(() => openPreviewTab(), 280);
                      }}
                    >
                      <Ionicons name="eye-outline" size={20} color="#fff" />
                      <Text style={styles.menuItemText}>Mostra preview</Text>
                    </TouchableOpacity>
                    {/* Preview actions — only when preview is showing */}
                    {isPreviewShowing && (
                      <>
                        <View style={styles.menuDivider} />
                        <TouchableOpacity
                          style={styles.menuItem}
                          activeOpacity={0.6}
                          onPress={() => {
                            closeMenu();
                            setTimeout(() => previewHandlers.refresh?.(), 280);
                          }}
                        >
                          <Ionicons name="refresh" size={20} color="#fff" />
                          <Text style={styles.menuItemText}>Ricarica</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.menuItem}
                          activeOpacity={0.6}
                          onPress={() => {
                            closeMenu();
                            const next = previewViewportMode === 'mobile' ? 'desktop' : 'mobile';
                            previewHandlers.setViewportMode?.(next);
                          }}
                        >
                          <Ionicons
                            name={previewViewportMode === 'desktop' ? 'phone-portrait-outline' : 'desktop-outline'}
                            size={20}
                            color="#fff"
                          />
                          <Text style={styles.menuItemText}>
                            {previewViewportMode === 'desktop' ? 'Vista mobile' : 'Vista desktop'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.menuItem}
                          activeOpacity={0.6}
                          onPress={() => {
                            closeMenu();
                            setTimeout(() => previewHandlers.publish?.(), 280);
                          }}
                        >
                          <Ionicons
                            name={previewPublishInfo ? 'cloud-done-outline' : 'cloud-upload-outline'}
                            size={20}
                            color={previewPublishInfo ? '#00D084' : '#fff'}
                          />
                          <Text style={styles.menuItemText}>
                            {previewPublishInfo ? 'Aggiorna sito' : 'Pubblica'}
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}
                    <View style={styles.menuDivider} />
                    <TouchableOpacity
                      style={styles.menuItem}
                      activeOpacity={0.6}
                      onPress={() => {
                        closeMenu();
                        setTimeout(() => handleBuildReportClick(), 280);
                      }}
                    >
                      <Ionicons name="time-outline" size={20} color="#8B5CF6" />
                      <Text style={styles.menuItemText}>Project History</Text>
                    </TouchableOpacity>
                  </Animated.View>
                </Animated.View>
              </GlassCard>
            </TouchableOpacity>
          </View>

          {/* Content — memoized to avoid re-render when drawer state changes */}
          {memoizedContent}

          {/* Preview is now rendered as a tab via ContentRenderer */}

          {/* Tap overlay to close drawer */}
          <Animated.View
            style={[StyleSheet.absoluteFillObject, drawerOverlayOpacity, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
            pointerEvents={activePanel === 'chat' ? 'auto' : 'none'}
          >
            <TouchableWithoutFeedback onPress={() => setActivePanel(null)}>
              <View style={StyleSheet.absoluteFillObject} />
            </TouchableWithoutFeedback>
          </Animated.View>
        </View>
        </Animated.View>
      </View>

      <GitSheet visible={isGitSheetVisible} onClose={() => { setIsGitSheetVisible(false); useUIStore.setState({ openGitSheetTab: null }); }} initialTab={openGitSheetTab || undefined} />
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
    width: 34, // Keep a comfortable hit area near screen edge
    zIndex: 1210,
  },
  slidePillContainer: {
    position: 'absolute',
    left: -4, // Attach pill to the device edge
    width: 22,
    height: 64,
    backgroundColor: 'rgba(12, 12, 16, 0.78)',
    borderTopRightRadius: 30,
    borderBottomRightRadius: 30,
    borderWidth: 1.1,
    borderLeftWidth: 0,
    borderColor: 'rgba(160, 132, 255, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#A084FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
  },
  slidePillBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  slidePillGlass: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopRightRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'hidden',
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
  drawerPanel: {
    ...StyleSheet.absoluteFillObject,
  },
  panelBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1155,
  },
  panelsContainer: {
    ...StyleSheet.absoluteFillObject,
    left: 0,
    zIndex: 1160,
  },
  hiddenPreviewPanel: {
    transform: [{ translateX: -10000 }],
  },
  previewPanelLayer: {
    zIndex: 1150,
    elevation: 1150,
  },
  minimalHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    paddingTop: 64,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1200,
    backgroundColor: 'transparent',
  },
  morphButtonWrapper: {
    position: 'absolute',
    top: 0,
    right: 12,
    height: 100,
    paddingTop: 64,
    justifyContent: 'center',
    zIndex: 1300,
    alignItems: 'flex-end',
  },
  urlBarGlass: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  urlBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingHorizontal: 12,
    gap: 6,
  },
  urlBarText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    flex: 1,
  },
  headerButtonGlass: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  morphButton: {
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    width: 20,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1199,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  menuContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  menuItemText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '400',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 18,
  },
});
