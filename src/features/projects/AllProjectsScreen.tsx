import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { workstationService } from '../../core/workstation/workstationService-firebase';
import { NewProjectModal } from '../terminal/components/NewProjectModal';
import { ImportGitHubModal } from '../terminal/components/ImportGitHubModal';
import { NewFolderModal } from '../terminal/components/NewFolderModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  onClose: () => void;
  onOpenProject?: (workstation: any) => void;
}

// Helper function for language icons
const getLanguageIcon = (language: string): { name: any; color: string } => {
  const lang = (language || '').toLowerCase();
  if (lang.includes('python')) return { name: 'logo-python', color: '#3776AB' };
  if (lang.includes('javascript') || lang.includes('js')) return { name: 'logo-javascript', color: '#F7DF1E' };
  if (lang.includes('typescript') || lang.includes('ts')) return { name: 'logo-javascript', color: '#3178C6' };
  if (lang.includes('react')) return { name: 'logo-react', color: '#61DAFB' };
  if (lang.includes('node')) return { name: 'logo-nodejs', color: '#339933' };
  if (lang.includes('html')) return { name: 'logo-html5', color: '#E34F26' };
  if (lang.includes('css')) return { name: 'logo-css3', color: '#1572B6' };
  if (lang.includes('java')) return { name: 'cafe-outline', color: '#007396' };
  if (lang.includes('swift')) return { name: 'logo-apple', color: '#FA7343' };
  if (lang.includes('kotlin')) return { name: 'logo-android', color: '#7F52FF' };
  if (lang.includes('go')) return { name: 'code-slash', color: '#00ADD8' };
  if (lang.includes('rust')) return { name: 'cog', color: '#DEA584' };
  if (lang.includes('c++') || lang.includes('cpp')) return { name: 'code', color: '#00599C' };
  if (lang.includes('c#') || lang.includes('csharp')) return { name: 'code', color: '#239120' };
  if (lang.includes('php')) return { name: 'server', color: '#777BB4' };
  if (lang.includes('ruby')) return { name: 'diamond', color: '#CC342D' };
  return { name: 'folder', color: '#8B7CF6' };
};

export const AllProjectsScreen = ({ onClose, onOpenProject }: Props) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchFocused, setSearchFocused] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const headerAnim = useRef(new Animated.Value(0)).current;
  const searchScaleAnim = useRef(new Animated.Value(1)).current;

  const { setWorkstation } = useTerminalStore();

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();

    loadProjects();
  }, []);

  // Search focus animation
  useEffect(() => {
    Animated.spring(searchScaleAnim, {
      toValue: searchFocused ? 1.02 : 1,
      tension: 100,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [searchFocused]);

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

  const handleCreateProject = async (name: string, language: string) => {
    Alert.alert('In Arrivo', 'La creazione progetti da questa schermata sarà disponibile a breve');
    setShowNewProjectModal(false);
  };

  const handleImportFromGitHub = async (repoUrl: string) => {
    setShowImportModal(false);
    onClose();
  };

  const handleOpenProject = async (ws: any) => {
    setWorkstation(ws);
    if (onOpenProject) {
      onOpenProject(ws);
      return;
    }
    onClose();
  };

  const handleCreateFolder = (name: string) => {
    Alert.alert('In Arrivo', 'Le cartelle saranno disponibili a breve');
    setShowNewFolderModal(false);
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

  const renderProjectCard = (project: any, index: number) => {
    const langIcon = getLanguageIcon(project.language);
    const cardDelay = index * 50;

    return (
      <Animated.View
        key={project.id}
        style={{
          opacity: fadeAnim,
          transform: [
            {
              translateY: slideAnim.interpolate({
                inputRange: [0, 30],
                outputRange: [0, 30 + cardDelay / 10],
              }),
            },
          ],
        }}
      >
        <TouchableOpacity
          style={[
            styles.projectCard,
            viewMode === 'grid' && styles.projectCardGrid,
          ]}
          activeOpacity={0.7}
          onPress={() => handleOpenProject(project)}
          onLongPress={() => handleDeleteProject(project.id)}
          delayLongPress={500}
        >
          <LinearGradient
            colors={['rgba(139, 124, 246, 0.08)', 'rgba(139, 124, 246, 0.02)']}
            style={styles.cardGradient}
          >
            <View style={styles.projectCardHeader}>
              <View style={[styles.projectIcon, { backgroundColor: `${langIcon.color}20` }]}>
                <Ionicons name={langIcon.name} size={22} color={langIcon.color} />
              </View>
              <TouchableOpacity
                style={styles.projectMenuBtn}
                onPress={() => handleDeleteProject(project.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="ellipsis-horizontal" size={16} color="rgba(255, 255, 255, 0.4)" />
              </TouchableOpacity>
            </View>

            <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>

            <View style={styles.projectMetaRow}>
              <View style={[styles.languageBadge, { backgroundColor: `${langIcon.color}15` }]}>
                <Text style={[styles.languageBadgeText, { color: langIcon.color }]}>
                  {project.language || 'Progetto'}
                </Text>
              </View>
              <Text style={styles.projectTime}>{getTimeAgo(project.createdAt)}</Text>
            </View>

            {project.githubUrl && (
              <View style={styles.githubIndicator}>
                <Ionicons name="logo-github" size={12} color="rgba(255, 255, 255, 0.3)" />
                <Text style={styles.githubText} numberOfLines={1}>
                  {project.githubUrl.split('/').slice(-2).join('/')}
                </Text>
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Background Orbs */}
      <View style={styles.backgroundOrbs}>
        <View style={[styles.orb, styles.orb1]} />
        <View style={[styles.orb, styles.orb2]} />
      </View>

      <NewProjectModal
        visible={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        onConfirm={handleCreateProject}
      />
      <ImportGitHubModal
        visible={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImportFromGitHub}
      />
      <NewFolderModal
        visible={showNewFolderModal}
        onClose={() => setShowNewFolderModal(false)}
        onConfirm={handleCreateFolder}
      />

      {/* Header */}
      <Animated.View
        style={{
          opacity: headerAnim,
          transform: [{
            translateY: headerAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [-20, 0],
            }),
          }],
        }}
      >
        <LinearGradient
          colors={['#0A0B0D', '#12131A', '#0A0B0D']}
          style={styles.header}
        >
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={onClose} style={styles.backButton}>
              <LinearGradient
                colors={['rgba(139, 124, 246, 0.15)', 'rgba(139, 124, 246, 0.05)']}
                style={styles.backButtonGradient}
              >
                <Ionicons name="arrow-back" size={22} color="#EDEDED" />
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.titleContainer}>
              <Text style={styles.title}>Tutti i Progetti</Text>
              <Text style={styles.subtitle}>
                {loading ? 'Caricamento...' : `${projects.length} progetti`}
              </Text>
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                style={[
                  styles.viewModeButton,
                  viewMode === 'grid' && styles.viewModeButtonActive,
                ]}
                onPress={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              >
                <Ionicons
                  name={viewMode === 'grid' ? 'list' : 'grid'}
                  size={20}
                  color={viewMode === 'grid' ? '#8B7CF6' : '#9CA3AF'}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Search */}
          <Animated.View
            style={[
              styles.searchContainer,
              searchFocused && styles.searchContainerFocused,
              { transform: [{ scale: searchScaleAnim }] },
            ]}
          >
            <Ionicons name="search" size={20} color={searchFocused ? '#8B7CF6' : '#9CA3AF'} />
            <TextInput
              style={styles.searchInput}
              placeholder="Cerca progetti..."
              placeholderTextColor="#6B7280"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#6B7280" />
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setShowNewProjectModal(true)}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={['rgba(139, 124, 246, 0.2)', 'rgba(139, 124, 246, 0.08)']}
                style={styles.actionButtonGradient}
              >
                <View style={styles.actionButtonIcon}>
                  <Ionicons name="add-circle" size={18} color="#8B7CF6" />
                </View>
                <Text style={styles.actionButtonText}>Nuovo</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setShowImportModal(true)}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={['rgba(139, 124, 246, 0.2)', 'rgba(139, 124, 246, 0.08)']}
                style={styles.actionButtonGradient}
              >
                <View style={styles.actionButtonIcon}>
                  <Ionicons name="logo-github" size={18} color="#8B7CF6" />
                </View>
                <Text style={styles.actionButtonText}>Importa</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setShowNewFolderModal(true)}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={['rgba(182, 173, 255, 0.15)', 'rgba(182, 173, 255, 0.05)']}
                style={styles.actionButtonGradient}
              >
                <View style={styles.actionButtonIcon}>
                  <Ionicons name="folder-open" size={18} color="#B6ADFF" />
                </View>
                <Text style={[styles.actionButtonText, { color: '#B6ADFF' }]}>Cartella</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <View style={styles.loadingSpinner}>
              <ActivityIndicator size="large" color="#8B7CF6" />
            </View>
            <Text style={styles.loadingText}>Caricamento progetti...</Text>
          </View>
        ) : filteredProjects.length > 0 ? (
          <View style={viewMode === 'grid' ? styles.gridContainer : undefined}>
            {filteredProjects.map((project, index) => renderProjectCard(project, index))}
          </View>
        ) : (
          <Animated.View
            style={[
              styles.emptyState,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.emptyIconContainer}>
              <LinearGradient
                colors={['rgba(139, 124, 246, 0.15)', 'rgba(139, 124, 246, 0.05)']}
                style={styles.emptyIconGradient}
              >
                <Ionicons name="folder-open-outline" size={48} color="#8B7CF6" />
              </LinearGradient>
            </View>
            <Text style={styles.emptyText}>
              {searchQuery ? 'Nessun risultato' : 'Nessun progetto'}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery
                ? `Nessun progetto corrisponde a "${searchQuery}"`
                : 'Crea il tuo primo progetto per iniziare'
              }
            </Text>
            {!searchQuery && (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => setShowNewProjectModal(true)}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#8B7CF6', '#6F5CFF']}
                  style={styles.emptyButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Ionicons name="add" size={20} color="#FFF" />
                  <Text style={styles.emptyButtonText}>Crea Progetto</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </Animated.View>
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
    backgroundColor: '#090A0B',
  },
  backgroundOrbs: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orb1: {
    width: 300,
    height: 300,
    backgroundColor: 'rgba(139, 124, 246, 0.08)',
    top: -100,
    right: -100,
  },
  orb2: {
    width: 200,
    height: 200,
    backgroundColor: 'rgba(111, 92, 255, 0.05)',
    bottom: 100,
    left: -50,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 124, 246, 0.1)',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    marginRight: 12,
  },
  backButtonGradient: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.2)',
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#EDEDED',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  viewModeButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  viewModeButtonActive: {
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
    borderColor: 'rgba(139, 124, 246, 0.3)',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  searchContainerFocused: {
    borderColor: 'rgba(139, 124, 246, 0.4)',
    backgroundColor: 'rgba(139, 124, 246, 0.08)',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#EDEDED',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.2)',
  },
  actionButtonIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8B7CF6',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  loadingSpinner: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: 'rgba(139, 124, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 16,
  },
  projectCard: {
    marginBottom: 12,
    borderRadius: 18,
    overflow: 'hidden',
  },
  projectCardGrid: {
    width: (SCREEN_WIDTH - 52) / 2,
    marginHorizontal: 6,
  },
  cardGradient: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.12)',
  },
  projectCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  projectIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectMenuBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  projectMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  languageBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  languageBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  projectTime: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.35)',
  },
  githubIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  githubText: {
    flex: 1,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.3)',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIconContainer: {
    marginBottom: 20,
  },
  emptyIconGradient: {
    width: 100,
    height: 100,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.2)',
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#EDEDED',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
  emptyButton: {
    marginTop: 24,
    borderRadius: 14,
    overflow: 'hidden',
  },
  emptyButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
});
