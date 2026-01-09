import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated as RNAnimated, ScrollView, Keyboard } from 'react-native';
import Animated, { useAnimatedStyle, interpolate, Extrapolate } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTabStore } from '../../../core/tabs/tabStore';
import { AppColors } from '../../../shared/theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSidebarOffset } from '../context/SidebarContext';

interface TabBarProps {
  isCardMode?: boolean;
}

export const TabBar = ({ isCardMode = false }: TabBarProps) => {
  const { tabs, activeTabId, setActiveTab, removeTab } = useTabStore();
  const scaleAnims = useRef<{ [key: string]: RNAnimated.Value }>({}).current;
  const visibilityAnim = useRef(new RNAnimated.Value(1)).current;
  const insets = useSafeAreaInsets();
  const { sidebarTranslateX } = useSidebarOffset();

  // Animate TabBar to expand from left edge when sidebar hides
  const tabBarAnimatedStyle = useAnimatedStyle(() => ({
    left: interpolate(
      sidebarTranslateX.value,
      [-50, 0],
      [0, 44],
      Extrapolate.CLAMP
    ),
  }));

  useEffect(() => {
    tabs.forEach(tab => {
      if (!scaleAnims[tab.id]) {
        scaleAnims[tab.id] = new RNAnimated.Value(0);
        RNAnimated.spring(scaleAnims[tab.id], {
          toValue: 1,
          useNativeDriver: true,
          tension: 80,
          friction: 8,
        }).start();
      }
    });
  }, [tabs]);

  // Animate TabBar visibility
  useEffect(() => {
    RNAnimated.spring(visibilityAnim, {
      toValue: isCardMode ? 0 : 1,
      useNativeDriver: true,
      damping: 20,
      stiffness: 180,
      mass: 0.6,
    }).start();
  }, [isCardMode]);

  // Don't render if fully hidden
  if (isCardMode && visibilityAnim._value === 0) return null;

  const handleTabPress = (tabId: string) => {
    Keyboard.dismiss();
    setActiveTab(tabId);
  };

  const handleRemoveTab = (id: string, e: any) => {
    e.stopPropagation();
    // Remove immediately without animation to prevent white flash
    delete scaleAnims[id];
    removeTab(id);
  };

  const getTabIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'terminal': return 'terminal';
      case 'file': return 'document-text';
      case 'chat': return 'chatbubbles';
      case 'github': return 'logo-github';
      case 'browser': return 'globe';
      case 'preview': return 'eye';
      case 'settings': return 'settings';
      default: return 'terminal';
    }
  };

  return (
    <Animated.View style={[styles.container, tabBarAnimatedStyle]}>
      <RNAnimated.View style={[
        {
          flex: 1,
          flexDirection: 'row',
          paddingTop: insets.top,
          opacity: visibilityAnim,
          transform: [{
            translateY: visibilityAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [-20, 0],
            })
          }]
        }
      ]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="always"
        >
          {tabs.map((tab, index) => {
            const isActive = tab.id === activeTabId;
            const isFirstTab = index === 0;
            const scale = scaleAnims[tab.id] || new RNAnimated.Value(1);

            return (
              <RNAnimated.View
                key={tab.id}
                style={[
                  styles.tabWrapper,
                  { transform: [{ scale }] }
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.tab,
                    isActive && styles.tabActive,
                    isActive && isFirstTab && styles.tabActiveFirst
                  ]}
                  onPress={() => handleTabPress(tab.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={getTabIcon(tab.type)}
                    size={14}
                    color={isActive ? AppColors.primary : AppColors.icon.muted}
                  />
                  <Text
                    style={[styles.tabTitle, isActive && styles.tabTitleActive]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {tab.title}
                  </Text>
                  <TouchableOpacity
                    onPress={(e) => handleRemoveTab(tab.id, e)}
                    style={styles.closeButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={14} color={AppColors.icon.muted} />
                  </TouchableOpacity>
                </TouchableOpacity>
              </RNAnimated.View>
            );
          })}
        </ScrollView>
      </RNAnimated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    right: 0,
    minHeight: 38,
    flexDirection: 'row',
    backgroundColor: AppColors.dark.backgroundAlt,
    zIndex: 100,
    borderBottomLeftRadius: 12,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingLeft: 0,
    paddingRight: 8,
    alignItems: 'center',
  },
  tabWrapper: {
    marginRight: 0,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'transparent',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    gap: 6,
    minWidth: 100,
    maxWidth: 170,
  },
  tabActive: {
    backgroundColor: AppColors.primaryAlpha.a15,
  },
  tabActiveFirst: {
    borderBottomLeftRadius: 12,
  },
  tabTitle: {
    fontSize: 12,
    color: AppColors.icon.muted,
    fontWeight: '500',
    flex: 1,
  },
  tabTitleActive: {
    color: AppColors.white.full,
  },
  closeButton: {
    padding: 2,
  },
});
