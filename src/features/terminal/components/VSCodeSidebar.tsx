import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableWithoutFeedback, TouchableOpacity, InteractionManager, Keyboard, AppState, Modal, Alert } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, Easing, withSpring, FadeInDown, FadeOutUp, ZoomIn, FadeIn, interpolate, Extrapolate } from 'react-native-reanimated';
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
import { GitPanel } from './GitPanel';
import { GitSheet } from './GitSheet';
import { VerticalIconSwitcher } from './VerticalIconSwitcher';
import { VSCodeSidebarHeader } from './VSCodeSidebarHeader';
import { getSidebarPreviewPath, openOrCreateSidebarTab } from './vscodeSidebarTabUtils';
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
const PREVIEW_OPEN_DELAY_MS = 280;

interface Props {
  onOpenAllProjects?: () => void;
  onExit?: () => void;
  children?: (tab: Tab, isCardMode: boolean, cardDimensions: { width: number, height: number }, animatedStyle?: Record<string, unknown>) => React.ReactNode;
}

export const VSCodeSidebar = ({ onOpenAllProjects, onExit, children }: Props) => {
  const VSCODE_SIDEBAR_RENDER_ISOLATION = false;
  const VSCODE_SIDEBAR_CHILD_TEST = 'all' as 'all' | 'content-only' | 'header-only' | 'chat-only' | 'git-only';
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [isVerticalPanelMounted, setIsVerticalPanelMounted] = useState(false);
  const [isSidebarHidden, setIsSidebarHidden] = useState(false);
  const [forceHideToggle, setForceHideToggle] = useState(false);
  const [isGitSheetVisible, setIsGitSheetVisible] = useState(false);
  const { tabs, setActiveTab, addTab, activeTabId } = useTabStore();
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const menuProgress = useSharedValue(0); // 0 = button, 1 = expanded menu

  const MENU_WIDTH = 230;
  const BTN_SIZE = 40;

  // Preview state from store
  const previewCurrentUrl = useUIStore((state) => state.previewCurrentUrl);
  const lastNonRootPathRef = React.useRef('/');
  const previewViewportMode = useUIStore((state) => state.previewViewportMode);
  const previewHandlers = useUIStore((state) => state.previewHandlers);
  const previewPublishInfo = useUIStore((state) => state.previewPublishInfo);
  const previewNeedsReload = useUIStore((state) => state.previewNeedsReload);
  const setPreviewNeedsReload = useUIStore((state) => state.setPreviewNeedsReload);
  const databaseBackHandler = useUIStore((state) => state.databaseBackHandler);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const isPreviewActive = activeTab?.type === 'preview' || activeTab?.type === 'browser';
  const isPreviewShowing = isPreviewActive;
  const MENU_HEIGHT = isPreviewShowing ? 255 : 110;

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
  const previewServerUrl = useUIStore((state) => state.previewServerUrl);
  const projectPreviewUrls = useUIStore((state) => state.projectPreviewUrls);
  const setIsSidebarOpen = useUIStore((state) => state.setIsSidebarOpen);
  const openPreviewRequestId = useUIStore((state) => state.openPreviewRequestId);
  const openGitSheetRequestId = useUIStore((state) => state.openGitSheetRequestId);
  const openGitSheetTab = useUIStore((state) => state.openGitSheetTab);
  const openEnvVarsRequestId = useUIStore((state) => state.openEnvVarsRequestId);
  const flyMachineId = useUIStore((state) => state.flyMachineId);
  const currentWorkstation = useWorkstationStore((state) => state.currentWorkstation);
  const lastHandledPreviewRequestId = useRef(0);
  const lastHandledGitRequestId = useRef(0);
  const lastHandledEnvVarsRequestId = useRef(0);

  // Shared values - MUST be declared before useEffect that uses them
  const trackpadTranslation = useSharedValue(0);
  const isTrackpadActive = useSharedValue(false);
  const trackpadScale = useSharedValue(1);
  const trackpadBrightness = useSharedValue(0);
  const sidebarTranslateX = useSharedValue(0);
  const skipZoomAnimation = useSharedValue(false);
  const pillTranslateY = useSharedValue(SCREEN_HEIGHT / 2 - 40); // Initial center position
  const openPreviewTab = useCallback(() => {
    openOrCreateSidebarTab({
      tabs,
      setActiveTab,
      addTab,
      id: 'preview',
      type: 'preview',
      title: 'Preview',
    });
  }, [tabs, setActiveTab, addTab]);

  const openPreviewTabAfterSidebarClose = useCallback(() => {
    const hadOpenPanel = activePanel === 'chat';
    if (hadOpenPanel) {
      setActivePanel(null);
    }

    const run = () => {
      const task = InteractionManager.runAfterInteractions(() => {
        openPreviewTab();
      });
      return () => task.cancel();
    };

    if (hadOpenPanel) {
      const timeoutId = setTimeout(run, PREVIEW_OPEN_DELAY_MS);
      return () => clearTimeout(timeoutId);
    }

    return run();
  }, [activePanel, openPreviewTab]);

  // Auto-open preview when requested (e.g. after AI fix) — opens as a tab
  // Respects preview gate: if blocked, don't auto-open
  React.useEffect(() => {
    const consumedRequestId = useUIStore.getState().consumeOpenPreviewRequest(lastHandledPreviewRequestId.current);
    if (consumedRequestId > lastHandledPreviewRequestId.current) {
      lastHandledPreviewRequestId.current = consumedRequestId;
      return openPreviewTabAfterSidebarClose();
    }
  }, [openPreviewRequestId, openPreviewTabAfterSidebarClose]);

  React.useEffect(() => {
    const consumedRequestId = useUIStore.getState().consumeOpenGitSheetRequest(lastHandledGitRequestId.current);
    if (consumedRequestId > lastHandledGitRequestId.current) {
      lastHandledGitRequestId.current = consumedRequestId;
      setIsGitSheetVisible(true);
    }
  }, [openGitSheetRequestId]);

  React.useEffect(() => {
    const consumedRequestId = useUIStore.getState().consumeOpenEnvVarsRequest(lastHandledEnvVarsRequestId.current);
    if (consumedRequestId > lastHandledEnvVarsRequestId.current) {
      lastHandledEnvVarsRequestId.current = consumedRequestId;
      const existing = tabs.find(t => t.id === 'env-vars');
      if (existing) setActiveTab('env-vars');
      else addTab({ id: 'env-vars', type: 'envVars', title: 'Environment Variables', data: {} });
    }
  }, [openEnvVarsRequestId, tabs, setActiveTab, addTab]);

  // Preview gate removed — preview is always accessible. Issues show in the WebView.

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
    return { transform: [{ translateY: p * 6 }, { rotate: `${p * 45}deg` }] } as { transform: { translateY: number }[] };
  });
  const hamburgerMidStyle = useAnimatedStyle(() => {
    'worklet';
    return { opacity: Math.max(0, 1 - drawerProgress.value * 3.33) };
  });
  const hamburgerBotStyle = useAnimatedStyle(() => {
    'worklet';
    const p = drawerProgress.value;
    return { transform: [{ translateY: p * -6 }, { rotate: `${p * -45}deg` }] } as { transform: { translateY: number }[] };
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
      openPreviewTabAfterSidebarClose();
      return;
    } else {
      setActivePanel(prev => {
        if (prev === panel) { if (panel) tracciaPannelloChiuso(panel); return null; }
        if (panel) tracciaPannelloAperto(panel);
        return panel;
      });
    }
  }, [openPreviewTabAfterSidebarClose]);

  const handleGitClick = useCallback(() => {
    tracciaPannelloAperto('git');
    setIsGitSheetVisible(true);
  }, []);

  const handleEnvVarsClick = useCallback(() => {
    Keyboard.dismiss();
    tracciaPannelloAperto('envVars');
    openOrCreateSidebarTab({
      tabs,
      setActiveTab,
      addTab,
      id: 'env-vars',
      type: 'envVars',
      title: 'Environment Variables',
    });
  }, [tabs, setActiveTab, addTab]);

  const handleShellClick = useCallback(() => {
    Keyboard.dismiss();
    tracciaPannelloAperto('terminal');
    openOrCreateSidebarTab({
      tabs,
      setActiveTab,
      addTab,
      id: 'shell',
      type: 'shell',
      title: 'Logs',
    });
  }, [tabs, setActiveTab, addTab]);

  const handleBuildReportClick = useCallback(() => {
    Keyboard.dismiss();
    openOrCreateSidebarTab({
      tabs,
      setActiveTab,
      addTab,
      id: 'build-report',
      type: 'buildReport',
      title: 'Build Report',
    });
  }, [tabs, setActiveTab, addTab]);

  const handleTerminalClick = useCallback(() => {
    Keyboard.dismiss();
    tracciaPannelloAperto('pty');
    openOrCreateSidebarTab({
      tabs,
      setActiveTab,
      addTab,
      id: 'interactive-terminal',
      type: 'pty',
      title: 'Terminal',
    });
  }, [tabs, setActiveTab, addTab]);

  const handleDatabaseClick = useCallback(() => {
    Keyboard.dismiss();
    tracciaPannelloAperto('database');
    openOrCreateSidebarTab({
      tabs,
      setActiveTab,
      addTab,
      id: 'database',
      type: 'database',
      title: 'Database',
    });
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
    <ChatPanel onClose={handleClosePanel} onExit={() => { removeAllGlassEffects(); onExit?.(); }} />
  ), [handleClosePanel]);

  const currentPreviewPath = getSidebarPreviewPath(previewCurrentUrl, lastNonRootPathRef.current);
  if (currentPreviewPath !== '/') {
    lastNonRootPathRef.current = currentPreviewPath;
  }

  if (VSCODE_SIDEBAR_RENDER_ISOLATION) {
    return (
      <SidebarProvider value={{ sidebarTranslateX, isSidebarHidden, hideSidebar, showSidebar, forceHideToggle, setForceHideToggle }}>
        <View style={{ flex: 1, backgroundColor: '#000' }} />
      </SidebarProvider>
    );
  }

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
        {(VSCODE_SIDEBAR_CHILD_TEST === 'all' || VSCODE_SIDEBAR_CHILD_TEST === 'chat-only') && (
          <View style={styles.drawerPanel} pointerEvents={activePanel === 'chat' ? 'auto' : 'none'}>
            {memoizedChatPanel}
          </View>
        )}

        {/* Main content — outer: GPU translateX only; inner: fixed borderRadius clip */}
        <Animated.View style={[StyleSheet.absoluteFillObject, mainContentSlide]}>
        {/* Border decoration — OUTSIDE overflow:hidden so border is visible */}
        <Animated.View style={[StyleSheet.absoluteFillObject, borderDecorationStyle, { borderRadius: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }]} pointerEvents="none" />
        <View style={[StyleSheet.absoluteFillObject, { borderRadius: 40, overflow: 'hidden', backgroundColor: AppColors.dark.backgroundAlt }]}>
          {(VSCODE_SIDEBAR_CHILD_TEST === 'all' || VSCODE_SIDEBAR_CHILD_TEST === 'header-only') && (
            <VSCodeSidebarHeader
              styles={styles}
              isPreviewShowing={isPreviewShowing}
              activeTabType={activeTab?.type}
              databaseBackHandler={databaseBackHandler}
              tabs={tabs}
              setActiveTab={setActiveTab}
              togglePanel={togglePanel}
              previewCurrentUrl={previewCurrentUrl}
              previewHandlers={previewHandlers}
              previewPublishInfo={previewPublishInfo}
              previewViewportMode={previewViewportMode}
              currentPreviewPath={currentPreviewPath}
              showHeaderMenu={showHeaderMenu}
              closeMenu={closeMenu}
              openMenu={openMenu}
              morphStyle={morphStyle}
              dotsOpacity={dotsOpacity}
              menuItemsOpacity={menuItemsOpacity}
              backdropAnimatedStyle={backdropAnimatedStyle}
              hamburgerTopStyle={hamburgerTopStyle}
              hamburgerMidStyle={hamburgerMidStyle}
              hamburgerBotStyle={hamburgerBotStyle}
            onOpenPreview={() => {
              closeMenu();
              openPreviewTabAfterSidebarClose();
            }}
              onRefreshPreview={() => {
                closeMenu();
                setTimeout(() => previewHandlers.refresh?.(), 280);
              }}
              onToggleViewport={() => {
                closeMenu();
                const next = previewViewportMode === 'mobile' ? 'desktop' : 'mobile';
                previewHandlers.setViewportMode?.(next);
              }}
              onPublishPreview={() => {
                closeMenu();
                setTimeout(() => previewHandlers.publish?.(), 280);
              }}
              onOpenInBrowser={previewCurrentUrl ? () => {
                closeMenu();
                setTimeout(() => previewHandlers.openInBrowser?.(), 280);
              } : undefined}
              onOpenProjectHistory={() => {
                closeMenu();
                setTimeout(() => handleBuildReportClick(), 280);
              }}
            />
          )}

          {/* Content — memoized to avoid re-render when drawer state changes */}
          {(VSCODE_SIDEBAR_CHILD_TEST === 'all' || VSCODE_SIDEBAR_CHILD_TEST === 'content-only') && memoizedContent}

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

        {/* Floating reload banner — rendered at sidebar root so it sits above
            BOTH the preview and the chat drawer. Tap the pill to trigger
            the same refresh handler the in-toolbar 3-dots uses. */}
        {previewNeedsReload && (
          <Animated.View
            pointerEvents="box-none"
            style={localStyles.reloadBannerLayer}
            entering={FadeInDown.springify().damping(16).mass(0.6).delay(50)}
            exiting={FadeOutUp.duration(220)}
          >
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => {
                previewHandlers.refresh?.();
                setPreviewNeedsReload(false);
              }}
              style={localStyles.reloadBanner}
            >
              <Ionicons name="sparkles" size={14} color="#A5B4FC" />
              <Text style={localStyles.reloadBannerText}>L'AI ha modificato il progetto</Text>
              <LinearGradient
                colors={['#7C8CF6', '#5460E6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={localStyles.reloadBannerAction}
              >
                <Ionicons name="refresh" size={13} color="#fff" style={{ marginRight: 5 }} />
                <Text style={localStyles.reloadBannerActionText}>Ricarica</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>

      {(VSCODE_SIDEBAR_CHILD_TEST === 'all' || VSCODE_SIDEBAR_CHILD_TEST === 'git-only') && (
        <GitSheet visible={isGitSheetVisible} onClose={() => { setIsGitSheetVisible(false); useUIStore.setState({ openGitSheetTab: null }); }} initialTab={openGitSheetTab || undefined} />
      )}
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
    // Align vertically with hamburger/chat buttons inside minimalHeader:
    // that container uses paddingTop:64 + height:100 with alignItems:center,
    // so the 40x40 children sit at y=62..102. Using top:64 here would push
    // the morph button 2px lower than the others.
    top: 62,
    right: 12,
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

const localStyles = StyleSheet.create({
  reloadBannerLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    // Sits just below the minimalHeader (height 100) so the pill looks
    // like it's anchored to the header rather than floating in space.
    top: 108,
    alignItems: 'center',
    // Sits above the preview (zIndex ~1200) and the chat drawer (~1160).
    zIndex: 2000,
    elevation: 2000,
  },
  reloadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 6,
    backgroundColor: 'rgba(16, 20, 28, 0.96)',
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 22,
    elevation: 14,
  },
  reloadBannerText: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  reloadBannerAction: {
    marginLeft: 4,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 24,
  },
  reloadBannerActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
