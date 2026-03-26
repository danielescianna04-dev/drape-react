import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

export type ViewportMode = 'mobile' | 'desktop';

export interface PreviewToolbarProps {
  currentPreviewUrl: string;
  onClose: () => void;
  onRefresh: () => void;
  onPublish: () => void;
  onUrlChange?: (url: string) => void;
  existingPublish: { slug: string; url: string } | null;
  topInset: number;
  viewportMode: ViewportMode;
  onViewportChange: (mode: ViewportMode) => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onGoBack?: () => void;
  onGoForward?: () => void;
}

export const PreviewToolbar: React.FC<PreviewToolbarProps> = ({
  currentPreviewUrl,
  onClose,
  onRefresh,
  onPublish,
  onUrlChange,
  existingPublish,
  topInset,
  viewportMode,
  onViewportChange,
  canGoBack = false,
  canGoForward = false,
  onGoBack,
  onGoForward,
}) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editPath, setEditPath] = useState('/');
  const inputRef = useRef<TextInput>(null);

  // Track last meaningful (non-root) path so framework hydration
  // navigations to "/" don't reset the toolbar display.
  const lastNonRootPath = useRef('/');

  // Split URL into non-editable base and editable path suffix
  const { basePath, pathSuffix } = (() => {
    try {
      const url = new URL(currentPreviewUrl);
      const match = url.pathname.match(/^(\/preview\/[^/]+)(\/.*)?$/);
      if (match) {
        return { basePath: `${url.host}${match[1]}`, pathSuffix: match[2] || '/' };
      }
      return { basePath: url.host, pathSuffix: url.pathname || '/' };
    } catch {
      return { basePath: 'localhost', pathSuffix: '/' };
    }
  })();

  // Remember non-root paths; display them even when URL briefly resets to "/"
  if (pathSuffix !== '/') {
    lastNonRootPath.current = pathSuffix;
  }
  const displayPath = pathSuffix !== '/' ? pathSuffix : lastNonRootPath.current;

  const handlePathPress = () => {
    setEditPath(displayPath);
    setIsEditing(true);
  };

  useEffect(() => {
    if (isEditing) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isEditing]);

  const handleSubmit = () => {
    setIsEditing(false);
    Keyboard.dismiss();
    if (!onUrlChange) return;

    let path = editPath.trim() || '/';
    if (!path.startsWith('/')) path = '/' + path;

    const newUrl = `https://${basePath}${path}`;
    if (newUrl !== currentPreviewUrl) {
      onUrlChange(newUrl);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    Keyboard.dismiss();
  };

  return (
    <View style={[styles.header, { paddingTop: topInset + 4 }]}>
      <View style={styles.headerRow}>
        {/* Back */}
        <TouchableOpacity
          onPress={onGoBack}
          disabled={!canGoBack}
          style={styles.navButton}
          activeOpacity={0.7}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={18} color={canGoBack ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.2)'} />
        </TouchableOpacity>

        {/* Forward */}
        <TouchableOpacity
          onPress={onGoForward}
          disabled={!canGoForward}
          style={styles.navButton}
          activeOpacity={0.7}
          accessibilityLabel="Go forward"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-forward" size={18} color={canGoForward ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.2)'} />
        </TouchableOpacity>

        {/* URL Bar */}
        <View style={[styles.urlBar, isEditing && styles.urlBarEditing]}>
          <View style={[styles.statusIndicator, { backgroundColor: '#00D084' }]} />
          {isEditing ? (
            <TextInput
              ref={inputRef}
              style={styles.urlPathInput}
              value={editPath}
              onChangeText={(text) => {
                if (!text.startsWith('/')) setEditPath('/' + text.replace(/^\/+/, ''));
                else setEditPath(text);
              }}
              onSubmitEditing={handleSubmit}
              onBlur={handleCancel}
              autoCorrect={false}
              autoCapitalize="none"
              spellCheck={false}
              returnKeyType="go"
              selectTextOnFocus
              keyboardType="url"
            />
          ) : (
            <TouchableOpacity onPress={handlePathPress} activeOpacity={0.7} style={styles.urlPathTappable}>
              <Text style={styles.urlPathText} numberOfLines={1}>{displayPath}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Three dots menu */}
        <TouchableOpacity
          onPress={onRefresh}
          style={styles.iconButton}
          activeOpacity={0.7}
          accessibilityLabel="Menu"
          accessibilityRole="button"
        >
          <Ionicons name="ellipsis-horizontal" size={18} color="rgba(255, 255, 255, 0.7)" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 10,
    paddingBottom: 6,
    backgroundColor: '#0d1117',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navButton: {
    width: 24,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.6)',
  },
  publishButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishButtonUpdate: {
    backgroundColor: '#00D084',
  },
  urlBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  urlBarEditing: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  statusIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  urlPathTappable: {
    flex: 1,
    minWidth: 20,
  },
  urlPathText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  urlPathInput: {
    flex: 1,
    fontSize: 12,
    color: '#fff',
    padding: 0,
    margin: 0,
    minWidth: 20,
  },
});
