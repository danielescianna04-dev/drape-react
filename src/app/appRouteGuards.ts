export const shouldShowNativeLoadingRoute = ({
  isInitialized,
  consentLoaded,
}: {
  isInitialized: boolean;
  consentLoaded: boolean;
}) => !isInitialized || !consentLoaded;

export const shouldShowAuthRoute = ({
  hasUser,
}: {
  hasUser: boolean;
}) => !hasUser;
