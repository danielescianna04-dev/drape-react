import React from 'react';
import { Dimensions, View, Text, StyleSheet } from 'react-native';
import Animated, { runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useTabStore, Tab } from '../../../core/tabs/tabStore';
import { FluidTabSwitcher } from '../../../shared/components/FluidTabSwitcher';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ContentRendererProps {
  children: (tab: Tab, isCardMode: boolean, cardDimensions: { width: number, height: number }) => React.ReactNode;
  animatedStyle: any;
  onPinchOut?: () => void;
  swipeEnabled?: boolean;
}

const EmptyState = () => (
  <View style={emptyStyles.container}>
    <Ionicons name="browsers-outline" size={64} color="#333" />
    <Text style={emptyStyles.title}>Nessuna scheda aperta</Text>
    <Text style={emptyStyles.subtitle}>Premi il + per aprire una nuova scheda</Text>
  </View>
);

const emptyStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
});

export const ContentRenderer = ({ children, animatedStyle, onPinchOut, swipeEnabled = true }: ContentRendererProps) => {
  const { tabs, activeTabId, setActiveTab } = useTabStore();

  // Find current tab index
  const currentIndex = tabs.findIndex(t => t.id === activeTabId);

  // Show empty state when no tabs
  if (tabs.length === 0 || currentIndex === -1) {
    return (
      <Animated.View style={[{ flex: 1 }, animatedStyle]}>
        <EmptyState />
      </Animated.View>
    );
  }

  const handleIndexChange = (newIndex: number) => {
    const newTab = tabs[newIndex];
    if (newTab) {
      setActiveTab(newTab.id);
    }
  };

  // Pinch gesture to open multitasking (like iPad)
  const pinchGesture = Gesture.Pinch()
    .onEnd((event) => {
      'worklet';
      // If pinching in (scale < 0.8), open multitasking
      if (event.scale < 0.8 && onPinchOut) {
        runOnJS(onPinchOut)();
      }
    });

  return (
    <GestureDetector gesture={pinchGesture}>
      <Animated.View style={[{ flex: 1 }, animatedStyle]}>
        <FluidTabSwitcher
          currentIndex={currentIndex}
          tabs={tabs}
          renderTab={(tab, width) => children(tab, false, { width, height: SCREEN_HEIGHT })}
          onIndexChange={handleIndexChange}
          swipeEnabled={swipeEnabled}
        />
      </Animated.View>
    </GestureDetector>
  );
};
