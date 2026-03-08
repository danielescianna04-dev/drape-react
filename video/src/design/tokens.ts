/**
 * Shared layout and typography tokens for Remotion scenes.
 */

export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const FPS = 30;

/** Duration helpers (in frames at 30fps) */
export const sec = (s: number) => Math.round(s * FPS);

/** Shared font stack — Inter loaded via Google Fonts in Remotion */
export const fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";

export const fontSize = {
  hero: 64,
  title: 48,
  subtitle: 32,
  body: 24,
  caption: 18,
  code: 20,
} as const;

export const spacing = {
  xs: 8,
  sm: 16,
  md: 24,
  lg: 40,
  xl: 64,
  xxl: 96,
} as const;

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;
