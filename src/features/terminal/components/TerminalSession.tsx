import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TerminalWebView, type TerminalWebViewHandle } from './TerminalWebView';
import { getAuthToken } from '../../../core/api/getAuthToken';
import { config } from '../../../config/config';
import { AppColors } from '../../../shared/theme/colors';

interface TerminalSessionProps {
  projectId: string;
  sessionId: string;
  sessionTitle?: string;
  isActive: boolean;
  onExit?: () => void;
  onConnectionChange?: (connected: boolean) => void;
}

export const TerminalSession = React.memo(({
  projectId,
  sessionTitle = 'bash',
  isActive,
  onExit,
  onConnectionChange,
}: TerminalSessionProps) => {
  const insets = useSafeAreaInsets();
  const terminalRef = React.useRef<TerminalWebViewHandle>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [pendingAuthUrl, setPendingAuthUrl] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const lastOpenedAuthUrlRef = React.useRef<string | null>(null);
  const inputRef = React.useRef<TextInput>(null);

  const loadAuthToken = useCallback(async () => {
    setIsLoadingToken(true);
    setErrorMsg(null);
    try {
      const token = await getAuthToken(true);
      if (!token) {
        throw new Error('Authentication required to open terminal');
      }
      setAuthToken(token);
    } catch (error: any) {
      setAuthToken(null);
      setErrorMsg(error?.message || 'Unable to initialize terminal');
      onConnectionChange?.(false);
    } finally {
      setIsLoadingToken(false);
    }
  }, [onConnectionChange]);

  useEffect(() => {
    if (!isActive) return;
    loadAuthToken();
  }, [isActive, loadAuthToken, projectId]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates?.height || 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleConnected = useCallback(() => {
    setErrorMsg(null);
    onConnectionChange?.(true);
  }, [onConnectionChange]);

  const handleExit = useCallback(() => {
    onConnectionChange?.(false);
    onExit?.();
  }, [onConnectionChange, onExit]);

  const handleError = useCallback((message: string) => {
    setErrorMsg(message);
    onConnectionChange?.(false);
  }, [onConnectionChange]);

  const handleAuthUrl = useCallback(async (url: string) => {
    setPendingAuthUrl(url);
    if (lastOpenedAuthUrlRef.current === url) return;
    lastOpenedAuthUrlRef.current = url;

    try {
      await Linking.openURL(url);
    } catch (error: any) {
      setErrorMsg(error?.message || 'Unable to open browser for Claude sign in');
    }
  }, []);

  const handleSubmitInput = useCallback(() => {
    if (!inputValue) return;
    terminalRef.current?.sendInput(`${inputValue}\r`);
    setInputValue('');
  }, [inputValue]);

  const showTerminal = useMemo(
    () => isActive && !!authToken && !isLoadingToken,
    [authToken, isActive, isLoadingToken],
  );

  return (
    <View style={styles.container}>
      {showTerminal ? (
        <View style={styles.terminalViewport}>
          <TerminalWebView
            ref={terminalRef}
            key={`${projectId}-${reloadKey}`}
            projectId={projectId}
            wsUrl={config.wsUrl}
            authToken={authToken!}
            onConnected={handleConnected}
            onExit={handleExit}
            onError={handleError}
            onAuthUrl={handleAuthUrl}
          />
        </View>
      ) : (
        <View style={styles.loadingState}>
          {isLoadingToken ? (
            <>
              <ActivityIndicator size="small" color={AppColors.primary} />
              <Text style={styles.loadingText}>Connecting terminal...</Text>
            </>
          ) : (
            <>
              <Text style={styles.errorTitle}>{sessionTitle}</Text>
              <Text style={styles.errorText}>{errorMsg || 'Terminal unavailable'}</Text>
              <TouchableOpacity
                onPress={() => {
                  setReloadKey((prev) => prev + 1);
                  loadAuthToken();
                }}
                activeOpacity={0.8}
                style={[styles.retryButton, { marginBottom: insets.bottom || 0 }]}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {errorMsg && showTerminal ? (
        <View style={[styles.errorBanner, { bottom: insets.bottom + 12 }]}>
          <Text style={styles.errorBannerText}>{errorMsg}</Text>
          <TouchableOpacity
            onPress={() => {
              setReloadKey((prev) => prev + 1);
              loadAuthToken();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.errorBannerAction}>Reconnect</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {pendingAuthUrl && showTerminal ? (
        <View
          style={[
            styles.authBanner,
            {
              bottom: (keyboardHeight > 0 ? keyboardHeight : insets.bottom) + 56,
            },
          ]}
        >
          <Text style={styles.authBannerText}>Claude sign-in detected</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(pendingAuthUrl)}
            activeOpacity={0.8}
            style={styles.authBannerButton}
          >
            <Text style={styles.authBannerButtonText}>Open browser</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {showTerminal ? (
        <View
          style={[
            styles.inputDock,
            { bottom: (keyboardHeight > 0 ? keyboardHeight : insets.bottom) + 54 },
          ]}
        >
          <TouchableOpacity
            onPress={() => inputRef.current?.focus()}
            activeOpacity={0.7}
            style={styles.inputDockAction}
          >
            <Ionicons name="create-outline" size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>

          <TextInput
            ref={inputRef}
            style={styles.inputDockField}
            value={inputValue}
            onChangeText={setInputValue}
            placeholder="Type into terminal..."
            placeholderTextColor={AppColors.white.w35}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            keyboardAppearance="dark"
            returnKeyType="send"
            onSubmitEditing={handleSubmitInput}
            blurOnSubmit={false}
          />

          <TouchableOpacity
            onPress={handleSubmitInput}
            activeOpacity={0.8}
            disabled={!inputValue}
            style={[
              styles.inputDockSend,
              inputValue ? styles.inputDockSendActive : styles.inputDockSendIdle,
            ]}
          >
            <Ionicons
              name="arrow-up"
              size={16}
              color={inputValue ? '#FFFFFF' : 'rgba(255,255,255,0.3)'}
            />
          </TouchableOpacity>
        </View>
      ) : null}

      {showTerminal ? (
        <View
          style={[
            styles.mobileToolbarWrap,
            { bottom: (keyboardHeight > 0 ? keyboardHeight : insets.bottom) + 10 },
          ]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.mobileToolbar}
            keyboardShouldPersistTaps="always"
          >
            {[
              { label: '1', data: '1\r' },
              { label: '2', data: '2\r' },
              { label: '3', data: '3\r' },
              { label: '4', data: '4\r' },
              { label: '5', data: '5\r' },
              { label: '6', data: '6\r' },
              { label: '↑', data: '\u001b[A' },
              { label: '↓', data: '\u001b[B' },
              { label: 'Esc', data: '\u001b' },
              { label: 'Enter', data: '\r' },
            ].map((key) => (
              <TouchableOpacity
                key={key.label}
                onPress={() => terminalRef.current?.sendInput(key.data)}
                activeOpacity={0.75}
                style={styles.mobileKey}
              >
                <Text style={styles.mobileKeyText}>{key.label}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              onPress={() => terminalRef.current?.focus()}
              activeOpacity={0.75}
              style={[styles.mobileKey, styles.mobileKeyFocus]}
            >
              <Ionicons name="keypad-outline" size={14} color="#FFFFFF" />
            </TouchableOpacity>
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  terminalViewport: {
    flex: 1,
  },
  loadingText: {
    color: AppColors.white.w50,
    fontSize: 14,
  },
  errorTitle: {
    color: AppColors.white.w80,
    fontSize: 16,
    fontWeight: '600',
    textTransform: 'lowercase',
  },
  errorText: {
    color: AppColors.white.w50,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: AppColors.primaryAlpha.a20,
    borderWidth: 1,
    borderColor: AppColors.primaryAlpha.a40,
  },
  retryButtonText: {
    color: AppColors.white.full,
    fontSize: 13,
    fontWeight: '600',
  },
  errorBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(17, 17, 22, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.24)',
  },
  errorBannerText: {
    flex: 1,
    color: '#FF8D8D',
    fontSize: 12,
    lineHeight: 18,
  },
  errorBannerAction: {
    color: AppColors.white.full,
    fontSize: 12,
    fontWeight: '600',
  },
  authBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(17, 17, 22, 0.94)',
    borderWidth: 1,
    borderColor: AppColors.primaryAlpha.a40,
  },
  authBannerText: {
    flex: 1,
    color: AppColors.white.w80,
    fontSize: 12,
    fontWeight: '600',
  },
  authBannerButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: AppColors.primaryAlpha.a20,
    borderWidth: 1,
    borderColor: AppColors.primaryAlpha.a40,
  },
  authBannerButtonText: {
    color: AppColors.white.full,
    fontSize: 12,
    fontWeight: '700',
  },
  inputDock: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(17, 17, 22, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 8,
  },
  inputDockAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  inputDockField: {
    flex: 1,
    color: AppColors.white.w90,
    fontSize: 15,
    paddingVertical: 0,
  },
  inputDockSend: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputDockSendIdle: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  inputDockSendActive: {
    backgroundColor: AppColors.primary,
  },
  mobileToolbarWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  mobileToolbar: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  mobileKey: {
    minWidth: 38,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17, 17, 22, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  mobileKeyFocus: {
    paddingHorizontal: 10,
    backgroundColor: AppColors.primaryAlpha.a20,
    borderColor: AppColors.primaryAlpha.a40,
  },
  mobileKeyText: {
    color: AppColors.white.w80,
    fontSize: 12,
    fontWeight: '600',
  },
});
