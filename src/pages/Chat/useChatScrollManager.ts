import { useCallback, useRef, useState } from 'react';
import type { FlatList } from 'react-native';

export const useChatScrollManager = () => {
  const scrollViewRef = useRef<FlatList>(null);
  const contentHeightRef = useRef(0);
  const layoutHeightRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const scrollLockUntilRef = useRef(0);
  const isUserScrollActiveRef = useRef(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const setNearBottomState = useCallback((nearBottom: boolean) => {
    isNearBottomRef.current = nearBottom;
    setShowScrollToBottom((prev) => {
      const next = !nearBottom;
      return prev === next ? prev : next;
    });
  }, []);

  const scrollToBottom = useCallback((animated = true) => {
    setNearBottomState(true);
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd?.({ animated });
      const offset = contentHeightRef.current - layoutHeightRef.current;
      if (offset > 0) {
        scrollViewRef.current?.scrollToOffset({ offset, animated });
      }
    });
  }, [setNearBottomState]);

  return {
    scrollViewRef,
    contentHeightRef,
    layoutHeightRef,
    isNearBottomRef,
    scrollLockUntilRef,
    isUserScrollActiveRef,
    showScrollToBottom,
    setNearBottomState,
    scrollToBottom,
  };
};
