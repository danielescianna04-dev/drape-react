import React, { useState } from 'react';
import { Modal, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { TerminalItem } from '../../../shared/types';
import { isFormattedToolOutputContent, isTerminalCommandItem } from './terminalItemUtils';

interface Props {
  item: TerminalItem;
  outputItem?: TerminalItem;
  styles: any;
}

export const TerminalCommandItem: React.FC<Props> = ({ item, outputItem, styles }) => {
  const { t } = useTranslation();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const isTerminalCommand = isTerminalCommandItem(item);

  if (outputItem && isFormattedToolOutputContent(outputItem.content || '')) {
    return null;
  }

  if (isTerminalCommand && outputItem) {
    const outputContent = outputItem.content || '';
    const hasError = /^Error:/i.test(outputContent)
      || /^ERROR:/i.test(outputContent)
      || outputContent.includes('command not found')
      || outputContent.includes('No such file or directory');

    const isCatCommand = (item.content || '').trim().startsWith('cat ');
    if (isCatCommand) {
      const lines = outputContent.split('\n');
      const fileNameMatch = lines[0]?.match(/Reading:\s*(.+)/);
      const fileName = fileNameMatch ? fileNameMatch[1] : (item.content || '').replace('cat ', '').trim();
      const lineCountMatch = lines[1]?.match(/(\d+)\s+lines?/);
      const lineCount = lineCountMatch ? lineCountMatch[1] : lines.length;
      return (
        <View style={styles.readFileInline}>
          <View style={styles.toolBadge}>
            <Ionicons name="document-text-outline" size={12} color="#58A6FF" />
            <Text style={styles.toolBadgeText}>READ</Text>
          </View>
          <Text style={styles.readFileName}>{fileName}</Text>
          <Text style={styles.readFileInfo}>({lineCount} lines)</Text>
        </View>
      );
    }

    if (item.isDirectTerminal) {
      return (
        <View style={[styles.termCard, hasError && styles.termCardError]}>
          <View style={styles.termHeader}>
            <View style={styles.termTrafficLights}>
              <View style={[styles.termDot, { backgroundColor: '#FF5F56' }]} />
              <View style={[styles.termDot, { backgroundColor: '#FFBD2E' }]} />
              <View style={[styles.termDot, { backgroundColor: '#27C93F' }]} />
            </View>
            <Text style={styles.termHeaderTitle}>Terminal</Text>
            <TouchableOpacity
              onPress={() => setIsModalVisible(true)}
              style={styles.expandButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="expand-outline" size={14} color="rgba(255, 255, 255, 0.35)" />
            </TouchableOpacity>
          </View>
          <View style={styles.termBody}>
            <View style={styles.termPromptLine}>
              <Text style={styles.termPromptChar}>$</Text>
              <Text style={styles.termCommandText}>{item.content || ''}</Text>
            </View>
            <Text style={[styles.termOutputText, hasError && styles.termOutputError]} numberOfLines={isExpanded ? undefined : 8}>
              {outputContent}
            </Text>
            {!isExpanded && outputContent.split('\n').length > 8 && (
              <TouchableOpacity onPress={() => setIsExpanded(true)} style={styles.termShowMore}>
                <Text style={styles.termShowMoreText}>
                  mostra tutto ({outputContent.split('\n').length} righe)
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <Modal visible={isModalVisible} animationType="slide" transparent={false} onRequestClose={() => setIsModalVisible(false)}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Terminal Output</Text>
                <TouchableOpacity onPress={() => setIsModalVisible(false)} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalContent}>
                <View style={styles.modalSection}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ color: '#27C93F', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13 }}>$ </Text>
                    <Text style={styles.modalInput}>{item.content || ''}</Text>
                  </View>
                  <Text style={styles.modalOutput}>{outputContent}</Text>
                </View>
              </ScrollView>
            </View>
          </Modal>
        </View>
      );
    }

    return (
      <View style={[styles.bashCard, hasError && styles.bashCardError]}>
        <View style={styles.bashHeader}>
          <Text style={styles.bashTitle}>{t('terminal:terminalItem.bash')}</Text>
          <TouchableOpacity
            onPress={() => setIsModalVisible(true)}
            style={styles.expandButton}
            accessibilityLabel={t('terminal:terminalItem.expandBashOutput')}
            accessibilityRole="button"
            accessibilityHint="Mostra output completo a schermo intero"
          >
            <Ionicons name="expand" size={16} color="rgba(255, 255, 255, 0.5)" />
          </TouchableOpacity>
        </View>
        <View style={styles.bashContent}>
          <View style={styles.bashRow}>
            <Text style={styles.bashLabel}>{t('terminal:terminalItem.inShort')}</Text>
            <Text style={styles.bashInput} numberOfLines={2}>{item.content || ''}</Text>
          </View>
          <View style={styles.bashDivider} />
          <View style={styles.bashRow}>
            <Text style={styles.bashLabel}>{t('terminal:terminalItem.outShort')}</Text>
            <Text style={styles.bashOutput} numberOfLines={3}>{outputContent}</Text>
          </View>
        </View>

        <Modal visible={isModalVisible} animationType="slide" transparent={false} onRequestClose={() => setIsModalVisible(false)}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('terminal:terminalItem.outputTitle')}</Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>{t('terminal:terminalItem.inputTitle')}</Text>
                <Text style={styles.modalInput}>{item.content || ''}</Text>
              </View>
              <View style={styles.modalDivider} />
              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>{t('terminal:terminalItem.outputLabel')}</Text>
                <Text style={styles.modalOutput}>{outputContent}</Text>
              </View>
            </ScrollView>
          </View>
        </Modal>
      </View>
    );
  }

  if (isTerminalCommand) {
    return (
      <View style={styles.terminalCommand}>
        <Text style={styles.terminalPrompt}>$ </Text>
        <Text style={styles.terminalText}>{item.content || ''}</Text>
      </View>
    );
  }

  return (
    <View style={styles.userMessageBlock}>
      <View style={styles.userMessageCard}>
        <Text style={styles.userMessage}>{item.content || ''}</Text>
      </View>
    </View>
  );
};
