import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, ActivityIndicator, Share } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { tracciaLinkPubblicazioneCondiviso, tracciaUrlPubblicazioneAperto, tracciaDePubblicato, tracciaPaginaPianiVista, tracciaPaywallPubblicaMostrato } from '../../../core/services/analyticsService';
import { useNavigationStore } from '../../../core/navigation/navigationStore';

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
  isFreeUser?: boolean;
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
  isFreeUser,
}) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (visible && isFreeUser && !existingPublish) {
      tracciaPaywallPubblicaMostrato();
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => !isPublishing && onClose()}
    >
      <View style={styles.publishModalOverlay}>
        <View style={styles.publishModalContent}>
          {isFreeUser && !existingPublish ? (
            <>
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <View style={{
                  width: 56, height: 56, borderRadius: 28,
                  backgroundColor: 'rgba(139, 92, 246, 0.15)',
                  alignItems: 'center', justifyContent: 'center', marginBottom: 12,
                }}>
                  <Ionicons name="rocket" size={28} color="#A78BFA" />
                </View>
                <Text style={styles.publishModalTitle}>{t('terminal:publish.paywallTitle')}</Text>
                <Text style={[styles.publishModalSubtitle, { marginBottom: 0 }]}>
                  {t('terminal:publish.paywallSubtitle')}
                </Text>
              </View>

              <View style={{
                backgroundColor: 'rgba(139, 92, 246, 0.08)',
                borderRadius: 16, padding: 16, marginBottom: 20,
                borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.15)',
              }}>
                <View style={{ gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="globe-outline" size={16} color="#A78BFA" />
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>
                      {t('terminal:publish.paywallFeatureLink')}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="flash-outline" size={16} color="#A78BFA" />
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>
                      {t('terminal:publish.paywallFeatureDeploy')}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="share-social-outline" size={16} color="#A78BFA" />
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>
                      {t('terminal:publish.paywallFeatureShare')}
                    </Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={{ borderRadius: 20, overflow: 'hidden', marginBottom: 10 }}
                activeOpacity={0.85}
                onPress={() => { tracciaPaginaPianiVista('publish'); onClose(); useNavigationStore.getState().navigateTo('plans'); }}
              >
                <LinearGradient
                  colors={['#7C3AED', '#5B21B6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
                >
                  <Ionicons name="rocket" size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{t('terminal:publish.paywallCta')}</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onClose}
                style={{ paddingVertical: 10, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', fontWeight: '500' }}>{t('terminal:publish.cancel')}</Text>
              </TouchableOpacity>
            </>
          ) : publishStatus === 'done' && publishedUrl ? (
            <>
              <Ionicons name="checkmark-circle" size={48} color="#00D084" style={{ alignSelf: 'center', marginBottom: 12 }} />
              <Text style={styles.publishModalTitle}>{t('terminal:publish.published')}</Text>
              <Text style={styles.publishModalUrl}>{publishedUrl}</Text>
              <View style={styles.publishModalActions}>
                <TouchableOpacity
                  style={styles.publishActionButton}
                  onPress={() => {
                    tracciaLinkPubblicazioneCondiviso(publishedUrl);
                    Share.share({ url: publishedUrl, message: publishedUrl });
                  }}
                >
                  <Ionicons name="share-outline" size={18} color="#fff" />
                  <Text style={styles.publishActionText}>{t('terminal:publish.share')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.publishActionButton}
                  onPress={() => { tracciaUrlPubblicazioneAperto(publishedUrl); WebBrowser.openBrowserAsync(publishedUrl); }}
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
                      onPress={() => { tracciaUrlPubblicazioneAperto(existingPublish.slug); WebBrowser.openBrowserAsync(existingPublish.url); }}
                    >
                      <Ionicons name="open-outline" size={16} color="#fff" />
                      <Text style={styles.publishActionText}>{t('terminal:publish.openSite')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.publishActionButton}
                      onPress={() => { tracciaLinkPubblicazioneCondiviso(existingPublish.slug); Share.share({ url: existingPublish.url, message: existingPublish.url }); }}
                    >
                      <Ionicons name="share-outline" size={16} color="#fff" />
                      <Text style={styles.publishActionText}>{t('terminal:publish.share')}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.publishModalActions}>
                    <TouchableOpacity
                      style={[styles.publishActionButton, { backgroundColor: 'rgba(255, 59, 48, 0.12)' }]}
                      onPress={() => { tracciaDePubblicato(existingPublish.slug); onUnpublish(); }}
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
                    {publishStatus === 'building' ? t('terminal:publish.building') : t('terminal:publish.updating')}
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
