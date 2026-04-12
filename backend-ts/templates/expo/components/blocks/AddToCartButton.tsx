import React, { useState } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../AppProvider';

interface AddToCartButtonProps {
  item: { id: string; name: string; price: number; image?: string };
}

export function AddToCartButton({ item }: AddToCartButtonProps) {
  const { addToCart } = useApp();
  const [justAdded, setJustAdded] = useState(false);

  const handleAdd = () => {
    addToCart(item);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  };

  return (
    <Pressable onPress={handleAdd} style={({ pressed }) => [styles.button, justAdded ? styles.added : styles.normal, pressed && styles.pressed]}>
      <Ionicons name={justAdded ? 'checkmark' : 'cart-outline'} size={18} color="#fff" />
      <Text style={styles.text}>{justAdded ? 'Added!' : 'Add to cart'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  normal: { backgroundColor: '#8B5CF6' },
  added: { backgroundColor: '#22c55e' },
  pressed: { opacity: 0.85 },
  text: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
