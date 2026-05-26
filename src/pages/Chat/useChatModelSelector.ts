import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { applyGlassEffect, removeGlassEffect } from '../../shared/components/NativeGlassView';
import { AI_MODELS } from './ChatInputBar';

export const useChatModelSelector = (
  selectedModel: string,
  setSelectedModel: (id: string) => void,
) => {
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showContextInfo, setShowContextInfo] = useState(false);
  const dropdownAnim = useSharedValue(0);

  const dropdownAnimatedStyle = useAnimatedStyle(() => ({
    opacity: dropdownAnim.value,
    transform: [
      { translateY: interpolate(dropdownAnim.value, [0, 1], [8, 0]) },
      { scale: interpolate(dropdownAnim.value, [0, 1], [0.97, 1]) },
    ] as any,
  })) as any;

  const toggleModelSelector = useCallback(() => {
    if (showModelSelector) {
      dropdownAnim.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.cubic) });
      setTimeout(() => setShowModelSelector(false), 150);
    } else {
      setShowModelSelector(true);
      dropdownAnim.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
    }
  }, [dropdownAnim, showModelSelector]);

  const closeDropdown = useCallback(() => {
    dropdownAnim.value = withTiming(0, { duration: 150 });
    setTimeout(() => setShowModelSelector(false), 150);
  }, [dropdownAnim]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !showModelSelector) return;
    const timer = setTimeout(() => applyGlassEffect('modelDropdownGlass', 16), 100);
    return () => {
      clearTimeout(timer);
      removeGlassEffect('modelDropdownGlass');
    };
  }, [showModelSelector]);

  useEffect(() => {
    if (AI_MODELS.some((item) => item.id === selectedModel)) return;
    setSelectedModel(AI_MODELS[0].id);
  }, [selectedModel, setSelectedModel]);

  const currentModelName = useMemo(() => {
    const model = AI_MODELS.find((item) => item.id === selectedModel);
    return model?.name || AI_MODELS[0].name;
  }, [selectedModel]);

  return {
    showModelSelector,
    showContextInfo,
    setShowContextInfo,
    dropdownAnimatedStyle,
    toggleModelSelector,
    closeDropdown,
    currentModelName,
  };
};
