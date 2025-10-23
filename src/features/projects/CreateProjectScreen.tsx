import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../shared/theme/colors';

interface Props {
  onBack: () => void;
  onCreate: (projectData: any) => void;
}

const languages = [
  { id: 'javascript', name: 'JavaScript', icon: 'logo-javascript', color: '#F7DF1E', desc: 'Web scripting' },
  { id: 'typescript', name: 'TypeScript', icon: 'logo-javascript', color: '#3178C6', desc: 'Typed JavaScript' },
  { id: 'python', name: 'Python', icon: 'logo-python', color: '#3776AB', desc: 'Versatile language' },
  { id: 'java', name: 'Java', icon: 'logo-java', color: '#007396', desc: 'Enterprise apps' },
  { id: 'cpp', name: 'C++', icon: 'code-slash', color: '#00599C', desc: 'High performance' },
  { id: 'c', name: 'C', icon: 'code-slash', color: '#A8B9CC', desc: 'System programming' },
  { id: 'csharp', name: 'C#', icon: 'code-slash', color: '#239120', desc: '.NET framework' },
  { id: 'go', name: 'Go', icon: 'code-slash', color: '#00ADD8', desc: 'Google language' },
  { id: 'rust', name: 'Rust', icon: 'code-slash', color: '#CE422B', desc: 'Memory safe' },
  { id: 'php', name: 'PHP', icon: 'logo-php', color: '#777BB4', desc: 'Web backend' },
  { id: 'ruby', name: 'Ruby', icon: 'code-slash', color: '#CC342D', desc: 'Rails framework' },
  { id: 'swift', name: 'Swift', icon: 'logo-apple', color: '#FA7343', desc: 'iOS development' },
  { id: 'kotlin', name: 'Kotlin', icon: 'logo-android', color: '#7F52FF', desc: 'Android apps' },
  { id: 'dart', name: 'Dart', icon: 'code-slash', color: '#0175C2', desc: 'Flutter apps' },
  { id: 'react', name: 'React', icon: 'logo-react', color: '#61DAFB', desc: 'UI library' },
  { id: 'vue', name: 'Vue.js', icon: 'logo-vue', color: '#42B883', desc: 'Progressive framework' },
  { id: 'angular', name: 'Angular', icon: 'logo-angular', color: '#DD0031', desc: 'Full framework' },
  { id: 'node', name: 'Node.js', icon: 'logo-nodejs', color: '#68A063', desc: 'JavaScript runtime' },
  { id: 'html', name: 'HTML/CSS', icon: 'logo-html5', color: '#E34F26', desc: 'Web fundamentals' },
  { id: 'sql', name: 'SQL', icon: 'server', color: '#4479A1', desc: 'Database queries' },
];

export const CreateProjectScreen = ({ onBack, onCreate }: Props) => {
  const [step, setStep] = useState(1);
  const [projectName, setProjectName] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [createGitHubRepo, setCreateGitHubRepo] = useState(false);

  const handleCreate = () => {
    onCreate({ 
      name: projectName, 
      language: selectedLanguage, 
      template: 'blank',
      createGitHubRepo 
    });
  };

  const canProceed = () => {
    if (step === 1) return projectName.trim().length > 0;
    if (step === 2) return selectedLanguage !== '';
    return true;
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#000000', '#0a0a0f', '#1a0a2e', '#000000']} locations={[0, 0.3, 0.6, 1]} style={StyleSheet.absoluteFill} />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Create Project</Text>
          <Text style={styles.headerSubtitle}>Step {step} of 3</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.progressDots}>
        {[1, 2, 3].map((dot) => (
          <View key={dot} style={[styles.dot, dot === step && styles.dotActive, dot < step && styles.dotCompleted]} />
        ))}
      </View>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {step === 1 && (
          <View style={styles.step}>
            <View style={styles.heroContainer}>
              <LinearGradient
                colors={['rgba(139, 92, 246, 0.2)', 'rgba(139, 92, 246, 0.05)']}
                style={styles.heroGradient}
              >
                <View style={styles.floatingIcon}>
                  <Ionicons name="rocket" size={64} color={AppColors.primary} />
                </View>
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>Let's create something amazing</Text>
            <Text style={styles.stepSubtitle}>Give your project a name to get started</Text>
            <View style={styles.inputWrapper}>
              <View style={styles.inputLabel}>
                <Ionicons name="folder" size={16} color="rgba(255, 255, 255, 0.5)" />
                <Text style={styles.inputLabelText}>Project Name</Text>
              </View>
              <View style={styles.inputContainer}>
                <TextInput 
                  style={styles.input} 
                  placeholder="my-awesome-project" 
                  placeholderTextColor="rgba(255, 255, 255, 0.3)" 
                  value={projectName} 
                  onChangeText={setProjectName} 
                  autoFocus 
                  autoCapitalize="none" 
                  autoCorrect={false} 
                />
                {projectName.length > 0 && (
                  <View style={styles.checkIcon}>
                    <Ionicons name="checkmark-circle" size={24} color={AppColors.primary} />
                  </View>
                )}
              </View>
              {projectName.length > 0 && (
                <View style={styles.successHint}>
                  <View style={styles.successDot} />
                  <Text style={styles.successText}>Perfect! Ready to continue</Text>
                </View>
              )}
            </View>
            <View style={styles.examplesContainer}>
              <Text style={styles.examplesTitle}>Examples:</Text>
              <View style={styles.exampleChips}>
                {['portfolio-site', 'todo-app', 'api-server'].map((example) => (
                  <TouchableOpacity
                    key={example}
                    style={styles.exampleChip}
                    onPress={() => setProjectName(example)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.exampleText}>{example}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}
        {step === 2 && (
          <View style={styles.step}>
            <View style={styles.stepIconContainer}>
              <Ionicons name="code-slash" size={40} color={AppColors.primary} />
            </View>
            <Text style={styles.stepTitle}>Choose language</Text>
            <Text style={styles.stepSubtitle}>A blank project structure will be created</Text>
            <View style={styles.languagesGrid}>
              {languages.map((lang) => (
                <TouchableOpacity key={lang.id} style={[styles.languageCard, selectedLanguage === lang.id && styles.languageCardSelected]} onPress={() => setSelectedLanguage(lang.id)} activeOpacity={0.7}>
                  <Ionicons name={lang.icon as any} size={36} color={lang.color} />
                  <Text style={styles.languageName}>{lang.name}</Text>
                  <Text style={styles.languageDesc}>{lang.desc}</Text>
                  {selectedLanguage === lang.id && (
                    <View style={styles.checkBadge}>
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        {step === 3 && (
          <View style={styles.step}>
            <View style={styles.stepIconContainer}>
              <Ionicons name="logo-github" size={40} color="#FFFFFF" />
            </View>
            <Text style={styles.stepTitle}>GitHub Repository</Text>
            <Text style={styles.stepSubtitle}>Optional: Create a new GitHub repo</Text>
            <View style={styles.optionsList}>
              <TouchableOpacity style={[styles.optionCard, createGitHubRepo && styles.optionCardSelected]} onPress={() => setCreateGitHubRepo(true)} activeOpacity={0.7}>
                <View style={styles.optionIcon}>
                  <Ionicons name="logo-github" size={24} color={createGitHubRepo ? AppColors.primary : 'rgba(255, 255, 255, 0.6)'} />
                </View>
                <View style={styles.optionInfo}>
                  <Text style={styles.optionTitle}>Create GitHub Repo</Text>
                  <Text style={styles.optionDesc}>Initialize with README and .gitignore</Text>
                </View>
                {createGitHubRepo && <Ionicons name="checkmark-circle" size={24} color={AppColors.primary} />}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.optionCard, !createGitHubRepo && styles.optionCardSelected]} onPress={() => setCreateGitHubRepo(false)} activeOpacity={0.7}>
                <View style={styles.optionIcon}>
                  <Ionicons name="close-circle-outline" size={24} color={!createGitHubRepo ? AppColors.primary : 'rgba(255, 255, 255, 0.6)'} />
                </View>
                <View style={styles.optionInfo}>
                  <Text style={styles.optionTitle}>Skip for now</Text>
                  <Text style={styles.optionDesc}>You can add it later</Text>
                </View>
                {!createGitHubRepo && <Ionicons name="checkmark-circle" size={24} color={AppColors.primary} />}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
      <View style={styles.footer}>
        {step > 1 && (
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep(step - 1)}>
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.primaryButton, !canProceed() && styles.buttonDisabled, step === 1 && { flex: 1 }]} onPress={() => (step < 3 ? setStep(step + 1) : handleCreate())} disabled={!canProceed()}>
          <Text style={styles.primaryButtonText}>{step === 3 ? 'Create Project' : 'Continue'}</Text>
          <Ionicons name={step === 3 ? 'checkmark' : 'arrow-forward'} size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#FFFFFF' },
  headerSubtitle: { fontSize: 12, color: 'rgba(255, 255, 255, 0.4)', marginTop: 2 },
  progressDots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255, 255, 255, 0.2)' },
  dotActive: { backgroundColor: AppColors.primary, width: 24 },
  dotCompleted: { backgroundColor: AppColors.primary },
  content: { flex: 1, paddingHorizontal: 24 },
  step: { paddingBottom: 40 },
  heroContainer: { alignSelf: 'center', marginBottom: 32 },
  heroGradient: { width: 160, height: 160, borderRadius: 80, alignItems: 'center', justifyContent: 'center' },
  floatingIcon: { transform: [{ translateY: -4 }] },
  stepIconContainer: { width: 72, height: 72, borderRadius: 18, backgroundColor: 'rgba(139, 92, 246, 0.1)', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 20, borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.2)' },
  stepTitle: { fontSize: 26, fontWeight: '700', color: '#FFFFFF', marginBottom: 8, textAlign: 'center' },
  stepSubtitle: { fontSize: 15, color: 'rgba(255, 255, 255, 0.5)', textAlign: 'center', marginBottom: 32 },
  inputWrapper: { marginBottom: 24 },
  inputLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, paddingHorizontal: 4 },
  inputLabelText: { fontSize: 13, fontWeight: '600', color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', letterSpacing: 0.5 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', height: 60, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 16, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.1)', paddingHorizontal: 20, gap: 12 },
  input: { flex: 1, fontSize: 17, color: '#FFFFFF', fontWeight: '500' },
  checkIcon: { transform: [{ scale: 1.1 }] },
  successHint: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 4 },
  successDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: AppColors.primary },
  successText: { fontSize: 13, color: AppColors.primary, fontWeight: '500' },
  examplesContainer: { marginTop: 8 },
  examplesTitle: { fontSize: 12, fontWeight: '600', color: 'rgba(255, 255, 255, 0.4)', marginBottom: 10, paddingHorizontal: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  exampleChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  exampleChip: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' },
  exampleText: { fontSize: 13, color: 'rgba(255, 255, 255, 0.6)', fontWeight: '500' },
  languagesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  languageCard: { width: '31%', aspectRatio: 1, backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: 14, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.06)', alignItems: 'center', justifyContent: 'center', padding: 12, position: 'relative' },
  languageCardSelected: { borderColor: AppColors.primary, backgroundColor: 'rgba(139, 92, 246, 0.1)', transform: [{ scale: 1.02 }] },
  languageIconCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  languageName: { fontSize: 13, fontWeight: '600', color: '#FFFFFF', textAlign: 'center' },
  selectedBadge: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: AppColors.primary, alignItems: 'center', justifyContent: 'center' },
  languagesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  languageCard: { width: '48%', aspectRatio: 1, backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: 16, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.06)', alignItems: 'center', justifyContent: 'center', padding: 16, position: 'relative' },
  languageCardSelected: { borderColor: AppColors.primary, backgroundColor: 'rgba(139, 92, 246, 0.08)' },
  languageName: { fontSize: 16, fontWeight: '600', color: '#FFFFFF', marginTop: 12 },
  languageDesc: { fontSize: 12, color: 'rgba(255, 255, 255, 0.4)', marginTop: 4, textAlign: 'center' },
  checkBadge: { position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: AppColors.primary, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: 24, paddingVertical: 20, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.05)' },
  secondaryButton: { flex: 1, height: 52, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  primaryButton: { flex: 1, height: 52, backgroundColor: AppColors.primary, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  optionsList: { gap: 12 },
  optionCard: { flexDirection: 'row', alignItems: 'center', padding: 18, backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: 14, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.06)', gap: 14 },
  optionCardSelected: { borderColor: AppColors.primary, backgroundColor: 'rgba(139, 92, 246, 0.08)' },
  optionIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(255, 255, 255, 0.05)', alignItems: 'center', justifyContent: 'center' },
  optionInfo: { flex: 1 },
  optionTitle: { fontSize: 17, fontWeight: '600', color: '#FFFFFF', marginBottom: 4 },
  optionDesc: { fontSize: 13, color: 'rgba(255, 255, 255, 0.5)' },
});
