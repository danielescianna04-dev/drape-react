import React from 'react';
import { Dimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTabStore, Tab } from '../../../core/tabs/tabStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SIDEBAR_WIDTH = 50; // Larghezza della sidebar laterale

interface ContentRendererProps {
  children: (tab: Tab, isCardMode: boolean, cardDimensions: { width: number, height: number }) => React.ReactNode;
  animatedStyle: any;
}

export const ContentRenderer = ({ children, animatedStyle }: ContentRendererProps) => {
  const { tabs, activeTabId } = useTabStore();
  const activeTab = tabs.find(t => t.id === activeTabId);

  if (!activeTab) return null;

  return (
    <Animated.View style={[{ flex: 1, marginLeft: SIDEBAR_WIDTH }, animatedStyle]}>
      {children(activeTab, false, { width: SCREEN_WIDTH - SIDEBAR_WIDTH, height: SCREEN_HEIGHT })}
    </Animated.View>
  );
};
