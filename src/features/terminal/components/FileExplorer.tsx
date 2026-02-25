import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Platform, LayoutAnimation, UIManager, Alert, Keyboard, Dimensions, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { AppColors } from '../../../shared/theme/colors';
import { workstationService } from '../../../core/workstation/workstationService-firebase';
import { useTabStore } from '../../../core/tabs/tabStore';
import { gitAccountService } from '../../../core/git/gitAccountService';
import { useWorkstationStore } from '../../../core/terminal/workstationStore';
import { useFileCacheStore } from '../../../core/cache/fileCacheStore';
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
  onDragStateChange?: (isDragging: boolean) => void;
}

export const FileExplorer = ({ projectId, repositoryUrl, onFileSelect, onAuthRequired, onDragStateChange }: Props) => {
  const { t } = useTranslation();
  const cachedFiles = useFileCacheStore.getState().getFilesIgnoringExpiry(projectId);
  const [files, setFiles] = useState<string[]>(cachedFiles || []);
  const [loading, setLoading] = useState(!cachedFiles);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [lastExpandedFolder, setLastExpandedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'name' | 'content'>('content');
  const [searchResults, setSearchResults] = useState<{ file: string; line: number; content: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [creating, setCreating] = useState<'file' | 'folder' | null>(null);
  const [newName, setNewName] = useState('');
  const [creatingInFolder, setCreatingInFolder] = useState<string | null>(null);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<TextInput>(null);
  const newNameInputRef = useRef<TextInput>(null);
  const { addTab } = useTabStore();

  // Drag & drop state
  const [draggedFile, setDraggedFile] = useState<string | null>(null);
  const [draggedFileName, setDraggedFileName] = useState('');
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dropTargetRef = useRef<string | null>(null); // ref mirror to avoid stale closure
  const dragOverlayY = useSharedValue(0);
  const dragOpacity = useSharedValue(0);
  const containerRef = useRef<View>(null);
  const containerPageY = useRef(0);
  const folderRefs = useRef<Map<string, View>>(new Map());
  const folderLayouts = useRef<Map<string, { pageY: number; height: number }>>(new Map());
  const draggedFileRef = useRef<string | null>(null);
  const itemRefs = useRef<Map<string, View>>(new Map());
  const itemLayoutsList = useRef<{ path: string; parentPath: string; pageY: number; height: number }[]>([]);
  const [insertLineY, setInsertLineY] = useState<number | null>(null);
  const insertInfoRef = useRef<{ parentPath: string; insertBeforePath: string | null } | null>(null);
  const [customOrder, setCustomOrder] = useState<Map<string, string[]>>(new Map());

  // Context menu popover state
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number;
    type: 'file' | 'folder';
    path: string; name: string;
  } | null>(null);

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
    return () => { isMountedRef.current = false; };
  }, [projectId]);

  // Subscribe to cache invalidation
  useEffect(() => {
    let isMounted = true;
    let prevCleared = useFileCacheStore.getState().lastClearedProject;
    const unsubscribe = useFileCacheStore.subscribe((state) => {
      if (state.lastClearedProject !== prevCleared && state.lastClearedProject === projectId) {
        if (isMounted) loadFiles(true);
      }
      prevCleared = state.lastClearedProject;
    });
    return () => { isMounted = false; unsubscribe(); };
  }, [projectId]);

  // Debounced content search
  useEffect(() => {
    let isMounted = true;
    if (searchMode === 'content' && searchQuery.trim()) {
      setSearchError(null);
      const timer = setTimeout(async () => {
        try {
          if (!isMounted) return;
          setSearching(true);
          const results = await workstationService.searchInFiles(projectId, searchQuery, repositoryUrl);
          if (!isMounted) return;
          setSearchResults(results);
          setSearchError(null);
        } catch (err: any) {
          if (isMounted) {
            console.error('Search error:', err);
            setSearchResults([]);
            setSearchError(err.message || 'Errore nella ricerca');
          }
        } finally {
          if (isMounted) setSearching(false);
        }
      }, 500);
      return () => { isMounted = false; clearTimeout(timer); };
    } else {
      setSearchResults([]);
      setSearchError(null);
    }
    return () => { isMounted = false; };
  }, [searchQuery, searchMode, projectId, repositoryUrl]);

  const loadFiles = async (forceRefresh = false, retryCount = 0, isMountedRef?: { current: boolean }) => {
    try {
      const cachedFiles = useFileCacheStore.getState().getFilesIgnoringExpiry(projectId);
      const isCacheValid = useFileCacheStore.getState().isCacheValid(projectId);

      if (cachedFiles && !forceRefresh) {
        if (!isMountedRef || isMountedRef.current) { setFiles(cachedFiles); setLoading(false); }
        if (isCacheValid) return;
      } else {
        if (!isMountedRef || isMountedRef.current) setLoading(true);
      }

      if (!isMountedRef || isMountedRef.current) setError(null);

      let gitToken: string | null = null;
      const userId = useWorkstationStore.getState().userId || 'anonymous';
      try {
        if (repositoryUrl) {
          const tokenData = await gitAccountService.getTokenForRepo(userId, repositoryUrl);
          if (tokenData) gitToken = tokenData.token;
        }
        if (!gitToken) {
          const defaultTokenData = await gitAccountService.getDefaultToken(userId);
          if (defaultTokenData) gitToken = defaultTokenData.token;
        }
      } catch (tokenErr) {}

      const fileList = await workstationService.getWorkstationFiles(projectId, repositoryUrl, gitToken || undefined);
      if (!isMountedRef || isMountedRef.current) {
        useFileCacheStore.getState().setFiles(projectId, fileList, repositoryUrl);
        setFiles(fileList);
      }
    } catch (err: any) {
      console.error('Error loading files:', err);
      if (!isMountedRef || isMountedRef.current) {
        if (err.requiresAuth && repositoryUrl && onAuthRequired) {
          onAuthRequired(repositoryUrl);
          setError(t('terminal:fileExplorer.privateRepoAuth'));
        } else {
          const cachedFiles = useFileCacheStore.getState().getFilesIgnoringExpiry(projectId);
          if (!cachedFiles && retryCount < 3) {
            setTimeout(() => loadFiles(false, retryCount + 1, isMountedRef), 2000);
            return;
          }
          setError(err.message || 'Failed to load files');
        }
      }
    } finally {
      if (!isMountedRef || isMountedRef.current) setLoading(false);
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
    if (!searchQuery.trim()) return files;
    const query = searchQuery.toLowerCase().trim();
    if (searchMode === 'name') {
      return files.filter(filePath => {
        const fileName = filePath.split('/').pop() || '';
        return fileName.toLowerCase().includes(query);
      });
    }
    if (searchMode === 'content' && searchResults.length > 0) {
      return Array.from(new Set(searchResults.map(r => r.file)));
    }
    return [];
  };

  const buildFileTree = useMemo((): FileTreeNode[] => {
    const root: FileTreeNode[] = [];
    const folderMap = new Map<string, FileTreeNode>();
    const allFiles = filterFiles();
    const realFiles = allFiles.filter(f => !f.endsWith('/.keep') && f !== '.keep');
    const emptyFolders = allFiles.filter(f => f.endsWith('/.keep')).map(f => f.replace('/.keep', ''));

    realFiles.forEach(filePath => {
      const parts = filePath.split('/');
      let currentLevel = root;
      let currentPath = '';
      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isFile = index === parts.length - 1;
        let node = currentLevel.find(n => n.name === part);
        if (!node) {
          node = { name: part, path: currentPath, type: isFile ? 'file' : 'folder', children: isFile ? undefined : [] };
          currentLevel.push(node);
          if (!isFile) folderMap.set(currentPath, node);
        }
        if (!isFile && node.children) currentLevel = node.children;
      });
    });

    emptyFolders.forEach(folderPath => {
      const parts = folderPath.split('/');
      let currentLevel = root;
      let currentPath = '';
      parts.forEach((part) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        let node = currentLevel.find(n => n.name === part);
        if (!node) {
          node = { name: part, path: currentPath, type: 'folder', children: [] };
          currentLevel.push(node);
          folderMap.set(currentPath, node);
        }
        if (node.children) currentLevel = node.children;
      });
    });

    const sortNodes = (nodes: FileTreeNode[], parentPath: string = ''): FileTreeNode[] => {
      const order = customOrder.get(parentPath);
      return [...nodes].sort((a, b) => {
        if (order) {
          const aIdx = order.indexOf(a.name);
          const bIdx = order.indexOf(b.name);
          if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
          if (aIdx !== -1) return -1;
          if (bIdx !== -1) return 1;
        }
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'folder' ? -1 : 1;
      }).map(node => {
        if (node.children) node.children = sortNodes(node.children, node.path);
        return node;
      });
    };
    return sortNodes(root);
  }, [files, searchQuery, searchMode, searchResults, customOrder]);

  const toggleFolder = (folder: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folder)) {
      newExpanded.delete(folder);
      // Se chiudo la cartella attiva, torno al parent o null
      if (lastExpandedFolder === folder) {
        const parent = folder.includes('/') ? folder.substring(0, folder.lastIndexOf('/')) : null;
        setLastExpandedFolder(newExpanded.has(parent || '') ? parent : null);
      }
    } else {
      newExpanded.add(folder);
      setLastExpandedFolder(folder);
    }
    setExpandedFolders(newExpanded);
  };

  const startCreate = (type: 'file' | 'folder', parentFolder?: string) => {
    setCreating(type);
    setNewName('');
    setCreatingInFolder(parentFolder || null);
    if (parentFolder) {
      const newExpanded = new Set(expandedFolders);
      newExpanded.add(parentFolder);
      setExpandedFolders(newExpanded);
    }
    setTimeout(() => newNameInputRef.current?.focus(), 100);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || !creating) { setCreating(null); return; }
    const fullPath = creatingInFolder ? `${creatingInFolder}/${name}` : name;
    const isFolder = creating === 'folder';
    try {
      if (isFolder) await workstationService.createFolder(projectId, fullPath);
      else await workstationService.saveFileContent(projectId, fullPath, '', repositoryUrl);
      // Optimistic: immediately add file to local state so it appears instantly
      setFiles(prev => {
        const entry = isFolder ? `${fullPath}/.keep` : fullPath;
        return prev.includes(entry) ? prev : [...prev, entry];
      });
      useFileCacheStore.getState().clearCache(projectId);
    } catch (err: any) {
      Alert.alert('Errore', err.message || 'Creazione fallita');
    } finally {
      setCreating(null); setNewName(''); setCreatingInFolder(null); Keyboard.dismiss();
    }
  };

  // --- File operations ---
  const handleDeleteFile = async (filePath: string) => {
    const fileName = filePath.split('/').pop() || filePath;
    Alert.alert('Elimina', `Sei sicuro di voler eliminare "${fileName}"?`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina', style: 'destructive',
        onPress: async () => {
          try {
            await workstationService.deleteFile(projectId, filePath);
            // Optimistic: rimuovi subito dal local state
            setFiles(prev => prev.filter(f => f !== filePath && !f.startsWith(filePath + '/')));
            useFileCacheStore.getState().clearCache(projectId);
          } catch (err: any) { Alert.alert('Errore', err.message || 'Eliminazione fallita'); }
        }
      },
    ]);
  };

  const handleRenameFile = async () => {
    if (!renamingFile || !renameValue.trim()) { setRenamingFile(null); setRenameValue(''); return; }
    const parentDir = renamingFile.includes('/') ? renamingFile.substring(0, renamingFile.lastIndexOf('/')) : '';
    const newPath = parentDir ? `${parentDir}/${renameValue.trim()}` : renameValue.trim();
    if (newPath === renamingFile) { setRenamingFile(null); setRenameValue(''); return; }
    try {
      await workstationService.moveFile(projectId, renamingFile, newPath);
      // Optimistic: aggiorna path subito nel local state
      setFiles(prev => prev.map(f => f === renamingFile ? newPath : f.startsWith(renamingFile + '/') ? f.replace(renamingFile, newPath) : f));
      useFileCacheStore.getState().clearCache(projectId);
    } catch (err: any) { Alert.alert('Errore', err.message || 'Rinomina fallita'); }
    finally { setRenamingFile(null); setRenameValue(''); Keyboard.dismiss(); }
  };

  const startRename = (path: string, name: string) => {
    setRenamingFile(path);
    setRenameValue(name);
    setTimeout(() => renameInputRef.current?.focus(), 100);
  };

  // --- Context menus (popover near button) ---
  const showContextMenuAt = (ref: View | null, type: 'file' | 'folder', path: string, name: string) => {
    if (!ref) return;
    ref.measureInWindow((x, y, w, h) => {
      setContextMenu({ x: x + w, y: y + h, type, path, name });
    });
  };

  const handleContextMenuAction = (action: string) => {
    if (!contextMenu) return;
    const { type, path, name } = contextMenu;
    setContextMenu(null);
    switch (action) {
      case 'rename': startRename(path, name); break;
      case 'delete': handleDeleteFile(path); break;
      case 'newFile': startCreate('file', path); break;
      case 'newFolder': startCreate('folder', path); break;
    }
  };

  // --- Drag & drop ---
  const registerFolderRef = useCallback((path: string, ref: View | null) => {
    if (ref) folderRefs.current.set(path, ref);
    else folderRefs.current.delete(path);
  }, []);

  const registerItemRef = useCallback((path: string, ref: View | null) => {
    if (ref) itemRefs.current.set(path, ref);
    else itemRefs.current.delete(path);
  }, []);

  const handleDragStart = useCallback((filePath: string, fileName: string, pageY: number) => {
    setDraggedFile(filePath);
    setDraggedFileName(fileName);
    draggedFileRef.current = filePath;
    dragOpacity.value = withTiming(1, { duration: 100 });
    onDragStateChange?.(true);

    // Measure container position
    containerRef.current?.measureInWindow((x, y) => {
      containerPageY.current = y;
      dragOverlayY.value = pageY - y - 16;
    });

    // Measure all visible folder positions for drop detection
    folderLayouts.current.clear();
    folderRefs.current.forEach((ref, path) => {
      ref.measureInWindow((x, y, w, h) => {
        if (h > 0) folderLayouts.current.set(path, { pageY: y, height: h });
      });
    });

    // Measure ALL item positions for insertion line detection
    itemLayoutsList.current = [];
    itemRefs.current.forEach((ref, itemPath) => {
      ref.measureInWindow((x, y, w, h) => {
        if (h > 0) {
          const parentPath = itemPath.includes('/') ? itemPath.substring(0, itemPath.lastIndexOf('/')) : '';
          itemLayoutsList.current.push({ path: itemPath, parentPath, pageY: y, height: h });
          itemLayoutsList.current.sort((a, b) => a.pageY - b.pageY);
        }
      });
    });
  }, [onDragStateChange]);

  const updateDropTarget = useCallback((pageY: number) => {
    const dragged = draggedFileRef.current;

    // 1. Check folder drop targets
    let foundFolder: string | null = null;
    let smallestHeight = Infinity;
    folderLayouts.current.forEach((layout, path) => {
      if (pageY >= layout.pageY && pageY <= layout.pageY + layout.height) {
        if (layout.height < smallestHeight) {
          smallestHeight = layout.height;
          foundFolder = path;
        }
      }
    });
    if (dragged && foundFolder) {
      const parentDir = dragged.includes('/') ? dragged.substring(0, dragged.lastIndexOf('/')) : '';
      if (foundFolder === parentDir) foundFolder = null;
    }

    if (foundFolder) {
      setDropTarget(foundFolder);
      dropTargetRef.current = foundFolder;
      setInsertLineY(null);
      insertInfoRef.current = null;
      return;
    }

    // 2. Not over a folder — detect insertion line between items
    setDropTarget(null);
    dropTargetRef.current = null;

    const layouts = itemLayoutsList.current;
    if (layouts.length === 0) {
      setInsertLineY(null);
      insertInfoRef.current = null;
      return;
    }

    let insertY: number | null = null;
    let insertBefore: string | null = null;
    let insertParent = '';

    // Above the first item
    if (pageY < layouts[0].pageY + layouts[0].height / 2) {
      insertY = layouts[0].pageY - containerPageY.current;
      insertBefore = layouts[0].path;
      insertParent = layouts[0].parentPath;
    } else {
      // Between items
      for (let i = 0; i < layouts.length - 1; i++) {
        const currMid = layouts[i].pageY + layouts[i].height / 2;
        const nextMid = layouts[i + 1].pageY + layouts[i + 1].height / 2;
        if (pageY >= currMid && pageY < nextMid) {
          insertY = layouts[i].pageY + layouts[i].height - containerPageY.current;
          insertBefore = layouts[i + 1].path;
          insertParent = layouts[i + 1].parentPath;
          break;
        }
      }
      // Below the last item
      if (insertY === null) {
        const last = layouts[layouts.length - 1];
        if (pageY >= last.pageY + last.height / 2) {
          insertY = last.pageY + last.height - containerPageY.current;
          insertBefore = null;
          insertParent = last.parentPath;
        }
      }
    }

    // Don't show insertion at the dragged file's own position (no-op)
    if (dragged && insertY !== null) {
      const dragParent = dragged.includes('/') ? dragged.substring(0, dragged.lastIndexOf('/')) : '';
      if (insertParent === dragParent) {
        const dragIdx = layouts.findIndex(l => l.path === dragged);
        const insertIdx = insertBefore ? layouts.findIndex(l => l.path === insertBefore) : layouts.length;
        if (insertIdx === dragIdx || insertIdx === dragIdx + 1) {
          setInsertLineY(null);
          insertInfoRef.current = null;
          return;
        }
      }
    }

    setInsertLineY(insertY);
    insertInfoRef.current = insertY !== null ? { parentPath: insertParent, insertBeforePath: insertBefore } : null;
  }, []);

  const executeDrop = useCallback(() => {
    const filePath = draggedFileRef.current;
    const folderTarget = dropTargetRef.current;
    const insertInfo = insertInfoRef.current;
    cancelDrag();
    if (!filePath) return;

    const dragName = filePath.split('/').pop() || '';
    const dragParent = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';

    // Helper: optimistic update — replace old path with new in local files state + clean customOrder
    const optimisticMove = (oldPath: string, newPath: string) => {
      setFiles(prev => prev.map(f => f === oldPath ? newPath : f));
      setCustomOrder(prev => {
        const order = prev.get(dragParent);
        if (!order) return prev;
        const m = new Map(prev);
        m.set(dragParent, order.filter(n => n !== dragName));
        return m;
      });
    };

    // Case 1: Drop into folder
    if (folderTarget !== null) {
      const newPath = folderTarget ? `${folderTarget}/${dragName}` : dragName;
      if (newPath === filePath) return;
      optimisticMove(filePath, newPath);
      workstationService.moveFile(projectId, filePath, newPath)
        .then(() => useFileCacheStore.getState().clearCache(projectId))
        .catch((err: any) => {
          // Revert optimistic update
          setFiles(prev => prev.map(f => f === newPath ? filePath : f));
          Alert.alert('Errore', err.message || 'Spostamento fallito');
        });
      return;
    }

    // Case 2: Reorder (insertion between items)
    if (insertInfo) {
      if (insertInfo.parentPath !== dragParent) {
        // Cross-directory move via backend
        const newPath = insertInfo.parentPath ? `${insertInfo.parentPath}/${dragName}` : dragName;
        if (newPath !== filePath) {
          optimisticMove(filePath, newPath);
          workstationService.moveFile(projectId, filePath, newPath)
            .then(() => useFileCacheStore.getState().clearCache(projectId))
            .catch((err: any) => {
              setFiles(prev => prev.map(f => f === newPath ? filePath : f));
              Alert.alert('Errore', err.message || 'Spostamento fallito');
            });
        }
        return;
      }

      // Same directory — visual reorder
      const findChildren = (nodes: FileTreeNode[], targetParent: string): FileTreeNode[] => {
        if (targetParent === '') return nodes;
        for (const node of nodes) {
          if (node.path === targetParent && node.children) return node.children;
          if (node.children) {
            const found = findChildren(node.children, targetParent);
            if (found.length > 0) return found;
          }
        }
        return [];
      };

      const siblings = findChildren(buildFileTree, dragParent);
      const names = siblings.map(s => s.name);
      const filtered = names.filter(n => n !== dragName);

      if (insertInfo.insertBeforePath) {
        const beforeName = insertInfo.insertBeforePath.split('/').pop() || '';
        const idx = filtered.indexOf(beforeName);
        if (idx !== -1) filtered.splice(idx, 0, dragName);
        else filtered.push(dragName);
      } else {
        filtered.push(dragName);
      }

      setCustomOrder(prev => {
        const m = new Map(prev);
        m.set(dragParent, filtered);
        return m;
      });
    }
  }, [projectId, buildFileTree]);

  const cancelDrag = useCallback(() => {
    setDraggedFile(null);
    setDraggedFileName('');
    setDropTarget(null);
    dropTargetRef.current = null;
    draggedFileRef.current = null;
    setInsertLineY(null);
    insertInfoRef.current = null;
    dragOpacity.value = withTiming(0, { duration: 100 });
    onDragStateChange?.(false);
  }, [onDragStateChange]);

  const handleResponderMove = useCallback((e: any) => {
    const pageY = e.nativeEvent.pageY;
    dragOverlayY.value = pageY - containerPageY.current - 16;
    updateDropTarget(pageY);
  }, [updateDropTarget]);

  const handleResponderRelease = useCallback(() => {
    executeDrop();
  }, [executeDrop]);

  const dragOverlayStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragOverlayY.value }],
    opacity: dragOpacity.value,
  }));

  // --- Rendering ---
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
      const isRenaming = renamingFile === node.path;
      const isBeingDragged = draggedFile === node.path;

      if (isRenaming) {
        return (
          <View key={node.path} style={[styles.fileItem, { paddingLeft: 20 + depth * 16 }]}>
            <Ionicons name={icon as any} size={16} color={color} style={styles.fileIcon} />
            <TextInput
              ref={renameInputRef}
              style={styles.renameInput}
              value={renameValue}
              onChangeText={setRenameValue}
              onSubmitEditing={handleRenameFile}
              onBlur={() => { setRenamingFile(null); setRenameValue(''); }}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="done"
              selectTextOnFocus
            />
          </View>
        );
      }

      return (
        <View key={node.path} ref={(ref) => registerItemRef(node.path, ref)} style={[styles.fileItem, { paddingLeft: 20 + depth * 16 }, isBeingDragged && { opacity: 0.3 }]}>
          <TouchableOpacity
            style={styles.fileRowTappable}
            onPress={() => {
              const tabId = `file-${projectId}-${node.path}`;
              addTab({
                id: tabId,
                type: 'file',
                title: node.name,
                data: { filePath: node.path, projectId, repositoryUrl, userId: auth.currentUser?.uid || 'anonymous' }
              });
              onFileSelect(node.path);
            }}
            onLongPress={(e) => {
              const pageY = e.nativeEvent.pageY;
              handleDragStart(node.path, node.name, pageY);
            }}
            delayLongPress={250}
            activeOpacity={0.6}
          >
            <Ionicons name={icon as any} size={16} color={color} style={styles.fileIcon} />
            <Text style={styles.fileName} numberOfLines={1}>{node.name}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ellipsisButton}
            onPress={(e) => {
              const py = e.nativeEvent.pageY;
              setContextMenu({ x: 0, y: py, type: 'file', path: node.path, name: node.name });
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="ellipsis-vertical" size={16} color={AppColors.white.w50} />
          </TouchableOpacity>
        </View>
      );
    }

    // Folder
    const isExpanded = expandedFolders.has(node.path);
    const isDropHere = dropTarget === node.path;
    const isRenaming = renamingFile === node.path;

    if (isRenaming) {
      return (
        <View key={node.path}>
          <View style={[styles.folderItem, { paddingLeft: 8 + depth * 16 }]}>
            <Ionicons name="chevron-forward" size={14} color={AppColors.white.w60} style={styles.chevron} />
            <Ionicons name="folder" size={16} color={AppColors.white.w60} style={styles.folderIcon} />
            <TextInput
              ref={renameInputRef}
              style={styles.renameInput}
              value={renameValue}
              onChangeText={setRenameValue}
              onSubmitEditing={handleRenameFile}
              onBlur={() => { setRenamingFile(null); setRenameValue(''); }}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="done"
              selectTextOnFocus
            />
          </View>
        </View>
      );
    }

    return (
      <View key={node.path} ref={(ref) => { registerFolderRef(node.path, ref); registerItemRef(node.path, ref); }}>
        <View style={[styles.folderItem, { paddingLeft: 8 + depth * 16 }, isDropHere && styles.folderDropTarget]}>
          <TouchableOpacity
            style={styles.folderRowTappable}
            onPress={() => toggleFolder(node.path)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isExpanded ? 'chevron-down' : 'chevron-forward'}
              size={14}
              color={isDropHere ? AppColors.primary : AppColors.white.w60}
              style={styles.chevron}
            />
            <Ionicons
              name={isExpanded ? 'folder-open' : 'folder'}
              size={16}
              color={isDropHere ? AppColors.primary : (isExpanded ? AppColors.primary : AppColors.white.w60)}
              style={styles.folderIcon}
            />
            <Text style={[styles.folderName, isDropHere && { color: AppColors.primary }]}>{node.name}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ellipsisButton}
            onPress={(e) => {
              const py = e.nativeEvent.pageY;
              setContextMenu({ x: 0, y: py, type: 'folder', path: node.path, name: node.name });
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="ellipsis-vertical" size={16} color={AppColors.white.w50} />
          </TouchableOpacity>
        </View>

        {isExpanded && node.children && (
          <View style={styles.childrenContainer}>
            {creating && creatingInFolder === node.path && renderCreateInput(depth + 1)}
            {node.children.map(child => renderNode(child, depth + 1))}
          </View>
        )}
      </View>
    );
  };

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

      if (searchError) {
        return (
          <View style={styles.searchResultsContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={AppColors.white.w25} />
            <Text style={styles.noResultsText}>Errore nella ricerca</Text>
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

      const resultsByFile = searchResults.reduce((acc, result) => {
        if (!acc[result.file]) acc[result.file] = [];
        acc[result.file].push(result);
        return acc;
      }, {} as Record<string, typeof searchResults>);

      return (
        <View style={styles.resultsList}>
          {isLiquidGlassSupported ? (
            <LiquidGlassView style={{ backgroundColor: 'transparent' }} interactive={true} effect="clear" colorScheme="dark">
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
                <View style={styles.fileResultHeader}>
                  {isLiquidGlassSupported ? (
                    <LiquidGlassView style={{ backgroundColor: 'transparent' }} interactive={true} effect="clear" colorScheme="dark">
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

                {results.map((result, index) => {
                  const itemContent = (
                    <View style={styles.resultItemInner}>
                      <Text style={styles.lineNumber}>{result.line}</Text>
                      <Text style={styles.resultContent} numberOfLines={2}>{result.content}</Text>
                    </View>
                  );

                  return (
                    <TouchableOpacity
                      key={`${filePath}-${result.line}-${index}`}
                      style={styles.resultItem}
                      onPress={() => {
                        const tabId = `file-${projectId}-${filePath}`;
                        addTab({
                          id: tabId, type: 'file', title: fileName,
                          data: { filePath, projectId, repositoryUrl, userId: auth.currentUser?.uid || 'anonymous', highlightLine: result.line }
                        });
                        onFileSelect(filePath);
                      }}
                      activeOpacity={0.7}
                    >
                      {isLiquidGlassSupported ? (
                        <LiquidGlassView style={{ backgroundColor: 'transparent' }} interactive={true} effect="clear" colorScheme="dark">
                          {itemContent}
                        </LiquidGlassView>
                      ) : itemContent}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </View>
      );
    }

    return (
      <View style={styles.resultsList}>
        {buildFileTree.map(node => renderNode(node, 0))}
      </View>
    );
  };

  const renderCreateInput = (depth: number = 0) => {
    if (!creating) return null;
    return (
      <View style={[styles.createInputRow, { paddingLeft: 20 + depth * 16 }]}>
        <Ionicons
          name={creating === 'folder' ? 'folder-outline' : 'document-outline'}
          size={16} color={AppColors.primary} style={styles.fileIcon}
        />
        <TextInput
          ref={newNameInputRef}
          style={styles.createInput}
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={handleCreate}
          onBlur={() => { setCreating(null); setNewName(''); }}
          placeholder={creating === 'folder' ? 'Nome cartella...' : 'Nome file...'}
          placeholderTextColor={AppColors.white.w25}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="done"
        />
      </View>
    );
  };

  return (
    <View
      ref={containerRef}
      style={styles.container}
      onMoveShouldSetResponderCapture={() => !!draggedFileRef.current}
      onResponderMove={handleResponderMove}
      onResponderRelease={handleResponderRelease}
      onResponderTerminate={cancelDrag}
    >
      {/* Search Bar + Create Buttons */}
      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          {isLiquidGlassSupported ? (
            <LiquidGlassView style={[styles.searchGlass, { flex: 1 }]} interactive={true} effect="clear" colorScheme="dark">
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
              </View>
            </LiquidGlassView>
          ) : (
            <View style={[styles.searchInputWrapper, { flex: 1 }]}>
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
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={14} color={AppColors.white.w40} />
                </TouchableOpacity>
              )}
            </View>
          )}

          <TouchableOpacity style={styles.createBtn} onPress={() => startCreate('file', lastExpandedFolder || undefined)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="document-outline" size={15} color={AppColors.white.w60} />
            <Ionicons name="add" size={10} color={AppColors.white.w60} style={styles.createBtnPlus} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.createBtn} onPress={() => startCreate('folder', lastExpandedFolder || undefined)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="folder-outline" size={15} color={AppColors.white.w60} />
            <Ionicons name="add" size={10} color={AppColors.white.w60} style={styles.createBtnPlus} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Results or File Tree */}
      {searchQuery.trim() ? (
        renderSearchResults()
      ) : (
        <View style={styles.treeContainer}>
          {creating && !creatingInFolder && renderCreateInput(0)}
          {buildFileTree.map(node => renderNode(node, 0))}
        </View>
      )}

      {/* Insertion Line */}
      {insertLineY !== null && (
        <View style={[styles.insertionLine, { top: insertLineY }]} pointerEvents="none" />
      )}

      {/* Drag Overlay */}
      {draggedFile && (
        <Animated.View style={[styles.dragOverlay, dragOverlayStyle]} pointerEvents="none">
          <View style={styles.dragOverlayContent}>
            <Ionicons
              name={getFileIcon(draggedFileName).icon as any}
              size={16}
              color={getFileIcon(draggedFileName).color}
            />
            <Text style={styles.dragOverlayText} numberOfLines={1}>{draggedFileName}</Text>
          </View>
        </Animated.View>
      )}

      {/* Context Menu Popover */}
      {contextMenu && (
        <Modal transparent animationType="fade" onRequestClose={() => setContextMenu(null)}>
          <TouchableOpacity
            style={styles.popoverBackdrop}
            activeOpacity={1}
            onPress={() => setContextMenu(null)}
          >
            <View style={[
              styles.popoverMenu,
              {
                top: Math.min(contextMenu.y, Dimensions.get('window').height - 220),
                right: 16,
              },
            ]}>
              <Text style={styles.popoverTitle} numberOfLines={1}>{contextMenu.name}</Text>
              {contextMenu.type === 'folder' && (
                <>
                  <TouchableOpacity style={styles.popoverItem} onPress={() => handleContextMenuAction('newFile')}>
                    <Ionicons name="document-outline" size={16} color={AppColors.white.w70} />
                    <Text style={styles.popoverItemText}>Nuovo file</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.popoverItem} onPress={() => handleContextMenuAction('newFolder')}>
                    <Ionicons name="folder-outline" size={16} color={AppColors.white.w70} />
                    <Text style={styles.popoverItemText}>Nuova cartella</Text>
                  </TouchableOpacity>
                  <View style={styles.popoverDivider} />
                </>
              )}
              <TouchableOpacity style={styles.popoverItem} onPress={() => handleContextMenuAction('rename')}>
                <Ionicons name="pencil-outline" size={16} color={AppColors.white.w70} />
                <Text style={styles.popoverItemText}>Rinomina</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.popoverItem} onPress={() => handleContextMenuAction('delete')}>
                <Ionicons name="trash-outline" size={16} color="#FF6B6B" />
                <Text style={[styles.popoverItemText, { color: '#FF6B6B' }]}>Elimina</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Context menu popover
  popoverBackdrop: {
    flex: 1,
  },
  popoverMenu: {
    position: 'absolute',
    minWidth: 180,
    backgroundColor: '#1c1c2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.white.w10,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
  },
  popoverTitle: {
    fontSize: 12,
    color: AppColors.white.w40,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  popoverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  popoverItemText: {
    fontSize: 14,
    color: AppColors.white.w80,
  },
  popoverDivider: {
    height: 1,
    backgroundColor: AppColors.white.w08,
    marginVertical: 4,
    marginHorizontal: 10,
  },
  searchContainer: {
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  createBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: AppColors.white.w06,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnPlus: {
    position: 'absolute',
    bottom: 4,
    right: 4,
  },
  createInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  createInput: {
    flex: 1,
    fontSize: 13,
    color: '#fff',
    backgroundColor: AppColors.white.w06,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: AppColors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  renameInput: {
    flex: 1,
    fontSize: 13,
    color: '#fff',
    backgroundColor: AppColors.white.w06,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: AppColors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
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
    padding: 6,
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
    paddingVertical: 6,
    paddingRight: 4,
  },
  fileRowTappable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  fileIcon: {
    marginRight: 8,
  },
  fileName: {
    fontSize: 13,
    color: AppColors.white.w80,
    flex: 1,
  },
  ellipsisButton: {
    padding: 6,
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingRight: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  folderRowTappable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  folderDropTarget: {
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderColor: AppColors.primary,
    borderStyle: 'dashed',
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
    overflow: 'hidden',
  },
  // Insertion line for reorder
  insertionLine: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 2,
    backgroundColor: AppColors.primary,
    borderRadius: 1,
    zIndex: 9998,
  },
  // Drag overlay
  dragOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  dragOverlayContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: AppColors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
  },
  dragOverlayText: {
    fontSize: 13,
    color: AppColors.white.w80,
    marginLeft: 8,
    flex: 1,
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
