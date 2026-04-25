// Explore — public gallery surface inside the app.
//
// Visual language matches AllProjectsScreen so it feels like a
// peer surface ("Tutti i Progetti" vs "Explore"): same header,
// search bar, filter chip row, vertical list of cards.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, ScrollView, TextInput, Alert, Animated as RNAnimated,
} from 'react-native';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
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

  const renderItem = useCallback(({ item }: { item: ExploreItem }) => (
    <View style={styles.cardWrap}>
      <View style={[styles.cardInner, isLiquidGlassSupported && { backgroundColor: 'transparent' }]}>
        <TouchableOpacity
          style={styles.cardMain}
          activeOpacity={0.85}
          onPress={() => WebBrowser.openBrowserAsync(item.url)}
        >
          <View style={styles.projectIcon}>
            <Ionicons
              name={(CATEGORIES.find(c => c.id === item.category)?.icon || 'globe-outline') as any}
              size={22}
              color="#A78BFA"
            />
          </View>
          <View style={styles.projectInfo}>
            <Text style={styles.projectName} numberOfLines={1}>{item.title}</Text>
            <View style={styles.projectMetaRow}>
              <Text style={styles.projectLang} numberOfLines={1}>
                {item.authorUsername ? `@${item.authorUsername}` : 'creator anonimo'}
              </Text>
              <View style={styles.metaDot} />
              <Text style={styles.projectTime}>{item.viewCount} 👁</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.remixBtn}
            onPress={() => handleRemix(item)}
            disabled={remixingSlug === item.slug}
          >
            {remixingSlug === item.slug ? (
              <ActivityIndicator size="small" color="#A78BFA" />
            ) : (
              <Ionicons name="git-branch-outline" size={18} color="#A78BFA" />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
    </View>
  ), [handleRemix, remixingSlug]);

  const ListHeader = (
    <>
      <View style={styles.searchSection}>
        {isLiquidGlassSupported ? (
          <LiquidGlassView
            style={[styles.searchContainer, { backgroundColor: 'transparent', overflow: 'hidden' }]}
            interactive={true}
            effect="clear"
            colorScheme="dark"
          >
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
          </LiquidGlassView>
        ) : (
          <View style={[styles.searchContainer, styles.searchInner]}>
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
        )}
      </View>

      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {CATEGORIES.map(opt => {
            const active = category === opt.id;
            return (
              <TouchableOpacity
                key={opt.id || 'all'}
                style={styles.filterTab}
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
    </>
  );

  return (
    <View style={styles.container}>
      {/* Header — same shape as AllProjectsScreen */}
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

        {/* Spacer to keep title centered without an action button */}
        <View style={{ width: 44 }} />
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={i => i.slug}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
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
    backgroundColor: '#0A0812',
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
  searchContainer: {
    borderRadius: 100,
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 16,
    height: 48,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
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
  filterScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterTab: {
    borderRadius: 100,
  },
  filterTabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  filterTabActive: {
    backgroundColor: 'rgba(123, 107, 255, 0.15)',
    borderColor: 'rgba(123, 107, 255, 0.3)',
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
  cardWrap: {
    marginBottom: 10,
  },
  cardInner: {
    backgroundColor: 'rgba(20,20,22,0.5)',
    borderRadius: 14,
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  projectIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  projectMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  projectLang: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '400',
    flex: 1,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 8,
  },
  projectTime: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.25)',
    flexShrink: 0,
  },
  remixBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
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
