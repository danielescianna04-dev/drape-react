import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import { Sidebar } from './Sidebar';
import { MultitaskingPanel } from './MultitaskingPanel';
import { ContentRenderer } from './ContentRenderer';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type PanelType = 'files' | 'chat' | 'terminal' | 'multitasking' | 'settings' | null;

interface Props {
  onOpenAllProjects?: () => void;
  children?: (isCardMode: boolean, cardDimensions: { width: number, height: number }) => React.ReactNode;
}

export const VSCodeSidebar = ({ onOpenAllProjects, children }: Props) => {
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const scaleAnim = useSharedValue(1);

  const togglePanel = (panel: PanelType) => {
    if (panel === 'multitasking') {
      if (activePanel === 'multitasking') {
        // If multitasking is active and the multitasking button is pressed again, close it
        setActivePanel(null);
      } else {
        // If multitasking is not active and the multitasking button is pressed, open it
        setActivePanel('multitasking');
      }
    } else {
      // Handle other panels (files, chat, terminal, settings)
      setActivePanel(activePanel === panel ? null : panel);
    }
  };

  // Effect to handle scale animation based on activePanel
  useEffect(() => {
    if (activePanel === 'multitasking') {
      scaleAnim.value = withSpring(0.75, { tension: 10, friction: 20 });
    } else {
      scaleAnim.value = withSpring(1, { tension: 10, friction: 20 });
    }
  }, [activePanel]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scaleAnim.value }],
    };
  });

  return (
    <>
      {/* Icon Bar - Always visible */}
      <View style={styles.iconBar}>
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

      {/* Sliding Panel */}
      {activePanel === 'files' && (
        <Sidebar 
          onClose={() => setActivePanel(null)}
          onOpenAllProjects={onOpenAllProjects}
        />
      )}
      
      {activePanel !== 'multitasking' ? (
        <ContentRenderer
          children={children}
          scaleAnim={animatedStyle}
        />
      ) : (
        <MultitaskingPanel
          onClose={() => togglePanel(null)}
        >
          {({ isCardMode, cardDimensions }) => children && children(isCardMode, cardDimensions)}
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
});
