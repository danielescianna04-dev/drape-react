import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { AppColors } from '../../shared/theme/colors';
import { ChatInput } from '../../shared/components/ChatInput';

interface ProblemCardData {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  color: string;
}

export const ProblemScreen = () => {
  const { t } = useTranslation(['projects', 'chat']);
  const [message, setMessage] = useState('');
  const problemCards: ProblemCardData[] = [
    {
      id: '1',
      icon: 'desktop',
      title: t('projects:problem.cards.desktop.title'),
      description: t('projects:problem.cards.desktop.description'),
      color: '#8B7CF6',
    },
    {
      id: '2',
      icon: 'cube',
      title: t('projects:problem.cards.ai.title'),
      description: t('projects:problem.cards.ai.description'),
      color: '#6F5CFF',
    },
    {
      id: '3',
      icon: 'phone-portrait',
      title: t('projects:problem.cards.productivity.title'),
      description: t('projects:problem.cards.productivity.description'),
      color: '#5946D6',
    },
    {
      id: '4',
      icon: 'alert-circle',
      title: t('projects:problem.cards.emergency.title'),
      description: t('projects:problem.cards.emergency.description'),
      color: '#4834B8',
    },
  ];

  const handleSend = () => {
    if (message.trim()) {
      setMessage('');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Background gradient */}
      <LinearGradient
        colors={['#000000', '#0a0510', '#050208']}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('projects:problem.title')}</Text>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.cardsContainer}>
          {problemCards.map((card) => (
            <View key={card.id} style={styles.card}>
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.02)']}
                style={styles.cardGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={[styles.iconCircle, { backgroundColor: `${card.color}20` }]}>
                  <Ionicons name={card.icon} size={28} color={card.color} />
                </View>

                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardDescription}>{card.description}</Text>
              </LinearGradient>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Input box at bottom with border */}
      <ChatInput
        value={message}
        onChangeText={setMessage}
        onSend={handleSend}
        placeholder={t('chat:composer.messagePlaceholder')}
        showTopBar={false}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    paddingBottom: 100, // Extra space for input box
  },
  cardsContainer: {
    gap: 16,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardGradient: {
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  cardDescription: {
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 20,
  },
});
