import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface LikeButtonProps {
  itemId: string;
  initialLiked?: boolean;
  onToggle?: (liked: boolean) => void;
  size?: number;
  color?: string;
}

export function LikeButton({ itemId, initialLiked = false, onToggle, size = 24, color = '#ef4444' }: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);

  const handleToggle = () => {
    const next = !liked;
    setLiked(next);
    onToggle?.(next);
  };

  return (
    <Pressable onPress={handleToggle} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Ionicons name={liked ? 'heart' : 'heart-outline'} size={size} color={liked ? color : '#9ca3af'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { padding: 8, borderRadius: 999 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.9 }] },
});
