import React, { useState, useCallback, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import { Sidebar } from './Sidebar';
import { MultitaskingPanel } from './MultitaskingPanel';
import { VerticalCardSwitcher } from './VerticalCardSwitcher';
import { ContentRenderer } from './ContentRenderer';
import { TabBar } from './TabBar';
import { Tab } from '../../../core/tabs/tabStore';

type PanelType = 'files' | 'chat' | 'terminal' | 'multitasking' | 'vertical' | 'settings' | null;

interface Props {
  onOpenAllProjects?: () => void;
  children?: (tab: Tab, isCardMode: boolean, cardDimensions: { width: number, height: number }, animatedStyle?: any) => React.ReactNode;
}

export const VSCodeSidebar = ({ onOpenAllProjects, children }: Props) => {
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const trackpadScrollRef = useRef<((dy: number) => void) | null>(null);
  const scrollEndTimer = useRef<NodeJS.Timeout | null>(null);

  const togglePanel = useCallback((panel: PanelType) => {
    setActivePanel(prev => prev === panel ? null : panel);
  }, []);

  return (
    <>
      <View 
        style={styles.iconBar}
        onTouchStart={(e) => {
          const touch = e.nativeEvent;
          const timer = setTimeout(() => {
            setActivePanel('vertical');
          }, 500);
          e.currentTarget.dataset = { timer };
        }}
        onTouchEnd={(e) => {
          const timer = e.currentTarget.dataset?.timer;
          if (timer) clearTimeout(timer);
        }}
      >
        <TouchableOpacity 
          style={[styles.iconButton, activePanel === 'files' && styles.iconButtonActive]}
          onPress={() => togglePanel('files')}
        >
          <Ionicons name="folder" size={24} color={activePanel === 'files' ? AppColors.primary : '#888'} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.iconButton, activePanel === 'chat' && styles.iconButtonActive]}
          onPress={() => togglePanel('chat')}
        >
          <Ionicons name="chatbubbles" size={24} color={activePanel === 'chat' ? AppColors.primary : '#888'} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.iconButton, activePanel === 'terminal' && styles.iconButtonActive]}
          onPress={() => togglePanel('terminal')}
        >
          <Ionicons name="terminal" size={24} color={activePanel === 'terminal' ? AppColors.primary : '#888'} />
        </TouchableOpacity>

        <View style={styles.spacer} />

        <View 
          style={styles.trackpad}
          onTouchStart={(e) => {
            setActivePanel('vertical');
          }}
          onTouchMove={(e) => {
            const dy = e.nativeEvent.pageY;
            if (trackpadScrollRef.current) {
              trackpadScrollRef.current(dy);
            }
          }}
          onTouchEnd={() => {
            if (trackpadScrollRef.current) {
              trackpadScrollRef.current(-1); // Signal to snap
            }
            setTimeout(() => setActivePanel(null), 400);
          }}
        />

        <TouchableOpacity 
          style={[styles.iconButton, activePanel === 'multitasking' && styles.iconButtonActive]}
          onPress={() => togglePanel('multitasking')}
        >
          <Ionicons name="albums" size={24} color={activePanel === 'multitasking' ? AppColors.primary : '#888'} />
        </TouchableOpacity>

        <View style={styles.spacer} />

        <TouchableOpacity 
          style={[styles.iconButton, activePanel === 'settings' && styles.iconButtonActive]}
          onPress={() => togglePanel('settings')}
        >
          <Ionicons name="settings" size={24} color={activePanel === 'settings' ? AppColors.primary : '#888'} />
        </TouchableOpacity>
      </View>

      {activePanel === 'files' && (
        <Sidebar 
          onClose={() => setActivePanel(null)}
          onOpenAllProjects={onOpenAllProjects}
        />
      )}
      
      <TabBar isCardMode={activePanel === 'multitasking' || activePanel === 'vertical'} />
      
      {activePanel === 'vertical' ? (
        <VerticalCardSwitcher 
          onClose={() => setActivePanel(null)}
          onScrollRef={(ref) => trackpadScrollRef.current = ref}
          onScrollEnd={() => {
            if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
          }}
        >
          {(tab, isCardMode, cardDimensions) => children && children(tab, isCardMode, cardDimensions)}
        </VerticalCardSwitcher>
      ) : activePanel !== 'multitasking' ? (
        <ContentRenderer children={children} animatedStyle={{}} />
      ) : (
        <MultitaskingPanel onClose={() => togglePanel(null)}>
          {(tab, isCardMode, cardDimensions, animatedStyle) => children && children(tab, isCardMode, cardDimensions, animatedStyle)}
        </MultitaskingPanel>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  iconBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 50,
    backgroundColor: '#0a0a0a',
    borderRightWidth: 1,
    borderRightColor: '#1a1a1a',
    paddingTop: 60,
    paddingBottom: 20,
    zIndex: 1001,
  },
  iconButton: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
  },
  iconButtonActive: {
    borderLeftColor: AppColors.primary,
    backgroundColor: 'rgba(139, 124, 246, 0.1)',
  },
  spacer: {
    flex: 1,
  },
  trackpad: {
    width: 36,
    height: 160,
    marginHorizontal: 7,
    marginBottom: 12,
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.3)',
  },
});
