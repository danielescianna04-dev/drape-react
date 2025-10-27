import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, ScrollView, TouchableOpacity, Text } from 'react-native';
import { useTabStore, Tab } from '../../../core/tabs/tabStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SIDEBAR_WIDTH = 50;
const AVAILABLE_WIDTH = SCREEN_WIDTH - SIDEBAR_WIDTH;
const CARD_WIDTH = AVAILABLE_WIDTH * 0.9;
const CARD_HEIGHT = SCREEN_HEIGHT * 0.6;
const CARD_SPACING = 15;
const CARD_LEFT = SIDEBAR_WIDTH + (AVAILABLE_WIDTH - CARD_WIDTH) / 2;

interface Props {
  children: (tab: Tab, isCardMode: boolean, cardDimensions: { width: number, height: number }) => React.ReactNode;
  onClose: () => void;
  onScrollRef?: (scrollFn: (dy: number) => void) => void;
  onScrollEnd?: () => void;
}

export const VerticalCardSwitcher = ({ children, onClose, onScrollRef, onScrollEnd }: Props) => {
  const { tabs, activeTabId, setActiveTab } = useTabStore();
  const scrollViewRef = useRef<ScrollView>(null);
  const activeIndex = tabs.findIndex(t => t.id === activeTabId);
  const startY = useRef(0);
  const currentScrollY = useRef(0);
  const isScrolling = useRef(false);
  const hasInitialized = useRef(false);

  const snapToNearest = () => {
    const newIndex = Math.round(currentScrollY.current / (CARD_HEIGHT + CARD_SPACING));
    const clampedIndex = Math.max(0, Math.min(tabs.length - 1, newIndex));
    const targetY = clampedIndex * (CARD_HEIGHT + CARD_SPACING);
    
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        y: targetY,
        animated: true,
      });
    }
    
    if (tabs[clampedIndex] && tabs[clampedIndex].id !== activeTabId) {
      setActiveTab(tabs[clampedIndex].id);
    }
    
    isScrolling.current = false;
    startY.current = 0;
    if (onScrollEnd) onScrollEnd();
  };

  // Initial scroll to active card without animation
  useEffect(() => {
    if (scrollViewRef.current && !hasInitialized.current) {
      const targetY = activeIndex * (CARD_HEIGHT + CARD_SPACING);
      scrollViewRef.current.scrollTo({
        y: targetY,
        animated: false,
      });
      currentScrollY.current = targetY;
      hasInitialized.current = true;
    }
  }, []);

  useEffect(() => {
    if (scrollViewRef.current && activeIndex >= 0 && !isScrolling.current && hasInitialized.current) {
      const targetY = activeIndex * (CARD_HEIGHT + CARD_SPACING);
      scrollViewRef.current.scrollTo({
        y: targetY,
        animated: false,
      });
      currentScrollY.current = targetY;
    }
  }, [activeIndex]);

  useEffect(() => {
    if (onScrollRef) {
      onScrollRef((dy: number) => {
        if (dy === -1) {
          // Special signal to snap
          snapToNearest();
          return;
        }
        
        if (startY.current === 0) {
          startY.current = dy;
          isScrolling.current = true;
        }
        const delta = startY.current - dy;
        const newScrollY = Math.max(0, currentScrollY.current + delta);
        
        if (scrollViewRef.current) {
          scrollViewRef.current.scrollTo({
            y: newScrollY,
            animated: false,
          });
        }
      });
    }
    
    return () => {
      startY.current = 0;
      isScrolling.current = false;
    };
  }, [onScrollRef]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.tabIndicator}>
          {tabs.find(t => t.id === activeTabId)?.title || 'Terminal'} ({activeIndex + 1}/{tabs.length})
        </Text>
      </View>
      
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        snapToInterval={CARD_HEIGHT + CARD_SPACING}
        decelerationRate="fast"
        snapToAlignment="start"
        scrollEventThrottle={16}
        onScroll={(e) => {
          currentScrollY.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEnabled={false}
      >
        {tabs.map((tab, index) => (
          <View
            key={tab.id}
            style={[
              styles.card,
              tab.id === activeTabId && styles.cardActive
            ]}
          >
            <TouchableOpacity
              style={styles.cardHeader}
              onPress={() => {
                setActiveTab(tab.id);
                setTimeout(() => onClose(), 200);
              }}
            >
              <Text style={styles.cardTitle}>{tab.title}</Text>
            </TouchableOpacity>
            <View style={styles.cardContent}>
              {children(tab, true, { width: CARD_WIDTH, height: CARD_HEIGHT - 40 })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingTop: 60,
  },
  header: {
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 124, 246, 0.3)',
  },
  tabIndicator: {
    color: 'rgba(139, 124, 246, 1)',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 20,
    paddingHorizontal: CARD_LEFT,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    marginBottom: CARD_SPACING,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(139, 124, 246, 0.3)',
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  cardActive: {
    borderColor: 'rgba(139, 124, 246, 0.8)',
    shadowColor: 'rgba(139, 124, 246, 0.5)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 5,
  },
  cardHeader: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 124, 246, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 124, 246, 0.2)',
  },
  cardTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  cardContent: {
    flex: 1,
  },
});
