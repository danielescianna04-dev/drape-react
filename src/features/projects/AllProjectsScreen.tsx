import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { DraggableProject } from '../terminal/components/DraggableProject';
import { DropZoneFolder } from '../terminal/components/DropZoneFolder';
import { NewProjectModal } from '../terminal/components/NewProjectModal';
import { ImportGitHubModal } from '../terminal/components/ImportGitHubModal';
import { NewFolderModal } from '../terminal/components/NewFolderModal';

interface Props {
  onClose: () => void;
}

export const AllProjectsScreen = ({ onClose }: Props) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const {
    workstations,
    addWorkstation,
    setWorkstation,
    removeWorkstation,
    projectFolders,
    addProjectFolder,
    toggleFolderExpanded,
    removeProjectFolder,
    moveProjectToFolder,
    reorderWorkstations,
  } = useTerminalStore();

  const handleCreateProject = (name: string, language: string) => {
    const newWorkstation = {
      id: 'ws-' + Date.now(),
      name,
      language,
      status: 'idle' as const,
      createdAt: new Date(),
      files: [],
      folderId: null,
    };
    addWorkstation(newWorkstation);
  };

  const handleImportFromGitHub = (repoUrl: string) => {
    const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'Imported';
    const newWorkstation = {
      id: 'ws-' + Date.now(),
      name: repoName,
      language: 'Unknown',
      status: 'idle' as const,
      createdAt: new Date(),
      files: [],
      githubUrl: repoUrl,
      folderId: null,
    };
    addWorkstation(newWorkstation);
  };

  const handleCreateFolder = (name: string) => {
    const folder = {
      id: 'folder-' + Date.now(),
      name,
      parentId: null,
      isExpanded: true,
      createdAt: new Date(),
    };
    addProjectFolder(folder);
  };

  const filteredProjects = workstations.filter((ws) =>
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
        onConfirm={handleImportFromGitHub}
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
        {/* Folders */}
        {projectFolders.map((folder) => (
          <DropZoneFolder
            key={folder.id}
            folder={folder}
            isExpanded={folder.isExpanded}
            onToggle={() => toggleFolderExpanded(folder.id)}
            onDelete={() => removeProjectFolder(folder.id)}
          >
            <View style={styles.folderProjects}>
              {filteredProjects
                .filter((w) => w.folderId === folder.id)
                .map((ws, idx) => (
                  <DraggableProject
                    key={ws.id}
                    project={ws}
                    index={idx}
                    onPress={() => setWorkstation(ws)}
                    onDelete={() => removeWorkstation(ws.id)}
                    onDragEnd={moveProjectToFolder}
                    onReorder={reorderWorkstations}
                    folders={projectFolders}
                    allProjects={filteredProjects.filter((w) => w.folderId === folder.id)}
                  />
                ))}
            </View>
          </DropZoneFolder>
        ))}

        {/* Root Projects */}
        <View style={styles.rootProjects}>
          {filteredProjects
            .filter((w) => !w.folderId)
            .map((ws, idx) => (
              <DraggableProject
                key={ws.id}
                project={ws}
                index={idx}
                onPress={() => setWorkstation(ws)}
                onDelete={() => removeWorkstation(ws.id)}
                onDragEnd={moveProjectToFolder}
                onReorder={reorderWorkstations}
                folders={projectFolders}
                allProjects={filteredProjects.filter((w) => !w.folderId)}
              />
            ))}
        </View>

        {filteredProjects.length === 0 && (
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
  folderProjects: {
    marginLeft: 20,
    marginTop: 8,
  },
  rootProjects: {
    marginTop: 8,
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
