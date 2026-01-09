import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { AppColors } from '../theme/colors';
import { IconButton } from './atoms';

interface ChatInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  placeholder?: string;
  disabled?: boolean;
  showTopBar?: boolean;
  modelName?: string;
  onModelPress?: () => void;
  isExecuting?: boolean;
  // Mode toggle props
  isTerminalMode?: boolean;
  onToggleMode?: (mode: 'terminal' | 'ai') => void;
  forcedMode?: 'terminal' | 'ai' | null;
  // Left accessory button (e.g., for inspect mode)
  leftAccessory?: {
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    isActive?: boolean;
  };
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChangeText,
  onSend,
  placeholder = 'Scrivi un messaggio...',
  disabled = false,
  showTopBar = true,
  modelName = 'Llama 3.1 8B',
  onModelPress,
  isExecuting = false,
  isTerminalMode = false,
  onToggleMode,
  forcedMode = null,
  leftAccessory,
}) => {
  const handleToggleMode = (mode: 'terminal' | 'ai') => {
    if (onToggleMode) {
      onToggleMode(mode);
    }
  };

  return (
    <View style={styles.floatingContainer}>
      {/* Outer glow effect */}
      <View style={styles.glowEffect} />

      <BlurView intensity={40} tint="dark" style={styles.blurWrapper}>
        <LinearGradient
          colors={['rgba(35, 35, 40, 0.95)', 'rgba(25, 25, 30, 0.98)']}
          style={styles.inputGradient}
        >
          {/* Top Controls */}
          {showTopBar && (
            <View style={styles.topControls}>
              {/* Mode Toggle */}
              <View style={styles.modeToggleContainer}>
                <View style={styles.modeToggle}>
                  <TouchableOpacity
                    onPress={() => handleToggleMode('terminal')}
                    style={[
                      styles.modeButton,
                      isTerminalMode && styles.modeButtonActive,
                      forcedMode === 'terminal' && styles.modeButtonForced
                    ]}
                  >
                    <Ionicons
                      name="code-slash"
                      size={14}
                      color={isTerminalMode ? '#fff' : '#8A8A8A'}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleToggleMode('ai')}
                    style={[
                      styles.modeButton,
                      !isTerminalMode && styles.modeButtonActive,
                      forcedMode === 'ai' && styles.modeButtonForced
                    ]}
                  >
                    <Ionicons
                      name="sparkles"
                      size={14}
                      color={!isTerminalMode ? '#fff' : '#8A8A8A'}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Model Selector */}
              <TouchableOpacity style={styles.modelSelector} onPress={onModelPress}>
                <Text style={styles.modelText}>{modelName}</Text>
                <Ionicons name="chevron-down" size={12} color="#666" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.toolsButton}>
                <Ionicons name="add" size={24} color="#8A8A8A" />
              </TouchableOpacity>
            </View>
          )}

          {/* Main Input Row */}
          <View style={styles.mainInputRow}>
            {/* Left Accessory Button (e.g., inspect mode) */}
            {leftAccessory && (
              <View style={[styles.accessoryButton, leftAccessory.isActive && styles.accessoryButtonActive]}>
                <IconButton
                  iconName={leftAccessory.icon}
                  size={22}
                  color="#8A8A8A"
                  onPress={leftAccessory.onPress}
                  isActive={leftAccessory.isActive}
                  activeColor={AppColors.primary}
                  style={styles.iconButtonOverride}
                />
              </View>
            )}

            {/* Tools Button - only show when showTopBar is true */}
            {showTopBar && (
              <IconButton
                iconName="add"
                size={24}
                color="#8A8A8A"
                onPress={() => { }}
                style={styles.toolsButton}
              />
            )}

            {/* Input Field */}
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={onChangeText}
              placeholder={placeholder}
              placeholderTextColor="#6E7681"
              multiline
              maxLength={1000}
              onSubmitEditing={onSend}
              keyboardAppearance="dark"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!disabled}
            />

            {/* Send Button */}
            <TouchableOpacity
              onPress={onSend}
              disabled={!value.trim() || disabled || isExecuting}
              style={styles.sendButton}
              activeOpacity={0.7}
            >
              <View style={[
                styles.sendButtonInner,
                value.trim() && !disabled && !isExecuting && styles.sendButtonActive
              ]}>
                <Ionicons
                  name="arrow-up"
                  size={18}
                  color={value.trim() && !disabled && !isExecuting ? '#fff' : '#555'}
                />
              </View>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </BlurView>
    </View>
  );
};

const styles = StyleSheet.create({
  floatingContainer: {
    marginHorizontal: 16,
    marginBottom: Platform.OS === 'ios' ? 20 : 16,
    position: 'relative',
  },
  glowEffect: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: -4,
    borderRadius: 28,
    backgroundColor: 'rgba(139, 124, 246, 0.08)',
    ...Platform.select({
      ios: {
        shadowColor: AppColors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  blurWrapper: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  inputGradient: {
    borderRadius: 24,
    justifyContent: 'flex-end',
    maxHeight: 250,
  },
  topControls: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  modeToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    padding: 2,
  },
  modeButton: {
    width: 28,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  modeButtonActive: {
    backgroundColor: 'rgba(139, 124, 246, 0.2)',
  },
  modeButtonForced: {
    borderWidth: 1,
    borderColor: '#8B7CF6',
  },
  modelSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#1a1a1a',
    gap: 4,
  },
  modelText: {
    fontSize: 10,
    color: '#888',
    fontWeight: '500',
  },
  mainInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  accessoryButton: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  accessoryButtonActive: {
    backgroundColor: 'rgba(139, 124, 246, 0.3)',
    borderColor: 'rgba(139, 124, 246, 0.6)',
    borderWidth: 1.5,
  },
  iconButtonOverride: {
    width: 'auto',
    height: 'auto',
  },
  toolsButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  sendButtonActive: {
    backgroundColor: AppColors.primary,
    borderColor: 'transparent',
    ...Platform.select({
      ios: {
        shadowColor: AppColors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#F0F0F0',
    fontFamily: 'monospace',
    paddingHorizontal: 16,
    paddingVertical: 14,
    maxHeight: 150, // Altezza massima del campo di input
    lineHeight: 20,
    textAlignVertical: 'top', // Allinea il testo in alto nel campo
  },
});
