import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, ActivityIndicator, Share } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
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
  const [urlCopied, setUrlCopied] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (visible && isFreeUser && !existingPublish) {
      tracciaPaywallPubblicaMostrato();
    }
  }, [visible]);

  // Elapsed-time counter while publishing, so we can rotate a simulated
  // progress narrative (no real streaming from backend today).
  useEffect(() => {
    if (!isPublishing) {
      setElapsedSec(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isPublishing]);

  // Map elapsed seconds to a friendly stage message.
  const progressStage = (() => {
    if (elapsedSec < 8) return { icon: 'file-tray-stacked-outline', text: 'Preparo il progetto...' };
    if (elapsedSec < 25) return { icon: 'cube-outline', text: 'Installo le dipendenze...' };
    if (elapsedSec < 60) return { icon: 'hammer-outline', text: 'Costruisco il sito...' };
    if (elapsedSec < 90) return { icon: 'cloud-upload-outline', text: 'Ultimi ritocchi...' };
    return { icon: 'time-outline', text: 'Ci sto mettendo più del previsto, un attimo...' };
  })();

  const copyUrl = async (url: string) => {
    try {
      await Clipboard.setStringAsync(url);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 1800);
    } catch {}
  };

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
              <View style={{ alignItems: 'center', marginBottom: 8 }}>
                <View style={{
                  width: 48, height: 48, borderRadius: 24,
                  backgroundColor: 'rgba(0,208,132,0.15)',
                  alignItems: 'center', justifyContent: 'center', marginBottom: 8,
                }}>
                  <Ionicons name="checkmark" size={26} color="#00D084" />
                </View>
                <Text style={styles.publishModalTitle}>{t('terminal:publish.published')}</Text>
                <Text style={[styles.publishModalSubtitle, { marginBottom: 16 }]}>
                  Scansiona con il telefono o condividi il link
                </Text>
              </View>

              {/* QR code card */}
              <View style={styles.qrCard}>
                <View style={styles.qrInner}>
                  <QRCode
                    value={publishedUrl}
                    size={168}
                    backgroundColor="transparent"
                    color="#ffffff"
                    quietZone={6}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => copyUrl(publishedUrl)}
                  activeOpacity={0.7}
                  style={styles.urlPill}
                >
                  <Ionicons
                    name={urlCopied ? 'checkmark' : 'copy-outline'}
                    size={12}
                    color={urlCopied ? '#00D084' : 'rgba(255,255,255,0.5)'}
                  />
                  <Text style={styles.urlPillText} numberOfLines={1}>
                    {publishedUrl.replace(/^https?:\/\//, '')}
                  </Text>
                </TouchableOpacity>
              </View>

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
                <View style={styles.publishStageCard}>
                  <View style={styles.publishStageIconWrap}>
                    <Ionicons name={progressStage.icon as any} size={18} color="#A78BFA" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.publishStageText}>{progressStage.text}</Text>
                    <Text style={styles.publishStageTimer}>
                      {elapsedSec}s {elapsedSec > 45 ? '· possono volerci fino a 2 minuti' : ''}
                    </Text>
                  </View>
                  <ActivityIndicator size="small" color="#A78BFA" />
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
  publishStageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.18)',
    marginBottom: 16,
  },
  publishStageIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139,92,246,0.18)',
  },
  publishStageText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '600',
  },
  publishStageTimer: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 2,
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
  qrCard: {
    alignSelf: 'center',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    gap: 14,
    marginBottom: 16,
  },
  qrInner: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(139,92,246,0.08)',
  },
  urlPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    maxWidth: 220,
  },
  urlPillText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontFamily: 'monospace',
    flexShrink: 1,
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
