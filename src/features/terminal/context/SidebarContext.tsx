import React, { createContext, useContext } from 'react';
import { SharedValue, makeMutable } from 'react-native-reanimated';

interface SidebarContextType {
  sidebarTranslateX: SharedValue<number>;
  isSidebarHidden: boolean;
  hideSidebar?: () => void;
  showSidebar?: () => void;
  forceHideToggle?: boolean;
  setForceHideToggle?: (hidden: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | null>(null);

export const SidebarProvider = SidebarContext.Provider;

// Create a static default value outside of the component
const defaultSidebarValue = makeMutable(0);

export const useSidebarOffset = () => {
  const context = useContext(SidebarContext);

  if (!context) {
    return {
      sidebarTranslateX: defaultSidebarValue,
      isSidebarHidden: false,
      hideSidebar: () => { },
      showSidebar: () => { },
      forceHideToggle: false,
      setForceHideToggle: () => { }
    };
  }
  return context;
};
