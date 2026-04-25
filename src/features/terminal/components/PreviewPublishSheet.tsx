import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, ActivityIndicator, Share, Pressable } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
import { tracciaLinkPubblicazioneCondiviso, tracciaUrlPubblicazioneAperto, tracciaDePubblicato, tracciaPaginaPianiVista, tracciaPaywallPubblicaMostrato } from '../../../core/services/analyticsService';
import { useNavigationStore } from '../../../core/navigation/navigationStore';
import type { PublishCategory, ExistingPublish } from '../hooks/usePreviewPublish';
import { UsernameModal } from '../../explore/UsernameModal';

// Glass wrapper — uses native LiquidGlassView when supported (iOS
// 26+), falls back to a translucent View elsewhere.
//
// The contour is a 1px LinearGradient rim that fakes the refraction
// edge of real liquid-glass material: bright at the top, dim in the
// middle, slightly bright again at the bottom. Same trick Apple's
// own visionOS / Liquid Glass controls use to suggest a curved
// vitreous surface against any backdrop.
const Glass: React.FC<{
  style?: any;
  radius?: number;
  tint?: 'card' | 'pill' | 'input';
  children: React.ReactNode;
}> = ({ style, radius = 16, tint = 'card', children }) => {
  const fallbackBg = tint === 'card'
    ? 'rgba(28,28,32,0.65)'
    : 'rgba(255,255,255,0.07)';

  // Inner fills the gradient parent so children (e.g. flex:1 buttons)
  // get full width — without flex:1 the inner collapses to 0.
  const innerStyle = { flex: 1, alignSelf: 'stretch' as const, borderRadius: radius - 1, overflow: 'hidden' as const };
  const inner = isLiquidGlassSupported ? (
    <LiquidGlassView
      interactive
      effect="clear"
      colorScheme="dark"
      style={[innerStyle, { backgroundColor: 'transparent' }]}
    >
      {children}
    </LiquidGlassView>
  ) : (
    <View style={[innerStyle, { backgroundColor: fallbackBg }]}>
      {children}
    </View>
  );

  return (
    <LinearGradient
      colors={[
        'rgba(255,255,255,0.55)',
        'rgba(255,255,255,0.10)',
        'rgba(255,255,255,0.04)',
        'rgba(255,255,255,0.30)',
      ]}
      locations={[0, 0.4, 0.7, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[{ borderRadius: radius, padding: 1 }, style]}
    >
      {inner}
    </LinearGradient>
  );
};

// Static category list — hoisted out of the component so the array
// reference is stable across renders.
const CATEGORY_OPTIONS: { id: PublishCategory; label: string; icon: string }[] = [
  { id: 'app', label: 'App', icon: 'apps-outline' },
  { id: 'game', label: 'Gioco', icon: 'game-controller-outline' },
  { id: 'tool', label: 'Tool', icon: 'construct-outline' },
  { id: 'site', label: 'Sito', icon: 'globe-outline' },
  { id: 'art', label: 'Arte', icon: 'color-palette-outline' },
  { id: 'other', label: 'Altro', icon: 'ellipsis-horizontal' },
];

export interface PreviewPublishSheetProps {
  visible: boolean;
  publishSlug: string;
  onChangeSlug: (text: string) => void;
  isPublishing: boolean;
  publishStatus: 'idle' | 'building' | 'publishing' | 'done' | 'error';
  publishedUrl: string | null;
  publishError: string | null;
  existingPublish: ExistingPublish | null;
  onPublish: () => void;
  onUnpublish: () => void;
  onClose: () => void;
  isFreeUser?: boolean;
  // Platform metadata — controlled by the hook.
  publishTitle: string;
  onChangeTitle: (text: string) => void;
  publishDescription: string;
  onChangeDescription: (text: string) => void;
  publishCategory: PublishCategory;
  onChangeCategory: (cat: PublishCategory) => void;
  publishIsPublic: boolean;
  onChangeIsPublic: (val: boolean) => void;
  onOpenInsights?: () => void;
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
  publishTitle,
  onChangeTitle,
  publishDescription,
  onChangeDescription,
  publishCategory,
  onChangeCategory,
  publishIsPublic,
  onChangeIsPublic,
  onOpenInsights,
}) => {
  const { t } = useTranslation();
  const [urlCopied, setUrlCopied] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [savedUsername, setSavedUsername] = useState<string | null>(null);

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
      {/* Backdrop blur — sfoca pesantemente quello che c'è sotto.
          Stack di due BlurView per spingere il blur effettivo oltre
          quello che un singolo BlurView può fare su iOS. */}
      <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
      <Pressable
        style={styles.publishModalOverlay}
        onPress={() => !isPublishing && onClose()}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
        <Glass radius={28} style={styles.publishModalContent}>
        <View style={styles.publishModalInner}>
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
              <Glass radius={20} tint="input" style={{ marginBottom: 16 }}>
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
              </Glass>

              {/* Platform metadata */}
              <Glass radius={16} tint="input" style={{ marginBottom: 10 }}>
                <TextInput
                  style={styles.metaInput}
                  value={publishTitle}
                  onChangeText={onChangeTitle}
                  editable={!isPublishing}
                  placeholder="Titolo (es. Negozio di fiori)"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  maxLength={80}
                />
              </Glass>
              <Glass radius={16} tint="input" style={{ marginBottom: 14 }}>
                <TextInput
                  style={[styles.metaInput, styles.metaInputMultiline]}
                  value={publishDescription}
                  onChangeText={onChangeDescription}
                  editable={!isPublishing}
                  placeholder="Descrizione (cosa fa la tua app)"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  multiline
                  maxLength={280}
                />
              </Glass>

              <View style={styles.categoryRow}>
                {CATEGORY_OPTIONS.map(opt => {
                  const active = publishCategory === opt.id;
                  if (active) {
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[styles.categoryPill, styles.categoryPillActive]}
                        onPress={() => !isPublishing && onChangeCategory(opt.id)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name={opt.icon as any} size={13} color="#0a0a0c" />
                        <Text style={[styles.categoryPillText, styles.categoryPillTextActive]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <Glass key={opt.id} radius={999}>
                      <TouchableOpacity
                        style={styles.categoryPill}
                        onPress={() => !isPublishing && onChangeCategory(opt.id)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name={opt.icon as any} size={13} color="rgba(255,255,255,0.6)" />
                        <Text style={styles.categoryPillText}>{opt.label}</Text>
                      </TouchableOpacity>
                    </Glass>
                  );
                })}
              </View>

              <Glass radius={14} style={{ marginBottom: 14 }}>
                <TouchableOpacity
                  style={styles.publicToggleRow}
                  activeOpacity={0.75}
                  onPress={() => !isPublishing && onChangeIsPublic(!publishIsPublic)}
                >
                  <View style={styles.publicToggleText}>
                    <Text style={styles.publicToggleTitle}>Mostra in Explore</Text>
                    <Text style={styles.publicToggleSub}>
                      Altri utenti potranno vederla, aprirla e remixarla
                    </Text>
                  </View>
                  <View style={[styles.toggleTrack, publishIsPublic && styles.toggleTrackOn]}>
                    <View style={[styles.toggleThumb, publishIsPublic && styles.toggleThumbOn]} />
                  </View>
                </TouchableOpacity>
              </Glass>
              {publishIsPublic && (
                <TouchableOpacity
                  onPress={() => setShowUsernameModal(true)}
                  style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -6, marginBottom: 14, paddingHorizontal: 4 }}
                >
                  <Ionicons name="at-outline" size={12} color="#A78BFA" />
                  <Text style={{ color: '#A78BFA', fontSize: 11, fontWeight: '600' }}>
                    {savedUsername ? `@${savedUsername}` : 'Imposta il tuo @username'}
                  </Text>
                </TouchableOpacity>
              )}
              <UsernameModal
                visible={showUsernameModal}
                initialValue={savedUsername || ''}
                onClose={() => setShowUsernameModal(false)}
                onSaved={(u) => setSavedUsername(u)}
              />
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
                    {onOpenInsights && (
                      <TouchableOpacity
                        style={[styles.publishActionButton, { backgroundColor: 'rgba(167,139,250,0.15)' }]}
                        onPress={onOpenInsights}
                      >
                        <Ionicons name="stats-chart-outline" size={16} color="#A78BFA" />
                        <Text style={[styles.publishActionText, { color: '#A78BFA' }]}>Insights</Text>
                      </TouchableOpacity>
                    )}
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
                <Glass radius={20} style={{ flex: 1 }}>
                  <TouchableOpacity
                    style={styles.publishCancelBtn}
                    onPress={onClose}
                    disabled={isPublishing}
                  >
                    <Text style={styles.publishCancelBtnText}>{t('terminal:publish.cancel')}</Text>
                  </TouchableOpacity>
                </Glass>
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
        </Glass>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  publishModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  publishModalContent: {
    width: '100%',
    maxWidth: 360,
  },
  publishModalInner: {
    padding: 24,
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
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  metaInput: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#fff',
    fontSize: 13,
  },
  metaInputMultiline: {
    minHeight: 60,
    textAlignVertical: 'top',
    paddingTop: 11,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  categoryPillActive: {
    backgroundColor: '#A78BFA',
  },
  categoryPillText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '500',
  },
  categoryPillTextActive: {
    color: '#0a0a0c',
    fontWeight: '700',
  },
  publicToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  publicToggleText: {
    flex: 1,
  },
  publicToggleTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  publicToggleSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    marginTop: 2,
  },
  toggleTrack: {
    width: 40,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    padding: 2,
    justifyContent: 'center',
  },
  toggleTrackOn: {
    backgroundColor: '#A78BFA',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  toggleThumbOn: {
    transform: [{ translateX: 16 }],
  },
});
