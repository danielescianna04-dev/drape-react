import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import { WorkstationInfo } from '../../../shared/types';

interface Props {
  workstation: WorkstationInfo;
  onPress: () => void;
  onDelete: (e: any) => void;
}

export const ProjectItem = ({ workstation, onPress, onDelete }: Props) => {
  return (
    <TouchableOpacity style={styles.projectItem} onPress={onPress}>
      <View style={styles.projectHeader}>
        <Ionicons name="folder" size={16} color={AppColors.primary} />
        <Text style={styles.projectName} numberOfLines={1}>{workstation.name}</Text>
        <TouchableOpacity onPress={onDelete} style={styles.deleteButton}>
          <Ionicons name="trash-outline" size={16} color="#FF4444" />
        </TouchableOpacity>
      </View>
      <View style={styles.projectMeta}>
        {workstation.language && (
          <View style={styles.languageTag}>
            <Text style={styles.languageText}>{workstation.language}</Text>
          </View>
        )}
        <View style={styles.projectStatus}>
          <View style={[styles.statusDot, { backgroundColor: workstation.status === 'running' ? '#00FF88' : '#FFA500' }]} />
          <Text style={styles.statusText}>{workstation.status}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  projectItem: {
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    marginBottom: 8,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  projectName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
  },
  deleteButton: {
    padding: 4,
  },
  projectMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  languageTag: {
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  languageText: {
    color: AppColors.primary,
    fontSize: 10,
    fontWeight: '600',
  },
  projectStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 10,
  },
});
