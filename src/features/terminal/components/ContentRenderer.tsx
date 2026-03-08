import React from 'react';
import { Dimensions, View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTabStore, Tab } from '../../../core/tabs/tabStore';
import { FluidTabSwitcher } from '../../../shared/components/FluidTabSwitcher';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ContentRendererProps {
  children: (tab: Tab, isCardMode: boolean, cardDimensions: { width: number, height: number }) => React.ReactNode;
  animatedStyle: any;
  swipeEnabled?: boolean;
}

const EmptyState = () => {
  const { t } = useTranslation('terminal');

  return (
    <View style={emptyStyles.container}>
      <Ionicons name="browsers-outline" size={64} color="#333" />
      <Text style={emptyStyles.title}>{t('contentRenderer.emptyTitle')}</Text>
      <Text style={emptyStyles.subtitle}>{t('contentRenderer.emptySubtitle')}</Text>
    </View>
  );
};

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

export const ContentRenderer = ({ children, animatedStyle, swipeEnabled = true }: ContentRendererProps) => {
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

  return (
    <Animated.View style={[{ flex: 1 }, animatedStyle]}>
      <FluidTabSwitcher
        currentIndex={currentIndex}
        tabs={tabs}
        renderTab={(tab, width) => children(tab, false, { width, height: SCREEN_HEIGHT })}
        onIndexChange={handleIndexChange}
        swipeEnabled={swipeEnabled}
      />
    </Animated.View>
  );
};
