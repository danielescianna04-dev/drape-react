import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Animated, Dimensions } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { useTranslation } from 'react-i18next';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { useTabStore } from '../../core/tabs/tabStore';
import { workstationService } from '../../core/workstation/workstationService-firebase';
import { AppColors } from '../../shared/theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  onClose: () => void;
  onOpenProject?: (workstation: any) => void;
}

// Helper function for language icons
const getLanguageIcon = (language: string): string => {
  const lang = (language || '').toLowerCase();
  if (lang.includes('python')) return 'logo-python';
  if (lang.includes('javascript') || lang.includes('js')) return 'logo-react'; // React icon looks better for JS in this context
  if (lang.includes('typescript') || lang.includes('ts')) return 'logo-react';
  if (lang.includes('react')) return 'logo-react';
  if (lang.includes('node')) return 'logo-nodejs';
  if (lang.includes('html')) return 'logo-html5';
  if (lang.includes('css')) return 'logo-css3';
  if (lang.includes('java')) return 'cafe-outline';
  if (lang.includes('swift')) return 'logo-apple';
  if (lang.includes('kotlin')) return 'logo-android';
  if (lang.includes('go')) return 'code-slash';
  if (lang.includes('rust')) return 'cog';
  if (lang.includes('c++') || lang.includes('cpp')) return 'code';
  if (lang.includes('c#') || lang.includes('csharp')) return 'code';
  if (lang.includes('php')) return 'server';
  if (lang.includes('ruby')) return 'diamond';
  return 'folder';
};

const getLanguageColor = (language: string): string => {
  const lang = (language || '').toLowerCase();
  if (lang.includes('python')) return '#3776AB';
  if (lang.includes('javascript') || lang.includes('js')) return '#F7DF1E';
  if (lang.includes('typescript') || lang.includes('ts')) return '#3178C6';
  if (lang.includes('react')) return '#61DAFB';
  if (lang.includes('node')) return '#339933';
  if (lang.includes('html')) return '#E34F26';
  if (lang.includes('css')) return '#1572B6';
  if (lang.includes('java')) return '#007396';
  if (lang.includes('swift')) return '#FA7343';
  if (lang.includes('kotlin')) return '#7F52FF';
  if (lang.includes('go')) return '#00ADD8';
  if (lang.includes('rust')) return '#DEA584';
  if (lang.includes('c++') || lang.includes('cpp')) return '#00599C';
  if (lang.includes('c#') || lang.includes('csharp')) return '#239120';
  if (lang.includes('php')) return '#777BB4';
  if (lang.includes('ruby')) return '#CC342D';
  return AppColors.primary;
};

export const AllProjectsScreen = ({ onClose, onOpenProject }: Props) => {
  const { t } = useTranslation(['projects', 'common']);
  const [searchQuery, setSearchQuery] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'git' | 'personal' | 'local'>('all');

  const filterOptions = [
    { id: 'all' as const, label: t('projects:all.filter.all'), icon: 'layers-outline' },
    { id: 'git' as const, label: t('projects:all.filter.git'), icon: 'logo-github' },
    { id: 'personal' as const, label: t('projects:all.filter.created'), icon: 'create-outline' },
    { id: 'local' as const, label: t('projects:all.filter.local'), icon: 'phone-portrait-outline' },
  ];

  // Skeleton animation
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  const { setWorkstation } = useTerminalStore();
  const { removeTabsByWorkstation } = useTabStore();

  useEffect(() => {
    loadProjects();

    // Shimmer animation loop
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    shimmerLoop.start();

    return () => shimmerLoop.stop();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const workstations = await workstationService.getWorkstations();
      const sorted = workstations.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setProjects(sorted);
    } catch (error) {
      console.error('Error loading projects:', error);
      Alert.alert(t('common:error'), t('projects:all.unableToLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenProject = async (ws: any) => {
    workstationService.updateLastAccessed(ws.id);
    setWorkstation(ws);
    if (onOpenProject) {
      onOpenProject(ws);
      return;
    }
    onClose();
  };

  const handleDeleteProject = async (projectId: string, skipConfirm = false) => {
    const doDelete = async () => {
      try {
        removeTabsByWorkstation(projectId);
        await workstationService.deleteWorkstation(projectId);
        loadProjects();
      } catch (error) {
        console.error('Error deleting project:', error);
        Alert.alert(t('common:error'), t('common:unableToDelete'));
      }
    };

    if (skipConfirm) {
      await doDelete();
      return;
    }

    Alert.alert(
      t('projects:actions.delete'),
      t('projects:all.deleteConfirmSingle'),
      [
        { text: t('common:cancel'), style: 'cancel' },
        { text: t('common:delete'), style: 'destructive', onPress: doDelete },
      ]
    );
  };

  const toggleSelection = (projectId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredProjects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProjects.map(p => p.id)));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;

    Alert.alert(
      t('projects:all.deleteMultiple'),
      t('projects:all.deleteMultipleConfirm', { count: selectedIds.size }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('common:delete'),
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              for (const id of selectedIds) {
                removeTabsByWorkstation(id);
                await workstationService.deleteWorkstation(id);
              }
              await loadProjects();
              exitSelectionMode();
            } catch (error) {
              console.error('Error deleting projects:', error);
              Alert.alert(t('common:error'), t('projects:actions.unableToDelete'));
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  const closeAllSwipeables = (exceptId?: string) => {
    swipeableRefs.current.forEach((ref, id) => {
      if (id !== exceptId) {
        ref?.close();
      }
    });
  };

  const renderRightActions = (projectId: string) => {
    return (
      <TouchableOpacity
        style={styles.swipeDeleteBtn}
        onPress={() => handleDeleteProject(projectId, true)}
        activeOpacity={0.8}
      >
        <Ionicons name="trash" size={20} color="#fff" />
      </TouchableOpacity>
    );
  };

  const getTimeAgo = (date: any) => {
    if (!date) return t('projects:now');
    const now = new Date();
    const then = new Date(date);
    const diff = now.getTime() - then.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 0) return t('projects:daysAgo', { count: days });
    if (hours > 0) return t('projects:hoursAgo', { count: hours });
    if (minutes > 1) return `${minutes}m`;
    return t('projects:now');
  };

  const filteredProjects = projects.filter((ws) => {
    const matchesSearch = ws.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (activeFilter === 'all') return true;
    if (activeFilter === 'git') return ws.type === 'git' || !!ws.repositoryUrl;
    if (activeFilter === 'personal') return ws.type === 'personal' || (!ws.repositoryUrl && ws.type !== 'local');
    if (activeFilter === 'local') return ws.type === 'local';
    return true;
  });

  const renderSkeletonCard = (index: number) => {
    const shimmerOpacity = shimmerAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 0.6],
    });

    return (
      <View key={`skeleton-${index}`} style={styles.projectCard}>
        <Animated.View style={[styles.skeletonIcon, { opacity: shimmerOpacity }]} />
        <View style={styles.projectInfo}>
          <Animated.View style={[styles.skeletonTitle, { opacity: shimmerOpacity }]} />
          <Animated.View style={[styles.skeletonMeta, { opacity: shimmerOpacity }]} />
        </View>
      </View>
    );
  };

  const getRepoInfo = (url?: string) => {
    if (!url) return null;
    try {
      const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (match) {
        return `${match[1]}/${match[2].replace('.git', '')}`;
      }
    } catch {}
    return null;
  };

  const renderProjectCard = (project: any) => {
    const langColor = getLanguageColor(project.language);
    const isSelected = selectedIds.has(project.id);
    const hasRepo = project.repositoryUrl || project.githubUrl;
    const repoInfo = getRepoInfo(project.repositoryUrl || project.githubUrl);

    const cardContent = (
      <View style={[styles.cardInner, isLiquidGlassSupported && { backgroundColor: 'transparent' }]}>
        <View style={styles.cardMain}>
          {selectionMode && (
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
          )}

          <View style={styles.projectIcon}>
            {hasRepo ? (
              <Ionicons name="logo-github" size={24} color="rgba(255,255,255,0.7)" />
            ) : (
              <Ionicons name={getLanguageIcon(project.language) as any} size={24} color={langColor} />
            )}
          </View>

          <View style={styles.projectInfo}>
            <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
            <View style={styles.projectMetaRow}>
              <Text style={styles.projectLang} numberOfLines={1}>{repoInfo || project.language || t('projects:project')}</Text>
              <View style={styles.metaDot} />
              <Text style={styles.projectTime}>{getTimeAgo(project.createdAt)}</Text>
            </View>
          </View>

          {!selectionMode && (
            <TouchableOpacity
              style={styles.projectMenuBtn}
              onPress={() => handleDeleteProject(project.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="ellipsis-vertical" size={16} color="rgba(255,255,255,0.25)" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );

    const wrappedCard = (
      <TouchableOpacity
        style={[styles.projectCard, isSelected && styles.projectCardSelected]}
        activeOpacity={0.7}
        onPress={() => {
          if (selectionMode) {
            toggleSelection(project.id);
          } else {
            handleOpenProject(project);
          }
        }}
        onLongPress={() => {
          if (!selectionMode) {
            setSelectionMode(true);
            setSelectedIds(new Set([project.id]));
          }
        }}
        delayLongPress={400}
      >
        {isLiquidGlassSupported ? (
          <LiquidGlassView
            style={{ backgroundColor: 'transparent', borderRadius: 16, overflow: 'hidden' }}
            interactive={true}
            effect="clear"
            colorScheme="dark"
          >
            {cardContent}
          </LiquidGlassView>
        ) : (
          cardContent
        )}
      </TouchableOpacity>
    );

    if (selectionMode) {
      return <View key={project.id}>{wrappedCard}</View>;
    }

    return (
      <Swipeable
        key={project.id}
        ref={(ref) => {
          if (ref) swipeableRefs.current.set(project.id, ref);
        }}
        renderRightActions={() => renderRightActions(project.id)}
        onSwipeableWillOpen={() => closeAllSwipeables(project.id)}
        overshootRight={false}
        friction={2}
      >
        {wrappedCard}
      </Swipeable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.7}
          onPress={selectionMode ? exitSelectionMode : onClose}
        >
          {isLiquidGlassSupported ? (
            <LiquidGlassView
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
              interactive={true}
              effect="clear"
              colorScheme="dark"
            >
              <Ionicons
                name={selectionMode ? "close" : "chevron-back"}
                size={22}
                color="#fff"
              />
            </LiquidGlassView>
          ) : (
            <Ionicons
              name={selectionMode ? "close" : "chevron-back"}
              size={24}
              color="#fff"
            />
          )}
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          {selectionMode
            ? t('projects:all.selected', { count: selectedIds.size })
            : t('projects:all.title')
          }
        </Text>

        <TouchableOpacity
          onPress={selectionMode ? selectAll : () => setSelectionMode(true)}
          activeOpacity={0.7}
          style={styles.selectHeaderBtn}
        >
          <Text style={styles.selectHeaderBtnText}>
            {selectionMode
              ? (selectedIds.size === filteredProjects.length ? t('projects:all.selectNone') : t('projects:all.selectAll'))
              : t('projects:all.edit')
            }
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchSection}>
        {isLiquidGlassSupported ? (
          <LiquidGlassView
            style={[styles.searchContainer, { backgroundColor: 'transparent', overflow: 'hidden' }]}
            interactive={true}
            effect="clear"
            colorScheme="dark"
          >
            <View style={styles.searchInner}>
              <Ionicons name="search" size={18} color="rgba(255,255,255,0.3)" />
              <TextInput
                style={styles.searchInput}
                placeholder={t('common:searchPlaceholder')}
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.3)" />
                </TouchableOpacity>
              )}
            </View>
          </LiquidGlassView>
        ) : (
          <View style={[styles.searchContainer, styles.searchInner]}>
            <Ionicons name="search" size={18} color="rgba(255,255,255,0.3)" />
            <TextInput
              style={styles.searchInput}
              placeholder={t('common:searchPlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Filters */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {filterOptions.map((opt) => {
            const isActive = activeFilter === opt.id;
            const filterContent = (
              <View style={[styles.filterTabInner, isActive && styles.filterTabActive]}>
                <Ionicons
                  name={opt.icon as any}
                  size={16}
                  color={isActive ? '#fff' : 'rgba(255,255,255,0.4)'}
                />
                <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                  {opt.label}
                </Text>
              </View>
            );

            return (
              <TouchableOpacity
                key={opt.id}
                style={styles.filterTab}
                onPress={() => setActiveFilter(opt.id)}
                activeOpacity={0.7}
              >
                {isActive && isLiquidGlassSupported ? (
                  <LiquidGlassView
                    style={{ backgroundColor: 'transparent', borderRadius: 100, overflow: 'hidden' }}
                    interactive={true}
                    effect="clear"
                    colorScheme="dark"
                  >
                    {filterContent}
                  </LiquidGlassView>
                ) : (
                  filterContent
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {loading ? (
          <View style={{ gap: 8 }}>
            {[0, 1, 2, 3, 4, 5].map(renderSkeletonCard)}
          </View>
        ) : filteredProjects.length > 0 ? (
          <View style={{ gap: 8 }}>
            {filteredProjects.map(renderProjectCard)}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={64} color="rgba(255,255,255,0.05)" />
            <Text style={styles.emptyText}>
              {searchQuery ? t('projects:all.noResults') : t('projects:all.noProjectsYet')}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery
                ? `${t('projects:all.nothingFound')} "${searchQuery}"`
                : t('projects:all.projectsWillAppear')
              }
            </Text>
          </View>
        )}

        <View style={{ height: selectionMode ? 140 : 100 }} />
      </ScrollView>

      {/* Selection Action Bar */}
      {selectionMode && selectedIds.size > 0 && (
        <View style={styles.selectionBar}>
          {isLiquidGlassSupported ? (
            <LiquidGlassView
              style={{ backgroundColor: 'transparent', borderRadius: 16, overflow: 'hidden' }}
              interactive={true}
              effect="clear"
              colorScheme="dark"
            >
              <TouchableOpacity
                style={[styles.deleteSelectedBtn, isDeleting && styles.deleteSelectedBtnDisabled]}
                onPress={handleDeleteSelected}
                disabled={isDeleting}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={20} color="#fff" />
                <Text style={styles.deleteSelectedText}>
                  {isDeleting ? t('projects:actions.deleting') : (selectedIds.size === 1 ? t('projects:all.deleteSelected', { count: selectedIds.size }) : t('projects:all.deleteSelectedPlural', { count: selectedIds.size }))}
                </Text>
              </TouchableOpacity>
            </LiquidGlassView>
          ) : (
            <TouchableOpacity
              style={[styles.deleteSelectedBtn, isDeleting && styles.deleteSelectedBtnDisabled]}
              onPress={handleDeleteSelected}
              disabled={isDeleting}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={20} color="#fff" />
              <Text style={styles.deleteSelectedText}>
                {isDeleting ? t('projects:actions.deleting') : (selectedIds.size === 1 ? t('projects:all.deleteSelected', { count: selectedIds.size }) : t('projects:all.deleteSelectedPlural', { count: selectedIds.size }))}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    width: 44,
    height: 44,
    marginLeft: -10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
  },
  selectHeaderBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  selectHeaderBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: AppColors.primary,
  },
  searchSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  searchContainer: {
    borderRadius: 100,
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 16,
    height: 48,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 100,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    fontWeight: '400',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
  },
  projectCard: {
    borderRadius: 14,
  },
  projectCardSelected: {
    backgroundColor: 'rgba(123, 107, 255, 0.12)',
    borderColor: 'rgba(123, 107, 255, 0.3)',
  },
  cardInner: {
    backgroundColor: 'rgba(20,20,22,0.5)',
    borderRadius: 14,
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  projectIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  projectMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  projectLang: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '400',
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 8,
  },
  projectTime: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.25)',
  },
  projectMenuBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    opacity: 0.8,
  },
  // Filters
  filterSection: {
    paddingBottom: 16,
  },
  filterScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterTab: {
    borderRadius: 100,
  },
  filterTabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  filterTabActive: {
    backgroundColor: 'rgba(123, 107, 255, 0.15)',
    borderColor: 'rgba(123, 107, 255, 0.3)',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.4)',
  },
  filterTabTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  skeletonIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginRight: 12,
  },
  skeletonTitle: {
    width: '60%',
    height: 14,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 8,
  },
  skeletonMeta: {
    width: '40%',
    height: 10,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
    gap: 16,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    paddingHorizontal: 50,
    lineHeight: 20,
  },
  swipeDeleteBtn: {
    backgroundColor: '#FF453A',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 16,
    marginLeft: 8,
    height: '100%',
  },
  selectionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 44,
    backgroundColor: 'transparent',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  deleteSelectedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FF453A',
    height: 54,
    borderRadius: 16,
  },
  deleteSelectedBtnDisabled: {
    opacity: 0.5,
  },
  deleteSelectedText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
});
