import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { workstationService } from '../../core/workstation/workstationService-firebase';
import { AppColors } from '../../shared/theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  onClose: () => void;
  onOpenProject?: (workstation: any) => void;
}

// Helper function for language icons
const getLanguageIcon = (language: string): string => {
  const lang = (language || '').toLowerCase();
  if (lang.includes('python')) return 'logo-python';
  if (lang.includes('javascript') || lang.includes('js')) return 'logo-javascript';
  if (lang.includes('typescript') || lang.includes('ts')) return 'logo-javascript';
  if (lang.includes('react')) return 'logo-react';
  if (lang.includes('node')) return 'logo-nodejs';
  if (lang.includes('html')) return 'logo-html5';
  if (lang.includes('css')) return 'logo-css3';
  if (lang.includes('java')) return 'cafe-outline';
  if (lang.includes('swift')) return 'logo-apple';
  if (lang.includes('kotlin')) return 'logo-android';
  if (lang.includes('go')) return 'code-slash';
  if (lang.includes('rust')) return 'cog';
  if (lang.includes('c++') || lang.includes('cpp')) return 'code';
  if (lang.includes('c#') || lang.includes('csharp')) return 'code';
  if (lang.includes('php')) return 'server';
  if (lang.includes('ruby')) return 'diamond';
  return 'folder';
};

const getLanguageColor = (language: string): string => {
  const lang = (language || '').toLowerCase();
  if (lang.includes('python')) return '#3776AB';
  if (lang.includes('javascript') || lang.includes('js')) return '#F7DF1E';
  if (lang.includes('typescript') || lang.includes('ts')) return '#3178C6';
  if (lang.includes('react')) return '#61DAFB';
  if (lang.includes('node')) return '#339933';
  if (lang.includes('html')) return '#E34F26';
  if (lang.includes('css')) return '#1572B6';
  if (lang.includes('java')) return '#007396';
  if (lang.includes('swift')) return '#FA7343';
  if (lang.includes('kotlin')) return '#7F52FF';
  if (lang.includes('go')) return '#00ADD8';
  if (lang.includes('rust')) return '#DEA584';
  if (lang.includes('c++') || lang.includes('cpp')) return '#00599C';
  if (lang.includes('c#') || lang.includes('csharp')) return '#239120';
  if (lang.includes('php')) return '#777BB4';
  if (lang.includes('ruby')) return '#CC342D';
  return AppColors.primary;
};

export const AllProjectsScreen = ({ onClose, onOpenProject }: Props) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Skeleton animation
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  const { setWorkstation } = useTerminalStore();

  useEffect(() => {
    loadProjects();

    // Shimmer animation loop
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    shimmerLoop.start();

    return () => shimmerLoop.stop();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const workstations = await workstationService.getWorkstations();
      const sorted = workstations.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setProjects(sorted);
    } catch (error) {
      console.error('Error loading projects:', error);
      Alert.alert('Errore', 'Impossibile caricare i progetti');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenProject = async (ws: any) => {
    setWorkstation(ws);
    if (onOpenProject) {
      onOpenProject(ws);
      return;
    }
    onClose();
  };

  const handleDeleteProject = async (projectId: string) => {
    Alert.alert(
      'Elimina Progetto',
      'Sei sicuro di voler eliminare questo progetto?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            try {
              await workstationService.deleteWorkstation(projectId);
              loadProjects();
            } catch (error) {
              console.error('Error deleting project:', error);
              Alert.alert('Errore', 'Impossibile eliminare il progetto');
            }
          },
        },
      ]
    );
  };

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 0) return `${days}g fa`;
    if (hours > 0) return `${hours}h fa`;
    if (minutes > 0) return `${minutes}m fa`;
    return 'adesso';
  };

  const filteredProjects = projects.filter((ws) =>
    ws.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderSkeletonCard = (index: number) => {
    const shimmerOpacity = shimmerAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 0.7],
    });

    return (
      <View key={`skeleton-${index}`} style={styles.projectCard}>
        <Animated.View style={[styles.skeletonIcon, { opacity: shimmerOpacity }]} />
        <View style={styles.projectInfo}>
          <Animated.View style={[styles.skeletonTitle, { opacity: shimmerOpacity }]} />
          <View style={styles.projectMetaRow}>
            <Animated.View style={[styles.skeletonMeta, { opacity: shimmerOpacity }]} />
          </View>
        </View>
      </View>
    );
  };

  const renderProjectCard = (project: any) => {
    const langColor = getLanguageColor(project.language);

    return (
      <TouchableOpacity
        key={project.id}
        style={styles.projectCard}
        activeOpacity={0.7}
        onPress={() => handleOpenProject(project)}
        onLongPress={() => handleDeleteProject(project.id)}
        delayLongPress={400}
      >
        <View style={[styles.projectIcon, { backgroundColor: `${langColor}15` }]}>
          <Ionicons name={getLanguageIcon(project.language) as any} size={24} color={langColor} />
        </View>
        <View style={styles.projectInfo}>
          <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
          <View style={styles.projectMetaRow}>
            <Text style={styles.projectLang}>{project.language || 'Progetto'}</Text>
            <View style={styles.metaDot} />
            <Text style={styles.projectTime}>{getTimeAgo(project.createdAt)}</Text>
            {(project.repositoryUrl || project.githubUrl) && (
              <>
                <View style={styles.metaDot} />
                <Ionicons name="logo-github" size={12} color="rgba(255,255,255,0.35)" />
              </>
            )}
          </View>
        </View>
        <TouchableOpacity
          style={styles.projectMenuBtn}
          onPress={() => handleDeleteProject(project.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color="rgba(255,255,255,0.35)" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.7}
            onPress={onClose}
          >
            <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Tutti i Progetti</Text>
        </View>
        <Text style={styles.projectCount}>
          {loading ? '...' : `${projects.length}`}
        </Text>
      </View>

      {/* Search */}
      <View style={styles.searchSection}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="rgba(255,255,255,0.35)" />
          <TextInput
            style={styles.searchInput}
            placeholder="Cerca progetti..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.35)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {loading ? (
          <>
            {[0, 1, 2, 3, 4].map(renderSkeletonCard)}
          </>
        ) : filteredProjects.length > 0 ? (
          <>
            {filteredProjects.map(renderProjectCard)}
          </>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="folder-open-outline" size={48} color="rgba(255,255,255,0.2)" />
            </View>
            <Text style={styles.emptyText}>
              {searchQuery ? 'Nessun risultato' : 'Nessun progetto'}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery
                ? `Nessun progetto corrisponde a "${searchQuery}"`
                : 'Crea il tuo primo progetto dalla home'
              }
            </Text>
          </View>
        )}

        {/* Bottom Padding */}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0C0E',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  projectCount: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
  },
  searchSection: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
  },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
  },
  projectIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  projectMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  projectLang: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  projectTime: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
  },
  projectMenuBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  // Skeleton styles
  skeletonIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginRight: 14,
  },
  skeletonTitle: {
    width: '70%',
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  skeletonMeta: {
    width: '50%',
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
});
