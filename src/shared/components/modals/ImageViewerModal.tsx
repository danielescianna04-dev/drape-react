import React from 'react';
import { Modal, View, Image, TouchableOpacity, StyleSheet, Dimensions, StatusBar, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppColors } from '../../theme/colors';

interface ImageViewerModalProps {
  visible: boolean;
  imageUri: string;
  onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  visible,
  imageUri,
  onClose,
}) => {
  const renderContent = () => (
    <>
      {/* Close button */}
      <TouchableOpacity
        style={styles.closeButton}
        onPress={onClose}
        activeOpacity={0.7}
      >
        {isLiquidGlassSupported ? (
          <LiquidGlassView
            style={styles.closeButtonGlass}
            interactive={true}
            effect="clear"
            colorScheme="dark"
          >
            <Ionicons name="close" size={24} color="#fff" />
          </LiquidGlassView>
        ) : (
          <View style={styles.closeButtonInner}>
            <Ionicons name="close" size={24} color="#fff" />
          </View>
        )}
      </TouchableOpacity>

      {/* Image */}
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          resizeMode="contain"
        />
      </View>

      {/* Tap anywhere to close */}
      <TouchableOpacity
        style={styles.tapArea}
        onPress={onClose}
        activeOpacity={1}
      />
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" />

      {isLiquidGlassSupported ? (
        <LiquidGlassView
          style={styles.backdropGlass}
          interactive={true}
          effect="clear"
          colorScheme="dark"
        >
          {renderContent()}
        </LiquidGlassView>
      ) : (
        <BlurView intensity={80} tint="dark" style={styles.backdrop}>
          {renderContent()}
        </BlurView>
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdropGlass: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: 20,
    zIndex: 10,
  },
  closeButtonInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonGlass: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  imageContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  image: {
    width: '100%',
    height: '100%',
    maxWidth: SCREEN_WIDTH - 40,
    maxHeight: SCREEN_HEIGHT - 40,
  },
  tapArea: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
  },
});
