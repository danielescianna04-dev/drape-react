import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { workstationService } from '../../../core/workstation/workstationService-firebase';
import { AppColors } from '../../../shared/theme/colors';
import { useSidebarOffset } from '../context/SidebarContext';
import { useFileCacheStore } from '../../../core/cache/fileCacheStore';

interface Props {
  visible: boolean;
  filePath: string;
  projectId: string;
  repositoryUrl?: string;
  userId: string;
  onClose: () => void;
}

// Syntax colors
const Colors = {
  keyword: '#C586C0',
  string: '#CE9178',
  number: '#B5CEA8',
  comment: '#6A9955',
  function: '#DCDCAA',
  variable: '#9CDCFE',
  type: '#4EC9B0',
  default: '#D4D4D4',
};

const keywords = ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'async', 'await', 'class', 'extends', 'new', 'this', 'import', 'export', 'default', 'from', 'true', 'false', 'null', 'undefined', 'interface', 'type', 'enum', 'def', 'None', 'True', 'False', 'self'];

const getLanguage = (filePath: string): string => {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const name = filePath.split('/').pop()?.toLowerCase() || '';
  if (name.startsWith('.env') || name.includes('env')) return 'env';
  const map: Record<string, string> = { js: 'js', jsx: 'js', ts: 'ts', tsx: 'ts', py: 'py', json: 'json', html: 'html', css: 'css' };
  return map[ext] || 'text';
};

const getFileIcon = (filename: string): { icon: string; color: string } => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const name = filename.toLowerCase();
  if (name.includes('env')) return { icon: 'key', color: '#FFB800' };
  const icons: Record<string, { icon: string; color: string }> = {
    js: { icon: 'logo-javascript', color: '#F7DF1E' },
    jsx: { icon: 'logo-react', color: '#61DAFB' },
    ts: { icon: 'code-slash', color: '#3178C6' },
    tsx: { icon: 'logo-react', color: '#3178C6' },
    py: { icon: 'logo-python', color: '#3776AB' },
    html: { icon: 'logo-html5', color: '#E34F26' },
    css: { icon: 'logo-css3', color: '#1572B6' },
    json: { icon: 'code-working', color: '#FFB800' },
  };
  return icons[ext] || { icon: 'document', color: '#888' };
};

// Simple syntax highlighter
const highlightLine = (line: string, lang: string): React.ReactNode[] => {
  if (!line) return [<Text key="empty"> </Text>];

  // ENV files
  if (lang === 'env') {
    if (line.trim().startsWith('#')) {
      return [<Text key="0" style={{ color: Colors.comment }}>{line}</Text>];
    }
    const idx = line.indexOf('=');
    if (idx > 0) {
      return [
        <Text key="0" style={{ color: Colors.variable }}>{line.slice(0, idx)}</Text>,
        <Text key="1" style={{ color: Colors.default }}>=</Text>,
        <Text key="2" style={{ color: Colors.string }}>{line.slice(idx + 1)}</Text>,
      ];
    }
    return [<Text key="0" style={{ color: Colors.default }}>{line}</Text>];
  }

  // Simple tokenization
  const result: React.ReactNode[] = [];
  const regex = /(\/\/.*|\/\*[\s\S]*?\*\/|"[^"]*"|'[^']*'|`[^`]*`|\b\d+\.?\d*\b|\b[a-zA-Z_$][a-zA-Z0-9_$]*\b|[{}()[\];,.]|[+\-*/%=<>!&|^~?:]+|\s+)/g;
  let match;
  let key = 0;

  while ((match = regex.exec(line)) !== null) {
    const token = match[0];
    let color = Colors.default;

    if (token.startsWith('//') || token.startsWith('/*')) {
      color = Colors.comment;
    } else if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) {
      color = Colors.string;
    } else if (/^\d/.test(token)) {
      color = Colors.number;
    } else if (keywords.includes(token)) {
      color = Colors.keyword;
    } else if (/^[A-Z]/.test(token)) {
      color = Colors.type;
    } else if (/^[a-z_$]/i.test(token) && line.slice(match.index + token.length).trim().startsWith('(')) {
      color = Colors.function;
    }

    result.push(<Text key={key++} style={{ color }}>{token}</Text>);
  }

  return result.length > 0 ? result : [<Text key="0" style={{ color: Colors.default }}>{line}</Text>];
};

const SIDEBAR_WIDTH = 44;

export const FileViewer = ({ visible, filePath, projectId, repositoryUrl, onClose }: Props) => {
  const insets = useSafeAreaInsets();
  const { isSidebarHidden } = useSidebarOffset();
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEdited, setIsEdited] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const scrollRef = useRef<ScrollView>(null);
  const language = useMemo(() => getLanguage(filePath), [filePath]);
  const lines = useMemo(() => content.split('\n'), [content]);
  const fileName = filePath.split('/').pop() || filePath;
  const { icon, color: iconColor } = getFileIcon(fileName);

  useEffect(() => {
    if (visible && filePath) loadFile();
  }, [visible, filePath]);

  const loadFile = async () => {
    try {
      setLoading(true);
      setError(null);
      const fileContent = await workstationService.getFileContent(projectId, filePath, repositoryUrl);
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
      await workstationService.saveFileContent(projectId, filePath, content, repositoryUrl);
      // Invalidate file cache so FileExplorer shows updated files
      useFileCacheStore.getState().clearCache(projectId);
      setOriginalContent(content);
      setIsEdited(false);
      Alert.alert('Saved', 'File saved successfully');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const searchResults = useMemo(() => {
    if (!searchQuery) return [];
    return lines.map((line, i) =>
      line.toLowerCase().includes(searchQuery.toLowerCase()) ? i : -1
    ).filter(i => i >= 0);
  }, [searchQuery, lines]);

  if (!visible) return null;

  const sidebarPadding = isSidebarHidden ? 0 : SIDEBAR_WIDTH;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 32, paddingLeft: sidebarPadding }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.fileTab}>
          <Ionicons name={icon as any} size={14} color={iconColor} />
          <Text style={styles.fileName} numberOfLines={1}>{fileName}</Text>
          {isEdited && <View style={styles.dot} />}
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setShowSearch(s => !s)} style={styles.actionBtn}>
            <Ionicons name="search-outline" size={18} color={showSearch ? '#fff' : 'rgba(255,255,255,0.5)'} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSave}
            disabled={!isEdited || saving}
            style={[styles.saveBtn, (!isEdited || saving) && styles.saveBtnOff]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={14} color="#fff" />
                <Text style={styles.saveBtnText}>Save</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      {showSearch && (
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search..."
            placeholderTextColor="#666"
            autoFocus
          />
          {searchResults.length > 0 && (
            <Text style={styles.searchCount}>{searchResults.length} found</Text>
          )}
          <TouchableOpacity onPress={() => { setShowSearch(false); setSearchQuery(''); }}>
            <Ionicons name="close" size={20} color="#666" />
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={AppColors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle" size={48} color="#f44" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadFile} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.editor}
          horizontal={false}
          showsVerticalScrollIndicator={true}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.codeContainer}
          >
            <View>
              {lines.map((line, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.lineRow,
                    searchResults.includes(idx) && styles.lineHighlight
                  ]}
                >
                  <Text style={styles.lineNum}>{idx + 1}</Text>
                  <Text style={styles.lineCode}>
                    {highlightLine(line, language)}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>

          {/* Invisible editable input */}
          <TextInput
            style={styles.hiddenInput}
            value={content}
            onChangeText={(text) => {
              setContent(text);
              setIsEdited(text !== originalContent);
            }}
            multiline
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
          />
        </ScrollView>
      )}

      {/* Footer */}
      {!loading && !error && (
        <View style={[styles.footer, { marginLeft: -sidebarPadding }]}>
          <Text style={[styles.footerText, { marginLeft: sidebarPadding }]}>{language.toUpperCase()}</Text>
          <Text style={styles.footerText}>{lines.length} lines</Text>
          {isEdited && <Text style={styles.footerMod}>Modified</Text>}
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.dark.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 2,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  fileTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#e0e0e0',
    maxWidth: 160,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffc107',
    marginLeft: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    padding: 5,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: AppColors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  saveBtnOff: {
    opacity: 0.35,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  searchCount: {
    color: '#888',
    fontSize: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#f44',
    marginTop: 10,
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: AppColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  editor: {
    flex: 1,
  },
  codeContainer: {
    paddingVertical: 8,
    paddingRight: 20,
  },
  lineRow: {
    flexDirection: 'row',
    minHeight: 22,
    paddingHorizontal: 8,
  },
  lineHighlight: {
    backgroundColor: 'rgba(255, 200, 0, 0.15)',
  },
  lineNum: {
    width: 22,
    textAlign: 'right',
    paddingRight: 6,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#555',
  },
  lineCode: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#d4d4d4',
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#000',
  },
  footerText: {
    fontSize: 11,
    color: '#fff',
  },
  footerMod: {
    fontSize: 11,
    color: '#ffc107',
    fontWeight: '600',
  },
});
