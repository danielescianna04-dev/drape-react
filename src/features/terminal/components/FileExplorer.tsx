import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Platform } from 'react-native';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'name' | 'content'>('name');
  const [searchResults, setSearchResults] = useState<{ file: string; line: number; content: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const { addTab } = useTabStore();

  useEffect(() => {
    loadFiles();
  }, [projectId]);

  // Debounced content search
  useEffect(() => {
    if (searchMode === 'content' && searchQuery.trim()) {
      const timer = setTimeout(async () => {
        try {
          setSearching(true);
          const results = await workstationService.searchInFiles(projectId, searchQuery, repositoryUrl);
          setSearchResults(results);
        } catch (err) {
          console.error('Search error:', err);
          setSearchResults([]);
        } finally {
          setSearching(false);
        }
      }, 500); // 500ms debounce

      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, searchMode, projectId, repositoryUrl]);

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

  const filterFiles = (): string[] => {
    if (!searchQuery.trim()) {
      return files;
    }

    const query = searchQuery.toLowerCase().trim();

    if (searchMode === 'name') {
      // Search by file name only
      return files.filter(filePath => {
        const fileName = filePath.split('/').pop() || '';
        return fileName.toLowerCase().includes(query);
      });
    }

    // Content search - use backend results
    if (searchMode === 'content' && searchResults.length > 0) {
      // Extract unique file paths from search results
      const uniqueFiles = Array.from(new Set(searchResults.map(r => r.file)));
      return uniqueFiles;
    }

    // No results yet or searching
    return [];
  };

  const buildFileTree = (): FileTreeNode[] => {
    const root: FileTreeNode[] = [];
    const folderMap = new Map<string, FileTreeNode>();

    const filteredFiles = filterFiles();
    filteredFiles.forEach(filePath => {
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
          onPress={() => {
            // Create a new tab for this file
            const fileName = node.name;
            const tabId = `file-${projectId}-${node.path}`;

            addTab({
              id: tabId,
              type: 'file',
              title: fileName,
              data: {
                filePath: node.path,
                projectId,
                repositoryUrl,
                userId: 'anonymous', // TODO: Get from auth
              }
            });

            onFileSelect(node.path); // Keep for backward compatibility
          }}
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

  // Render search results in VS Code style
  const renderSearchResults = () => {
    if (!searchQuery.trim()) return null;

    if (searchMode === 'content') {
      if (searching) {
        return (
          <View style={styles.searchResultsContainer}>
            <ActivityIndicator size="large" color={AppColors.primary} />
            <Text style={styles.searchingText}>Searching...</Text>
          </View>
        );
      }

      if (searchResults.length === 0) {
        return (
          <View style={styles.searchResultsContainer}>
            <Ionicons name="search-outline" size={48} color="rgba(255, 255, 255, 0.3)" />
            <Text style={styles.noResultsText}>No results found</Text>
          </View>
        );
      }

      // Group results by file
      const resultsByFile = searchResults.reduce((acc, result) => {
        if (!acc[result.file]) {
          acc[result.file] = [];
        }
        acc[result.file].push(result);
        return acc;
      }, {} as Record<string, typeof searchResults>);

      return (
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <Text style={styles.resultsCount}>
            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} in {Object.keys(resultsByFile).length} file{Object.keys(resultsByFile).length !== 1 ? 's' : ''}
          </Text>

          {Object.entries(resultsByFile).map(([filePath, results]) => {
            const { icon, color } = getFileIcon(filePath);
            const fileName = filePath.split('/').pop() || filePath;

            return (
              <View key={filePath} style={styles.fileResultGroup}>
                {/* File header */}
                <View style={styles.fileResultHeader}>
                  <Ionicons name={icon as any} size={16} color={color} style={styles.resultFileIcon} />
                  <Text style={styles.fileResultPath}>{filePath}</Text>
                  <View style={styles.resultCountBadge}>
                    <Text style={styles.resultCountText}>{results.length}</Text>
                  </View>
                </View>

                {/* Line matches */}
                {results.map((result, index) => (
                  <TouchableOpacity
                    key={`${filePath}-${result.line}-${index}`}
                    style={styles.resultItem}
                    onPress={() => {
                      const tabId = `file-${projectId}-${filePath}`;
                      addTab({
                        id: tabId,
                        type: 'file',
                        title: fileName,
                        data: {
                          filePath,
                          projectId,
                          repositoryUrl,
                          userId: 'anonymous',
                          highlightLine: result.line,
                        }
                      });
                      onFileSelect(filePath);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.lineNumber}>{result.line}</Text>
                    <Text style={styles.resultContent} numberOfLines={2}>
                      {result.content}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            );
          })}
        </ScrollView>
      );
    }

    // Name search - show as before
    return (
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {fileTree.map(node => renderNode(node, 0))}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          {searching ? (
            <ActivityIndicator size="small" color={AppColors.primary} style={styles.searchIcon} />
          ) : (
            <Ionicons name="search" size={16} color="rgba(255, 255, 255, 0.5)" style={styles.searchIcon} />
          )}
          <TextInput
            style={styles.searchInput}
            placeholder={searchMode === 'name' ? 'Search files by name...' : 'Search in file contents...'}
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <Ionicons name="close-circle" size={16} color="rgba(255, 255, 255, 0.5)" />
            </TouchableOpacity>
          )}
        </View>

        {/* Search Mode Toggle */}
        <View style={styles.searchModeContainer}>
          <TouchableOpacity
            style={[styles.searchModeButton, searchMode === 'name' && styles.searchModeButtonActive]}
            onPress={() => setSearchMode('name')}
          >
            <Text style={[styles.searchModeText, searchMode === 'name' && styles.searchModeTextActive]}>
              Name
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.searchModeButton, searchMode === 'content' && styles.searchModeButtonActive]}
            onPress={() => setSearchMode('content')}
          >
            <Text style={[styles.searchModeText, searchMode === 'content' && styles.searchModeTextActive]}>
              Content
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Results or File Tree */}
      {searchQuery.trim() && searchMode === 'content' ? (
        renderSearchResults()
      ) : (
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {fileTree.map(node => renderNode(node, 0))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    padding: 8,
    backgroundColor: '#0a0a0a',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 36,
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 13,
  },
  clearButton: {
    padding: 4,
  },
  searchModeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  searchModeButton: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  searchModeButtonActive: {
    backgroundColor: AppColors.primary,
  },
  searchModeText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
  },
  searchModeTextActive: {
    color: 'white',
  },
  scrollView: {
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
  // VS Code style search results
  searchResultsContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  searchingText: {
    marginTop: 16,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  noResultsText: {
    marginTop: 16,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  resultsCount: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(139, 124, 246, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  fileResultGroup: {
    marginBottom: 12,
  },
  fileResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  resultFileIcon: {
    marginRight: 8,
  },
  fileResultPath: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
  },
  resultCountBadge: {
    backgroundColor: 'rgba(139, 124, 246, 0.2)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  resultCountText: {
    fontSize: 11,
    color: AppColors.primary,
    fontWeight: '600',
  },
  resultItem: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
  },
  lineNumber: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
    fontWeight: '600',
    width: 40,
    marginRight: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  resultContent: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
