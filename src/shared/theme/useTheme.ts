import { useColorScheme } from 'react-native';
import { AppColors, withOpacity } from './colors';

export type ThemeMode = 'light' | 'dark' | 'auto';

export const useTheme = (mode: ThemeMode = 'auto') => {
  const systemColorScheme = useColorScheme();

  const isDark = mode === 'auto'
    ? systemColorScheme === 'dark'
    : mode === 'dark';

  const palette = isDark ? AppColors.dark : AppColors.light;
  const textPrimary = isDark ? AppColors.textPrimary : AppColors.light.titleText;
  const textSecondary = isDark ? AppColors.textSecondary : AppColors.light.bodyText;
  const textTertiary = isDark ? AppColors.textTertiary : withOpacity(AppColors.light.bodyText, 0.7);

  return {
    isDark,
    colors: {
      ...palette,
      primary: AppColors.primary,
      accent: AppColors.accent,
      primaryTint: AppColors.primaryTint,
      primaryShade: AppColors.primaryShade,
      success: AppColors.success,
      warning: AppColors.warning,
      error: AppColors.error,
      info: AppColors.info,
      textPrimary,
      textSecondary,
      textTertiary,
      backgroundDepth1: palette.background,
      backgroundDepth2: palette.surface,
      backgroundDepth3: isDark ? AppColors.dark.surfaceAlt : AppColors.light.surfaceVariant,
      borderSubtle: palette.borderSubtle,
      overlay: palette.overlay,
      terminal: AppColors.terminal,
      syntax: AppColors.syntax,
    },
  };
};
