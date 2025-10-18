import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import { useTerminalStore } from '../../../core/terminal/terminalStore';

export const FolderManager = ({ onOpenWorkstation, onDeleteWorkstation }: any) => {
  const [contextMenu, setContextMenu] = useState<{ projectId: string } | null>(null);
  const { 
    workstations, 
    projectFolders,
    toggleFolderExpanded,
    removeProjectFolder,
    moveProjectToFolder
  } = useTerminalStore();

  const handleMoveToFolder = (projectId: string, folderId: string | null) => {
    moveProjectToFolder(projectId, folderId);
    setContextMenu(null);
  };

  return (
    <>
      {projectFolders.map((folder) => (
        <View key={folder.id}>
          <TouchableOpacity 
            style={styles.folderItem}
            onPress={() => toggleFolderExpanded(folder.id)}
          >
            <Ionicons 
              name={folder.isExpanded ? "chevron-down" : "chevron-forward"} 
              size={16} 
              color="rgba(255, 255, 255, 0.5)" 
            />
            <Ionicons name="folder" size={18} color="#FFA500" />
            <Text style={styles.folderName}>{folder.name}</Text>
            <TouchableOpacity 
              onPress={(e) => {
                e.stopPropagation();
                
                  removeProjectFolder(folder.id);
              }}
              style={styles.deleteButton}
            >
              <Ionicons name="trash-outline" size={14} color="#FF4444" />
            </TouchableOpacity>
          </TouchableOpacity>

          {folder.isExpanded && workstations
            .filter((w) => w.folderId === folder.id)
            .map((ws) => (
              <TouchableOpacity 
                key={ws.id} 
                style={styles.projectItemInFolder}
                onPress={() => onOpenWorkstation(ws)}
              >
                <View style={styles.projectHeader}>
                  <Ionicons name="document" size={14} color={AppColors.primary} />
                  <Text style={styles.projectName} numberOfLines={1}>{ws.name || 'Unnamed Project'}</Text>
                  <TouchableOpacity onPress={(e) => onDeleteWorkstation(ws.id, e)} style={styles.deleteButton}>
                    <Ionicons name="trash-outline" size={14} color="#FF4444" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
        </View>
      ))}

      {workstations
        .filter((w) => !w.folderId)
        .map((ws) => (
          <TouchableOpacity 
            key={ws.id} 
            style={styles.projectItem}
            onPress={() => onOpenWorkstation(ws)}
          >
            <View style={styles.projectHeader}>
              <Ionicons name="folder" size={16} color={AppColors.primary} />
              <Text style={styles.projectName} numberOfLines={1}>{ws.name || 'Unnamed Project'}</Text>
              <TouchableOpacity 
                onPress={(e) => {
                  e.stopPropagation();
                  setContextMenu({ projectId: ws.id });
                }} 
                style={styles.menuButton}
              >
                <Ionicons name="ellipsis-vertical" size={16} color="rgba(255, 255, 255, 0.5)" />
              </TouchableOpacity>
              <TouchableOpacity onPress={(e) => onDeleteWorkstation(ws.id, e)} style={styles.deleteButton}>
                <Ionicons name="trash-outline" size={16} color="#FF4444" />
              </TouchableOpacity>
            </View>
            <View style={styles.projectMeta}>
              {ws.language && (
                <View style={styles.languageTag}>
                  <Text style={styles.languageText}>{ws.language || 'Unknown'}</Text>
                </View>
              )}
              <View style={styles.projectStatus}>
                <View style={[styles.statusDot, { backgroundColor: ws.status === 'running' ? '#00FF88' : '#FFA500' }]} />
                <Text style={styles.statusText}>{ws.status || 'unknown'}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}

      {contextMenu && (
        <Modal
          visible={true}
          transparent
          animationType="fade"
          onRequestClose={() => setContextMenu(null)}
        >
          <TouchableOpacity 
            style={styles.contextMenuOverlay}
            activeOpacity={1}
            onPress={() => setContextMenu(null)}
          >
            <View style={styles.contextMenu}>
              <Text style={styles.contextMenuTitle}>Sposta in:</Text>
              
              <TouchableOpacity 
                style={styles.contextMenuItem}
                onPress={() => handleMoveToFolder(contextMenu.projectId, null)}
              >
                <Ionicons name="home-outline" size={18} color={AppColors.primary} />
                <Text style={styles.contextMenuText}>Root</Text>
              </TouchableOpacity>

              {projectFolders.map((folder) => (
                <TouchableOpacity 
                  key={folder.id}
                  style={styles.contextMenuItem}
                  onPress={() => handleMoveToFolder(contextMenu.projectId, folder.id)}
                >
                  <Ionicons name="folder" size={18} color="#FFA500" />
                  <Text style={styles.contextMenuText}>{folder.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(255, 165, 0, 0.1)',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 165, 0, 0.2)',
  },
  folderName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#FFA500',
  },
  projectItemInFolder: {
    padding: 10,
    marginLeft: 24,
    marginBottom: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 6,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0, 255, 136, 0.3)',
  },
  projectItem: {
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  projectName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  menuButton: {
    padding: 4,
  },
  deleteButton: {
    padding: 4,
  },
  projectMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  languageTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    borderRadius: 4,
  },
  languageText: {
    fontSize: 11,
    color: AppColors.primary,
    fontWeight: '600',
  },
  projectStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  contextMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contextMenu: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    minWidth: 250,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 136, 0.2)',
  },
  contextMenuTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 12,
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    marginBottom: 8,
  },
  contextMenuText: {
    fontSize: 14,
    color: '#FFFFFF',
    flex: 1,
  },
});
