import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { AppColors } from '../../shared/theme/colors';
import { workstationService } from '../../core/workstation/workstationService-firebase';

interface Props {
  onCreateProject: () => void;
  onImportProject: () => void;
  onMyProjects: () => void;
  onOpenProject: (workstation: any) => void;
}

export const ProjectsHomeScreen = ({ onCreateProject, onImportProject, onMyProjects, onOpenProject }: Props) => {
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecentProjects();
  }, []);

  const loadRecentProjects = async () => {
    try {
      const workstations = await workstationService.getWorkstations();
      const recent = workstations
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 8);
      setRecentProjects(recent);
    } catch (error) {
      console.error('Error loading recent projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'now';
  };

  const handleBrowseFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        Alert.alert('File Selected', `${file.name}\nSize: ${(file.size || 0) / 1024} KB`);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to open file picker');
    }
  };

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
          <View>
            <Text style={styles.title}>Drape</Text>
            <Text style={styles.subtitle}>Mobile AI IDE</Text>
          </View>
          <TouchableOpacity style={styles.profileButton} activeOpacity={0.7}>
            <Ionicons name="person-circle-outline" size={32} color="rgba(255, 255, 255, 0.6)" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.grid}>
            <TouchableOpacity style={styles.card} onPress={onCreateProject} activeOpacity={0.7}>
              <Ionicons name="add-circle-outline" size={32} color={AppColors.primary} />
              <Text style={styles.cardTitle}>Create</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.card} onPress={onImportProject} activeOpacity={0.7}>
              <Ionicons name="cloud-download-outline" size={32} color={AppColors.primary} />
              <Text style={styles.cardTitle}>Import</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.card} onPress={handleBrowseFiles} activeOpacity={0.7}>
              <Ionicons name="folder-open-outline" size={32} color={AppColors.primary} />
              <Text style={styles.cardTitle}>Browse</Text>
            </TouchableOpacity>
          </View>
        </View>

        {recentProjects.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>I miei progetti</Text>
              <TouchableOpacity onPress={onMyProjects}>
                <Ionicons name="arrow-forward" size={18} color="rgba(255, 255, 255, 0.4)" />
              </TouchableOpacity>
            </View>
            
            {recentProjects.map((project) => (
              <TouchableOpacity 
                key={project.id}
                style={styles.projectItem}
                activeOpacity={0.7}
                onPress={() => onOpenProject(project)}
              >
                <View style={styles.projectLeft}>
                  <View style={styles.projectIconContainer}>
                    <Ionicons name="folder" size={18} color={AppColors.primary} />
                  </View>
                  <View style={styles.projectDetails}>
                    <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
                    <Text style={styles.projectMeta}>{project.language || 'Unknown'}</Text>
                  </View>
                </View>
                <Text style={styles.projectTime}>{getTimeAgo(project.createdAt)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
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
    paddingHorizontal: 20,
    paddingTop: 80,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 48,
  },
  profileButton: {
    padding: 4,
  },
  title: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -2,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  section: {
    marginBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    paddingVertical: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  projectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 4,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  projectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  projectIconContainer: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectDetails: {
    flex: 1,
  },
  projectName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  projectMeta: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  projectTime: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.3)',
    fontWeight: '500',
  },
});
