// Explore — public gallery surface inside the app.
//
// Visual language matches AllProjectsScreen so it feels like a
// peer surface ("Tutti i Progetti" vs "Explore"): same header,
// search bar, filter chip row, vertical list of cards.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, ScrollView, TextInput, Alert, Animated as RNAnimated,
  Image, Dimensions,
} from 'react-native';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { config } from '../../config/config';
import { getAuthHeaders } from '../../core/api/getAuthToken';
import { useNavigationStore } from '../../core/navigation/navigationStore';
import { useProjectStore } from '../../core/projects/projectStore';
import { AppColors } from '../../shared/theme/colors';

interface ExploreItem {
  slug: string;
  title: string;
  description: string;
  category: string;
  url: string;
  authorId: string;
  authorUsername?: string;
  viewCount: number;
  publishedAt: number;
}

interface ExploreCursor { cursorViews: number; cursorAt: number; }

const CATEGORIES: { id: string; label: string; icon: string }[] = [
  { id: '', label: 'Tutto', icon: 'apps-outline' },
  { id: 'app', label: 'App', icon: 'phone-portrait-outline' },
  { id: 'game', label: 'Giochi', icon: 'game-controller-outline' },
  { id: 'tool', label: 'Tool', icon: 'construct-outline' },
  { id: 'site', label: 'Siti', icon: 'globe-outline' },
  { id: 'art', label: 'Arte', icon: 'color-palette-outline' },
  { id: 'other', label: 'Altro', icon: 'ellipsis-horizontal' },
];

interface ExploreScreenProps {
  onClose?: () => void;
}

export const ExploreScreen: React.FC<ExploreScreenProps> = ({ onClose }) => {
  const [items, setItems] = useState<ExploreItem[]>([]);
  const [cursor, setCursor] = useState<ExploreCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [remixingSlug, setRemixingSlug] = useState<string | null>(null);
  const loadedFor = useRef<{ category: string }>({ category: '__init__' });

  const apiBase = config.apiUrl;

  const buildUrl = useCallback((cur: ExploreCursor | null) => {
    const params = new URLSearchParams();
    params.set('limit', '24');
    if (category) params.set('category', category);
    if (cur) {
      params.set('cursorViews', String(cur.cursorViews));
      params.set('cursorAt', String(cur.cursorAt));
    }
    return `${apiBase}/api/explore?${params.toString()}`;
  }, [apiBase, category]);

  const load = useCallback(async (mode: 'initial' | 'more' | 'refresh') => {
    if (mode === 'more' && (!hasMore || loading)) return;
    if (mode === 'initial' && loading) return;
    mode === 'refresh' ? setRefreshing(true) : setLoading(true);
    try {
      const cur = mode === 'more' ? cursor : null;
      const r = await fetch(buildUrl(cur));
      const data = await r.json();
      const next: ExploreItem[] = data.items || [];
      setItems(prev => mode === 'more' ? [...prev, ...next] : next);
      setCursor(data.nextCursor || null);
      setHasMore(!!data.nextCursor);
    } catch (e: any) {
      console.warn('[Explore] load failed:', e?.message || e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildUrl, cursor, hasMore, loading]);

  useEffect(() => {
    if (loadedFor.current.category !== category) {
      loadedFor.current.category = category;
      setItems([]);
      setCursor(null);
      setHasMore(true);
      load('initial');
    }
  }, [category, load]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      i.title.toLowerCase().includes(q) ||
      i.description.toLowerCase().includes(q) ||
      (i.authorUsername || '').toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  const handleRemix = useCallback(async (item: ExploreItem) => {
    if (remixingSlug) return;
    setRemixingSlug(item.slug);
    try {
      const headers = await getAuthHeaders();
      const r = await fetch(`${apiBase}/creator/published/${encodeURIComponent(item.slug)}/remix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
      });
      const data = await r.json();
      if (!r.ok) {
        const msg = data?.message || data?.error || 'Remix non riuscito';
        Alert.alert('Remix non riuscito', String(msg));
        return;
      }
      try {
        const { selectProjectAndOpen } = useProjectStore.getState() as any;
        if (typeof selectProjectAndOpen === 'function') {
          await selectProjectAndOpen(data.projectId);
        }
      } catch {}
      useNavigationStore.getState().navigateTo('terminal');
      onClose?.();
    } catch (e: any) {
      Alert.alert('Remix non riuscito', String(e?.message || e));
    } finally {
      setRemixingSlug(null);
    }
  }, [apiBase, remixingSlug, onClose]);

  const renderItem = useCallback(({ item }: { item: ExploreItem }) => {
    const shotUrl = `${apiBase}/api/explore/thumb/${encodeURIComponent(item.slug)}`;
    const catMeta = CATEGORIES.find(c => c.id === item.category) || CATEGORIES[CATEGORIES.length - 1];
    const isRemixing = remixingSlug === item.slug;
    return (
      <View style={styles.cardWrap}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.88}
          onPress={() => WebBrowser.openBrowserAsync(item.url)}
        >
          <View style={styles.posterWrap}>
            <Image source={{ uri: shotUrl }} style={styles.poster} resizeMode="cover" />
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)']}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.posterBadge}>
              <Ionicons name={catMeta.icon as any} size={11} color="rgba(255,255,255,0.9)" />
              <Text style={styles.posterBadgeLabel} numberOfLines={1}>{catMeta.label}</Text>
            </View>
            <TouchableOpacity
              style={styles.posterAction}
              onPress={() => handleRemix(item)}
              disabled={isRemixing}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#B79EFF', '#8B6BFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.posterActionInner}
              >
                {isRemixing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="git-branch" size={17} color="#fff" />
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
          <View style={styles.cardFooter}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
            <View style={styles.cardMetaRow}>
              <Text style={styles.cardAuthor} numberOfLines={1}>
                {item.authorUsername ? `@${item.authorUsername}` : 'anonimo'}
              </Text>
              <View style={styles.cardMetaDot} />
              <Ionicons name="eye-outline" size={12} color="rgba(255,255,255,0.5)" />
              <Text style={styles.cardViews}>{item.viewCount}</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  }, [handleRemix, remixingSlug]);

  return (
    <View style={styles.container}>
      {/* Branded gradient background — same atmosphere as Home/Create */}
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

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.7}
          onPress={onClose}
        >
          {isLiquidGlassSupported ? (
            <LiquidGlassView
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
              interactive={true}
              effect="clear"
              colorScheme="dark"
            >
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </LiquidGlassView>
          ) : (
            <Ionicons name="chevron-back" size={24} color="#fff" />
          )}
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Explore</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Search bar — borderless, glass capsule */}
      <View style={styles.searchSection}>
        <View style={styles.searchInner}>
          <Ionicons name="search" size={18} color="rgba(255,255,255,0.4)" />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Cerca..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter pills — rendered outside the FlatList so the
          horizontal padding is reliable and pills aren't clipped. */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
          contentOffset={{ x: 0, y: 0 }}
        >
          {CATEGORIES.map((opt, i) => {
            const active = category === opt.id;
            return (
              <TouchableOpacity
                key={opt.id || 'all'}
                style={[styles.filterTab, i === 0 && { marginLeft: 20 }, i === CATEGORIES.length - 1 && { marginRight: 20 }]}
                onPress={() => setCategory(opt.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.filterTabInner, active && styles.filterTabActive]}>
                  <Ionicons
                    name={opt.icon as any}
                    size={14}
                    color={active ? '#fff' : 'rgba(255,255,255,0.4)'}
                  />
                  <Text style={[styles.filterTabText, active && styles.filterTabTextActive]}>
                    {opt.label}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={i => i.slug}
        renderItem={renderItem}
        numColumns={2}
        columnWrapperStyle={styles.columnWrap}
        ListEmptyComponent={!loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Ancora nessuna app pubblica</Text>
            <Text style={styles.emptySubtext}>
              Pubblica la tua e attiva "Mostra in Explore" per apparire qui.
            </Text>
          </View>
        ) : null}
        ListFooterComponent={loading && items.length > 0 ? (
          <ActivityIndicator color={AppColors.primary} style={{ marginVertical: 24 }} />
        ) : null}
        onEndReached={() => load('more')}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load('refresh')}
            tintColor={AppColors.primary}
          />
        }
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0816',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    width: 44,
    height: 44,
    marginLeft: -10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
  },
  searchSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 100,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    fontWeight: '400',
  },
  filterSection: {
    paddingBottom: 16,
  },
  filterScrollContent: {
    alignItems: 'center',
  },
  filterTab: {
    marginRight: 8,
  },
  filterTabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  filterTabActive: {
    backgroundColor: 'rgba(123, 107, 255, 0.15)',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.4)',
  },
  filterTabTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 80,
  },
  columnWrap: {
    gap: 12,
    marginBottom: 16,
    justifyContent: 'flex-start',
  },
  cardWrap: {
    flexBasis: '48.5%',
    flexGrow: 0,
    flexShrink: 0,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18,
    overflow: 'hidden',
  },
  posterWrap: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    position: 'relative',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 100,
    backgroundColor: 'rgba(12,8,22,0.65)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  posterBadgeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: 0.1,
  },
  posterAction: {
    position: 'absolute',
    right: 10,
    bottom: -20,
    width: 44,
    height: 44,
    borderRadius: 22,
    padding: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#7B5BFF',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  posterActionInner: {
    flex: 1,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFooter: {
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardAuthor: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    flexShrink: 1,
  },
  cardMetaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 4,
  },
  cardViews: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
    gap: 16,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    lineHeight: 20,
  },
});
