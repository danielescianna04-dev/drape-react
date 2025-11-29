import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Animated, Dimensions, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { AppColors } from '../../shared/theme/colors';
import { workstationService } from '../../core/workstation/workstationService-firebase';

interface Props {
  onCreateProject: () => void;
  onImportProject: () => void;
  onMyProjects: () => void;
  onOpenProject: (workstation: any) => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export const ProjectsHomeScreen = ({ onCreateProject, onImportProject, onMyProjects, onOpenProject }: Props) => {
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const actionSheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

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
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'now';
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
        Alert.alert('File Selected', `${file.name}\nSize: ${(file.size || 0) / 1024} KB`);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to open file picker');
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

  const sheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const handleOpenMenu = (project: any) => {
    setSelectedProject(project);
    setMenuVisible(true);
    // Animate sheet up
    Animated.spring(sheetAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const handleCloseMenu = () => {
    // Animate sheet down
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

    handleCloseMenu();

    setTimeout(() => {
      Alert.alert(
        'Delete Project',
        `Are you sure you want to delete "${selectedProject.name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await workstationService.deleteWorkstation(selectedProject.id);
                setRecentProjects(prev => prev.filter(p => p.id !== selectedProject.id));
              } catch (error) {
                console.error('Error deleting project:', error);
                Alert.alert('Error', 'Failed to delete project');
              }
            }
          }
        ]
      );
    }, 300);
  };

  const handleRenameProject = () => {
    if (!selectedProject) return;
    const projectToRename = selectedProject;

    handleCloseMenu();

    setTimeout(() => {
      Alert.prompt(
        'Rename Project',
        'Enter a new name:',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Rename',
            onPress: async (newName) => {
              if (newName && newName.trim()) {
                try {
                  // TODO: Implement rename in workstationService
                  setRecentProjects(prev =>
                    prev.map(p => p.id === projectToRename.id ? { ...p, name: newName.trim() } : p)
                  );
                } catch (error) {
                  console.error('Error renaming project:', error);
                  Alert.alert('Error', 'Failed to rename project');
                }
              }
            }
          }
        ],
        'plain-text',
        projectToRename.name
      );
    }, 300);
  };

  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.6],
  });

  const SkeletonItem = () => (
    <View style={styles.skeletonItem}>
      <Animated.View style={[styles.skeletonIcon, { opacity: shimmerOpacity }]} />
      <Animated.View style={[styles.skeletonTitle, { opacity: shimmerOpacity }]} />
      <Animated.View style={[styles.skeletonSubtitle, { opacity: shimmerOpacity }]} />
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Animated gradient background */}
      <LinearGradient
        colors={['#000000', '#0a0510', '#050208', '#000000']}
        locations={[0, 0.3, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Glow effects */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.avatarButton} activeOpacity={0.7}>
          <Ionicons name="person" size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addButton}
          activeOpacity={0.8}
          onPress={handleOpenActionMenu}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Projects section */}
      <View style={styles.projectsContainer}>
        <View style={styles.projectsHeader}>
          <Text style={styles.projectsTitle}>Your Projects</Text>
        </View>

        <ScrollView
          style={styles.projectsScrollView}
          contentContainerStyle={styles.projectsScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            // Skeleton loading state - simple list
            <>
              <SkeletonItem />
              <SkeletonItem />
              <SkeletonItem />
              <SkeletonItem />
            </>
          ) : recentProjects.length > 0 ? (
            // Project cards
            <>
              {recentProjects.map((project) => (
                <TouchableOpacity
                  key={project.id}
                  style={styles.projectCard}
                  activeOpacity={0.7}
                  onPress={() => onOpenProject(project)}
                  onLongPress={() => handleOpenMenu(project)}
                  delayLongPress={400}
                >
                  <View style={styles.projectCardHeader}>
                    <View style={styles.projectIcon}>
                      <Ionicons name="folder" size={20} color={AppColors.primary} />
                    </View>
                    <TouchableOpacity
                      style={styles.projectMenuBtn}
                      onPress={() => handleOpenMenu(project)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="ellipsis-horizontal" size={16} color="rgba(255, 255, 255, 0.4)" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
                  <Text style={styles.projectMeta}>
                    {project.language || 'Project'} • {getTimeAgo(project.createdAt)}
                  </Text>
                </TouchableOpacity>
              ))}

              {/* View All Projects Button */}
              <TouchableOpacity
                style={styles.viewAllProjectsButton}
                activeOpacity={0.7}
                onPress={onMyProjects}
              >
                <View style={styles.viewAllProjectsContent}>
                  <Ionicons name="grid-outline" size={18} color={AppColors.primary} />
                  <Text style={styles.viewAllProjectsText}>View all projects</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(255, 255, 255, 0.3)" />
              </TouchableOpacity>
            </>
          ) : (
            // Empty state
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="folder-open-outline" size={40} color="rgba(255, 255, 255, 0.15)" />
              </View>
              <Text style={styles.emptyText}>No projects yet</Text>
              <Text style={styles.emptySubtext}>Tap + to create your first project</Text>
            </View>
          )}
        </ScrollView>
      </View>

      {/* Bottom Action Sheet */}
      {menuVisible && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {/* Backdrop */}
          <Pressable
            style={[StyleSheet.absoluteFill, styles.sheetBackdrop]}
            onPress={handleCloseMenu}
          />

          {/* Sheet container */}
          <Animated.View
            style={[
              styles.sheetContainer,
              { transform: [{ translateY: sheetAnim }] }
            ]}
          >
            {/* Handle bar */}
            <View style={styles.sheetHandle}>
              <View style={styles.sheetHandleBar} />
            </View>

            {/* Project name header */}
            <View style={styles.sheetHeader}>
              <View style={styles.sheetProjectIcon}>
                <Ionicons name="folder" size={20} color={AppColors.primary} />
              </View>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {selectedProject?.name}
              </Text>
            </View>

            {/* Actions */}
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.sheetItem}
                activeOpacity={0.6}
                onPress={() => {
                  const project = selectedProject;
                  handleCloseMenu();
                  setTimeout(() => project && onOpenProject(project), 250);
                }}
              >
                <View style={styles.sheetItemIcon}>
                  <Ionicons name="open-outline" size={22} color="#fff" />
                </View>
                <Text style={styles.sheetItemText}>Open</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetItem} activeOpacity={0.6} onPress={handleRenameProject}>
                <View style={styles.sheetItemIcon}>
                  <Ionicons name="pencil-outline" size={22} color="#fff" />
                </View>
                <Text style={styles.sheetItemText}>Rename</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetItem} activeOpacity={0.6}>
                <View style={styles.sheetItemIcon}>
                  <Ionicons name="copy-outline" size={22} color="#fff" />
                </View>
                <Text style={styles.sheetItemText}>Duplicate</Text>
              </TouchableOpacity>
            </View>

            {/* Delete action (separate) */}
            <TouchableOpacity style={styles.sheetDeleteButton} activeOpacity={0.6} onPress={handleDeleteProject}>
              <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
              <Text style={styles.sheetDeleteText}>Delete Project</Text>
            </TouchableOpacity>

            {/* Cancel button */}
            <TouchableOpacity style={styles.sheetCancelButton} activeOpacity={0.7} onPress={handleCloseMenu}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      {/* Action Menu (FAB) Bottom Sheet */}
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

            <Text style={styles.actionSheetTitle}>Create</Text>

            <TouchableOpacity
              style={styles.actionSheetItem}
              activeOpacity={0.7}
              onPress={() => {
                handleCloseActionMenu();
                setTimeout(onCreateProject, 250);
              }}
            >
              <View style={[styles.actionSheetIcon, { backgroundColor: 'rgba(139, 124, 246, 0.15)' }]}>
                <Ionicons name="add-circle" size={24} color={AppColors.primary} />
              </View>
              <View style={styles.actionSheetItemInfo}>
                <Text style={styles.actionSheetItemTitle}>New Project</Text>
                <Text style={styles.actionSheetItemSubtitle}>Start from scratch</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionSheetItem}
              activeOpacity={0.7}
              onPress={() => {
                handleCloseActionMenu();
                setTimeout(onImportProject, 250);
              }}
            >
              <View style={[styles.actionSheetIcon, { backgroundColor: 'rgba(255, 255, 255, 0.08)' }]}>
                <Ionicons name="logo-github" size={24} color="#fff" />
              </View>
              <View style={styles.actionSheetItemInfo}>
                <Text style={styles.actionSheetItemTitle}>Import from GitHub</Text>
                <Text style={styles.actionSheetItemSubtitle}>Clone a repository</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionSheetItem}
              activeOpacity={0.7}
              onPress={handleBrowseFiles}
            >
              <View style={[styles.actionSheetIcon, { backgroundColor: 'rgba(255, 255, 255, 0.08)' }]}>
                <Ionicons name="folder-open" size={24} color="#fff" />
              </View>
              <View style={styles.actionSheetItemInfo}>
                <Text style={styles.actionSheetItemTitle}>Browse Files</Text>
                <Text style={styles.actionSheetItemSubtitle}>Open from device</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetCancelButton} activeOpacity={0.7} onPress={handleCloseActionMenu}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
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
  },
  glowTop: {
    position: 'absolute',
    top: -200,
    left: -100,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(139, 124, 246, 0.05)',
    opacity: 0.3,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -100,
    right: -150,
    width: 500,
    height: 500,
    borderRadius: 250,
    backgroundColor: 'rgba(107, 93, 214, 0.03)',
    opacity: 0.2,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    marginBottom: 24,
  },
  avatarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Projects section
  projectsContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  projectsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  projectsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  projectsScrollView: {
    flex: 1,
  },
  projectsScrollContent: {
    paddingBottom: 40,
  },
  // Project card
  projectCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  projectCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  projectIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(139, 124, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectMenuBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  projectMeta: {
    fontSize: 13,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  // View All Projects Button
  viewAllProjectsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(139, 124, 246, 0.08)',
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.15)',
  },
  viewAllProjectsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  viewAllProjectsText: {
    fontSize: 14,
    fontWeight: '500',
    color: AppColors.primary,
  },
  // Skeleton loading
  skeletonItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  skeletonIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    marginBottom: 12,
  },
  skeletonTitle: {
    width: '60%',
    height: 18,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    marginBottom: 8,
  },
  skeletonSubtitle: {
    width: '40%',
    height: 14,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  emptySubtext: {
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.25)',
    marginTop: 4,
  },
  // Bottom Sheet (project menu)
  sheetBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#161618',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 34,
  },
  sheetHandle: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  sheetHandleBar: {
    width: 32,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 2,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  sheetProjectIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(139, 124, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  sheetItem: {
    alignItems: 'center',
    gap: 6,
    minWidth: 65,
  },
  sheetItemIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetItemText: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  sheetDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: 'rgba(255, 90, 90, 0.08)',
    borderRadius: 10,
  },
  sheetDeleteText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF5A5A',
  },
  sheetCancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
  },
  sheetCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  // Action Sheet (FAB menu)
  actionSheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#161618',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 34,
  },
  actionSheetTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.35)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  actionSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  actionSheetIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionSheetItemInfo: {
    flex: 1,
  },
  actionSheetItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  actionSheetItemSubtitle: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.4)',
  },
});
