// Helper per creare colori con opacità
export const withOpacity = (color: string, opacity: number): string => {
  // Se è già rgba, sostituisci l'opacità
  if (color.startsWith('rgba')) {
    return color.replace(/[\d.]+\)$/, `${opacity})`);
  }
  // Converti hex a rgba
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

export const AppColors = {
  // Brand — Premium Violet
  primary: '#6D4CFF',
  primaryLight: '#7C5CFF',
  primaryDeep: '#5B3EE6',

  // Gradient backgrounds
  gradient: {
    dark: ['#07070B', '#0D0B14', '#1A1033', '#0A0A12'] as const,
    primary: ['#5B3EE6', '#7C5CFF'] as const,
  },

  // Light Mode
  light: {
    background: '#FFFFFF',
    backgroundAlt: '#F9FAFB',
    surface: '#FFFFFF',
    surfaceAlt: '#FAFAFC',
    surfaceVariant: '#F5F5F7',
    surfaceElevated: '#FFFFFF',
    titleText: '#1E1E1F',
    bodyText: '#6E6E73',
    bodyTextMuted: '#8E8E93',
    border: '#E5E5EA',
    borderSubtle: '#EFEFF4',
    shadow: 'rgba(0,0,0,0.04)',
    overlay: 'rgba(0, 0, 0, 0.2)',
    primary: '#6D4CFF',
    success: '#3FB950',
    warning: '#D29922',
    error: '#F85149',
    textPrimary: '#1E1E1F',
    textSecondary: '#6E6E73',
    textTertiary: '#8E8E93',
    backgroundDepth1: '#FFFFFF',
    backgroundDepth2: '#FFFFFF',
    backgroundDepth3: '#F5F5F7',
  },

  // Dark Mode — Premium
  dark: {
    background: '#07070B',
    backgroundAlt: '#0D0B14',
    surface: '#12111A',
    surfaceAlt: '#181622',
    surfaceVariant: '#1E1C28',
    surfaceElevated: '#15131D',
    titleText: '#F5F4FA',
    bodyText: '#A7A3B8',
    bodyTextMuted: '#7C788D',
    border: 'rgba(255,255,255,0.06)',
    borderSubtle: 'rgba(255,255,255,0.05)',
    shadow: 'rgba(0,0,0,0.3)',
    overlay: 'rgba(0, 0, 0, 0.5)',
    primary: '#6D4CFF',
    success: '#3FB950',
    warning: '#D29922',
    error: '#F85149',
    textPrimary: '#F5F4FA',
    textSecondary: '#A7A3B8',
    textTertiary: '#7C788D',
    backgroundDepth1: '#07070B',
    backgroundDepth2: '#12111A',
    backgroundDepth3: '#181622',
  },

  // White with opacity (for dark mode UI elements)
  white: {
    full: '#FFFFFF',
    w90: 'rgba(255,255,255,0.9)',
    w80: 'rgba(255,255,255,0.8)',
    w70: 'rgba(255,255,255,0.7)',
    w60: 'rgba(255,255,255,0.6)',
    w50: 'rgba(255,255,255,0.5)',
    w40: 'rgba(255,255,255,0.4)',
    w35: 'rgba(255,255,255,0.35)',
    w25: 'rgba(255,255,255,0.25)',
    w15: 'rgba(255,255,255,0.15)',
    w10: 'rgba(255,255,255,0.1)',
    w08: 'rgba(255,255,255,0.08)',
    w06: 'rgba(255,255,255,0.06)',
    w04: 'rgba(255,255,255,0.04)',
  },

  // Black with opacity
  black: {
    full: '#000000',
    b90: 'rgba(0,0,0,0.9)',
    b80: 'rgba(0,0,0,0.8)',
    b50: 'rgba(0,0,0,0.5)',
    b30: 'rgba(0,0,0,0.3)',
    b20: 'rgba(0,0,0,0.2)',
    b10: 'rgba(0,0,0,0.1)',
  },

  // Primary with opacity (for glows, badges, highlights)
  primaryAlpha: {
    a80: 'rgba(109, 76, 255, 0.8)',
    a60: 'rgba(109, 76, 255, 0.6)',
    a40: 'rgba(109, 76, 255, 0.4)',
    a22: 'rgba(124, 92, 255, 0.22)',
    a20: 'rgba(109, 76, 255, 0.2)',
    a25: 'rgba(109, 76, 255, 0.25)',
    a15: 'rgba(109, 76, 255, 0.15)',
    a14: 'rgba(124, 92, 255, 0.14)',
    a10: 'rgba(124, 92, 255, 0.10)',
    a08: 'rgba(109, 76, 255, 0.08)',
    a05: 'rgba(109, 76, 255, 0.05)',
  },

  // Badge / pill
  badge: {
    background: 'rgba(124,92,255,0.14)',
    text: '#CBBEFF',
    border: 'rgba(124,92,255,0.22)',
  },

  // Text hierarchy
  text: {
    primary: '#F5F4FA',
    secondary: '#A7A3B8',
    tertiary: '#7C788D',
    metadata: '#8E89A1',
  },

  // Icon hierarchy
  iconColors: {
    primary: '#F1F0F7',
    secondary: '#A7A3B8',
    accent: '#7C5CFF',
    muted: '#6F6A82',
  },

  // Terminal
  terminal: {
    background: '#000000',
    text: '#FFFFFF',
    green: '#00FF41',
    yellow: '#FFFF00',
    red: '#FF0051',
    blue: '#B0B0B0',
    magenta: '#FF00FF',
    cyan: '#E0E0E0',
  },

  // Status
  success: '#3FB950',
  warning: '#D29922',
  error: '#F85149',
  errorAlt: '#FF6B6B',
  info: '#6A6A6A',

  // Status with alpha
  errorAlpha: {
    a08: 'rgba(255, 107, 107, 0.08)',
    a15: 'rgba(255, 107, 107, 0.15)',
  },

  // Syntax Highlighting
  syntax: {
    keyword: '#FF7B72',
    string: '#A5D6FF',
    comment: '#8B949E',
    number: '#79C0FF',
    function: '#D2A8FF',
    class: '#FFA657',
    variable: '#FFA657',
  },

  // Language Colors (for project icons)
  languages: {
    react: '#61DAFB',
    javascript: '#F7DF1E',
    typescript: '#3178C6',
    python: '#3776AB',
    node: '#68A063',
    swift: '#FA7343',
    kotlin: '#7F52FF',
    default: '#7C5CFF',
  },

  // Icon colors (legacy)
  icon: {
    default: '#A7A3B8',
    active: '#7C5CFF',
    muted: '#6F6A82',
  },

  // Legacy aliases (for backwards compatibility)
  textPrimary: '#F5F4FA',
  textSecondary: '#A7A3B8',
  textTertiary: '#7C788D',
  accent: '#7C5CFF',
  purpleMedium: '#7C5CFF',
  purpleLight: '#CBBEFF',
  purpleDark: '#5B3EE6',

  // Old aliases — kept for compat, point to new values
  primaryTint: '#7C5CFF',
  primaryShade: '#5B3EE6',
};

// Simple colors export for navigation
export const colors = {
  primary: AppColors.primary,
  background: AppColors.dark.background,
  surface: AppColors.dark.surface,
  text: AppColors.dark.titleText,
  textSecondary: AppColors.dark.bodyText,
  border: AppColors.dark.border,
  success: AppColors.success,
  error: AppColors.error,
};

// Type for gradient arrays
export type GradientColors = readonly string[];
