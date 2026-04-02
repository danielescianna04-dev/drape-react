import React from 'react';
import { Modal, View, Image, TouchableOpacity, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  visible: boolean;
  screenshotBase64: string;
  title?: string;
  onClose: () => void;
}

export const ScreenshotModal = ({ visible, screenshotBase64, title, onClose }: Props) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <View style={styles.header}>
        {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : <View />}
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
      <Image
        source={{ uri: `data:image/png;base64,${screenshotBase64}` }}
        style={styles.image}
        resizeMode="contain"
      />
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
  },
  title: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    marginRight: 16,
  },
  image: {
    flex: 1,
    width: SCREEN_WIDTH,
    marginBottom: 40,
  },
});
