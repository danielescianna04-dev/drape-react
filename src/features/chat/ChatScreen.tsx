import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const ChatScreen: React.FC = () => {
  console.log('🟢 Rendering ChatScreen'); // Added log
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#0a0a0f', '#1a0a2e', '#000000']}
        locations={[0, 0.3, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>AI Chat</Text>
        <Text style={styles.subtitle}>Start a conversation with your AI assistant.</Text>
        {/* Chat messages will go here */}
        <View style={{ height: 1000 }} /> {/* Placeholder for scrollable content */}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 20,
  },
});

export default ChatScreen;
