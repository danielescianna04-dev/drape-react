import React from 'react';
import { Dimensions } from 'react-native';
import Animated, { runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTabStore, Tab } from '../../../core/tabs/tabStore';
import { FluidTabSwitcher } from '../../../shared/components/FluidTabSwitcher';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ContentRendererProps {
  children: (tab: Tab, isCardMode: boolean, cardDimensions: { width: number, height: number }) => React.ReactNode;
  animatedStyle: any;
  onPinchOut?: () => void;
}

export const ContentRenderer = ({ children, animatedStyle, onPinchOut }: ContentRendererProps) => {
  const { tabs, activeTabId, setActiveTab } = useTabStore();

  // Find current tab index
  const currentIndex = tabs.findIndex(t => t.id === activeTabId);

  if (currentIndex === -1) return null;

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
          renderTab={(tab) => children(tab, false, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT })}
          onIndexChange={handleIndexChange}
        />
      </Animated.View>
    </GestureDetector>
  );
};
