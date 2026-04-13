import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { TerminalItem } from '../../../shared/types';
import { styles } from './terminalItemStyles';

const LANG_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  react: { icon: 'logo-react', color: '#61DAFB', label: 'React' },
  html: { icon: 'logo-html5', color: '#E34F26', label: 'HTML/CSS/JS' },
  vue: { icon: 'logo-vue', color: '#4FC08D', label: 'Vue' },
  nextjs: { icon: 'server-outline', color: '#FFFFFF', label: 'Next.js' },
  expo: { icon: 'phone-portrait-outline', color: '#61DAFB', label: 'React Native' },
  svelte: { icon: 'flame-outline', color: '#FF3E00', label: 'Svelte' },
  angular: { icon: 'navigate-outline', color: '#DD0031', label: 'Angular' },
  astro: { icon: 'planet-outline', color: '#BC52EE', label: 'Astro' },
  remix: { icon: 'repeat-outline', color: '#E8F2FF', label: 'Remix' },
  solid: { icon: 'water-outline', color: '#2C4F7C', label: 'Solid.js' },
  nuxt: { icon: 'layers-outline', color: '#00DC82', label: 'Nuxt.js' },
  flutter: { icon: 'apps-outline', color: '#02569B', label: 'Flutter' },
  laravel: { icon: 'diamond-outline', color: '#FF2D20', label: 'Laravel' },
  django: { icon: 'shield-outline', color: '#44B78B', label: 'Django' },
  flask: { icon: 'logo-python', color: '#3776AB', label: 'Flask' },
  fastapi: { icon: 'flash-outline', color: '#009688', label: 'FastAPI' },
  'python-console': { icon: 'logo-python', color: '#3776AB', label: 'Python' },
  'javascript-console': { icon: 'logo-nodejs', color: '#F7DF1E', label: 'JavaScript' },
  'c-lang': { icon: 'code-slash-outline', color: '#A8B9CC', label: 'C' },
  'cpp': { icon: 'code-working-outline', color: '#00599C', label: 'C++' },
  'java': { icon: 'cafe-outline', color: '#ED8B00', label: 'Java' },
};

interface TerminalSystemItemProps {
  item: TerminalItem;
}

export const TerminalSystemItem: React.FC<TerminalSystemItemProps> = ({ item }) => {
  const { t } = useTranslation();
  const content = item.content || '';

  if (content === 'Cloning repository to workstation') {
    // Show as Git Clone card when it's the cloning message (finished loading)
    return (
      <View style={styles.loadingCard}>
        <View style={styles.loadingHeader}>
          <Text style={styles.loadingTitle}>{t('terminal:terminalItem.gitClone')}</Text>
        </View>
        <View style={styles.loadingBody}>
          <View style={styles.loadingRow}>
            <Text style={styles.loadingLabel}>{t('terminal:terminalItem.status')}</Text>
            <Text style={styles.loadingStatus}>{content}</Text>
          </View>
        </View>
      </View>
    );
  }

  if (content.startsWith('__PROJECT_CREATED__')) {
    // Project created welcome card
    let info = { name: '', language: '' };
    try { info = JSON.parse(content.replace('__PROJECT_CREATED__', '')); } catch {}
    const lang = LANG_ICONS[info.language] || LANG_ICONS['html'];
    return (
      <View style={styles.projectCreatedCard}>
        <LinearGradient
          colors={['rgba(16, 185, 129, 0.15)', 'rgba(16, 185, 129, 0.03)', 'transparent']}
          style={styles.projectCreatedGlow}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
        <View style={styles.projectCreatedIconBox}>
          <LinearGradient
            colors={['#10B981', '#059669']}
            style={styles.projectCreatedIconGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="checkmark" size={22} color="#FFFFFF" />
          </LinearGradient>
        </View>
        <Text style={styles.projectCreatedTitle}>{t('terminal:terminalItem.projectCreated')}</Text>
        <Text style={styles.projectCreatedName}>{info.name}</Text>
        <View style={styles.projectCreatedTag}>
          <Ionicons name={lang.icon as any} size={13} color={lang.color} />
          <Text style={[styles.projectCreatedTagText, { color: lang.color }]}>{lang.label}</Text>
        </View>
        <View style={styles.projectCreatedDivider} />
        <Text style={styles.projectCreatedHint}>{t('terminal:terminalItem.projectCreatedHint')}</Text>
      </View>
    );
  }

  // Normal system message
  return (
    <View style={styles.systemBlock}>
      <Text style={styles.systemText}>{content}</Text>
    </View>
  );
};
