import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../shared/theme/useTheme';

interface Project {
  id: string;
  name: string;
  lastOpened: string;
  type: 'chat' | 'terminal';
}

interface HomeViewProps {
  onNewProject: () => void;
  onOpenProject: (projectId: string) => void;
  recentProjects?: Project[];
}

export const HomeView: React.FC<HomeViewProps> = ({
  onNewProject,
  onOpenProject,
  recentProjects = [],
}) => {
  const { colors, isDark } = useTheme();

  return (
    <LinearGradient
      colors={isDark 
        ? ['#5946D6', '#6F5CFF', '#090A0B']
        : ['#B6ADFF', '#6F5CFF', '#FFFFFF']
      }
      locations={[0, 0.35, 0.8]}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: '#FFFFFF' }]}>Drape</Text>
          <Text style={[styles.subtitle, { color: 'rgba(255,255,255,0.9)' }]}>
            AI-Powered Mobile IDE
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.newProjectButton, { backgroundColor: '#FFFFFF' }]}
          onPress={onNewProject}
        >
          <Ionicons name="add-circle" size={24} color="#6F5CFF" />
          <Text style={[styles.newProjectText, { color: '#6F5CFF' }]}>
            Nuovo Progetto
          </Text>
        </TouchableOpacity>

        {recentProjects.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={[styles.sectionTitle, { color: '#FFFFFF' }]}>
              Progetti Recenti
            </Text>
            <ScrollView style={styles.projectList}>
              {recentProjects.map((project) => (
                <TouchableOpacity
                  key={project.id}
                  style={[styles.projectCard, { backgroundColor: 'rgba(255,255,255,0.15)' }]}
                  onPress={() => onOpenProject(project.id)}
                >
                  <Ionicons 
                    name={project.type === 'chat' ? 'chatbubble' : 'terminal'} 
                    size={20} 
                    color="#FFFFFF" 
                  />
                  <View style={styles.projectInfo}>
                    <Text style={[styles.projectName, { color: '#FFFFFF' }]}>
                      {project.name}
                    </Text>
                    <Text style={[styles.projectDate, { color: 'rgba(255,255,255,0.7)' }]}>
                      {project.lastOpened}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 48,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '400',
  },
  newProjectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 32,
    gap: 12,
  },
  newProjectText: {
    fontSize: 18,
    fontWeight: '600',
  },
  recentSection: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  projectList: {
    flex: 1,
  },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    gap: 12,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  projectDate: {
    fontSize: 14,
  },
});
