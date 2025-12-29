import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Platform, LayoutAnimation, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import { workstationService } from '../../../core/workstation/workstationService-firebase';
import { useTabStore } from '../../../core/tabs/tabStore';
import { gitAccountService } from '../../../core/git/gitAccountService';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { useFileCacheStore } from '../../../core/cache/fileCacheStore';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

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
  onAuthRequired?: (repoUrl: string) => void;
}

export const FileExplorer = ({ projectId, repositoryUrl, onFileSelect, onAuthRequired }: Props) => {
  // Initialize from cache immediately (EVEN IF EXPIRED - Stale-While-Revalidate)
  const cachedFiles = useFileCacheStore.getState().getFilesIgnoringExpiry(projectId);
  const [files, setFiles] = useState<string[]>(cachedFiles || []);
  const [loading, setLoading] = useState(!cachedFiles);
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

  const loadFiles = async (forceRefresh = false) => {
    try {
      // 1. Get Cached Files (Stale allowed)
      const cachedFiles = useFileCacheStore.getState().getFilesIgnoringExpiry(projectId);
      const isCacheValid = useFileCacheStore.getState().isCacheValid(projectId);

      // 2. If we have cache (even stale) and not forcing refresh, show it immediately
      if (cachedFiles && !forceRefresh) {
        console.log(`📁 [FileExplorer] Using cached files (${cachedFiles.length}) - Valid: ${isCacheValid}`);
        setFiles(cachedFiles);
        setLoading(false);

        // If cache is valid, stop here. If stale, continue to fetch in background.
        if (isCacheValid) return;

        console.log('stock [FileExplorer] Cache is stale, revalidating in background...');
      } else {
        // No cache? Show loading
        setLoading(true);
      }

      setError(null);

      // Get token for this repo (auto-detect provider from URL)
      let gitToken: string | null = null;
      const userId = useTerminalStore.getState().userId || 'anonymous';
      try {
        if (repositoryUrl) {
          // Try to get token for specific repo provider
          const tokenData = await gitAccountService.getTokenForRepo(userId, repositoryUrl);
          if (tokenData) {
            gitToken = tokenData.token;
            console.log(`🔐 Using ${tokenData.account.provider} token for:`, tokenData.account.username);
          }
        }
        // Fallback to default account if no provider-specific token
        if (!gitToken) {
          const defaultTokenData = await gitAccountService.getDefaultToken(userId);
          if (defaultTokenData) {
            gitToken = defaultTokenData.token;
            console.log(`🔐 Using default ${defaultTokenData.account.provider} token for:`, defaultTokenData.account.username);
          }
        }
      } catch (tokenErr) {
        console.log('⚠️ Could not get Git token, trying without:', tokenErr);
      }

      const fileList = await workstationService.getWorkstationFiles(projectId, repositoryUrl, gitToken || undefined);
      console.log('📂 Files received from backend:', fileList.length);
      console.log('📂 First 10 files:', fileList.slice(0, 10));

      // Save to cache
      useFileCacheStore.getState().setFiles(projectId, fileList, repositoryUrl);

      setFiles(fileList);
    } catch (err: any) {
      console.error('Error loading files:', err);

      // Check if authentication is required for private repo
      if (err.requiresAuth && repositoryUrl && onAuthRequired) {
        console.log('🔐 Authentication required for private repo');
        onAuthRequired(repositoryUrl);
        setError('Repository privata - richiesta autenticazione');
      } else {
        setError(err.message || 'Failed to load files');
      }
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
      tsx: { icon: 'logo-react', color: '#61DAFB' },
      py: { icon: 'logo-python', color: '#3776AB' },
      html: { icon: 'logo-html5', color: '#E34F26' },
      css: { icon: 'logo-css3', color: '#1572B6' },
      json: { icon: 'code-working', color: '#F2C037' },
      md: { icon: 'document-text', color: '#FFFFFF' },
      gitignore: { icon: 'git-branch', color: '#F05032' },
    };
    return iconMap[ext || ''] || { icon: 'document-outline', color: AppColors.icon.default };
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

  const buildFileTree = useMemo((): FileTreeNode[] => {
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
  }, [files, searchQuery, searchMode, searchResults]);

  const toggleFolder = (folder: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
        <ActivityIndicator size="small" color={AppColors.white.w50} />
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
        <Text style={styles.emptyText}>Nessun file</Text>
      </View>
    );
  }

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
          activeOpacity={0.6}
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
          activeOpacity={0.7}
        >
          <Ionicons
            name={isExpanded ? 'chevron-down' : 'chevron-forward'}
            size={14}
            color={AppColors.white.w60}
            style={styles.chevron}
          />
          <Ionicons
            name={isExpanded ? 'folder-open' : 'folder'}
            size={16}
            color={isExpanded ? AppColors.primary : AppColors.white.w60}
            style={styles.folderIcon}
          />
          <Text style={styles.folderName}>{node.name}</Text>
        </TouchableOpacity>

        {isExpanded && node.children && (
          <View style={styles.childrenContainer}>
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
            <Text style={styles.searchingText}>Ricerca in corso...</Text>
          </View>
        );
      }

      if (searchResults.length === 0) {
        return (
          <View style={styles.searchResultsContainer}>
            <Ionicons name="search-outline" size={48} color={AppColors.white.w25} />
            <Text style={styles.noResultsText}>Nessun risultato trovato</Text>
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
        <View style={styles.resultsList}>
          <Text style={styles.resultsCount}>
            {searchResults.length} risultat{searchResults.length !== 1 ? 'i' : 'o'} in {Object.keys(resultsByFile).length} file
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
        </View>
      );
    }

    // Name search - show as before
    return (
      <View style={styles.resultsList}>
        {buildFileTree.map(node => renderNode(node, 0))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Compact Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          {searching ? (
            <ActivityIndicator size="small" color={AppColors.primary} style={styles.searchIcon} />
          ) : (
            <Ionicons name="search" size={14} color={AppColors.white.w40} style={styles.searchIcon} />
          )}
          <TextInput
            style={styles.searchInput}
            placeholder="Cerca..."
            placeholderTextColor={AppColors.white.w25}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <Ionicons name="close-circle" size={14} color={AppColors.white.w40} />
            </TouchableOpacity>
          )}
          {/* Search mode toggle inline */}
          <TouchableOpacity
            style={styles.searchModeToggle}
            onPress={() => setSearchMode(searchMode === 'name' ? 'content' : 'name')}
          >
            <Ionicons
              name={searchMode === 'name' ? 'document-text-outline' : 'code-outline'}
              size={14}
              color={AppColors.primary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Results or File Tree - NO INTERNAL SCROLLVIEW */}
      {searchQuery.trim() && searchMode === 'content' ? (
        renderSearchResults()
      ) : (
        <View style={styles.treeContainer}>
          {buildFileTree.map(node => renderNode(node, 0))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.white.w06,
    borderRadius: 6,
    paddingHorizontal: 8,
    height: 32,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    color: AppColors.white.w60,
    fontSize: 12,
    paddingVertical: 0,
  },
  clearButton: {
    padding: 2,
  },
  searchModeToggle: {
    padding: 4,
    marginLeft: 4,
  },
  centerContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 12,
    color: AppColors.white.w50,
  },
  emptyText: {
    fontSize: 12,
    color: AppColors.white.w40,
  },
  treeContainer: {
    paddingBottom: 20,
  },
  resultsList: {
    paddingBottom: 20,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6, // Increased for better touch target
    paddingHorizontal: 8,
  },
  fileIcon: {
    marginRight: 8,
  },
  fileName: {
    fontSize: 13,
    color: AppColors.white.w80, // Slightly brighter
    flex: 1,
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6, // Increased for better touch target
    paddingHorizontal: 8,
  },
  chevron: {
    marginRight: 4,
  },
  folderIcon: {
    marginRight: 8,
  },
  folderName: {
    fontSize: 13,
    color: AppColors.white.w80,
    fontWeight: '500',
    flex: 1,
  },
  childrenContainer: {
    overflow: 'hidden', // Important for LayoutAnimation
  },
  // VS Code style search results
  searchResultsContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchingText: {
    marginTop: 16,
    fontSize: 14,
    color: AppColors.white.w60,
  },
  noResultsText: {
    marginTop: 16,
    fontSize: 14,
    color: AppColors.white.w50,
  },
  resultsCount: {
    fontSize: 12,
    color: AppColors.white.w60,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: AppColors.primaryAlpha.a10,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.white.w04,
  },
  fileResultGroup: {
    marginBottom: 12,
  },
  fileResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: AppColors.white.w04,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.white.w04,
  },
  resultFileIcon: {
    marginRight: 8,
  },
  fileResultPath: {
    flex: 1,
    fontSize: 13,
    color: AppColors.white.w60,
    fontWeight: '500',
  },
  resultCountBadge: {
    backgroundColor: AppColors.primaryAlpha.a20,
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
    borderBottomColor: AppColors.white.w04,
  },
  lineNumber: {
    fontSize: 11,
    color: AppColors.white.w40,
    fontWeight: '600',
    width: 40,
    marginRight: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  resultContent: {
    flex: 1,
    fontSize: 12,
    color: AppColors.white.w60,
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
