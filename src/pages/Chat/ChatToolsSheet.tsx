import React from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';

interface RecentPhoto {
  id: string;
  uri: string;
}

interface ChatToolsSheetProps {
  styles: any;
  visible: boolean;
  toolsBackdropStyle: any;
  toolsSheetStyle: any;
  recentPhotos: RecentPhoto[];
  selectedPhotoIds: Set<string>;
  selectedInputImagesCount: number;
  onToggleSheet: () => void;
  onTogglePhoto: (photoId: string) => void;
  onSendSelectedPhotos: () => void;
  onPickImageFromLibrary: () => void;
  labels: {
    allPhotos: string;
    maxImagesTitle: string;
    maxImagesMessage: string;
    selectPhotos: string;
    selectPhotosPlural: string;
    photoPickerTitle: string;
    photoPickerSubtitle: string;
  };
}

export const ChatToolsSheet: React.FC<ChatToolsSheetProps> = ({
  styles,
  visible,
  toolsBackdropStyle,
  toolsSheetStyle,
  recentPhotos,
  selectedPhotoIds,
  selectedInputImagesCount,
  onToggleSheet,
  onTogglePhoto,
  onSendSelectedPhotos,
  onPickImageFromLibrary,
  labels,
}) => (
  <>
    {visible && (
      <Pressable style={StyleSheet.absoluteFill} onPress={onToggleSheet}>
        <Animated.View style={[styles.sheetBackdrop, toolsBackdropStyle]} />
      </Pressable>
    )}
    <Animated.View style={[styles.toolsSheet, toolsSheetStyle]}>
      <BlurView intensity={90} tint="dark" style={styles.sheetBlur}>
        <LinearGradient
          colors={['rgba(30, 30, 35, 0.4)', 'rgba(15, 15, 20, 0.6)']}
          style={styles.sheetGradient}
        >
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetHeaderTitle}>Drape</Text>
            <TouchableOpacity onPress={() => {}}>
              <Text style={styles.sheetHeaderAction}>{labels.allPhotos}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.galleryContainer}
          >
            <TouchableOpacity style={styles.cameraCard}>
              <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
              <Ionicons name="camera-outline" size={20} color="#fff" />
            </TouchableOpacity>
            {recentPhotos.map((photo) => (
              <TouchableOpacity
                key={photo.id}
                style={styles.galleryCard}
                activeOpacity={0.7}
                onPress={() => {
                  if (!selectedPhotoIds.has(photo.id) && selectedInputImagesCount + selectedPhotoIds.size >= 4) {
                    Alert.alert(labels.maxImagesTitle, labels.maxImagesMessage);
                    return;
                  }
                  onTogglePhoto(photo.id);
                }}
              >
                <Image source={{ uri: photo.uri }} style={styles.galleryImage} />
                <View style={[
                  styles.gallerySelectCircle,
                  selectedPhotoIds.has(photo.id) && styles.gallerySelectCircleActive,
                ]} />
              </TouchableOpacity>
            ))}
          </ScrollView>

          {selectedPhotoIds.size > 0 && (
            <View style={styles.sendPhotosButtonContainer}>
              <TouchableOpacity style={styles.sendPhotosButton} onPress={onSendSelectedPhotos} activeOpacity={0.7}>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={styles.sendPhotosButtonText}>
                  {selectedPhotoIds.size === 1
                    ? labels.selectPhotos
                    : labels.selectPhotosPlural}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.sheetDivider} />

          <View style={styles.toolsList}>
            <TouchableOpacity style={styles.toolItem} activeOpacity={0.7} onPress={onPickImageFromLibrary}>
              <View style={styles.toolIconContainer}>
                <Ionicons name="images-outline" size={20} color="rgba(255,255,255,0.8)" />
              </View>
              <View style={styles.toolTextContainer}>
                <Text style={styles.toolTitle}>{labels.photoPickerTitle}</Text>
                <Text style={styles.toolSubtitle}>{labels.photoPickerSubtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </BlurView>
    </Animated.View>
  </>
);
