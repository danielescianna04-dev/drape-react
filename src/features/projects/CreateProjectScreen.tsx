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
  AppState,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppColors } from '../../shared/theme/colors';
import { useAuthStore } from '../../core/auth/authStore';
import { useWorkstationStore } from '../../core/terminal/workstationStore';
import { CreationProgressModal } from '../../shared/components/molecules/CreationProgressModal';
// DescriptionInput no longer used — step 1 uses inline textarea
import { liveActivityService } from '../../core/services/liveActivityService';
// Safe import — native module may not be compiled in (e.g. simulator without rebuild)
let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: (event: string, cb: (e: any) => void) => void = () => {};
try {
  const mod = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = mod.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = mod.useSpeechRecognitionEvent;
} catch {
  // Native module not available — speech recognition disabled
}
import * as Haptics from 'expo-haptics';
import { tracciaProgettoCreato, tracciaErrore, tracciaSchermata, tracciaOnboardingIdeaChip, tracciaErroreCreazioneProgetto, tracciaNavigazioneIndietro, tracciaContinuaPremuto, tracciaLinguaggioSelezionato, tracciaNomeProgetto, tracciaGenerazioneAvviata, tracciaEntrataNelProgetto, tracciaTemplateCancellato, tracciaCloudMode, tracciaDescrizionePersonalizzata } from '../../core/services/analyticsService';
import { useAgentStream, AgentMode } from '../../core/ai/useAgentStream';
import { useAgentStore } from '../../core/ai/agentStore';
import { AgentModeModal } from '../../shared/components/molecules/AgentModeModal';
import { config } from '../../config/config';
import { getAuthHeaders } from '../../core/api/getAuthToken';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

interface Props {
  onBack: () => void;
  onCreate: (projectData: any) => void;
  onOpenPlans?: () => void;
  hideBack?: boolean;
  /** Number of steps already completed before this screen (shifts progress bar) */
  progressOffset?: number;
  /** Total number of steps including this screen's 3 steps */
  progressTotal?: number;
}

const languages = [
  { id: 'react', name: 'React', icon: 'logo-react', color: '#61DAFB' },
  { id: 'nextjs', name: 'Next.js', icon: 'server-outline', color: '#FFFFFF' },
  { id: 'vue', name: 'Vue', icon: 'logo-vue', color: '#4FC08D' },
  { id: 'astro', name: 'Astro', icon: 'planet-outline', color: '#BC52EE' },
  { id: 'html', name: 'HTML/CSS/JS', icon: 'logo-html5', color: '#E34F26' },
  { id: 'expo', name: 'React Native', icon: 'phone-portrait-outline', color: '#61DAFB' },
];

const languageCategories = [
  { id: 'all', labelKey: '', items: ['react', 'nextjs', 'html', 'vue', 'astro', 'expo'] },
];

const PROJECT_CREATION_MODEL = 'claude-4-7-opus';
const PROJECT_CREATION_THINKING_LEVEL = 'medium';

const ideaChips = [
  { id: 'ai-chat', label: 'AI chat', icon: 'chatbubble-ellipses' as const, prompt: 'An AI chatbot with a clean conversational interface, message history, typing indicators, and the ability to switch between different AI personas. Include a sidebar for past conversations and a settings panel.' },
  { id: 'mood-tracker', label: 'Mood Tracker', icon: 'heart' as const, prompt: 'A mood tracking app where users log their daily mood with emoji selections, add notes, and view trends over time with beautiful charts. Include streak tracking, weekly summaries, and a calm, minimal design.' },
  { id: 'social-app', label: 'Social app', icon: 'people' as const, prompt: 'A social media platform with user profiles, a feed of posts with images, likes and comments, a stories feature at the top, and a discover page. Clean modern design with smooth animations.' },
  { id: 'landing', label: 'Landing page', icon: 'globe-outline' as const, prompt: 'A modern landing page for a SaaS product with a hero section, feature highlights with icons, pricing table with 3 tiers, testimonials carousel, FAQ accordion, and a footer with newsletter signup.' },
  { id: 'ecommerce', label: 'E-commerce', icon: 'cart' as const, prompt: 'An online store with a product grid, filters by category and price, product detail pages with image gallery, shopping cart with quantity controls, and a clean checkout flow. Include a search bar and wishlist.' },
  { id: 'portfolio', label: 'Portfolio', icon: 'briefcase' as const, prompt: 'A personal portfolio website with an about section, project showcase with cards and live demos, skills visualization, work experience timeline, contact form, and links to GitHub and LinkedIn. Minimal and elegant design.' },
];

const FaqItem = ({ item, isExpanded, onToggle, isLast }: { item: { question: string; answer: string }; isExpanded: boolean; onToggle: () => void; isLast: boolean }) => {
  const animValue = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: isExpanded ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [isExpanded]);

  const maxH = animValue.interpolate({ inputRange: [0, 1], outputRange: [0, 150] });
  const opac = animValue.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0, 1] });

  return (
    <View>
      <TouchableOpacity style={faqStyles.row} activeOpacity={0.7} onPress={onToggle}>
        <Text style={faqStyles.question}>{item.question}</Text>
        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color="rgba(255,255,255,0.4)" />
      </TouchableOpacity>
      <Animated.View style={{ maxHeight: maxH, opacity: opac, overflow: 'hidden' }}>
        <Text style={faqStyles.answer}>{item.answer}</Text>
      </Animated.View>
      {!isLast && <View style={faqStyles.divider} />}
    </View>
  );
};

const faqStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 },
  question: { fontSize: 16, fontWeight: '700', color: '#fff', flex: 1, marginRight: 12 },
  answer: { fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 21, paddingBottom: 16 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.1)' },
});

const AGENT_DISCOVERY_TOOLS = new Set([
  'read_file',
  'list_directory',
  'glob_search',
  'grep_search',
  'web_search',
  'web_fetch',
]);

const AGENT_EDIT_TOOLS = new Set([
  'edit_file',
  'multi_edit_file',
  'patch_file',
]);

const AGENT_COMMAND_TOOLS = new Set([
  'run_command',
  'execute_command',
]);

const estimateAgentCreationProgress = (
  events: Array<{ type: string; tool?: string; input?: any }> | undefined,
  status: 'idle' | 'running' | 'complete' | 'error',
  isStreaming: boolean
): number => {
  if (status === 'complete' || events?.some((event) => event.type === 'complete' || event.type === 'done')) {
    return 100;
  }

  if (!isStreaming || !events || events.length === 0) {
    return isStreaming ? 4 : 0;
  }

  const discoveryTargets = new Set<string>();
  const writtenFiles = new Set<string>();
  let editCount = 0;
  let commandCount = 0;
  let sawPlanReady = false;
  let sawSignalCompletion = false;

  for (const event of events) {
    if (event.type === 'plan_ready') {
      sawPlanReady = true;
      continue;
    }

    if (event.type !== 'tool_start' && event.type !== 'tool_complete') {
      continue;
    }

    const tool = event.tool || '';
    if (!tool) {
      continue;
    }

    if (tool === 'signal_completion') {
      sawSignalCompletion = true;
      continue;
    }

    if (event.type === 'tool_complete') {
      if (AGENT_DISCOVERY_TOOLS.has(tool)) {
        const rawTarget =
          event.input?.file_path ||
          event.input?.path ||
          event.input?.pattern ||
          event.input?.url ||
          event.input?.command ||
          `${tool}:${discoveryTargets.size}`;
        discoveryTargets.add(String(rawTarget));
      }

      if (tool === 'write_file') {
        const filePath = event.input?.file_path || event.input?.path || `write:${writtenFiles.size}`;
        writtenFiles.add(String(filePath));
      } else if (AGENT_EDIT_TOOLS.has(tool)) {
        editCount += 1;
      } else if (AGENT_COMMAND_TOOLS.has(tool)) {
        commandCount += 1;
      }
    }
  }

  const discoveryProgress = Math.min(14, discoveryTargets.size * 2 + (sawPlanReady ? 4 : 0));
  const writingProgress = Math.min(36, writtenFiles.size * 4.5);
  const refinementProgress = Math.min(14, editCount * 1.5 + commandCount * 2);

  let estimated = 6 + discoveryProgress + writingProgress + refinementProgress;

  if (writtenFiles.size >= 4) {
    estimated = Math.max(estimated, 46);
  }

  if (writtenFiles.size >= 6) {
    estimated = Math.max(estimated, 56);
  }

  if (commandCount > 0 && writtenFiles.size >= 5) {
    estimated = Math.max(estimated, 64);
  }

  if (sawSignalCompletion) {
    estimated = Math.max(estimated, 74);
  }

  const ceiling = sawSignalCompletion
    ? 78
    : commandCount > 0
      ? 70
      : writtenFiles.size >= 5
        ? 64
        : 58;

  return Math.min(Math.round(estimated), ceiling);
};

const humanizeCreationTool = (tool: string | null | undefined, lang: 'it' | 'en'): string => {
  const toolName = String(tool || '').trim();
  if (!toolName) {
    return lang === 'it' ? 'Sto preparando il progetto...' : 'Preparing the project...';
  }

  const labels: Record<string, { it: string; en: string }> = {
    read_file: { it: 'Sto leggendo il progetto base...', en: 'Reading the starter project...' },
    list_directory: { it: 'Sto esplorando la struttura...', en: 'Exploring the project structure...' },
    glob_search: { it: 'Sto cercando i file giusti...', en: 'Finding the right files...' },
    grep_search: { it: 'Sto cercando nel codice...', en: 'Searching through the code...' },
    write_file: { it: 'Sto creando i file del progetto...', en: 'Creating the project files...' },
    edit_file: { it: 'Sto rifinendo il codice...', en: 'Refining the code...' },
    multi_edit_file: { it: 'Sto applicando le ultime modifiche...', en: 'Applying the final edits...' },
    patch_file: { it: 'Sto sistemando alcuni dettagli...', en: 'Fixing a few details...' },
    run_command: { it: 'Sto eseguendo i controlli...', en: 'Running the checks...' },
    execute_command: { it: 'Sto eseguendo i controlli...', en: 'Running the checks...' },
    signal_completion: { it: 'Sto passando alla verifica finale...', en: 'Handing off to final verification...' },
  };

  const exact = labels[toolName];
  if (exact) return exact[lang];

  const normalized = toolName.replace(/_/g, ' ');
  return lang === 'it'
    ? `Sto eseguendo ${normalized}...`
    : `Running ${normalized}...`;
};

const deriveAgentCreationTask = (
  events: Array<{ type: string; tool?: string; message?: string; error?: string; [key: string]: any }> | undefined,
  status: 'idle' | 'running' | 'complete' | 'error',
  isStreaming: boolean,
  estimatedProgress: number,
  lang: 'it' | 'en',
) => {
  const latestEvents = [...(events || [])].reverse();
  const latestComplete = latestEvents.find((event) => event.type === 'complete');
  if (latestComplete) {
    return {
      status: 'completed',
      progress: 100,
      message: String(latestComplete.message || (lang === 'it' ? 'Progetto creato e verificato.' : 'Project created and verified.')),
      step: lang === 'it' ? 'Completato' : 'Completed',
    };
  }

  const latestError = latestEvents.find((event) => event.type === 'error' || event.type === 'fatal_error' || event.type === 'budget_exceeded');
  if (latestError) {
    return {
      status: 'failed',
      progress: Math.max(estimatedProgress, 12),
      message: String(latestError.error || latestError.message || (lang === 'it' ? 'Creazione interrotta.' : 'Creation stopped.')),
      step: lang === 'it' ? 'Errore' : 'Error',
    };
  }

  const latestStatus = latestEvents.find((event) => event.type === 'status' && typeof event.message === 'string' && event.message.trim().length > 0);
  if (latestStatus) {
    const phase = String(latestStatus.phase || '').toLowerCase();
    const isVerifyPhase = phase === 'verify'
      || /verif|preview|controll|runtime|route/i.test(String(latestStatus.message || ''));

    return {
      status: 'running',
      progress: Math.max(estimatedProgress, isVerifyPhase ? 84 : 10),
      message: String(latestStatus.message),
      step: isVerifyPhase
        ? (lang === 'it' ? 'Verifica' : 'Verification')
        : (lang === 'it' ? 'Generazione' : 'Generation'),
    };
  }

  const latestTool = latestEvents.find((event) => event.type === 'tool_start' && event.tool);
  if (latestTool?.tool) {
    return {
      status: 'running',
      progress: Math.max(estimatedProgress, 8),
      message: humanizeCreationTool(latestTool.tool, lang),
      step: lang === 'it' ? 'Generazione' : 'Generation',
    };
  }

  if (isStreaming || status === 'running') {
    return {
      status: 'running',
      progress: Math.max(estimatedProgress, 4),
      message: lang === 'it' ? 'Sto preparando il progetto...' : 'Preparing the project...',
      step: lang === 'it' ? 'Generazione' : 'Generation',
    };
  }

  return {
    status: status === 'error' ? 'failed' : 'idle',
    progress: Math.max(estimatedProgress, 0),
    message: lang === 'it' ? 'Sto iniziando...' : 'Getting started...',
    step: lang === 'it' ? 'Preparazione' : 'Preparing',
  };
};

export const CreateProjectScreen = ({ onBack, onCreate, onOpenPlans, hideBack, progressOffset = 0, progressTotal = 3 }: Props) => {
  const { t } = useTranslation('projects');
  const [step, setStep] = useState(1);
  const [projectName, setProjectName] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [description, setDescription] = useState('');
  const [isListening, setIsListening] = useState(false);
  const micPulse = useRef(new Animated.Value(1)).current;
  const [isCreating, setIsCreating] = useState(false);
  const [creationTask, setCreationTask] = useState<{ status: string; progress: number; message: string; step?: string } | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeTaskIdRef = useRef<string | null>(null);
  const activeChipRef = useRef<{ id: string; prompt: string } | null>(null);
  const agentProjectIdRef = useRef<string | null>(null);
  const hasTrackedCustomDesc = useRef(false);

  // Agent system state
  const [showModeModal, setShowModeModal] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentMode | null>(null);
  // DISABLED: React Native doesn't support fetch streaming (response.body.getReader())
  // TODO: Implement EventSource polyfill for SSE support
  const [useAgentSystem, setUseAgentSystem] = useState(true); // Agent system with OpenCode tool use
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showPostCreationPaywall, setShowPostCreationPaywall] = useState(false);
  const [pendingWorkstation, setPendingWorkstation] = useState<any>(null);
  const [projectLimit, setProjectLimit] = useState(2);
  const [aiRecommendedLang, setAiRecommendedLang] = useState<string | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [showAllLangs, setShowAllLangs] = useState(false);
  const [editingField, setEditingField] = useState<'name' | 'description' | null>(null);
  // AI Interview (step 3) — structured with stable IDs
  const [aiQuestions, setAiQuestions] = useState<{ questionId: string; question: string; multiSelect?: boolean; options: { optionId: string; label: string }[] }[]>([]);
  const [aiAnswers, setAiAnswers] = useState<Record<string, { selectedIds: string[]; custom: string }>>({});
  // Product contract preview
  const [contractSummary, setContractSummary] = useState<{ coreFlows: string[]; interactions: string[]; excluded: string[]; assumptions: string[] } | null>(null);
  const [contractLoading, setContractLoading] = useState(false);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState(false);
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [showCloudInfo, setShowCloudInfo] = useState(false);
  const [cloudInfoVisible, setCloudInfoVisible] = useState(false);
  const [glassReady, setGlassReady] = useState(false);
  const cloudOverlayAnim = useRef(new Animated.Value(0)).current;
  const cloudSheetAnim = useRef(new Animated.Value(600)).current;
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const creationLang: 'it' | 'en' = i18n.language?.toLowerCase().startsWith('it') ? 'it' : 'en';

  const openCloudInfo = () => {
    setCloudInfoVisible(true);
    setShowCloudInfo(true);
    Animated.parallel([
      Animated.timing(cloudOverlayAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(cloudSheetAnim, { toValue: 0, friction: 9, tension: 65, useNativeDriver: true }),
    ]).start();
  };

  const closeCloudInfo = () => {
    Animated.parallel([
      Animated.timing(cloudOverlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(cloudSheetAnim, { toValue: 600, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      setShowCloudInfo(false);
      setCloudInfoVisible(false);
      setExpandedFaq(null);
    });
  };

  const cloudFaqItems = [
    { question: t('create.cloudFaq.whatQ'), answer: t('create.cloudFaq.whatA') },
    { question: t('create.cloudFaq.whenEnableQ'), answer: t('create.cloudFaq.whenEnableA') },
    { question: t('create.cloudFaq.whenOffQ'), answer: t('create.cloudFaq.whenOffA') },
    { question: t('create.cloudFaq.laterQ'), answer: t('create.cloudFaq.laterA') },
    { question: t('create.cloudFaq.costQ'), answer: t('create.cloudFaq.costA') },
  ];

  const handleCloudToggle = () => {
    tracciaCloudMode(!cloudEnabled);
    setCloudEnabled(!cloudEnabled);
  };

  // Agent stream hook
  const {
    startStream,
    cancel: cancelStream,
    reset: resetStream,
    isStreaming,
    events: agentEvents,
    currentTool: agentCurrentTool,
    status: agentStatus,
  } = useAgentStream({
    onComplete: handleAgentComplete,
    onError: handleAgentError,
  });

  useEffect(() => {
    return () => {
      cancelStream();
    };
  }, [cancelStream]);

  // Get existing workstations to check for duplicate names
  const workstations = useWorkstationStore((state) => state.workstations);

  // Animations
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT * 0.35)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const entranceOpacity = useRef(new Animated.Value(0)).current;
  const contentBlur = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-50)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const bottomBarSlide = useRef(new Animated.Value(80)).current;
  const bottomBarOpacity = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const stepTranslateX = useRef(new Animated.Value(0)).current;
  const stepOpacity = useRef(new Animated.Value(1)).current;
  const bgAnim = useRef(new Animated.Value(0)).current; // opacity cross-fade (non-native)
  const bgMove = useRef(new Animated.Value(0)).current; // shift + scale (native)
  useEffect(() => {
    // Phase 1 (0ms): Background fades in
    Animated.timing(entranceOpacity, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();

    // Phase 2 (100ms): Content rises up with slow, cinematic spring
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 9,
          tension: 28,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 30,
          useNativeDriver: true,
        }),
        Animated.timing(contentBlur, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();
    }, 100);

    // Phase 3 (350ms): Header drops in
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(headerSlide, { toValue: 0, friction: 8, tension: 50, useNativeDriver: true }),
        Animated.timing(headerOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]).start();
    }, 350);

    // Phase 4 (500ms): Bottom bar slides up
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(bottomBarSlide, { toValue: 0, friction: 8, tension: 50, useNativeDriver: true }),
        Animated.timing(bottomBarOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }, 500);

    // Looping background drift — smooth slow movement only
    const bgMoveLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bgMove, { toValue: 1, duration: 6000, useNativeDriver: true }),
        Animated.timing(bgMove, { toValue: 0, duration: 6000, useNativeDriver: true }),
      ])
    );
    bgMoveLoop.start();

    // Cleanup on unmount
    return () => {
      bgMoveLoop.stop();
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Some large LiquidGlass surfaces initialize unreliably if mounted while the
    // whole screen is still animating with transforms. Delay only these surfaces
    // by a short amount; the entrance animation itself stays unchanged.
    setGlassReady(false);
    const timer = setTimeout(() => setGlassReady(true), 560);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Track screen view for each step (step 2 tracked after AI recommendation in analyzeRequirements)
    if (step !== 2) {
      const stepNames = ['', 'Crea Progetto - Descrivi la tua idea', '', 'Crea Progetto - Nome del progetto'];
      tracciaSchermata(stepNames[step] || 'Crea Progetto');
    }
    // Reset custom description tracking when returning to step 1
    if (step === 1) {
      hasTrackedCustomDesc.current = false;
    }

    // Animate progress bar
    Animated.timing(progressAnim, {
      toValue: step,
      duration: 300,
      useNativeDriver: false,
    }).start();

    // Ensure entrance animation is settled for step transitions
    if (step >= 2) {
      slideAnim.setValue(0);
      scaleAnim.setValue(1);
      contentBlur.setValue(1);
      entranceOpacity.setValue(1);
      headerOpacity.setValue(1);
      headerSlide.setValue(0);
      bottomBarOpacity.setValue(1);
      bottomBarSlide.setValue(0);
    }

  }, [step]);

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardVisible(true);
        setKeyboardHeight(e.endCoordinates.height);
        setTimeout(() => {
          if (step === 4) {
            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
          } else {
            scrollViewRef.current?.scrollToEnd({ animated: true });
          }
        }, 150);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
        setKeyboardHeight(0);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Keep polling alive in background with beginBackgroundTask (~30s)
  const errorCountRef = useRef(0);
  const bgTaskActiveRef = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (activeTaskIdRef.current && isCreating) {
          // Request ~30s of background execution so polling continues
          const granted = await liveActivityService.beginBackgroundTask();
          bgTaskActiveRef.current = granted;
          // Keep polling running — iOS will give us ~30s
        }
        return;
      }

      if (nextState === 'active') {
        // End background task if we had one
        if (bgTaskActiveRef.current) {
          liveActivityService.endBackgroundTask().catch(() => {});
          bgTaskActiveRef.current = false;
        }

        if (activeTaskIdRef.current && isCreating) {
          // App returned to foreground during creation - check status immediately
          errorCountRef.current = 0;
          try {
            const apiUrl = config.apiUrl;
            const authHeaders = await getAuthHeaders();
            const statusRes = await fetch(`${apiUrl}/workstation/create-status/${activeTaskIdRef.current}`, {
              headers: authHeaders,
            });
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.success && statusData.task) {
                const task = statusData.task;
                setCreationTask({
                  status: task.status,
                  progress: task.progress,
                  message: task.message,
                  step: task.step,
                });

                if (task.status === 'completed' || task.status === 'verification_failed') {
                  activeTaskIdRef.current = null;
                  const verifyFailed = task.status === 'verification_failed';

                  const workstation = {
                    id: task.result?.projectId || task.projectId,
                    projectId: task.result?.projectId || task.projectId,
                    name: task.result?.projectName || projectName.trim(),
                    language: task.result?.technology || selectedLanguage,
                    technology: task.result?.technology || selectedLanguage,
                    templateDescription: task.result?.templateDescription || '',
                    status: 'ready' as const,
                    createdAt: new Date(),
                    files: task.result?.files || [],
                    folderId: null,
                  };

                  const pName = task.result?.projectName || projectName.trim();
                  if (liveActivityService.isActivityActive()) {
                    if (verifyFailed) {
                      liveActivityService.endPreviewActivity().catch(() => {});
                    } else {
                      liveActivityService.endWithSuccess(pName, t('alerts.projectCreated')).catch(() => {});
                    }
                  }

                  setTimeout(() => {
                    setIsCreating(false);
                    setCreationTask(null);
                    tracciaEntrataNelProgetto(pName);
                    onCreate(workstation);
                  }, 500);
                  return;
                } else if (task.status === 'failed') {
                  activeTaskIdRef.current = null;
                  liveActivityService.endPreviewActivity().catch(() => {});
                  tracciaErrore(task.error || 'Creation failed', 'project_create');
                  Alert.alert(t('common:error'), task.error || t('alerts.creationFailed'));
                  setIsCreating(false);
                  setCreationTask(null);
                  return;
                }
              }
            }
          } catch (e) {
            // Ignore, will restart polling below
          }

          // Task still running - restart polling if it stopped
          if (activeTaskIdRef.current && !pollIntervalRef.current) {
            const taskId = activeTaskIdRef.current;
            const apiUrl = config.apiUrl;
            restartPolling(taskId, apiUrl);
          }
        }
      }
    });
    return () => sub.remove();
  }, [isCreating, projectName, onCreate]);

  // Agent completion callback
  async function handleAgentComplete(_result: any) {
    const pid = agentProjectIdRef.current || _result?.projectId || Date.now().toString();
    const pName = projectName.trim();
    const verificationFailed = Boolean(_result?.verificationFailed || _result?.success === false);

    // End Live Activity with an honest status
    if (liveActivityService.isActivityActive()) {
      if (verificationFailed) {
        liveActivityService.endPreviewActivity().catch(() => {});
      } else {
        liveActivityService.endWithSuccess(pName, t('alerts.projectCreated')).catch(() => {});
      }
    }
    if (!verificationFailed) {
      liveActivityService.sendNotification(
        t('alerts.projectCreated'),
        t('alerts.projectReady', { name: pName }),
        { type: 'project_created', projectId: pid }
      ).catch(() => {});
    }

    // Create workstation object using component state (not result, which may be empty)
    const workstation = {
      id: pid,
      projectId: pid,
      name: pName,
      language: selectedLanguage,
      technology: selectedLanguage,
      templateDescription: description.trim(),
      status: 'ready' as const,
      createdAt: new Date(),
      files: [],
      folderId: null,
    };

    // Save agent context (fire and forget)
    try {
      const userId = useAuthStore.getState().user?.uid;
      if (userId) {
        const apiUrl = config.apiUrl;
        const authHeaders = await getAuthHeaders();
        fetch(`${apiUrl}/agent/save-context`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ projectId: pid, userId, context: { events: agentEvents, mode: agentMode, timestamp: Date.now() } }),
        }).catch(() => {});
      }
    } catch {}

    setTimeout(async () => {
      setIsCreating(false);
      resetStream();
      agentProjectIdRef.current = null;
      // Show post-creation paywall for free users (once)
      try {
        const userPlan = useAuthStore.getState().user?.plan || 'free';
        const seenPaywall = await AsyncStorage.getItem('hasSeenPostCreationPaywall');
        if (userPlan === 'free' && !seenPaywall) {
          setPendingWorkstation(workstation);
          setShowPostCreationPaywall(true);
          await AsyncStorage.setItem('hasSeenPostCreationPaywall', 'true');
          return;
        }
      } catch {}
      tracciaEntrataNelProgetto(workstation.name);
      onCreate(workstation);
    }, 800);
  }

  // Agent error callback
  function handleAgentError(error: string) {
    console.error('[CreateProject] Agent error:', error);
    tracciaErrore(error, 'project_create_agent');
    liveActivityService.endPreviewActivity().catch((err) => console.warn('[Project] Failed to end preview activity:', err?.message || err));
    Alert.alert(t('common:error'), t('alerts.creationErrorWithMessage', { error }));
    setIsCreating(false);
    setCreationTask(null);
    agentProjectIdRef.current = null;
    resetStream();
  }

  // Reusable polling function (used by startOldCreation and AppState resume)
  const restartPolling = (taskId: string, apiUrl: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    errorCountRef.current = 0;
    const maxErrors = 10;

    pollIntervalRef.current = setInterval(async () => {
      try {
        const pollAuthHeaders = await getAuthHeaders();
        const statusRes = await fetch(`${apiUrl}/workstation/create-status/${taskId}`, {
          headers: pollAuthHeaders,
        });

        if (statusRes.status === 404) {
          console.warn('[CreateProject] Task not found (404), stopping poll');
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setIsCreating(false);
          setCreationTask(null);
          return;
        }

        const statusData = await statusRes.json();
        errorCountRef.current = 0;

        if (statusData.success && statusData.task) {
          const task = statusData.task;
          setCreationTask({
            status: task.status,
            progress: task.progress,
            message: task.message,
            step: task.step,
          });

          if (task.status === 'running') {
            liveActivityService.updatePreviewActivity({
              remainingSeconds: Math.max(0, Math.round(120 * (1 - (task.progress || 0) / 100))),
              currentStep: task.step || task.message || t('alerts.creatingProject'),
              progress: (task.progress || 0) / 100,
            }).catch(() => {});
          }

          if (task.status === 'completed' || task.status === 'verification_failed') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            activeTaskIdRef.current = null;
            const verifyFailed = task.status === 'verification_failed';

            const workstation = {
              id: task.result?.projectId || '',
              projectId: task.result?.projectId || '',
              name: task.result?.projectName || projectName.trim(),
              language: task.result?.technology || selectedLanguage,
              technology: task.result?.technology || selectedLanguage,
              templateDescription: task.result?.templateDescription || '',
              status: 'ready' as const,
              createdAt: new Date(),
              files: task.result?.files || [],
              folderId: null,
            };

            const pName = task.result?.projectName || projectName.trim();
            if (liveActivityService.isActivityActive()) {
              if (verifyFailed) {
                liveActivityService.endPreviewActivity().catch(() => {});
              } else {
                liveActivityService.endWithSuccess(pName, t('alerts.projectCreated')).catch(() => {});
              }
            }
            if (!verifyFailed) {
              liveActivityService.sendNotification(
                t('alerts.projectCreated'),
                t('alerts.projectReady', { name: pName }),
                { type: 'project_created', projectId: workstation.projectId }
              ).catch(() => {});
            }

            setTimeout(() => {
              setIsCreating(false);
              setCreationTask(null);
              tracciaEntrataNelProgetto(pName);
              onCreate(workstation);
            }, 1200);
          } else if (task.status === 'failed') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            activeTaskIdRef.current = null;
            liveActivityService.endPreviewActivity().catch(() => {});
            Alert.alert(t('common:error'), task.error || t('alerts.creationFailed'));
            setIsCreating(false);
            setCreationTask(null);
          }
        }
      } catch (pollError) {
        errorCountRef.current++;
        if (errorCountRef.current >= maxErrors) {
          console.error('[CreateProject] Too many polling errors, stopping');
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setIsCreating(false);
          setCreationTask(null);
          liveActivityService.endPreviewActivity().catch(() => {});
          tracciaErrore('Connection lost', 'project_create');
          Alert.alert(t('common:error'), t('alerts.creationConnectionLost'));
        }
      }
    }, 900);
  };

  const handleNext = () => {
    if (step === 1) {
      if (!description.trim()) {
        Alert.alert(t('common:warning'), t('create.enterDescription'));
        return;
      }

      // Project name stays empty — user fills it in step 3

      Keyboard.dismiss();
      tracciaContinuaPremuto('Descrivi la tua idea');

      // Fetch AI interview questions
      fetchAiQuestions();
      animateStepTransition(2, 'forward');
    } else if (step === 2) {
      // AI interview done — go to tech selection
      Keyboard.dismiss();
      tracciaContinuaPremuto('AI Interview');
      // AI Analysis for tech recommendation
      analyzeRequirements();
      animateStepTransition(3, 'forward');
    } else if (step === 3) {
      if (!selectedLanguage) {
        Alert.alert(t('common:warning'), t('alerts.selectLanguage'));
        return;
      }
      Keyboard.dismiss();
      tracciaContinuaPremuto('Seleziona linguaggio');
      fetchPreviewContract(); // Fetch contract summary for review step
      animateStepTransition(4, 'forward');
    }
  };

  const fetchAiQuestions = async () => {
    setQuestionsLoading(true);
    setQuestionsError(false);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${config.apiUrl}/ai/project-questions`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim(), technology: selectedLanguage, language: i18n.language }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.questions) && data.questions.length > 0) {
        // Normalize: support both old format (string[]) and new format (optionId/label)
        const normalized = data.questions.slice(0, 5).map((q: any, i: number) => ({
          questionId: q.questionId || `q${i}`,
          question: q.question,
          multiSelect: q.multiSelect ?? true,
          options: Array.isArray(q.options)
            ? q.options.map((o: any) => typeof o === 'string' ? { optionId: o, label: o } : o)
            : [],
        }));
        setAiQuestions(normalized);
        const initial: Record<string, { selectedIds: string[]; custom: string }> = {};
        normalized.forEach((q: any) => { initial[q.questionId] = { selectedIds: [], custom: '' }; });
        setAiAnswers(initial);
      } else {
        // No questions — mark error so useEffect can skip when step 2 is active
        console.warn('[AI] No questions returned');
        setQuestionsError(true);
      }
    } catch (err: any) {
      console.warn('[AI] Failed to fetch questions:', err.message);
      setQuestionsError(true);
    } finally {
      setQuestionsLoading(false);
    }
  };

  const animateStepTransition = (toStep: number, direction: 'forward' | 'back') => {
    const outX = direction === 'forward' ? -SCREEN_WIDTH : SCREEN_WIDTH;
    const inX = direction === 'forward' ? SCREEN_WIDTH : -SCREEN_WIDTH;
    // Slide out
    Animated.timing(stepTranslateX, { toValue: outX, duration: 200, useNativeDriver: true }).start(() => {
      setStep(toStep);
      stepTranslateX.setValue(inX);
      // Slide in with spring
      Animated.spring(stepTranslateX, { toValue: 0, friction: 10, tension: 80, useNativeDriver: true }).start();
    });
  };

  useEffect(() => {
    if (aiAnalyzing || questionsLoading) {
      shimmerAnim.setValue(0);
      const loop = Animated.loop(
        Animated.timing(shimmerAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      );
      loop.start();
      return () => loop.stop();
    } else {
      LayoutAnimation.configureNext(LayoutAnimation.create(400, 'easeInEaseOut', 'opacity'));
    }
  }, [aiAnalyzing, questionsLoading]);

  // Skip interview step when questions fail to load — only trigger once step 2 is active
  // to avoid race conditions with the step transition animation
  useEffect(() => {
    if (step === 2 && questionsError && !questionsLoading && aiQuestions.length === 0) {
      analyzeRequirements();
      animateStepTransition(3, 'forward');
    }
  }, [step, questionsError, questionsLoading]);

  const analyzeRequirements = async () => {
    let isMounted = true;
    setAiAnalyzing(true);

    try {
      // Don't re-analyze if we already have a selection or if description hasn't changed enough?
      // For now, always analyze to give fresh recommendation

      const apiUrl = config.apiUrl;
      const recAuthHeaders = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/ai/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...recAuthHeaders },
        body: JSON.stringify({ description: description.trim(), language: i18n.language }),
      });

      if (!isMounted) return;

      const result = await response.json();
      if (isMounted && result.success && result.recommendation) {
        // Find matching language
        const match = languages.find(l => l.id === result.recommendation);
        if (match) {
          setSelectedLanguage(match.id);
          setAiRecommendedLang(match.id);
          if (result.explanation) {
            setAiExplanation(result.explanation);
          }
          // Auto-expand if recommendation is not in Popular category
          if (!languageCategories[0].items.includes(match.id)) {
            setShowAllLangs(true);
          }
          tracciaSchermata(`Crea Progetto - Scegli il linguaggio (${match.name} consigliato)`);
        } else {
          tracciaSchermata('Crea Progetto - Scegli il linguaggio');
        }
      } else {
        if (isMounted) tracciaSchermata('Crea Progetto - Scegli il linguaggio');
      }
    } catch (error) {
      if (isMounted) {
        console.error("AI recommendation failed", error);
        tracciaSchermata('Crea Progetto - Scegli il linguaggio');
      }
      // Fail silently, let user choose
    } finally {
      if (isMounted) setAiAnalyzing(false);
    }

    return () => { isMounted = false; };
  };

  const handleBack = () => {
    if (step > 1) {
      const stepNames = ['', 'Descrivi la tua idea', 'Personalizza', 'Scegli il linguaggio', 'Nome del progetto'];
      tracciaNavigazioneIndietro(stepNames[step - 1]);
      animateStepTransition(step - 1, 'back');
    } else {
      // Clear any polling interval when leaving the screen
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      tracciaNavigazioneIndietro('Scelta Primo Progetto');
      onBack();
    }
  };

  const handleCreate = async () => {
    Keyboard.dismiss();
    tracciaNomeProgetto(projectName.trim());
    tracciaContinuaPremuto('Nome del progetto');
    tracciaGenerazioneAvviata(projectName.trim(), selectedLanguage);

    // Use agent system directly in fast mode
    if (useAgentSystem) {
      handleModeSelect('fast');
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
    setCreationTask({
      status: 'running',
      progress: 0,
      message: creationLang === 'it' ? 'Sto preparando il progetto...' : 'Preparing the project...',
      step: creationLang === 'it' ? 'Preparazione' : 'Preparing',
    });

    liveActivityService.startPreviewActivity(projectName.trim(), {
      remainingSeconds: 180,
      currentStep: t('alerts.creatingProject'),
      progress: 0,
    }, 'create').catch((err) => console.warn('[Project] Failed to start live activity:', err?.message || err));

    try {
      const userId = useAuthStore.getState().user?.uid;
      if (!userId) {
        Alert.alert(t('common:error'), t('alerts.loginRequired'));
        setIsCreating(false);
        setCreationTask(null);
        liveActivityService.endPreviewActivity().catch((err) => console.warn('[Project] Failed to end preview activity:', err?.message || err));
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
          description: getEnrichedDescription(),
          structuredAnswers: getStructuredAnswers(),
          cloudEnabled,
          userId,
          agentMode: true,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        if (result.error === 'PROJECT_LIMIT_EXCEEDED') {
          tracciaErrore('Project limit exceeded: ' + (result.limits?.maxProjects || 2), 'project_create');
          setProjectLimit(result.limits?.maxProjects || 2);
          setShowUpgradeModal(true);
          setIsCreating(false);
          setCreationTask(null);
          liveActivityService.endPreviewActivity().catch((err) => console.warn('[Project] Failed to end preview activity:', err?.message || err));
          return;
        }
        if (result.error === 'STORAGE_LIMIT_EXCEEDED') {
          tracciaErrore('Storage limit exceeded', 'project_create');
          Alert.alert(
            t('alerts.storageLimitTitle'),
            t('alerts.storageLimitMessage', {
              used: result.limits?.usedMb || 0,
              max: result.limits?.maxStorageMb || 500,
            })
          );
          setIsCreating(false);
          setCreationTask(null);
          liveActivityService.endPreviewActivity().catch((err) => console.warn('[Project] Failed to end preview activity:', err?.message || err));
          return;
        }
        throw new Error(result.error || 'Failed to start project creation');
      }

      const projectId = result.taskId || result.projectId;
      agentProjectIdRef.current = projectId;
      setCreationTask({
        status: 'running',
        progress: 6,
        message: creationLang === 'it' ? 'Sto collegando l’agente di creazione...' : 'Connecting the creation agent...',
        step: creationLang === 'it' ? 'Generazione' : 'Generation',
      });

      // Fetch optimized prompt from backend (includes system prompt, stack instructions, template files list)
      let prompt: string;
      try {
        const promptRes = await fetch(`${apiUrl}/workstation/agent-prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...modeAuthHeaders },
          body: JSON.stringify({
            projectId,
            technology: selectedLanguage,
            projectName: projectName.trim(),
            description: getEnrichedDescription(),
            cloudEnabled,
            structuredAnswers: getStructuredAnswers(),
          }),
        });
        const promptData = await promptRes.json();
        prompt = promptData.prompt || `Create a ${selectedLanguage} project named "${projectName.trim()}". Description: ${description.trim()}`;
      } catch {
        prompt = `Create a ${selectedLanguage} project named "${projectName.trim()}". Description: ${getEnrichedDescription()}`;
      }

      tracciaProgettoCreato(projectName.trim(), selectedLanguage, mode, description.trim());
      await startStream(projectId, mode, prompt, {
        model: PROJECT_CREATION_MODEL,
        thinkingLevel: PROJECT_CREATION_THINKING_LEVEL,
        projectName: projectName.trim(),
      });
    } catch (error: any) {
      console.error('[CreateProject] Error starting agent:', error);
      tracciaErrore(error.message || 'Unknown error', 'project_create');
      tracciaErroreCreazioneProgetto(error.message || 'Unknown error');
      Alert.alert(t('common:error'), t('alerts.unableToStartAgent'));
      setIsCreating(false);
      setCreationTask(null);
      agentProjectIdRef.current = null;
      liveActivityService.endPreviewActivity().catch((err) => console.warn('[Project] Failed to end preview activity:', err?.message || err));
      resetStream();
    }
  };

  // Old creation system (fallback)
  const startOldCreation = async () => {
    setIsCreating(true);
    setCreationTask({ status: 'running', progress: 0, message: t('common:loading'), step: t('alerts.creatingProject') });

    // Start Live Activity (Dynamic Island)
    liveActivityService.startPreviewActivity(projectName.trim(), {
      remainingSeconds: 120,
      currentStep: t('alerts.creatingProject'),
      progress: 0,
    }, 'create').catch((err) => console.warn('[Project] Failed to start live activity:', err?.message || err));

    try {
      const userId = useAuthStore.getState().user?.uid;
      if (!userId) {
        Alert.alert(t('common:error'), t('alerts.loginRequired'));
        setIsCreating(false);
        setCreationTask(null);
        return;
      }

      const apiUrl = config.apiUrl;
      const oldAuthHeaders = await getAuthHeaders();

      // 1. Start Task
      const enrichedDesc = getEnrichedDescription();
      const cloudDesc = cloudEnabled
        ? `${enrichedDesc}\n\nIMPORTANT: Enable Cloud mode with a SQLite database.`
        : enrichedDesc;
      const response = await fetch(`${apiUrl}/workstation/create-with-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...oldAuthHeaders },
        body: JSON.stringify({
          projectName: projectName.trim(),
          technology: selectedLanguage,
          description: cloudDesc,
          structuredAnswers: getStructuredAnswers(),
          cloudEnabled,
          userId,
          agentMode: true,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        if (result.error === 'PROJECT_LIMIT_EXCEEDED') {
          setProjectLimit(result.limits?.maxProjects || 2);
          setShowUpgradeModal(true);
          setIsCreating(false);
          setCreationTask(null);
          liveActivityService.endPreviewActivity().catch((err) => console.warn('[Project] Failed to end preview activity:', err?.message || err));
          return;
        }
        if (result.error === 'STORAGE_LIMIT_EXCEEDED') {
          Alert.alert(
            t('alerts.storageLimitTitle'),
            t('alerts.storageLimitMessage', {
              used: result.limits?.usedMb || 0,
              max: result.limits?.maxStorageMb || 500,
            })
          );
          setIsCreating(false);
          setCreationTask(null);
          liveActivityService.endPreviewActivity().catch((err) => console.warn('[Project] Failed to end preview activity:', err?.message || err));
          return;
        }
        throw new Error(result.error || 'Failed to start project creation');
      }

      const taskId = result.taskId;
      activeTaskIdRef.current = taskId;

      // 2. Start polling
      restartPolling(taskId, apiUrl);

    } catch (error: any) {
      console.error('Error creating project:', error);
      tracciaErroreCreazioneProgetto(error?.message || 'Unknown error');
      liveActivityService.endPreviewActivity().catch((err) => console.warn('[Project] Failed to end preview activity:', err?.message || err));
      Alert.alert(t('common:error'), t('alerts.unableToCreateProject'));
      setIsCreating(false);
      setCreationTask(null);
    }
  };

  const selectedLang = languages.find(l => l.id === selectedLanguage);
  // Step 1: Desc, Step 2: Tech, Step 3: AI Interview, Step 4: Review
  const allQuestionsAnswered = aiQuestions.length > 0 && aiQuestions.every((q) => {
    const a = aiAnswers[q.questionId];
    return a && (a.selectedIds.length > 0 || a.custom?.trim());
  });
  const canProceed = step === 1 ? (description.trim().length > 0)
    : step === 2 ? (!questionsLoading && allQuestionsAnswered)
      : step === 3 ? selectedLanguage !== ''
        : projectName.trim().length > 0;

  const estimatedAgentProgress = estimateAgentCreationProgress(agentEvents, agentStatus, isStreaming);

  useEffect(() => {
    if (!useAgentSystem || !isCreating) return;
    const nextTask = deriveAgentCreationTask(
      agentEvents as any,
      agentStatus,
      isStreaming,
      estimatedAgentProgress,
      creationLang,
    );
    setCreationTask((prev) => {
      if (
        prev?.status === nextTask.status &&
        prev?.progress === nextTask.progress &&
        prev?.message === nextTask.message &&
        prev?.step === nextTask.step
      ) {
        return prev;
      }
      return nextTask;
    });
  }, [useAgentSystem, isCreating, agentEvents, agentStatus, isStreaming, estimatedAgentProgress, creationLang]);

  useEffect(() => {
    if (!isCreating || !creationTask || !liveActivityService.isActivityActive()) return;
    if (creationTask.status !== 'running') return;
    liveActivityService.updatePreviewActivity({
      remainingSeconds: Math.max(0, Math.round(180 * (1 - (creationTask.progress || 0) / 100))),
      currentStep: creationTask.step || creationTask.message || t('alerts.creatingProject'),
      progress: Math.min(1, Math.max(0, (creationTask.progress || 0) / 100)),
    }).catch(() => {});
  }, [isCreating, creationTask?.status, creationTask?.progress, creationTask?.message, creationTask?.step, t]);

  const totalSteps = 4;
  const p1 = `${Math.round(((progressOffset + 1) / (progressOffset + totalSteps)) * 100)}%`;
  const p2 = `${Math.round(((progressOffset + 2) / (progressOffset + totalSteps)) * 100)}%`;
  const p3 = `${Math.round(((progressOffset + 3) / (progressOffset + totalSteps)) * 100)}%`;
  const p4 = `${Math.round(((progressOffset + 4) / (progressOffset + totalSteps)) * 100)}%`;
  const progressWidth = progressAnim.interpolate({
    inputRange: [1, 2, 3, 4],
    outputRange: [p1, p2, p3, p4],
  });

  const handleChipPress = (chipId: string) => {
    const chip = ideaChips.find(c => c.id === chipId);
    if (chip) {
      tracciaOnboardingIdeaChip(chipId);
      activeChipRef.current = { id: chipId, prompt: chip.prompt };
      setDescription(chip.prompt);
      inputRef.current?.focus();
    }
  };

  // ── Speech-to-text ────────────────────────────────────
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript || '';
    if (transcript) {
      setDescription((prev) => {
        const separator = prev && !prev.endsWith(' ') ? ' ' : '';
        return prev + separator + transcript;
      });
    }
  });

  const simulatorFailRef = useRef(false);

  useSpeechRecognitionEvent('end', () => {
    if (simulatorFailRef.current) { simulatorFailRef.current = false; return; }
    setIsListening(false);
    stopMicAnimation();
  });
  useSpeechRecognitionEvent('error', (e: any) => {
    if (e?.error === 'audio-capture') {
      simulatorFailRef.current = true;
      return;
    }
    setIsListening(false);
    stopMicAnimation();
  });

  const startMicAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(micPulse, { toValue: 1.18, duration: 600, useNativeDriver: true }),
        Animated.timing(micPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    ).start();
  };

  const stopMicAnimation = () => {
    micPulse.stopAnimation();
    Animated.timing(micPulse, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  };

  const toggleSpeechRecognition = async () => {
    if (isListening) {
      try { ExpoSpeechRecognitionModule.stop(); } catch {}
      setIsListening(false);
      stopMicAnimation();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    try {
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!result.granted) {
        Alert.alert('Permesso necessario', 'Consenti l\'accesso al microfono per dettare la descrizione.');
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsListening(true);
      startMicAnimation();
      ExpoSpeechRecognitionModule.start({ lang: 'it-IT', interimResults: false });
    } catch (err: any) {
      // Fallback: keep animation running even if speech fails (e.g. simulator)
      if (!isListening) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setIsListening(true);
        startMicAnimation();
      }
    }
  };

  const handleDescriptionChange = (text: string) => {
    if (text.length > 500) return;
    // If user had a template selected and now cleared/changed it
    if (activeChipRef.current && text !== activeChipRef.current.prompt) {
      tracciaTemplateCancellato(activeChipRef.current.id);
      activeChipRef.current = null;
    }
    // Track when user starts writing their own description (fire once)
    if (!activeChipRef.current && text.length > 0 && !hasTrackedCustomDesc.current) {
      hasTrackedCustomDesc.current = true;
      tracciaDescrizionePersonalizzata();
    }
    // Reset if user clears everything
    if (text.length === 0) {
      hasTrackedCustomDesc.current = false;
    }
    setDescription(text);
  };

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <View style={styles.step1Header}>
        <Text style={styles.step1Title}>{t('create.describeIdea')}</Text>
      </View>

      {/* Suggestion chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsContainer}
      >
        {ideaChips.map((chip) => (
          <TouchableOpacity
            key={chip.id}
            activeOpacity={0.7}
            onPress={() => handleChipPress(chip.id)}
          >
            {useGlass && glassReady ? (
              <LiquidGlassView
                style={styles.chipLiquid}
                interactive={true}
                effect="regular"
                colorScheme="dark"
              >
                <Ionicons name={chip.icon} size={16} color="rgba(255,255,255,0.7)" />
                <Text style={styles.chipText}>{chip.label}</Text>
              </LiquidGlassView>
            ) : (
              <View style={styles.chip}>
                <Ionicons name={chip.icon} size={16} color="rgba(255,255,255,0.7)" />
                <Text style={styles.chipText}>{chip.label}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Large text area */}
      <View style={[styles.ideaInputWrapper, keyboardVisible && { marginBottom: 76 }]}>
        {useGlass && glassReady ? (
          <LiquidGlassView
            style={[styles.ideaInputContainer, { backgroundColor: 'transparent' }, keyboardHeight > 0 && { maxHeight: 180 }]}
            interactive={true}
            effect="clear"
            colorScheme="dark"
          >
            <TextInput
              ref={inputRef}
              style={styles.ideaTextInput}
              placeholder={t('create.startTyping')}
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={description}
              onChangeText={handleDescriptionChange}
              maxLength={500}
              multiline
              scrollEnabled={true}
              textAlignVertical="top"
              keyboardAppearance="dark"
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
            />
            <View style={styles.ideaToolbar}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity style={[styles.cloudPill, cloudEnabled && styles.cloudPillActive]} activeOpacity={0.7} onPress={handleCloudToggle}>
                  <Ionicons name={cloudEnabled ? 'checkmark' : 'add'} size={16} color={cloudEnabled ? '#fff' : 'rgba(255,255,255,0.6)'} />
                  <Text style={[styles.cloudPillText, cloudEnabled && styles.cloudPillTextActive]}>{t('create.cloudMode')}</Text>
                </TouchableOpacity>
                <Pressable style={styles.cloudInfoBtn} onPress={openCloudInfo} hitSlop={8}>
                  <Ionicons name="information-circle-outline" size={20} color="rgba(255,255,255,0.4)" />
                </Pressable>
              </View>
              <TouchableOpacity activeOpacity={0.7} onPress={toggleSpeechRecognition}>
                <Animated.View style={[
                  styles.toolbarIconBtn,
                  { transform: [{ scale: micPulse }] },
                  isListening ? { backgroundColor: 'rgba(139, 92, 246, 0.25)', shadowColor: '#8B5CF6', shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } } : null,
                ]}>
                  <Ionicons name={isListening ? 'mic' : 'mic-outline'} size={22} color={isListening ? '#A78BFA' : 'rgba(255,255,255,0.5)'} />
                </Animated.View>
              </TouchableOpacity>
            </View>
          </LiquidGlassView>
        ) : (
          <View style={[styles.ideaInputContainer, keyboardHeight > 0 && { maxHeight: 180 }]}>
            <TextInput
              ref={inputRef}
              style={styles.ideaTextInput}
              placeholder={t('create.startTyping')}
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={description}
              onChangeText={handleDescriptionChange}
              maxLength={500}
              multiline
              scrollEnabled={true}
              textAlignVertical="top"
              keyboardAppearance="dark"
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
            />
            <View style={styles.ideaToolbar}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity style={[styles.cloudPill, cloudEnabled && styles.cloudPillActive]} activeOpacity={0.7} onPress={handleCloudToggle}>
                  <Ionicons name={cloudEnabled ? 'checkmark' : 'add'} size={16} color={cloudEnabled ? '#fff' : 'rgba(255,255,255,0.6)'} />
                  <Text style={[styles.cloudPillText, cloudEnabled && styles.cloudPillTextActive]}>{t('create.cloudMode')}</Text>
                </TouchableOpacity>
                <Pressable style={styles.cloudInfoBtn} onPress={openCloudInfo} hitSlop={8}>
                  <Ionicons name="information-circle-outline" size={20} color="rgba(255,255,255,0.4)" />
                </Pressable>
              </View>
              <TouchableOpacity activeOpacity={0.7} onPress={toggleSpeechRecognition}>
                <Animated.View style={[
                  styles.toolbarIconBtn,
                  { transform: [{ scale: micPulse }] },
                  isListening && { backgroundColor: 'rgba(139, 92, 246, 0.25)', shadowColor: '#8B5CF6', shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
                ]}>
                  <Ionicons name={isListening ? 'mic' : 'mic-outline'} size={22} color={isListening ? '#A78BFA' : 'rgba(255,255,255,0.5)'} />
                </Animated.View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Disclaimer tip */}
        <View style={styles.disclaimerBox}>
          <Ionicons name="sparkles" size={14} color={AppColors.primary} />
          <Text style={styles.disclaimerText}>
            <Text style={{ fontWeight: '600' }}>Tip: </Text>
            {i18n.language?.startsWith('it')
              ? 'Più dettagli scrivi, migliore sarà il risultato generato.'
              : 'The more details you provide, the better the generated result.'}
          </Text>
        </View>
      </View>
    </View>
  );

  const ShimmerBlock: React.FC<{ style: any; children?: React.ReactNode }> = ({ style, children }) => {
    const shimmerTranslate = shimmerAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [-SCREEN_WIDTH, SCREEN_WIDTH],
    });
    return (
      <View style={[style, { overflow: 'hidden' }]}>
        {children}
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: shimmerTranslate }] }]}>
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.06)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    );
  };

  const renderStep2Skeleton = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>{t('create.recommendedTech')}</Text>
        <Text style={styles.stepSubtitle}>{t('create.aiSuggests')}</Text>
      </View>

      {/* Skeleton explanation box */}
      <ShimmerBlock style={styles.skeletonExplanation} />

      {/* Skeleton grid - 4 cards */}
      <View style={styles.languagesGrid}>
        {[0, 1, 2, 3].map(i => (
          <ShimmerBlock key={i} style={styles.skeletonCard}>
            <View style={styles.skeletonCardIcon} />
            <View style={styles.skeletonCardLabel} />
          </ShimmerBlock>
        ))}
      </View>

      {/* Skeleton show all */}
      <ShimmerBlock style={styles.skeletonShowAll} />
    </View>
  );

  const renderStep2 = () => {
    if (aiAnalyzing) return renderStep2Skeleton();

    return (
    <View style={styles.stepContent}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>{t('create.recommendedTech')}</Text>
        <Text style={styles.stepSubtitle}>{t('create.aiSuggests')}</Text>
      </View>

      {/* AI Explanation */}
      {aiExplanation && aiRecommendedLang && (
        useGlass ? (
          <LiquidGlassView
            style={[styles.aiExplanationBox, { backgroundColor: 'transparent', overflow: 'hidden' }]}
            interactive={true}
            effect="clear"
            colorScheme="dark"
          >
            <Ionicons name="sparkles" size={14} color={AppColors.primary} />
            <Text style={styles.aiExplanationText}>
              <Text style={{ fontWeight: '600' }}>{t('create.aiRecommendedBecause')} </Text>
              {aiExplanation}
            </Text>
          </LiquidGlassView>
        ) : (
          <View style={styles.aiExplanationBox}>
            <Ionicons name="sparkles" size={14} color={AppColors.primary} />
            <Text style={styles.aiExplanationText}>
              <Text style={{ fontWeight: '600' }}>{t('create.aiRecommendedBecause')} </Text>
              {aiExplanation}
            </Text>
          </View>
        )
      )}

      {languageCategories.map((category) => {
        const catLangs = category.items.map(id => languages.find(l => l.id === id)!).filter(Boolean);
        return (
          <View key={category.id}>
            <View style={styles.languagesGrid}>
              {catLangs.map((lang) => {
                const isSelected = selectedLanguage === lang.id;
                const isAiPick = aiRecommendedLang === lang.id;
                const cardContent = (
                  <View style={styles.langCardInner}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <View style={styles.langIconBox}>
                        <Ionicons name={lang.icon as any} size={28} color={lang.color} />
                      </View>
                      {isAiPick && (
                        <View style={styles.aiPickBadge}>
                          <Ionicons name="sparkles" size={10} color="#fff" />
                          <Text style={styles.aiPickText}>AI</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.langName, isSelected && { color: '#fff', fontWeight: '700' }]}>
                      {lang.name}
                    </Text>
                  </View>
                );

                return (
                  <TouchableOpacity
                    key={lang.id}
                    style={[
                      styles.langCard,
                      useGlass && styles.langCardGlass,
                      isSelected && { borderColor: lang.color, backgroundColor: useGlass ? 'transparent' : 'rgba(255,255,255,0.08)' }
                    ]}
                    onPress={() => { setSelectedLanguage(lang.id); tracciaLinguaggioSelezionato(lang.name, lang.id === aiRecommendedLang); }}
                    activeOpacity={0.7}
                  >
                    {useGlass ? (
                      <LiquidGlassView
                        style={[
                          styles.langCardLiquid,
                          isSelected && { borderColor: lang.color, borderWidth: 1.5 }
                        ]}
                        interactive={true}
                        effect="regular"
                        colorScheme="dark"
                      >
                        {cardContent}
                      </LiquidGlassView>
                    ) : (
                      cardContent
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}

      {/* All languages shown — no toggle needed */}
    </View>
    );
  };

  const renderSummaryRow = (icon: string, iconColor: string, label: string, value: string, field: 'name' | 'description' | 'tech') => {
    const isNameEmpty = field === 'name' && !projectName.trim();
    const isEditing = field === 'name' && (editingField === 'name' || isNameEmpty);
    return (
      <View style={styles.summaryRow}>
        <View style={styles.summaryIconBox}>
          <Ionicons name={icon as any} size={24} color={iconColor} />
        </View>
        <View style={styles.summaryInfo}>
          <Text style={styles.summaryLabel}>{label}</Text>
          {isEditing ? (
            <TextInput
              style={[styles.summaryValue, styles.summaryInput]}
              value={projectName}
              onChangeText={(text) => { setProjectName(text); if (editingField !== 'name') setEditingField('name'); }}
              placeholder={t('create.namePlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.3)"
              autoFocus
              onBlur={() => { if (!isNameEmpty) setEditingField(null); }}
              keyboardAppearance="dark"
              returnKeyType="done"
              onSubmitEditing={() => setEditingField(null)}
            />
          ) : (
            <Text
              style={[styles.summaryValue, field === 'tech' && { color: iconColor }]}
              numberOfLines={field === 'description' ? 2 : 1}
            >
              {value}
            </Text>
          )}
        </View>
        {(isEditing || !isNameEmpty) && (
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => {
              if (field === 'name') {
                setEditingField(editingField === 'name' ? null : 'name');
              } else if (field === 'description') {
                animateStepTransition(1, 'back');
              } else {
                animateStepTransition(2, 'back');
              }
            }}
          >
            <Ionicons name={isEditing ? 'checkmark-circle' : 'create-outline'} size={22} color={isEditing ? AppColors.primary : 'rgba(255,255,255,0.4)'} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderStep3Content = () => (
    <>
      {renderSummaryRow('folder-outline', '#fff', t('create.projectName'), projectName, 'name')}
      <View style={styles.summaryDivider} />
      {renderSummaryRow('document-text-outline', '#fff', t('create.description'), description, 'description')}
      <View style={styles.summaryDivider} />
      {renderSummaryRow(selectedLang?.icon || 'code-outline', selectedLang?.color || '#fff', t('create.technology'), selectedLang?.name || '', 'tech')}
    </>
  );

  const renderStep3Interview = () => {
    if (questionsLoading || aiQuestions.length === 0) {
      return (
        <View style={styles.stepContent}>
          <View style={styles.stepHeader}>
            <Text style={styles.stepTitle}>Personalizza il progetto</Text>
            <Text style={styles.stepSubtitle}>L'AI sta preparando domande specifiche...</Text>
          </View>
          {[0, 1, 2, 3].map(i => (
            <ShimmerBlock key={i} style={{ height: 100, borderRadius: 16, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.05)' }} />
          ))}
        </View>
      );
    }

    return (
      <View style={styles.stepContent}>
        <View style={styles.stepHeader}>
          <Text style={styles.stepTitle}>Personalizza</Text>
          <Text style={styles.stepSubtitle}>Rispondi per un risultato migliore</Text>
        </View>

        {aiQuestions.map((q, idx) => {
          const answer = aiAnswers[q.questionId] || { selectedIds: [], custom: '' };
          const cardContent = (
            <>
              <View style={styles.interviewHeader}>
                <View style={styles.interviewBadge}>
                  <Text style={styles.interviewBadgeText}>{idx + 1}</Text>
                </View>
                <Text style={styles.interviewQuestion}>{q.question}</Text>
              </View>
              <View style={styles.interviewOptions}>
                {q.options.map((opt) => (
                  <TouchableOpacity
                    key={opt.optionId}
                    style={[styles.interviewChip, answer.selectedIds.includes(opt.optionId) && styles.interviewChipActive]}
                    activeOpacity={0.7}
                    onPress={() => setAiAnswers(prev => {
                      const current = prev[q.questionId]?.selectedIds || [];
                      const toggled = q.multiSelect
                        ? (current.includes(opt.optionId) ? current.filter(s => s !== opt.optionId) : [...current, opt.optionId])
                        : (current.includes(opt.optionId) ? [] : [opt.optionId]);
                      return { ...prev, [q.questionId]: { selectedIds: toggled, custom: '' } };
                    })}
                  >
                    <Text style={[styles.interviewChipText, answer.selectedIds.includes(opt.optionId) && styles.interviewChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.interviewInput}
                placeholder="Oppure scrivi qui..."
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={answer.custom}
                onChangeText={(text) => setAiAnswers(prev => ({
                  ...prev,
                  [q.questionId]: { selectedIds: [], custom: text },
                }))}
                keyboardAppearance="dark"
              />
            </>
          );

          return useGlass ? (
            <LiquidGlassView
              key={idx}
              style={[styles.interviewCard, { backgroundColor: 'transparent', overflow: 'hidden' }]}
              interactive={true}
              effect="clear"
              colorScheme="dark"
            >
              {cardContent}
            </LiquidGlassView>
          ) : (
            <View key={idx} style={styles.interviewCard}>
              {cardContent}
            </View>
          );
        })}
      </View>
    );
  };

  /** Build enriched description with AI interview answers */
  const getEnrichedDescription = () => {
    let enriched = description.trim();
    const parts: string[] = [];
    aiQuestions.forEach((q) => {
      const answer = aiAnswers[q.questionId];
      if (!answer) return;
      const selectedLabels = answer.selectedIds
        .map(id => q.options.find(o => o.optionId === id)?.label || id)
        .join(', ');
      const val = answer.custom?.trim() || selectedLabels;
      if (val) parts.push(`${q.question} ${val}`);
    });
    if (parts.length > 0) {
      enriched += '\n\n' + parts.join('\n');
    }
    return enriched;
  };

  /** Build structured answers for preview contract */
  const getStructuredAnswers = () => {
    const result: Record<string, string | string[]> = {};
    for (const q of aiQuestions) {
      const a = aiAnswers[q.questionId];
      if (!a) continue;
      if (q.multiSelect) {
        result[q.questionId] = a.selectedIds.length > 0 ? a.selectedIds : [];
      } else {
        result[q.questionId] = a.selectedIds[0] || a.custom?.trim() || '';
      }
    }
    return result;
  };

  /** Fetch preview contract when entering review step */
  const fetchPreviewContract = async () => {
    setContractLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${config.apiUrl}/ai/preview-contract`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          technology: selectedLanguage,
          projectName: projectName.trim(),
          answers: getStructuredAnswers(),
        }),
      });
      const data = await res.json();
      if (data.success && data.summary) {
        setContractSummary(data.summary);
      }
    } catch (err: any) {
      console.warn('[Contract] Failed to fetch preview:', err.message);
    } finally {
      setContractLoading(false);
    }
  };

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>{t('create.allSet')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }}>
          <Text style={styles.stepSubtitle}>{t('create.verifyDetails')}</Text>
          {selectedLang && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(109, 76, 255, 0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, gap: 4 }}>
              <Ionicons name={selectedLang.icon as any} size={13} color={selectedLang.color} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: selectedLang.color }}>{selectedLang.name}</Text>
            </View>
          )}
        </View>
      </View>

      {useGlass ? (
        <LiquidGlassView
          style={[styles.summaryCard, { backgroundColor: 'transparent', overflow: 'hidden' }]}
          interactive={true}
          effect="clear"
          colorScheme="dark"
        >
          {renderStep3Content()}
        </LiquidGlassView>
      ) : (
        <View style={styles.summaryCard}>
          {renderStep3Content()}
        </View>
      )}
      {!keyboardVisible && (
        <View style={styles.readyBanner}>
          <Text style={styles.readyText}>
            {t('create.allCorrect')} <Text style={styles.readyHighlight}>{t('create.createButton')}</Text> {t('create.toStart')}
          </Text>
        </View>
      )}
    </View>
  );

  const bgShift1 = bgMove.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 15, 0] });
  const bgShift2 = bgMove.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -15, 0] });
  const bgScale1 = bgMove.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1.2, 1.25, 1.2] });
  const bgScale2 = bgMove.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1.22, 1.18, 1.22] });

  const useGlass = isLiquidGlassSupported;

  return (
    <View style={styles.container}>
      {/* Animated gradient background — smooth drift, no pulse */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: entranceOpacity }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: bgShift1 }, { scale: bgScale1 }] }]}>
          <LinearGradient
            colors={['#1a0a2e', '#2d0845', AppColors.primary, '#0A0A0F']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { opacity: 0.45 }]}
          />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: bgShift2 }, { scale: bgScale2 }] }]}>
          <LinearGradient
            colors={['#0A0A0F', '#4c1d95', '#1a0a2e', '#0A0A0F']}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[StyleSheet.absoluteFill, { opacity: 0.4 }]}
          />
        </Animated.View>
      </Animated.View>


      {/* Header with back button + inline progress bar */}
      <Animated.View style={[styles.header, { transform: [{ translateY: headerSlide }] }]}>
        {!hideBack && (
          <TouchableOpacity onPress={handleBack} style={[styles.backBtnMinimal, useGlass && styles.backBtnMinimalGlass]} activeOpacity={0.7}>
            {useGlass ? (
              <LiquidGlassView
                style={styles.backBtnMinimalLiquid}
                interactive={true}
                effect="clear"
                colorScheme="dark"
              >
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </LiquidGlassView>
            ) : (
              <Ionicons name="chevron-back" size={28} color="#fff" />
            )}
          </TouchableOpacity>
        )}

        {/* Inline progress bar */}
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarTrack}>
            <Animated.View
              style={[
                styles.progressBarFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [1, 2, 3],
                    outputRange: [p1, p2, p3],
                  }),
                }
              ]}
            />
          </View>
        </View>
      </Animated.View>

      {/* Content — entrance animation wraps the scroll area */}
      {/* Content — entrance: rises from below + scale (NO opacity — kills LiquidGlass) */}
      <Animated.View style={{ flex: 1, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            keyboardHeight > 0 && { paddingBottom: keyboardHeight + 80, paddingTop: 32 }
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Animated.View style={{ transform: [{ translateX: stepTranslateX }] }}>
            {step === 1 && renderStep1()}
            {step === 2 && renderStep3Interview()}
            {step === 3 && renderStep2()}
            {step === 4 && renderStep3()}
          </Animated.View>
        </ScrollView>
      </Animated.View>

      {/* Bottom Button - moves above keyboard */}
      <Animated.View style={[
        styles.bottomBar,
        keyboardVisible && { bottom: keyboardHeight + 6 },
        { opacity: bottomBarOpacity, transform: [{ translateY: bottomBarSlide }] }
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
                  {step === 4 ? t('create.createButton') : t('common:continue')}
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
      </Animated.View>

      {/* Agent Mode Selection Modal */}
      <AgentModeModal
        visible={showModeModal}
        onClose={() => setShowModeModal(false)}
        onSelectMode={handleModeSelect}
      />

      {/* Creation Progress */}
      <CreationProgressModal
        visible={isCreating}
        progress={creationTask?.progress ?? estimatedAgentProgress}
        status={creationTask?.message || (agentCurrentTool ? `${agentCurrentTool}...` : (isStreaming ? 'Generating code...' : 'Preparing...'))}
        step={creationTask?.step || (agentStatus === 'running' ? 'AI Agent' : undefined)}
        agentEvents={useAgentSystem ? agentEvents : undefined}
        agentStatus={agentStatus}
        agentCurrentTool={agentCurrentTool}
      />
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
                {(() => {
                  const plan = useAuthStore.getState().user?.plan || 'free';
                  const planLabel = plan === 'pro' ? 'Pro' : plan === 'go' ? 'Go' : 'Free';
                  const nextPlan = plan === 'free' ? 'Go' : plan === 'go' ? 'Pro' : null;
                  return nextPlan
                    ? `${t('limit.maxProjects', { count: projectLimit })} con il piano ${planLabel}.\n${t('limit.upgradeTo', { plan: nextPlan })} ${t('limit.upgradeToCreate')}`
                    : `${t('limit.maxProjects', { count: projectLimit })} con il piano ${planLabel}.\nElimina un progetto per crearne uno nuovo.`;
                })()}
              </Text>
              {(() => {
                const plan = useAuthStore.getState().user?.plan || 'free';
                const nextPlan = plan === 'free' ? 'Go' : plan === 'go' ? 'Pro' : null;
                return nextPlan ? (
                  <>
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
                        if (onOpenPlans) onOpenPlans(); else onBack();
                      }}
                    >
                      <LinearGradient
                        colors={[AppColors.primary, '#9333EA']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.upgradeCtaGradient}
                      >
                        <Ionicons name="arrow-up-circle" size={20} color="#fff" />
                        <Text style={styles.upgradeCtaText}>{t('limit.upgradeTo', { plan: nextPlan })}</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.upgradeCta}
                    activeOpacity={0.85}
                    onPress={() => setShowUpgradeModal(false)}
                  >
                    <LinearGradient
                      colors={[AppColors.primary, '#9333EA']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.upgradeCtaGradient}
                    >
                      <Text style={styles.upgradeCtaText}>Ho capito</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                );
              })()}
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
      {/* Cloud Info Bottom Sheet */}
      {cloudInfoVisible && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Animated.View style={[styles.cloudInfoBackdrop, { opacity: cloudOverlayAnim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeCloudInfo} />
          </Animated.View>
          <View style={styles.cloudInfoOverlay} pointerEvents="box-none">
            <Animated.View style={[styles.cloudInfoSheet, { transform: [{ translateY: cloudSheetAnim }] }]}>
              <View style={styles.cloudInfoHandle} />
              <Text style={styles.cloudInfoTitle}>{t('create.cloudTitle')}</Text>
              <Text style={styles.cloudInfoSubtitle}>{t('create.cloudSubtitle')}</Text>
              <View style={styles.cloudInfoFaqCard}>
                <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                  {cloudFaqItems.map((item, index) => (
                    <FaqItem
                      key={index}
                      item={item}
                      isExpanded={expandedFaq === index}
                      onToggle={() => setExpandedFaq(expandedFaq === index ? null : index)}
                      isLast={index === cloudFaqItems.length - 1}
                    />
                  ))}
                </ScrollView>
              </View>
            </Animated.View>
          </View>
        </View>
      )}

      {/* Post-creation paywall for free users */}
      {showPostCreationPaywall && (
        <View style={styles.upgradeOverlay}>
          <View style={styles.upgradeModalOverlay}>
            <View style={styles.upgradeModalCard}>
              <LinearGradient
                colors={['rgba(80, 200, 120, 0.15)', 'rgba(59, 130, 246, 0.05)', 'transparent']}
                style={styles.upgradeModalGlow}
              />
              <View style={styles.upgradeIconWrapper}>
                <LinearGradient
                  colors={['#50C878', '#34D399']}
                  style={styles.upgradeIconGradient}
                >
                  <Ionicons name="checkmark-circle" size={32} color="#fff" />
                </LinearGradient>
              </View>
              <Text style={styles.upgradeTitle}>Progetto creato!</Text>
              <Text style={styles.upgradeSubtitle}>
                Con Go puoi creare di piu e con modelli AI premium.
              </Text>
              <View style={styles.upgradeFeatures}>
                {[
                  { icon: 'flash', text: '7.5x budget AI' },
                  { icon: 'folder-open', text: '4 progetti + 5 clonati' },
                  { icon: 'diamond', text: 'Modelli premium (Opus, GPT-5)' },
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
                  setShowPostCreationPaywall(false);
                  if (onOpenPlans) {
                    onOpenPlans();
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
                  <Text style={styles.upgradeCtaText}>{t('limit.upgradeCta')}</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.upgradeDismiss}
                onPress={() => {
                  setShowPostCreationPaywall(false);
                  if (pendingWorkstation) {
                    tracciaEntrataNelProgetto(pendingWorkstation.name);
                    onCreate(pendingWorkstation);
                  }
                }}
              >
                <Text style={styles.upgradeDismissText}>{t('limit.notNow')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const CARD_WIDTH = (SCREEN_WIDTH - 48 - 16) / 3;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 66,
    paddingBottom: 8,
    gap: 12,
  },
  backBtnMinimal: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnMinimalGlass: {
    backgroundColor: 'transparent',
    overflow: 'hidden' as const,
    borderRadius: 18,
  },
  backBtnMinimalLiquid: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  },
  progressBarContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: 4,
  },
  progressBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#fff',
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
  // Step 1 - Describe idea
  step1Header: {
    marginBottom: 20,
  },
  step1Title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  chipsScroll: {
    marginBottom: 20,
    marginHorizontal: -24,
  },
  chipsContainer: {
    paddingHorizontal: 24,
    gap: 10,
    flexDirection: 'row',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chipLiquid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  ideaInputWrapper: {
  },
  ideaInputContainer: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 68,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    minHeight: 200,
    maxHeight: 420,
    position: 'relative',
  },
  ideaTextInput: {
    fontSize: 17,
    color: '#fff',
    fontWeight: '500',
    lineHeight: 26,
    textAlignVertical: 'top',
    minHeight: 120,
  },
  ideaToolbar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toolbarIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cloudPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  cloudPillActive: {
    backgroundColor: AppColors.primary,
  },
  cloudInfoBtn: {
    marginLeft: 6,
    padding: 2,
  },
  cloudPillText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
  },
  cloudPillTextActive: {
    color: '#fff',
  },
  betaBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  betaBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  betaBadgeText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  betaBadgeTextActive: {
    color: '#fff',
  },
  // Cloud Info Modal
  cloudInfoOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  cloudInfoBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  cloudInfoSheet: {
    backgroundColor: '#0A0A0F',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    maxHeight: '85%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cloudInfoHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 24,
  },
  cloudInfoTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 12,
    lineHeight: 38,
  },
  cloudInfoSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 22,
    marginBottom: 24,
  },
  cloudInfoFaqCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 18,
    maxHeight: 380,
  },
  // Legacy (kept for step 2/3 compatibility)
  inputSection: {
    marginBottom: 32,
  },
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
    justifyContent: 'flex-start',
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
  langCardGlass: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    padding: 0,
    overflow: 'hidden',
  },
  langCardLiquid: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
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
  aiPickBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(139, 92, 246, 0.5)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.6)',
  },
  aiPickText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  skeletonExplanation: {
    height: 52,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    marginBottom: 16,
  },
  skeletonCard: {
    width: '47%',
    height: 90,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 14,
    justifyContent: 'space-between',
  },
  skeletonCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  skeletonCardLabel: {
    width: '60%',
    height: 14,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  skeletonShowAll: {
    alignSelf: 'center',
    width: 100,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginTop: 12,
  },
  aiExplanationBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(99,102,241,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.15)',
  },
  aiExplanationText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 12,
  },
  showAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 4,
  },
  showAllButtonGlass: {
    backgroundColor: 'transparent',
    overflow: 'hidden' as const,
    borderRadius: 20,
    alignSelf: 'center' as const,
    padding: 0,
    paddingVertical: 0,
  },
  showAllButtonLiquid: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 16,
    overflow: 'hidden' as const,
  },
  showAllText: {
    color: AppColors.primary,
    fontSize: 14,
    fontWeight: '600',
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
  summaryInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 28,
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
    color: AppColors.primaryLight,
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
  // AI Interview (step 3)
  interviewCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  interviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 14,
  },
  interviewBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(109, 76, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  interviewBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: AppColors.primary,
  },
  interviewQuestion: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    lineHeight: 21,
    flex: 1,
  },
  interviewOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  interviewChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  interviewChipActive: {
    backgroundColor: 'rgba(109, 76, 255, 0.2)',
    borderColor: AppColors.primary,
  },
  interviewChipText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
  },
  interviewChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  interviewInput: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 13,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    textAlign: 'center',
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(99,102,241,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 14,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.15)',
  },
  disclaimerText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
});
