import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Keyboard,
  Dimensions,
  Platform,
  Animated,
  LayoutAnimation,
  Pressable,
  KeyboardAvoidingView,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppColors } from '../../shared/theme/colors';
import { workstationService } from '../../core/workstation/workstationService-firebase';
import { useAuthStore } from '../../core/auth/authStore';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { CreationProgressModal } from '../../shared/components/molecules/CreationProgressModal';
import { DescriptionInput } from './DescriptionInput';
import { liveActivityService } from '../../core/services/liveActivityService';
import { useAgentStream, AgentMode } from '../../core/ai/useAgentStream';
import { useAgentStore } from '../../core/ai/agentStore';
import { AgentProgress } from '../../shared/components/molecules/AgentProgress';
import { AgentModeModal } from '../../shared/components/molecules/AgentModeModal';
import { config } from '../../config/config';
import { getAuthHeaders } from '../../core/api/getAuthToken';
import { useTranslation } from 'react-i18next';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  onBack: () => void;
  onCreate: (projectData: any) => void;
  onOpenPlans?: () => void;
}

const languages = [
  { id: 'react', name: 'React', icon: 'logo-react', color: '#61DAFB' },
  { id: 'html', name: 'HTML/CSS/JS', icon: 'logo-html5', color: '#E34F26' },
  { id: 'vue', name: 'Vue', icon: 'logo-vue', color: '#4FC08D' },
  { id: 'nextjs', name: 'Next.js', icon: 'server-outline', color: '#FFFFFF' },
];

export const CreateProjectScreen = ({ onBack, onCreate, onOpenPlans }: Props) => {
  const { t } = useTranslation('projects');
  const [step, setStep] = useState(1);
  const [projectName, setProjectName] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [creationTask, setCreationTask] = useState<{ status: string; progress: number; message: string; step?: string } | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Agent system state
  const [showModeModal, setShowModeModal] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentMode | null>(null);
  // DISABLED: React Native doesn't support fetch streaming (response.body.getReader())
  // TODO: Implement EventSource polyfill for SSE support
  const [useAgentSystem, setUseAgentSystem] = useState(false); // Flag to enable/disable agent system
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [projectLimit, setProjectLimit] = useState(2);

  // Agent stream hook
  const {
    startStream,
    cancel: cancelStream,
    reset: resetStream,
    isStreaming,
    events: agentEvents,
    currentTool: agentCurrentTool,
    status: agentStatus,
    result: agentResult,
  } = useAgentStream({
    onComplete: handleAgentComplete,
    onError: handleAgentError,
  });

  // Get existing workstations to check for duplicate names
  const { workstations } = useTerminalStore();

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animate in
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // Cleanup polling interval on unmount
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Animate progress bar
    Animated.timing(progressAnim, {
      toValue: step,
      duration: 300,
      useNativeDriver: false,
    }).start();

    // Reset animations to final state when entering step 2 to prevent interference
    if (step === 2) {
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
    }
  }, [step]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Agent completion callback
  async function handleAgentComplete(result: any) {

    // End Live Activity with success + notification
    const pName = result.projectName || projectName.trim();
    if (liveActivityService.isActivityActive()) {
      liveActivityService.endWithSuccess(pName, 'Creato!').catch(() => {});
    }
    liveActivityService.sendNotification(
      'Progetto creato!',
      `${pName} e' pronto`
    ).catch(() => {});

    try {
      const userId = useAuthStore.getState().user?.uid;
      if (!userId) {
        throw new Error('No user ID');
      }

      // Save agent context to backend
      const apiUrl = config.apiUrl;
      const authHeaders = await getAuthHeaders();
      await fetch(`${apiUrl}/agent/save-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          projectId: result.projectId,
          userId,
          context: {
            events: agentEvents,
            mode: agentMode,
            timestamp: Date.now(),
          },
        }),
      });

      // Create workstation object
      const workstation = {
        id: result.projectId,
        projectId: result.projectId,
        name: result.projectName || projectName.trim(),
        language: result.technology || selectedLanguage,
        technology: result.technology || selectedLanguage,
        templateDescription: result.templateDescription || description.trim(),
        status: 'ready' as const,
        createdAt: new Date(),
        files: result.files || [],
        folderId: null,
      };

      // Short delay to show completion
      setTimeout(() => {
        setIsCreating(false);
        resetStream();
        onCreate(workstation);
      }, 800);
    } catch (error) {
      console.error('[CreateProject] Failed to save context:', error);
      // Still proceed with creation even if context save fails
      const workstation = {
        id: result.projectId || Date.now().toString(),
        projectId: result.projectId || Date.now().toString(),
        name: result.projectName || projectName.trim(),
        language: result.technology || selectedLanguage,
        technology: result.technology || selectedLanguage,
        templateDescription: result.templateDescription || description.trim(),
        status: 'ready' as const,
        createdAt: new Date(),
        files: result.files || [],
        folderId: null,
      };

      setTimeout(() => {
        setIsCreating(false);
        resetStream();
        onCreate(workstation);
      }, 800);
    }
  }

  // Agent error callback
  function handleAgentError(error: string) {
    console.error('[CreateProject] Agent error:', error);
    liveActivityService.endPreviewActivity().catch(() => {});
    Alert.alert('Errore', `Impossibile creare il progetto: ${error}`);
    setIsCreating(false);
    resetStream();
  }

  const handleNext = () => {
    if (step === 1) {
      if (!projectName.trim()) {
        Alert.alert(t('common:warning'), t('create.enterName'));
        return;
      }
      if (!description.trim()) {
        Alert.alert(t('common:warning'), t('create.enterDescription'));
        return;
      }

      // Check for duplicate project name and generate unique name if needed
      const trimmedName = projectName.trim();
      const existingProject = workstations.find(
        w => w.name?.toLowerCase() === trimmedName.toLowerCase()
      );

      if (existingProject) {
        // Find a unique name by adding a number suffix
        let newName = trimmedName;
        let counter = 2;

        while (workstations.some(w => w.name?.toLowerCase() === newName.toLowerCase())) {
          newName = `${trimmedName} (${counter})`;
          counter++;
        }

        Alert.alert(
          t('create.nameExists'),
          t('create.nameExistsDesc', { name: trimmedName }) + ' ' + t('create.newProjectWillBeCalled', { name: newName }),
          [
            { text: t('create.changeName'), style: 'cancel' },
            {
              text: t('common:ok'),
              onPress: () => {
                setProjectName(newName);
                Keyboard.dismiss();
                analyzeRequirements();
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setStep(2);
              }
            }
          ]
        );
        return;
      }

      Keyboard.dismiss();

      // AI Analysis
      analyzeRequirements();
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setStep(2);
    } else if (step === 2) {
      if (!selectedLanguage) {
        Alert.alert('Attenzione', 'Seleziona un linguaggio');
        return;
      }
      Keyboard.dismiss();
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setStep(3);
    }
  };

  const analyzeRequirements = async () => {
    try {
      // Don't re-analyze if we already have a selection or if description hasn't changed enough?
      // For now, always analyze to give fresh recommendation

      const apiUrl = config.apiUrl;
      const recAuthHeaders = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/ai/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...recAuthHeaders },
        body: JSON.stringify({ description: description.trim() }),
      });

      const result = await response.json();
      if (result.success && result.recommendation) {
        // Find matching language
        const match = languages.find(l => l.id === result.recommendation);
        if (match) {
          setSelectedLanguage(match.id);
          // Optional: Show a toast or small indicator that AI selected this
        }
      }
    } catch (error) {
      console.error("AI recommendation failed", error);
      // Fail silently, let user choose
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      // Clear any polling interval when leaving the screen
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      onBack();
    }
  };

  const handleCreate = async () => {
    Keyboard.dismiss();

    // Show mode selection modal if using agent system
    if (useAgentSystem) {
      setShowModeModal(true);
    } else {
      // Fallback to old creation system
      startOldCreation();
    }
  };

  // Handle agent mode selection
  const handleModeSelect = async (mode: AgentMode) => {
    setShowModeModal(false);
    setAgentMode(mode);
    setIsCreating(true);

    // Start Live Activity (Dynamic Island)
    liveActivityService.startPreviewActivity(projectName.trim(), {
      remainingSeconds: 180,
      currentStep: 'Creazione con AI...',
      progress: 0,
    }, 'create').catch(() => {});

    try {
      const userId = useAuthStore.getState().user?.uid;
      if (!userId) {
        Alert.alert('Errore', 'Devi essere loggato per creare un progetto');
        setIsCreating(false);
        return;
      }

      const apiUrl = config.apiUrl;
      const modeAuthHeaders = await getAuthHeaders();

      // Create project first to get projectId
      const response = await fetch(`${apiUrl}/workstation/create-with-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...modeAuthHeaders },
        body: JSON.stringify({
          projectName: projectName.trim(),
          technology: selectedLanguage,
          description: description.trim(),
          userId,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        if (result.error === 'PROJECT_LIMIT_EXCEEDED') {
          setProjectLimit(result.limits?.maxProjects || 3);
          setShowUpgradeModal(true);
          setIsCreating(false);
          liveActivityService.endPreviewActivity().catch(() => {});
          return;
        }
        throw new Error(result.error || 'Failed to start project creation');
      }

      const projectId = result.taskId || result.projectId;

      // Build prompt for agent
      const prompt = `Create a ${selectedLanguage} project named "${projectName.trim()}". Description: ${description.trim()}`;

      // Start agent stream
      await startStream(projectId, mode, prompt);
    } catch (error: any) {
      console.error('[CreateProject] Error starting agent:', error);
      liveActivityService.endPreviewActivity().catch(() => {});
      Alert.alert('Errore', 'Impossibile avviare l\'agente. Riprova.');
      setIsCreating(false);
      resetStream();
    }
  };

  // Old creation system (fallback)
  const startOldCreation = async () => {
    setIsCreating(true);
    setCreationTask({ status: 'running', progress: 0, message: 'Starting...', step: 'Initializing' });

    // Start Live Activity (Dynamic Island)
    liveActivityService.startPreviewActivity(projectName.trim(), {
      remainingSeconds: 120,
      currentStep: 'Creazione progetto...',
      progress: 0,
    }, 'create').catch(() => {});

    try {
      const userId = useAuthStore.getState().user?.uid;
      if (!userId) {
        Alert.alert('Errore', 'Devi essere loggato per creare un progetto');
        setIsCreating(false);
        setCreationTask(null);
        return;
      }

      const apiUrl = config.apiUrl;
      const oldAuthHeaders = await getAuthHeaders();

      // 1. Start Task
      const response = await fetch(`${apiUrl}/workstation/create-with-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...oldAuthHeaders },
        body: JSON.stringify({
          projectName: projectName.trim(),
          technology: selectedLanguage,
          description: description.trim(),
          userId,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        if (result.error === 'PROJECT_LIMIT_EXCEEDED') {
          setProjectLimit(result.limits?.maxProjects || 3);
          setShowUpgradeModal(true);
          setIsCreating(false);
          setCreationTask(null);
          liveActivityService.endPreviewActivity().catch(() => {});
          return;
        }
        throw new Error(result.error || 'Failed to start project creation');
      }

      const taskId = result.taskId;
      let errorCount = 0;
      const maxErrors = 5;

      // Clear any existing polling interval
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }

      // 2. Poll Status
      pollIntervalRef.current = setInterval(async () => {
        try {
          const pollAuthHeaders = await getAuthHeaders();
          const statusRes = await fetch(`${apiUrl}/workstation/create-status/${taskId}`, {
            headers: pollAuthHeaders,
          });

          // Stop polling on 404 (task doesn't exist)
          if (statusRes.status === 404) {
            console.warn('⚠️ [CreateProject] Task not found (404), stopping poll');
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setIsCreating(false);
            setCreationTask(null);
            return;
          }

          const statusData = await statusRes.json();

          // Reset error count on successful response
          errorCount = 0;

          if (statusData.success && statusData.task) {
            const task = statusData.task;

            setCreationTask({
              status: task.status,
              progress: task.progress,
              message: task.message,
              step: task.step
            });

            // Update Live Activity (Dynamic Island)
            if (task.status === 'running') {
              liveActivityService.updatePreviewActivity({
                remainingSeconds: Math.max(0, Math.round(120 * (1 - (task.progress || 0) / 100))),
                currentStep: task.step || task.message || 'Creazione...',
                progress: (task.progress || 0) / 100,
              }).catch(() => {});
            }

            if (task.status === 'completed') {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }

              // Log what we received from backend

              // Success!
              const workstation = {
                id: task.result.projectId,
                projectId: task.result.projectId,
                name: task.result.projectName,
                language: task.result.technology,
                technology: task.result.technology,
                templateDescription: task.result.templateDescription,
                status: 'ready' as const,
                createdAt: new Date(),
                files: task.result.files || [],
                folderId: null,
              };

              // End Live Activity with success + notification
              const pName = task.result.projectName || projectName.trim();
              if (liveActivityService.isActivityActive()) {
                liveActivityService.endWithSuccess(pName, 'Creato!').catch(() => {});
              }
              liveActivityService.sendNotification(
                'Progetto creato!',
                `${pName} e' pronto`
              ).catch(() => {});

              // Short delay to show 100%
              setTimeout(() => {
                setIsCreating(false);
                setCreationTask(null);
                onCreate(workstation);
              }, 800);

            } else if (task.status === 'failed') {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              // End Live Activity on failure
              liveActivityService.endPreviewActivity().catch(() => {});
              throw new Error(task.error || 'Creation failed');
            }
          }
        } catch (pollError) {
          console.error('Polling error:', pollError);
          errorCount++;

          // Stop polling after too many consecutive errors
          if (errorCount >= maxErrors) {
            console.error('❌ [CreateProject] Too many polling errors, stopping');
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setIsCreating(false);
            setCreationTask(null);
            liveActivityService.endPreviewActivity().catch(() => {});
            Alert.alert('Errore', 'Connessione persa durante la creazione. Riprova.');
          }
        }
      }, 1000);

    } catch (error) {
      console.error('Error creating project:', error);
      liveActivityService.endPreviewActivity().catch(() => {});
      Alert.alert('Errore', 'Impossibile creare il progetto. Riprova.');
      setIsCreating(false);
      setCreationTask(null);
    }
  };

  const selectedLang = languages.find(l => l.id === selectedLanguage);
  // Step 1: Name + Desc, Step 2: Tech, Step 3: Review
  const canProceed = step === 1 ? (projectName.trim().length > 0 && description.trim().length > 0)
    : step === 2 ? selectedLanguage !== ''
      : true;

  const progressWidth = progressAnim.interpolate({
    inputRange: [1, 2, 3],
    outputRange: ['33%', '66%', '100%'],
  });

  const renderStep1 = () => (
    <Animated.View
      style={[
        styles.stepContent,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
      ]}
    >
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>{t('create.title')}</Text>
        <Text style={styles.stepSubtitle}>{t('create.subtitle')}</Text>
      </View>

      <View style={styles.inputSection}>
        {isLiquidGlassSupported ? (
          <LiquidGlassView
            style={[
              styles.inputContainer,
              inputFocused && styles.inputContainerFocused,
              { backgroundColor: 'transparent', overflow: 'hidden', paddingHorizontal: 0 }
            ]}
            interactive={true}
            effect="clear"
            colorScheme="dark"
          >
            <Pressable
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 }}
              onPress={() => inputRef.current?.focus()}
            >
              <Ionicons
                name="cube-outline"
                size={22}
                color={inputFocused ? AppColors.primary : 'rgba(255,255,255,0.4)'}
                style={styles.inputIcon}
              />
              <TextInput
                ref={inputRef}
                style={styles.textInput}
                placeholder={t('create.namePlaceholder')}
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={projectName}
                onChangeText={setProjectName}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                keyboardAppearance="dark"
              />
              {projectName.length > 0 && (
                <TouchableOpacity onPress={() => setProjectName('')} style={styles.clearBtn}>
                  <View style={styles.clearBtnInner}>
                    <Ionicons name="close" size={12} color="#fff" />
                  </View>
                </TouchableOpacity>
              )}
            </Pressable>
          </LiquidGlassView>
        ) : (
          <Pressable
            style={[styles.inputContainer, inputFocused && styles.inputContainerFocused]}
            onPress={() => inputRef.current?.focus()}
          >
            <Ionicons
              name="cube-outline"
              size={22}
              color={inputFocused ? AppColors.primary : 'rgba(255,255,255,0.4)'}
              style={styles.inputIcon}
            />
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              placeholder={t('create.namePlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={projectName}
              onChangeText={setProjectName}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              keyboardAppearance="dark"
            />
            {projectName.length > 0 && (
              <TouchableOpacity onPress={() => setProjectName('')} style={styles.clearBtn}>
                <View style={styles.clearBtnInner}>
                  <Ionicons name="close" size={12} color="#fff" />
                </View>
              </TouchableOpacity>
            )}
          </Pressable>
        )}
      </View>

      <View style={styles.inputSection}>
        <DescriptionInput
          value={description}
          onChangeText={setDescription}
          placeholder={t('create.descriptionPlaceholder')}
        />
      </View>
    </Animated.View>
  );

  const renderStep2 = () => (
    <Animated.View
      style={[
        styles.stepContent,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
      ]}
    >
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>{t('create.recommendedTech')}</Text>
        <Text style={styles.stepSubtitle}>{t('create.aiSuggests')}</Text>
      </View>

      <View style={styles.languagesGrid}>
        {languages.map((lang) => {
          const isSelected = selectedLanguage === lang.id;
          return (
            <TouchableOpacity
              key={lang.id}
              style={[
                styles.langCard,
                isSelected && { borderColor: lang.color, backgroundColor: 'rgba(255,255,255,0.08)' }
              ]}
              onPress={() => setSelectedLanguage(lang.id)}
              activeOpacity={0.7}
            >
              <View style={styles.langCardInner}>
                <View style={styles.langIconBox}>
                  <Ionicons name={lang.icon as any} size={28} color={lang.color} />
                </View>
                <Text style={[styles.langName, isSelected && { color: '#fff', fontWeight: '700' }]}>
                  {lang.name}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.comingSoonBanner}>
        <Ionicons name="construct-outline" size={16} color="rgba(255,255,255,0.4)" />
        <Text style={styles.comingSoonText}>
          Altri linguaggi in arrivo
        </Text>
      </View>
    </Animated.View>
  );

  const renderStep3 = () => (
    <Animated.View
      style={[
        styles.stepContent,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
      ]}
    >
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>{t('create.allSet')}</Text>
        <Text style={styles.stepSubtitle}>{t('create.verifyDetails')}</Text>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryIconBox}>
            <Ionicons name="folder-outline" size={24} color="#fff" />
          </View>
          <View style={styles.summaryInfo}>
            <Text style={styles.summaryLabel}>{t('create.projectName')}</Text>
            <Text style={styles.summaryValue}>{projectName}</Text>
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={() => setStep(1)}>
            <Ionicons name="create-outline" size={20} color={AppColors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryRow}>
          <View style={styles.summaryIconBox}>
            <Ionicons name="document-text-outline" size={24} color="#fff" />
          </View>
          <View style={styles.summaryInfo}>
            <Text style={styles.summaryLabel}>{t('create.description')}</Text>
            <Text style={styles.summaryValue} numberOfLines={2}>{description}</Text>
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={() => setStep(1)}>
            <Ionicons name="create-outline" size={20} color={AppColors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryRow}>
          <View style={styles.summaryIconBox}>
            <Ionicons name={selectedLang?.icon as any} size={24} color={selectedLang?.color} />
          </View>
          <View style={styles.summaryInfo}>
            <Text style={styles.summaryLabel}>{t('create.technology')}</Text>
            <Text style={[styles.summaryValue, { color: selectedLang?.color }]}>{selectedLang?.name}</Text>
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={() => setStep(2)}>
            <Ionicons name="create-outline" size={20} color={AppColors.primary} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.readyBanner}>
        <Text style={styles.readyText}>
          {t('create.allCorrect')} <Text style={styles.readyHighlight}>{t('create.createButton')}</Text> {t('create.toStart')}
        </Text>
      </View>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      {/* Background */}
      <LinearGradient
        colors={['#0A0A0F', '#0D0B14', '#0A0A0F']}
        style={StyleSheet.absoluteFill}
      />

      {/* Decorative elements */}
      <View style={styles.orbTop} />
      <View style={styles.orbBottom} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name={step === 1 ? "close" : "chevron-back"} size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('create.title')}</Text>
        </View>

        <View style={{ width: 44 }} />
      </View>

      {/* Progress bar */}
      {/* Segmented Progress Bar */}
      <View style={styles.segmentContainer}>
        {[1, 2, 3].map((s) => {
          const isActive = s <= step;
          const isCurrent = s === step;
          const isCompleted = s < step;

          return (
            <View
              key={s}
              style={[
                styles.segment,
                { backgroundColor: 'rgba(255,255,255,0.1)' }
              ]}
            >
              {(isActive) && (
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      width: isCurrent ? progressAnim.interpolate({
                        inputRange: [s - 1, s],
                        outputRange: ['0%', '100%'],
                        extrapolate: 'clamp'
                      }) : '100%',
                      borderRadius: 2,
                      overflow: 'hidden'
                    }
                  ]}
                >
                  <LinearGradient
                    colors={isCompleted ? [AppColors.primary, '#9333EA'] : ['#fff', '#fff']}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  />
                </Animated.View>
              )}
            </View>
          );
        })}
      </View>

      {/* Content */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
      >
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </ScrollView>

      {/* Bottom Button - Hidden visually when keyboard is visible to keep layout stable */}

      {/* Bottom Button - Hidden visually when keyboard is visible to keep layout stable */}
      <View style={[
        styles.bottomBar,
        keyboardVisible && { opacity: 0, pointerEvents: 'none' }
      ]}>
        <TouchableOpacity
          style={[styles.actionBtn, !canProceed && styles.actionBtnDisabled]}
          onPress={step === 3 ? handleCreate : handleNext}
          disabled={!canProceed || isCreating}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={canProceed ? [AppColors.primary, '#9333EA'] : ['#1A1A26', '#1A1A26']}
            style={styles.actionBtnGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {isCreating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={[styles.actionBtnText, !canProceed && styles.actionBtnTextDisabled]}>
                  {step === 3 ? t('create.createButton') : t('common:continue')}
                </Text>
                {canProceed && (
                  <View style={styles.actionBtnIconBox}>
                    <Ionicons name={step === 3 ? "checkmark" : "arrow-forward"} size={18} color="#fff" />
                  </View>
                )}
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Agent Mode Selection Modal */}
      <AgentModeModal
        visible={showModeModal}
        onClose={() => setShowModeModal(false)}
        onSelectMode={handleModeSelect}
      />

      {/* Creation Progress - Show agent progress or old progress */}
      {isCreating && useAgentSystem && isStreaming ? (
        <Modal
          visible={true}
          transparent={true}
          animationType="fade"
          statusBarTranslucent={true}
        >
          <View style={styles.progressModalContainer}>
            <View style={styles.progressModalBackdrop} />
            <View style={styles.progressModalContent}>
              <View style={styles.progressModalHeader}>
                <View style={styles.progressIconContainer}>
                  <LinearGradient
                    colors={[AppColors.primary, '#9333EA']}
                    style={styles.progressIconGradient}
                  >
                    <Ionicons name="sparkles" size={24} color="#fff" />
                  </LinearGradient>
                </View>
                <Text style={styles.progressModalTitle}>AI Agent Working</Text>
                <Text style={styles.progressModalSubtitle}>
                  Creating your project with {agentMode === 'fast' ? 'Fast Mode' : 'Planning Mode'}
                </Text>
              </View>
              <AgentProgress
                events={agentEvents}
                status={agentStatus}
                currentTool={agentCurrentTool}
              />
            </View>
          </View>
        </Modal>
      ) : (
        <CreationProgressModal
          visible={isCreating}
          progress={creationTask?.progress || 0}
          status={creationTask?.message || 'Preparing...'}
          step={creationTask?.step}
        />
      )}
      {/* Upgrade Overlay (absolute positioned, no native Modal) */}
      {showUpgradeModal && (
        <View style={styles.upgradeOverlay}>
          <View style={styles.upgradeModalOverlay}>
            <View style={styles.upgradeModalCard}>
              <LinearGradient
                colors={['rgba(139, 92, 246, 0.15)', 'rgba(59, 130, 246, 0.05)', 'transparent']}
                style={styles.upgradeModalGlow}
              />
              <View style={styles.upgradeIconWrapper}>
                <LinearGradient
                  colors={[AppColors.primary, '#9333EA', '#6366F1']}
                  style={styles.upgradeIconGradient}
                >
                  <Ionicons name="rocket" size={32} color="#fff" />
                </LinearGradient>
              </View>
              <Text style={styles.upgradeTitle}>{t('limit.reached')}</Text>
              <Text style={styles.upgradeSubtitle}>
                {t('limit.maxProjects', { count: projectLimit })}{'\n'}
                {t('limit.upgradeTo', { plan: 'Go' })} {t('limit.upgradeToCreate')}
              </Text>
              <View style={styles.upgradeFeatures}>
                {[
                  { icon: 'folder-open', text: t('limit.features.projects') },
                  { icon: 'eye', text: t('limit.features.previews') },
                  { icon: 'sparkles', text: t('limit.features.budget') },
                ].map((f, i) => (
                  <View key={i} style={styles.upgradeFeatureRow}>
                    <LinearGradient
                      colors={[AppColors.primary, '#9333EA']}
                      style={styles.upgradeFeatureIcon}
                    >
                      <Ionicons name={f.icon as any} size={14} color="#fff" />
                    </LinearGradient>
                    <Text style={styles.upgradeFeatureText}>{f.text}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                style={styles.upgradeCta}
                activeOpacity={0.85}
                onPress={() => {
                  setShowUpgradeModal(false);
                  if (onOpenPlans) {
                    onOpenPlans();
                  } else {
                    onBack();
                  }
                }}
              >
                <LinearGradient
                  colors={[AppColors.primary, '#9333EA']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.upgradeCtaGradient}
                >
                  <Ionicons name="arrow-up-circle" size={20} color="#fff" />
                  <Text style={styles.upgradeCtaText}>{t('limit.upgradeTo', { plan: 'Go' })}</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.upgradeDismiss}
                onPress={() => setShowUpgradeModal(false)}
              >
                <Text style={styles.upgradeDismissText}>{t('limit.notNow')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View >
  );
};

const CARD_WIDTH = (SCREEN_WIDTH - 48 - 16) / 3;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  // Decorative
  orbTop: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
  },
  orbBottom: {
    position: 'absolute',
    bottom: 50,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(59, 130, 246, 0.04)',
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 52, // Reduced from 60
    paddingBottom: 12, // Reduced from 20
  },
  backBtn: {
    width: 40, // Slightly smaller
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  // Segmented Progress
  segmentContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 6,
    marginBottom: 8,
    height: 4,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  // Content
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16, // Reduced from 24
    paddingBottom: 100,
  },
  stepContent: {
    flex: 1,
  },
  stepHeader: {
    alignItems: 'center',
    marginBottom: 24, // Reduced from 40
  },
  stepBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  stepBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: AppColors.primary,
    letterSpacing: 1,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  stepSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: '90%',
  },
  // Step 1 - Input
  inputSection: {
    marginBottom: 32,
  },
  // Removed inputWrapper, inputGradient
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 32,
    paddingHorizontal: 20,
    height: 64,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  inputContainerFocused: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: AppColors.primary,
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  inputIcon: {
    marginRight: 16,
  },
  textInput: {
    flex: 1,
    fontSize: 20,
    color: '#fff',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  clearBtn: {
    padding: 6,
  },
  clearBtnInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  previewText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  previewName: {
    color: '#10B981',
    fontWeight: '700',
  },
  // Suggestions
  suggestionsSection: {
    marginTop: 4,
  },
  suggestionsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    marginLeft: 4,
  },
  suggestionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  suggestionChipActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderColor: AppColors.primary,
  },
  suggestionChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  suggestionChipTextActive: {
    color: '#fff',
  },
  // Step 2 - Languages
  selectedBanner: {
    marginBottom: 24,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  selectedBannerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  selectedBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedBannerText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  languagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  langCard: {
    width: SCREEN_WIDTH / 2 - 30,
    height: 110,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 18,
  },
  langCardSelected: {
    // Handled inline for dynamic color
  },
  langCardInner: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  langIconBox: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    marginBottom: 8,
  },
  langName: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  langNameSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  comingSoonBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  comingSoonText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  // Step 3 - Summary
  summaryCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 24,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  summaryIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryInfo: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 20,
    marginLeft: 64, // Align with text
  },
  editBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyBanner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: 10,
  },
  readyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 20,
  },
  readyHighlight: {
    color: '#10B981',
    fontWeight: '700',
  },
  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    bottom: 30, // Floating
    left: 20,
    right: 20,
  },
  actionBtn: {
    height: 56,
    borderRadius: 28, // Pill
    overflow: 'hidden',
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  actionBtnDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  actionBtnGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  actionBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  actionBtnTextDisabled: {
    color: 'rgba(255,255,255,0.3)',
  },
  actionBtnIconBox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textAreaContainer: {
    height: 160,
    alignItems: 'flex-start',
    paddingTop: 20,
    borderRadius: 24,
  },
  textArea: {
    height: '100%',
    lineHeight: 24,
  },
  hintText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginLeft: 12,
    fontStyle: 'italic',
  },
  // Agent Progress Modal
  progressModalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },
  progressModalContent: {
    width: SCREEN_WIDTH * 0.9,
    maxWidth: 500,
    backgroundColor: '#13131F',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  progressModalHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  progressIconContainer: {
    marginBottom: 16,
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  progressIconGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  progressModalSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },

  // Upgrade Overlay (absolute fullscreen)
  upgradeOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  // Upgrade Modal
  upgradeModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  upgradeModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1A1A2E',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    overflow: 'hidden',
  },
  upgradeModalGlow: {
    position: 'absolute',
    top: -60,
    left: -60,
    right: -60,
    height: 200,
    borderRadius: 100,
  },
  upgradeIconWrapper: {
    marginBottom: 20,
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  upgradeIconGradient: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  upgradeTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 10,
  },
  upgradeSubtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  upgradeHighlight: {
    color: AppColors.primary,
    fontWeight: '700',
  },
  upgradeFeatures: {
    width: '100%',
    marginBottom: 28,
    gap: 14,
  },
  upgradeFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  upgradeFeatureIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  upgradeFeatureText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '500',
  },
  upgradeCta: {
    width: '100%',
    marginBottom: 14,
  },
  upgradeCtaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  upgradeCtaText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  upgradeDismiss: {
    paddingVertical: 8,
  },
  upgradeDismissText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.4)',
  },
});
