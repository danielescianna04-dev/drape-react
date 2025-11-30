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
  // Brand - Soft Violet
  primary: '#9B8AFF',
  primaryTint: '#BEB4FF',
  primaryShade: '#7A6AD9',

  // Gradient backgrounds
  gradient: {
    dark: ['#0a0a0a', '#121212', '#1a1a1a', '#0f0f0f'] as const,
    primary: ['#9B8AFF', '#7A6AD9'] as const,
  },

  // Light Mode
  light: {
    background: '#FFFFFF',
    backgroundAlt: '#F9FAFB',
    surface: '#FFFFFF',
    surfaceVariant: '#F5F5F7',
    titleText: '#1E1E1F',
    bodyText: '#6E6E73',
    border: '#E5E5EA',
    shadow: 'rgba(0,0,0,0.04)',
  },

  // Dark Mode
  dark: {
    background: '#090A0B',
    backgroundAlt: '#0a0a0a',
    surface: '#1C1C1E',
    surfaceAlt: '#1A1A1C',
    surfaceVariant: '#2C2C2E',
    surfaceElevated: '#121212',
    titleText: '#EDEDED',
    bodyText: '#9CA3AF',
    border: '#2C2C2E',
    shadow: 'rgba(0,0,0,0.3)',
    overlay: 'rgba(0, 0, 0, 0.5)',
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

  // Primary with opacity (for glows, highlights)
  primaryAlpha: {
    a80: 'rgba(155, 138, 255, 0.8)',
    a60: 'rgba(155, 138, 255, 0.6)',
    a40: 'rgba(155, 138, 255, 0.4)',
    a20: 'rgba(155, 138, 255, 0.2)',
    a15: 'rgba(155, 138, 255, 0.15)',
    a10: 'rgba(155, 138, 255, 0.1)',
    a08: 'rgba(155, 138, 255, 0.08)',
    a05: 'rgba(155, 138, 255, 0.05)',
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
    default: '#9B8AFF',
  },

  // Icon colors
  icon: {
    default: '#888888',
    active: '#9B8AFF',
    muted: '#666666',
  },

  // Legacy aliases (for backwards compatibility)
  textPrimary: '#EDEDED',
  textSecondary: '#9CA3AF',
  textTertiary: '#6E7681',
  accent: '#9B8AFF',
  purpleMedium: '#9B8AFF',
  purpleLight: '#BEB4FF',
  purpleDark: '#7A6AD9',
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
