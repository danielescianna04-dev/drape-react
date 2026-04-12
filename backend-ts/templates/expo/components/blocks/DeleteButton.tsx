import React from 'react';
import { Pressable, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface DeleteButtonProps {
  onDelete: () => void;
  confirmTitle?: string;
  confirmMessage?: string;
}

export function DeleteButton({ onDelete, confirmTitle = 'Delete', confirmMessage = 'Are you sure?' }: DeleteButtonProps) {
  const handlePress = () => {
    Alert.alert(confirmTitle, confirmMessage, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <Pressable onPress={handlePress} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Ionicons name="trash-outline" size={22} color="#ef4444" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { padding: 8, borderRadius: 999 },
  pressed: { opacity: 0.7, backgroundColor: '#fef2f2' },
});
