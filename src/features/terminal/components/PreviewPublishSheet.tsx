import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, ActivityIndicator, Share, Pressable, ScrollView } from 'react-native';
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
// A 1px border with a slightly brighter top edge fakes the
// refraction lip of real glass material against any backdrop.
// Solid dark surface — same look as the editor's dropdown menus.
// Quasi-opaque dark background, very subtle 1px hairline border,
// no bright top highlight. Reads as "system menu", not "shiny glass".
const Glass: React.FC<{
  style?: any;
  radius?: number;
  tint?: 'card' | 'pill' | 'input';
  children: React.ReactNode;
}> = ({ style, radius = 16, tint = 'card', children }) => {
  const bg = tint === 'card'
    ? 'rgba(22,22,26,0.94)'
    : 'rgba(255,255,255,0.05)';
  const baseStyle = {
    borderRadius: radius,
    overflow: 'hidden' as const,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: bg,
  };
  return (
    <View style={[baseStyle, style]}>
      {children}
    </View>
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
      {/* Lieve blur dietro — la card è quasi opaca, basta un velo
          per separarla dallo sfondo come fanno i menu di sistema. */}
      <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
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
              {/* ─── Hero: status pill + URL prominently ─────────────── */}
              <View style={styles.editHero}>
                <View style={styles.editStatusRow}>
                  <View style={styles.editStatusDot} />
                  <Text style={styles.editStatusText}>
                    {existingPublish ? 'PUBBLICATO · ONLINE' : 'NUOVA PUBBLICAZIONE'}
                  </Text>
                </View>
                <View style={styles.editUrlRow}>
                  <Text style={styles.editUrlSlug}>
                    {existingPublish ? existingPublish.slug : (publishSlug || 'slug')}
                  </Text>
                  <Text style={styles.editUrlDomain}>.drape.info</Text>
                </View>
              </View>

              {/* ─── Group: Indirizzo (only for new publications) ──── */}
              {!existingPublish && (
                <>
                  <Text style={styles.groupLabel}>INDIRIZZO</Text>
                  <View style={styles.groupCard}>
                    <View style={styles.row}>
                      <Text style={styles.rowLabel}>Slug</Text>
                      <View style={styles.rowValueWrap}>
                        <TextInput
                          style={styles.rowInput}
                          value={publishSlug}
                          onChangeText={(text) => onChangeSlug(text.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                          autoCapitalize="none"
                          autoCorrect={false}
                          editable={!isPublishing}
                          placeholder={t('terminal:publish.slugPlaceholder')}
                          placeholderTextColor="rgba(255,255,255,0.3)"
                          textAlign="right"
                        />
                      </View>
                    </View>
                  </View>
                </>
              )}

              {/* ─── Editor card: bozza del post ─────────────────── */}
              <View style={styles.draftCard}>
                <TextInput
                  style={styles.draftTitle}
                  value={publishTitle}
                  onChangeText={onChangeTitle}
                  editable={!isPublishing}
                  placeholder="Dai un titolo"
                  placeholderTextColor="rgba(255,255,255,0.22)"
                  maxLength={80}
                  multiline
                />
                <TextInput
                  style={styles.draftDescription}
                  value={publishDescription}
                  onChangeText={onChangeDescription}
                  editable={!isPublishing}
                  placeholder="Cosa fa la tua app, in due righe."
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  multiline
                  maxLength={280}
                />
                <View style={styles.draftFooter}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 6, paddingRight: 8 }}
                  >
                    {CATEGORY_OPTIONS.map(opt => {
                      const active = publishCategory === opt.id;
                      return (
                        <TouchableOpacity
                          key={opt.id}
                          style={[styles.draftChip, active && styles.draftChipActive]}
                          onPress={() => !isPublishing && onChangeCategory(opt.id)}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name={opt.icon as any}
                            size={12}
                            color={active ? '#0a0a0c' : 'rgba(255,255,255,0.6)'}
                          />
                          <Text style={[styles.draftChipText, active && styles.draftChipTextActive]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>

              {/* ─── Group: Visibilità ─────────────────────────────── */}
              <Text style={styles.groupLabel}>VISIBILITÀ</Text>
              <View style={styles.groupCard}>
                <TouchableOpacity
                  style={styles.row}
                  activeOpacity={0.75}
                  onPress={() => !isPublishing && onChangeIsPublic(!publishIsPublic)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLabel}>Mostra in Explore</Text>
                    <Text style={styles.rowHint}>Altri utenti potranno aprirla e remixarla</Text>
                  </View>
                  <View style={[styles.toggleTrack, publishIsPublic && styles.toggleTrackOn]}>
                    <View style={[styles.toggleThumb, publishIsPublic && styles.toggleThumbOn]} />
                  </View>
                </TouchableOpacity>
                {publishIsPublic && (
                  <>
                    <View style={styles.rowSeparator} />
                    <TouchableOpacity
                      style={styles.row}
                      onPress={() => setShowUsernameModal(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.rowLabel, { flex: 1 }]}>Username</Text>
                      <View style={styles.rowChevronWrap}>
                        <Text style={styles.rowChevronValue}>
                          {savedUsername ? `@${savedUsername}` : 'Imposta'}
                        </Text>
                        <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.35)" />
                      </View>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              <UsernameModal
                visible={showUsernameModal}
                initialValue={savedUsername || ''}
                onClose={() => setShowUsernameModal(false)}
                onSaved={(u) => setSavedUsername(u)}
              />

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

              {/* ─── Footer: full-width primary CTA + text links ──── */}
              <TouchableOpacity
                style={[styles.primaryCta, isPublishing && { opacity: 0.5 }]}
                onPress={onPublish}
                disabled={isPublishing || (!existingPublish && !publishSlug.trim())}
                activeOpacity={0.85}
              >
                <Ionicons name={existingPublish ? 'refresh' : 'cloud-upload-outline'} size={17} color="#fff" />
                <Text style={styles.primaryCtaText}>
                  {existingPublish ? t('terminal:publish.update') : t('terminal:publish.publish')}
                </Text>
              </TouchableOpacity>

              <View style={styles.footerLinkRow}>
                <TouchableOpacity onPress={onClose} disabled={isPublishing} hitSlop={8}>
                  <Text style={styles.footerLinkNeutral}>{t('terminal:publish.cancel')}</Text>
                </TouchableOpacity>
                {existingPublish && !isPublishing && (
                  <>
                    <View style={styles.footerLinkSeparator} />
                    <TouchableOpacity
                      onPress={() => { tracciaDePubblicato(existingPublish.slug); onUnpublish(); }}
                      hitSlop={8}
                    >
                      <Text style={styles.footerLinkDanger}>{t('terminal:publish.remove')}</Text>
                    </TouchableOpacity>
                  </>
                )}
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
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
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
  publishSlugSuffix: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.4)',
    marginLeft: 2,
  },
  unpublishLink: {
    alignSelf: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  unpublishLinkText: {
    fontSize: 12,
    color: 'rgba(255, 59, 48, 0.7)',
    fontWeight: '500',
  },

  // ─── Settings-style edit layout ────────────────────────────────────
  editHero: {
    paddingTop: 4,
    paddingBottom: 22,
    alignItems: 'flex-start',
  },
  editStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  editStatusDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#00D084',
  },
  editStatusText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  editUrlRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  editUrlSlug: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  editUrlDomain: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 17,
    fontWeight: '500',
    letterSpacing: -0.3,
  },

  groupLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  groupCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 18,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: 46,
  },
  rowStacked: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginLeft: 14,
  },
  rowLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  rowHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    marginTop: 2,
  },
  rowValueWrap: {
    flex: 1,
    marginLeft: 12,
  },
  rowInput: {
    color: '#fff',
    fontSize: 14,
    padding: 0,
  },
  rowMultilineInput: {
    color: '#fff',
    fontSize: 14,
    padding: 0,
    marginTop: 8,
    minHeight: 50,
    textAlignVertical: 'top',
    lineHeight: 19,
  },
  rowChevronWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowChevronValue: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
  },

  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  categoryGridChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  categoryGridChipActive: {
    backgroundColor: '#A78BFA',
    borderColor: '#A78BFA',
  },
  categoryGridChipText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '500',
  },
  categoryGridChipTextActive: {
    color: '#0a0a0c',
    fontWeight: '700',
  },

  // ─── Draft editor card ───────────────────────────────────────────
  draftCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    marginBottom: 18,
  },
  draftTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.6,
    lineHeight: 30,
    padding: 0,
  },
  draftDescription: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    minHeight: 44,
    textAlignVertical: 'top',
    padding: 0,
  },
  draftFooter: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: -4,
  },
  draftChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  draftChipActive: {
    backgroundColor: '#A78BFA',
  },
  draftChipText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '500',
  },
  draftChipTextActive: {
    color: '#0a0a0c',
    fontWeight: '700',
  },

  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: '#A78BFA',
    marginTop: 6,
  },
  primaryCtaText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  footerLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingTop: 16,
    paddingBottom: 4,
  },
  footerLinkNeutral: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '500',
  },
  footerLinkDanger: {
    color: 'rgba(255,59,48,0.85)',
    fontSize: 13,
    fontWeight: '500',
  },
  footerLinkSeparator: {
    width: 3, height: 3, borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
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
