/**
 * Design tokens from Drape app — keeps video consistent with the real product.
 */
export const Colors = {
  // Brand
  primary: "#9B8AFF",
  primaryTint: "#BEB4FF",
  primaryShade: "#7A6AD9",
  primaryDeep: "#6B5CE7",

  // Dark surfaces
  bg: "#090A0B",
  bgAlt: "#0a0a0a",
  surface: "#1C1C1E",
  surfaceAlt: "#1A1A1C",
  surfaceVariant: "#2C2C2E",
  surfaceElevated: "#121212",

  // Text
  titleText: "#EDEDED",
  bodyText: "#9CA3AF",
  mutedText: "rgba(255,255,255,0.45)",

  // Borders / overlays
  border: "#2C2C2E",
  borderLight: "rgba(255,255,255,0.08)",
  overlay: "rgba(0,0,0,0.7)",

  // Syntax highlighting (for code scenes)
  syntax: {
    keyword: "#FF7B72",
    string: "#A5D6FF",
    comment: "#8B949E",
    number: "#79C0FF",
    function: "#D2A8FF",
    class: "#FFA657",
    variable: "#FFA657",
    plain: "#E6EDF3",
  },

  // Terminal
  termGreen: "#00FF41",

  // Status
  success: "#3FB950",

  // Utility
  white: "#FFFFFF",
  black: "#000000",
} as const;

/** Gradient stops matching app's primary gradient */
export const primaryGradient = ["#C4B8FF", "#9B8AFF", "#6B5CE7"] as const;
