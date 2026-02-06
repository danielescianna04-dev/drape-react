import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../shared/theme/colors';
import { ChatInput } from '../../shared/components/ChatInput';

interface ProblemCardData {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  color: string;
}

const problemCards: ProblemCardData[] = [
  {
    id: '1',
    icon: 'desktop',
    title: 'Desktop Dependency',
    description: 'Gli IDE attuali (VS Code, Cursor, Warp) sono progettati per desktop. Il mobile manca di un\'esperienza fluida per lo sviluppo professionale.',
    color: '#8B7CF6',
  },
  {
    id: '2',
    icon: 'cube',
    title: 'AI Frammentata',
    description: 'Developer devono usare tool separati per GPT-5, Claude 4.5, Gemini Pro 2.5. Nessuna integrazione nativa in ambiente mobile.',
    color: '#6F5CFF',
  },
  {
    id: '3',
    icon: 'phone-portrait',
    title: 'Produttività Persa',
    description: '68% dei developer usano smartphone per >3h/giorno, ma solo per task minori. Manca piattaforma seria per coding mobile.',
    color: '#5946D6',
  },
  {
    id: '4',
    icon: 'alert-circle',
    title: 'Emergenze Bloccanti',
    description: 'Production down mentre sei fuori casa? Debug urgente? Impossibile aprire laptop ovunque. Mobile = zero opzioni professionali.',
    color: '#4834B8',
  },
];

export const ProblemScreen = () => {
  const [message, setMessage] = useState('');

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
        <Text style={styles.headerTitle}>Il Problema</Text>
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
        placeholder="Scrivi un messaggio..."
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
