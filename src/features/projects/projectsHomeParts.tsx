import React from 'react';
import { View, Animated, Text, TouchableOpacity, Image, ScrollView, RefreshControl, Pressable, ActivityIndicator, Modal, StyleSheet } from 'react-native';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../shared/theme/colors';
import { DevBanner } from '../../shared/components/DevBanner';
import { GitCommitsScreen } from '../settings/GitCommitsScreen';
import { Button } from '../../shared/components/atoms/Button';
import { Input } from '../../shared/components/atoms/Input';
import { useNavigationStore } from '../../core/navigation/navigationStore';

export const GlassWrapper = ({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) => {
  if (isLiquidGlassSupported) {
    return (
      <LiquidGlassView style={[{ borderRadius: 16, overflow: 'hidden' }, style]} interactive={true} effect="regular" colorScheme="dark">
        {children}
      </LiquidGlassView>
    );
  }
  return <View style={style}>{children}</View>;
};

export const SkeletonItem = ({
  styles,
  shimmerOpacity,
}: {
  styles: any;
  shimmerOpacity: Animated.AnimatedInterpolation<number>;
}) => (
  <View style={styles.skeletonItem}>
    <Animated.View style={[styles.skeletonIcon, { opacity: shimmerOpacity }]} />
    <View style={styles.skeletonContent}>
      <Animated.View style={[styles.skeletonTitle, { opacity: shimmerOpacity }]} />
      <Animated.View style={[styles.skeletonSubtitle, { opacity: shimmerOpacity }]} />
    </View>
  </View>
);

export const getLanguageIcon = (language: string) => {
  const lang = language?.toLowerCase() || '';
  if (lang.includes('react') || lang.includes('javascript')) return 'logo-react';
  if (lang.includes('python')) return 'logo-python';
  if (lang.includes('node')) return 'logo-nodejs';
  if (lang.includes('swift') || lang.includes('ios')) return 'logo-apple';
  if (lang.includes('android') || lang.includes('kotlin')) return 'logo-android';
  if (lang.includes('html') || lang.includes('css')) return 'logo-html5';
  return 'folder';
};

export const getLanguageColor = (language: string) => {
  const lang = language?.toLowerCase() || '';
  if (lang.includes('react')) return '#61DAFB';
  if (lang.includes('javascript')) return '#F7DF1E';
  if (lang.includes('typescript')) return '#3178C6';
  if (lang.includes('python')) return '#3776AB';
  if (lang.includes('node')) return '#68A063';
  if (lang.includes('swift')) return '#FA7343';
  if (lang.includes('kotlin')) return '#7F52FF';
  return AppColors.primary;
};

export const getRepoInfo = (url?: string) => {
  if (!url) return null;
  try {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (match) {
      return {
        owner: match[1],
        repo: match[2].replace('.git', ''),
        full: `${match[1]}/${match[2].replace('.git', '')}`,
      };
    }
  } catch {
    return null;
  }
  return null;
};

export const ProjectsHomeHeader = ({
  styles,
  userAvatar,
  userName,
  greeting,
  currentPlan,
  onSettings,
}: any) => (
  <View style={styles.header}>
    <View style={styles.headerLeft}>
      {userAvatar ? (
        <Image source={{ uri: userAvatar }} style={styles.profileImage} />
      ) : (
        <View style={styles.profilePlaceholder}>
          <Text style={styles.profileInitials}>{userName.substring(0, 1).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.welcomeTextContainer}>
        <Text style={styles.headerSubtitle}>{greeting}</Text>
        <View style={styles.nameWithBadge}>
          <Text style={styles.headerTitle} numberOfLines={1}>{userName}</Text>
          <View style={[styles.planBadge, {
            backgroundColor: currentPlan === 'free' ? AppColors.badge.background :
              currentPlan === 'go' ? AppColors.primaryAlpha.a14 :
                currentPlan === 'pro' ? AppColors.primaryAlpha.a14 : '#F472B615',
            borderWidth: 1,
            borderColor: currentPlan === 'free' ? AppColors.badge.border :
              currentPlan === 'go' ? AppColors.primaryAlpha.a22 :
                currentPlan === 'pro' ? AppColors.primaryAlpha.a22 : 'rgba(244,114,182,0.22)',
          }]}>
            <Text style={[styles.planBadgeText, {
              color: currentPlan === 'free' ? AppColors.badge.text :
                currentPlan === 'go' ? AppColors.primaryLight :
                  currentPlan === 'pro' ? AppColors.primaryLight : '#F472B6'
            }]}>
              {currentPlan.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>
    </View>

    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onSettings}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Ionicons name="settings-outline" size={24} color="#B7B3C7" />
    </TouchableOpacity>
  </View>
);

export const ProjectsQuickActions = ({
  styles,
  t,
  currentPlan,
  projectCounts,
  onOpenPlans,
  onCreateProject,
  onImportProject,
  onBrowseFiles,
  focusKey,
}: any) => (
  <View style={styles.quickActionsSection}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <Text style={styles.sectionLabel}>{t('home.getStarted')}</Text>
      {currentPlan === 'free' && (
        <TouchableOpacity
          onPress={onOpenPlans}
          activeOpacity={0.7}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: 'rgba(255,255,255,0.06)',
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
          }}
        >
          <Text style={{
            fontSize: 10, fontWeight: '600',
            color: projectCounts.created >= 1 ? '#FF6B6B' : 'rgba(255,255,255,0.4)',
          }} numberOfLines={1}>
            {projectCounts.created}/1 {t('home.counterCreated')}
          </Text>
          <View style={{ width: 1, height: 10, backgroundColor: 'rgba(255,255,255,0.1)' }} />
          <Text style={{
            fontSize: 10, fontWeight: '600',
            color: projectCounts.cloned >= 2 ? '#FF6B6B' : 'rgba(255,255,255,0.4)',
          }} numberOfLines={1}>
            {projectCounts.cloned}/2 {t('home.counterClone')}
          </Text>
          <View style={{ width: 1, height: 10, backgroundColor: 'rgba(255,255,255,0.1)' }} />
          <Text style={{
            fontSize: 10, fontWeight: '600',
            color: projectCounts.local >= 1 ? '#FF6B6B' : 'rgba(255,255,255,0.4)',
          }} numberOfLines={1}>
            {projectCounts.local}/1 {t('home.counterLocal')}
          </Text>
          {(projectCounts.created >= 1 || projectCounts.cloned >= 2 || projectCounts.local >= 1) && (
            <Ionicons name="arrow-forward" size={10} color="#FF6B6B" />
          )}
        </TouchableOpacity>
      )}
    </View>

    <View style={styles.quickActionsRow}>
      <View style={styles.actionCardWrapper}>
        {currentPlan === 'free' && projectCounts.created >= 2 ? (
          <TouchableOpacity style={styles.actionCard} activeOpacity={0.8} onPress={onOpenPlans}>
            <LinearGradient colors={['#FF6B6B', '#FF4757']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionCardGradient}>
              <Ionicons name="arrow-up-circle" size={24} color="#fff" />
              <Text style={styles.actionCardTitle}>Upgrade</Text>
              <Text style={styles.actionCardSubtitle} numberOfLines={1}>{t('home.unlockPro')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.actionCard} activeOpacity={0.8} onPress={onCreateProject}>
            <LinearGradient colors={['#5035D0', '#6A4DE8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionCardGradient}>
              <Ionicons name="add" size={24} color="#fff" />
              <Text style={styles.actionCardTitle}>{t('home.newProject')}</Text>
              <Text style={styles.actionCardSubtitle}>{t('home.createProject')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actionCardWrapper}>
        <GlassWrapper key={`import-${focusKey}`} style={[styles.actionCard, styles.actionCardGlass]}>
          <TouchableOpacity style={styles.actionCardInner} activeOpacity={0.8} onPress={onImportProject}>
            <Ionicons name="logo-github" size={24} color="#fff" />
            <Text style={styles.actionCardTitle}>{t('home.clone')}</Text>
            <Text style={styles.actionCardSubtitle}>{t('home.cloneRepo')}</Text>
          </TouchableOpacity>
        </GlassWrapper>
      </View>

      <View style={styles.actionCardWrapper}>
        <GlassWrapper key={`explore-${focusKey}`} style={[styles.actionCard, styles.actionCardGlass]}>
          <TouchableOpacity
            style={styles.actionCardInner}
            activeOpacity={0.8}
            onPress={() => useNavigationStore.getState().navigateTo('explore')}
          >
            <Ionicons name="compass" size={24} color="#A78BFA" />
            <Text style={styles.actionCardTitle}>Esplora</Text>
            <Text style={styles.actionCardSubtitle}>App pubbliche</Text>
          </TouchableOpacity>
        </GlassWrapper>
      </View>
    </View>
  </View>
);

export const ProjectsUpgradeCta = ({ styles, t, onOpenPlans, onDismiss, focusKey }: any) => (
  <GlassWrapper key={`upgrade-${focusKey}`} style={styles.upgradeCtaGlass}>
    <TouchableOpacity style={styles.upgradeCta} activeOpacity={0.9} onPress={onOpenPlans}>
      <TouchableOpacity
        style={styles.upgradeCtaClose}
        onPress={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="close" size={14} color="#8E89A1" />
      </TouchableOpacity>

      <View style={styles.upgradeCtaMain}>
        <View style={styles.upgradeCtaContent}>
          <View style={styles.upgradeCtaIconWrap}>
            <Ionicons name="rocket-outline" size={18} color={AppColors.iconColors.accent} />
          </View>
          <View style={styles.upgradeCtaText}>
            <Text style={styles.upgradeCtaTitle}>{t('home.unlockPro')}</Text>
            <Text style={styles.upgradeCtaSubtitle}>{t('home.unlockProDesc')}</Text>
          </View>
        </View>
        <View style={styles.upgradeCtaArrow}>
          <Ionicons name="chevron-forward" size={16} color="#8E89A1" />
        </View>
      </View>
    </TouchableOpacity>
  </GlassWrapper>
);

export const RecentProjectsSection = ({
  styles,
  t,
  loading,
  recentProjects,
  shimmerOpacity,
  focusKey,
  onMyProjects,
  onProjectOpen,
  onOpenMenu,
  getTimeAgo,
}: any) => (
  <View style={styles.projectsSection}>
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Ionicons name="time-outline" size={16} color={AppColors.text.tertiary} />
        <Text style={styles.sectionLabel}>{t('home.recent')}</Text>
      </View>
    </View>

    {loading ? (
      <>
        <SkeletonItem styles={styles} shimmerOpacity={shimmerOpacity} />
        <SkeletonItem styles={styles} shimmerOpacity={shimmerOpacity} />
        <SkeletonItem styles={styles} shimmerOpacity={shimmerOpacity} />
      </>
    ) : recentProjects.length > 0 ? (
      <>
        {recentProjects.map((project: any) => {
          const repoInfo = getRepoInfo(project.repositoryUrl || project.githubUrl);
          return (
            <GlassWrapper key={`${project.id}-${focusKey}`} style={styles.projectCardGlass}>
              <TouchableOpacity
                style={styles.projectCard}
                activeOpacity={0.7}
                onPress={() => onProjectOpen(project)}
                onLongPress={() => onOpenMenu(project)}
                delayLongPress={400}
              >
                <View style={styles.projectIcon}>
                  {repoInfo ? (
                    <Ionicons name="logo-github" size={22} color={AppColors.iconColors.primary} />
                  ) : project.type === 'local' ? (
                    <Ionicons name="document-outline" size={22} color="rgba(255,255,255,0.7)" />
                  ) : (
                    <Ionicons name="folder-outline" size={22} color={AppColors.primary} />
                  )}
                </View>
                <View style={styles.projectInfo}>
                  <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
                  <View style={styles.projectMetaRow}>
                    {repoInfo ? (
                      <Text style={styles.projectRepoText} numberOfLines={1}>{repoInfo.full}</Text>
                    ) : (
                      <Text style={styles.projectLang}>{project.language || t('project')}</Text>
                    )}
                    <View style={styles.metaDot} />
                    <Text style={styles.projectTime}>{getTimeAgo(project.lastOpened || project.createdAt)}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#6F6A82" />
              </TouchableOpacity>
            </GlassWrapper>
          );
        })}
        <GlassWrapper key={`seeall-${focusKey}`} style={{ borderRadius: 100, overflow: 'hidden', alignSelf: 'center', marginTop: 32 }}>
          <TouchableOpacity
            style={[styles.seeAllButton, { marginTop: 0, backgroundColor: 'rgba(22, 18, 35, 0.7)' }]}
            activeOpacity={0.7}
            onPress={onMyProjects}
          >
            <Text style={styles.seeAllButtonText}>{t('seeAll')}</Text>
            <Ionicons name="chevron-forward" size={14} color="#B7B3C7" />
          </TouchableOpacity>
        </GlassWrapper>
      </>
    ) : (
      <View style={styles.emptyState}>
        <Ionicons name="folder-open-outline" size={48} color="rgba(255,255,255,0.08)" />
        <Text style={styles.emptyTitle}>{t('home.noProjects')}</Text>
        <Text style={styles.emptySubtitle}>{t('home.createFirstProject')}</Text>
      </View>
    )}
  </View>
);

const ProjectSheetBody = ({
  styles,
  t,
  selectedProject,
  repoVisibility,
  onCopyRepository,
  onOpenProject,
  onOpenCommits,
  onDuplicateProject,
  isDuplicating,
  onShareProject,
  onOpenRename,
  onDeleteProject,
  onCancel,
  useLiquid,
}: any) => (
  <>
    <View style={styles.sheetHandle}>
      <View style={styles.sheetHandleBar} />
    </View>

    {selectedProject && (
      <>
        <View style={styles.sheetHeader}>
          <View style={[styles.sheetProjectIcon, { backgroundColor: `${getLanguageColor(selectedProject.language)}15` }]}>
            <Ionicons
              name={getLanguageIcon(selectedProject.language) as any}
              size={20}
              color={getLanguageColor(selectedProject.language)}
            />
          </View>
          <View style={styles.sheetProjectInfo}>
            <Text style={styles.sheetProjectName} numberOfLines={1}>{selectedProject.name}</Text>
            <Text style={styles.sheetProjectMeta}>{selectedProject.language || t('project')}</Text>
          </View>
        </View>

        {(selectedProject.repositoryUrl || selectedProject.githubUrl) && (
          <View style={styles.repoInfoSection}>
            <View style={styles.repoInfoRow}>
              <Ionicons name="logo-github" size={16} color="rgba(255,255,255,0.5)" />
              <Text style={styles.repoUrlText} numberOfLines={1}>
                {getRepoInfo(selectedProject.repositoryUrl || selectedProject.githubUrl)?.full || t('common:repository')}
              </Text>
              <TouchableOpacity onPress={onCopyRepository} style={styles.copyButton}>
                <Ionicons name="copy-outline" size={14} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            </View>
            <View style={styles.repoVisibilityRow}>
              {repoVisibility === 'loading' ? (
                <ActivityIndicator size="small" color={AppColors.primary} />
              ) : repoVisibility === 'public' ? (
                <View style={styles.visibilityBadge}>
                  <Ionicons name="globe-outline" size={12} color="#4ade80" />
                  <Text style={[styles.visibilityText, { color: '#4ade80' }]}>{t('common:public')}</Text>
                </View>
              ) : repoVisibility === 'private' ? (
                <View style={styles.visibilityBadge}>
                  <Ionicons name="lock-closed-outline" size={12} color="#f59e0b" />
                  <Text style={[styles.visibilityText, { color: '#f59e0b' }]}>{t('common:private')}</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        <View style={styles.sheetActions}>
          <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7} onPress={onOpenProject}>
            {useLiquid ? (
              <LiquidGlassView style={styles.sheetActionIconGlass} interactive={true} effect="clear" colorScheme="dark">
                <Ionicons name="open-outline" size={20} color="#fff" />
              </LiquidGlassView>
            ) : (
              <View style={styles.sheetActionIcon}>
                <Ionicons name="open-outline" size={20} color="#fff" />
              </View>
            )}
            <Text style={styles.sheetActionText}>{t('common:open')}</Text>
          </TouchableOpacity>

          {(selectedProject.repositoryUrl || selectedProject.githubUrl) && (
            <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7} onPress={onOpenCommits}>
              {useLiquid ? (
                <LiquidGlassView style={styles.sheetActionIconGlass} interactive={true} effect="clear" colorScheme="dark">
                  <Ionicons name="git-commit-outline" size={20} color={AppColors.primary} />
                </LiquidGlassView>
              ) : (
                <View style={[styles.sheetActionIcon, { backgroundColor: `${AppColors.primary}15` }]}>
                  <Ionicons name="git-commit-outline" size={20} color={AppColors.primary} />
                </View>
              )}
              <Text style={styles.sheetActionText}>{t('common:commits')}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7} onPress={onDuplicateProject} disabled={isDuplicating}>
            {useLiquid ? (
              <LiquidGlassView style={styles.sheetActionIconGlass} interactive={true} effect="clear" colorScheme="dark">
                {isDuplicating ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="copy-outline" size={20} color="#fff" />}
              </LiquidGlassView>
            ) : (
              <View style={styles.sheetActionIcon}>
                {isDuplicating ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="copy-outline" size={20} color="#fff" />}
              </View>
            )}
            <Text style={styles.sheetActionText}>{t('actions.duplicate')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7} onPress={onShareProject}>
            {useLiquid ? (
              <LiquidGlassView style={styles.sheetActionIconGlass} interactive={true} effect="clear" colorScheme="dark">
                <Ionicons name="share-outline" size={20} color="#fff" />
              </LiquidGlassView>
            ) : (
              <View style={styles.sheetActionIcon}>
                <Ionicons name="share-outline" size={20} color="#fff" />
              </View>
            )}
            <Text style={styles.sheetActionText}>{t('actions.share')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7} onPress={onOpenRename}>
            {useLiquid ? (
              <LiquidGlassView style={styles.sheetActionIconGlass} interactive={true} effect="clear" colorScheme="dark">
                <Ionicons name="create-outline" size={20} color="#fff" />
              </LiquidGlassView>
            ) : (
              <View style={styles.sheetActionIcon}>
                <Ionicons name="create-outline" size={20} color="#fff" />
              </View>
            )}
            <Text style={styles.sheetActionText}>{t('actions.rename')}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.sheetDeleteButton} activeOpacity={0.7} onPress={onDeleteProject}>
          <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
          <Text style={styles.sheetDeleteText}>{t('actions.delete')}</Text>
        </TouchableOpacity>
      </>
    )}

    <TouchableOpacity style={styles.sheetCancelButton} activeOpacity={0.7} onPress={onCancel}>
      <Text style={styles.sheetCancelText}>{t('common:cancel')}</Text>
    </TouchableOpacity>
  </>
);

export const ProjectMenuSheet = ({
  styles,
  menuVisible,
  sheetAnim,
  focusKey,
  selectedProject,
  repoVisibility,
  t,
  onCloseMenu,
  onCopyRepository,
  onOpenProject,
  onOpenCommits,
  onDuplicateProject,
  isDuplicating,
  onShareProject,
  onOpenRename,
  onDeleteProject,
}: any) => {
  if (!menuVisible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={[StyleSheet.absoluteFill, styles.sheetBackdrop]} onPress={onCloseMenu}>
        <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
      </Pressable>
      <Animated.View style={[styles.sheetContainerBase, { transform: [{ translateY: sheetAnim }] }]}>
        {isLiquidGlassSupported ? (
          <LiquidGlassView key={`sheet-${focusKey}`} style={styles.sheetLiquidGlass} interactive={true} effect="regular" colorScheme="dark">
            <View style={styles.sheetContent}>
              <ProjectSheetBody
                styles={styles}
                t={t}
                selectedProject={selectedProject}
                repoVisibility={repoVisibility}
                onCopyRepository={onCopyRepository}
                onOpenProject={onOpenProject}
                onOpenCommits={onOpenCommits}
                onDuplicateProject={onDuplicateProject}
                isDuplicating={isDuplicating}
                onShareProject={onShareProject}
                onOpenRename={onOpenRename}
                onDeleteProject={onDeleteProject}
                onCancel={onCloseMenu}
                useLiquid
              />
            </View>
          </LiquidGlassView>
        ) : (
          <View style={styles.sheetContainer}>
            <ProjectSheetBody
              styles={styles}
              t={t}
              selectedProject={selectedProject}
              repoVisibility={repoVisibility}
              onCopyRepository={onCopyRepository}
              onOpenProject={onOpenProject}
              onOpenCommits={onOpenCommits}
              onDuplicateProject={onDuplicateProject}
              isDuplicating={isDuplicating}
              onShareProject={onShareProject}
              onOpenRename={onOpenRename}
              onDeleteProject={onDeleteProject}
              onCancel={onCloseMenu}
              useLiquid={false}
            />
          </View>
        )}
      </Animated.View>
    </View>
  );
};

export const RenameProjectModal = ({
  styles,
  visible,
  t,
  newProjectName,
  setNewProjectName,
  onClose,
  onConfirm,
}: any) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={styles.renameModalBackdrop} onPress={onClose}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
      <Pressable style={styles.renameModalContent} onPress={() => {}}>
        <Text style={styles.renameModalTitle}>{t('actions.renameProject')}</Text>
        <Input
          value={newProjectName}
          onChangeText={setNewProjectName}
          placeholder={t('create.namePlaceholder')}
          autoFocus
          style={{ marginBottom: 20 }}
        />
        <View style={styles.renameModalActions}>
          <Button label={t('common:cancel')} onPress={onClose} variant="ghost" noGlass style={{ flex: 1 }} />
          <Button
            label={t('common:confirm')}
            onPress={onConfirm}
            variant="primary"
            noGlass
            disabled={!newProjectName.trim()}
            style={{ flex: 1, borderRadius: 22 }}
          />
        </View>
      </Pressable>
    </Pressable>
  </Modal>
);

export const ProjectsHomeContent = ({
  styles,
  refreshing,
  onRefresh,
  currentPlan,
  showUpgradeCta,
  setShowUpgradeCta,
  onOpenPlans,
  projectCounts,
  onCreateProject,
  onImportProject,
  onBrowseFiles,
  focusKey,
  t,
  loading,
  recentProjects,
  shimmerOpacity,
  onMyProjects,
  onProjectOpen,
  onOpenMenu,
  getTimeAgo,
}: any) => (
  <>
    <DevBanner />

    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="rgba(255,255,255,0.5)"
          colors={[AppColors.primary]}
        />
      }
    >
      <ProjectsQuickActions
        styles={styles}
        t={t}
        currentPlan={currentPlan}
        projectCounts={projectCounts}
        onOpenPlans={onOpenPlans}
        onCreateProject={onCreateProject}
        onImportProject={onImportProject}
        onBrowseFiles={onBrowseFiles}
        focusKey={focusKey}
      />

      {currentPlan === 'free' && showUpgradeCta && (
        <ProjectsUpgradeCta
          styles={styles}
          t={t}
          onOpenPlans={onOpenPlans}
          onDismiss={() => setShowUpgradeCta(false)}
          focusKey={focusKey}
        />
      )}

      <RecentProjectsSection
        styles={styles}
        t={t}
        loading={loading}
        recentProjects={recentProjects}
        shimmerOpacity={shimmerOpacity}
        focusKey={focusKey}
        onMyProjects={onMyProjects}
        onProjectOpen={onProjectOpen}
        onOpenMenu={onOpenMenu}
        getTimeAgo={getTimeAgo}
      />

      <View style={{ height: 40 }} />
    </ScrollView>
  </>
);

export const ProjectCommitsOverlay = ({ selectedProject, showCommits, onClose }: any) => {
  if (!showCommits || !selectedProject || !(selectedProject.repositoryUrl || selectedProject.githubUrl)) {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <GitCommitsScreen
        repositoryUrl={selectedProject.repositoryUrl || selectedProject.githubUrl}
        onClose={onClose}
      />
    </View>
  );
};
