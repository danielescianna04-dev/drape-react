import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface RatingStarsProps {
  initialRating?: number;
  maxStars?: number;
  onRate?: (rating: number) => void;
  readOnly?: boolean;
  size?: number;
}

export function RatingStars({ initialRating = 0, maxStars = 5, onRate, readOnly = false, size = 24 }: RatingStarsProps) {
  const [rating, setRating] = useState(initialRating);

  const handleRate = (star: number) => {
    if (readOnly) return;
    setRating(star);
    onRate?.(star);
  };

  return (
    <View style={styles.container}>
      {Array.from({ length: maxStars }, (_, i) => i + 1).map(star => (
        <Pressable key={star} onPress={() => handleRate(star)} disabled={readOnly} style={({ pressed }) => [pressed && !readOnly && styles.pressed]}>
          <Ionicons name={rating >= star ? 'star' : 'star-outline'} size={size} color={rating >= star ? '#facc15' : '#d1d5db'} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: 2 },
  pressed: { opacity: 0.7, transform: [{ scale: 1.2 }] },
});
