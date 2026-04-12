import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface QuantitySelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

export function QuantitySelector({ value, onChange, min = 0, max = 99 }: QuantitySelectorProps) {
  return (
    <View style={styles.container}>
      <Pressable onPress={() => onChange(Math.max(min, value - 1))} disabled={value <= min} style={({ pressed }) => [styles.btn, pressed && styles.pressed, value <= min && styles.disabled]}>
        <Ionicons name="remove" size={18} color={value <= min ? '#d1d5db' : '#374151'} />
      </Pressable>
      <Text style={styles.value}>{value}</Text>
      <Pressable onPress={() => onChange(Math.min(max, value + 1))} disabled={value >= max} style={({ pressed }) => [styles.btn, pressed && styles.pressed, value >= max && styles.disabled]}>
        <Ionicons name="add" size={18} color={value >= max ? '#d1d5db' : '#374151'} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10 },
  btn: { padding: 10 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
  value: { width: 40, textAlign: 'center', fontSize: 14, fontWeight: '600' },
});
