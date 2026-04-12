import React from 'react';
import { Pressable, Share as RNShare, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ShareButtonProps {
  url?: string;
  title?: string;
}

export function ShareButton({ url, title }: ShareButtonProps) {
  const handleShare = async () => {
    try {
      await RNShare.share({ message: url || 'Check this out!', title: title || 'Share' });
    } catch {
      Alert.alert('Error', 'Could not share');
    }
  };

  return (
    <Pressable onPress={handleShare} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Ionicons name="share-outline" size={22} color="#6b7280" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { padding: 8, borderRadius: 999 },
  pressed: { opacity: 0.7 },
});
