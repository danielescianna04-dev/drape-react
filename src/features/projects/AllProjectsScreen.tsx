import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { workstationService } from '../../core/workstation/workstationService-firebase';
import { NewProjectModal } from '../terminal/components/NewProjectModal';
import { ImportGitHubModal } from '../terminal/components/ImportGitHubModal';
import { NewFolderModal } from '../terminal/components/NewFolderModal';
import { AppColors } from '../../shared/theme/colors';

interface Props {
  onClose: () => void;
  onOpenProject?: (workstation: any) => void;
}

export const AllProjectsScreen = ({ onClose, onOpenProject }: Props) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const { setWorkstation } = useTerminalStore();

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const workstations = await workstationService.getWorkstations();
      // Sort by creation date (newest first)
      const sorted = workstations.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setProjects(sorted);
    } catch (error) {
      console.error('Error loading projects:', error);
      Alert.alert('Error', 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (name: string, language: string) => {
    // TODO: Create project via workstationService
    Alert.alert('Coming Soon', 'Creating projects from this screen will be available soon');
    setShowNewProjectModal(false);
  };

  const handleImportFromGitHub = async (repoUrl: string) => {
    // This should use the parent's import flow
    setShowImportModal(false);
    onClose(); // Go back to home where import is handled
  };

  const handleOpenProject = async (ws: any) => {
    setWorkstation(ws);

    // Use the onOpenProject callback if provided
    if (onOpenProject) {
      onOpenProject(ws);
      return;
    }

    // Fallback: just close the screen
    onClose();
  };

  const handleCreateFolder = (name: string) => {
    Alert.alert('Coming Soon', 'Folders will be available soon');
    setShowNewFolderModal(false);
  };

  const handleDeleteProject = async (projectId: string) => {
    Alert.alert(
      'Delete Project',
      'Are you sure you want to delete this project?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await workstationService.deleteWorkstation(projectId);
              loadProjects(); // Reload the list
            } catch (error) {
              console.error('Error deleting project:', error);
              Alert.alert('Error', 'Failed to delete project');
            }
          },
        },
      ]
    );
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

  const filteredProjects = projects.filter((ws) =>
    ws.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
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
      <LinearGradient
        colors={['#090A0B', '#1C1C1E']}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#EDEDED" />
          </TouchableOpacity>
          <Text style={styles.title}>All Projects</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.viewModeButton}
              onPress={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            >
              <Ionicons
                name={viewMode === 'grid' ? 'list' : 'grid'}
                size={20}
                color="#9CA3AF"
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search projects..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowNewProjectModal(true)}
          >
            <Ionicons name="add-circle" size={20} color="#6F5CFF" />
            <Text style={styles.actionButtonText}>New Project</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowImportModal(true)}
          >
            <Ionicons name="logo-github" size={20} color="#6F5CFF" />
            <Text style={styles.actionButtonText}>Import</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowNewFolderModal(true)}
          >
            <Ionicons name="folder-open" size={20} color="#B6ADFF" />
            <Text style={styles.actionButtonText}>New Folder</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={AppColors.primary} />
            <Text style={styles.loadingText}>Loading projects...</Text>
          </View>
        ) : filteredProjects.length > 0 ? (
          filteredProjects.map((project) => (
            <TouchableOpacity
              key={project.id}
              style={styles.projectCard}
              activeOpacity={0.7}
              onPress={() => handleOpenProject(project)}
              onLongPress={() => handleDeleteProject(project.id)}
              delayLongPress={500}
            >
              <View style={styles.projectCardHeader}>
                <View style={styles.projectIcon}>
                  <Ionicons name="folder" size={20} color={AppColors.primary} />
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
              <Text style={styles.projectMeta}>
                {project.language || 'Project'} • {getTimeAgo(project.createdAt)}
              </Text>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={64} color="#9CA3AF" />
            <Text style={styles.emptyText}>No projects found</Text>
            <Text style={styles.emptySubtext}>Create your first project to get started</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090A0B',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(111, 92, 255, 0.1)',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  title: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: '#EDEDED',
    letterSpacing: 0.3,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  viewModeButton: {
    padding: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(111, 92, 255, 0.1)',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#EDEDED',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(111, 92, 255, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(111, 92, 255, 0.2)',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6F5CFF',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 12,
  },
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
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#EDEDED',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
  },
});
