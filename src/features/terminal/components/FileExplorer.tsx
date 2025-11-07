import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import { workstationService } from '../../../core/workstation/workstationService-firebase';
import { useTabStore } from '../../../core/tabs/tabStore';

interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
}

interface Props {
  projectId: string;
  repositoryUrl?: string;
  onFileSelect: (path: string) => void;
}

export const FileExplorer = ({ projectId, repositoryUrl, onFileSelect }: Props) => {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const { addTerminalItem } = useTabStore();

  useEffect(() => {
    loadFiles();
  }, [projectId]);

  const loadFiles = async () => {
    try {
      setLoading(true);
      setError(null);
      const fileList = await workstationService.getWorkstationFiles(projectId, repositoryUrl);
      console.log('📂 Files received from backend:', fileList.length);
      console.log('📂 First 10 files:', fileList.slice(0, 10));
      setFiles(fileList);
      // Success/error messages are handled by App.tsx, not here
    } catch (err: any) {
      console.error('Error loading files:', err);
      setError(err.message || 'Failed to load files');
      // Error message is handled by App.tsx
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

  const buildFileTree = (): FileTreeNode[] => {
    const root: FileTreeNode[] = [];
    const folderMap = new Map<string, FileTreeNode>();

    files.forEach(filePath => {
      const parts = filePath.split('/');
      let currentLevel = root;
      let currentPath = '';

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isFile = index === parts.length - 1;

        // Check if this node already exists at current level
        let node = currentLevel.find(n => n.name === part);

        if (!node) {
          node = {
            name: part,
            path: currentPath,
            type: isFile ? 'file' : 'folder',
            children: isFile ? undefined : []
          };
          currentLevel.push(node);

          if (!isFile) {
            folderMap.set(currentPath, node);
          }
        }

        // Move to next level if it's a folder
        if (!isFile && node.children) {
          currentLevel = node.children;
        }
      });
    });

    // Sort: folders first, then files; alphabetically within each group
    const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
      return nodes.sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === 'folder' ? -1 : 1;
      }).map(node => {
        if (node.children) {
          node.children = sortNodes(node.children);
        }
        return node;
      });
    };

    return sortNodes(root);
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

  const fileTree = buildFileTree();

  const renderNode = (node: FileTreeNode, depth: number = 0): React.ReactNode => {
    if (node.type === 'file') {
      const { icon, color } = getFileIcon(node.name);
      return (
        <TouchableOpacity
          key={node.path}
          style={[styles.fileItem, { paddingLeft: 20 + depth * 16 }]}
          onPress={() => onFileSelect(node.path)}
          activeOpacity={0.8}
        >
          <Ionicons name={icon as any} size={16} color={color} style={styles.fileIcon} />
          <Text style={styles.fileName} numberOfLines={1}>{node.name}</Text>
        </TouchableOpacity>
      );
    }

    // Folder
    const isExpanded = expandedFolders.has(node.path);
    return (
      <View key={node.path}>
        <TouchableOpacity
          style={[styles.folderItem, { paddingLeft: 8 + depth * 16 }]}
          onPress={() => toggleFolder(node.path)}
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
          <Text style={styles.folderName}>{node.name}</Text>
        </TouchableOpacity>

        {isExpanded && node.children && (
          <View>
            {node.children.map(child => renderNode(child, depth + 1))}
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {fileTree.map(node => renderNode(node, 0))}
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
  },
  fileIcon: {
    marginRight: 6,
  },
  fileName: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    flex: 1,
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
    flex: 1,
  },
});
