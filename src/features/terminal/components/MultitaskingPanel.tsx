import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate, Extrapolate, Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import { useTabStore, Tab } from '../../../core/tabs/tabStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CONTENT_WIDTH = SCREEN_WIDTH - 50;
const SCALE = 0.85;
const HEADER_HEIGHT = 120;
const PAGINATION_HEIGHT = 120;
const AVAILABLE_HEIGHT = SCREEN_HEIGHT - HEADER_HEIGHT - PAGINATION_HEIGHT;
const CARD_WIDTH = CONTENT_WIDTH * 0.88;
const CARD_HEIGHT = AVAILABLE_HEIGHT;
const TAB_BAR_HEIGHT = 90;

interface Props {
  onClose: () => void;
  children: (tab: Tab, isCardMode: boolean, cardDimensions: { width: number, height: number }, animatedStyle?: any) => React.ReactNode;
}

export const MultitaskingPanel = ({ onClose, children }: Props) => {
  const { tabs, activeTabId, setActiveTab, removeTab, addTab } = useTabStore();
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const insets = useSafeAreaInsets();
  const animProgress = useSharedValue(1);

  useEffect(() => {
    animProgress.value = 0;
    animProgress.value = withTiming(1, {
      duration: 300,
      easing: Easing.out(Easing.ease),
    });

    const activeIndex = tabs.findIndex(t => t.id === activeTabId);
    if (activeIndex !== -1) {
      setCurrentIndex(activeIndex);
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ x: activeIndex * (CARD_WIDTH + 40), animated: false });
      }, 50);
    }
  }, []);

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(animProgress.value, [0, 1], [0, 1], Extrapolate.CLAMP),
  }));

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { 
        scale: interpolate(
          animProgress.value, 
          [0, 1], 
          [1, SCALE],
          Extrapolate.CLAMP
        ) 
      }
    ],
  }));

  const handleSelectTab = (tabId: string) => {
    setActiveTab(tabId);
    animProgress.value = withTiming(0, {
      duration: 400,
      easing: Easing.bezier(0.4, 0.0, 0.6, 1),
    });
    setTimeout(onClose, 400);
  };

  const handleCloseTab = (e: any, tabId: string) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    removeTab(tabId);
  };

  const handleAddTab = () => {
    const newTab = {
      id: `terminal-${Date.now()}`,
      type: 'terminal' as const,
      title: `Terminal ${tabs.length + 1}`,
    };
    addTab(newTab);
  };

  const getTabIcon = (type: string) => {
    switch (type) {
      case 'terminal': return 'terminal';
      case 'file': return 'document-text';
      case 'chat': return 'chatbubbles';
      case 'settings': return 'settings';
      default: return 'folder';
    }
  };

  return (
    <>
      <Animated.View style={[styles.overlay, overlayAnimatedStyle]}>
        <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
          <Text style={styles.tabCount}>{tabs.length} {tabs.length === 1 ? 'Scheda' : 'Schede'}</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity onPress={handleAddTab} style={styles.addButton}>
              <Ionicons name="add-circle" size={28} color={AppColors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.doneButton}>
              <Text style={styles.doneText}>Fine</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          snapToInterval={CARD_WIDTH + 40}
          decelerationRate="fast"
          onMomentumScrollEnd={(e) => {
            const index = Math.round(e.nativeEvent.contentOffset.x / (CARD_WIDTH + 40));
            setCurrentIndex(index);
          }}
        >
          {tabs.map((tab, index) => {
            const isActive = tab.id === activeTabId;
            
            return (
              <TouchableOpacity
                key={tab.id}
                style={styles.card}
                onPress={() => handleSelectTab(tab.id)}
                activeOpacity={0.95}
              >
                <View style={[
                  styles.cardBorder,
                  isActive && styles.cardActive,
                  currentIndex === index && styles.cardFocused
                ]}>
                  {isActive && (
                    <View style={styles.contentWrapper}>
                      {children(tab, true, { width: CARD_WIDTH, height: CARD_HEIGHT }, contentAnimatedStyle)}
                    </View>
                  )}
                  
                  {!isActive && (
                    <View style={styles.inactiveCard}>
                      <Ionicons name={getTabIcon(tab.type)} size={48} color="rgba(255,255,255,0.3)" />
                    </View>
                  )}
                  
                  <TouchableOpacity 
                    onPress={(e) => handleCloseTab(e, tab.id)}
                    style={styles.closeButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <View style={styles.closeButtonBg}>
                      <Ionicons name="close" size={18} color="#fff" />
                    </View>
                  </TouchableOpacity>

                  <View style={styles.cardHeader}>
                    <Ionicons name={getTabIcon(tab.type)} size={20} color={AppColors.primary} />
                    <Text style={styles.cardTitle} numberOfLines={1}>{tab.title}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.pagination}>
          {tabs.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                currentIndex === index && styles.dotActive
              ]}
            />
          ))}
        </View>
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 50,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0a0a0a',
    zIndex: 1500,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  tabCount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addButton: {
    padding: 4,
  },
  doneButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: AppColors.primary,
  },
  doneText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    marginHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBorder: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  cardBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
  },
  contentWrapper: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    overflow: 'hidden',
  },
  inactiveCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
  },
  cardActive: {
    borderColor: AppColors.primary,
    shadowColor: AppColors.primary,
    shadowOpacity: 0.8,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  cardFocused: {
    borderColor: AppColors.primary,
    borderWidth: 3,
  },
  cardHeader: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    zIndex: 10,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
  },
  closeButtonBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 30,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: {
    width: 24,
    backgroundColor: AppColors.primary,
  },
});
