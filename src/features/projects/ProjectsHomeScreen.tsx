import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Animated, Dimensions, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as DocumentPicker from 'expo-document-picker';
import { AppColors } from '../../shared/theme/colors';
import { workstationService } from '../../core/workstation/workstationService-firebase';

interface Props {
  onCreateProject: () => void;
  onImportProject: () => void;
  onMyProjects: () => void;
  onOpenProject: (workstation: any) => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const ProjectsHomeScreen = ({ onCreateProject, onImportProject, onMyProjects, onOpenProject }: Props) => {
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const actionSheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const sheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadRecentProjects();

    // Shimmer animation for skeleton
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Pulse animation for FAB
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const loadRecentProjects = async () => {
    try {
      const workstations = await workstationService.getWorkstations();
      const recent = workstations
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 8);
      setRecentProjects(recent);
    } catch (error) {
      console.error('Error loading recent projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 0) return `${days}g fa`;
    if (hours > 0) return `${hours}h fa`;
    return 'ora';
  };

  const handleBrowseFiles = async () => {
    handleCloseActionMenu();
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        Alert.alert('File Selezionato', `${file.name}\nDimensione: ${((file.size || 0) / 1024).toFixed(1)} KB`);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Errore', 'Impossibile aprire il file picker');
    }
  };

  const handleOpenActionMenu = () => {
    setActionMenuVisible(true);
    Animated.spring(actionSheetAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const handleCloseActionMenu = () => {
    Animated.timing(actionSheetAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setActionMenuVisible(false);
    });
  };

  const handleOpenMenu = (project: any) => {
    setSelectedProject(project);
    setMenuVisible(true);
    Animated.spring(sheetAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const handleCloseMenu = () => {
    Animated.timing(sheetAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setMenuVisible(false);
      setSelectedProject(null);
    });
  };

  const handleDeleteProject = async () => {
    if (!selectedProject) return;

    Alert.alert(
      'Elimina Progetto',
      `Sei sicuro di voler eliminare "${selectedProject.name}"?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            try {
              await workstationService.deleteWorkstation(selectedProject.id);
              handleCloseMenu();
              loadRecentProjects();
            } catch (error) {
              console.error('Error deleting project:', error);
              Alert.alert('Errore', 'Impossibile eliminare il progetto');
            }
          },
        },
      ]
    );
  };

  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.6],
  });

  const SkeletonItem = () => (
    <View style={styles.skeletonItem}>
      <Animated.View style={[styles.skeletonIcon, { opacity: shimmerOpacity }]} />
      <View style={styles.skeletonContent}>
        <Animated.View style={[styles.skeletonTitle, { opacity: shimmerOpacity }]} />
        <Animated.View style={[styles.skeletonSubtitle, { opacity: shimmerOpacity }]} />
      </View>
    </View>
  );

  const getLanguageIcon = (language: string) => {
    const lang = language?.toLowerCase() || '';
    if (lang.includes('react') || lang.includes('javascript')) return 'logo-react';
    if (lang.includes('python')) return 'logo-python';
    if (lang.includes('node')) return 'logo-nodejs';
    if (lang.includes('swift') || lang.includes('ios')) return 'logo-apple';
    if (lang.includes('android') || lang.includes('kotlin')) return 'logo-android';
    if (lang.includes('html') || lang.includes('css')) return 'logo-html5';
    return 'folder';
  };

  const getLanguageColor = (language: string) => {
    const lang = language?.toLowerCase() || '';
    if (lang.includes('react')) return '#61DAFB';
    if (lang.includes('javascript')) return '#F7DF1E';
    if (lang.includes('typescript')) return '#3178C6';
    if (lang.includes('python')) return '#3776AB';
    if (lang.includes('node')) return '#68A063';
    if (lang.includes('swift')) return '#FA7343';
    if (lang.includes('kotlin')) return '#7F52FF';
    return AppColors.primary;
  };

  return (
    <View style={styles.container}>
      {/* Background */}
      <LinearGradient
        colors={['#0A0A0F', '#0D0B14', '#0A0A0F']}
        style={StyleSheet.absoluteFill}
      />

      {/* Decorative orbs */}
      <View style={styles.orbPurple} />
      <View style={styles.orbBlue} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.avatarButton} activeOpacity={0.7}>
            <LinearGradient
              colors={['rgba(139, 92, 246, 0.3)', 'rgba(139, 92, 246, 0.1)']}
              style={styles.avatarGradient}
            >
              <Ionicons name="person" size={18} color="#A78BFA" />
            </LinearGradient>
          </TouchableOpacity>
          <View style={styles.welcomeText}>
            <Text style={styles.greeting}>Bentornato</Text>
            <Text style={styles.subtitle}>I tuoi progetti</Text>
          </View>
        </View>

        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={styles.addButton}
            activeOpacity={0.8}
            onPress={handleOpenActionMenu}
          >
            <LinearGradient
              colors={[AppColors.primary, '#9333EA']}
              style={styles.addButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="add" size={24} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Projects section */}
      <View style={styles.projectsContainer}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionIcon}>
              <Ionicons name="time-outline" size={14} color={AppColors.primary} />
            </View>
            <Text style={styles.sectionTitle}>Recenti</Text>
          </View>
          {recentProjects.length > 0 && (
            <TouchableOpacity onPress={onMyProjects} activeOpacity={0.7}>
              <Text style={styles.seeAllText}>Vedi tutti</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          style={styles.projectsScrollView}
          contentContainerStyle={styles.projectsScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <>
              <SkeletonItem />
              <SkeletonItem />
              <SkeletonItem />
            </>
          ) : recentProjects.length > 0 ? (
            <>
              {recentProjects.map((project, index) => {
                const langColor = getLanguageColor(project.language);
                return (
                  <TouchableOpacity
                    key={project.id}
                    style={styles.projectCard}
                    activeOpacity={0.7}
                    onPress={() => onOpenProject(project)}
                    onLongPress={() => handleOpenMenu(project)}
                    delayLongPress={400}
                  >
                    <LinearGradient
                      colors={['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.01)']}
                      style={styles.projectCardGradient}
                    >
                      <View style={styles.projectCardContent}>
                        <View style={[styles.projectIcon, { backgroundColor: `${langColor}15` }]}>
                          <Ionicons name={getLanguageIcon(project.language) as any} size={22} color={langColor} />
                        </View>
                        <View style={styles.projectInfo}>
                          <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
                          <View style={styles.projectMetaRow}>
                            <View style={[styles.languageBadge, { backgroundColor: `${langColor}15` }]}>
                              <Text style={[styles.languageText, { color: langColor }]}>
                                {project.language || 'Progetto'}
                              </Text>
                            </View>
                            <Text style={styles.projectTime}>{getTimeAgo(project.createdAt)}</Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={styles.projectMenuBtn}
                          onPress={() => handleOpenMenu(project)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="ellipsis-vertical" size={16} color="rgba(255,255,255,0.4)" />
                        </TouchableOpacity>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                );
              })}

              {/* View All Button */}
              <TouchableOpacity
                style={styles.viewAllButton}
                activeOpacity={0.7}
                onPress={onMyProjects}
              >
                <LinearGradient
                  colors={['rgba(139, 92, 246, 0.12)', 'rgba(139, 92, 246, 0.06)']}
                  style={styles.viewAllGradient}
                >
                  <Ionicons name="grid-outline" size={18} color={AppColors.primary} />
                  <Text style={styles.viewAllText}>Visualizza tutti i progetti</Text>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
                </LinearGradient>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.emptyState}>
              <LinearGradient
                colors={['rgba(139, 92, 246, 0.1)', 'rgba(139, 92, 246, 0.02)']}
                style={styles.emptyIconContainer}
              >
                <Ionicons name="folder-open-outline" size={48} color="rgba(167, 139, 250, 0.5)" />
              </LinearGradient>
              <Text style={styles.emptyTitle}>Nessun progetto</Text>
              <Text style={styles.emptySubtitle}>Tocca + per creare il tuo primo progetto</Text>

              <TouchableOpacity
                style={styles.emptyButton}
                activeOpacity={0.8}
                onPress={handleOpenActionMenu}
              >
                <LinearGradient
                  colors={[AppColors.primary, '#9333EA']}
                  style={styles.emptyButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                  <Text style={styles.emptyButtonText}>Crea progetto</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>

      {/* Project Menu Bottom Sheet */}
      {menuVisible && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable
            style={[StyleSheet.absoluteFill, styles.sheetBackdrop]}
            onPress={handleCloseMenu}
          />
          <Animated.View
            style={[
              styles.sheetContainer,
              { transform: [{ translateY: sheetAnim }] }
            ]}
          >
            <View style={styles.sheetHandle}>
              <View style={styles.sheetHandleBar} />
            </View>

            {selectedProject && (
              <>
                <View style={styles.sheetHeader}>
                  <View style={[styles.sheetProjectIcon, { backgroundColor: `${getLanguageColor(selectedProject.language)}15` }]}>
                    <Ionicons
                      name={getLanguageIcon(selectedProject.language) as any}
                      size={20}
                      color={getLanguageColor(selectedProject.language)}
                    />
                  </View>
                  <View style={styles.sheetProjectInfo}>
                    <Text style={styles.sheetProjectName} numberOfLines={1}>{selectedProject.name}</Text>
                    <Text style={styles.sheetProjectMeta}>{selectedProject.language || 'Progetto'}</Text>
                  </View>
                </View>

                <View style={styles.sheetActions}>
                  <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7} onPress={() => {
                    handleCloseMenu();
                    setTimeout(() => onOpenProject(selectedProject), 300);
                  }}>
                    <View style={styles.sheetActionIcon}>
                      <Ionicons name="open-outline" size={20} color="#fff" />
                    </View>
                    <Text style={styles.sheetActionText}>Apri</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7}>
                    <View style={styles.sheetActionIcon}>
                      <Ionicons name="copy-outline" size={20} color="#fff" />
                    </View>
                    <Text style={styles.sheetActionText}>Duplica</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7}>
                    <View style={styles.sheetActionIcon}>
                      <Ionicons name="share-outline" size={20} color="#fff" />
                    </View>
                    <Text style={styles.sheetActionText}>Condividi</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7}>
                    <View style={styles.sheetActionIcon}>
                      <Ionicons name="create-outline" size={20} color="#fff" />
                    </View>
                    <Text style={styles.sheetActionText}>Rinomina</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.sheetDeleteButton}
                  activeOpacity={0.7}
                  onPress={handleDeleteProject}
                >
                  <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                  <Text style={styles.sheetDeleteText}>Elimina progetto</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.sheetCancelButton} activeOpacity={0.7} onPress={handleCloseMenu}>
              <Text style={styles.sheetCancelText}>Annulla</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      {/* Action Menu Bottom Sheet */}
      {actionMenuVisible && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable
            style={[StyleSheet.absoluteFill, styles.sheetBackdrop]}
            onPress={handleCloseActionMenu}
          />
          <Animated.View
            style={[
              styles.actionSheetContainer,
              { transform: [{ translateY: actionSheetAnim }] }
            ]}
          >
            <View style={styles.sheetHandle}>
              <View style={styles.sheetHandleBar} />
            </View>

            <Text style={styles.actionSheetTitle}>Crea nuovo</Text>

            <TouchableOpacity
              style={styles.actionSheetItem}
              activeOpacity={0.7}
              onPress={() => {
                handleCloseActionMenu();
                setTimeout(onCreateProject, 250);
              }}
            >
              <LinearGradient
                colors={[`${AppColors.primary}20`, `${AppColors.primary}08`]}
                style={styles.actionSheetIconGradient}
              >
                <Ionicons name="add-circle" size={26} color={AppColors.primary} />
              </LinearGradient>
              <View style={styles.actionSheetItemInfo}>
                <Text style={styles.actionSheetItemTitle}>Nuovo Progetto</Text>
                <Text style={styles.actionSheetItemSubtitle}>Inizia da zero</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.2)" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionSheetItem}
              activeOpacity={0.7}
              onPress={() => {
                handleCloseActionMenu();
                setTimeout(onImportProject, 250);
              }}
            >
              <View style={[styles.actionSheetIconGradient, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                <Ionicons name="logo-github" size={26} color="#fff" />
              </View>
              <View style={styles.actionSheetItemInfo}>
                <Text style={styles.actionSheetItemTitle}>Importa da GitHub</Text>
                <Text style={styles.actionSheetItemSubtitle}>Clona una repository</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.2)" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionSheetItem}
              activeOpacity={0.7}
              onPress={handleBrowseFiles}
            >
              <View style={[styles.actionSheetIconGradient, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                <Ionicons name="document-outline" size={26} color="#fff" />
              </View>
              <View style={styles.actionSheetItemInfo}>
                <Text style={styles.actionSheetItemTitle}>Apri File</Text>
                <Text style={styles.actionSheetItemSubtitle}>Sfoglia dal dispositivo</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.2)" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetCancelButton} activeOpacity={0.7} onPress={handleCloseActionMenu}>
              <Text style={styles.sheetCancelText}>Annulla</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  // Decorative orbs
  orbPurple: {
    position: 'absolute',
    top: -100,
    right: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
  },
  orbBlue: {
    position: 'absolute',
    bottom: 100,
    left: -120,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: 'rgba(59, 130, 246, 0.04)',
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarButton: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  avatarGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.2)',
  },
  welcomeText: {
    gap: 2,
  },
  greeting: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  addButton: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  addButtonGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Projects section
  projectsContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '500',
    color: AppColors.primary,
  },
  projectsScrollView: {
    flex: 1,
  },
  projectsScrollContent: {
    paddingBottom: 40,
  },
  // Project Card
  projectCard: {
    marginBottom: 10,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  projectCardGradient: {
    padding: 14,
  },
  projectCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  projectIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectInfo: {
    flex: 1,
    marginLeft: 14,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 6,
  },
  projectMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  languageBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  languageText: {
    fontSize: 11,
    fontWeight: '600',
  },
  projectTime: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
  projectMenuBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // View All Button
  viewAllButton: {
    marginTop: 8,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  viewAllGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  viewAllText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: AppColors.primary,
  },
  // Skeleton
  skeletonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  skeletonIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  skeletonContent: {
    flex: 1,
    marginLeft: 14,
    gap: 8,
  },
  skeletonTitle: {
    width: '70%',
    height: 16,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  skeletonSubtitle: {
    width: '40%',
    height: 12,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 28,
  },
  emptyButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  emptyButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 28,
    gap: 10,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  // Bottom Sheet
  sheetBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#141418',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  sheetHandle: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  sheetHandleBar: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sheetProjectIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetProjectInfo: {
    flex: 1,
    marginLeft: 12,
  },
  sheetProjectName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  sheetProjectMeta: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sheetActionItem: {
    alignItems: 'center',
    gap: 8,
  },
  sheetActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetActionText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
  sheetDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 12,
  },
  sheetDeleteText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  sheetCancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginHorizontal: 20,
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
  },
  sheetCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  // Action Sheet
  actionSheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#141418',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  actionSheetTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  actionSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  actionSheetIconGradient: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSheetItemInfo: {
    flex: 1,
    marginLeft: 14,
  },
  actionSheetItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  actionSheetItemSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
});
