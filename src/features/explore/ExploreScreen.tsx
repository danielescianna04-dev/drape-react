// Explore — public gallery surface inside the app.
//
// Pulls the same /api/explore feed the web page uses, renders cards
// with a tiny screenshot-like preview (snapshot via WebView in a
// scaled-down container), and exposes a one-tap Remix that calls
// /creator/published/:slug/remix and lands the user in the editor
// of the new project.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { config } from '../../config/config';
import { getAuthHeaders } from '../../core/api/getAuthToken';
import { useNavigationStore } from '../../core/navigation/navigationStore';
import { useProjectStore } from '../../core/projects/projectStore';

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

const CATEGORIES: { id: string; label: string }[] = [
  { id: '', label: 'Tutto' },
  { id: 'app', label: 'App' },
  { id: 'game', label: 'Giochi' },
  { id: 'tool', label: 'Tool' },
  { id: 'site', label: 'Siti' },
  { id: 'art', label: 'Arte' },
  { id: 'other', label: 'Altro' },
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
  const [remixingSlug, setRemixingSlug] = useState<string | null>(null);
  const loadedFor = useRef<{ category: string }>({ category: '' });

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

  // Reload on first mount or category change.
  useEffect(() => {
    if (loadedFor.current.category !== category) {
      loadedFor.current.category = category;
      setItems([]);
      setCursor(null);
      setHasMore(true);
      load('initial');
    }
  }, [category, load]);

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
      // Open the remix in the editor.
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
    <View style={styles.card}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => WebBrowser.openBrowserAsync(item.url)}
        style={styles.cardTop}
      >
        <View style={styles.cardThumb}>
          <Ionicons name="globe-outline" size={32} color="rgba(167,139,250,0.45)" />
        </View>
      </TouchableOpacity>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        {!!item.description && (
          <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
        )}
        <View style={styles.cardMeta}>
          <Text style={styles.cardAuthor}>
            {item.authorUsername ? `@${item.authorUsername}` : 'creator anonimo'}
          </Text>
          <Text style={styles.cardViews}>{item.viewCount} 👁</Text>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.btnSecondary}
            onPress={() => WebBrowser.openBrowserAsync(item.url)}
          >
            <Ionicons name="open-outline" size={14} color="#fff" />
            <Text style={styles.btnSecondaryText}>Apri</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={() => handleRemix(item)}
            disabled={remixingSlug === item.slug}
          >
            {remixingSlug === item.slug ? (
              <ActivityIndicator size="small" color="#0a0a0c" />
            ) : (
              <>
                <Ionicons name="git-branch-outline" size={14} color="#0a0a0c" />
                <Text style={styles.btnPrimaryText}>Remix</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  ), [handleRemix, remixingSlug]);

  const header = useMemo(() => (
    <View>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Explore</Text>
          <Text style={styles.subtitle}>App pubblicate dalla community. Aprile o remixale.</Text>
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
        {CATEGORIES.map(c => {
          const active = category === c.id;
          return (
            <TouchableOpacity
              key={c.id || 'all'}
              style={[styles.cat, active && styles.catActive]}
              onPress={() => setCategory(c.id)}
            >
              <Text style={[styles.catText, active && styles.catTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  ), [category, onClose]);

  return (
    <View style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={i => i.slug}
        renderItem={renderItem}
        numColumns={2}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={header}
        ListEmptyComponent={!loading ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Ancora nessuna app pubblica</Text>
            <Text style={styles.emptyText}>Pubblica la tua e attiva "Mostra in Explore".</Text>
          </View>
        ) : null}
        ListFooterComponent={loading && items.length > 0 ? (
          <ActivityIndicator color="#A78BFA" style={{ marginVertical: 24 }} />
        ) : null}
        onEndReached={() => load('more')}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor="#A78BFA" />
        }
        contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0c' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 8, paddingVertical: 16 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { color: 'rgba(255,255,255,0.55)', fontSize: 14, marginTop: 4 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  cats: { paddingVertical: 8, paddingHorizontal: 4, gap: 6 },
  cat: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginRight: 6 },
  catActive: { backgroundColor: '#A78BFA', borderColor: '#A78BFA' },
  catText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '500' },
  catTextActive: { color: '#0a0a0c', fontWeight: '700' },
  row: { gap: 8 },
  card: { flex: 1, backgroundColor: '#131318', borderRadius: 16, borderWidth: 1, borderColor: '#2a2a36', overflow: 'hidden', marginBottom: 8 },
  cardTop: { width: '100%' },
  cardThumb: { width: '100%', aspectRatio: 16 / 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1c24' },
  cardBody: { padding: 10 },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  cardDesc: { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 4 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  cardAuthor: { color: '#A78BFA', fontSize: 11 },
  cardViews: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  cardActions: { flexDirection: 'row', gap: 6, marginTop: 10 },
  btnSecondary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' },
  btnSecondaryText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  btnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 10, backgroundColor: '#A78BFA' },
  btnPrimaryText: { color: '#0a0a0c', fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', padding: 60 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 6, textAlign: 'center' },
});
