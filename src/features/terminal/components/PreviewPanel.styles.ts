import { StyleSheet } from 'react-native';

export const previewStyles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 999,
  },
  container: {
    position: 'absolute',
    right: 0, top: 0, bottom: 0,
    zIndex: 1000,
    overflow: 'hidden',
  },
  webViewContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#0a0a0a',
    paddingTop: 88,
  },
  reloadBanner: {
    position: 'absolute',
    top: 8,
    left: 16,
    right: 16,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(99, 102, 241, 0.95)',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  reloadBannerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
