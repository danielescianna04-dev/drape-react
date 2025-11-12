import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { workstationService } from '../../../core/workstation/workstationService-firebase';
import { AppColors } from '../../../shared/theme/colors';

interface Props {
  visible: boolean;
  filePath: string;
  projectId: string;
  repositoryUrl?: string;
  userId: string;
  onClose: () => void;
}

export const FileViewer = ({
  visible,
  filePath,
  projectId,
  repositoryUrl,
  userId,
  onClose,
}: Props) => {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEdited, setIsEdited] = useState(false);

  useEffect(() => {
    if (visible && filePath) {
      loadFile();
    }
  }, [visible, filePath]);

  const loadFile = async () => {
    try {
      setLoading(true);
      setError(null);
      const fileContent = await workstationService.getFileContent(
        projectId,
        filePath,
        repositoryUrl
      );
      setContent(fileContent);
      setOriginalContent(fileContent);
      setIsEdited(false);
    } catch (err: any) {
      setError(err.message || 'Failed to load file');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await workstationService.saveFileContent(
        projectId,
        filePath,
        content,
        repositoryUrl
      );
      setOriginalContent(content);
      setIsEdited(false);
      Alert.alert('Success', 'File saved successfully');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save file');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (isEdited) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Do you want to save before closing?',
        [
          {
            text: 'Discard',
            style: 'destructive',
            onPress: onClose,
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Save',
            onPress: async () => {
              await handleSave();
              onClose();
            },
          },
        ]
      );
    } else {
      onClose();
    }
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const iconMap: { [key: string]: { icon: string; color: string } } = {
      js: { icon: 'logo-javascript', color: '#F7DF1E' },
      jsx: { icon: 'logo-react', color: '#61DAFB' },
      ts: { icon: 'logo-javascript', color: '#3178C6' },
      tsx: { icon: 'logo-react', color: '#3178C6' },
      py: { icon: 'logo-python', color: '#3776AB' },
      html: { icon: 'logo-html5', color: '#E34F26' },
      css: { icon: 'logo-css3', color: '#1572B6' },
      json: { icon: 'code-working', color: '#FFB800' },
      md: { icon: 'document-text', color: '#888888' },
    };
    return iconMap[ext || ''] || { icon: 'document-outline', color: '#888888' };
  };

  const { icon, color } = getFileIcon(filePath);
  const fileName = filePath.split('/').pop() || filePath;

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <Ionicons name={icon as any} size={20} color={color} style={styles.fileIcon} />
            <View style={styles.fileInfo}>
              <Text style={styles.fileName} numberOfLines={1}>
                {fileName}
              </Text>
              <Text style={styles.filePath} numberOfLines={1}>
                {filePath}
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            {isEdited && (
              <View style={styles.editedIndicator}>
                <View style={styles.editedDot} />
                <Text style={styles.editedText}>Edited</Text>
              </View>
            )}
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.saveButton, (!isEdited || saving) && styles.saveButtonDisabled]}
              disabled={!isEdited || saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="save" size={20} color="white" />
                  <Text style={styles.saveButtonText}>Save</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={AppColors.primary} />
            <Text style={styles.loadingText}>Loading file...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <Ionicons name="alert-circle" size={48} color={AppColors.error} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={loadFile} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            style={styles.editorContainer}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.editorContent}
          >
            <TextInput
              style={styles.editor}
              value={content}
              onChangeText={(text) => {
                setContent(text);
                setIsEdited(text !== originalContent);
              }}
              multiline
              autoCorrect={false}
              autoCapitalize="none"
              spellCheck={false}
              scrollEnabled={false}
              placeholder="Empty file"
              placeholderTextColor="rgba(255, 255, 255, 0.3)"
            />
          </ScrollView>
        )}

        {/* Footer Info */}
        {!loading && !error && (
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {content.split('\n').length} lines • {content.length} characters
            </Text>
            {isEdited && (
              <Text style={styles.footerTextEdited}>Unsaved changes</Text>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  closeButton: {
    padding: 8,
    marginRight: 8,
  },
  fileIcon: {
    marginRight: 12,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 2,
  },
  filePath: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  editedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFB800',
  },
  editedText: {
    fontSize: 12,
    color: '#FFB800',
    fontWeight: '500',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: AppColors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  editorContainer: {
    flex: 1,
  },
  editorContent: {
    padding: 16,
  },
  editor: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: 'white',
    lineHeight: 20,
    minHeight: '100%',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  errorText: {
    marginTop: 16,
    fontSize: 14,
    color: AppColors.error,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: AppColors.primary,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  footerTextEdited: {
    fontSize: 12,
    color: '#FFB800',
    fontWeight: '500',
  },
});
