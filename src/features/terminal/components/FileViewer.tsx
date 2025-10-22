import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import { githubTokenService } from '../../../core/github/githubTokenService';
import axios from 'axios';

interface Props {
  visible: boolean;
  projectId: string;
  filePath: string;
  repositoryUrl: string;
  userId: string;
  onClose: () => void;
}

interface OpenFile {
  path: string;
  content: string;
  originalContent: string;
  sha: string;
  hasChanges: boolean;
}

export const FileViewer = ({ visible, projectId, filePath, repositoryUrl, userId, onClose }: Props) => {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const editorRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible && filePath) {
      openFile(filePath);
    }
  }, [visible, filePath]);

  const activeFile = openFiles[activeFileIndex];

  const openFile = async (path: string) => {
    // Check if already open
    const existingIndex = openFiles.findIndex(f => f.path === path);
    if (existingIndex >= 0) {
      setActiveFileIndex(existingIndex);
      return;
    }

    // Load new file
    try {
      setLoading(true);
      const match = repositoryUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
      if (!match) return;

      const [, owner, repo] = match;
      
      const token = await githubTokenService.getTokenForRepo(repositoryUrl, userId);
      const headers: any = { 'User-Agent': 'Drape-App' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      let response;
      try {
        response = await axios.get(
          `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=main`,
          { headers }
        );
      } catch (error) {
        response = await axios.get(
          `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=master`,
          { headers }
        );
      }

      if (response.data.content) {
        const decoded = atob(response.data.content.replace(/\n/g, ''));
        const newFile: OpenFile = {
          path,
          content: decoded,
          originalContent: decoded,
          sha: response.data.sha,
          hasChanges: false
        };
        
        setOpenFiles([...openFiles, newFile]);
        setActiveFileIndex(openFiles.length);
        setHistory([decoded]);
        setHistoryIndex(0);
      }
    } catch (error: any) {
      console.error('Error loading file:', error);
    } finally {
      setLoading(false);
    }
  };

  const closeFile = (index: number) => {
    const newFiles = openFiles.filter((_, i) => i !== index);
    setOpenFiles(newFiles);
    
    if (newFiles.length === 0) {
      onClose();
    } else if (activeFileIndex >= newFiles.length) {
      setActiveFileIndex(newFiles.length - 1);
    }
  };

  const saveFile = async () => {
    if (!activeFile) return;
    
    try {
      setSaving(true);
      const match = repositoryUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
      if (!match) return;

      const [, owner, repo] = match;
      
      const token = await githubTokenService.getTokenForRepo(repositoryUrl, userId);
      if (!token) {
        Alert.alert('Errore', 'Token GitHub non trovato. Autentica prima.');
        return;
      }

      const headers = {
        'User-Agent': 'Drape-App',
        'Authorization': `Bearer ${token}`
      };

      const encodedContent = btoa(activeFile.content);
      
      await axios.put(
        `https://api.github.com/repos/${owner}/${repo}/contents/${activeFile.path}`,
        {
          message: `Update ${activeFile.path} via Drape`,
          content: encodedContent,
          sha: activeFile.sha,
          branch: 'main'
        },
        { headers }
      );

      // Update file state
      const updatedFiles = [...openFiles];
      updatedFiles[activeFileIndex] = {
        ...activeFile,
        originalContent: activeFile.content,
        hasChanges: false
      };
      setOpenFiles(updatedFiles);
      
      Alert.alert('✅ Salvato', 'File aggiornato su GitHub');
    } catch (error: any) {
      console.error('Error saving file:', error);
      Alert.alert('Errore', error.response?.data?.message || 'Impossibile salvare il file');
    } finally {
      setSaving(false);
    }
  };

  const handleContentChange = (newContent: string) => {
    if (!activeFile) return;
    
    const updatedFiles = [...openFiles];
    updatedFiles[activeFileIndex] = {
      ...activeFile,
      content: newContent,
      hasChanges: newContent !== activeFile.originalContent
    };
    setOpenFiles(updatedFiles);
    
    // Add to history
    if (historyIndex < history.length - 1) {
      setHistory([...history.slice(0, historyIndex + 1), newContent]);
    } else {
      setHistory([...history, newContent]);
    }
    setHistoryIndex(history.length);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setContent(history[historyIndex - 1]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setContent(history[historyIndex + 1]);
    }
  };

  const insertText = (text: string) => {
    const before = content.substring(0, cursorPosition);
    const after = content.substring(cursorPosition);
    const newContent = before + text + after;
    handleContentChange(newContent);
    setCursorPosition(cursorPosition + text.length);
  };

  const getLineNumbers = () => {
    const lines = content.split('\n');
    return lines.map((_, i) => i + 1).join('\n');
  };

  return (
    <Modal visible={visible} animationType="slide">
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <View style={styles.headerRight}>
            {activeFile?.hasChanges && (
              <TouchableOpacity 
                onPress={saveFile} 
                style={styles.saveButton}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="save" size={20} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* File Tabs - VSCode style */}
        <View style={styles.tabsContainer}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContent}
          >
            {openFiles.map((file, index) => {
              const fileName = file.path.split('/').pop() || '';
              const isActive = index === activeFileIndex;
              
              return (
                <TouchableOpacity
                  key={file.path}
                  style={[styles.tab, isActive && styles.tabActive]}
                  onPress={() => setActiveFileIndex(index)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabFileName, isActive && styles.tabFileNameActive]} numberOfLines={1}>
                    {fileName}
                  </Text>
                  {file.hasChanges && <View style={styles.tabModified} />}
                  <TouchableOpacity 
                    onPress={(e) => {
                      e.stopPropagation();
                      closeFile(index);
                    }} 
                    style={styles.tabCloseBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close" size={16} color={isActive ? '#FFF' : '#666'} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Toolbar */}
        <View style={styles.toolbar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarContent}>
            <TouchableOpacity style={styles.toolButton} onPress={undo} disabled={historyIndex <= 0}>
              <Ionicons name="arrow-undo" size={20} color={historyIndex <= 0 ? '#666' : AppColors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolButton} onPress={redo} disabled={historyIndex >= history.length - 1}>
              <Ionicons name="arrow-redo" size={20} color={historyIndex >= history.length - 1 ? '#666' : AppColors.primary} />
            </TouchableOpacity>
            <View style={styles.toolDivider} />
            <TouchableOpacity style={styles.toolButtonText} onPress={() => insertText('\t')}>
              <Ionicons name="return-down-forward" size={18} color="#FFF" />
              <Text style={styles.toolText}>Tab</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolButtonText} onPress={() => insertText('()')}>
              <Text style={styles.toolTextLarge}>( )</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolButtonText} onPress={() => insertText('{}')}>
              <Text style={styles.toolTextLarge}>{'{ }'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolButtonText} onPress={() => insertText('[]')}>
              <Text style={styles.toolTextLarge}>[ ]</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolButtonText} onPress={() => insertText('""')}>
              <Text style={styles.toolTextLarge}>" "</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolButtonText} onPress={() => insertText(';')}>
              <Text style={styles.toolTextLarge}>;</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={AppColors.primary} />
            <Text style={styles.loadingText}>Caricamento...</Text>
          </View>
        ) : activeFile ? (
          <View style={styles.editorWrapper}>
            <TextInput
              ref={editorRef}
              style={styles.editor}
              value={activeFile.content}
              onChangeText={handleContentChange}
              onSelectionChange={(e) => setCursorPosition(e.nativeEvent.selection.start)}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              textAlignVertical="top"
              keyboardType="default"
              scrollEnabled={true}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>
  ) : null;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  saveButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: AppColors.primary },
  closeButton: { padding: 8 },
  tabsContainer: { backgroundColor: '#1e1e1e', borderBottomWidth: 1, borderBottomColor: '#2d2d2d' },
  tabsContent: { paddingHorizontal: 4, paddingVertical: 4, gap: 2 },
  tab: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 8, paddingVertical: 8, backgroundColor: '#2d2d2d', borderTopLeftRadius: 4, borderTopRightRadius: 4, minWidth: 100, maxWidth: 160 },
  tabActive: { backgroundColor: '#1a1a1a' },
  tabFileName: { fontSize: 13, color: '#969696', flex: 1, marginRight: 8 },
  tabFileNameActive: { color: '#FFFFFF' },
  tabModified: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF', marginRight: 6 },
  tabCloseBtn: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  toolbar: { backgroundColor: '#252525', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  toolbarContent: { paddingHorizontal: 12, gap: 8 },
  toolButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)' },
  toolButtonText: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)' },
  toolText: { color: '#FFFFFF', fontSize: 12, fontWeight: '500' },
  toolTextLarge: { color: '#FFFFFF', fontSize: 16, fontWeight: '500' },
  toolDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.1)', alignSelf: 'center' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { fontSize: 14, color: 'rgba(255,255,255,0.6)' },
  editorWrapper: { flex: 1 },
  editor: { flex: 1, paddingHorizontal: 16, paddingVertical: 16, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 14, color: '#FFFFFF', lineHeight: 22 },
});

