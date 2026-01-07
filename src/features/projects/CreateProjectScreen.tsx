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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../shared/theme/colors';
import { workstationService } from '../../core/workstation/workstationService-firebase';
import { useAuthStore } from '../../core/auth/authStore';
import { CreationProgressModal } from '../../shared/components/molecules/CreationProgressModal';
import { DescriptionInput } from './DescriptionInput';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  onBack: () => void;
  onCreate: (projectData: any) => void;
}

const languages = [
  { id: 'javascript', name: 'JavaScript', icon: 'logo-javascript', color: '#F7DF1E' },
  { id: 'typescript', name: 'TypeScript', icon: 'logo-javascript', color: '#3178C6' },
  { id: 'python', name: 'Python', icon: 'logo-python', color: '#3776AB' },
  { id: 'react', name: 'React', icon: 'logo-react', color: '#61DAFB' },
  { id: 'node', name: 'Node.js', icon: 'logo-nodejs', color: '#68A063' },
  { id: 'cpp', name: 'C++', icon: 'code-slash', color: '#00599C' },
  { id: 'java', name: 'Java', icon: 'cafe-outline', color: '#ED8B00' },
  { id: 'swift', name: 'Swift', icon: 'logo-apple', color: '#FA7343' },
  { id: 'kotlin', name: 'Kotlin', icon: 'logo-android', color: '#7F52FF' },
  { id: 'go', name: 'Go', icon: 'code-slash', color: '#00ADD8' },
  { id: 'rust', name: 'Rust', icon: 'code-slash', color: '#CE422B' },
  { id: 'html', name: 'HTML/CSS', icon: 'logo-html5', color: '#E34F26' },
];

export const CreateProjectScreen = ({ onBack, onCreate }: Props) => {
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

  const handleNext = () => {
    if (step === 1) {
      if (!projectName.trim()) {
        Alert.alert('Attenzione', 'Inserisci un nome per il progetto');
        return;
      }
      // Don't use LayoutAnimation when going to step 2 (causes focus issues with TextInput)
      setStep(2);
    } else if (step === 2) {
      if (!description.trim()) {
        Alert.alert('Attenzione', 'Inserisci una descrizione per l\'applicazione');
        return;
      }
      Keyboard.dismiss();

      // AI Analysis
      analyzeRequirements();
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setStep(3);
    } else if (step === 3) {
      if (!selectedLanguage) {
        Alert.alert('Attenzione', 'Seleziona un linguaggio');
        return;
      }
      Keyboard.dismiss();
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setStep(4);
    }
  };

  const analyzeRequirements = async () => {
    try {
      // Don't re-analyze if we already have a selection or if description hasn't changed enough?
      // For now, always analyze to give fresh recommendation

      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/ai/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      onBack();
    }
  };

  const handleCreate = async () => {
    Keyboard.dismiss();
    setIsCreating(true);
    setCreationTask({ status: 'running', progress: 0, message: 'Starting...', step: 'Initializing' });

    try {
      const userId = useAuthStore.getState().user?.uid;
      if (!userId) {
        Alert.alert('Errore', 'Devi essere loggato per creare un progetto');
        setIsCreating(false);
        setCreationTask(null);
        return;
      }

      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

      // 1. Start Task
      const response = await fetch(`${apiUrl}/workstation/create-with-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: projectName.trim(),
          technology: selectedLanguage,
          description: description.trim(),
          userId,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to start project creation');
      }

      console.log('✅ Task started:', result.taskId);
      const taskId = result.taskId;

      // 2. Poll Status
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`${apiUrl}/workstation/create-status/${taskId}`);
          const statusData = await statusRes.json();

          if (statusData.success && statusData.task) {
            const task = statusData.task;
            console.log('📊 Task Status:', task.progress, task.message);

            setCreationTask({
              status: task.status,
              progress: task.progress,
              message: task.message,
              step: task.step
            });

            if (task.status === 'completed') {
              clearInterval(pollInterval);

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
                files: [], // Files are saved in backend, potentially we could fetch them or just let the view handling do it
                folderId: null,
              };

              // Short delay to show 100%
              setTimeout(() => {
                setIsCreating(false);
                setCreationTask(null);
                onCreate(workstation);
              }, 800);

            } else if (task.status === 'failed') {
              clearInterval(pollInterval);
              throw new Error(task.error || 'Creation failed');
            }
          }
        } catch (pollError) {
          console.error('Polling error:', pollError);
          // Don't stop polling immediately on network hiccup, but maybe limit retries?
          // For now, let it continue or user can cancel (if we add cancel button)
        }
      }, 1000);

    } catch (error) {
      console.error('Error creating project:', error);
      Alert.alert('Errore', 'Impossibile creare il progetto. Riprova.');
      setIsCreating(false);
      setCreationTask(null);
    }
  };


  const selectedLang = languages.find(l => l.id === selectedLanguage);
  // Step 1: Name, Step 2: Desc, Step 3: Tech, Step 4: Review
  const canProceed = step === 1 ? projectName.trim().length > 0
    : step === 2 ? description.trim().length > 0
      : step === 3 ? selectedLanguage !== ''
        : true;

  const progressWidth = progressAnim.interpolate({
    inputRange: [1, 2, 3, 4],
    outputRange: ['25%', '50%', '75%', '100%'],
  });

  const renderStep1 = () => (
    <Animated.View
      style={[
        styles.stepContent,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
      ]}
    >
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>Come vuoi chiamarlo?</Text>
        <Text style={styles.stepSubtitle}>Scegli un nome memorabile per il tuo progetto</Text>
      </View>

      <View style={styles.inputSection}>
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
            placeholder="Nome del progetto"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={projectName}
            onChangeText={setProjectName}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => {
              Keyboard.dismiss();
              if (projectName.trim()) handleNext();
            }}
          />
          {projectName.length > 0 && (
            <TouchableOpacity onPress={() => setProjectName('')} style={styles.clearBtn}>
              <View style={styles.clearBtnInner}>
                <Ionicons name="close" size={12} color="#fff" />
              </View>
            </TouchableOpacity>
          )}
        </Pressable>

        {projectName.length > 0 && (
          <View style={styles.previewRow}>
            <Ionicons name="checkmark-circle" size={16} color="#10B981" />
            <Text style={styles.previewText}>
              Il progetto si chiamerà <Text style={styles.previewName}>"{projectName}"</Text>
            </Text>
          </View>
        )}
      </View>

      <View style={styles.suggestionsSection}>
        <Text style={styles.suggestionsTitle}>Suggerimenti</Text>
        <View style={styles.suggestionChips}>
          {['my-app', 'portfolio', 'todo-list', 'api-server', 'landing-page', 'dashboard'].map((name) => (
            <TouchableOpacity
              key={name}
              style={[styles.suggestionChip, projectName === name && styles.suggestionChipActive]}
              onPress={() => setProjectName(name)}
              activeOpacity={0.7}
            >
              <Text style={[styles.suggestionChipText, projectName === name && styles.suggestionChipTextActive]}>
                {name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Animated.View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>Descrivimi l'applicazione</Text>
        <Text style={styles.stepSubtitle}>Spiega cosa vuoi che faccia questa app. L'IA la genererà per te (mobile-first).</Text>
      </View>

      <View style={styles.inputSection}>
        <DescriptionInput
          value={description}
          onChangeText={setDescription}
          placeholder="Es. Una landing page per vendere scarpe, con una galleria fotografica e un modulo di contatto..."
        />
      </View>
    </View>
  );

  const renderStep3 = () => (
    <Animated.View
      style={[
        styles.stepContent,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
      ]}
    >
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>Tecnologia Consigliata</Text>
        <Text style={styles.stepSubtitle}>L'IA suggerisce lo stack migliore per la tua idea</Text>
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
    </Animated.View>
  );

  const renderStep4 = () => (
    <Animated.View
      style={[
        styles.stepContent,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
      ]}
    >
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>Tutto pronto!</Text>
        <Text style={styles.stepSubtitle}>Verifica i dettagli prima di creare</Text>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryIconBox}>
            <Ionicons name="folder-outline" size={24} color="#fff" />
          </View>
          <View style={styles.summaryInfo}>
            <Text style={styles.summaryLabel}>Nome Progetto</Text>
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
            <Text style={styles.summaryLabel}>Descrizione</Text>
            <Text style={styles.summaryValue} numberOfLines={2}>{description}</Text>
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={() => setStep(2)}>
            <Ionicons name="create-outline" size={20} color={AppColors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryRow}>
          <View style={styles.summaryIconBox}>
            <Ionicons name={selectedLang?.icon as any} size={24} color={selectedLang?.color} />
          </View>
          <View style={styles.summaryInfo}>
            <Text style={styles.summaryLabel}>Tecnologia</Text>
            <Text style={[styles.summaryValue, { color: selectedLang?.color }]}>{selectedLang?.name}</Text>
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={() => setStep(3)}>
            <Ionicons name="create-outline" size={20} color={AppColors.primary} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.readyBanner}>
        <Text style={styles.readyText}>
          Tutto corretto? Clicca <Text style={styles.readyHighlight}>Crea Progetto</Text> per iniziare.
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
          <Text style={styles.headerTitle}>Nuovo Progetto</Text>
        </View>

        <View style={{ width: 44 }} />
      </View>

      {/* Progress bar */}
      {/* Segmented Progress Bar */}
      <View style={styles.segmentContainer}>
        {[1, 2, 3, 4].map((s) => {
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
        {step === 4 && renderStep4()}
      </ScrollView>

      {/* Bottom Button - Hidden visually when keyboard is visible to keep layout stable */}

      {/* Bottom Button - Hidden visually when keyboard is visible to keep layout stable */}
      <View style={[
        styles.bottomBar,
        keyboardVisible && { opacity: 0, pointerEvents: 'none' }
      ]}>
        <TouchableOpacity
          style={[styles.actionBtn, !canProceed && styles.actionBtnDisabled]}
          onPress={step === 4 ? handleCreate : handleNext}
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
                  {step === 4 ? 'Crea Progetto' : 'Continua'}
                </Text>
                {canProceed && (
                  <View style={styles.actionBtnIconBox}>
                    <Ionicons name={step === 4 ? "checkmark" : "arrow-forward"} size={18} color="#fff" />
                  </View>
                )}
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <CreationProgressModal
        visible={isCreating}
        progress={creationTask?.progress || 0}
        status={creationTask?.message || 'Preparing...'}
        step={creationTask?.step}
      />
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
  // Step 3 - Summary
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
  }
});
