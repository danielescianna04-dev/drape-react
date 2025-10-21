import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../shared/theme/colors';

interface Props {
  project: any;
  index: number;
  onPress: () => void;
  onDelete: (e: any) => void;
  onDragEnd: (projectId: string, targetFolderId: string | null) => void;
  onReorder: (draggedId: string, targetId: string) => void;
  folders: any[];
  allProjects: any[];
}

export const DraggableProject = ({ project, index, onPress, onDelete, onDragEnd, onReorder, folders, allProjects }: Props) => {
  const [isDragging, setIsDragging] = useState(false);
  const [snapTarget, setSnapTarget] = useState<number | null>(null);
  const pan = new Animated.ValueXY();
  const scale = new Animated.Value(1);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: (_, gestureState) => {
      return Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3;
    },
    onPanResponderGrant: () => {
      Animated.spring(scale, {
        toValue: 1.08,
        useNativeDriver: true,
      }).start();
    },
    onPanResponderMove: (_, gestureState) => {
      const moved = Math.abs(gestureState.dy) > 8;
      if (moved && !isDragging) {
        setIsDragging(true);
      }
      // Solo movimento verticale
      pan.setValue({ x: 0, y: gestureState.dy });
      
      // Calcola quale progetto è sotto il dito
      if (isDragging) {
        const dropY = gestureState.moveY;
        const headerHeight = 250;
        const folderHeight = 60;
        const projectHeight = 80;
        const projectsStartY = headerHeight + (folders.length * folderHeight);
        
        // Trova il progetto più vicino
        let closestIndex = -1;
        let minDistance = Infinity;
        
        allProjects.forEach((proj, idx) => {
          const projectY = projectsStartY + (idx * projectHeight) + (projectHeight / 2);
          const distance = Math.abs(dropY - projectY);
          
          if (distance < minDistance && distance < projectHeight) {
            minDistance = distance;
            closestIndex = idx;
          }
        });
        
        if (closestIndex !== -1 && closestIndex !== index) {
          setSnapTarget(closestIndex);
        } else {
          setSnapTarget(null);
        }
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      const moved = Math.abs(gestureState.dy) > 8;
      
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
      }).start();

      if (!moved) {
        setIsDragging(false);
        setSnapTarget(null);
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: true,
        }).start();
        onPress();
        return;
      }

      setIsDragging(false);
      
      const dropY = gestureState.moveY;
      let targetFolderId: string | null = null;
      let targetProjectId: string | null = null;
      
      const headerHeight = 250;
      const folderHeight = 60;
      
      // Controlla se è su una cartella
      folders.forEach((folder, idx) => {
        const folderTop = headerHeight + (idx * folderHeight);
        const folderBottom = folderTop + folderHeight;
        
        if (dropY >= folderTop && dropY <= folderBottom) {
          targetFolderId = folder.id;
        }
      });
      
      // Se non è su una cartella e c'è uno snap target, riordina
      if (!targetFolderId && snapTarget !== null && snapTarget !== index) {
        targetProjectId = allProjects[snapTarget]?.id;
      }
      
      setSnapTarget(null);
      
      if (targetProjectId) {
        onReorder(project.id, targetProjectId);
      } else if (targetFolderId) {
        onDragEnd(project.id, targetFolderId);
      }
      
      Animated.spring(pan, {
        toValue: { x: 0, y: 0 },
        friction: 7,
        useNativeDriver: true,
      }).start();
    },
  });

  return (
    <>
      {snapTarget === index && isDragging && (
        <View style={styles.dropIndicator} />
      )}
      <Animated.View
        style={[
          styles.container,
          isDragging && styles.dragging,
          {
            transform: [
              ...pan.getTranslateTransform(),
              { scale: scale }
            ],
          },
        ]}
        {...panResponder.panHandlers}
      >
      <View style={styles.content}>
        <LinearGradient
          colors={['rgba(111, 92, 255, 0.08)', 'rgba(111, 92, 255, 0.02)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="cube-outline" size={18} color="#6F5CFF" />
            </View>
            <Text style={styles.name} numberOfLines={1}>{project.name || 'Unnamed Project'}</Text>
            <TouchableOpacity 
              onPress={onDelete} 
              style={styles.deleteButton}
            >
              <Ionicons name="trash-outline" size={16} color="#FF6B6B" />
            </TouchableOpacity>
          </View>
          <View style={styles.meta}>
            {project.language && (
              <View style={styles.languageTag}>
                <View style={styles.languageDot} />
                <Text style={styles.languageText}>{project.language || 'Unknown'}</Text>
              </View>
            )}
            <View style={styles.status}>
              <View style={[styles.statusDot, { backgroundColor: project.status === 'running' ? '#6F5CFF' : '#B6ADFF' }]} />
              <Text style={styles.statusText}>{project.status}</Text>
            </View>
          </View>
        </LinearGradient>
      </View>
    </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  dropIndicator: {
    height: 2,
    backgroundColor: '#6F5CFF',
    marginVertical: 2,
    borderRadius: 1,
    shadowColor: '#6F5CFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  container: {
    marginBottom: 12,
  },
  dragging: {
    opacity: 0.95,
    zIndex: 1000,
    elevation: 10,
  },
  content: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(111, 92, 255, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    backgroundColor: '#1C1C1E',
  },
  gradient: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(111, 92, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(111, 92, 255, 0.2)',
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#EDEDED',
    letterSpacing: 0.2,
  },
  deleteButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  languageTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(111, 92, 255, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(111, 92, 255, 0.2)',
  },
  languageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#6F5CFF',
  },
  languageText: {
    fontSize: 11,
    color: '#B6ADFF',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 8,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
});
