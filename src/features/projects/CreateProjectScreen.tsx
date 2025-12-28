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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../shared/theme/colors';
import { workstationService } from '../../core/workstation/workstationService-firebase';
import { useAuthStore } from '../../core/auth/authStore';

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
  const [isCreating, setIsCreating] = useState(false);
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
      Keyboard.dismiss();
      setStep(2);
    } else if (step === 2) {
      if (!selectedLanguage) {
        Alert.alert('Attenzione', 'Seleziona un linguaggio');
        return;
      }
      setStep(3);
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
    try {
      const userId = useAuthStore.getState().user?.uid;
      if (!userId) {
        Alert.alert('Errore', 'Devi essere loggato per creare un progetto');
        setIsCreating(false);
        return;
      }

      // Call the new template endpoint
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/workstation/create-with-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: projectName.trim(),
          technology: selectedLanguage,
          userId,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create project');
      }

      console.log('✅ Project created with template:', result);

      const workstation = {
        id: result.projectId,
        projectId: result.projectId,
        name: projectName,
        language: selectedLanguage,
        technology: selectedLanguage,
        templateDescription: result.templateDescription,
        status: 'ready' as const,
        createdAt: new Date(),
        files: result.files || [],
        folderId: null,
      };

      onCreate(workstation);
    } catch (error) {
      console.error('Error creating project:', error);
      Alert.alert('Errore', 'Impossibile creare il progetto. Riprova.');
      setIsCreating(false);
    }
  };


  const selectedLang = languages.find(l => l.id === selectedLanguage);
  const canProceed = step === 1 ? projectName.trim().length > 0 : step === 2 ? selectedLanguage !== '' : true;

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
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>PASSO 1</Text>
        </View>
        <Text style={styles.stepTitle}>Come vuoi chiamarlo?</Text>
        <Text style={styles.stepSubtitle}>Scegli un nome memorabile per il tuo progetto</Text>
      </View>

      <View style={styles.inputSection}>
        <View style={[styles.inputWrapper, inputFocused && styles.inputWrapperFocused]}>
          <LinearGradient
            colors={inputFocused
              ? ['rgba(139, 92, 246, 0.12)', 'rgba(139, 92, 246, 0.04)']
              : ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.02)']}
            style={styles.inputGradient}
          >
            <View style={styles.inputContainer}>
              <View style={[styles.inputIcon, inputFocused && styles.inputIconFocused]}>
                <Ionicons
                  name="folder"
                  size={20}
                  color={inputFocused ? AppColors.primary : 'rgba(255,255,255,0.35)'}
                />
              </View>
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
                    <Ionicons name="close" size={14} color="rgba(255,255,255,0.5)" />
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </LinearGradient>
        </View>

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
    <Animated.View
      style={[
        styles.stepContent,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
      ]}
    >
      <View style={styles.stepHeader}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>PASSO 2</Text>
        </View>
        <Text style={styles.stepTitle}>Scegli la tecnologia</Text>
        <Text style={styles.stepSubtitle}>Quale linguaggio utilizzerai?</Text>
      </View>

      {selectedLang && (
        <View style={styles.selectedBanner}>
          <LinearGradient
            colors={[`${selectedLang.color}18`, `${selectedLang.color}08`]}
            style={styles.selectedBannerGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <View style={[styles.selectedBannerIcon, { backgroundColor: `${selectedLang.color}20` }]}>
              <Ionicons name={selectedLang.icon as any} size={18} color={selectedLang.color} />
            </View>
            <Text style={[styles.selectedBannerText, { color: selectedLang.color }]}>
              {selectedLang.name}
            </Text>
            <Ionicons name="checkmark-circle" size={20} color={selectedLang.color} />
          </LinearGradient>
        </View>
      )}

      <View style={styles.languagesGrid}>
        {languages.map((lang) => {
          const isSelected = selectedLanguage === lang.id;
          return (
            <TouchableOpacity
              key={lang.id}
              style={[styles.langCard, isSelected && styles.langCardSelected]}
              onPress={() => setSelectedLanguage(lang.id)}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={isSelected
                  ? [`${lang.color}20`, `${lang.color}08`]
                  : ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.02)']}
                style={styles.langCardGradient}
              >
                <View style={[styles.langIcon, { backgroundColor: `${lang.color}18` }]}>
                  <Ionicons name={lang.icon as any} size={22} color={lang.color} />
                </View>
                <Text style={[styles.langName, isSelected && { color: '#fff', fontWeight: '600' }]}>
                  {lang.name}
                </Text>
                {isSelected && (
                  <View style={[styles.langCheckBadge, { backgroundColor: lang.color }]}>
                    <Ionicons name="checkmark" size={10} color="#fff" />
                  </View>
                )}
              </LinearGradient>
            </TouchableOpacity>
          );
        })}
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
        <View style={[styles.stepBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
          <Text style={[styles.stepBadgeText, { color: '#10B981' }]}>RIEPILOGO</Text>
        </View>
        <Text style={styles.stepTitle}>Tutto pronto!</Text>
        <Text style={styles.stepSubtitle}>Verifica i dettagli prima di creare</Text>
      </View>

      <View style={styles.summaryCard}>
        <LinearGradient
          colors={['rgba(139, 92, 246, 0.08)', 'rgba(139, 92, 246, 0.02)']}
          style={styles.summaryCardGradient}
        >
          <View style={styles.summaryRow}>
            <View style={styles.summaryIconBox}>
              <Ionicons name="folder" size={20} color={AppColors.primary} />
            </View>
            <View style={styles.summaryInfo}>
              <Text style={styles.summaryLabel}>Nome</Text>
              <Text style={styles.summaryValue}>{projectName}</Text>
            </View>
            <TouchableOpacity style={styles.editBtn} onPress={() => setStep(1)}>
              <Ionicons name="pencil" size={14} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryRow}>
            <View style={[styles.summaryIconBox, { backgroundColor: `${selectedLang?.color}15` }]}>
              <Ionicons name={selectedLang?.icon as any} size={20} color={selectedLang?.color} />
            </View>
            <View style={styles.summaryInfo}>
              <Text style={styles.summaryLabel}>Linguaggio</Text>
              <Text style={[styles.summaryValue, { color: selectedLang?.color }]}>{selectedLang?.name}</Text>
            </View>
            <TouchableOpacity style={styles.editBtn} onPress={() => setStep(2)}>
              <Ionicons name="pencil" size={14} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryRow}>
            <View style={styles.summaryIconBox}>
              <Ionicons name="layers" size={20} color={AppColors.primary} />
            </View>
            <View style={styles.summaryInfo}>
              <Text style={styles.summaryLabel}>Tipo</Text>
              <Text style={styles.summaryValue}>Template {selectedLang?.name}</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      <View style={styles.readyBanner}>
        <LinearGradient
          colors={['rgba(16, 185, 129, 0.1)', 'rgba(16, 185, 129, 0.02)']}
          style={styles.readyBannerGradient}
        >
          <Ionicons name="rocket" size={24} color="#10B981" />
          <Text style={styles.readyText}>
            Premi <Text style={styles.readyHighlight}>"Crea Progetto"</Text> per iniziare!
          </Text>
        </LinearGradient>
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
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]}>
            <LinearGradient
              colors={[AppColors.primary, '#9333EA']}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />
          </Animated.View>
        </View>
        <View style={styles.progressSteps}>
          {['Nome', 'Linguaggio', 'Conferma'].map((label, idx) => (
            <View key={idx} style={styles.progressStep}>
              <View style={[styles.progressDot, step > idx && styles.progressDotActive]}>
                {step > idx + 1 ? (
                  <Ionicons name="checkmark" size={10} color="#fff" />
                ) : (
                  <View style={[styles.progressDotInner, step === idx + 1 && styles.progressDotInnerActive]} />
                )}
              </View>
              <Text style={[styles.progressLabel, step >= idx + 1 && styles.progressLabelActive]}>
                {label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Content */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          keyboardVisible && { paddingBottom: 20 }
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </ScrollView>

      {/* Bottom Button - Hidden when keyboard is visible */}
      {!keyboardVisible && (
        <View style={styles.bottomBar}>
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
                    {step === 3 ? 'Crea Progetto' : 'Continua'}
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
    paddingTop: 56,
    paddingBottom: 16,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  // Progress
  progressContainer: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressSteps: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressStep: {
    alignItems: 'center',
    gap: 6,
  },
  progressDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressDotActive: {
    backgroundColor: AppColors.primary,
  },
  progressDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  progressDotInnerActive: {
    backgroundColor: '#fff',
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.35)',
  },
  progressLabelActive: {
    color: 'rgba(255,255,255,0.7)',
  },
  // Content
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 120,
  },
  stepContent: {
    flex: 1,
  },
  stepHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  stepBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 20,
    marginBottom: 16,
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: AppColors.primary,
    letterSpacing: 1,
  },
  stepTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  stepSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  // Step 1 - Input
  inputSection: {
    marginBottom: 32,
  },
  inputWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  inputWrapperFocused: {
    borderColor: AppColors.primary,
  },
  inputGradient: {
    padding: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 56,
  },
  inputIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  inputIconFocused: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  clearBtn: {
    padding: 4,
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
    fontWeight: '600',
  },
  // Suggestions
  suggestionsSection: {
    marginTop: 8,
  },
  suggestionsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  suggestionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  suggestionChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  suggestionChipActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderColor: AppColors.primary,
  },
  suggestionChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
  },
  suggestionChipTextActive: {
    color: AppColors.primary,
  },
  // Step 2 - Languages
  selectedBanner: {
    marginBottom: 24,
    borderRadius: 14,
    overflow: 'hidden',
  },
  selectedBannerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  selectedBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  languagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  langCard: {
    width: CARD_WIDTH,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  langCardSelected: {
    borderColor: 'rgba(139, 92, 246, 0.4)',
  },
  langCardGradient: {
    aspectRatio: 0.85,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    position: 'relative',
  },
  langIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  langName: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  langCheckBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Step 3 - Summary
  summaryCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
    marginBottom: 24,
  },
  summaryCardGradient: {
    padding: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryInfo: {
    flex: 1,
    marginLeft: 14,
  },
  summaryLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 16,
  },
  readyBanner: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  readyBannerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 14,
  },
  readyText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  readyHighlight: {
    color: '#10B981',
    fontWeight: '600',
  },
  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    backgroundColor: 'rgba(10, 10, 15, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(139, 92, 246, 0.1)',
  },
  actionBtn: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  actionBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  actionBtnTextDisabled: {
    color: 'rgba(255,255,255,0.35)',
  },
  actionBtnIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
