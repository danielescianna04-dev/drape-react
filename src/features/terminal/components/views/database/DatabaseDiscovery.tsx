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
  /** Project is on the shared Drape Cloud backend. */
  drapeCloudDetected?: boolean;
  containerReady: boolean;
  isLoading: boolean;
  error: string | null;
  onSelectDb: (path: string) => void;
  onRetry: () => void;
}

export const DatabaseDiscovery: React.FC<Props> = ({ databases, pgDetected, supabaseDetected, supabaseUrl, drapeCloudDetected, containerReady, isLoading, error, onSelectDb, onRetry }) => {
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
        <Text style={styles.loadingSubtitle}>Looking for databases</Text>
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

  // Drape Cloud detected — the shared multi-tenant backend. No
  // external dashboard to link to; the data viewer is the dashboard.
  if (drapeCloudDetected) {
    const accentColor = '#8B5CF6';
    return (
      <ScrollView contentContainerStyle={[styles.emptyContainer, { paddingTop: insets.top + 80 }]}>
        <View style={styles.glowWrap}>
          <View style={[styles.glowRing, { borderColor: `${accentColor}33` }]}>
            <LinearGradient colors={[`${accentColor}26`, `${accentColor}08`]} style={styles.glowGradient} />
          </View>
          <View style={[styles.iconBox, { backgroundColor: `${accentColor}1F` }]}>
            <Ionicons name="sparkles-outline" size={28} color={accentColor} />
          </View>
        </View>
        <Text style={styles.emptyTitle}>Drape Cloud</Text>
        <Text style={styles.emptySubtitle}>
          Shared backend attivo per questo progetto.{'\n'}Dati persistenti, auth e storage via SDK.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: `${accentColor}1F`, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: `${accentColor}33`, marginTop: 20, paddingHorizontal: 24 }}
          onPress={() => onSelectDb('__drape__')}
          activeOpacity={0.7}
        >
          <Ionicons name="list-outline" size={16} color={accentColor} />
          <Text style={{ color: accentColor, fontSize: 14, fontWeight: '600' }}>Apri tabelle</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Neon/Supabase detected — show connection info
  if (supabaseDetected && supabaseUrl) {
    const isNeon = supabaseUrl.includes('neon.tech');
    const displayName = isNeon ? 'Neon PostgreSQL' : 'Supabase';
    const accentColor = isNeon ? '#00E599' : '#3ECF8E';
    const dashboardUrl = isNeon
      ? 'https://console.neon.tech'
      : (() => {
          const ref = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
          return ref ? `https://supabase.com/dashboard/project/${ref}` : 'https://supabase.com/dashboard';
        })();

    return (
      <ScrollView contentContainerStyle={[styles.emptyContainer, { paddingTop: insets.top + 80 }]}>
        <View style={styles.glowWrap}>
          <View style={[styles.glowRing, { borderColor: `${accentColor}33` }]}>
            <LinearGradient
              colors={[`${accentColor}26`, `${accentColor}08`]}
              style={styles.glowGradient}
            />
          </View>
          <View style={[styles.iconBox, { backgroundColor: `${accentColor}1F` }]}>
            <Ionicons name="cloud-done-outline" size={28} color={accentColor} />
          </View>
        </View>

        <Text style={styles.emptyTitle}>{displayName} Connected</Text>
        <Text style={styles.emptySubtitle}>
          {isNeon
            ? 'Your project is connected to a Neon serverless PostgreSQL database.'
            : 'Your project is connected to a Supabase database with PostgreSQL, Auth, and Storage.'}
        </Text>

        <View style={{ marginTop: 20, gap: 10, width: '100%', paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: `${accentColor}14`, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: `${accentColor}26` }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 4 }}>DATABASE URL</Text>
            <Text style={{ color: accentColor, fontSize: 13, fontFamily: 'monospace' }} numberOfLines={1}>{supabaseUrl}</Text>
          </View>

          <TouchableOpacity
            style={{ backgroundColor: `${accentColor}1F`, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: `${accentColor}33` }}
            onPress={() => require('expo-web-browser').openBrowserAsync(dashboardUrl)}
            activeOpacity={0.7}
          >
            <Ionicons name="open-outline" size={16} color={accentColor} />
            <Text style={{ color: accentColor, fontSize: 14, fontWeight: '600' }}>Open {isNeon ? 'Neon' : 'Supabase'} Dashboard</Text>
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
      <ScrollView contentContainerStyle={[styles.emptyContainer, { paddingTop: insets.top + 60 }]}>
        <Text style={styles.emptyTitle}>Database</Text>
        <Text style={styles.emptySubtitle}>
          Serverless PostgreSQL powered by Neon.{'\n'}Activate Cloud Mode to connect.
        </Text>

        {/* Feature cards */}
        <View style={styles.featureGrid}>
          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: 'rgba(0, 229, 153, 0.1)' }]}>
              <Ionicons name="flash-outline" size={18} color="#00E599" />
            </View>
            <Text style={styles.featureTitle}>Serverless</Text>
            <Text style={styles.featureDesc}>Scale to zero, pay per use</Text>
          </View>

          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: 'rgba(99, 102, 241, 0.1)' }]}>
              <Ionicons name="git-branch-outline" size={18} color="#818CF8" />
            </View>
            <Text style={styles.featureTitle}>Branching</Text>
            <Text style={styles.featureDesc}>Database branches like Git</Text>
          </View>

          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: 'rgba(251, 191, 36, 0.1)' }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#FBBF24" />
            </View>
            <Text style={styles.featureTitle}>Auth</Text>
            <Text style={styles.featureDesc}>Built-in with Better Auth</Text>
          </View>

          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: 'rgba(56, 189, 248, 0.1)' }]}>
              <Ionicons name="globe-outline" size={18} color="#38BDF8" />
            </View>
            <Text style={styles.featureTitle}>Edge</Text>
            <Text style={styles.featureDesc}>Low latency worldwide</Text>
          </View>
        </View>

        {/* CTA */}
        <View style={styles.ctaSection}>
          <View style={styles.ctaDivider} />
          <Text style={styles.ctaLabel}>How to enable</Text>
          <View style={styles.ctaSteps}>
            <View style={styles.ctaStep}>
              <View style={styles.ctaStepNum}><Text style={styles.ctaStepNumText}>1</Text></View>
              <Text style={styles.ctaStepText}>Create a new project</Text>
            </View>
            <View style={styles.ctaStep}>
              <View style={[styles.ctaStepNum, { backgroundColor: 'rgba(0, 229, 153, 0.15)' }]}><Text style={[styles.ctaStepNumText, { color: '#00E599' }]}>2</Text></View>
              <Text style={styles.ctaStepText}>Toggle <Text style={{ color: '#00E599', fontWeight: '700' }}>Cloud Mode</Text> on</Text>
            </View>
            <View style={styles.ctaStep}>
              <View style={styles.ctaStepNum}><Text style={styles.ctaStepNumText}>3</Text></View>
              <Text style={styles.ctaStepText}>AI sets up DB + Auth automatically</Text>
            </View>
          </View>
        </View>

        {/* Scan */}
        <TouchableOpacity style={styles.scanBtn} onPress={onRetry} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={15} color="rgba(255,255,255,0.5)" />
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
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  neonLogoWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 153, 0.15)',
  },
  neonLogoBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
  },
  neonLogoText: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 3,
    color: '#00E599',
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
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 4,
  },

  // Feature grid
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 28,
    rowGap: 10,
  },
  featureCard: {
    width: '48.5%',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
  },
  featureIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  featureTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  featureDesc: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    lineHeight: 15,
  },

  // CTA
  ctaSection: {
    width: '100%',
    marginTop: 28,
  },
  ctaDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 16,
  },
  ctaLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 14,
  },
  ctaSteps: {
    gap: 12,
  },
  ctaStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ctaStepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaStepNumText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '700',
  },
  ctaStepText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    flex: 1,
  },

  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 28,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  scanBtnText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '500',
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
