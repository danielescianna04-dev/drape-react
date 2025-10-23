import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../shared/theme/colors';

interface Props {
  onCreateProject: () => void;
  onImportProject: () => void;
  onMyProjects: () => void;
}

// Mock recent projects - sostituire con dati reali da Firestore
const recentProjects = [
  { id: '1', name: 'sitoPacifica', language: 'React', lastOpened: '2 hours ago' },
  { id: '2', name: 'drape-backend', language: 'Node.js', lastOpened: '1 day ago' },
];

export const ProjectsHomeScreen = ({ onCreateProject, onImportProject, onMyProjects }: Props) => {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#0a0a0f', '#1a0a2e', '#000000']}
        locations={[0, 0.3, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.logo}>
            <Ionicons name="code-slash" size={32} color={AppColors.primary} />
          </View>
          <Text style={styles.title}>Drape</Text>
          <Text style={styles.subtitle}>Mobile AI IDE</Text>
        </View>

        <View style={styles.buttonsContainer}>
          <TouchableOpacity 
            style={styles.button} 
            onPress={onCreateProject}
            activeOpacity={0.7}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="add-circle-outline" size={24} color="rgba(255, 255, 255, 0.9)" />
            </View>
            <View style={styles.buttonText}>
              <Text style={styles.buttonTitle}>Create Project</Text>
              <Text style={styles.buttonSubtitle}>Start a new project from scratch</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255, 255, 255, 0.2)" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.button} 
            onPress={onImportProject}
            activeOpacity={0.7}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="cloud-download-outline" size={24} color="rgba(255, 255, 255, 0.9)" />
            </View>
            <View style={styles.buttonText}>
              <Text style={styles.buttonTitle}>Import Project</Text>
              <Text style={styles.buttonSubtitle}>Clone from GitHub repository</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255, 255, 255, 0.2)" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.button} 
            onPress={onMyProjects}
            activeOpacity={0.7}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="folder-open-outline" size={24} color="rgba(255, 255, 255, 0.9)" />
            </View>
            <View style={styles.buttonText}>
              <Text style={styles.buttonTitle}>My Projects</Text>
              <Text style={styles.buttonSubtitle}>Open existing projects</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255, 255, 255, 0.2)" />
          </TouchableOpacity>
        </View>

        {recentProjects.length > 0 && (
          <View style={styles.recentSection}>
            <View style={styles.recentHeader}>
              <Text style={styles.recentTitle}>Recent</Text>
              <TouchableOpacity onPress={onMyProjects}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>

            {recentProjects.map((project) => (
              <TouchableOpacity 
                key={project.id}
                style={styles.recentProject}
                activeOpacity={0.7}
              >
                <View style={styles.projectIcon}>
                  <Ionicons name="folder" size={20} color={AppColors.primary} />
                </View>
                <View style={styles.projectInfo}>
                  <Text style={styles.projectName}>{project.name}</Text>
                  <Text style={styles.projectMeta}>{project.language} • {project.lastOpened}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(255, 255, 255, 0.2)" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.footer}>Powered by AI • Built for Mobile</Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  title: {
    fontSize: 42,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.4)',
    fontWeight: '500',
  },
  buttonsContainer: {
    gap: 12,
    marginBottom: 32,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    flex: 1,
  },
  buttonTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  buttonSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  recentSection: {
    marginTop: 8,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  recentTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.6)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  seeAll: {
    fontSize: 14,
    color: AppColors.primary,
    fontWeight: '500',
  },
  recentProject: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
    marginBottom: 8,
  },
  projectIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  projectMeta: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.25)',
    marginTop: 32,
  },
});
