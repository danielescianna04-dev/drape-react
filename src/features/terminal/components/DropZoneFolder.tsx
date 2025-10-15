import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  folder: any;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  children?: React.ReactNode;
}

export const DropZoneFolder = ({ folder, isExpanded, onToggle, onDelete, children }: Props) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.folderItem}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <LinearGradient
          colors={['rgba(182, 173, 255, 0.12)', 'rgba(182, 173, 255, 0.04)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <View style={styles.folderContent}>
            <View style={styles.iconContainer}>
              <Ionicons 
                name={isExpanded ? "folder-open" : "folder"} 
                size={20} 
                color="#B6ADFF" 
              />
            </View>
            <Text style={styles.folderName}>{folder.name}</Text>
            <Ionicons 
              name={isExpanded ? "chevron-down" : "chevron-forward"} 
              size={16} 
              color="rgba(182, 173, 255, 0.6)" 
            />
            <TouchableOpacity 
              onPress={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              style={styles.deleteButton}
            >
              <Ionicons name="trash-outline" size={14} color="#FF6B6B" />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </TouchableOpacity>
      {isExpanded && children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  folderItem: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(182, 173, 255, 0.2)',
    shadowColor: '#6F5CFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  gradient: {
    padding: 16,
  },
  folderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(182, 173, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(182, 173, 255, 0.25)',
  },
  folderName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#B6ADFF',
    letterSpacing: 0.2,
  },
  deleteButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
  },
});
