import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppColors } from '../theme/colors';
import { IconButton } from './atoms';
import * as ImagePicker from 'expo-image-picker';

export interface ChatImage {
  uri: string;
  type: string;
  base64?: string;
}

interface ChatInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: (images?: ChatImage[]) => void;
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
  const [selectedImages, setSelectedImages] = useState<ChatImage[]>([]);

  const handleToggleMode = (mode: 'terminal' | 'ai') => {
    if (onToggleMode) {
      onToggleMode(mode);
    }
  };

  const pickImage = async () => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        alert('È necessario il permesso per accedere alla galleria');
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: true,
        quality: 0.8,
        base64: true, // Get base64 for sending to API
      });

      if (!result.canceled && result.assets) {
        const newImages: ChatImage[] = result.assets.map(asset => ({
          uri: asset.uri,
          type: asset.type || 'image',
          base64: asset.base64,
        }));
        setSelectedImages(prev => [...prev, ...newImages]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = () => {
    if (selectedImages.length > 0 || value.trim()) {
      onSend(selectedImages.length > 0 ? selectedImages : undefined);
      setSelectedImages([]); // Clear images after sending
    }
  };

  const renderInputContent = () => (
    <>
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

      {/* Image Preview */}
      {selectedImages.length > 0 && (
        <View style={styles.imagePreviewContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imagePreviewScroll}>
            {selectedImages.map((image, index) => (
              <View key={index} style={styles.imagePreviewWrapper}>
                <Image source={{ uri: image.uri }} style={styles.imagePreview} />
                <TouchableOpacity
                  style={styles.imageRemoveButton}
                  onPress={() => removeImage(index)}
                >
                  <Ionicons name="close-circle" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
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

        {/* Image Picker Button */}
        <IconButton
          iconName="image-outline"
          size={24}
          color={selectedImages.length > 0 ? AppColors.primary : "#8A8A8A"}
          onPress={pickImage}
          style={styles.toolsButton}
        />

        {/* Input Field */}
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#6E7681"
          multiline
          maxLength={1000}
          onSubmitEditing={handleSend}
          keyboardAppearance="dark"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!disabled}
        />

        {/* Send Button */}
        <TouchableOpacity
          onPress={handleSend}
          disabled={(!value.trim() && selectedImages.length === 0) || disabled || isExecuting}
          style={styles.sendButton}
          activeOpacity={0.7}
        >
          <View style={[
            styles.sendButtonInner,
            (value.trim() || selectedImages.length > 0) && !disabled && !isExecuting && styles.sendButtonActive
          ]}>
            <Ionicons
              name="arrow-up"
              size={18}
              color={(value.trim() || selectedImages.length > 0) && !disabled && !isExecuting ? '#fff' : '#555'}
            />
          </View>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <View style={styles.floatingContainer}>
      {/* Outer glow effect */}
      <View style={styles.glowEffect} />

      <BlurView intensity={40} tint="dark" style={styles.blurWrapper}>
        <LinearGradient
          colors={['rgba(35, 35, 40, 0.95)', 'rgba(25, 25, 30, 0.98)']}
          style={styles.inputGradient}
        >
          {renderInputContent()}
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
    backgroundColor: 'transparent',
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
  imagePreviewContainer: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  imagePreviewScroll: {
    gap: 8,
  },
  imagePreviewWrapper: {
    position: 'relative',
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imageRemoveButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 10,
  },
});
