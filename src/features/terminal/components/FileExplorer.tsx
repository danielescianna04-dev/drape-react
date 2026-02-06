import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Platform, LayoutAnimation, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { AppColors } from '../../../shared/theme/colors';
import { workstationService } from '../../../core/workstation/workstationService-firebase';
import { useTabStore } from '../../../core/tabs/tabStore';
import { gitAccountService } from '../../../core/git/gitAccountService';
import { useWorkstationStore } from '../../../core/terminal/workstationStore';
import { useFileCacheStore } from '../../../core/cache/fileCacheStore';
import { websocketService } from '../../../core/websocket/websocketService';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { auth } from '../../../config/firebase';

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
  const { t } = useTranslation();
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
    const isMountedRef = { current: true };

    const load = async () => {
      try {
        await loadFiles(false, 0, isMountedRef);
      } catch (e) {
        if (isMountedRef.current) {
          console.warn('[FileExplorer] Load failed:', e);
        }
      }
    };

    load();

    return () => {
      isMountedRef.current = false;
    };
  }, [projectId]);

  // Subscribe to cache invalidation - auto-refresh when AI modifies files
  useEffect(() => {
    let isMounted = true;
    let prevCleared = useFileCacheStore.getState().lastClearedProject;
    const unsubscribe = useFileCacheStore.subscribe((state) => {
      if (state.lastClearedProject !== prevCleared && state.lastClearedProject === projectId) {
        if (isMounted) {
          loadFiles(true); // Force refresh
        }
      }
      prevCleared = state.lastClearedProject;
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [projectId]);

  // Debounced content search
  useEffect(() => {
    let isMounted = true;

    if (searchMode === 'content' && searchQuery.trim()) {
      const timer = setTimeout(async () => {
        try {
          if (!isMounted) return;
          setSearching(true);
          const results = await workstationService.searchInFiles(projectId, searchQuery, repositoryUrl);
          if (!isMounted) return;
          setSearchResults(results);
        } catch (err) {
          if (isMounted) {
            console.error('Search error:', err);
            setSearchResults([]);
          }
        } finally {
          if (isMounted) {
            setSearching(false);
          }
        }
      }, 500); // 500ms debounce

      return () => {
        isMounted = false;
        clearTimeout(timer);
      };
    } else {
      setSearchResults([]);
    }

    return () => { isMounted = false; };
  }, [searchQuery, searchMode, projectId, repositoryUrl]);

  const loadFiles = async (forceRefresh = false, retryCount = 0, isMountedRef?: { current: boolean }) => {
    try {
      // Backend handles VM startup automatically via getOrCreateVM()
      // No need to wait here - just call the API

      // 1. Get Cached Files (Stale allowed)
      const cachedFiles = useFileCacheStore.getState().getFilesIgnoringExpiry(projectId);
      const isCacheValid = useFileCacheStore.getState().isCacheValid(projectId);

      // 2. If we have cache (even stale) and not forcing refresh, show it immediately
      if (cachedFiles && !forceRefresh) {
        if (!isMountedRef || isMountedRef.current) {
          setFiles(cachedFiles);
          setLoading(false);
        }

        // If cache is valid, stop here. If stale, continue to fetch in background.
        if (isCacheValid) return;

      } else {
        // No cache? Show loading
        if (!isMountedRef || isMountedRef.current) {
          setLoading(true);
        }
      }

      if (!isMountedRef || isMountedRef.current) {
        setError(null);
      }

      // Get token for this repo (auto-detect provider from URL)
      let gitToken: string | null = null;
      const userId = useWorkstationStore.getState().userId || 'anonymous';
      try {
        if (repositoryUrl) {
          // Try to get token for specific repo provider
          const tokenData = await gitAccountService.getTokenForRepo(userId, repositoryUrl);
          if (tokenData) {
            gitToken = tokenData.token;
          }
        }
        // Fallback to default account if no provider-specific token
        if (!gitToken) {
          const defaultTokenData = await gitAccountService.getDefaultToken(userId);
          if (defaultTokenData) {
            gitToken = defaultTokenData.token;
          }
        }
      } catch (tokenErr) {
      }

      const fileList = await workstationService.getWorkstationFiles(projectId, repositoryUrl, gitToken || undefined);

      // Check if still mounted before updating state
      if (!isMountedRef || isMountedRef.current) {
        // Save to cache
        useFileCacheStore.getState().setFiles(projectId, fileList, repositoryUrl);
        setFiles(fileList);
      }
    } catch (err: any) {
      console.error('Error loading files:', err);

      if (!isMountedRef || isMountedRef.current) {
        // Check if authentication is required for private repo
        if (err.requiresAuth && repositoryUrl && onAuthRequired) {
          onAuthRequired(repositoryUrl);
          setError(t('terminal:fileExplorer.privateRepoAuth'));
        } else {
          // If no cache and retries left, retry after a delay (VM might still be starting)
          const cachedFiles = useFileCacheStore.getState().getFilesIgnoringExpiry(projectId);
          if (!cachedFiles && retryCount < 3) {
            setTimeout(() => loadFiles(false, retryCount + 1, isMountedRef), 2000);
            return;
          }
          setError(err.message || 'Failed to load files');
        }
      }
    } finally {
      if (!isMountedRef || isMountedRef.current) {
        setLoading(false);
      }
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

    // Separate .keep files (empty folder markers) from real files
    const allFiles = filterFiles();
    const realFiles = allFiles.filter(f => !f.endsWith('/.keep') && f !== '.keep');
    const emptyFolders = allFiles
      .filter(f => f.endsWith('/.keep'))
      .map(f => f.replace('/.keep', '')); // Get folder path

    // Process real files first
    realFiles.forEach(filePath => {
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

    // Add empty folders (from .keep files)
    emptyFolders.forEach(folderPath => {
      const parts = folderPath.split('/');
      let currentLevel = root;
      let currentPath = '';

      parts.forEach((part) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        let node = currentLevel.find(n => n.name === part);

        if (!node) {
          node = {
            name: part,
            path: currentPath,
            type: 'folder',
            children: []
          };
          currentLevel.push(node);
          folderMap.set(currentPath, node);
        }

        if (node.children) {
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
        <Text style={styles.emptyText}>{t('terminal:fileExplorer.noFiles')}</Text>
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
                userId: auth.currentUser?.uid || 'anonymous',
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
            <Text style={styles.searchingText}>{t('terminal:fileExplorer.searching')}</Text>
          </View>
        );
      }

      if (searchResults.length === 0) {
        return (
          <View style={styles.searchResultsContainer}>
            <Ionicons name="search-outline" size={48} color={AppColors.white.w25} />
            <Text style={styles.noResultsText}>{t('terminal:fileExplorer.noResultsFound')}</Text>
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
          {isLiquidGlassSupported ? (
            <LiquidGlassView
              style={{ backgroundColor: 'transparent' }}
              interactive={true}
              effect="clear"
              colorScheme="dark"
            >
              <View style={styles.resultsCountInner}>
                <Text style={styles.resultsCountText}>
                  {searchResults.length} {t('terminal:fileExplorer.resultsInFiles', { count: Object.keys(resultsByFile).length })}
                </Text>
              </View>
            </LiquidGlassView>
          ) : (
            <View style={styles.resultsCount}>
              <Text style={styles.resultsCountText}>
                {searchResults.length} {t('terminal:fileExplorer.resultsInFiles', { count: Object.keys(resultsByFile).length })}
              </Text>
            </View>
          )}

          {Object.entries(resultsByFile).map(([filePath, results]) => {
            const { icon, color } = getFileIcon(filePath);
            const fileName = filePath.split('/').pop() || filePath;

            return (
              <View key={filePath} style={styles.fileResultGroup}>
                {/* File header */}
                <View style={styles.fileResultHeader}>
                  {isLiquidGlassSupported ? (
                    <LiquidGlassView
                      style={{ backgroundColor: 'transparent' }}
                      interactive={true}
                      effect="clear"
                      colorScheme="dark"
                    >
                      <View style={styles.fileResultHeaderInner}>
                        <Ionicons name={icon as any} size={16} color={color} style={styles.resultFileIcon} />
                        <Text style={styles.fileResultPath}>{filePath}</Text>
                        <View style={styles.resultCountBadge}>
                          <Text style={styles.resultCountText}>{results.length}</Text>
                        </View>
                      </View>
                    </LiquidGlassView>
                  ) : (
                    <View style={styles.fileResultHeaderInner}>
                      <Ionicons name={icon as any} size={16} color={color} style={styles.resultFileIcon} />
                      <Text style={styles.fileResultPath}>{filePath}</Text>
                      <View style={styles.resultCountBadge}>
                        <Text style={styles.resultCountText}>{results.length}</Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* Line matches */}
                {results.map((result, index) => {
                  const itemContent = (
                    <View style={styles.resultItemInner}>
                      <Text style={styles.lineNumber}>{result.line}</Text>
                      <Text style={styles.resultContent} numberOfLines={2}>
                        {result.content}
                      </Text>
                    </View>
                  );

                  return (
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
                            userId: auth.currentUser?.uid || 'anonymous',
                            highlightLine: result.line,
                          }
                        });
                        onFileSelect(filePath);
                      }}
                      activeOpacity={0.7}
                    >
                      {isLiquidGlassSupported ? (
                        <LiquidGlassView
                          style={{ backgroundColor: 'transparent' }}
                          interactive={true}
                          effect="clear"
                          colorScheme="dark"
                        >
                          {itemContent}
                        </LiquidGlassView>
                      ) : (
                        itemContent
                      )}
                    </TouchableOpacity>
                  );
                })}
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
      {/* Compact Search Bar - Round & Glass */}
      <View style={styles.searchContainer}>
        {isLiquidGlassSupported ? (
          <LiquidGlassView
            style={styles.searchGlass}
            interactive={true}
            effect="clear"
            colorScheme="dark"
          >
            <View style={styles.searchInputWrapperRaw}>
              {searching ? (
                <ActivityIndicator size="small" color={AppColors.primary} style={styles.searchIcon} />
              ) : (
                <Ionicons name="search" size={14} color={AppColors.white.w40} style={styles.searchIcon} />
              )}
              <TextInput
                style={styles.searchInput}
                placeholder={t('terminal:fileExplorer.searchPlaceholder')}
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
          </LiquidGlassView>
        ) : (
          <View style={styles.searchInputWrapper}>
            {searching ? (
              <ActivityIndicator size="small" color={AppColors.primary} style={styles.searchIcon} />
            ) : (
              <Ionicons name="search" size={14} color={AppColors.white.w40} style={styles.searchIcon} />
            )}
            <TextInput
              style={styles.searchInput}
              placeholder={t('terminal:fileExplorer.searchPlaceholder')}
              placeholderTextColor={AppColors.white.w25}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                style={styles.clearButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={14} color={AppColors.white.w40} />
              </TouchableOpacity>
            )}
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
        )}
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
    paddingVertical: 10,
  },
  searchGlass: {
    borderRadius: 16,
    overflow: 'hidden',
    height: 32,
  },
  searchInputWrapperRaw: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.white.w06,
    borderRadius: 16,
    paddingHorizontal: 12,
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
    padding: 8,
  },
  searchModeToggle: {
    padding: 10,
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
    paddingVertical: 12,
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
    paddingVertical: 12,
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
    backgroundColor: AppColors.primaryAlpha.a10,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.white.w04,
  },
  resultsCountInner: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.05)',
  },
  resultsCountText: {
    fontSize: 12,
    color: AppColors.white.w60,
  },
  fileResultGroup: {
    marginBottom: 12,
  },
  fileResultHeader: {
    borderBottomWidth: 1,
    borderBottomColor: AppColors.white.w04,
  },
  fileResultHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
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
    borderBottomWidth: 1,
    borderBottomColor: AppColors.white.w04,
  },
  resultItemInner: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'transparent',
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
