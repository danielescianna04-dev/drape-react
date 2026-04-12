import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';

interface ToggleSwitchProps {
  value: boolean;
  onChange: (value: boolean) => void;
  label?: string;
}

export function ToggleSwitch({ value, onChange, label }: ToggleSwitchProps) {
  return (
    <View style={styles.container}>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: '#d1d5db', true: '#8B5CF6' }} thumbColor="#fff" />
      {label && <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { fontSize: 14, color: '#374151' },
});
