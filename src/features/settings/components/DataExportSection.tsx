import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';
import { GlassCard } from './GlassCard';
import { SettingItem } from './SettingItem';
import { getAuthHeaders } from '../../../core/api/getAuthToken';
import { getSystemConfig } from '../../../core/config/systemConfig';

interface DataExportSectionProps {
  loading: boolean;
  t: (key: string) => string;
}

/**
 * GDPR Article 20 — Right to Data Portability
 * Allows users to download all their data as a JSON file.
 */
export const DataExportSection: React.FC<DataExportSectionProps> = ({ loading, t }) => {
  const [exporting, setExporting] = useState(false);

  const handleExportData = async () => {
    if (exporting) return;

    setExporting(true);
    try {
      const { apiUrl } = getSystemConfig().backend;
      const authHeaders = await getAuthHeaders();

      const response = await fetch(`${apiUrl}/data-export/my-data`, {
        method: 'GET',
        headers: {
          ...authHeaders,
          'Accept': 'application/json',
        },
      });

      if (response.status === 429) {
        const errorData = await response.json().catch(() => null);
        const retryMinutes = errorData?.retryAfterSeconds
          ? Math.ceil(errorData.retryAfterSeconds / 60)
          : 60;
        Alert.alert(
          t('dataExport.rateLimitTitle'),
          t('dataExport.rateLimitMessage').replace('{minutes}', String(retryMinutes))
        );
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      if (!result.success || !result.data) {
        throw new Error('Invalid response');
      }

      // Save JSON to a temporary file
      const fileName = `bynot-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(
        filePath,
        JSON.stringify(result.data, null, 2)
      );

      // Share the file using React Native's built-in Share API
      await Share.share({
        title: t('dataExport.shareTitle'),
        url: filePath,
        message: t('dataExport.shareTitle'),
      });

      Alert.alert(
        t('dataExport.successTitle'),
        t('dataExport.successMessage')
      );
    } catch (error: any) {
      // User cancellation of the share sheet is not an error
      if (error?.message === 'User did not share') return;

      console.error('[DataExport] Export failed:', error);
      Alert.alert(
        t('dataExport.errorTitle'),
        t('dataExport.errorMessage')
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('dataExport.sectionTitle')}</Text>
      <GlassCard key={loading ? 'loading-export' : 'loaded-export'}>
        <View style={[styles.sectionCard, isLiquidGlassSupported && styles.sectionCardGlass]}>
          <SettingItem
            icon="download-outline"
            iconColor="#10B981"
            title={t('dataExport.downloadTitle')}
            subtitle={t('dataExport.downloadSubtitle')}
            onPress={handleExportData}
            rightElement={exporting ? <ActivityIndicator size="small" color="#10B981" /> : undefined}
            showChevron={!exporting}
            isLast
          />
        </View>
      </GlassCard>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: -0.3,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionCard: {
    padding: 4,
    backgroundColor: 'rgba(20,20,22,0.5)',
    borderRadius: 16,
  },
  sectionCardGlass: {
    backgroundColor: 'transparent',
  },
});
