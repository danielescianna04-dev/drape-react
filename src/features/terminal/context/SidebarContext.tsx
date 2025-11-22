import React, { createContext, useContext } from 'react';
import { SharedValue, useSharedValue, makeMutable } from 'react-native-reanimated';

interface SidebarContextType {
  sidebarTranslateX: SharedValue<number>;
}

const SidebarContext = createContext<SidebarContextType | null>(null);

export const SidebarProvider = SidebarContext.Provider;

// Create a static default value outside of the component
const defaultSidebarValue = makeMutable(0);

export const useSidebarOffset = () => {
  const context = useContext(SidebarContext);

  if (!context) {
    return { sidebarTranslateX: defaultSidebarValue };
  }
  return context;
};
