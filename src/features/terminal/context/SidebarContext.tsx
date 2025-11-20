import React, { createContext, useContext } from 'react';
import { SharedValue } from 'react-native-reanimated';

interface SidebarContextType {
  sidebarTranslateX: SharedValue<number>;
}

const SidebarContext = createContext<SidebarContextType | null>(null);

export const SidebarProvider = SidebarContext.Provider;

export const useSidebarOffset = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebarOffset must be used within SidebarProvider');
  }
  return context;
};
