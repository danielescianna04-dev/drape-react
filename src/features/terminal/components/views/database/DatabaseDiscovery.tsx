import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  databases: { path: string; fullPath: string }[];
  pgDetected: boolean;
  supabaseDetected?: boolean;
  supabaseUrl?: string;
  containerReady: boolean;
  isLoading: boolean;
  error: string | null;
  onSelectDb: (path: string) => void;
  onRetry: () => void;
}

export const DatabaseDiscovery: React.FC<Props> = ({ databases, pgDetected, supabaseDetected, supabaseUrl, containerReady, isLoading, error, onSelectDb, onRetry }) => {
  const insets = useSafeAreaInsets();

  if (isLoading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + 60 }]}>
        <View style={styles.loadingIconOuter}>
          <View style={styles.loadingIconInner}>
            <ActivityIndicator size="small" color="#8B5CF6" />
          </View>
        </View>
        <Text style={styles.loadingTitle}>Scanning project...</Text>
        <Text style={styles.loadingSubtitle}>Looking for SQLite databases</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + 40 }]}>
        <View style={styles.errorIconOuter}>
          <View style={styles.errorIconInner}>
            <Ionicons name="cloud-offline-outline" size={28} color="rgba(239, 68, 68, 0.8)" />
          </View>
        </View>
        <Text style={styles.errorTitle}>Connection failed</Text>
        <Text style={styles.errorSubtitle}>
          Unable to reach the project container.{'\n'}Make sure the project is running.
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={16} color="#fff" />
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Supabase detected — show connection info
  if (supabaseDetected && supabaseUrl) {
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
    return (
      <ScrollView contentContainerStyle={[styles.emptyContainer, { paddingTop: insets.top + 80 }]}>
        <View style={styles.glowWrap}>
          <View style={[styles.glowRing, { borderColor: 'rgba(62, 207, 142, 0.2)' }]}>
            <LinearGradient
              colors={['rgba(62, 207, 142, 0.15)', 'rgba(62, 207, 142, 0.03)']}
              style={styles.glowGradient}
            />
          </View>
          <View style={[styles.iconBox, { backgroundColor: 'rgba(62, 207, 142, 0.12)' }]}>
            <Ionicons name="cloud-done-outline" size={28} color="#3ECF8E" />
          </View>
        </View>

        <Text style={styles.emptyTitle}>Supabase Connected</Text>
        <Text style={styles.emptySubtitle}>
          Your project is connected to a Supabase database with PostgreSQL, Auth, and Storage.
        </Text>

        <View style={{ marginTop: 20, gap: 10, width: '100%', paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: 'rgba(62, 207, 142, 0.08)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(62, 207, 142, 0.15)' }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 4 }}>PROJECT URL</Text>
            <Text style={{ color: '#3ECF8E', fontSize: 13, fontFamily: 'monospace' }} numberOfLines={1}>{supabaseUrl}</Text>
          </View>

          <TouchableOpacity
            style={{ backgroundColor: 'rgba(62, 207, 142, 0.12)', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(62, 207, 142, 0.2)' }}
            onPress={() => {
              const url = projectRef
                ? `https://supabase.com/dashboard/project/${projectRef}`
                : 'https://supabase.com/dashboard';
              require('expo-web-browser').openBrowserAsync(url);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="open-outline" size={16} color="#3ECF8E" />
            <Text style={{ color: '#3ECF8E', fontSize: 14, fontWeight: '600' }}>Open Supabase Dashboard</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.retryBtn, { marginTop: 20 }]} onPress={onRetry} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={16} color="#fff" />
          <Text style={styles.retryBtnText}>Scan again</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (databases.length === 0) {
    return (
      <ScrollView contentContainerStyle={[styles.emptyContainer, { paddingTop: insets.top + 100 }]}>
        {/* Glowing icon */}
        <View style={styles.glowWrap}>
          <View style={styles.glowRing}>
            <LinearGradient
              colors={['rgba(139, 92, 246, 0.15)', 'rgba(139, 92, 246, 0.03)']}
              style={styles.glowGradient}
            />
          </View>
          <View style={styles.iconBox}>
            <Ionicons name="server-outline" size={28} color="#A78BFA" />
          </View>
        </View>

        <Text style={styles.emptyTitle}>No database</Text>
        <Text style={styles.emptySubtitle}>
          This project doesn't have a database yet.
        </Text>
        <Text style={styles.emptyHint}>
          Use <Text style={styles.cloudBadge}>Cloud Mode</Text> to ask AI to create one.
        </Text>

        {/* Suggestions */}
        <View style={styles.suggestSection}>
          <View style={styles.suggestHeader}>
            <View style={styles.suggestDot} />
            <Text style={styles.suggestLabel}>Try asking in chat</Text>
          </View>

          <TouchableOpacity style={styles.suggestCard} activeOpacity={0.6}>
            <Text style={styles.suggestQuote}>"</Text>
            <Text style={styles.suggestText}>Add a SQLite database with a users table</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.suggestCard} activeOpacity={0.6}>
            <Text style={styles.suggestQuote}>"</Text>
            <Text style={styles.suggestText}>Create a todo app with persistent storage</Text>
          </TouchableOpacity>
        </View>

        {/* Scan */}
        <TouchableOpacity style={styles.scanBtn} onPress={onRetry} activeOpacity={0.7}>
          <Ionicons name="scan-outline" size={15} color="#A78BFA" />
          <Text style={styles.scanBtnText}>Scan again</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.header}>Databases</Text>
      <Text style={styles.subtitle}>{databases.length} database{databases.length !== 1 ? 's' : ''} found</Text>

      {databases.map((db, i) => (
        <TouchableOpacity key={i} style={styles.dbCard} onPress={() => onSelectDb(db.path)} activeOpacity={0.7}>
          <View style={styles.dbIcon}>
            <Ionicons name="server" size={20} color="#8B5CF6" />
          </View>
          <View style={styles.dbInfo}>
            <Text style={styles.dbName} numberOfLines={1}>{db.path.split('/').pop()}</Text>
            <Text style={styles.dbPath} numberOfLines={1}>{db.path}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
        </TouchableOpacity>
      ))}

      {pgDetected && (
        <View style={[styles.dbCard, { opacity: 0.5 }]}>
          <View style={[styles.dbIcon, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
            <Ionicons name="logo-buffer" size={20} color="#3B82F6" />
          </View>
          <View style={styles.dbInfo}>
            <Text style={styles.dbName}>PostgreSQL</Text>
            <Text style={styles.dbPath}>Detected on port 5432 — coming soon</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },

  // Loading
  loadingIconOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(139, 92, 246, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  loadingIconInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
  },
  loadingSubtitle: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
  },

  // Error
  errorIconOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  errorIconInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  errorSubtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#8B5CF6',
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 48,
  },
  glowWrap: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  glowRing: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: 'hidden',
  },
  glowGradient: {
    flex: 1,
    borderRadius: 44,
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 4,
    marginBottom: 4,
  },
  cloudBadge: {
    color: '#A78BFA',
    fontWeight: '700',
  },

  // Suggestions
  suggestSection: {
    width: '100%',
    marginTop: 32,
  },
  suggestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  suggestDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8B5CF6',
  },
  suggestLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '500',
  },
  suggestCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 8,
  },
  suggestQuote: {
    color: '#8B5CF6',
    fontSize: 22,
    fontWeight: '300',
    lineHeight: 24,
    marginTop: -2,
  },
  suggestText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    flex: 1,
    lineHeight: 21,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
  },
  scanBtnText: {
    color: '#A78BFA',
    fontSize: 14,
    fontWeight: '600',
  },

  // DB List
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  header: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    marginBottom: 20,
  },
  dbCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  dbIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dbInfo: {
    flex: 1,
    marginLeft: 12,
  },
  dbName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  dbPath: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 2,
  },
});
