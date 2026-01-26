import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { WebView } from 'react-native-webview';
import { AppColors } from '../../../../shared/theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  tab: any;
}

export const BrowserView = ({ tab }: Props) => {
  const [url, setUrl] = useState('https://www.google.com');
  const insets = useSafeAreaInsets();
  const [currentUrl, setCurrentUrl] = useState('https://www.google.com');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(false);
  const webViewRef = useRef<WebView>(null);

  const handleNavigate = () => {
    let finalUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      finalUrl = `https://${url}`;
    }
    setCurrentUrl(finalUrl);
    setUrl(finalUrl);
  };

  const handleBack = () => {
    webViewRef.current?.goBack();
  };

  const handleForward = () => {
    webViewRef.current?.goForward();
  };

  const handleRefresh = () => {
    webViewRef.current?.reload();
  };

  const quickLinks = [
    { name: 'Google', url: 'https://www.google.com', icon: 'search' },
    { name: 'GitHub', url: 'https://github.com', icon: 'logo-github' },
    { name: 'Stack Overflow', url: 'https://stackoverflow.com', icon: 'code-slash' },
    { name: 'MDN', url: 'https://developer.mozilla.org', icon: 'book' },
  ];

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.navigationButtons}>
        {['arrow-back', 'arrow-forward', 'refresh'].map((icon, idx) => {
          const disabled = (icon === 'arrow-back' && !canGoBack) || (icon === 'arrow-forward' && !canGoForward);
          const onPress = icon === 'arrow-back' ? handleBack : icon === 'arrow-forward' ? handleForward : handleRefresh;

          const btnContent = (
            <View style={styles.navButtonInner}>
              <Ionicons
                name={icon as any}
                size={20}
                color={disabled ? 'rgba(255, 255, 255, 0.2)' : '#FFFFFF'}
              />
            </View>
          );

          return (
            <TouchableOpacity
              key={idx}
              style={[styles.navButton, disabled && styles.navButtonDisabled]}
              onPress={onPress}
              disabled={disabled}
              activeOpacity={0.7}
            >
              {isLiquidGlassSupported ? (
                <LiquidGlassView
                  style={{ backgroundColor: 'transparent', borderRadius: 8, overflow: 'hidden' }}
                  interactive={true}
                  effect="clear"
                  colorScheme="dark"
                >
                  {btnContent}
                </LiquidGlassView>
              ) : (
                btnContent
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {isLiquidGlassSupported ? (
        <LiquidGlassView
          style={[styles.urlBar, { backgroundColor: 'transparent', overflow: 'hidden' }]}
          interactive={true}
          effect="clear"
          colorScheme="dark"
        >
          <View style={styles.urlBarInner}>
            <Ionicons name="lock-closed" size={16} color="#00D084" style={styles.lockIcon} />
            <TextInput
              style={styles.urlInput}
              value={url}
              onChangeText={setUrl}
              onSubmitEditing={handleNavigate}
              placeholder="Inserisci URL o cerca..."
              placeholderTextColor="rgba(255, 255, 255, 0.4)"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
            />
            {loading && <ActivityIndicator size="small" color={AppColors.primary} />}
          </View>
        </LiquidGlassView>
      ) : (
        <View style={styles.urlBar}>
          <Ionicons name="lock-closed" size={16} color="#00D084" style={styles.lockIcon} />
          <TextInput
            style={styles.urlInput}
            value={url}
            onChangeText={setUrl}
            onSubmitEditing={handleNavigate}
            placeholder="Inserisci URL o cerca..."
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
          />
          {loading && <ActivityIndicator size="small" color={AppColors.primary} />}
        </View>
      )}

      <TouchableOpacity style={styles.menuButton} activeOpacity={0.7}>
        {isLiquidGlassSupported ? (
          <LiquidGlassView
            style={{ backgroundColor: 'transparent', borderRadius: 8, overflow: 'hidden' }}
            interactive={true}
            effect="clear"
            colorScheme="dark"
          >
            <View style={styles.navButtonInner}>
              <Ionicons name="ellipsis-vertical" size={20} color="rgba(255, 255, 255, 0.7)" />
            </View>
          </LiquidGlassView>
        ) : (
          <View style={styles.navButtonInner}>
            <Ionicons name="ellipsis-vertical" size={20} color="rgba(255, 255, 255, 0.7)" />
          </View>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderQuickLinks = () => (
    <View style={styles.quickLinks}>
      {quickLinks.map((link) => {
        const linkContent = (
          <View style={styles.quickLinkInner}>
            <Ionicons name={link.icon as any} size={18} color={AppColors.primary} />
            <Text style={styles.quickLinkText}>{link.name}</Text>
          </View>
        );

        return (
          <TouchableOpacity
            key={link.name}
            style={styles.quickLink}
            onPress={() => {
              setUrl(link.url);
              setCurrentUrl(link.url);
            }}
            activeOpacity={0.7}
          >
            {isLiquidGlassSupported ? (
              <LiquidGlassView
                style={{ backgroundColor: 'transparent', borderRadius: 8, overflow: 'hidden' }}
                interactive={true}
                effect="clear"
                colorScheme="dark"
              >
                {linkContent}
              </LiquidGlassView>
            ) : (
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.02)']}
                style={styles.quickLinkGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                {linkContent}
              </LinearGradient>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40 }]}>
      {/* Browser Header */}
      {renderHeader()}

      {/* Quick Links */}
      {renderQuickLinks()}

      {/* WebView */}
      <View style={styles.webViewContainer}>
        <WebView
          ref={webViewRef}
          source={{ uri: currentUrl }}
          style={styles.webView}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={(navState) => {
            setCanGoBack(navState.canGoBack);
            setCanGoForward(navState.canGoForward);
            setUrl(navState.url);
          }}
          allowsBackForwardNavigationGestures
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0f',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  navigationButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  navButtonInner: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  urlBar: {
    flex: 1,
    borderRadius: 10,
  },
  urlBarInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: 8,
  },
  lockIcon: {
    marginRight: 4,
  },
  urlInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  quickLinks: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  quickLink: {
    flex: 1,
    borderRadius: 8,
  },
  quickLinkInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  quickLinkGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
  },
  quickLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  webViewContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  webView: {
    flex: 1,
  },
});
