import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface PreviewToolbarProps {
  currentPreviewUrl: string;
  onClose: () => void;
  onRefresh: () => void;
  onPublish: () => void;
  existingPublish: { slug: string; url: string } | null;
  topInset: number;
}

export const PreviewToolbar: React.FC<PreviewToolbarProps> = ({
  currentPreviewUrl,
  onClose,
  onRefresh,
  onPublish,
  existingPublish,
  topInset,
}) => {
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

        {/* URL Bar - centered */}
        <View
          style={styles.urlBar}
          accessibilityLabel={`URL anteprima: ${currentPreviewUrl ? currentPreviewUrl.replace(/^https?:\/\//, '') : 'localhost'}`}
          accessible
        >
          <View style={[
            styles.statusIndicator,
            { backgroundColor: '#00D084' }
          ]} />
          <Text style={styles.urlText} numberOfLines={1}>
            {currentPreviewUrl ? currentPreviewUrl.replace(/^https?:\/\//, '') : 'localhost'}
          </Text>
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
  statusIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  urlText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
});
