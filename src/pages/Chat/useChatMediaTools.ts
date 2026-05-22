import { useCallback, useEffect, useState } from 'react';
import { Alert, Keyboard, Linking, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Easing, Extrapolate, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { removeGlassEffect } from '../../shared/components/NativeGlassView';

interface RecentPhoto {
  uri: string;
  originalUri?: string;
  id: string;
}

interface InputImage {
  uri: string;
  base64: string;
  type: string;
}

interface Params {
  screenHeight: number;
  sidebarTranslateX: { value: number };
  inputBarGlassId: string;
  hideSidebar?: () => void;
  showSidebar?: () => void;
  setForceHideToggle?: (hidden: boolean) => void;
  applyInputGlass: () => void;
  onTrackImageUpload: (source: string) => void;
  labels: {
    galleryPermissionTitle: string;
    galleryPermissionRequired: string;
    cancel: string;
    openSettings: string;
    maxImagesTitle: string;
    maxImagesMessage: string;
    maxImagesPartialMessage: (count: number) => string;
  };
}

export const useChatMediaTools = ({
  screenHeight,
  sidebarTranslateX,
  inputBarGlassId,
  hideSidebar,
  showSidebar,
  setForceHideToggle,
  applyInputGlass,
  onTrackImageUpload,
  labels,
}: Params) => {
  const [showToolsSheet, setShowToolsSheet] = useState(false);
  const toolsSheetAnim = useSharedValue(screenHeight);
  const [recentPhotos, setRecentPhotos] = useState<RecentPhoto[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [selectedInputImages, setSelectedInputImages] = useState<InputImage[]>([]);

  const loadRecentPhotos = useCallback(async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') return;

      const media = await MediaLibrary.getAssetsAsync({
        first: 4,
        mediaType: 'photo',
        sortBy: ['creationTime'],
      });

      const photosWithLocalUri = await Promise.all(
        media.assets.map(async (asset) => {
          const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
          return {
            uri: assetInfo.localUri || asset.uri,
            originalUri: asset.uri,
            id: asset.id,
          };
        }),
      );

      setRecentPhotos(photosWithLocalUri);
    } catch (error) {
      console.error('[ChatPage] Failed to load recent photos:', error);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { loadRecentPhotos(); }, 1500);
    return () => clearTimeout(timer);
  }, [loadRecentPhotos]);

  const toggleToolsSheet = useCallback(() => {
    if (showToolsSheet) {
      if (showSidebar) showSidebar();
      if (setForceHideToggle) setForceHideToggle(false);
      toolsSheetAnim.value = withTiming(screenHeight, {
        duration: 300,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      });
      setTimeout(() => {
        setShowToolsSheet(false);
        setSelectedPhotoIds(new Set());
        if (Platform.OS === 'ios') applyInputGlass();
      }, 300);
    } else {
      Keyboard.dismiss();
      if (hideSidebar) hideSidebar();
      if (setForceHideToggle) setForceHideToggle(true);
      if (Platform.OS === 'ios') removeGlassEffect(inputBarGlassId);
      setShowToolsSheet(true);
      toolsSheetAnim.value = withTiming(0, {
        duration: 280,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      });
      if (recentPhotos.length === 0) {
        setTimeout(() => loadRecentPhotos(), 280);
      }
    }
  }, [applyInputGlass, hideSidebar, inputBarGlassId, loadRecentPhotos, recentPhotos.length, screenHeight, setForceHideToggle, showSidebar, showToolsSheet, toolsSheetAnim]);

  const pickImageFromLibrary = useCallback(async () => {
    toggleToolsSheet();
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        labels.galleryPermissionTitle,
        labels.galleryPermissionRequired,
        [
          { text: labels.cancel, style: 'cancel' },
          { text: labels.openSettings, onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets) {
      const newImages = result.assets.map((asset) => ({
        uri: asset.uri,
        base64: asset.base64 ?? '',
        type: asset.mimeType ?? 'image/jpeg',
      }));
      setSelectedInputImages((prev) => [...prev, ...newImages].slice(0, 4));
    }
  }, [labels.cancel, labels.galleryPermissionRequired, labels.galleryPermissionTitle, labels.openSettings, toggleToolsSheet]);

  const sendSelectedPhotos = useCallback(async () => {
    if (selectedPhotoIds.size === 0) return;
    onTrackImageUpload('galleria');

    try {
      const chosenPhotos = recentPhotos.filter((photo) => selectedPhotoIds.has(photo.id));
      const photosWithBase64 = await Promise.all(
        chosenPhotos.map(async (photo) => {
          const sourceUri = photo.originalUri || photo.uri;
          const manipulatedImage = await ImageManipulator.manipulateAsync(
            sourceUri,
            [{ resize: { width: 512 } }],
            { compress: 0.2, format: ImageManipulator.SaveFormat.JPEG },
          );

          const base64 = await FileSystem.readAsStringAsync(manipulatedImage.uri, {
            encoding: 'base64',
          });

          await FileSystem.deleteAsync(manipulatedImage.uri, { idempotent: true });

          return {
            uri: String(photo.uri),
            base64: String(base64),
            type: 'image/jpeg',
          };
        }),
      );

      setSelectedInputImages((prev) => {
        const remainingSlots = 4 - prev.length;
        if (remainingSlots <= 0) {
          Alert.alert(labels.maxImagesTitle, labels.maxImagesMessage);
          return prev;
        }
        const imagesToAdd = photosWithBase64.slice(0, remainingSlots);
        if (photosWithBase64.length > remainingSlots) {
          Alert.alert(labels.maxImagesTitle, labels.maxImagesPartialMessage(remainingSlots));
        }
        return [...prev, ...imagesToAdd];
      });

      toggleToolsSheet();
    } catch (error) {
      console.error('[ChatPage] Error selecting photos:', error);
    }
  }, [labels.maxImagesMessage, labels.maxImagesPartialMessage, labels.maxImagesTitle, onTrackImageUpload, recentPhotos, selectedPhotoIds, toggleToolsSheet]);

  const toolsSheetStyle = useAnimatedStyle(() => {
    const sidebarLeft = interpolate(
      sidebarTranslateX.value,
      [-44, 0],
      [0, 44],
      Extrapolate.CLAMP,
    );

    return {
      transform: [{ translateY: toolsSheetAnim.value }],
      left: sidebarLeft,
      right: 0,
      bottom: 0,
      opacity: interpolate(toolsSheetAnim.value, [screenHeight, 0], [0, 1]),
    };
  });

  const toolsBackdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(toolsSheetAnim.value, [screenHeight, 0], [0, 1]),
    pointerEvents: showToolsSheet ? 'auto' : 'none',
  }));

  return {
    showToolsSheet,
    recentPhotos,
    selectedPhotoIds,
    selectedInputImages,
    setSelectedPhotoIds,
    setSelectedInputImages,
    toggleToolsSheet,
    pickImageFromLibrary,
    sendSelectedPhotos,
    toolsSheetStyle,
    toolsBackdropStyle,
  };
};
