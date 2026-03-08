import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, ActivityIndicator, Linking, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { trackPublishShare, trackPublishOpenUrl, trackUnpublish } from '../../../core/services/analyticsService';

export interface PreviewPublishSheetProps {
  visible: boolean;
  publishSlug: string;
  onChangeSlug: (text: string) => void;
  isPublishing: boolean;
  publishStatus: 'idle' | 'building' | 'publishing' | 'done' | 'error';
  publishedUrl: string | null;
  publishError: string | null;
  existingPublish: { slug: string; url: string } | null;
  onPublish: () => void;
  onUnpublish: () => void;
  onClose: () => void;
}

export const PreviewPublishSheet: React.FC<PreviewPublishSheetProps> = ({
  visible,
  publishSlug,
  onChangeSlug,
  isPublishing,
  publishStatus,
  publishedUrl,
  publishError,
  existingPublish,
  onPublish,
  onUnpublish,
  onClose,
}) => {
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => !isPublishing && onClose()}
    >
      <View style={styles.publishModalOverlay}>
        <View style={styles.publishModalContent}>
          {publishStatus === 'done' && publishedUrl ? (
            <>
              <Ionicons name="checkmark-circle" size={48} color="#00D084" style={{ alignSelf: 'center', marginBottom: 12 }} />
              <Text style={styles.publishModalTitle}>{t('terminal:publish.published')}</Text>
              <Text style={styles.publishModalUrl}>{publishedUrl}</Text>
              <View style={styles.publishModalActions}>
                <TouchableOpacity
                  style={styles.publishActionButton}
                  onPress={() => {
                    trackPublishShare(publishedUrl);
                    Share.share({ url: publishedUrl, message: publishedUrl });
                  }}
                >
                  <Ionicons name="share-outline" size={18} color="#fff" />
                  <Text style={styles.publishActionText}>{t('terminal:publish.share')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.publishActionButton}
                  onPress={() => { trackPublishOpenUrl(publishedUrl); Linking.openURL(publishedUrl); }}
                >
                  <Ionicons name="open-outline" size={18} color="#fff" />
                  <Text style={styles.publishActionText}>{t('terminal:publish.open')}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.publishCloseBtn}
                onPress={onClose}
              >
                <Text style={styles.publishCloseBtnText}>{t('terminal:publish.close')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.publishModalTitle}>
                {existingPublish ? t('terminal:publish.updateTitle') : t('terminal:publish.publishTitle')}
              </Text>
              <Text style={styles.publishModalSubtitle}>
                {existingPublish
                  ? t('terminal:publish.updateSubtitle')
                  : t('terminal:publish.publishSubtitle')}
              </Text>
              <View style={styles.publishSlugRow}>
                <Text style={styles.publishSlugPrefix}>drape.info/p/</Text>
                {existingPublish ? (
                  <Text style={[styles.publishSlugInput, { color: 'rgba(255,255,255,0.6)' }]}>
                    {existingPublish.slug}
                  </Text>
                ) : (
                  <TextInput
                    style={styles.publishSlugInput}
                    value={publishSlug}
                    onChangeText={(text) => onChangeSlug(text.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isPublishing}
                    placeholder={t('terminal:publish.slugPlaceholder')}
                    placeholderTextColor="rgba(255,255,255,0.3)"
                  />
                )}
              </View>
              {existingPublish && !isPublishing && (
                <>
                  <View style={styles.publishModalActions}>
                    <TouchableOpacity
                      style={styles.publishActionButton}
                      onPress={() => { trackPublishOpenUrl(existingPublish.slug); Linking.openURL(existingPublish.url); }}
                    >
                      <Ionicons name="open-outline" size={16} color="#fff" />
                      <Text style={styles.publishActionText}>{t('terminal:publish.openSite')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.publishActionButton}
                      onPress={() => { trackPublishShare(existingPublish.slug); Share.share({ url: existingPublish.url, message: existingPublish.url }); }}
                    >
                      <Ionicons name="share-outline" size={16} color="#fff" />
                      <Text style={styles.publishActionText}>{t('terminal:publish.share')}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.publishModalActions}>
                    <TouchableOpacity
                      style={[styles.publishActionButton, { backgroundColor: 'rgba(255, 59, 48, 0.12)' }]}
                      onPress={() => { trackUnpublish(existingPublish.slug); onUnpublish(); }}
                    >
                      <Ionicons name="trash-outline" size={16} color="rgba(255, 59, 48, 0.8)" />
                      <Text style={[styles.publishActionText, { color: 'rgba(255, 59, 48, 0.8)' }]}>{t('terminal:publish.remove')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
              {publishError && (
                <Text style={styles.publishError}>{publishError}</Text>
              )}
              {isPublishing && (
                <View style={styles.publishProgressRow}>
                  <ActivityIndicator size="small" color="#007AFF" />
                  <Text style={styles.publishProgressText}>
                    {publishStatus === 'building' ? 'Building...' : t('terminal:publish.updating')}
                  </Text>
                </View>
              )}
              <View style={styles.publishModalButtons}>
                <TouchableOpacity
                  style={styles.publishCancelBtn}
                  onPress={onClose}
                  disabled={isPublishing}
                >
                  <Text style={styles.publishCancelBtnText}>{t('terminal:publish.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.publishConfirmBtn, isPublishing && { opacity: 0.5 }]}
                  onPress={onPublish}
                  disabled={isPublishing || (!existingPublish && !publishSlug.trim())}
                >
                  <Ionicons name={existingPublish ? "refresh" : "cloud-upload-outline"} size={16} color="#fff" />
                  <Text style={styles.publishConfirmBtnText}>
                    {existingPublish ? t('terminal:publish.update') : t('terminal:publish.publish')}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  publishModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  publishModalContent: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1a1a1a',
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  publishModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  publishModalSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginBottom: 20,
  },
  publishSlugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  publishSlugPrefix: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  publishSlugInput: {
    flex: 1,
    fontSize: 13,
    color: '#fff',
    padding: 0,
  },
  publishError: {
    fontSize: 12,
    color: '#FF4444',
    textAlign: 'center',
    marginBottom: 12,
  },
  publishProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  publishProgressText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  publishModalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  publishCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
  },
  publishCancelBtnText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '600',
  },
  publishConfirmBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  publishConfirmBtnText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  publishModalUrl: {
    fontSize: 14,
    color: '#007AFF',
    textAlign: 'center',
    marginBottom: 20,
  },
  publishModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  publishActionButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  publishActionText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },
  publishCloseBtn: {
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
  },
  publishCloseBtnText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '500',
  },
});
