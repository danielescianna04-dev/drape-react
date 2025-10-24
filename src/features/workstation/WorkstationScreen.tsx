import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { WebView } from 'react-native-webview';
import { useWorkstationStore } from '../../core/workstation/workstationStore';
import { AppColors } from '../../shared/theme/colors';

export const WorkstationScreen: React.FC = () => {
  const { projects, activeProject, startProject, stopProject, setActiveProject } = useWorkstationStore();

  const handleProjectAction = (projectId: string, status: string) => {
    if (status === 'idle') {
      startProject(projectId);
    } else if (status === 'running') {
      stopProject(projectId);
    }
  };

  const handleWebViewClick = (project: any) => {
    if (project.status === 'running' && project.webUrl) {
      setActiveProject(project);
    }
  };

  console.log('🟢 Rendering WorkstationScreen'); // Added log
  return (
    <View style={{ flex: 1, backgroundColor: AppColors.dark.background }}>
      {/* Project List */}
      <View style={{ height: 200, padding: 16 }}>
        <Text style={{ color: AppColors.dark.text, fontSize: 18, marginBottom: 16 }}>
          Projects
        </Text>
        <ScrollView>
          {projects.map(project => (
            <View key={project.id} style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 12,
              backgroundColor: AppColors.dark.surface,
              borderRadius: 8,
              marginBottom: 8
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: AppColors.dark.text, fontWeight: 'bold' }}>
                  {project.name}
                </Text>
                <Text style={{ color: AppColors.dark.textSecondary, fontSize: 12 }}>
                  {project.type} • {project.status}
                </Text>
              </View>
              
                            <TouchableOpacity
              
                              onPress={() => handleProjectAction(project.id, project.status)}
              
                              style={{
              
                                backgroundColor: project.status === 'running' ? AppColors.dark.error : AppColors.dark.primary,
              
                                paddingHorizontal: 12,
              
                                paddingVertical: 6,
              
                                borderRadius: 4,
              
                                marginRight: 8
              
                              }}
              
                            >
              
                              <Text style={{ color: 'white', fontSize: 12 }}>
              
                                {project.status === 'idle' ? 'Start' : project.status === 'starting' ? '...' : project.status === 'running' ? 'Stop' : '...'}
              
                              </Text>
              
                            </TouchableOpacity>

              {project.status === 'running' && (
                <TouchableOpacity
                  onPress={() => handleWebViewClick(project)}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: AppColors.dark.success,
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Text style={{ color: 'white', fontSize: 12 }}>👁</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Web View */}
      <View style={{ flex: 1, margin: 16, borderRadius: 8, overflow: 'hidden' }}>
        {activeProject?.webUrl ? (
          <WebView
            source={{ uri: activeProject.webUrl }}
            style={{ flex: 1 }}
            startInLoadingState
          />
        ) : (
          <View style={{
            flex: 1,
            backgroundColor: AppColors.dark.surface,
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Text style={{ color: AppColors.dark.textSecondary }}>
              Select a running project to view
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};
