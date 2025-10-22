import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import { workstationService } from '../../../core/workstation/workstationService-firebase';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

interface Props {
  projectId: string;
  onFileSelect?: (path: string) => void;
}

export const FileExplorer = ({ projectId, onFileSelect }: Props) => {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadFiles();
  }, [projectId]);

  const loadFiles = async () => {
    try {
      setLoading(true);
      const fileList = await workstationService.getProjectFiles(projectId);
      const tree = buildFileTree(fileList);
      setFiles(tree);
    } catch (error) {
      console.error('Error loading files:', error);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const buildFileTree = (paths: string[]): FileNode[] => {
    const root: FileNode[] = [];
    
    paths.forEach(path => {
      const parts = path.split('/').filter(Boolean);
      let current = root;
      
      parts.forEach((part, index) => {
        const isFile = index === parts.length - 1 && part.includes('.');
        const fullPath = parts.slice(0, index + 1).join('/');
        
        let node = current.find(n => n.name === part);
        if (!node) {
          node = {
            name: part,
            path: fullPath,
            type: isFile ? 'file' : 'directory',
            children: isFile ? undefined : []
          };
          current.push(node);
        }
        
        if (!isFile && node.children) {
          current = node.children;
        }
      });
    });
    
    return root;
  };

  const toggleDirectory = (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const getFileIcon = (name: string): string => {
    const ext = name.split('.').pop()?.toLowerCase();
    const iconMap: Record<string, string> = {
      js: 'logo-javascript',
      ts: 'logo-javascript',
      jsx: 'logo-react',
      tsx: 'logo-react',
      py: 'logo-python',
      json: 'code-working',
      md: 'document-text',
      css: 'color-palette',
      html: 'logo-html5',
      git: 'git-branch',
    };
    return iconMap[ext || ''] || 'document-outline';
  };

  const renderNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = expandedDirs.has(node.path);
    const isDirectory = node.type === 'directory';

    return (
      <View key={node.path}>
        <TouchableOpacity
          style={[styles.item, { paddingLeft: 12 + depth * 16 }]}
          onPress={() => {
            if (isDirectory) {
              toggleDirectory(node.path);
            } else {
              onFileSelect?.(node.path);
            }
          }}
          activeOpacity={0.7}
        >
          {isDirectory && (
            <Ionicons
              name={isExpanded ? 'chevron-down' : 'chevron-forward'}
              size={14}
              color="rgba(255, 255, 255, 0.5)"
              style={styles.chevron}
            />
          )}
          <Ionicons
            name={isDirectory ? (isExpanded ? 'folder-open' : 'folder') : getFileIcon(node.name)}
            size={16}
            color={isDirectory ? '#FFA500' : AppColors.primary}
          />
          <Text style={styles.itemText} numberOfLines={1}>
            {node.name}
          </Text>
        </TouchableOpacity>
        
        {isDirectory && isExpanded && node.children && (
          <View>
            {node.children.map(child => renderNode(child, depth + 1))}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Caricamento file...</Text>
      </View>
    );
  }

  if (files.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="folder-open-outline" size={48} color="rgba(255, 255, 255, 0.3)" />
        <Text style={styles.emptyText}>Nessun file trovato</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {files.map(node => renderNode(node))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingRight: 12,
  },
  chevron: {
    width: 14,
  },
  itemText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 16,
  },
});
