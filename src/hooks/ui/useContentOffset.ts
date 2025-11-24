import { useAnimatedStyle } from 'react-native-reanimated';
import { useSidebarOffset } from '../../features/terminal/context/SidebarContext';

/**
 * Hook that provides animated style to offset content when sidebar collapses
 *
 * When sidebar is hidden, content shifts left by half the sidebar width (25px)
 * to keep it visually centered on screen
 *
 * @returns Animated style with translateX transformation
 *
 * @example
 * const contentOffset = useContentOffset();
 * <Animated.View style={[styles.container, contentOffset]}>
 */
export const useContentOffset = () => {
  const { sidebarTranslateX } = useSidebarOffset();

  return useAnimatedStyle(() => ({
    transform: [{ translateX: sidebarTranslateX.value / 2 }],
  }));
};
