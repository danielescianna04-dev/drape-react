import React, { useCallback, useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../../core/api/apiClient';
import { useFileHistoryStore, FileModification } from '../../../core/history/fileHistoryStore';
import { useUIStore } from '../../../core/terminal/uiStore';
import { config } from '../../../config/config';

const API_URL = config.apiUrl;

interface UndoRedoBarProps {
  projectId: string;
  onUndoComplete?: (modification: FileModification) => void;
  onRedoComplete?: (modification: FileModification) => void;
}

export const UndoRedoBar: React.FC<UndoRedoBarProps> = ({
  projectId,
  onUndoComplete,
  onRedoComplete,
}) => {
  const [isUndoing, setIsUndoing] = useState(false);
  const [isRedoing, setIsRedoing] = useState(false);

  const { undo, redo, canUndo, canRedo, getStackSizes } = useFileHistoryStore();
  const { addGlobalTerminalLog } = useUIStore();

  const hasUndo = canUndo(projectId);
  const hasRedo = canRedo(projectId);
  const { undoCount, redoCount } = getStackSizes(projectId);

  const handleUndo = useCallback(async () => {
    if (!hasUndo || isUndoing) return;

    setIsUndoing(true);

    try {
      const modification = undo(projectId);
      if (!modification) {
        setIsUndoing(false);
        return;
      }

      // Restore the original content via API
      const response = await apiClient.post(`${API_URL}/workstation/undo-file`, {
        projectId,
        filePath: modification.filePath,
        content: modification.originalContent || '',
      });

      if (response.data.success) {
        addGlobalTerminalLog({
          id: Date.now().toString(),
          type: 'output',
          content: `↩️ Undo: Restored ${modification.filePath}`,
          timestamp: new Date(),
        });

        onUndoComplete?.(modification);
      }
    } catch (error) {
      console.error('❌ [UndoRedoBar] Undo failed:', error);
      addGlobalTerminalLog({
        id: Date.now().toString(),
        type: 'error',
        content: `❌ Undo failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      });
    } finally {
      setIsUndoing(false);
    }
  }, [projectId, hasUndo, isUndoing, undo, addGlobalTerminalLog, onUndoComplete]);

  const handleRedo = useCallback(async () => {
    if (!hasRedo || isRedoing) return;

    setIsRedoing(true);

    try {
      const modification = redo(projectId);
      if (!modification) {
        setIsRedoing(false);
        return;
      }

      // Apply the new content via API
      const response = await apiClient.post(`${API_URL}/workstation/undo-file`, {
        projectId,
        filePath: modification.filePath,
        content: modification.newContent,
      });

      if (response.data.success) {
        addGlobalTerminalLog({
          id: Date.now().toString(),
          type: 'output',
          content: `↪️ Redo: Re-applied changes to ${modification.filePath}`,
          timestamp: new Date(),
        });

        onRedoComplete?.(modification);
      }
    } catch (error) {
      console.error('❌ [UndoRedoBar] Redo failed:', error);
      addGlobalTerminalLog({
        id: Date.now().toString(),
        type: 'error',
        content: `❌ Redo failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      });
    } finally {
      setIsRedoing(false);
    }
  }, [projectId, hasRedo, isRedoing, redo, addGlobalTerminalLog, onRedoComplete]);

  // Don't render if no history
  if (undoCount === 0 && redoCount === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, !hasUndo && styles.buttonDisabled]}
        onPress={handleUndo}
        disabled={!hasUndo || isUndoing}
      >
        {isUndoing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons
              name="arrow-undo"
              size={16}
              color={hasUndo ? '#fff' : '#666'}
            />
            {undoCount > 0 && (
              <Text style={[styles.count, !hasUndo && styles.countDisabled]}>
                {undoCount}
              </Text>
            )}
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, !hasRedo && styles.buttonDisabled]}
        onPress={handleRedo}
        disabled={!hasRedo || isRedoing}
      >
        {isRedoing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons
              name="arrow-redo"
              size={16}
              color={hasRedo ? '#fff' : '#666'}
            />
            {redoCount > 0 && (
              <Text style={[styles.count, !hasRedo && styles.countDisabled]}>
                {redoCount}
              </Text>
            )}
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 6,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  buttonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  count: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  countDisabled: {
    color: '#666',
  },
});

export default UndoRedoBar;
