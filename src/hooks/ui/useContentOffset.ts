import { useSidebarOffset } from '../../features/terminal/context/SidebarContext';

/**
 * Hook that provides paddingLeft based on sidebar state
 *
 * When sidebar is open, content has paddingLeft to not overlap (44px)
 * When sidebar is closed, paddingLeft is 0 so content fills screen
 *
 * The change is instant (no animation) - the sidebar's own animation
 * provides visual feedback for the transition.
 *
 * @returns Style object with paddingLeft
 */
export const useContentOffset = () => {
  const { isSidebarHidden } = useSidebarOffset();

  return {
    paddingLeft: isSidebarHidden ? 0 : 44,
  };
};
