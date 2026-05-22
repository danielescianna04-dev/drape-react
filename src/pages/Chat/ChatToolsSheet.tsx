import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';

interface RecentPhoto {
  id: string;
  uri: string;
}

export type ProjectToolSection = 'files' | 'preview' | 'terminal' | 'git' | 'database' | 'plugin' | 'mcp';

interface ChatToolsSheetProps {
  styles: any;
  visible: boolean;
  toolsBackdropStyle: any;
  toolsSheetStyle: any;
  recentPhotos: RecentPhoto[];
  selectedPhotoIds: Set<string>;
  selectedInputImagesCount: number;
  onToggleSheet: () => void;
  onTogglePhoto: (photoId: string) => void;
  onSendSelectedPhotos: () => void;
  onPickImageFromLibrary: () => void;
  onOpenProjectSection?: (section: ProjectToolSection) => void;
  labels: {
    allPhotos: string;
    maxImagesTitle: string;
    maxImagesMessage: string;
    selectPhotos: string;
    selectPhotosPlural: string;
    photoPickerTitle: string;
    photoPickerSubtitle: string;
  };
}

const PROJECT_TOOLS: Array<{ section: ProjectToolSection; icon: keyof typeof Ionicons.glyphMap; label: string }> = [
  { section: 'files', icon: 'folder-outline', label: 'File del progetto' },
  { section: 'preview', icon: 'eye-outline', label: 'Preview' },
  { section: 'terminal', icon: 'terminal-outline', label: 'Terminale' },
  { section: 'git', icon: 'git-branch-outline', label: 'Git' },
  { section: 'database', icon: 'server-outline', label: 'Database' },
  { section: 'plugin', icon: 'cube-outline', label: 'Plugin' },
  { section: 'mcp', icon: 'extension-puzzle-outline', label: 'MCP' },
];

export const ChatToolsSheet: React.FC<ChatToolsSheetProps> = ({
  styles,
  visible,
  toolsBackdropStyle,
  toolsSheetStyle,
  recentPhotos,
  selectedPhotoIds,
  selectedInputImagesCount,
  onToggleSheet,
  onTogglePhoto,
  onSendSelectedPhotos,
  onPickImageFromLibrary,
  onOpenProjectSection,
  labels,
}) => (
  <>
    {visible && (
      <Pressable style={StyleSheet.absoluteFill} onPress={onToggleSheet}>
        <Animated.View style={[styles.sheetBackdrop, toolsBackdropStyle]} />
      </Pressable>
    )}
    <Animated.View style={[styles.toolsSheet, styles.toolsSheetSolid, toolsSheetStyle]}>
      <View style={styles.sheetGradient}>
        <View style={styles.sheetHandle} />

          <View style={styles.toolsList}>
            <TouchableOpacity style={styles.toolItem} activeOpacity={0.7} onPress={onPickImageFromLibrary}>
              <View style={styles.toolIconContainer}>
                <Ionicons name="images-outline" size={20} color="rgba(255,255,255,0.8)" />
              </View>
              <View style={styles.toolTextContainer}>
                <Text style={styles.toolTitle}>{labels.photoPickerTitle}</Text>
                <Text style={styles.toolSubtitle}>{labels.photoPickerSubtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>

            {PROJECT_TOOLS.map((tool) => (
              <TouchableOpacity
                key={tool.section}
                style={styles.toolItem}
                activeOpacity={0.7}
                onPress={() => onOpenProjectSection?.(tool.section)}
              >
                <View style={styles.toolIconContainer}>
                  <Ionicons name={tool.icon} size={20} color="rgba(255,255,255,0.8)" />
                </View>
                <View style={styles.toolTextContainer}>
                  <Text style={styles.toolTitle}>{tool.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            ))}
          </View>
      </View>
    </Animated.View>
  </>
);
