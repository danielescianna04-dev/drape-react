import React from 'react';
import { Dimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTabStore, Tab } from '../../../core/tabs/tabStore';
import { FluidTabSwitcher } from '../../../shared/components/FluidTabSwitcher';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ContentRendererProps {
  children: (tab: Tab, isCardMode: boolean, cardDimensions: { width: number, height: number }) => React.ReactNode;
  animatedStyle: any;
}

export const ContentRenderer = ({ children, animatedStyle }: ContentRendererProps) => {
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

  return (
    <Animated.View style={[{ flex: 1 }, animatedStyle]}>
      <FluidTabSwitcher
        currentIndex={currentIndex}
        tabs={tabs}
        renderTab={(tab) => children(tab, false, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT })}
        onIndexChange={handleIndexChange}
      />
    </Animated.View>
  );
};
