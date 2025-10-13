import { useColorScheme } from 'react-native';
import { AppColors } from './colors';

export type ThemeMode = 'light' | 'dark' | 'auto';

export const useTheme = (mode: ThemeMode = 'auto') => {
  const systemColorScheme = useColorScheme();
  
  const isDark = mode === 'auto' 
    ? systemColorScheme === 'dark'
    : mode === 'dark';
  
  const colors = isDark ? AppColors.dark : AppColors.light;
  
  return {
    isDark,
    colors: {
      ...colors,
      // Brand colors (invariati)
      primary: AppColors.primary,
      primaryTint: AppColors.primaryTint,
      primaryShade: AppColors.primaryShade,
      // Status colors
      success: AppColors.success,
      warning: AppColors.warning,
      error: AppColors.error,
      info: AppColors.info,
      // Terminal colors
      terminal: AppColors.terminal,
      syntax: AppColors.syntax,
    },
  };
};
