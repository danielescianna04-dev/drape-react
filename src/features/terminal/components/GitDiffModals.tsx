import React from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import {
  buildCommitFileTree,
  countCommitFileTreeFiles,
  type CommitFileEntry,
  type CommitFileTreeNode,
} from './gitSheetUtils';

const COMMIT_STATUS_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  A: { color: '#22c55e', icon: 'add', label: 'Added' },
  D: { color: '#ef4444', icon: 'remove', label: 'Deleted' },
  M: { color: '#f59e0b', icon: 'create-outline', label: 'Modified' },
  R: { color: '#3b82f6', icon: 'arrow-forward', label: 'Renamed' },
  C: { color: '#8b5cf6', icon: 'copy-outline', label: 'Copied' },
};

interface GitDiffContentProps {
  diff: string | null;
  styles: any;
}

const GitDiffContent: React.FC<GitDiffContentProps> = ({ diff, styles }) => {
  let oldLine = 0;
  let newLine = 0;

  return (
    <ScrollView style={styles.diffScroll} horizontal>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        {(diff || '').split('\n').map((line, index) => {
          const isAdd = line.startsWith('+') && !line.startsWith('+++');
          const isDel = line.startsWith('-') && !line.startsWith('---');
          const isHeader = line.startsWith('@@');
          let lineNum = '';

          if (isHeader) {
            const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
            if (match) {
              oldLine = parseInt(match[1], 10);
              newLine = parseInt(match[2], 10);
            }
          } else if (isAdd) {
            lineNum = `${newLine}`;
            newLine++;
          } else if (isDel) {
            lineNum = `${oldLine}`;
            oldLine++;
          } else if (oldLine > 0) {
            lineNum = `${newLine}`;
            oldLine++;
            newLine++;
          }

          return (
            <View
              key={`${index}-${line}`}
              style={[
                styles.diffLine,
                isAdd && styles.diffLineAdd,
                isDel && styles.diffLineDel,
                isHeader && styles.diffLineHeader,
              ]}
            >
              <Text style={styles.diffLineNum}>{lineNum}</Text>
              <Text
                style={[
                  styles.diffLineText,
                  isAdd && styles.diffLineTextAdd,
                  isDel && styles.diffLineTextDel,
                  isHeader && styles.diffLineTextHeader,
                ]}
              >
                {line}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </ScrollView>
  );
};

interface DiffViewerModalProps {
  visible: boolean;
  file: string | null;
  diff: string | null;
  loading: boolean;
  styles: any;
  onClose: () => void;
}

export const DiffViewerModal: React.FC<DiffViewerModalProps> = ({
  visible,
  file,
  diff,
  loading,
  styles,
  onClose,
}) => (
  <Modal
    visible={visible}
    transparent
    animationType="slide"
    onRequestClose={onClose}
    statusBarTranslucent
  >
    <View style={styles.diffModalOverlay}>
      <View style={styles.diffModalContainer}>
        <View style={styles.diffModalHeader}>
          <Text style={styles.diffModalTitle} numberOfLines={1}>{file}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        {loading ? (
          <View style={styles.diffLoadingContainer}>
            <ActivityIndicator size="large" color={AppColors.primary} />
          </View>
        ) : (
          <GitDiffContent diff={diff} styles={styles} />
        )}
      </View>
    </View>
  </Modal>
);

interface CommitFilesModalProps {
  visible: boolean;
  modalData: { hash: string; shortHash: string; message: string } | null;
  commitFiles: CommitFileEntry[];
  loading: boolean;
  expandedFile: string | null;
  expandedDiff: string | null;
  expandedDiffLoading: boolean;
  collapsedFolders: Set<string>;
  styles: any;
  onClose: () => void;
  onBack: () => void;
  onToggleFolder: (path: string) => void;
  onOpenFile: (filePath: string) => void;
}

const CommitFileTree: React.FC<{
  nodes: CommitFileTreeNode[];
  depth?: number;
  collapsedFolders: Set<string>;
  styles: any;
  onToggleFolder: (path: string) => void;
  onOpenFile: (filePath: string) => void;
}> = ({ nodes, depth = 0, collapsedFolders, styles, onToggleFolder, onOpenFile }) => (
  <>
    {nodes.map((node) => {
      if (node.type === 'folder') {
        const isExpanded = !collapsedFolders.has(node.path);
        return (
          <View key={node.path}>
            <TouchableOpacity
              style={[styles.changeFolderItem, { marginLeft: depth * 16 }]}
              onPress={() => onToggleFolder(node.path)}
            >
              <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={12} color="rgba(255,255,255,0.4)" />
              <Ionicons name="folder-outline" size={14} color="rgba(255,255,255,0.5)" />
              <Text style={styles.changeFolderName}>{node.name}</Text>
              <Text style={styles.changeFolderCount}>{countCommitFileTreeFiles(node)}</Text>
            </TouchableOpacity>
            {isExpanded && node.children && (
              <CommitFileTree
                nodes={node.children}
                depth={depth + 1}
                collapsedFolders={collapsedFolders}
                styles={styles}
                onToggleFolder={onToggleFolder}
                onOpenFile={onOpenFile}
              />
            )}
          </View>
        );
      }

      const statusConfig = COMMIT_STATUS_CONFIG[node.status || 'M'] || COMMIT_STATUS_CONFIG.M;
      return (
        <View key={node.path}>
          <TouchableOpacity
            style={[styles.commitFileItem, { marginLeft: depth * 16 }]}
            activeOpacity={0.6}
            onPress={() => onOpenFile(node.path)}
          >
            <View style={[styles.commitFileStatus, { backgroundColor: `${statusConfig.color}22` }]}>
              <Ionicons name={statusConfig.icon as any} size={14} color={statusConfig.color} />
            </View>
            <Ionicons name="document-outline" size={14} color="rgba(255,255,255,0.4)" style={{ marginRight: -4 }} />
            <Text style={[styles.commitFileName, { flex: 1 }]} numberOfLines={1}>{node.name}</Text>
            <Text style={{ fontSize: 10, color: statusConfig.color, fontWeight: '600', marginRight: 2 }}>
              {statusConfig.label}
            </Text>
            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>
        </View>
      );
    })}
  </>
);

export const CommitFilesModal: React.FC<CommitFilesModalProps> = ({
  visible,
  modalData,
  commitFiles,
  loading,
  expandedFile,
  expandedDiff,
  expandedDiffLoading,
  collapsedFolders,
  styles,
  onClose,
  onBack,
  onToggleFolder,
  onOpenFile,
}) => {
  const tree = buildCommitFileTree(commitFiles);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={expandedFile ? onBack : onClose}
      statusBarTranslucent
    >
      <View style={styles.diffModalOverlay}>
        <View style={styles.diffModalContainer}>
          <View style={styles.diffModalHeader}>
            {expandedFile ? (
              <>
                <TouchableOpacity
                  onPress={onBack}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={{ marginRight: 8 }}
                >
                  <Ionicons name="arrow-back" size={20} color="#fff" />
                </TouchableOpacity>
                <Text style={[styles.diffModalTitle, { flex: 1 }]} numberOfLines={1}>
                  {expandedFile.split('/').pop()}
                </Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="close" size={20} color="#fff" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={{ flex: 1 }}>
                  <Text style={styles.diffModalTitle} numberOfLines={1}>{modalData?.message}</Text>
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                    {modalData?.shortHash} · {commitFiles.length} file{commitFiles.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="close" size={20} color="#fff" />
                </TouchableOpacity>
              </>
            )}
          </View>

          {expandedFile ? (
            expandedDiffLoading ? (
              <View style={styles.diffLoadingContainer}>
                <ActivityIndicator size="large" color={AppColors.primary} />
              </View>
            ) : (
              <GitDiffContent diff={expandedDiff} styles={styles} />
            )
          ) : loading ? (
            <View style={styles.diffLoadingContainer}>
              <ActivityIndicator size="large" color={AppColors.primary} />
            </View>
          ) : commitFiles.length === 0 ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No files changed</Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
              <CommitFileTree
                nodes={tree}
                collapsedFolders={collapsedFolders}
                styles={styles}
                onToggleFolder={onToggleFolder}
                onOpenFile={onOpenFile}
              />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};
