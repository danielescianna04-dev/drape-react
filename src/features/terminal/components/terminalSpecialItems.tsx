import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TerminalItem } from '../../../shared/types';
import { formatTerminalErrorMessage } from './terminalErrorFormatting';

export const TerminalErrorItem = ({
  item,
  styles,
  t,
}: {
  item: TerminalItem;
  styles: any;
  t: (key: string) => string;
}) => (
  <View style={styles.messageBlock}>
    <Text style={styles.errorName}>{t('common:error')}</Text>
    <Text style={styles.errorMessage}>{formatTerminalErrorMessage(item.content)}</Text>
  </View>
);

export const TerminalLoadingItem = ({
  item,
  dotCount,
  styles,
  t,
}: {
  item: TerminalItem;
  dotCount: number;
  styles: any;
  t: (key: string) => string;
}) => (
  <View style={styles.loadingCard}>
    <View style={styles.loadingHeader}>
      <Text style={styles.loadingTitle}>{t('terminal:terminalItem.gitClone')}</Text>
    </View>
    <View style={styles.loadingBody}>
      <View style={styles.loadingRow}>
        <Text style={styles.loadingLabel}>{t('terminal:terminalItem.status')}</Text>
        <Text style={styles.loadingStatus}>
          {item.content || ''}
          {'.'.repeat(dotCount)}
        </Text>
      </View>
    </View>
  </View>
);

export const TerminalBackendLogItem = ({
  item,
  styles,
  t,
}: {
  item: TerminalItem;
  styles: any;
  t: (key: string) => string;
}) => (
  <View style={styles.backendLogBlock}>
    <View style={styles.backendLogHeader}>
      <Ionicons name="server-outline" size={12} color="#8B949E" />
      <Text style={styles.backendLogLabel}>{t('terminal:terminalItem.backend')}</Text>
      <Text style={styles.backendLogTime}>
        {item.timestamp ? new Date(item.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
      </Text>
    </View>
    <Text style={styles.backendLogText}>{item.content || ''}</Text>
  </View>
);
