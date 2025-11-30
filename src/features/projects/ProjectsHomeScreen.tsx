import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Animated, Dimensions, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import { AppColors } from '../../shared/theme/colors';
import { workstationService } from '../../core/workstation/workstationService-firebase';

interface Props {
  onCreateProject: () => void;
  onImportProject: () => void;
  onMyProjects: () => void;
  onOpenProject: (workstation: any) => void;
  onSettings?: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const ProjectsHomeScreen = ({ onCreateProject, onImportProject, onMyProjects, onOpenProject, onSettings }: Props) => {
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const actionSheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const sheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    loadRecentProjects();

    // Shimmer animation for skeleton loading
    Animated.loop(
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
    if (lang.includes('react')) return AppColors.languages.react;
    if (lang.includes('javascript')) return AppColors.languages.javascript;
    if (lang.includes('typescript')) return AppColors.languages.typescript;
    if (lang.includes('python')) return AppColors.languages.python;
    if (lang.includes('node')) return AppColors.languages.node;
    if (lang.includes('swift')) return AppColors.languages.swift;
    if (lang.includes('kotlin')) return AppColors.languages.kotlin;
    return AppColors.languages.default;
  };

  return (
    <View style={styles.container}>
      {/* Premium gradient background */}
      <LinearGradient
        colors={AppColors.gradient.dark as unknown as string[]}
        locations={[0, 0.3, 0.7, 1]}
        style={styles.background}
      >
        {/* Subtle glow effects */}
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />
      </LinearGradient>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.avatarButton}
            activeOpacity={0.7}
            onPress={onSettings}
          >
            <Text style={styles.avatarText}>D</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Progetti</Text>
        </View>

        <TouchableOpacity
          style={styles.addButton}
          activeOpacity={0.7}
          onPress={handleOpenActionMenu}
        >
          <Ionicons name="add" size={22} color={AppColors.white.full} />
        </TouchableOpacity>
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
              {recentProjects.map((project) => {
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
                    <View style={styles.projectIcon}>
                      <Ionicons name={getLanguageIcon(project.language) as any} size={28} color={langColor} />
                    </View>
                    <View style={styles.projectInfo}>
                      <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
                      <View style={styles.projectMetaRow}>
                        <Text style={styles.projectLang}>{project.language || 'Progetto'}</Text>
                        <View style={styles.metaDot} />
                        <Text style={styles.projectTime}>{getTimeAgo(project.createdAt)}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.projectMenuBtn}
                      onPress={() => handleOpenMenu(project)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="ellipsis-horizontal" size={18} color={AppColors.white.w35} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}

              {/* View All Button */}
              <TouchableOpacity
                style={styles.viewAllButton}
                activeOpacity={0.6}
                onPress={onMyProjects}
              >
                <Text style={styles.viewAllText}>Vedi tutti i progetti</Text>
                <Ionicons name="chevron-forward" size={16} color={AppColors.primary} />
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="folder-open-outline" size={56} color={AppColors.white.w10} />
              </View>
              <Text style={styles.emptyTitle}>Nessun progetto</Text>
              <Text style={styles.emptySubtitle}>Tocca + per creare il tuo primo progetto</Text>

              <TouchableOpacity
                style={styles.emptyButton}
                activeOpacity={0.7}
                onPress={handleOpenActionMenu}
              >
                <Ionicons name="add" size={20} color={AppColors.white.full} />
                <Text style={styles.emptyButtonText}>Crea progetto</Text>
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
                  <View style={styles.sheetProjectIcon}>
                    <Ionicons
                      name={getLanguageIcon(selectedProject.language) as any}
                      size={24}
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
                      <Ionicons name="open-outline" size={20} color={AppColors.white.full} />
                    </View>
                    <Text style={styles.sheetActionText}>Apri</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7}>
                    <View style={styles.sheetActionIcon}>
                      <Ionicons name="copy-outline" size={20} color={AppColors.white.full} />
                    </View>
                    <Text style={styles.sheetActionText}>Duplica</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7}>
                    <View style={styles.sheetActionIcon}>
                      <Ionicons name="share-outline" size={20} color={AppColors.white.full} />
                    </View>
                    <Text style={styles.sheetActionText}>Condividi</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7}>
                    <View style={styles.sheetActionIcon}>
                      <Ionicons name="create-outline" size={20} color={AppColors.white.full} />
                    </View>
                    <Text style={styles.sheetActionText}>Rinomina</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.sheetDeleteButton}
                  activeOpacity={0.7}
                  onPress={handleDeleteProject}
                >
                  <Ionicons name="trash-outline" size={18} color={AppColors.errorAlt} />
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
              activeOpacity={0.6}
              onPress={() => {
                handleCloseActionMenu();
                setTimeout(onCreateProject, 250);
              }}
            >
              <View style={[styles.actionSheetIcon, { backgroundColor: AppColors.primaryAlpha.a15 }]}>
                <Ionicons name="add-circle-outline" size={22} color={AppColors.primary} />
              </View>
              <View style={styles.actionSheetItemInfo}>
                <Text style={styles.actionSheetItemTitle}>Nuovo Progetto</Text>
                <Text style={styles.actionSheetItemSubtitle}>Inizia da zero</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={AppColors.white.w15} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionSheetItem}
              activeOpacity={0.6}
              onPress={() => {
                handleCloseActionMenu();
                setTimeout(onImportProject, 250);
              }}
            >
              <View style={styles.actionSheetIcon}>
                <Ionicons name="logo-github" size={22} color={AppColors.white.full} />
              </View>
              <View style={styles.actionSheetItemInfo}>
                <Text style={styles.actionSheetItemTitle}>Importa da GitHub</Text>
                <Text style={styles.actionSheetItemSubtitle}>Clona una repository</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={AppColors.white.w15} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionSheetItem}
              activeOpacity={0.6}
              onPress={handleBrowseFiles}
            >
              <View style={styles.actionSheetIcon}>
                <Ionicons name="folder-outline" size={22} color={AppColors.white.full} />
              </View>
              <View style={styles.actionSheetItemInfo}>
                <Text style={styles.actionSheetItemTitle}>Apri File</Text>
                <Text style={styles.actionSheetItemSubtitle}>Sfoglia dal dispositivo</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={AppColors.white.w15} />
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
    backgroundColor: AppColors.dark.backgroundAlt,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  glowTop: {
    position: 'absolute',
    top: -100,
    left: -50,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: AppColors.primaryAlpha.a08,
    opacity: 0.6,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -150,
    right: -80,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: AppColors.primaryAlpha.a05,
    opacity: 0.5,
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
    gap: 14,
  },
  avatarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: AppColors.white.full,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: AppColors.white.full,
  },
  addButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: AppColors.primary,
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
    borderRadius: 12,
    backgroundColor: AppColors.white.w06,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.white.w50,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    backgroundColor: AppColors.dark.surface,
    borderRadius: 24,
  },
  projectIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectInfo: {
    flex: 1,
    marginLeft: 12,
  },
  projectName: {
    fontSize: 15,
    fontWeight: '600',
    color: AppColors.white.full,
    marginBottom: 4,
    letterSpacing: 0.1,
  },
  projectMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  projectLang: {
    fontSize: 12,
    color: AppColors.white.w50,
    fontWeight: '500',
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: AppColors.white.w25,
    marginHorizontal: 8,
  },
  projectTime: {
    fontSize: 12,
    color: AppColors.white.w35,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginTop: 8,
    gap: 6,
  },
  viewAllText: {
    fontSize: 15,
    fontWeight: '500',
    color: AppColors.primary,
  },
  // Skeleton
  skeletonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    backgroundColor: AppColors.white.w04,
    borderRadius: 24,
  },
  skeletonIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: AppColors.white.w06,
  },
  skeletonContent: {
    flex: 1,
    marginLeft: 14,
    gap: 10,
  },
  skeletonTitle: {
    width: '55%',
    height: 16,
    borderRadius: 4,
    backgroundColor: AppColors.white.w06,
  },
  skeletonSubtitle: {
    width: '35%',
    height: 13,
    borderRadius: 3,
    backgroundColor: AppColors.white.w04,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyIconContainer: {
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: AppColors.white.w60,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: AppColors.white.w35,
    marginBottom: 28,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    gap: 8,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: AppColors.white.full,
  },
  // Bottom Sheet
  sheetBackdrop: {
    backgroundColor: AppColors.dark.overlay,
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: AppColors.dark.surfaceAlt,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  sheetHandle: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  sheetHandleBar: {
    width: 36,
    height: 4,
    backgroundColor: AppColors.white.w15,
    borderRadius: 2,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.white.w06,
  },
  sheetProjectIcon: {
    width: 36,
    height: 36,
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
    color: AppColors.white.full,
  },
  sheetProjectMeta: {
    fontSize: 13,
    color: AppColors.white.w40,
    marginTop: 2,
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.white.w06,
  },
  sheetActionItem: {
    alignItems: 'center',
    gap: 8,
  },
  sheetActionIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: AppColors.white.w06,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetActionText: {
    fontSize: 12,
    fontWeight: '500',
    color: AppColors.white.w60,
  },
  sheetDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: AppColors.errorAlpha.a08,
    borderRadius: 20,
  },
  sheetDeleteText: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.errorAlt,
  },
  sheetCancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginHorizontal: 20,
    marginTop: 8,
    backgroundColor: AppColors.white.w06,
    borderRadius: 20,
  },
  sheetCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.white.w50,
  },
  // Action Sheet
  actionSheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: AppColors.dark.surfaceAlt,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  actionSheetTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: AppColors.white.w35,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  actionSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  actionSheetIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AppColors.white.w06,
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
    color: AppColors.white.full,
  },
  actionSheetItemSubtitle: {
    fontSize: 13,
    color: AppColors.white.w40,
    marginTop: 2,
  },
});
