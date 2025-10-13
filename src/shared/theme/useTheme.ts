import { AppColors } from './colors';

export const useTheme = () => {
  // Always dark mode
  const isDark = true;
  
  return {
    colors: {
      primary: AppColors.primary,
      primaryTint: AppColors.primaryTint,
      primaryShade: AppColors.primaryShade,
      success: AppColors.success,
      warning: AppColors.warning,
      error: AppColors.error,
      info: AppColors.info,
      terminal: AppColors.terminal,
      syntax: AppColors.syntax,
      ...AppColors.dark,
    },
    isDark,
  };
};
