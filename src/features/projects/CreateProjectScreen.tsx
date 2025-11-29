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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../shared/theme/colors';
import { workstationService } from '../../core/workstation/workstationService-firebase';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
      const userId = 'anonymous';
      const project = await workstationService.savePersonalProject(projectName, userId);

      const workstation = {
        id: project.id,
        projectId: project.id,
        name: projectName,
        language: selectedLanguage,
        status: 'creating' as const,
        createdAt: new Date(),
        files: [],
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

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {[1, 2, 3].map((s) => (
        <React.Fragment key={s}>
          <View style={[styles.stepDot, step >= s && styles.stepDotActive]}>
            {step > s ? (
              <Ionicons name="checkmark" size={14} color="#fff" />
            ) : (
              <Text style={[styles.stepNumber, step >= s && styles.stepNumberActive]}>{s}</Text>
            )}
          </View>
          {s < 3 && (
            <View style={styles.stepLineContainer}>
              <View style={[styles.stepLine, step > s && styles.stepLineActive]} />
            </View>
          )}
        </React.Fragment>
      ))}
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeader}>
        <View style={styles.stepIconContainer}>
          <LinearGradient
            colors={[AppColors.primary, '#9333EA']}
            style={styles.stepIconGradient}
          >
            <Ionicons name="create-outline" size={28} color="#fff" />
          </LinearGradient>
        </View>
        <Text style={styles.stepTitle}>Dai un nome al progetto</Text>
        <Text style={styles.stepSubtitle}>Scegli un nome unico per identificarlo</Text>
      </View>

      <View style={[styles.inputWrapper, inputFocused && styles.inputWrapperFocused]}>
        <LinearGradient
          colors={inputFocused ? ['rgba(139, 92, 246, 0.15)', 'rgba(147, 51, 234, 0.1)'] : ['rgba(255,255,255,0.03)', 'rgba(255,255,255,0.01)']}
          style={styles.inputGradient}
        >
          <View style={styles.inputContainer}>
            <View style={[styles.inputIcon, inputFocused && styles.inputIconFocused]}>
              <Ionicons name="folder" size={18} color={inputFocused ? AppColors.primary : 'rgba(255,255,255,0.4)'} />
            </View>
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              placeholder="es. mia-app"
              placeholderTextColor="rgba(255,255,255,0.25)"
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
                <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>
      </View>

      <View style={styles.suggestions}>
        <Text style={styles.suggestionsLabel}>Idee rapide</Text>
        <View style={styles.suggestionChips}>
          {['portfolio', 'todo-app', 'api-server', 'landing-page'].map((name) => (
            <TouchableOpacity
              key={name}
              style={[styles.suggestionChip, projectName === name && styles.suggestionChipActive]}
              onPress={() => setProjectName(name)}
            >
              <Text style={[styles.suggestionChipText, projectName === name && styles.suggestionChipTextActive]}>
                {name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeader}>
        <View style={styles.stepIconContainer}>
          <LinearGradient
            colors={[AppColors.primary, '#9333EA']}
            style={styles.stepIconGradient}
          >
            <Ionicons name="code-slash" size={28} color="#fff" />
          </LinearGradient>
        </View>
        <Text style={styles.stepTitle}>Scegli il linguaggio</Text>
        <Text style={styles.stepSubtitle}>Quale tecnologia userai?</Text>
      </View>

      {selectedLang && (
        <View style={styles.selectedLanguageBar}>
          <LinearGradient
            colors={[`${selectedLang.color}20`, `${selectedLang.color}10`]}
            style={styles.selectedLanguageGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Ionicons name={selectedLang.icon as any} size={18} color={selectedLang.color} />
            <Text style={[styles.selectedLanguageText, { color: selectedLang.color }]}>
              {selectedLang.name} selezionato
            </Text>
            <Ionicons name="checkmark-circle" size={18} color={selectedLang.color} />
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
              {isSelected && (
                <LinearGradient
                  colors={[`${lang.color}25`, `${lang.color}10`]}
                  style={StyleSheet.absoluteFill}
                />
              )}
              <View style={[styles.langIcon, { backgroundColor: `${lang.color}15` }]}>
                <Ionicons name={lang.icon as any} size={24} color={lang.color} />
              </View>
              <Text style={[styles.langName, isSelected && { color: '#fff' }]}>
                {lang.name}
              </Text>
              {isSelected && (
                <View style={[styles.langCheck, { backgroundColor: lang.color }]}>
                  <Ionicons name="checkmark" size={10} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeader}>
        <View style={styles.stepIconContainer}>
          <LinearGradient
            colors={['#10B981', '#059669']}
            style={styles.stepIconGradient}
          >
            <Ionicons name="rocket" size={28} color="#fff" />
          </LinearGradient>
        </View>
        <Text style={styles.stepTitle}>Tutto pronto!</Text>
        <Text style={styles.stepSubtitle}>Controlla i dettagli del progetto</Text>
      </View>

      <View style={styles.summaryCard}>
        <LinearGradient
          colors={['rgba(139, 92, 246, 0.08)', 'rgba(147, 51, 234, 0.04)']}
          style={styles.summaryGradient}
        >
          <View style={styles.summaryItem}>
            <View style={styles.summaryIconWrapper}>
              <Ionicons name="folder" size={18} color={AppColors.primary} />
            </View>
            <View style={styles.summaryInfo}>
              <Text style={styles.summaryLabel}>Nome progetto</Text>
              <Text style={styles.summaryValue}>{projectName}</Text>
            </View>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryItem}>
            <View style={[styles.summaryIconWrapper, { backgroundColor: `${selectedLang?.color}15` }]}>
              <Ionicons name={selectedLang?.icon as any} size={18} color={selectedLang?.color} />
            </View>
            <View style={styles.summaryInfo}>
              <Text style={styles.summaryLabel}>Linguaggio</Text>
              <Text style={[styles.summaryValue, { color: selectedLang?.color }]}>{selectedLang?.name}</Text>
            </View>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryItem}>
            <View style={styles.summaryIconWrapper}>
              <Ionicons name="document-text" size={18} color={AppColors.primary} />
            </View>
            <View style={styles.summaryInfo}>
              <Text style={styles.summaryLabel}>Tipo</Text>
              <Text style={styles.summaryValue}>Progetto vuoto</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      <View style={styles.readyMessage}>
        <Ionicons name="sparkles" size={20} color="#A78BFA" />
        <Text style={styles.readyText}>
          Premi "Crea" per iniziare a programmare!
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Background */}
      <LinearGradient
        colors={['#0A0A0F', '#0F0A1A', '#0A0A0F']}
        style={StyleSheet.absoluteFill}
      />

      {/* Decorative glow */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Ionicons name={step === 1 ? "close" : "chevron-back"} size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Nuovo Progetto</Text>
          <Text style={styles.headerStep}>Passo {step}/3</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {/* Step Indicator */}
      {renderStepIndicator()}

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
              colors={canProceed ? [AppColors.primary, '#9333EA'] : ['#1F1F2E', '#1A1A26']}
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
                    <View style={styles.actionBtnIcon}>
                      <Ionicons name={step === 3 ? "checkmark" : "chevron-forward"} size={18} color="#fff" />
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
  glowTop: {
    position: 'absolute',
    top: -150,
    left: -100,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(147, 51, 234, 0.06)',
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  headerStep: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  // Step Indicator
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 50,
    paddingVertical: 16,
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  stepDotActive: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  stepNumber: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.3)',
  },
  stepNumberActive: {
    color: '#fff',
  },
  stepLineContainer: {
    width: 50,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 8,
    borderRadius: 1,
    overflow: 'hidden',
  },
  stepLine: {
    width: '0%',
    height: '100%',
    backgroundColor: AppColors.primary,
  },
  stepLineActive: {
    width: '100%',
  },
  // Content
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  stepContent: {
    flex: 1,
  },
  stepHeader: {
    alignItems: 'center',
    marginBottom: 28,
  },
  stepIconContainer: {
    marginBottom: 16,
  },
  stepIconGradient: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
    textAlign: 'center',
  },
  stepSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
  // Input
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
    height: 52,
  },
  inputIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
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
  // Suggestions
  suggestions: {
    marginTop: 24,
  },
  suggestionsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
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
    borderColor: 'rgba(255,255,255,0.06)',
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
  // Selected language bar
  selectedLanguageBar: {
    marginBottom: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  selectedLanguageGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  selectedLanguageText: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Languages grid
  languagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  langCard: {
    width: CARD_WIDTH,
    aspectRatio: 0.9,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.05)',
    position: 'relative',
    overflow: 'hidden',
  },
  langCardSelected: {
    borderColor: 'rgba(139, 92, 246, 0.5)',
  },
  langIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  langName: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  langCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Summary
  summaryCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
  },
  summaryGradient: {
    padding: 20,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  summaryInfo: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 16,
  },
  // Ready message
  readyMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    gap: 8,
  },
  readyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 34,
    backgroundColor: 'rgba(10, 10, 15, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(139, 92, 246, 0.1)',
  },
  actionBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  actionBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  actionBtnTextDisabled: {
    color: 'rgba(255,255,255,0.3)',
  },
  actionBtnIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
