import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import { workstationService } from '../../../core/workstation/workstationService-firebase';

interface Props {
  projectId: string;
  onFileSelect: (path: string) => void;
}

export const FileExplorer = ({ projectId, onFileSelect }: Props) => {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadFiles();
  }, [projectId]);

  const loadFiles = async () => {
    try {
      setLoading(true);
      setError(null);
      const fileList = await workstationService.getWorkstationFiles(projectId);
      setFiles(fileList);
    } catch (err: any) {
      console.error('Error loading files:', err);
      setError(err.message || 'Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const iconMap: { [key: string]: { icon: string; color: string } } = {
      js: { icon: 'logo-javascript', color: '#F7DF1E' },
      jsx: { icon: 'logo-react', color: '#61DAFB' },
      ts: { icon: 'logo-javascript', color: '#3178C6' },
      tsx: { icon: 'logo-react', color: '#3178C6' },
      py: { icon: 'logo-python', color: '#3776AB' },
      html: { icon: 'logo-html5', color: '#E34F26' },
      css: { icon: 'logo-css3', color: '#1572B6' },
      json: { icon: 'code-working', color: '#FFB800' },
      md: { icon: 'document-text', color: '#888888' },
    };
    return iconMap[ext || ''] || { icon: 'document-outline', color: '#888888' };
  };

  const organizeFiles = () => {
    const tree: { [key: string]: string[] } = {};
    
    files.forEach(file => {
      const parts = file.split('/');
      if (parts.length === 1) {
        if (!tree['_root']) tree['_root'] = [];
        tree['_root'].push(file);
      } else {
        const folder = parts[0];
        if (!tree[folder]) tree[folder] = [];
        tree[folder].push(file);
      }
    });
    
    return tree;
  };

  const toggleFolder = (folder: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folder)) {
      newExpanded.delete(folder);
    } else {
      newExpanded.add(folder);
    }
    setExpandedFolders(newExpanded);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="small" color="rgba(255, 255, 255, 0.5)" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (files.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>No files</Text>
      </View>
    );
  }

  const fileTree = organizeFiles();
  const folders = Object.keys(fileTree).filter(k => k !== '_root').sort();
  const rootFiles = fileTree['_root'] || [];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Root files */}
      {rootFiles.map((file, index) => {
        const { icon, color } = getFileIcon(file);
        return (
          <TouchableOpacity
            key={`root-${index}`}
            style={styles.fileItem}
            onPress={() => onFileSelect(file)}
            activeOpacity={0.8}
          >
            <Ionicons name={icon as any} size={16} color={color} style={styles.fileIcon} />
            <Text style={styles.fileName} numberOfLines={1}>{file}</Text>
          </TouchableOpacity>
        );
      })}

      {/* Folders */}
      {folders.map((folder) => {
        const isExpanded = expandedFolders.has(folder);
        const folderFiles = fileTree[folder];
        
        return (
          <View key={folder}>
            <TouchableOpacity
              style={styles.folderItem}
              onPress={() => toggleFolder(folder)}
              activeOpacity={0.8}
            >
              <Ionicons 
                name={isExpanded ? 'chevron-down' : 'chevron-forward'} 
                size={14} 
                color="rgba(255, 255, 255, 0.6)" 
                style={styles.chevron}
              />
              <Ionicons 
                name={isExpanded ? 'folder-open' : 'folder'} 
                size={16} 
                color={isExpanded ? '#8B5CF6' : 'rgba(255, 255, 255, 0.6)'} 
                style={styles.folderIcon}
              />
              <Text style={styles.folderName}>{folder}</Text>
            </TouchableOpacity>
            
            {isExpanded && (
              <View>
                {folderFiles.map((file, index) => {
                  const { icon, color } = getFileIcon(file);
                  const fileName = file.split('/').pop() || file;
                  
                  return (
                    <TouchableOpacity
                      key={index}
                      style={styles.nestedFileItem}
                      onPress={() => onFileSelect(file)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name={icon as any} size={16} color={color} style={styles.nestedFileIcon} />
                      <Text style={styles.nestedFileName} numberOfLines={1}>{fileName}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  emptyText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    paddingLeft: 20,
  },
  fileIcon: {
    marginRight: 6,
  },
  fileName: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  chevron: {
    marginRight: 2,
  },
  folderIcon: {
    marginRight: 6,
  },
  folderName: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
  },
  nestedFileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    paddingLeft: 36,
  },
  nestedFileIcon: {
    marginRight: 6,
  },
  nestedFileName: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
  },
});
