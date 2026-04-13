import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { TerminalItem } from '../../../shared/types';
import { styles } from './terminalItemStyles';

interface TerminalPlanItemProps {
  item: TerminalItem;
  onPlanApprove?: () => void;
  onPlanReject?: () => void;
}

export const TerminalPlanItem: React.FC<TerminalPlanItemProps> = ({ item, onPlanApprove, onPlanReject }) => {
  const { t } = useTranslation();

  if (!item.planInfo) return null;

  return (
    <>
      {/* Action Buttons - only show if pending */}
      {item.planInfo.status === 'pending' && (
        <View style={styles.planApprovalActions}>
          <TouchableOpacity
            style={[styles.planApprovalButton, styles.planApprovalButtonReject]}
            onPress={onPlanReject}
            activeOpacity={0.7}
          >
            <Ionicons name="close-circle-outline" size={18} color="#F85149" />
            <Text style={[styles.planApprovalButtonText, { color: '#F85149' }]}>{t('terminal:terminalItem.reject')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.planApprovalButton, styles.planApprovalButtonApprove]}
            onPress={onPlanApprove}
            activeOpacity={0.7}
          >
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={[styles.planApprovalButtonText, { color: '#fff' }]}>{t('terminal:terminalItem.approve')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Show status badge when approved/rejected */}
      {item.planInfo.status === 'approved' && (
        <View style={styles.planApprovalStatusBadge}>
          <Ionicons name="checkmark-circle" size={16} color="#3FB950" />
          <Text style={[styles.planApprovalStatusText, { color: '#3FB950' }]}>{t('terminal:terminalItem.planApproved')}</Text>
        </View>
      )}
      {item.planInfo.status === 'rejected' && (
        <View style={styles.planApprovalStatusBadge}>
          <Ionicons name="close-circle" size={16} color="#F85149" />
          <Text style={[styles.planApprovalStatusText, { color: '#F85149' }]}>{t('terminal:terminalItem.planRejected')}</Text>
        </View>
      )}
    </>
  );
};
