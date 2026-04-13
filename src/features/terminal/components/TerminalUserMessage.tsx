import React from 'react';
import { View, Text, TouchableOpacity, Modal, Image, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { TerminalItem } from '../../../shared/types';

interface Props {
  item: TerminalItem;
  styles: any;
  t: (key: string) => string;
  messageRef: React.RefObject<View | null>;
  handleCopy: (text: string) => Promise<void>;
  setSelectedImageUri: (uri: string) => void;
  setImageViewerVisible: (visible: boolean) => void;
  showMessageMenu: boolean;
  setShowMessageMenu: (visible: boolean) => void;
  menuPosition: { top: number; right: number } | null;
  setMenuPosition: (position: { top: number; right: number } | null) => void;
}

export const TerminalUserMessage = ({
  item,
  styles,
  t,
  messageRef,
  handleCopy,
  setSelectedImageUri,
  setImageViewerVisible,
  showMessageMenu,
  setShowMessageMenu,
  menuPosition,
  setMenuPosition,
}: Props) => (
  <View style={styles.userMessageBlock}>
    <TouchableOpacity
      activeOpacity={0.8}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        messageRef.current?.measureInWindow((x, y, w, h) => {
          const screenH = Dimensions.get('window').height;
          const screenW = Dimensions.get('window').width;
          const menuHeight = 80;
          const spaceBelow = screenH - (y + h);
          const showBelow = y < menuHeight + 20 || spaceBelow > y;
          const top = showBelow ? y + h + 4 : y - menuHeight - 4;
          setMenuPosition({ top, right: screenW - (x + w) });
          setShowMessageMenu(true);
        });
      }}
      delayLongPress={300}
    >
      <View
        ref={messageRef}
        style={[
          styles.userMessageCard,
          (item.images?.length === 2 || item.images?.length === 4) && styles.userMessageCardWide,
        ]}
      >
        {item.images && item.images.length > 0 && (
          <View
            style={[
              styles.messageImagesContainer,
              item.images.length === 2 && styles.messageImagesContainerDouble,
              item.images.length === 4 && styles.messageImagesContainerQuad,
            ]}
          >
            {item.images.map((image, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => {
                  setSelectedImageUri(image.uri);
                  setImageViewerVisible(true);
                }}
                activeOpacity={0.8}
              >
                <Image
                  source={{ uri: image.uri }}
                  style={[
                    styles.messageImage,
                    item.images.length === 2 && styles.messageImageDouble,
                    item.images.length === 4 && styles.messageImageQuad,
                  ]}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ))}
          </View>
        )}
        <Text style={styles.userMessage}>{item.content || ''}</Text>
      </View>
    </TouchableOpacity>

    <Modal visible={showMessageMenu} transparent animationType="fade" onRequestClose={() => setShowMessageMenu(false)}>
      <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowMessageMenu(false)}>
        <BlurView
          intensity={50}
          tint="dark"
          style={[
            styles.menuCard,
            menuPosition ? { position: 'absolute', top: menuPosition.top, right: menuPosition.right } : {},
          ]}
        >
          <View style={styles.menuCardInner}>
            <Text style={styles.menuTime}>
              {item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
            </Text>
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                void handleCopy(item.content || '');
                setShowMessageMenu(false);
              }}
            >
              <Ionicons name="copy-outline" size={17} color="rgba(255,255,255,0.85)" />
              <Text style={styles.menuItemText}>{t('common:copy')}</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </TouchableOpacity>
    </Modal>
  </View>
);
