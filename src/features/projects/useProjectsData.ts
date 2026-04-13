import { useFocusEffect } from '@react-navigation/native';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Animated, Dimensions } from 'react-native';
import { workstationService } from '../../core/workstation/workstationService-firebase';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { useAuthStore } from '../../core/auth/authStore';
import { liveActivityService } from '../../core/services/liveActivityService';
import { pushNotificationService } from '../../core/services/pushNotificationService';
import { useTranslation } from 'react-i18next';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export function useProjectsData() {
  const { user } = useAuthStore();
  const { gitHubUser, loadWorkstations } = useTerminalStore();
  const { t } = useTranslation('projects');

  // Request push notification permission on home screen mount
  useEffect(() => {
    if (user?.uid) {
      pushNotificationService.initialize(user.uid).catch(() => {});
    }
    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }
    };
  }, []);

  const currentHour = new Date().getHours();
  const greeting = (currentHour >= 5 && currentHour < 18) ? t('goodMorning') : t('goodEvening');

  // Prioritize Auth user, fallback to GitHub user, then default
  const userName = user?.displayName || gitHubUser?.name || user?.email?.split('@')[0] || t('home.defaultUserName');
  const userAvatar = user?.photoURL || gitHubUser?.avatarUrl;
  const userEmail = user?.email || gitHubUser?.login || t('home.defaultUserEmail');

  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [totalProjectCount, setTotalProjectCount] = useState(0);
  const [projectCounts, setProjectCounts] = useState({ created: 0, cloned: 0, local: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<'free' | 'go' | 'pro' | 'team'>((user?.plan || 'free') as 'free' | 'go' | 'pro' | 'team');
  const [showUpgradeCta, setShowUpgradeCta] = useState(true);
  const [focusKey, setFocusKey] = useState(0);

  // Loading overlay state
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [loadingProjectName, setLoadingProjectName] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState('');

  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const sheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentProgressRef = useRef(0);

  // Keep currentPlan in sync with auth store
  useEffect(() => {
    if (user?.plan) setCurrentPlan(user.plan);
  }, [user?.plan]);

  // Reload projects when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => {
        setFocusKey(k => k + 1);
      }, 100);
      const cachedData = useTerminalStore.getState().workstations;
      const hasCachedData = cachedData.length > 0;

      if (hasCachedData) {
        const sorted = [...cachedData]
          .sort((a, b) => {
            const dateA = a.lastOpened ? new Date(a.lastOpened).getTime() : new Date(a.createdAt).getTime();
            const dateB = b.lastOpened ? new Date(b.lastOpened).getTime() : new Date(b.createdAt).getTime();
            return dateB - dateA;
          })
          .slice(0, 5);
        setRecentProjects(sorted);
        setTotalProjectCount(cachedData.length);
        if (user?.uid) {
          workstationService.getLifetimeCreationCounts(user.uid).then(setProjectCounts).catch(() => {});
        }
        setLoading(false);
        loadRecentProjects(true);
      } else {
        loadRecentProjects(false);
      }
      return () => clearTimeout(timer);
    }, [])
  );

  useEffect(() => {
    Animated.loop(
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
    ).start();
  }, []);

  // Simulated progress animation
  const animateProgressTo = (targetProgress: number, step: string, duration = 1000): Promise<void> => {
    return new Promise((resolve) => {
      setLoadingStep(step);

      liveActivityService.updatePreviewActivity({
        remainingSeconds: Math.max(0, Math.round(60 * (1 - targetProgress / 100))),
        currentStep: step,
        progress: targetProgress / 100,
      }).catch((err) => console.warn('[Project] Failed to update live activity:', err?.message || err));

      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }

      const startProgress = currentProgressRef.current;
      const startTime = Date.now();

      progressTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const eased = 1 - Math.pow(1 - progress, 3);
        const newProgress = startProgress + (targetProgress - startProgress) * eased;
        const roundedProgress = Math.round(newProgress);

        currentProgressRef.current = roundedProgress;
        setLoadingProgress(roundedProgress);

        if (progress >= 1) {
          if (progressTimerRef.current) {
            clearInterval(progressTimerRef.current);
            progressTimerRef.current = null;
          }
          resolve();
        }
      }, 50);
    });
  };

  const loadRecentProjects = async (silent = false) => {
    if (!silent && recentProjects.length === 0) {
      setLoading(true);
    }

    try {
      const workstations = await workstationService.getWorkstations();
      loadWorkstations(workstations);
      setTotalProjectCount(workstations.length);
      if (user?.uid) {
        const lifetime = await workstationService.getLifetimeCreationCounts(user.uid);
        setProjectCounts(lifetime);
      }
      const recent = workstations
        .sort((a, b) => {
          const dateA = a.lastOpened ? new Date(a.lastOpened).getTime() : new Date(a.createdAt).getTime();
          const dateB = b.lastOpened ? new Date(b.lastOpened).getTime() : new Date(b.createdAt).getTime();
          return dateB - dateA;
        })
        .slice(0, 5);
      setRecentProjects(recent);
    } catch (error) {
      console.error('❌ [Home] Error loading recent projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadRecentProjects(true);
    } catch (error) {
      console.warn('[Projects] Refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 0) return t('daysAgo', { count: days });
    if (hours > 0) return t('hoursAgo', { count: hours });
    return t('now');
  };

  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.6],
  });

  const resetLoadingState = () => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    setIsLoadingProject(false);
    setLoadingProjectName('');
    currentProgressRef.current = 0;
    setLoadingProgress(0);
    setLoadingStep('');
  };

  return {
    // User info
    user,
    userName,
    userAvatar,
    userEmail,
    greeting,
    t,
    // Projects data
    recentProjects,
    setRecentProjects,
    totalProjectCount,
    projectCounts,
    loading,
    refreshing,
    onRefresh,
    // Plan
    currentPlan,
    showUpgradeCta,
    setShowUpgradeCta,
    // Loading overlay
    isLoadingProject,
    setIsLoadingProject,
    loadingProjectName,
    setLoadingProjectName,
    loadingProgress,
    setLoadingProgress,
    loadingStep,
    setLoadingStep,
    // Animation refs
    shimmerAnim,
    shimmerOpacity,
    sheetAnim,
    progressTimerRef,
    currentProgressRef,
    // Misc
    focusKey,
    getTimeAgo,
    loadRecentProjects,
    animateProgressTo,
    resetLoadingState,
    SCREEN_HEIGHT,
  };
}
