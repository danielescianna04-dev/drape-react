import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

interface LegalPageProps {
  type: 'privacy' | 'terms';
  onClose: () => void;
}

export const LegalPage: React.FC<LegalPageProps> = ({ type, onClose }) => {
  const { t } = useTranslation('legal');
  const insets = useSafeAreaInsets();
  const title = t(`${type}.title`);
  const content = t(`${type}.content`, { returnObjects: true }) as string[];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.closeButton} />
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {content.map((line, i) => {
          const trimmed = line.trim();
          if (!trimmed) return <View key={i} style={styles.spacer} />;

          // Section headers (numbered like "1. TITLE")
          if (/^\d+\.\s+[A-ZÀÈÉÌÒÙ]/.test(trimmed)) {
            return <Text key={i} style={styles.sectionHeader}>{trimmed}</Text>;
          }
          // Sub-headers (like "2.1 Title")
          if (/^\d+\.\d+\s/.test(trimmed)) {
            return <Text key={i} style={styles.subHeader}>{trimmed}</Text>;
          }
          // Bullet points
          if (trimmed.startsWith('•')) {
            return <Text key={i} style={styles.bullet}>{trimmed}</Text>;
          }
          // Date line
          if (i === 0) {
            return <Text key={i} style={styles.date}>{trimmed}</Text>;
          }
          // Regular text
          return <Text key={i} style={styles.paragraph}>{trimmed}</Text>;
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A0A0C',
    zIndex: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  spacer: {
    height: 10,
  },
  date: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginTop: 20,
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  subHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 12,
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  bullet: {
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.6)',
    paddingLeft: 8,
    marginBottom: 2,
  },
});
