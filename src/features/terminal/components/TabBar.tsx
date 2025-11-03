import React, { useRef, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTabStore } from '../../../core/tabs/tabStore';
import { AppColors } from '../../../shared/theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabTypeSelector, TabType } from './TabTypeSelector';

interface TabBarProps {
  isCardMode?: boolean;
}

export const TabBar = ({ isCardMode = false }: TabBarProps) => {
  const { tabs, activeTabId, setActiveTab, removeTab, addTab } = useTabStore();
  const scaleAnims = useRef<{ [key: string]: Animated.Value }>({}).current;
  const visibilityAnim = useRef(new Animated.Value(1)).current;
  const insets = useSafeAreaInsets();
  const [showTabTypeSelector, setShowTabTypeSelector] = useState(false);

  useEffect(() => {
    tabs.forEach(tab => {
      if (!scaleAnims[tab.id]) {
        scaleAnims[tab.id] = new Animated.Value(0);
        Animated.spring(scaleAnims[tab.id], {
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
    Animated.spring(visibilityAnim, {
      toValue: isCardMode ? 0 : 1,
      useNativeDriver: true,
      damping: 20,
      stiffness: 180,
      mass: 0.6,
    }).start();
  }, [isCardMode]);

  // Don't render if fully hidden
  if (isCardMode && visibilityAnim._value === 0) return null;

  const handleRemoveTab = (id: string, e: any) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    
    Animated.timing(scaleAnims[id], {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      removeTab(id);
      delete scaleAnims[id];
    });
  };

  const handleAddTab = () => {
    setShowTabTypeSelector(true);
  };

  const handleSelectTabType = (type: TabType) => {
    const timestamp = Date.now();
    let newTab;

    switch (type) {
      case 'chat':
        newTab = {
          id: `chat-${timestamp}`,
          type: 'chat' as const,
          title: 'Nuova Chat',
          data: { chatId: timestamp.toString() }
        };
        break;
      case 'terminal':
        newTab = {
          id: `terminal-${timestamp}`,
          type: 'terminal' as const,
          title: 'Terminal',
        };
        break;
      case 'github':
        newTab = {
          id: `github-${timestamp}`,
          type: 'github' as const,
          title: 'GitHub',
        };
        break;
      case 'browser':
        newTab = {
          id: `browser-${timestamp}`,
          type: 'browser' as const,
          title: 'Browser',
        };
        break;
      case 'preview':
        newTab = {
          id: `preview-${timestamp}`,
          type: 'preview' as const,
          title: 'Preview',
        };
        break;
      case 'file':
        newTab = {
          id: `file-${timestamp}`,
          type: 'file' as const,
          title: 'File',
        };
        break;
      default:
        return;
    }

    addTab(newTab);
  };

  const getTabIcon = (type: string) => {
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
    <Animated.View style={[
      styles.container,
      {
        paddingTop: insets.top,
        opacity: visibilityAnim,
        transform: [{
          translateY: visibilityAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [-20, 0], // Slide up/down
          })
        }]
      }
    ]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId;
          const scale = scaleAnims[tab.id] || new Animated.Value(1);
          
          return (
            <Animated.View
              key={tab.id}
              style={[
                styles.tabWrapper,
                { transform: [{ scale }] }
              ]}
            >
              <TouchableOpacity
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveTab(tab.id)}
                activeOpacity={0.7}
              >
                <Ionicons 
                  name={getTabIcon(tab.type)} 
                  size={14} 
                  color={isActive ? AppColors.primary : '#666'} 
                />
                <Text
                  style={[styles.tabTitle, isActive && styles.tabTitleActive]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {tab.title}
                </Text>
                {tabs.length > 1 && (
                  <TouchableOpacity
                    onPress={(e) => handleRemoveTab(tab.id, e)}
                    style={styles.closeButton}
                  >
                    <Ionicons name="close" size={14} color="#666" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </ScrollView>
      
      <TouchableOpacity style={styles.addButton} onPress={handleAddTab}>
        <Ionicons name="add" size={18} color="#666" />
      </TouchableOpacity>

      <TabTypeSelector
        visible={showTabTypeSelector}
        onClose={() => setShowTabTypeSelector(false)}
        onSelectType={handleSelectTabType}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 50,
    right: 0,
    minHeight: 40,
    flexDirection: 'row',
    backgroundColor: '#0a0a0a',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    zIndex: 100,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  tabWrapper: {
    marginRight: 4,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'transparent',
    borderRadius: 6,
    gap: 6,
    minWidth: 120,
    maxWidth: 200,
  },
  tabActive: {
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
  },
  tabTitle: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    flex: 1,
  },
  tabTitleActive: {
    color: '#fff',
  },
  closeButton: {
    padding: 2,
  },
  addButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#1a1a1a',
  },
});
