import { useFocusEffect } from '@react-navigation/native';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Animated, Dimensions, Pressable, ActivityIndicator, Share, TextInput, Modal, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppColors } from '../../shared/theme/colors';
import { workstationService } from '../../core/workstation/workstationService-firebase';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { useAuthStore } from '../../core/auth/authStore';
import { Button } from '../../shared/components/atoms/Button';
import { Input } from '../../shared/components/atoms/Input';
import { GitCommitsScreen } from '../settings/GitCommitsScreen';
import { LoadingModal } from '../../shared/components/molecules/LoadingModal';
import { ProjectLoadingOverlay } from '../../shared/components/molecules/ProjectLoadingOverlay';
import { filePrefetchService } from '../../core/cache/filePrefetchService';
import { useFileCacheStore } from '../../core/cache/fileCacheStore';
import axios from 'axios';
import { config } from '../../config/config';
import { gitAccountService } from '../../core/git/gitAccountService';
import { githubService } from '../../core/github/githubService';
import { useGitCacheStore } from '../../core/cache/gitCacheStore';
import { liveActivityService } from '../../core/services/liveActivityService';

interface Props {
  onCreateProject: () => void;
  onImportProject: () => void;
  onMyProjects: () => void;
  onOpenProject: (workstation: any) => void;
  onSettings?: () => void;
  onOpenPlans?: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const TUTORIAL_KEY = '@drape_tutorial_completed';

// Tutorial steps configuration
const tutorialSteps = [
  {
    id: 'welcome',
    title: 'Benvenuto su Drape!',
    description: 'Ti mostro come funziona in pochi passi',
    icon: 'sparkles' as const,
  },
  {
    id: 'new',
    title: 'Crea un nuovo progetto',
    description: 'Usa AI per generare app complete partendo da una descrizione',
    icon: 'add' as const,
  },
  {
    id: 'clone',
    title: 'Importa da GitHub',
    description: 'Clona qualsiasi repository e modificalo con l\'AI',
    icon: 'logo-github' as const,
  },
  {
    id: 'recent',
    title: 'Progetti recenti',
    description: 'Qui trovi tutti i tuoi progetti salvati',
    icon: 'time-outline' as const,
  },
];

// Glass wrapper component for LiquidGlass effect
const GlassWrapper = ({ children, style }: { children: React.ReactNode; style?: any }) => {
  if (isLiquidGlassSupported) {
    return (
      <LiquidGlassView style={[{ borderRadius: 16, overflow: 'hidden' }, style]} interactive={true} effect="regular" colorScheme="dark">
        {children}
      </LiquidGlassView>
    );
  }
  return <View style={style}>{children}</View>;
};

export const ProjectsHomeScreen = ({ onCreateProject, onImportProject, onMyProjects, onOpenProject, onSettings, onOpenPlans }: Props) => {
  const { user } = useAuthStore();
  const { gitHubUser, loadWorkstations } = useTerminalStore();

  // Debug: log when component mounts
  useEffect(() => {
    const cached = useTerminalStore.getState().workstations;
    console.log('🏠 [Home] Component MOUNTED - cached workstations:', cached.length);
    return () => {
      console.log('🏠 [Home] Component UNMOUNTED');
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }
    };
  }, []);

  // Check if user needs tutorial
  useEffect(() => {
    const checkTutorial = async () => {
      try {
        const completed = await AsyncStorage.getItem(TUTORIAL_KEY);
        if (!completed) {
          // Small delay to let the screen render first
          setTimeout(() => {
            setShowTutorial(true);
            Animated.timing(tutorialFadeAnim, {
              toValue: 1,
              duration: 400,
              useNativeDriver: true,
            }).start();
          }, 800);
        }
      } catch (error) {
        console.log('Error checking tutorial status:', error);
      }
    };
    checkTutorial();
  }, []);

  const currentHour = new Date().getHours();
  const greeting = (currentHour >= 5 && currentHour < 18) ? 'Buongiorno' : 'Buonasera';

  // Prioritize Auth user, fallback to GitHub user, then default
  const userName = user?.displayName || gitHubUser?.name || user?.email?.split('@')[0] || 'Developer';
  const userAvatar = user?.photoURL || gitHubUser?.avatarUrl;
  const userEmail = user?.email || gitHubUser?.login || 'Mobile IDE';
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [repoVisibility, setRepoVisibility] = useState<'loading' | 'public' | 'private' | 'unknown'>('unknown');
  const [showCommits, setShowCommits] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [loadingProjectName, setLoadingProjectName] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState('');
  const [currentPlan, setCurrentPlan] = useState<'free' | 'go' | 'pro' | 'enterprise'>('free');
  const [showUpgradeCta, setShowUpgradeCta] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const tutorialFadeAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const sheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentProgressRef = useRef(0);
  const [focusKey, setFocusKey] = useState(0);

  // Reload projects when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      // Leggi dallo store al momento dell'esecuzione (non dalla closure)
      // Trigger refresh with slight delay to allow transition to complete
      const timer = setTimeout(() => {
        setFocusKey(k => k + 1);
      }, 100);
      const cachedData = useTerminalStore.getState().workstations;
      const hasCachedData = cachedData.length > 0;
      console.log('🏠 [Home] useFocusEffect triggered - hasCachedData:', hasCachedData);

      // Se abbiamo già dati in cache, usali subito e aggiorna in background
      if (hasCachedData) {
        // Mostra subito i dati dalla cache
        const sorted = [...cachedData]
          .sort((a, b) => {
            const dateA = a.lastOpened ? new Date(a.lastOpened).getTime() : new Date(a.createdAt).getTime();
            const dateB = b.lastOpened ? new Date(b.lastOpened).getTime() : new Date(b.createdAt).getTime();
            return dateB - dateA;
          })
          .slice(0, 5);
        setRecentProjects(sorted);
        setLoading(false);
        console.log('🏠 [Home] Using cached data - refreshing in background');
        loadRecentProjects(true); // silent refresh
      } else {
        console.log('🏠 [Home] No cache - showing skeleton');
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

  // Simulated progress animation - smoothly increases progress towards target
  const animateProgressTo = (targetProgress: number, step: string, duration = 1000): Promise<void> => {
    return new Promise((resolve) => {
      setLoadingStep(step);

      // Update Live Activity with new step
      liveActivityService.updatePreviewActivity({
        remainingSeconds: Math.max(0, Math.round(60 * (1 - targetProgress / 100))),
        currentStep: step,
        progress: targetProgress / 100,
      }).catch(() => {});

      // Clear any existing timer
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }

      const startProgress = currentProgressRef.current;
      const startTime = Date.now();

      progressTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out cubic for smooth deceleration
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
    const startTime = Date.now();
    console.log(`🏠 [Home] loadRecentProjects START (silent=${silent})`);

    // Solo mostra skeleton se non è silent e non abbiamo già dati
    if (!silent && recentProjects.length === 0) {
      setLoading(true);
    }

    try {
      const workstations = await workstationService.getWorkstations();
      console.log(`⏱️ [Home] getWorkstations took ${Date.now() - startTime}ms, found ${workstations.length} projects`);

      // Salva nello store globale per persistenza tra remount
      loadWorkstations(workstations);

      const recent = workstations
        .sort((a, b) => {
          // Sort by lastOpened first, fallback to createdAt
          const dateA = a.lastOpened ? new Date(a.lastOpened).getTime() : new Date(a.createdAt).getTime();
          const dateB = b.lastOpened ? new Date(b.lastOpened).getTime() : new Date(b.createdAt).getTime();
          return dateB - dateA;
        })
        .slice(0, 5);
      setRecentProjects(recent);
      console.log(`✅ [Home] loadRecentProjects DONE in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error('❌ [Home] Error loading recent projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 0) return `${days}g fa`;
    if (hours > 0) return `${hours}h fa`;
    return 'ora';
  };

  const handleBrowseFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        Alert.alert('File Selezionato', `${file.name}\nDimensione: ${((file.size || 0) / 1024).toFixed(1)} KB`);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Errore', 'Impossibile aprire il file picker');
    }
  };

  const checkRepoVisibility = async (repoUrl: string) => {
    try {
      setRepoVisibility('loading');
      // Extract owner/repo from GitHub URL
      const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        setRepoVisibility('unknown');
        return;
      }
      const owner = match[1];
      const repo = match[2].replace('.git', '');

      // Try to access the repo without authentication
      // If successful, it's public. If 404, it's private (or doesn't exist)
      const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
        timeout: 5000,
        validateStatus: (status) => status < 500, // Don't throw on 4xx
      });

      if (response.status === 200) {
        setRepoVisibility(response.data.private ? 'private' : 'public');
      } else if (response.status === 404) {
        // Private repo or doesn't exist - assume private
        setRepoVisibility('private');
      } else {
        setRepoVisibility('unknown');
      }
    } catch (error) {
      console.log('Error checking repo visibility:', error);
      setRepoVisibility('unknown');
    }
  };

  // Handle opening a project - prefetch EVERYTHING then open
  const handleProjectOpen = async (project: any) => {
   try {
    const startTime = Date.now();
    console.log('🚀 [Home] Opening project:', project.name);

    // Show loading overlay IMMEDIATELY
    setLoadingProjectName(project.name);
    currentProgressRef.current = 5;
    setLoadingProgress(5);
    setLoadingStep('Preparazione');
    setIsLoadingProject(true);

    // Start Live Activity (Dynamic Island)
    liveActivityService.startPreviewActivity(project.name, {
      remainingSeconds: 60,
      currentStep: 'Preparazione...',
      progress: 0.05,
    }, 'open').catch(() => {});

    // Release previous project's VM when switching (with grace period)
    const { currentWorkstation } = useTerminalStore.getState();
    if (currentWorkstation && currentWorkstation.id !== project.id) {
      console.log('🔄 [Home] Switching project - releasing VM for previous project:', currentWorkstation.id);

      // Show "Freeing resources" step
      await animateProgressTo(8, 'Liberando risorse...', 500);

      // Release VM with retry (up to 3 attempts)
      const releaseProjectId = currentWorkstation.id;
      const releaseWithRetry = async (attempt = 1) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          const res = await fetch(`${config.apiUrl}/fly/release`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: releaseProjectId, userId: user?.email || 'anonymous' }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (res.ok) {
            console.log('✅ [Home] Released VM for previous project:', releaseProjectId);
          } else {
            console.warn(`⚠️ [Home] Release returned ${res.status}, attempt ${attempt}`);
            if (attempt < 3) {
              await new Promise(r => setTimeout(r, 1000 * attempt));
              return releaseWithRetry(attempt + 1);
            }
          }
        } catch (err: any) {
          console.warn(`⚠️ [Home] Release attempt ${attempt} failed:`, err.message);
          if (attempt < 3) {
            await new Promise(r => setTimeout(r, 1000 * attempt));
            return releaseWithRetry(attempt + 1);
          }
          console.error('❌ [Home] Release failed after 3 attempts');
        }
      };
      releaseWithRetry();

      // Wait for the 2-second grace period (process kill + resource cleanup)
      await animateProgressTo(12, 'Liberando risorse...', 2000);
      console.log('✅ [Home] Grace period complete - VM resources freed');
    }

    const repoUrl = project.repositoryUrl || project.githubUrl;
    const userId = useTerminalStore.getState().userId || 'anonymous';

    // Update lastAccessed in background (don't wait)
    workstationService.updateLastAccessed(project.id);

    // === FAST PATH: If we have cache, open immediately ===
    const { isCacheValid } = useFileCacheStore.getState();
    const hasCachedFiles = isCacheValid(project.id);
    const { projectMachineIds } = useTerminalStore.getState();
    const existingMachineId = projectMachineIds[project.id];

    // Only reuse VM if it's the EXACT same workstation (not just same project/repo)
    const isSameWorkstation = currentWorkstation?.id === project.id;

    if (hasCachedFiles && existingMachineId && isSameWorkstation) {
      console.log('⚡ [Home] Cache hit! Opening same workstation immediately');

      // Animate from current progress (12% after grace period) to 100%
      await animateProgressTo(100, 'Apertura...', 400);

      // End Live Activity with success
      if (liveActivityService.isActivityActive()) {
        liveActivityService.endWithSuccess(project.name, 'Aperto!').catch(() => {});
      }

      // Brief pause
      await new Promise(resolve => setTimeout(resolve, 100));

      // Open project
      onOpenProject(project);

      // Clean up
      setTimeout(() => {
        if (progressTimerRef.current) clearInterval(progressTimerRef.current);
        setIsLoadingProject(false);
        setLoadingProjectName('');
        currentProgressRef.current = 0;
        setLoadingProgress(0);
        setLoadingStep('');
      }, 200);

      // Update cache in background (non-blocking)
      console.log('🔄 [Home] Refreshing cache in background...');
      const backgroundUpdate = async () => {
        const gitPromises: Promise<any>[] = [];

        // Git data refresh
        if (repoUrl && repoUrl.includes('github.com')) {
          gitPromises.push(
            (async () => {
              try {
                const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(\.git)?$/) || repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
                if (!match) return;
                const [, owner, repo] = match;
                const accounts = await gitAccountService.getAllAccounts(userId);
                const githubAccount = accounts.find(a => a.provider === 'github');
                const token = githubAccount ? await gitAccountService.getToken(githubAccount, userId) : null;
                const [commitsData, branchesData] = await Promise.all([
                  githubService.getCommits(owner, repo, token || undefined).catch(() => []),
                  githubService.getBranches(owner, repo, token || undefined).catch(() => [])
                ]);
                if (commitsData?.length > 0) {
                  const currentBranch = branchesData?.find((b: any) => b.name === 'main' || b.name === 'master')?.name || 'main';
                  useGitCacheStore.getState().setGitData(project.id, {
                    commits: commitsData.map((c: any, index: number) => ({
                      hash: c.sha,
                      shortHash: c.sha.substring(0, 7),
                      message: c.message.split('\n')[0],
                      author: c.author.name,
                      authorEmail: c.author.email,
                      authorAvatar: c.author.avatar_url,
                      authorLogin: c.author.login,
                      date: new Date(c.author.date).toISOString(),
                      isHead: index === 0,
                      branch: index === 0 ? currentBranch : undefined,
                      url: c.url,
                    })),
                    branches: branchesData?.map((b: any) => ({ name: b.name, isCurrent: b.name === currentBranch, isRemote: true })) || [],
                    status: null,
                    currentBranch,
                    isGitRepo: true
                  });
                }
              } catch (e) { }
            })()
          );
        }

        // Files refresh
        gitPromises.push(filePrefetchService.prefetchFiles(project.id, repoUrl, true));

        // Run both in parallel
        await Promise.all(gitPromises).catch(() => { });
        console.log('✅ [Home] Background refresh complete');
      };
      backgroundUpdate();
      return;
    }

    // === SLOW PATH: No cache, do full prefetch ===
    let vmCompleted = false;

    // 1. VM Warmup - BLOCKING (VM creation is 2s, but full setup with file sync takes 20-40s)
    // 🔑 SKIP if we already have a machineId for this project (prevents unnecessary restarts)

    if (repoUrl && !existingMachineId) {
      try {
        console.log('🔥 [Home] Starting VM warmup (blocking)...');
        // Start from 12% (after grace period) to 25%
        animateProgressTo(25, 'Allocazione VM', 1200);

        const tokenData = await gitAccountService.getTokenForRepo(userId, repoUrl).catch(() => null);
        const token = tokenData?.token || null;

        // Smoothly animate to 55% over the file sync + git init (~18s total)
        // File sync is fast (400ms) but git init + detection takes ~15-17s more
        animateProgressTo(55, 'Sincronizzazione file', 16000);

        // Create abort controller with 2-minute timeout for large repos
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes

        try {
          var response = await fetch(`${config.apiUrl}/fly/clone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workstationId: project.id,
              repositoryUrl: repoUrl,
              githubToken: token,
              userId: user?.email || 'anonymous',
            }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        const data = await response.json();

        // Check for server errors (503 = pool exhausted)
        if (!response.ok) {
          const errorMsg = data?.error || data?.message || 'Server non disponibile';
          console.error('❌ [Home] VM warmup failed:', response.status, errorMsg);
          throw new Error(errorMsg);
        }

        // Save project info (for Next.js warnings, etc.)
        if (data.projectInfo) {
          console.log('📋 [Home] Project info received from warmup:', JSON.stringify(data.projectInfo));
          useTerminalStore.getState().setProjectInfo(data.projectInfo);
        }

        // VM warmup done - animate to 65%
        animateProgressTo(65, 'Rilevamento progetto', 500);

        console.log('✅ [Home] VM warmup complete in', Date.now() - startTime, 'ms');
        vmCompleted = true;
      } catch (e: any) {
        console.warn('⚠️ [Home] VM warmup error:', e.message);
        // Handle timeout errors
        if (e.name === 'AbortError') {
          throw new Error('Clone timeout - il repository è troppo grande. Riprova.');
        }
        // Re-throw pool exhausted errors to show to user
        if (e.message.includes('riprova') || e.message.includes('richieste')) {
          throw e;
        }
      }
    } else if (existingMachineId && isSameWorkstation) {
      console.log(`✨ [Home] Skipping VM warmup - same workstation already has active VM: ${existingMachineId}`);
      vmCompleted = true;
    } else if (existingMachineId && !isSameWorkstation) {
      console.log(`🔄 [Home] Different workstation - will allocate new VM (existing: ${existingMachineId})`);
    }

    // 2 & 3. Git Data + Files Prefetch (in parallel) - only if VM completed
    if (vmCompleted) {
      const parallelFetches: Promise<any>[] = [];

      // Git Data Prefetch
      if (repoUrl && repoUrl.includes('github.com')) {
        parallelFetches.push(
          (async () => {
            try {
              const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(\.git)?$/) || repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
              if (!match) return null;

              const [, owner, repo] = match;
              console.log('🔄 [Home] Prefetching git data for', owner + '/' + repo);
              animateProgressTo(75, 'Caricamento git data', 1200);

              // Get token
              const accounts = await gitAccountService.getAllAccounts(userId);
              const githubAccount = accounts.find(a => a.provider === 'github');
              const token = githubAccount ? await gitAccountService.getToken(githubAccount, userId) : null;

              // Fetch commits and branches in parallel
              const [commitsData, branchesData] = await Promise.all([
                githubService.getCommits(owner, repo, token || undefined).catch(() => []),
                githubService.getBranches(owner, repo, token || undefined).catch(() => [])
              ]);

              if (commitsData && commitsData.length > 0) {
                const currentBranch = branchesData?.find((b: any) => b.name === 'main' || b.name === 'master')?.name || 'main';

                // Cache the git data
                useGitCacheStore.getState().setGitData(project.id, {
                  commits: commitsData.map((c: any, index: number) => ({
                    hash: c.sha,
                    shortHash: c.sha.substring(0, 7),
                    message: c.message.split('\n')[0],
                    author: c.author.name,
                    authorEmail: c.author.email,
                    authorAvatar: c.author.avatar_url,
                    authorLogin: c.author.login,
                    date: new Date(c.author.date).toISOString(),
                    isHead: index === 0,
                    branch: index === 0 ? currentBranch : undefined,
                    url: c.url,
                  })),
                  branches: branchesData?.map((b: any) => ({
                    name: b.name,
                    isCurrent: b.name === currentBranch,
                    isRemote: true,
                  })) || [],
                  status: null,
                  currentBranch,
                  isGitRepo: true
                });

                console.log('✅ [Home] Git data cached:', commitsData.length, 'commits in', Date.now() - startTime, 'ms');
              }
              return commitsData;
            } catch (e: any) {
              console.warn('⚠️ [Home] Git prefetch error:', e.message);
              return null;
            }
          })()
        );
      }

      // File tree prefetch
      if (filePrefetchService.needsPrefetch(project.id)) {
        parallelFetches.push(
          (async () => {
            try {
              console.log('📁 [Home] Prefetching files...');
              animateProgressTo(85, 'Caricamento file', 1500);
              const result = await filePrefetchService.prefetchFiles(project.id, repoUrl);
              console.log('✅ [Home] Files cached in', Date.now() - startTime, 'ms');
              return result;
            } catch (e: any) {
              console.warn('⚠️ [Home] File prefetch error:', e.message);
              return null;
            }
          })()
        );
      }

      // Wait for git and files in parallel with timeout
      try {
        await Promise.race([
          Promise.all(parallelFetches),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Data prefetch timeout')), 10000))
        ]);
        console.log('✅ [Home] Data prefetch complete');
      } catch (e: any) {
        console.warn('⚠️ [Home] Data prefetch timeout, continuing anyway');
      }
    }

    console.log('🎉 [Home] All prefetch complete in', Date.now() - startTime, 'ms - opening project');

    // Animate to completion and WAIT for it
    await animateProgressTo(100, 'Apertura...', 800);

    // End Live Activity with success
    if (liveActivityService.isActivityActive()) {
      liveActivityService.endWithSuccess(project.name, 'Aperto!').catch(() => {});
    }

    // Brief pause at 100%
    await new Promise(resolve => setTimeout(resolve, 200));

    // Now open the project
    onOpenProject(project);

    // Clean up after a short delay
    setTimeout(() => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      setIsLoadingProject(false);
      setLoadingProjectName('');
      currentProgressRef.current = 0;
      setLoadingProgress(0);
      setLoadingStep('');
    }, 300);
   } catch (error: any) {
    console.error('❌ [Home] handleProjectOpen error:', error.message);
    liveActivityService.endPreviewActivity().catch(() => {});
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    setIsLoadingProject(false);
    setLoadingProjectName('');
    currentProgressRef.current = 0;
    setLoadingProgress(0);
    setLoadingStep('');
    Alert.alert('Errore', error.message || 'Impossibile aprire il progetto');
   }
  };

  const handleOpenMenu = (project: any) => {
    setSelectedProject(project);
    setRepoVisibility('unknown');
    setMenuVisible(true);

    // Check repo visibility if it's a GitHub project
    const repoUrl = project.repositoryUrl || project.githubUrl;
    if (repoUrl && repoUrl.includes('github.com')) {
      checkRepoVisibility(repoUrl);
    }

    Animated.spring(sheetAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const handleCloseMenu = () => {
    Animated.timing(sheetAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setMenuVisible(false);
      setSelectedProject(null);
    });
  };

  const handleDeleteProject = async () => {
    if (!selectedProject) return;

    Alert.alert(
      'Elimina Progetto',
      `Sei sicuro di voler eliminare "${selectedProject.name}"?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🗑️ [Home] Deleting project:', selectedProject.id);
              // Delete from backend AND Firebase
              await workstationService.deleteProject(selectedProject.id);
              // Remove from local store
              await useTerminalStore.getState().removeWorkstation(selectedProject.id);
              handleCloseMenu();
              loadRecentProjects();
              console.log('✅ [Home] Project deleted:', selectedProject.id);
            } catch (error) {
              console.error('❌ [Home] Error deleting project:', error);
              Alert.alert('Errore', 'Impossibile eliminare il progetto');
            }
          },
        },
      ]
    );
  };

  // Duplica il progetto
  const handleDuplicateProject = async () => {
    if (!selectedProject) return;

    setIsDuplicating(true);
    try {
      // Crea un nuovo progetto con lo stesso repo URL ma nome diverso
      const duplicatedProject = {
        ...selectedProject,
        id: undefined, // Sarà generato dal servizio
        name: `${selectedProject.name} (copia)`,
        createdAt: new Date().toISOString(),
      };

      const newWorkstation = await workstationService.createWorkstation(duplicatedProject);
      handleCloseMenu();
      loadRecentProjects();
      Alert.alert('Successo', `Progetto duplicato come "${newWorkstation.name}"`);
    } catch (error) {
      console.error('Error duplicating project:', error);
      Alert.alert('Errore', 'Impossibile duplicare il progetto');
    } finally {
      setIsDuplicating(false);
    }
  };

  // Condividi il link del repository
  const handleShareProject = async () => {
    if (!selectedProject) return;

    const repoUrl = selectedProject.repositoryUrl || selectedProject.githubUrl;

    try {
      if (repoUrl) {
        await Share.share({
          message: `Dai un'occhiata a questo progetto: ${selectedProject.name}\n${repoUrl}`,
          url: repoUrl,
          title: selectedProject.name,
        });
      } else {
        // Se non c'è un repo, condividi solo il nome
        await Share.share({
          message: `Sto lavorando su "${selectedProject.name}" con Drape IDE!`,
          title: selectedProject.name,
        });
      }
    } catch (error) {
      console.error('Error sharing project:', error);
    }
  };

  // Apri modal per rinominare
  const handleOpenRename = () => {
    if (!selectedProject) return;
    setNewProjectName(selectedProject.name);
    handleCloseMenu();
    setTimeout(() => setShowRenameModal(true), 300);
  };

  // Conferma rinomina
  const handleConfirmRename = async () => {
    if (!selectedProject || !newProjectName.trim()) return;

    if (newProjectName.trim() === selectedProject.name) {
      setShowRenameModal(false);
      return;
    }

    try {
      await workstationService.updateWorkstation(selectedProject.id, {
        name: newProjectName.trim()
      });
      setShowRenameModal(false);
      setSelectedProject(null);
      loadRecentProjects();
      Alert.alert('Successo', 'Progetto rinominato');
    } catch (error) {
      console.error('Error renaming project:', error);
      Alert.alert('Errore', 'Impossibile rinominare il progetto');
    }
  };

  // Tutorial handlers
  const handleNextTutorialStep = () => {
    if (tutorialStep < tutorialSteps.length - 1) {
      setTutorialStep(tutorialStep + 1);
    } else {
      handleCompleteTutorial();
    }
  };

  const handleCompleteTutorial = async () => {
    Animated.timing(tutorialFadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowTutorial(false);
    });
    try {
      await AsyncStorage.setItem(TUTORIAL_KEY, 'true');
    } catch (error) {
      console.log('Error saving tutorial status:', error);
    }
  };

  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.6],
  });

  const SkeletonItem = () => (
    <View style={styles.skeletonItem}>
      <Animated.View style={[styles.skeletonIcon, { opacity: shimmerOpacity }]} />
      <View style={styles.skeletonContent}>
        <Animated.View style={[styles.skeletonTitle, { opacity: shimmerOpacity }]} />
        <Animated.View style={[styles.skeletonSubtitle, { opacity: shimmerOpacity }]} />
      </View>
    </View>
  );

  const getLanguageIcon = (language: string) => {
    const lang = language?.toLowerCase() || '';
    if (lang.includes('react') || lang.includes('javascript')) return 'logo-react';
    if (lang.includes('python')) return 'logo-python';
    if (lang.includes('node')) return 'logo-nodejs';
    if (lang.includes('swift') || lang.includes('ios')) return 'logo-apple';
    if (lang.includes('android') || lang.includes('kotlin')) return 'logo-android';
    if (lang.includes('html') || lang.includes('css')) return 'logo-html5';
    return 'folder';
  };

  const getLanguageColor = (language: string) => {
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

  const getRepoInfo = (url?: string) => {
    if (!url) return null;
    try {
      const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (match) {
        return {
          owner: match[1],
          repo: match[2].replace('.git', ''),
          full: `${match[1]}/${match[2].replace('.git', '')}`
        };
      }
    } catch {
      return null;
    }
    return null;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {userAvatar ? (
            <Image
              source={{ uri: userAvatar }}
              style={styles.profileImage}
            />
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
                backgroundColor: currentPlan === 'free' ? 'rgba(148,163,184,0.15)' :
                  currentPlan === 'go' ? `${AppColors.primary}15` :
                    currentPlan === 'pro' ? `${AppColors.primary}15` : '#F472B615'
              }]}>
                <Text style={[styles.planBadgeText, {
                  color: currentPlan === 'free' ? '#94A3B8' :
                    currentPlan === 'go' ? AppColors.primary :
                      currentPlan === 'pro' ? AppColors.primary : '#F472B6'
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
          <Ionicons name="settings-outline" size={24} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Quick Actions */}
        <View style={styles.quickActionsSection}>
          <Text style={[styles.sectionLabel, { marginBottom: 14 }]}>Inizia</Text>

          <View style={styles.quickActionsRow}>
            {/* New Project */}
            <TouchableOpacity
              style={styles.actionCard}
              activeOpacity={0.8}
              onPress={onCreateProject}
            >
              <LinearGradient
                colors={[AppColors.primary, '#7B6BFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.actionCardGradient}
              >
                <Ionicons name="add" size={26} color="#fff" />
                <Text style={styles.actionCardTitle}>Nuovo</Text>
                <Text style={styles.actionCardSubtitle}>Crea progetto</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Import from GitHub */}
            <GlassWrapper key={`import-${focusKey}`} style={[styles.actionCard, styles.actionCardGlass]}>
              <TouchableOpacity
                style={styles.actionCardInner}
                activeOpacity={0.8}
                onPress={onImportProject}
              >
                <Ionicons name="logo-github" size={24} color="#fff" />
                <Text style={styles.actionCardTitle}>Clona</Text>
                <Text style={styles.actionCardSubtitle}>clona repo</Text>
              </TouchableOpacity>
            </GlassWrapper>

            {/* Open File */}
            <GlassWrapper key={`file-${focusKey}`} style={[styles.actionCard, styles.actionCardGlass]}>
              <TouchableOpacity
                style={styles.actionCardInner}
                activeOpacity={0.8}
                onPress={handleBrowseFiles}
              >
                <Ionicons name="folder-open" size={24} color="rgba(255,255,255,0.85)" />
                <Text style={styles.actionCardTitle}>File</Text>
                <Text style={styles.actionCardSubtitle}>Apri locale</Text>
              </TouchableOpacity>
            </GlassWrapper>
          </View>
        </View>

        {/* Upgrade CTA - only show for free users */}
        {currentPlan === 'free' && showUpgradeCta && (
          <GlassWrapper key={`upgrade-${focusKey}`} style={styles.upgradeCtaGlass}>
            <TouchableOpacity
              style={styles.upgradeCta}
              activeOpacity={0.9}
              onPress={onOpenPlans}
            >
              <TouchableOpacity
                style={styles.upgradeCtaClose}
                onPress={(e) => {
                  e.stopPropagation();
                  setShowUpgradeCta(false);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={14} color="rgba(255,255,255,0.35)" />
              </TouchableOpacity>

              <View style={styles.upgradeCtaMain}>
                <View style={styles.upgradeCtaContent}>
                  <View style={styles.upgradeCtaIconWrap}>
                    <Ionicons name="rocket-outline" size={18} color={AppColors.primary} />
                  </View>
                  <View style={styles.upgradeCtaText}>
                    <Text style={styles.upgradeCtaTitle}>Sblocca Pro</Text>
                    <Text style={styles.upgradeCtaSubtitle}>Progetti illimitati e 6x budget AI</Text>
                  </View>
                </View>
                <View style={styles.upgradeCtaArrow}>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.4)" />
                </View>
              </View>
            </TouchableOpacity>
          </GlassWrapper>
        )}

        {/* Recent Projects */}
        <View style={styles.projectsSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.4)" />
              <Text style={styles.sectionLabel}>Recenti</Text>
            </View>

          </View>

          {loading ? (
            <>
              <SkeletonItem />
              <SkeletonItem />
              <SkeletonItem />
            </>
          ) : recentProjects.length > 0 ? (
            <>
              {recentProjects.map((project) => {
                const langColor = getLanguageColor(project.language);
                const repoInfo = getRepoInfo(project.repositoryUrl || project.githubUrl);
                return (
                  <GlassWrapper key={`${project.id}-${focusKey}`} style={styles.projectCardGlass}>
                    <TouchableOpacity
                      style={styles.projectCard}
                      activeOpacity={0.7}
                      onPress={() => handleProjectOpen(project)}
                      onLongPress={() => handleOpenMenu(project)}
                      delayLongPress={400}
                    >
                      <View style={styles.projectIcon}>
                        {repoInfo ? (
                          <Ionicons name="logo-github" size={22} color="rgba(255,255,255,0.7)" />
                        ) : (
                          <Ionicons name={getLanguageIcon(project.language) as any} size={22} color={langColor} />
                        )}
                      </View>
                      <View style={styles.projectInfo}>
                        <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
                        <View style={styles.projectMetaRow}>
                          {repoInfo ? (
                            <Text style={styles.projectRepoText} numberOfLines={1}>{repoInfo.full}</Text>
                          ) : (
                            <Text style={styles.projectLang}>{project.language || 'Progetto'}</Text>
                          )}
                          <View style={styles.metaDot} />
                          <Text style={styles.projectTime}>{getTimeAgo(project.lastOpened || project.createdAt)}</Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
                    </TouchableOpacity>
                  </GlassWrapper>
                );
              })}
              {/* See All Button */}
              <GlassWrapper key={`seeall-${focusKey}`} style={{ borderRadius: 100, overflow: 'hidden', alignSelf: 'center', marginTop: 32 }}>
                <TouchableOpacity
                  style={[styles.seeAllButton, { marginTop: 0, backgroundColor: 'rgba(20,20,22,0.5)' }]}
                  activeOpacity={0.7}
                  onPress={onMyProjects}
                >
                  <Text style={styles.seeAllButtonText}>Vedi tutti</Text>
                  <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
              </GlassWrapper>
            </>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="folder-open-outline" size={48} color="rgba(255,255,255,0.1)" />
              <Text style={styles.emptyTitle}>Nessun progetto</Text>
              <Text style={styles.emptySubtitle}>Crea il tuo primo progetto usando i pulsanti sopra</Text>
            </View>
          )}
        </View>

        {/* Bottom padding */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Project Menu Bottom Sheet */}
      {menuVisible && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable
            style={[StyleSheet.absoluteFill, styles.sheetBackdrop]}
            onPress={handleCloseMenu}
          >
            <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
          </Pressable>
          <Animated.View
            style={[
              styles.sheetContainerBase,
              { transform: [{ translateY: sheetAnim }] }
            ]}
          >
            {isLiquidGlassSupported ? (
              <LiquidGlassView key={`sheet-${focusKey}`} style={styles.sheetLiquidGlass} interactive={true} effect="regular" colorScheme="dark">
                <View style={styles.sheetContent}>
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
                          <Text style={styles.sheetProjectMeta}>{selectedProject.language || 'Progetto'}</Text>
                        </View>
                      </View>

                      {/* Repository Info Section */}
                      {(selectedProject.repositoryUrl || selectedProject.githubUrl) && (
                        <View style={styles.repoInfoSection}>
                          <View style={styles.repoInfoRow}>
                            <Ionicons name="logo-github" size={16} color="rgba(255,255,255,0.5)" />
                            <Text style={styles.repoUrlText} numberOfLines={1}>
                              {getRepoInfo(selectedProject.repositoryUrl || selectedProject.githubUrl)?.full || 'Repository'}
                            </Text>
                            <TouchableOpacity
                              onPress={async () => {
                                const url = selectedProject.repositoryUrl || selectedProject.githubUrl;
                                await Clipboard.setStringAsync(url);
                                Alert.alert('Copiato', 'Link repository copiato negli appunti');
                              }}
                              style={styles.copyButton}
                            >
                              <Ionicons name="copy-outline" size={14} color="rgba(255,255,255,0.4)" />
                            </TouchableOpacity>
                          </View>
                          <View style={styles.repoVisibilityRow}>
                            {repoVisibility === 'loading' ? (
                              <ActivityIndicator size="small" color={AppColors.primary} />
                            ) : repoVisibility === 'public' ? (
                              <View style={styles.visibilityBadge}>
                                <Ionicons name="globe-outline" size={12} color="#4ade80" />
                                <Text style={[styles.visibilityText, { color: '#4ade80' }]}>Pubblica</Text>
                              </View>
                            ) : repoVisibility === 'private' ? (
                              <View style={styles.visibilityBadge}>
                                <Ionicons name="lock-closed-outline" size={12} color="#f59e0b" />
                                <Text style={[styles.visibilityText, { color: '#f59e0b' }]}>Privata</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      )}

                      <View style={styles.sheetActions}>
                        <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7} onPress={() => {
                          handleCloseMenu();
                          setTimeout(() => handleProjectOpen(selectedProject), 300);
                        }}>
                          <LiquidGlassView style={styles.sheetActionIconGlass} interactive={true} effect="clear" colorScheme="dark">
                            <Ionicons name="open-outline" size={20} color="#fff" />
                          </LiquidGlassView>
                          <Text style={styles.sheetActionText}>Apri</Text>
                        </TouchableOpacity>

                        {(selectedProject.repositoryUrl || selectedProject.githubUrl) && (
                          <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7} onPress={() => {
                            handleCloseMenu();
                            setTimeout(() => setShowCommits(true), 300);
                          }}>
                            <LiquidGlassView style={styles.sheetActionIconGlass} interactive={true} effect="clear" colorScheme="dark">
                              <Ionicons name="git-commit-outline" size={20} color={AppColors.primary} />
                            </LiquidGlassView>
                            <Text style={styles.sheetActionText}>Commit</Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7} onPress={handleDuplicateProject} disabled={isDuplicating}>
                          <LiquidGlassView style={styles.sheetActionIconGlass} interactive={true} effect="clear" colorScheme="dark">
                            {isDuplicating ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Ionicons name="copy-outline" size={20} color="#fff" />
                            )}
                          </LiquidGlassView>
                          <Text style={styles.sheetActionText}>Duplica</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7} onPress={handleShareProject}>
                          <LiquidGlassView style={styles.sheetActionIconGlass} interactive={true} effect="clear" colorScheme="dark">
                            <Ionicons name="share-outline" size={20} color="#fff" />
                          </LiquidGlassView>
                          <Text style={styles.sheetActionText}>Condividi</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7} onPress={handleOpenRename}>
                          <LiquidGlassView style={styles.sheetActionIconGlass} interactive={true} effect="clear" colorScheme="dark">
                            <Ionicons name="create-outline" size={20} color="#fff" />
                          </LiquidGlassView>
                          <Text style={styles.sheetActionText}>Rinomina</Text>
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        style={styles.sheetDeleteButton}
                        activeOpacity={0.7}
                        onPress={handleDeleteProject}
                      >
                        <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                        <Text style={styles.sheetDeleteText}>Elimina progetto</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  <TouchableOpacity style={styles.sheetCancelButton} activeOpacity={0.7} onPress={handleCloseMenu}>
                    <Text style={styles.sheetCancelText}>Annulla</Text>
                  </TouchableOpacity>
                </View>
              </LiquidGlassView>
            ) : (
              <View style={styles.sheetContainer}>
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
                        <Text style={styles.sheetProjectMeta}>{selectedProject.language || 'Progetto'}</Text>
                      </View>
                    </View>

                    {/* Repository Info Section */}
                    {(selectedProject.repositoryUrl || selectedProject.githubUrl) && (
                      <View style={styles.repoInfoSection}>
                        <View style={styles.repoInfoRow}>
                          <Ionicons name="logo-github" size={16} color="rgba(255,255,255,0.5)" />
                          <Text style={styles.repoUrlText} numberOfLines={1}>
                            {getRepoInfo(selectedProject.repositoryUrl || selectedProject.githubUrl)?.full || 'Repository'}
                          </Text>
                          <TouchableOpacity
                            onPress={async () => {
                              const url = selectedProject.repositoryUrl || selectedProject.githubUrl;
                              await Clipboard.setStringAsync(url);
                              Alert.alert('Copiato', 'Link repository copiato negli appunti');
                            }}
                            style={styles.copyButton}
                          >
                            <Ionicons name="copy-outline" size={14} color="rgba(255,255,255,0.4)" />
                          </TouchableOpacity>
                        </View>
                        <View style={styles.repoVisibilityRow}>
                          {repoVisibility === 'loading' ? (
                            <ActivityIndicator size="small" color={AppColors.primary} />
                          ) : repoVisibility === 'public' ? (
                            <View style={styles.visibilityBadge}>
                              <Ionicons name="globe-outline" size={12} color="#4ade80" />
                              <Text style={[styles.visibilityText, { color: '#4ade80' }]}>Pubblica</Text>
                            </View>
                          ) : repoVisibility === 'private' ? (
                            <View style={styles.visibilityBadge}>
                              <Ionicons name="lock-closed-outline" size={12} color="#f59e0b" />
                              <Text style={[styles.visibilityText, { color: '#f59e0b' }]}>Privata</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    )}

                    <View style={styles.sheetActions}>
                      <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7} onPress={() => {
                        handleCloseMenu();
                        setTimeout(() => handleProjectOpen(selectedProject), 300);
                      }}>
                        <View style={styles.sheetActionIcon}>
                          <Ionicons name="open-outline" size={20} color="#fff" />
                        </View>
                        <Text style={styles.sheetActionText}>Apri</Text>
                      </TouchableOpacity>

                      {(selectedProject.repositoryUrl || selectedProject.githubUrl) && (
                        <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7} onPress={() => {
                          handleCloseMenu();
                          setTimeout(() => setShowCommits(true), 300);
                        }}>
                          <View style={[styles.sheetActionIcon, { backgroundColor: `${AppColors.primary}15` }]}>
                            <Ionicons name="git-commit-outline" size={20} color={AppColors.primary} />
                          </View>
                          <Text style={styles.sheetActionText}>Commit</Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7} onPress={handleDuplicateProject} disabled={isDuplicating}>
                        <View style={styles.sheetActionIcon}>
                          {isDuplicating ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Ionicons name="copy-outline" size={20} color="#fff" />
                          )}
                        </View>
                        <Text style={styles.sheetActionText}>Duplica</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7} onPress={handleShareProject}>
                        <View style={styles.sheetActionIcon}>
                          <Ionicons name="share-outline" size={20} color="#fff" />
                        </View>
                        <Text style={styles.sheetActionText}>Condividi</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7} onPress={handleOpenRename}>
                        <View style={styles.sheetActionIcon}>
                          <Ionicons name="create-outline" size={20} color="#fff" />
                        </View>
                        <Text style={styles.sheetActionText}>Rinomina</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={styles.sheetDeleteButton}
                      activeOpacity={0.7}
                      onPress={handleDeleteProject}
                    >
                      <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                      <Text style={styles.sheetDeleteText}>Elimina progetto</Text>
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity style={styles.sheetCancelButton} activeOpacity={0.7} onPress={handleCloseMenu}>
                  <Text style={styles.sheetCancelText}>Annulla</Text>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        </View>
      )}

      {/* Git Commits Screen */}
      {showCommits && selectedProject && (selectedProject.repositoryUrl || selectedProject.githubUrl) && (
        <View style={StyleSheet.absoluteFill}>
          <GitCommitsScreen
            repositoryUrl={selectedProject.repositoryUrl || selectedProject.githubUrl}
            onClose={() => {
              setShowCommits(false);
              setSelectedProject(null);
            }}
          />
        </View>
      )}

      {/* Rename Modal */}
      <Modal
        visible={showRenameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRenameModal(false)}
      >
        <Pressable
          style={styles.renameModalBackdrop}
          onPress={() => setShowRenameModal(false)}
        >
          {isLiquidGlassSupported ? (
            <LiquidGlassView
              style={{ borderRadius: 24, overflow: 'hidden', width: '100%', maxWidth: 340 }}
              interactive={true}
              effect="clear"
              colorScheme="dark"
            >
              <Pressable
                style={{ padding: 24, backgroundColor: 'rgba(255,255,255,0.05)' }}
                onPress={() => { }}
              >
                <Text style={styles.renameModalTitle}>Rinomina Progetto</Text>
                <Input
                  value={newProjectName}
                  onChangeText={setNewProjectName}
                  placeholder="Nome progetto"
                  autoFocus
                  style={{ marginBottom: 20 }}
                />
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Button
                    label="Annulla"
                    onPress={() => setShowRenameModal(false)}
                    variant="ghost"
                    style={{ flex: 1 }}
                  />
                  <Button
                    label="Conferma"
                    onPress={handleConfirmRename}
                    variant="primary"
                    disabled={!newProjectName.trim()}
                    style={{ flex: 1 }}
                  />
                </View>
              </Pressable>
            </LiquidGlassView>
          ) : (
            <Pressable style={styles.renameModalContent} onPress={() => { }}>
              <Text style={styles.renameModalTitle}>Rinomina Progetto</Text>
              <Input
                value={newProjectName}
                onChangeText={setNewProjectName}
                placeholder="Nome progetto"
                autoFocus
                style={{ marginBottom: 20 }}
              />
              <View style={styles.renameModalActions}>
                <Button
                  label="Annulla"
                  onPress={() => setShowRenameModal(false)}
                  variant="ghost"
                  style={{ flex: 1 }}
                />
                <Button
                  label="Conferma"
                  onPress={handleConfirmRename}
                  variant="primary"
                  disabled={!newProjectName.trim()}
                  style={{ flex: 1 }}
                />
              </View>
            </Pressable>
          )}
        </Pressable>
      </Modal>

      <LoadingModal
        visible={isDuplicating}
        message="Duplicating project..."
      />

      {/* Project Loading Overlay - shows until VM is ready */}
      <ProjectLoadingOverlay
        visible={isLoadingProject}
        projectName={loadingProjectName}
        message="Avvio ambiente..."
        progress={loadingProgress}
        currentStep={loadingStep}
        showTips={true}
      />

      {/* Onboarding Tutorial */}
      {showTutorial && (
        <Animated.View
          style={[styles.tutorialOverlay, { opacity: tutorialFadeAnim }]}
        >
          <Pressable
            style={styles.tutorialBackdrop}
            onPress={handleNextTutorialStep}
          />

          <View style={styles.tutorialCard}>
            {/* Step indicator */}
            <Text style={styles.tutorialStepLabel}>
              {tutorialStep + 1} di {tutorialSteps.length}
            </Text>

            {/* Icon */}
            <View style={[
              styles.tutorialIconWrap,
              tutorialStep === 1 && { backgroundColor: `${AppColors.primary}20` },
              tutorialStep === 2 && { backgroundColor: 'rgba(255,255,255,0.08)' },
              tutorialStep === 3 && { backgroundColor: 'rgba(96, 165, 250, 0.15)' },
            ]}>
              <Ionicons
                name={tutorialSteps[tutorialStep].icon}
                size={32}
                color={
                  tutorialStep === 0 ? '#F59E0B' :
                    tutorialStep === 1 ? AppColors.primary :
                      tutorialStep === 2 ? '#fff' :
                        '#60A5FA'
                }
              />
            </View>

            {/* Content */}
            <Text style={styles.tutorialTitle}>
              {tutorialSteps[tutorialStep].title}
            </Text>
            <Text style={styles.tutorialDescription}>
              {tutorialSteps[tutorialStep].description}
            </Text>

            {/* Progress dots */}
            <View style={styles.tutorialProgress}>
              {tutorialSteps.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.tutorialDot,
                    index === tutorialStep && styles.tutorialDotActive,
                  ]}
                />
              ))}
            </View>

            {/* Actions */}
            <View style={styles.tutorialActions}>
              {tutorialStep === 0 ? (
                <TouchableOpacity
                  style={styles.tutorialNextFull}
                  onPress={handleNextTutorialStep}
                  activeOpacity={0.8}
                >
                  <Text style={styles.tutorialNextText}>Scopri Drape</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </TouchableOpacity>
              ) : (
                <View style={styles.tutorialButtonsRow}>
                  <TouchableOpacity
                    style={styles.tutorialSkip}
                    onPress={handleCompleteTutorial}
                  >
                    <Text style={styles.tutorialSkipText}>Salta</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.tutorialNext}
                    onPress={handleNextTutorialStep}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.tutorialNextText}>
                      {tutorialStep === tutorialSteps.length - 1 ? 'Inizia!' : 'Avanti'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: `${AppColors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${AppColors.primary}30`,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 1,
  },
  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 24,
  },
  // Quick Actions Section
  quickActionsSection: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  // Quick Actions Row - compact cards
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionCard: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  actionCardGradient: {
    padding: 14,
    alignItems: 'center',
    gap: 8,
  },
  actionCardDark: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  actionCardGlass: {
    flex: 1,
  },
  actionCardInner: {
    padding: 14,
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(20,20,22,0.5)',
    borderRadius: 14,
  },
  actionCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  actionCardSubtitle: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  // Projects Section
  projectsSection: {
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // Project Card
  projectCardGlass: {
    marginBottom: 8,
    borderRadius: 16,
    overflow: 'hidden',
  },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(20,20,22,0.5)',
    borderRadius: 14,
  },
  projectIcon: {
    marginRight: 4,
  },
  projectInfo: {
    flex: 1,
    marginLeft: 12,
  },
  projectName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  projectMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  projectRepoText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    fontFamily: 'monospace',
    maxWidth: '55%',
  },
  projectLang: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 8,
  },
  projectTime: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
  },
  // Skeleton
  skeletonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
  },
  skeletonIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  skeletonContent: {
    flex: 1,
    marginLeft: 12,
    gap: 8,
  },
  skeletonTitle: {
    width: '50%',
    height: 14,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  skeletonSubtitle: {
    width: '30%',
    height: 12,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    marginTop: 16,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  // Bottom Sheet
  sheetBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheetContainerBase: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheetLiquidGlass: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  sheetContent: {
    paddingBottom: 40,
  },
  sheetContainer: {
    backgroundColor: '#141416',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  sheetHandle: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  sheetHandleBar: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sheetProjectIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetProjectInfo: {
    flex: 1,
    marginLeft: 12,
  },
  sheetProjectName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  sheetProjectMeta: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  repoInfoSection: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 8,
  },
  repoInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  repoUrlText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'monospace',
  },
  copyButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  repoVisibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  visibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  visibilityText: {
    fontSize: 12,
    fontWeight: '500',
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sheetActionItem: {
    alignItems: 'center',
    gap: 8,
  },
  sheetActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetActionIconGlass: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sheetActionText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
  },
  sheetDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: 'rgba(220, 53, 69, 0.85)',
    borderRadius: 14,
  },
  sheetDeleteText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  sheetCancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginHorizontal: 20,
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
  },
  sheetCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  // Rename Modal
  renameModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  renameModalContent: {
    backgroundColor: '#1a1a1c',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 340,
  },
  renameModalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  renameInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  renameModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  renameModalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  renameModalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  renameModalConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
  },
  renameModalConfirmDisabled: {
    opacity: 0.5,
  },
  renameModalConfirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  // Profile Header Styles
  profileImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 12,
    borderWidth: 2,
    borderColor: 'rgba(155, 138, 255, 0.2)',
  },
  profilePlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  profileInitials: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  welcomeTextContainer: {
    justifyContent: 'center',
  },
  nameWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  planBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  // Upgrade CTA
  upgradeCtaGlass: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  upgradeCta: {
    borderRadius: 14,
    backgroundColor: 'rgba(20,20,22,0.5)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    position: 'relative',
  },
  upgradeCtaMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  upgradeCtaClose: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 4,
    zIndex: 10,
  },
  upgradeCtaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  upgradeCtaIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeCtaText: {
    flex: 1,
    gap: 2,
  },
  upgradeCtaTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  upgradeCtaSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
  },
  upgradeCtaArrow: {
    marginRight: 20,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginTop: 32,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  seeAllButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.4,
  },
  // Tutorial Styles
  tutorialOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  tutorialBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
  },
  tutorialCard: {
    backgroundColor: '#16161a',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tutorialStepLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 24,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tutorialIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  tutorialTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  tutorialDescription: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 22,
  },
  tutorialProgress: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 28,
    marginBottom: 24,
  },
  tutorialDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  tutorialDotActive: {
    backgroundColor: AppColors.primary,
  },
  tutorialActions: {
    width: '100%',
  },
  tutorialButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  tutorialSkip: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tutorialSkipText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
  },
  tutorialNext: {
    flex: 1.5,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: AppColors.primary,
  },
  tutorialNextFull: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: AppColors.primary,
  },
  tutorialNextText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
