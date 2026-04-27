// Plugins (Skills) — page-level marketplace + manager.
// 3 tab: Miei plugin / Marketplace / Crea. Style aligned with InsightsView.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard as SystemGlass } from '../../../settings/components/GlassCard';
import { AppColors } from '../../../../shared/theme/colors';
import { skillsApi, SKILL_CATEGORIES, type Skill, type SkillCategory, type SkillDraftInput } from '../../../../core/api/skillsApi';
import type { Tab } from '../../../../core/tabs/tabStore';

const HEADER_TOP_GAP = 56;
const PRIMARY_TINT = `${AppColors.primary}26`;

type SubTab = 'mine' | 'marketplace' | 'create';

interface Props { tab: Tab }

// ─── Glass pill — same pattern as the burger/chat/dots header buttons ──
// Uses the same shared GlassCard wrapper as VSCodeSidebarHeader buttons.
const GlassPill: React.FC<{
  active?: boolean;
  onPress?: () => void;
  style?: any;
  contentStyle?: any;
  children: React.ReactNode;
}> = ({ active, onPress, style, contentStyle, children }) => {
  const glass = (
    <SystemGlass style={s.pillGlass}>
      <View style={[s.pillContent, s.pillReadableSurface, active && s.pillContentActive, contentStyle]}>
        {children}
      </View>
    </SystemGlass>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={style}>
        {glass}
      </TouchableOpacity>
    );
  }

  return <View style={style}>{glass}</View>;
};

// ─── Glass card — same pattern as CreateProjectScreen.interviewCard ─────
// Same native liquid material used by the header buttons.
const GlassCard: React.FC<{ children: React.ReactNode; style?: any; contentStyle?: any }> = ({
  children, style, contentStyle,
}) => {
  return (
    <SystemGlass style={[s.glassCard, style]}>
      <View style={[s.glassCardContent, s.glassReadableSurface, contentStyle]}>
        {children}
      </View>
    </SystemGlass>
  );
};

// ─── Root ─────────────────────────────────────────────────────────────────

export const PluginsView: React.FC<Props> = () => {
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState<SubTab>('mine');
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // When the editor saves, jump back to Miei + force list reload.
  const onSaved = useCallback(() => {
    setEditingSkill(null);
    setReloadKey((k) => k + 1);
    setSection('mine');
  }, []);

  return (
    <View style={s.page}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient
          colors={['#1a0a2e', '#2d0845', AppColors.primary, '#0A0A0F']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: 0.55 }]}
        />
        <LinearGradient
          colors={['#0A0A0F', '#4c1d95', '#1a0a2e', '#0A0A0F']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: 0.45 }]}
        />
      </View>

      <View style={[s.tabsRow, { paddingTop: insets.top + HEADER_TOP_GAP }]}>
        {([
          { id: 'mine',         label: 'Miei plugin',  icon: 'cube-outline' },
          { id: 'marketplace',  label: 'Marketplace',  icon: 'sparkles-outline' },
        ] as const).map((t) => {
          const active = section === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              activeOpacity={0.7}
              onPress={() => { setEditingSkill(null); setSection(t.id); }}
              style={[s.tabBtn, active && s.tabBtnActive]}
            >
              <Ionicons name={t.icon as any} size={14} color={active ? '#fff' : 'rgba(255,255,255,0.55)'} />
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {section === 'mine' && (
          <MineSection
            reloadKey={reloadKey}
            onEdit={(sk) => { setEditingSkill(sk); setSection('create'); }}
            onDeleted={() => setReloadKey((k) => k + 1)}
            onPublished={() => setReloadKey((k) => k + 1)}
            onCreate={() => { setEditingSkill(null); setSection('create'); }}
          />
        )}
        {section === 'marketplace' && (
          <MarketplaceSection
            onInstalled={() => setReloadKey((k) => k + 1)}
          />
        )}
        {section === 'create' && (
          <EditorSection
            initial={editingSkill || undefined}
            onSaved={onSaved}
            onCancel={() => { setEditingSkill(null); setSection('mine'); }}
          />
        )}
      </ScrollView>
    </View>
  );
};

// ─── Reusable: skill row (compact) ────────────────────────────────────────

const SkillRow: React.FC<{
  skill: Skill;
  rightSlot?: React.ReactNode;
  onPress?: () => void;
}> = ({ skill, rightSlot, onPress }) => {
  const cat = SKILL_CATEGORIES.find((c) => c.id === skill.category);
  return (
    <TouchableOpacity activeOpacity={onPress ? 0.7 : 1} onPress={onPress} disabled={!onPress}>
      <GlassCard contentStyle={{ padding: 14 }}>
        <View style={s.rowHead}>
          <View style={s.rowIconWrap}>
            <Ionicons name={(cat?.icon || 'cube-outline') as any} size={16} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={s.rowTitleLine}>
              <Text style={s.rowSlash}>/{skill.slash}</Text>
              {skill.isOfficial && (
                <View style={s.verifiedBadge}>
                  <Ionicons name="checkmark" size={10} color="#fff" />
                </View>
              )}
              {skill.isPrivate && !skill.isOfficial && (
                <View style={s.privateBadge}>
                  <Ionicons name="lock-closed" size={9} color="#fff" />
                  <Text style={s.privateBadgeText}>PRIVATO</Text>
                </View>
              )}
            </View>
            <Text style={s.rowName} numberOfLines={1}>{skill.name}</Text>
            <Text style={s.rowDesc} numberOfLines={2}>{skill.description}</Text>
            <View style={s.rowMeta}>
              {!!skill.authorUsername && <Text style={s.rowMetaText}>@{skill.authorUsername}</Text>}
              {!!skill.installCount && (
                <>
                  {!!skill.authorUsername && <View style={s.metaDot} />}
                  <Text style={s.rowMetaText}>{skill.installCount} installazioni</Text>
                </>
              )}
            </View>
          </View>
          {rightSlot}
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
};

const Loader = () => (
  <View style={{ paddingVertical: 60, alignItems: 'center' }}>
    <ActivityIndicator color={AppColors.primary} />
  </View>
);

const EmptyBlock: React.FC<{ icon: keyof typeof Ionicons.glyphMap; title: string; copy: string; cta?: { label: string; onPress: () => void } }> = ({
  icon, title, copy, cta,
}) => (
  <GlassCard contentStyle={{ paddingVertical: 36, alignItems: 'center', paddingHorizontal: 24 }}>
    <View style={s.emptyIconWrap}>
      <Ionicons name={icon} size={26} color="#fff" />
    </View>
    <Text style={s.emptyTitle}>{title}</Text>
    <Text style={s.emptyCopy}>{copy}</Text>
    {cta && (
      <TouchableOpacity style={s.emptyCtaBtn} onPress={cta.onPress} activeOpacity={0.8}>
        <Text style={s.emptyCtaText}>{cta.label}</Text>
      </TouchableOpacity>
    )}
  </GlassCard>
);

// ─── Section: Miei plugin ─────────────────────────────────────────────────

const MineSection: React.FC<{
  reloadKey: number;
  onEdit: (s: Skill) => void;
  onDeleted: () => void;
  onPublished: () => void;
  onCreate: () => void;
}> = ({ reloadKey, onEdit, onDeleted, onPublished, onCreate }) => {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    skillsApi.listMine()
      .then((res) => { if (!cancelled) setSkills(res.skills); })
      .catch(() => { if (!cancelled) setSkills([]); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const handleDelete = useCallback((skill: Skill) => {
    Alert.alert(
      'Elimina plugin',
      `Vuoi eliminare /${skill.slash}? Questa azione è irreversibile.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            setBusy(skill.id);
            try {
              await skillsApi.delete(skill.id);
              onDeleted();
            } catch (e: any) {
              Alert.alert('Errore', e?.message || 'Eliminazione fallita');
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  }, [onDeleted]);

  const handlePublish = useCallback((skill: Skill) => {
    Alert.alert(
      'Pubblica nel marketplace',
      `Pubblicare /${skill.slash}? Sarà visibile a tutti gli utenti Drape.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Pubblica',
          onPress: async () => {
            setBusy(skill.id);
            try {
              await skillsApi.publish(skill.id);
              onPublished();
              Alert.alert('Pubblicato', `/${skill.slash} è ora nel marketplace.`);
            } catch (e: any) {
              Alert.alert('Errore', e?.message || 'Pubblicazione fallita');
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  }, [onPublished]);

  if (skills === null) return <Loader />;

  if (skills.length === 0) {
    return (
      <EmptyBlock
        icon="cube-outline"
        title="Nessun plugin installato"
        copy="Esplora il marketplace per installarne uno, oppure crea il tuo primo plugin personale."
        cta={{ label: 'Crea il primo', onPress: onCreate }}
      />
    );
  }

  return (
    <View style={{ gap: 8 }}>
      {skills.map((skill) => (
        <SkillRow
          key={skill.id}
          skill={skill}
          onPress={() => onEdit(skill)}
          rightSlot={
            <View style={s.rowActions}>
              {busy === skill.id ? (
                <ActivityIndicator size="small" color={AppColors.primary} />
              ) : (
                <>
                  {skill.isPrivate && !skill.isOfficial && (
                    <TouchableOpacity onPress={() => handlePublish(skill)} hitSlop={8} style={s.iconBtn}>
                      <Ionicons name="cloud-upload-outline" size={16} color="rgba(255,255,255,0.7)" />
                    </TouchableOpacity>
                  )}
                  {!skill.isOfficial && (
                    <TouchableOpacity onPress={() => handleDelete(skill)} hitSlop={8} style={s.iconBtn}>
                      <Ionicons name="trash-outline" size={16} color="rgba(255,255,255,0.55)" />
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          }
        />
      ))}
    </View>
  );
};

// ─── Section: Marketplace ─────────────────────────────────────────────────
// App Store-style discovery layout: search → hero featured → "ufficiali"
// horizontal carousel → per-category carousels. When the user types in
// search, switch to a flat results list.

const MarketplaceSection: React.FC<{ onInstalled: () => void }> = ({ onInstalled }) => {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [search, setSearch] = useState('');
  const [installing, setInstalling] = useState<string | null>(null);
  const [installedSlashes, setInstalledSlashes] = useState<Set<string>>(new Set());

  const reloadInstalled = useCallback(async () => {
    try {
      const mine = await skillsApi.listMine();
      setInstalledSlashes(new Set(mine.skills.map((sk) => sk.slash)));
    } catch {
      // ignore — UI degrades gracefully (just shows install buttons everywhere)
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    skillsApi.listMarketplace({})
      .then((res) => { if (!cancelled) setSkills(res.skills); })
      .catch(() => { if (!cancelled) setSkills([]); });
    reloadInstalled();
    return () => { cancelled = true; };
  }, [reloadInstalled]);

  const handleInstall = useCallback(async (skill: Skill) => {
    setInstalling(skill.id);
    try {
      await skillsApi.install(skill.id);
      setInstalledSlashes((prev) => {
        const next = new Set(prev);
        next.add(skill.slash);
        return next;
      });
      onInstalled();
      Alert.alert('Installato', `/${skill.slash} è ora disponibile in chat.`);
    } catch (e: any) {
      Alert.alert('Errore', e?.message || 'Installazione fallita');
    } finally {
      setInstalling(null);
    }
  }, [onInstalled]);

  // Featured = most installed, breaks ties to "official" first.
  const featured = useMemo(() => {
    if (!skills || skills.length === 0) return null;
    const sorted = [...skills].sort((a, b) => {
      if (b.installCount !== a.installCount) return b.installCount - a.installCount;
      if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1;
      return 0;
    });
    return sorted[0];
  }, [skills]);

  const officials = useMemo(
    () => (skills || []).filter((sk) => sk.isOfficial && sk.id !== featured?.id),
    [skills, featured],
  );

  const byCategory = useMemo(() => {
    const map = new Map<SkillCategory, Skill[]>();
    if (skills) {
      for (const sk of skills) {
        if (sk.id === featured?.id) continue;
        const arr = map.get(sk.category) || [];
        arr.push(sk);
        map.set(sk.category, arr);
      }
    }
    return map;
  }, [skills, featured]);

  // Search → flat results
  const searchResults = useMemo(() => {
    if (!skills) return null;
    const q = search.toLowerCase().trim();
    if (!q) return null;
    return skills.filter((sk) =>
      sk.slash.includes(q) ||
      sk.name.toLowerCase().includes(q) ||
      sk.description.toLowerCase().includes(q) ||
      sk.tags.some((t) => t.includes(q))
    );
  }, [skills, search]);

  if (skills === null) return <Loader />;

  return (
    <View>
      {/* Search */}
      <GlassPill
        style={{ marginBottom: 18 }}
        contentStyle={[s.searchPillContent, { paddingHorizontal: 16, paddingVertical: 11, gap: 10, justifyContent: 'flex-start' }]}
      >
        <Ionicons name="search" size={15} color="rgba(255,255,255,0.5)" />
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Cerca plugin..."
          placeholderTextColor="rgba(255,255,255,0.4)"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={15} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        )}
      </GlassPill>

      {/* Search mode: flat results */}
      {searchResults !== null ? (
        searchResults.length === 0 ? (
          <EmptyBlock
            icon="search-outline"
            title="Nessun risultato"
            copy={`Nessun plugin trovato per "${search}".`}
          />
        ) : (
          <View style={{ gap: 8, marginTop: 6 }}>
            {searchResults.map((skill) => (
              <CompactRow
                key={skill.id}
                skill={skill}
                installing={installing === skill.id}
                installed={installedSlashes.has(skill.slash)}
                onInstall={() => handleInstall(skill)}
              />
            ))}
          </View>
        )
      ) : (
        <>
          {/* Hero — featured plugin */}
          {featured && (
            <FeaturedHero
              skill={featured}
              installing={installing === featured.id}
              installed={installedSlashes.has(featured.slash)}
              onInstall={() => handleInstall(featured)}
            />
          )}

          {/* Carousel — Drape officials */}
          {officials.length > 0 && (
            <CarouselSection
              title="Ufficiali Drape"
              caption="Curati dal team"
              icon="sparkles"
              skills={officials}
              installingId={installing}
              installedSlashes={installedSlashes}
              onInstall={handleInstall}
            />
          )}

          {/* Per-category carousels */}
          {SKILL_CATEGORIES.map((cat) => {
            const list = byCategory.get(cat.id) || [];
            if (list.length === 0) return null;
            return (
              <CarouselSection
                key={cat.id}
                title={cat.label}
                caption={`${list.length} ${list.length === 1 ? 'plugin' : 'plugin'}`}
                icon={cat.icon as any}
                skills={list}
                installingId={installing}
                installedSlashes={installedSlashes}
                onInstall={handleInstall}
              />
            );
          })}
        </>
      )}
    </View>
  );
};

// ─── Featured hero ────────────────────────────────────────────────────────

const FeaturedHero: React.FC<{
  skill: Skill;
  installing: boolean;
  installed?: boolean;
  onInstall: () => void;
}> = ({ skill, installing, installed, onInstall }) => {
  const cat = SKILL_CATEGORIES.find((c) => c.id === skill.category);
  return (
    <GlassCard style={{ marginBottom: 22, marginTop: 4 }}>
      {/* Eyebrow */}
      <View style={s.heroEyebrowRow}>
        <Ionicons name="sparkles" size={11} color="#fff" />
        <Text style={s.heroEyebrow}>IN EVIDENZA</Text>
        {skill.isOfficial && (
          <>
            <View style={s.heroEyebrowDot} />
            <Text style={s.heroEyebrowMeta}>Ufficiale Drape</Text>
          </>
        )}
        {!!skill.installCount && (
          <>
            <View style={s.heroEyebrowDot} />
            <Text style={s.heroEyebrowMeta}>{skill.installCount} install</Text>
          </>
        )}
      </View>

      {/* Title block */}
      <View style={{ marginTop: 16 }}>
        <View style={s.heroTitleRow}>
          <Ionicons name={(cat?.icon || 'cube-outline') as any} size={16} color="#fff" />
          <Text style={s.heroSlash}>/{skill.slash}</Text>
        </View>
        <Text style={s.heroName} numberOfLines={1}>{skill.name}</Text>
      </View>

      {/* Description */}
      <Text style={s.heroDesc}>{skill.description}</Text>

      {/* Single CTA — full width */}
      <TouchableOpacity
        onPress={onInstall}
        disabled={installing || installed}
        style={[s.heroCta, (installing || installed) && s.heroCtaInstalled]}
        activeOpacity={0.85}
      >
        {installing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : installed ? (
          <>
            <Ionicons name="checkmark" size={16} color="#fff" />
            <Text style={s.heroCtaText}>Installato</Text>
          </>
        ) : (
          <>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={s.heroCtaText}>Installa /{skill.slash}</Text>
          </>
        )}
      </TouchableOpacity>
    </GlassCard>
  );
};

// ─── Carousel section ─────────────────────────────────────────────────────

const CarouselSection: React.FC<{
  title: string;
  caption?: string;
  icon: keyof typeof Ionicons.glyphMap;
  skills: Skill[];
  installingId: string | null;
  installedSlashes?: Set<string>;
  onInstall: (skill: Skill) => void;
}> = ({ title, caption, icon, skills, installingId, installedSlashes, onInstall }) => (
  <View style={{ marginBottom: 22 }}>
    <View style={s.carouselHeading}>
      <View style={s.carouselHeadingIcon}>
        <Ionicons name={icon} size={13} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.carouselTitle}>{title}</Text>
        {caption ? <Text style={s.carouselCaption}>{caption}</Text> : null}
      </View>
    </View>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingRight: 16, gap: 10 }}
      style={{ marginHorizontal: -16 }}
    >
      <View style={{ width: 16 }} />
      {skills.map((skill) => (
        <SkillTile
          key={skill.id}
          skill={skill}
          installing={installingId === skill.id}
          installed={!!installedSlashes?.has(skill.slash)}
          onInstall={() => onInstall(skill)}
        />
      ))}
    </ScrollView>
  </View>
);

// ─── Compact tile (used in carousels) ────────────────────────────────────

const SkillTile: React.FC<{
  skill: Skill;
  installing: boolean;
  installed?: boolean;
  onInstall: () => void;
}> = ({ skill, installing, installed, onInstall }) => {
  const cat = SKILL_CATEGORIES.find((c) => c.id === skill.category);
  return (
    <View style={{ width: 210 }}>
      <GlassCard contentStyle={{ padding: 14 }}>
        <View style={s.tileTop}>
          <View style={s.tileIconBox}>
            <Ionicons name={(cat?.icon || 'cube-outline') as any} size={16} color="#fff" />
          </View>
          {skill.isOfficial && (
            <View style={s.verifiedBadge}>
              <Ionicons name="checkmark" size={11} color="#fff" />
            </View>
          )}
        </View>
        <Text style={s.tileSlash} numberOfLines={1}>/{skill.slash}</Text>
        <Text style={s.tileName} numberOfLines={1}>{skill.name}</Text>
        <Text style={s.tileDesc} numberOfLines={3}>{skill.description}</Text>
        <TouchableOpacity
          onPress={onInstall}
          disabled={installing || installed}
          style={[s.tileCta, installing && { opacity: 0.5 }, installed && s.tileCtaInstalled]}
          activeOpacity={0.85}
        >
          {installing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : installed ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="checkmark" size={12} color="#fff" />
              <Text style={s.tileCtaText}>Installato</Text>
            </View>
          ) : (
            <Text style={s.tileCtaText}>+ Installa</Text>
          )}
        </TouchableOpacity>
      </GlassCard>
    </View>
  );
};

// ─── Compact row (used in search results) ────────────────────────────────

const CompactRow: React.FC<{
  skill: Skill;
  installing: boolean;
  installed?: boolean;
  onInstall: () => void;
}> = ({ skill, installing, installed, onInstall }) => {
  const cat = SKILL_CATEGORIES.find((c) => c.id === skill.category);
  return (
    <GlassCard contentStyle={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={s.compactIconBox}>
        <Ionicons name={(cat?.icon || 'cube-outline') as any} size={16} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <View style={s.compactTitleRow}>
          <Text style={s.compactSlash}>/{skill.slash}</Text>
          {skill.isOfficial && (
            <View style={s.officialBadge}>
              <Ionicons name="checkmark" size={9} color="#0a0a0c" />
              <Text style={s.officialBadgeText}>OFFICIAL</Text>
            </View>
          )}
        </View>
        <Text style={s.compactDesc} numberOfLines={2}>{skill.description}</Text>
      </View>
      <TouchableOpacity
        onPress={onInstall}
        disabled={installing || installed}
        style={[s.compactCta, installing && { opacity: 0.5 }, installed && s.tileCtaInstalled]}
        activeOpacity={0.85}
      >
        {installing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : installed ? (
          <Ionicons name="checkmark" size={16} color="#fff" />
        ) : (
          <Ionicons name="add" size={16} color="#fff" />
        )}
      </TouchableOpacity>
    </GlassCard>
  );
};

// ─── Section: Crea / Editor ──────────────────────────────────────────────

const EditorSection: React.FC<{
  initial?: Skill;
  onSaved: () => void;
  onCancel: () => void;
}> = ({ initial, onSaved, onCancel }) => {
  const [slash, setSlash] = useState(initial?.slash || '');
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [category, setCategory] = useState<SkillCategory>(initial?.category || 'build');
  const [body, setBody] = useState(initial?.body || '');
  const [tags, setTags] = useState((initial?.tags || []).join(', '));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isEdit = !!initial;
  const isReadOnly = isEdit && initial?.isOfficial;

  const handleSave = useCallback(async () => {
    setErr(null);
    const payload: SkillDraftInput = {
      slash: slash.trim().replace(/^\/+/, ''),
      name: name.trim(),
      description: description.trim(),
      category,
      body: body.trim(),
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    };
    setSaving(true);
    try {
      if (isEdit && initial) {
        await skillsApi.update(initial.id, payload);
      } else {
        await skillsApi.create(payload);
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.message || 'Salvataggio fallito');
    } finally {
      setSaving(false);
    }
  }, [slash, name, description, category, body, tags, isEdit, initial, onSaved]);

  if (isReadOnly) {
    return (
      <EmptyBlock
        icon="lock-closed-outline"
        title="Plugin ufficiale"
        copy="Questo è un plugin curato dal team Drape e non può essere modificato. Forka una copia per personalizzarlo."
      />
    );
  }

  return (
    <View>
      <Text style={s.fieldLabel}>NOME COMANDO</Text>
      <GlassCard style={{ marginBottom: 12 }} contentStyle={{ paddingHorizontal: 12, paddingVertical: 10 }}>
        <View style={s.slashRow}>
          <Text style={s.slashPrefix}>/</Text>
          <TextInput
            style={s.slashInput}
            value={slash}
            onChangeText={(v) => setSlash(v.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
            placeholder="landing-page"
            placeholderTextColor="rgba(255,255,255,0.3)"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving && !isEdit}
          />
        </View>
      </GlassCard>

      <Text style={s.fieldLabel}>NOME E DESCRIZIONE</Text>
      <GlassCard style={{ marginBottom: 12 }} contentStyle={{ padding: 12 }}>
        <TextInput
          style={s.input}
          value={name}
          onChangeText={setName}
          placeholder="Es. Landing page"
          placeholderTextColor="rgba(255,255,255,0.3)"
          maxLength={60}
          editable={!saving}
        />
        <View style={s.inputDivider} />
        <TextInput
          style={[s.input, { minHeight: 50 }]}
          value={description}
          onChangeText={setDescription}
          placeholder="Cosa fa questa skill in 1-2 frasi"
          placeholderTextColor="rgba(255,255,255,0.3)"
          multiline
          maxLength={200}
          editable={!saving}
        />
      </GlassCard>

      <Text style={s.fieldLabel}>CATEGORIA</Text>
      <View style={s.catRow}>
        {SKILL_CATEGORIES.map((c) => {
          const active = category === c.id;
          return (
            <TouchableOpacity
              key={c.id}
              style={[s.catPill, active && s.catPillActive]}
              onPress={() => setCategory(c.id)}
              activeOpacity={0.7}
              disabled={saving}
            >
              <Ionicons name={c.icon as any} size={12} color={active ? '#0a0a0c' : 'rgba(255,255,255,0.7)'} />
              <Text style={[s.catPillText, active && s.catPillTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={s.fieldLabel}>PROMPT</Text>
      <Text style={s.fieldHint}>
        Scrivi le istruzioni che l'AI dovrà seguire quando l'utente invoca questo comando. Markdown ok.
      </Text>
      <GlassCard style={{ marginBottom: 12 }} contentStyle={{ padding: 12 }}>
        <TextInput
          style={[s.input, { minHeight: 220 }]}
          value={body}
          onChangeText={setBody}
          placeholder={`Esempio:\nYou are building a high-conversion landing page.\n\nRequired sections:\n1. Hero with single CTA\n2. ...`}
          placeholderTextColor="rgba(255,255,255,0.25)"
          multiline
          textAlignVertical="top"
          editable={!saving}
        />
      </GlassCard>

      <Text style={s.fieldLabel}>TAG (separati da virgola)</Text>
      <GlassCard style={{ marginBottom: 16 }} contentStyle={{ paddingHorizontal: 12, paddingVertical: 10 }}>
        <TextInput
          style={s.input}
          value={tags}
          onChangeText={setTags}
          placeholder="landing, marketing, conversion"
          placeholderTextColor="rgba(255,255,255,0.3)"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!saving}
        />
      </GlassCard>

      {err && (
        <View style={s.errBox}>
          <Ionicons name="alert-circle" size={14} color="#FF6B6B" />
          <Text style={s.errText}>{err}</Text>
        </View>
      )}

      <View style={s.footerRow}>
        <TouchableOpacity onPress={onCancel} disabled={saving} style={s.cancelBtn} hitSlop={8}>
          <Text style={s.cancelText}>Annulla</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || !slash || !name || !description || body.length < 20}
          style={[s.saveBtn, (!slash || !name || !description || body.length < 20 || saving) && { opacity: 0.5 }]}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name={isEdit ? 'save-outline' : 'add'} size={15} color="#fff" />
              <Text style={s.saveText}>{isEdit ? 'Salva' : 'Crea plugin'}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0A0812' },

  tabsRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
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
  // Glass pill (used for tabs + search). LiquidGlassView doesn't size from
  // intrinsic content reliably — explicit height is required.
  pillGlass: {
    borderRadius: 22,
    overflow: 'hidden',
    height: 44,
  },
  pillContent: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 22,
  },
  pillReadableSurface: {
    backgroundColor: 'rgba(28, 18, 54, 0.24)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(197,178,255,0.14)',
  },
  pillContentActive: {
    backgroundColor: `${AppColors.primary}33`,
    borderWidth: 1,
    borderColor: `${AppColors.primary}80`,
  },
  searchPillContent: {
    backgroundColor: 'rgba(28, 18, 54, 0.28)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(197,178,255,0.14)',
  },
  tabLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600' },
  tabLabelActive: { color: '#fff' },

  // Same structure as VSCodeSidebarHeader buttons:
  // <SystemGlass shell><View content /></SystemGlass>.
  glassCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  glassCardContent: {
    padding: 18,
  },
  glassReadableSurface: {
    borderRadius: 20,
    backgroundColor: 'rgba(28, 18, 54, 0.34)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(197,178,255,0.18)',
    borderTopColor: 'rgba(255,255,255,0.22)',
  },

  // Skill row
  rowHead: { flexDirection: 'row', gap: 12 },
  rowIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: PRIMARY_TINT,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  rowSlash: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'Menlo' },
  rowName: { color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: '500' },
  rowDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 16, marginTop: 2 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  rowMetaText: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  metaDot: { width: 2, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { padding: 6 },
  // Verified badge — X/Twitter style: small glowing primary disc with a white check.
  verifiedBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: AppColors.primary,
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  privateBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: PRIMARY_TINT, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4,
  },
  privateBadgeText: { color: AppColors.primary, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  installBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: AppColors.primary,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    alignSelf: 'flex-start',
  },
  installBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Marketplace search
  searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 4 },

  // Hero
  heroEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroEyebrow: {
    color: '#fff',
    fontSize: 10, fontWeight: '700', letterSpacing: 1.4,
  },
  heroEyebrowDot: {
    width: 3, height: 3, borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  heroEyebrowMeta: { color: 'rgba(255,255,255,0.55)', fontSize: 11 },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroSlash: { color: '#fff', fontSize: 22, fontWeight: '700', fontFamily: 'Menlo', letterSpacing: -0.5 },
  heroName: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 4, marginLeft: 24 },
  heroDesc: {
    color: 'rgba(255,255,255,0.78)', fontSize: 14, lineHeight: 20,
    marginTop: 14,
  },
  heroCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: AppColors.primary,
    paddingVertical: 13, borderRadius: 12,
    marginTop: 18,
  },
  heroCtaText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  heroCtaInstalled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },

  // Carousel section heading
  carouselHeading: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 12, paddingHorizontal: 4,
  },
  carouselHeadingIcon: {
    width: 24, height: 24, borderRadius: 8,
    backgroundColor: PRIMARY_TINT,
    alignItems: 'center', justifyContent: 'center',
  },
  carouselTitle: { color: '#F5F4FA', fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  carouselCaption: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 1 },

  // Tile (carousel card)
  tile: {
    width: 200,
    backgroundColor: 'rgba(20,20,22,0.6)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 12,
    gap: 4,
  },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tileIconBox: {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: PRIMARY_TINT,
    alignItems: 'center', justifyContent: 'center',
  },
  tileOfficial: {
    width: 16, height: 16, borderRadius: 4,
    backgroundColor: AppColors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  tileSlash: { color: '#fff', fontSize: 12, fontWeight: '700', fontFamily: 'Menlo', marginTop: 8 },
  tileName: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  tileDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11, lineHeight: 15, marginTop: 4,
    minHeight: 45,
  },
  tileCta: {
    marginTop: 8,
    backgroundColor: AppColors.primary,
    paddingVertical: 8, borderRadius: 10,
    alignItems: 'center',
  },
  tileCtaText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  tileCtaInstalled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },

  // Compact row (search results)
  compactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(20,20,22,0.5)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 12,
  },
  compactIconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: PRIMARY_TINT,
    alignItems: 'center', justifyContent: 'center',
  },
  compactTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  compactSlash: { color: '#fff', fontSize: 13, fontWeight: '700', fontFamily: 'Menlo' },
  compactDesc: { color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 16, marginTop: 4 },
  compactCta: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: AppColors.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  // Category chips (filter)
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)',
  },
  catChipActive: { backgroundColor: AppColors.primary, borderColor: AppColors.primary },
  catChipText: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' },
  catChipTextActive: { color: '#0a0a0c', fontWeight: '700' },

  // Empty
  emptyIconWrap: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: PRIMARY_TINT,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  emptyTitle: { color: '#F5F4FA', fontSize: 15, fontWeight: '600' },
  emptyCopy: { color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 6 },
  emptyCtaBtn: {
    marginTop: 16,
    backgroundColor: AppColors.primary,
    paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10,
  },
  emptyCtaText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Editor
  fieldLabel: {
    color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '700',
    letterSpacing: 1.2, marginBottom: 8, paddingHorizontal: 4, marginTop: 4,
  },
  fieldHint: {
    color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: 16,
    marginBottom: 8, paddingHorizontal: 4, marginTop: -4,
  },
  input: { color: '#fff', fontSize: 14, padding: 0 },
  inputDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.07)', marginVertical: 10 },
  slashRow: { flexDirection: 'row', alignItems: 'center' },
  slashPrefix: { color: 'rgba(255,255,255,0.4)', fontSize: 14, fontFamily: 'Menlo', marginRight: 2 },
  slashInput: { flex: 1, color: '#fff', fontSize: 14, fontFamily: 'Menlo', padding: 0 },

  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16, paddingHorizontal: 4 },
  catPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)',
  },
  catPillActive: { backgroundColor: AppColors.primary, borderColor: AppColors.primary },
  catPillText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '500' },
  catPillTextActive: { color: '#0a0a0c', fontWeight: '700' },

  errBox: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
    backgroundColor: 'rgba(255,107,107,0.12)',
    borderRadius: 10, padding: 10, marginBottom: 12,
  },
  errText: { color: '#FF6B6B', fontSize: 12, flex: 1 },

  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 12 },
  cancelText: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '500' },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: AppColors.primary,
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12,
  },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
