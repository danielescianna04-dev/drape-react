import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
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

export const ProjectsHomeScreen = ({ onCreateProject, onImportProject, onMyProjects, onOpenProject }: Props) => {
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecentProjects();
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

      {/* Minimal header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.logo}>drape</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>AI IDE</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.avatarButton} activeOpacity={0.8}>
          <LinearGradient
            colors={['rgba(139, 124, 246, 0.2)', 'rgba(107, 93, 214, 0.1)']}
            style={styles.avatarGradient}
          >
            <Ionicons name="person" size={18} color="rgba(255, 255, 255, 0.9)" />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Quick actions - horizontal cards */}
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.primaryAction} onPress={onCreateProject} activeOpacity={0.85}>
          <LinearGradient
            colors={['rgba(139, 124, 246, 0.15)', 'rgba(139, 124, 246, 0.08)']}
            style={styles.primaryActionGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.actionContent}>
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.primaryActionText}>New Project</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color="rgba(255, 255, 255, 0.6)" />
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.secondaryActions}>
          <TouchableOpacity style={styles.secondaryAction} onPress={onImportProject} activeOpacity={0.85}>
            <Ionicons name="cloud-download-outline" size={20} color="rgba(255, 255, 255, 0.7)" />
            <Text style={styles.secondaryActionText}>Import</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryAction} onPress={handleBrowseFiles} activeOpacity={0.85}>
            <Ionicons name="folder-outline" size={20} color="rgba(255, 255, 255, 0.7)" />
            <Text style={styles.secondaryActionText}>Browse</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Projects section */}
      {recentProjects.length > 0 && (
        <View style={styles.projectsContainer}>
          <View style={styles.projectsHeader}>
            <Text style={styles.projectsTitle}>Recent</Text>
            <TouchableOpacity onPress={onMyProjects} style={styles.viewAllButton} activeOpacity={0.8}>
              <Text style={styles.viewAllText}>View all</Text>
              <Ionicons name="chevron-forward" size={14} color="rgba(255, 255, 255, 0.5)" />
            </TouchableOpacity>
          </View>

          {/* Only projects grid scrolls */}
          <ScrollView
            style={styles.projectsScrollView}
            contentContainerStyle={styles.projectsScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.projectsGrid}>
              {recentProjects.map((project) => (
                <TouchableOpacity
                  key={project.id}
                  style={styles.projectCard}
                  activeOpacity={0.85}
                  onPress={() => onOpenProject(project)}
                >
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.04)', 'rgba(255, 255, 255, 0.02)']}
                    style={styles.projectCardGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <View style={styles.projectCardContent}>
                      <View style={styles.projectIconCircle}>
                        <LinearGradient
                          colors={['rgba(139, 124, 246, 0.2)', 'rgba(107, 93, 214, 0.1)']}
                          style={styles.projectIconGradient}
                        >
                          <Ionicons name="folder" size={14} color="rgba(255, 255, 255, 0.8)" />
                        </LinearGradient>
                      </View>

                      <View style={styles.projectInfo}>
                        <Text style={styles.projectTitle} numberOfLines={1}>{project.name}</Text>
                        <View style={styles.projectMeta}>
                          <Text style={styles.projectLang}>{project.language || 'Unknown'}</Text>
                          <Text style={styles.projectDate}>{getTimeAgo(project.createdAt)}</Text>
                        </View>
                      </View>

                      <Ionicons name="chevron-forward" size={14} color="rgba(255, 255, 255, 0.25)" />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
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
    backgroundColor: 'rgba(139, 124, 246, 0.08)',
    opacity: 0.5,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -100,
    right: -150,
    width: 500,
    height: 500,
    borderRadius: 250,
    backgroundColor: 'rgba(107, 93, 214, 0.06)',
    opacity: 0.4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    marginBottom: 24,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    fontSize: 24,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.2)',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    letterSpacing: 0.5,
  },
  avatarButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  avatarGradient: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.3)',
  },
  quickActions: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  projectsScrollView: {
    flex: 1,
  },
  projectsScrollContent: {
    paddingBottom: 20,
  },
  primaryAction: {
    marginBottom: 12,
    borderRadius: 14,
    overflow: 'hidden',
  },
  primaryActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.2)',
    borderRadius: 14,
  },
  actionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  primaryActionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  projectsContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  projectsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  projectsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  projectsGrid: {
    gap: 8,
  },
  projectCard: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  projectCardGradient: {
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
  },
  projectCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  projectIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
  },
  projectIconGradient: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.25)',
  },
  projectInfo: {
    flex: 1,
  },
  projectTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.95)',
    marginBottom: 3,
  },
  projectMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  projectLang: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  projectDate: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.35)',
  },
});
