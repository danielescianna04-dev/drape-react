import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface PreviewToolbarProps {
  currentPreviewUrl: string;
  onClose: () => void;
  onRefresh: () => void;
  onPublish: () => void;
  onUrlChange?: (url: string) => void;
  existingPublish: { slug: string; url: string } | null;
  topInset: number;
}

export const PreviewToolbar: React.FC<PreviewToolbarProps> = ({
  currentPreviewUrl,
  onClose,
  onRefresh,
  onPublish,
  onUrlChange,
  existingPublish,
  topInset,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editPath, setEditPath] = useState('/');
  const inputRef = useRef<TextInput>(null);

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

  const handlePathPress = () => {
    setEditPath(pathSuffix);
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
        {/* Close */}
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeButton}
          activeOpacity={0.7}
          accessibilityLabel="Chiudi anteprima"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={18} color="rgba(255, 255, 255, 0.7)" />
        </TouchableOpacity>

        {/* URL Bar - centered, only path suffix is editable */}
        <View style={[styles.urlBar, isEditing && styles.urlBarEditing]}>
          <View style={[styles.statusIndicator, { backgroundColor: '#00D084' }]} />
          <Text style={styles.urlBaseText} numberOfLines={1}>{basePath}</Text>
          {isEditing ? (
            <TextInput
              ref={inputRef}
              style={styles.urlPathInput}
              value={editPath}
              onChangeText={setEditPath}
              onSubmitEditing={handleSubmit}
              onBlur={handleCancel}
              autoCorrect={false}
              autoCapitalize="none"
              spellCheck={false}
              returnKeyType="go"
              selectTextOnFocus
              keyboardType="url"
              placeholder="/"
              placeholderTextColor="rgba(255,255,255,0.3)"
            />
          ) : (
            <TouchableOpacity onPress={handlePathPress} activeOpacity={0.7} style={styles.urlPathTappable}>
              <Text style={styles.urlPathText} numberOfLines={1}>{pathSuffix}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Refresh */}
        <TouchableOpacity
          onPress={onRefresh}
          style={styles.refreshButton}
          activeOpacity={0.7}
          accessibilityLabel="Ricarica anteprima"
          accessibilityRole="button"
        >
          <Ionicons name="refresh" size={16} color="rgba(255, 255, 255, 0.7)" />
        </TouchableOpacity>

        {/* Publish / Update */}
        <TouchableOpacity
          onPress={onPublish}
          style={[styles.publishButton, existingPublish && styles.publishButtonUpdate]}
          activeOpacity={0.7}
          accessibilityLabel={existingPublish ? "Aggiorna sito pubblicato" : "Pubblica sito"}
          accessibilityRole="button"
        >
          <Ionicons name={existingPublish ? "cloud-done-outline" : "cloud-upload-outline"} size={15} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
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
  urlBaseText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.3)',
    flexShrink: 1,
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
