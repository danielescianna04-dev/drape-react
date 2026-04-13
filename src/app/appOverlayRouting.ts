export const resolveOverlayCloseScreen = <T extends string>(
  previousScreen: T | null | undefined,
  fallback: T,
): T => previousScreen || fallback;
