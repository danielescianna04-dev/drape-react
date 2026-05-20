// Insights — page-level dossier for a published Drape project.
// Visual style matches the rest of the app (Settings/Chat): purple gradient
// backdrop, Liquid Glass cards, standard typography. Renders inside a tab.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Share,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard as SystemGlass } from '../../../settings/components/GlassCard';
import { AppColors } from '../../../../shared/theme/colors';
import { config } from '../../../../config/config';
import { getAuthHeaders } from '../../../../core/api/getAuthToken';
import type { Tab } from '../../../../core/tabs/tabStore';

const HEADER_TOP_GAP = 56;

// ─────────────────────────────────────────────────────────────────────────────
// Data shapes
// ─────────────────────────────────────────────────────────────────────────────

interface AnalyticsSummary {
  totalViews: number;
  uniqueVisitors: number;
  byDay: { day: string; views: number }[];
  topCountries: { country: string; views: number }[];
  topReferrers: { referrer: string; views: number }[];
}

interface VersionRow {
  id: string;
  versionNumber: number;
  sizeBytes: number | null;
  message: string | null;
  isActive: boolean;
  createdAt: string;
}

interface DomainRow {
  domain: string;
  status: string;
  createdAt: string;
  verifiedAt: string | null;
  lastError: string | null;
}

type Section = 'analytics' | 'versions' | 'domain';

// ─────────────────────────────────────────────────────────────────────────────
// Reusable Glass card — matches the pattern used in Settings
// ─────────────────────────────────────────────────────────────────────────────

const GlassCard: React.FC<{ children: React.ReactNode; style?: any; innerStyle?: any }> = ({
  children, style, innerStyle,
}) => {
  return (
    <SystemGlass style={[s.glassCard, style]}>
      <View style={[s.glassInner, (s as any).glassReadableSurface, innerStyle]}>
        {children}
      </View>
    </SystemGlass>
  );
};

const GlassPill: React.FC<{
  active?: boolean;
  onPress: () => void;
  style?: any;
  children: React.ReactNode;
}> = ({ active, onPress, style, children }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={style}>
    <SystemGlass style={s.tabGlass}>
      <View style={[s.tabContent, s.tabReadableSurface, active && s.tabContentActive]}>
        {children}
      </View>
    </SystemGlass>
  </TouchableOpacity>
);

// ─────────────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────────────

interface Props { tab: Tab }

export const InsightsView: React.FC<Props> = ({ tab }) => {
  const insets = useSafeAreaInsets();
  const projectId = (tab.data?.projectId as string) || '';
  const [section, setSection] = useState<Section>('analytics');

  return (
    <View style={s.page}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient
          colors={['#0C0816', '#1a0a2e', '#2d0845', '#0C0816']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: 0.35 }]}
        />
        <LinearGradient
          colors={['#0C0816', '#1E1040', '#0C0816']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: 0.3 }]}
        />
      </View>

      <View style={[s.tabsRow, { paddingTop: insets.top + HEADER_TOP_GAP }]}>
        {([
          { id: 'analytics', label: 'Analytics', icon: 'stats-chart-outline' },
          { id: 'versions', label: 'Versioni', icon: 'time-outline' },
          { id: 'domain', label: 'Dominio', icon: 'globe-outline' },
        ] as const).map((t) => {
          const active = section === t.id;
          return (
            <GlassPill
              key={t.id}
              active={active}
              onPress={() => setSection(t.id)}
              style={{ flex: 1 }}
            >
              <Ionicons
                name={t.icon as any}
                size={14}
                color={active ? '#fff' : 'rgba(255,255,255,0.55)'}
              />
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>{t.label}</Text>
            </GlassPill>
          );
        })}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {section === 'analytics' && <AnalyticsSection projectId={projectId} />}
        {section === 'versions' && <VersionsSection projectId={projectId} />}
        {section === 'domain' && <DomainSection projectId={projectId} />}
      </ScrollView>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Loading / empty primitives
// ─────────────────────────────────────────────────────────────────────────────

const Loader = () => (
  <View style={{ paddingVertical: 60, alignItems: 'center' }}>
    <ActivityIndicator color={AppColors.primary} />
  </View>
);

const EmptyBlock: React.FC<{ icon: keyof typeof Ionicons.glyphMap; title: string; copy: string }> = ({
  icon, title, copy,
}) => (
  <GlassCard innerStyle={{ paddingVertical: 36, alignItems: 'center' }}>
    <View style={s.emptyIconWrap}>
      <Ionicons name={icon} size={26} color={AppColors.primary} />
    </View>
    <Text style={s.emptyTitle}>{title}</Text>
    <Text style={s.emptyCopy}>{copy}</Text>
  </GlassCard>
);

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text style={s.sectionLabel}>{children}</Text>
);

// ─────────────────────────────────────────────────────────────────────────────
// Analytics
// ─────────────────────────────────────────────────────────────────────────────

const AnalyticsSection: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const headers = await getAuthHeaders();
        const r = await fetch(
          `${config.apiUrl}/creator/projects/${encodeURIComponent(projectId)}/analytics`,
          { headers },
        );
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setErr(j?.error || 'Errore nel caricamento');
          return;
        }
        setData(j.summary);
        setSlug(j.slug);
      } catch (e: any) {
        if (!cancelled) setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const maxViews = useMemo(
    () => Math.max(1, ...(data?.byDay.map((d) => d.views) || [0])),
    [data],
  );

  const url = slug ? `https://${slug}.drape.info` : '';

  const onShare = useCallback(() => {
    if (url) Share.share({ url, message: url }).catch(() => {});
  }, [url]);

  const onCopy = useCallback(async () => {
    if (url) await Clipboard.setStringAsync(url);
  }, [url]);

  const onOpen = useCallback(() => {
    if (url) Linking.openURL(url).catch(() => {});
  }, [url]);

  if (loading) return <Loader />;
  if (err) {
    return <EmptyBlock icon="cloud-offline-outline" title="Impossibile caricare le statistiche" copy={err} />;
  }
  if (!slug || !data) {
    return (
      <EmptyBlock
        icon="rocket-outline"
        title="Pubblica per iniziare"
        copy="Le statistiche compaiono qui dopo la prima pubblicazione."
      />
    );
  }

  const noVisits = data.totalViews === 0;

  // ─── Empty hero: when no visits, the page is just a share CTA ─────────
  if (noVisits) {
    return (
      <View>
        <ShareHero url={url} onCopy={onCopy} onShare={onShare} onOpen={onOpen} />

        <GlassCard innerStyle={{ padding: 16 }}>
          <Text style={s.cardEyebrow}>COSA VEDRAI</Text>
          <View style={s.previewList}>
            <PreviewItem icon="eye-outline" title="Visite e visitatori unici" />
            <PreviewItem icon="bar-chart-outline" title="Andamento giornaliero" />
            <PreviewItem icon="globe-outline" title="Paesi di provenienza" />
            <PreviewItem icon="link-outline" title="Sorgenti di traffico" />
          </View>
        </GlassCard>
      </View>
    );
  }

  // ─── With data ────────────────────────────────────────────────────────
  return (
    <View>
      {/* Hero stats — visite + unici + share */}
      <GlassCard innerStyle={{ padding: 16 }}>
        <View style={s.heroStatsRow}>
          <View style={s.heroStat}>
            <Text style={s.heroStatLabel}>Visite · 30g</Text>
            <Text style={s.heroStatValue}>{formatBig(data.totalViews)}</Text>
          </View>
          <View style={s.heroStatDivider} />
          <View style={s.heroStat}>
            <Text style={s.heroStatLabel}>Visitatori unici</Text>
            <Text style={s.heroStatValue}>{formatBig(data.uniqueVisitors)}</Text>
          </View>
        </View>
        <View style={s.heroDivider} />
        <View style={s.heroUrlRow}>
          <View style={s.heroUrlIconWrap}>
            <Ionicons name="globe-outline" size={14} color={AppColors.primary} />
          </View>
          <Text style={s.heroUrl} numberOfLines={1}>{url.replace(/^https?:\/\//, '')}</Text>
          <TouchableOpacity onPress={onCopy} style={s.heroIconBtn} hitSlop={8} activeOpacity={0.6}>
            <Ionicons name="copy-outline" size={15} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onShare} style={s.heroIconBtn} hitSlop={8} activeOpacity={0.6}>
            <Ionicons name="share-outline" size={15} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
        </View>
      </GlassCard>

      {/* Chart */}
      <GlassCard innerStyle={{ padding: 16 }}>
        <View style={s.cardHeadRow}>
          <Text style={s.cardTitle}>Andamento</Text>
          <Text style={s.cardSubtle}>Ultimi {data.byDay.length || 30} giorni</Text>
        </View>
        {data.byDay.length === 0 ? (
          <View style={s.cardMiniEmpty}>
            <Ionicons name="trending-up-outline" size={18} color="rgba(255,255,255,0.4)" />
            <Text style={s.miniEmptyText}>Le visite arrivano qui</Text>
          </View>
        ) : (
          <>
            <View style={s.chart}>
              {data.byDay.map((d) => {
                const isPeak = d.views === maxViews && d.views > 0;
                return (
                  <View key={d.day} style={s.barCol}>
                    <View
                      style={[
                        s.bar,
                        { height: Math.max(3, (d.views / maxViews) * 90) },
                        isPeak && { backgroundColor: AppColors.primary, opacity: 1 },
                      ]}
                    />
                  </View>
                );
              })}
            </View>
            <View style={s.chartAxisRow}>
              <Text style={s.chartAxis}>{firstDayLabel(data.byDay)}</Text>
              <Text style={s.chartAxis}>{lastDayLabel(data.byDay)}</Text>
            </View>
          </>
        )}
      </GlassCard>

      {/* Origini combinato — paesi + referrer */}
      <GlassCard innerStyle={{ padding: 0 }}>
        <View style={[s.cardHeadRow, { padding: 16, paddingBottom: 4 }]}>
          <Text style={s.cardTitle}>Origini</Text>
        </View>

        <View style={s.subSectionHead}>
          <Ionicons name="globe-outline" size={13} color="rgba(255,255,255,0.55)" />
          <Text style={s.subSectionLabel}>PAESI</Text>
        </View>
        {data.topCountries.length === 0 ? (
          <Text style={s.inlineEmpty}>Geografia non ancora disponibile</Text>
        ) : (
          data.topCountries.map((c, i) => (
            <RankedRow
              key={c.country}
              isLast={i === data.topCountries.length - 1}
              label={c.country}
              value={c.views}
              max={data.topCountries[0].views}
            />
          ))
        )}

        <View style={[s.subSectionHead, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.07)' }]}>
          <Ionicons name="link-outline" size={13} color="rgba(255,255,255,0.55)" />
          <Text style={s.subSectionLabel}>SORGENTI</Text>
        </View>
        {data.topReferrers.length === 0 ? (
          <Text style={s.inlineEmpty}>Solo traffico diretto, per ora</Text>
        ) : (
          data.topReferrers.map((r, i) => (
            <RankedRow
              key={r.referrer}
              isLast={i === data.topReferrers.length - 1}
              label={prettifyReferrer(r.referrer)}
              value={r.views}
              max={data.topReferrers[0].views}
            />
          ))
        )}
      </GlassCard>
    </View>
  );
};

// Hero share card — shown when no visits yet
const ShareHero: React.FC<{
  url: string;
  onCopy: () => void;
  onShare: () => void;
  onOpen: () => void;
}> = ({ url, onCopy, onShare, onOpen }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    await onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }, [onCopy]);

  return (
    <GlassCard innerStyle={{ padding: 22, alignItems: 'center' }}>
      <View style={s.shareIconWrap}>
        <Ionicons name="paper-plane-outline" size={22} color={AppColors.primary} />
      </View>
      <Text style={s.shareTitle}>Condividi il tuo sito</Text>
      <Text style={s.shareCopy}>
        Le statistiche compaiono appena arrivano le prime visite. Inizia da qui.
      </Text>

      <View style={s.urlPill}>
        <Text style={s.urlPillText} numberOfLines={1}>{url.replace(/^https?:\/\//, '')}</Text>
      </View>

      <View style={s.shareBtnRow}>
        <TouchableOpacity style={s.shareBtnSecondary} onPress={handleCopy} activeOpacity={0.7}>
          <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={15} color="#fff" />
          <Text style={s.shareBtnSecondaryText}>{copied ? 'Copiato' : 'Copia'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.shareBtnSecondary} onPress={onOpen} activeOpacity={0.7}>
          <Ionicons name="open-outline" size={15} color="#fff" />
          <Text style={s.shareBtnSecondaryText}>Apri</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.shareBtnPrimary} onPress={onShare} activeOpacity={0.7}>
          <Ionicons name="share-outline" size={15} color="#fff" />
          <Text style={s.shareBtnPrimaryText}>Condividi</Text>
        </TouchableOpacity>
      </View>
    </GlassCard>
  );
};

const PreviewItem: React.FC<{ icon: keyof typeof Ionicons.glyphMap; title: string }> = ({
  icon, title,
}) => (
  <View style={s.previewItem}>
    <View style={s.previewItemIcon}>
      <Ionicons name={icon} size={14} color="rgba(255,255,255,0.7)" />
    </View>
    <Text style={s.previewItemText}>{title}</Text>
  </View>
);

const RankedRow: React.FC<{ isLast?: boolean; label: string; value: number; max: number }> = ({
  isLast, label, value, max,
}) => {
  const ratio = max > 0 ? value / max : 0;
  return (
    <View style={[s.rankedRow, !isLast && s.rankedRowBorder]}>
      <View style={{ flex: 1 }}>
        <Text style={s.rankLabel} numberOfLines={1}>{label}</Text>
        <View style={s.rankBarTrack}>
          <View style={[s.rankBarFill, { width: `${Math.max(4, ratio * 100)}%` }]} />
        </View>
      </View>
      <Text style={s.rankValue}>{formatBig(value)}</Text>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Versions
// ─────────────────────────────────────────────────────────────────────────────

const VersionsSection: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const r = await fetch(
        `${config.apiUrl}/creator/projects/${encodeURIComponent(projectId)}/versions`,
        { headers },
      );
      const j = await r.json();
      setVersions(j.versions || []);
    } catch {
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const rollback = useCallback((v: VersionRow) => {
    Alert.alert(
      'Ripristina versione',
      `Tornare alla v${v.versionNumber} del ${new Date(v.createdAt).toLocaleString()}?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Ripristina',
          style: 'destructive',
          onPress: async () => {
            setRollingBack(v.id);
            try {
              const headers = await getAuthHeaders();
              const r = await fetch(
                `${config.apiUrl}/creator/projects/${encodeURIComponent(projectId)}/rollback/${encodeURIComponent(v.id)}`,
                { method: 'POST', headers },
              );
              if (!r.ok) {
                const j = await r.json().catch(() => ({}));
                Alert.alert('Errore', j?.error || 'Rollback non riuscito');
                return;
              }
              await load();
              Alert.alert('Fatto', `v${v.versionNumber} è ora attiva.`);
            } catch (e: any) {
              Alert.alert('Errore', String(e?.message || e));
            } finally {
              setRollingBack(null);
            }
          },
        },
      ],
    );
  }, [projectId, load]);

  if (loading) return <Loader />;
  if (!versions || versions.length === 0) {
    return (
      <EmptyBlock
        icon="layers-outline"
        title="Nessuna versione"
        copy="Ogni pubblicazione viene archiviata qui. Pubblica una volta e vedrai v1."
      />
    );
  }

  return (
    <View>
      <SectionLabel>Cronologia pubblicazioni</SectionLabel>
      {versions.map((v) => (
        <GlassCard key={v.id} innerStyle={s.versionCard}>
          <View style={{ flex: 1 }}>
            <View style={s.versionHeadRow}>
              <Text style={s.versionNum}>v{v.versionNumber}</Text>
              {v.isActive && (
                <View style={s.activePill}>
                  <View style={s.activeDot} />
                  <Text style={s.activePillText}>Attiva</Text>
                </View>
              )}
            </View>
            <Text style={s.versionMeta}>
              {formatDate(v.createdAt)}
              {v.sizeBytes ? `  ·  ${(v.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ''}
            </Text>
            {!!v.message && <Text style={s.versionMessage}>{v.message}</Text>}
          </View>
          {!v.isActive && (
            <TouchableOpacity
              style={s.rollbackBtn}
              onPress={() => rollback(v)}
              disabled={rollingBack === v.id}
              activeOpacity={0.7}
            >
              {rollingBack === v.id ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="arrow-undo" size={13} color="#fff" />
                  <Text style={s.rollbackBtnText}>Ripristina</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </GlassCard>
      ))}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Domain
// ─────────────────────────────────────────────────────────────────────────────

const DomainSection: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [domains, setDomains] = useState<DomainRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<{ name: string; value: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const r = await fetch(
        `${config.apiUrl}/creator/projects/${encodeURIComponent(projectId)}/custom-domains`,
        { headers },
      );
      const j = await r.json();
      setDomains(j.domains || []);
    } catch {
      setDomains([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const add = useCallback(async () => {
    setErr(null);
    const domain = input.trim().toLowerCase();
    if (!domain) return;
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const r = await fetch(
        `${config.apiUrl}/creator/projects/${encodeURIComponent(projectId)}/custom-domain`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ domain }),
        },
      );
      const j = await r.json();
      if (!r.ok) {
        setErr(j?.message || j?.error || 'Errore nella registrazione');
        return;
      }
      setInstructions({
        name: j.instructions?.name || domain,
        value: j.instructions?.value || 'cname.drape.app',
      });
      setInput('');
      await load();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }, [input, projectId, load]);

  const remove = useCallback((domain: string) => {
    Alert.alert('Rimuovere dominio?', domain, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Rimuovi',
        style: 'destructive',
        onPress: async () => {
          try {
            const headers = await getAuthHeaders();
            await fetch(
              `${config.apiUrl}/creator/custom-domain/${encodeURIComponent(domain)}`,
              { method: 'DELETE', headers },
            );
            await load();
          } catch {}
        },
      },
    ]);
  }, [load]);

  const copy = useCallback(async (value: string) => {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }, []);

  return (
    <View>
      <SectionLabel>Aggiungi un dominio</SectionLabel>
      <GlassCard innerStyle={{ padding: 12 }}>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="esempio.com"
            placeholderTextColor="rgba(255,255,255,0.35)"
            editable={!saving}
            onSubmitEditing={add}
            returnKeyType="done"
          />
          <TouchableOpacity
            onPress={add}
            disabled={saving || !input}
            style={[s.addBtn, (!input || saving) && { opacity: 0.4 }]}
            activeOpacity={0.7}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.addBtnText}>Aggiungi</Text>
            )}
          </TouchableOpacity>
        </View>
        {err && (
          <View style={s.errRow}>
            <Ionicons name="alert-circle-outline" size={14} color={AppColors.dark.error} />
            <Text style={s.errText}>{err}</Text>
          </View>
        )}
      </GlassCard>

      {instructions && (
        <>
          <SectionLabel>Configura il DNS</SectionLabel>
          <GlassCard innerStyle={{ padding: 16 }}>
            <Text style={s.dnsHint}>
              Aggiungi questo record CNAME nel tuo registrar:
            </Text>
            <View style={s.dnsTable}>
              <DnsRow label="Tipo" value="CNAME" />
              <DnsRow label="Nome" value={instructions.name} />
              <DnsRow
                label="Valore"
                value={instructions.value}
                action={
                  <TouchableOpacity onPress={() => copy(instructions.value)} activeOpacity={0.7}>
                    <View style={s.copyPill}>
                      <Ionicons
                        name={copied ? 'checkmark' : 'copy-outline'}
                        size={11}
                        color={AppColors.primary}
                      />
                      <Text style={s.copyPillText}>{copied ? 'Copiato' : 'Copia'}</Text>
                    </View>
                  </TouchableOpacity>
                }
              />
              <DnsRow label="TTL" value="3600" isLast />
            </View>
            <Text style={s.dnsFootnote}>
              La verifica richiede pochi minuti. Il certificato TLS viene emesso automaticamente.
            </Text>
          </GlassCard>
        </>
      )}

      <SectionLabel>Domini configurati</SectionLabel>
      {loading ? (
        <Loader />
      ) : domains && domains.length > 0 ? (
        <View>
          {domains.map((d) => (
            <GlassCard key={d.domain} innerStyle={s.domainCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.domainName}>{d.domain}</Text>
                <View style={s.domainStatusRow}>
                  <View style={[s.statusDot, statusFill(d.status)]} />
                  <Text style={s.domainStatus}>{statusLabel(d.status)}</Text>
                </View>
                {!!d.lastError && (
                  <View style={[s.errRow, { marginTop: 6 }]}>
                    <Ionicons name="alert-circle-outline" size={12} color={AppColors.dark.error} />
                    <Text style={s.errText}>{d.lastError}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={() => remove(d.domain)} hitSlop={10} style={s.removeBtn}>
                <Ionicons name="trash-outline" size={16} color="rgba(255,255,255,0.55)" />
              </TouchableOpacity>
            </GlassCard>
          ))}
        </View>
      ) : (
        <EmptyBlock
          icon="globe-outline"
          title="Nessun dominio personalizzato"
          copy="Aggiungine uno qui sopra. Il progetto resta raggiungibile sul subdominio drape.info."
        />
      )}
    </View>
  );
};

const DnsRow: React.FC<{ label: string; value: string; action?: React.ReactNode; isLast?: boolean }> = ({
  label, value, action, isLast,
}) => (
  <View style={[s.dnsTableRow, !isLast && s.dnsTableRowBorder]}>
    <Text style={s.dnsTableLabel}>{label}</Text>
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
      <Text style={s.dnsTableValue} numberOfLines={1}>{value}</Text>
      {action}
    </View>
  </View>
);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatBig(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function firstDayLabel(rows: { day: string }[]) {
  if (!rows.length) return '';
  const d = rows[0].day;
  return d.length >= 10 ? d.slice(5) : d;
}
function lastDayLabel(rows: { day: string }[]) {
  if (!rows.length) return '';
  const d = rows[rows.length - 1].day;
  return d.length >= 10 ? d.slice(5) : d;
}

function prettifyReferrer(r: string): string {
  if (!r || r === 'Direct') return 'Diretto';
  try {
    return new URL(r).hostname.replace(/^www\./, '');
  } catch {
    return r;
  }
}

function statusFill(status: string) {
  switch (status) {
    case 'active': return { backgroundColor: AppColors.dark.success };
    case 'verified': return { backgroundColor: AppColors.primary };
    case 'pending': return { backgroundColor: AppColors.dark.warning };
    case 'failed': return { backgroundColor: AppColors.dark.error };
    default: return { backgroundColor: 'rgba(255,255,255,0.3)' };
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'active': return 'Attivo';
    case 'verified': return 'DNS verificato, in emissione cert';
    case 'pending': return 'In attesa del DNS';
    case 'failed': return 'Verifica fallita';
    default: return status;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — aligned with Settings/Chat patterns
// ─────────────────────────────────────────────────────────────────────────────

const PRIMARY_TINT = `${AppColors.primary}26`; // ~15% alpha

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0A0812' },

  header: { paddingHorizontal: 18, paddingBottom: 12 },
  title: { color: '#F5F4FA', fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 4 },

  // Tabs
  tabsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  // LiquidGlass shell — explicit height (LG doesn't size from intrinsic content).
  tabGlass: {
    borderRadius: 12,
    overflow: 'hidden',
    height: 40,
  },
  tabContent: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabReadableSurface: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  tabContentActive: {
    backgroundColor: PRIMARY_TINT,
    borderColor: `${AppColors.primary}55`,
  },
  // Legacy (still referenced if needed)
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  tabBtnActive: {
    backgroundColor: PRIMARY_TINT,
    borderColor: `${AppColors.primary}55`,
  },
  tabLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600' },
  tabLabelActive: { color: '#fff' },

  // Section labels
  sectionLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
    marginTop: 22,
    marginBottom: 10,
    paddingHorizontal: 4,
  },

  // Glass card — outer wrapper + tinted inner (tinted is overridden to transparent
  // when LiquidGlass is supported). Mirrors AllProjectsScreen pattern.
  glassCard: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 12,
  },
  glassInner: {
    backgroundColor: 'rgba(20,20,22,0.5)',
    borderRadius: 18,
  },

  // Solid card — visible on every device, used for analytics where LG fades
  solidCard: {
    backgroundColor: 'rgba(20,18,30,0.82)',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    marginBottom: 12,
  },
  cardEyebrow: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  cardHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { color: '#F5F4FA', fontSize: 15, fontWeight: '700' },
  cardSubtle: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '500' },
  cardMiniEmpty: { alignItems: 'center', paddingVertical: 22, gap: 8 },

  // Hero stats
  heroStatsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  heroStat: { flex: 1 },
  heroStatLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '500' },
  heroStatValue: { color: '#F5F4FA', fontSize: 32, fontWeight: '700', letterSpacing: -0.7, marginTop: 4 },
  heroStatDivider: { width: StyleSheet.hairlineWidth, height: 36, backgroundColor: 'rgba(255,255,255,0.12)', marginHorizontal: 14 },
  heroDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 14 },
  heroUrlRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroUrlIconWrap: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: PRIMARY_TINT,
    alignItems: 'center', justifyContent: 'center',
  },
  heroUrl: { flex: 1, color: '#F5F4FA', fontSize: 13, fontWeight: '500' },
  heroIconBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Sub-section inside combined card
  subSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  subSectionLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  inlineEmpty: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
    fontStyle: 'italic',
  },

  // Share hero (no-visits state)
  shareHero: {
    backgroundColor: 'rgba(20,18,30,0.82)',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 22,
    marginBottom: 14,
    alignItems: 'center',
  },
  shareIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: PRIMARY_TINT,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  shareTitle: { color: '#F5F4FA', fontSize: 19, fontWeight: '700', letterSpacing: -0.3 },
  shareCopy: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 8,
  },
  urlPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 18, marginBottom: 14,
    alignSelf: 'stretch',
  },
  urlPillText: { color: '#F5F4FA', fontSize: 13, fontWeight: '500', flex: 1, textAlign: 'center' },
  shareBtnRow: { flexDirection: 'row', gap: 8, alignSelf: 'stretch' },
  shareBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
  },
  shareBtnSecondaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  shareBtnPrimary: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    backgroundColor: AppColors.primary,
    borderRadius: 12,
  },
  shareBtnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Preview list (what you'll see)
  previewList: { gap: 10 },
  previewItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewItemIcon: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
  },
  previewItemText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '500' },

  // Tiles
  tileRow: { flexDirection: 'row', gap: 12 },
  tile: { padding: 16 },
  tileLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '500' },
  tileValue: { color: '#F5F4FA', fontSize: 30, fontWeight: '700', letterSpacing: -0.6, marginTop: 6 },

  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  hintText: { color: 'rgba(255,255,255,0.55)', fontSize: 12, flex: 1, lineHeight: 17 },

  // Mini empty inside card
  miniEmpty: { alignItems: 'center', paddingVertical: 22, gap: 8 },
  miniEmptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },

  // Chart
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 100,
    gap: 4,
  },
  barCol: { flex: 1, alignItems: 'stretch' },
  bar: { width: '100%', backgroundColor: AppColors.primary, borderRadius: 3, opacity: 0.85 },
  chartAxisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  chartAxis: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },

  // Ranked rows
  rankedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rankedRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rankLabel: { color: '#F5F4FA', fontSize: 14, fontWeight: '500' },
  rankBarTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    marginTop: 7,
    overflow: 'hidden',
  },
  rankBarFill: { height: '100%', backgroundColor: AppColors.primary, borderRadius: 2 },
  rankValue: {
    color: '#F5F4FA',
    fontSize: 14,
    fontWeight: '700',
    minWidth: 50,
    textAlign: 'right',
    marginLeft: 12,
  },

  footnote: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 28,
  },

  // Empty block
  emptyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: PRIMARY_TINT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { color: '#F5F4FA', fontSize: 15, fontWeight: '600' },
  emptyCopy: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 24,
  },

  // Versions
  versionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  versionHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  versionNum: { color: '#F5F4FA', fontSize: 16, fontWeight: '700' },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: `${AppColors.dark.success}26`,
    borderRadius: 8,
  },
  activeDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: AppColors.dark.success },
  activePillText: { color: AppColors.dark.success, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  versionMeta: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 },
  versionMessage: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 6 },
  rollbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: AppColors.primary,
    borderRadius: 10,
  },
  rollbackBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Domain
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    color: '#F5F4FA',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
  },
  addBtn: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: AppColors.primary,
    borderRadius: 10,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  errRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  errText: { color: AppColors.dark.error, fontSize: 12, flex: 1 },

  dnsHint: { color: 'rgba(255,255,255,0.65)', fontSize: 13, lineHeight: 18 },
  dnsTable: { marginTop: 12, marginBottom: 4 },
  dnsTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
  },
  dnsTableRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  dnsTableLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, width: 70, fontWeight: '500' },
  dnsTableValue: { color: '#F5F4FA', fontSize: 13 },
  copyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: PRIMARY_TINT,
    borderRadius: 8,
  },
  copyPillText: { color: AppColors.primary, fontSize: 11, fontWeight: '700' },
  dnsFootnote: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    marginTop: 14,
    lineHeight: 17,
  },

  domainCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  domainName: { color: '#F5F4FA', fontSize: 14, fontWeight: '600' },
  domainStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  domainStatus: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  removeBtn: { padding: 6 },
});
