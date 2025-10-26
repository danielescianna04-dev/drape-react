import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import { Sidebar } from './Sidebar';
import { MultitaskingPanel } from './MultitaskingPanel';

type PanelType = 'files' | 'chat' | 'terminal' | 'multitasking' | 'settings' | null;

interface Props {
  onOpenAllProjects?: () => void;
  children?: React.ReactNode;
}

export const VSCodeSidebar = ({ onOpenAllProjects, children }: Props) => {
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const togglePanel = (panel: PanelType) => {
    if (panel === 'multitasking' && activePanel !== 'multitasking') {
      // Open panel immediately and animate scale down
      setActivePanel(panel);
      Animated.spring(scaleAnim, {
        toValue: 0.75,
        useNativeDriver: true,
        tension: 50,
        friction: 10,
      }).start();
    } else if (activePanel === 'multitasking' && panel !== 'multitasking') {
      // Animate scale up and close panel
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 10,
      }).start(() => {
        setActivePanel(panel);
      });
    } else {
      setActivePanel(activePanel === panel ? null : panel);
    }
  };

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
      
      {activePanel !== 'multitasking' && (
        <Animated.View style={{ flex: 1, transform: [{ scale: scaleAnim }] }}>
          {children}
        </Animated.View>
      )}
      
      {activePanel === 'multitasking' && (
        <MultitaskingPanel
          onClose={() => togglePanel(null)}
        >
          <Animated.View style={{ flex: 1, transform: [{ scale: scaleAnim }] }}>
            {children}
          </Animated.View>
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
