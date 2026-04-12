import React, { useState } from 'react';
import { ScrollView, Pressable, Text, StyleSheet } from 'react-native';

interface FilterChip { id: string; label: string; }

interface FilterChipsProps {
  chips: FilterChip[];
  initialSelected?: string[];
  onChange?: (selected: string[]) => void;
  multiple?: boolean;
}

export function FilterChips({ chips, initialSelected = [], onChange, multiple = true }: FilterChipsProps) {
  const [selected, setSelected] = useState<string[]>(initialSelected);

  const handleToggle = (chipId: string) => {
    const next = multiple
      ? (selected.includes(chipId) ? selected.filter(id => id !== chipId) : [...selected, chipId])
      : (selected.includes(chipId) ? [] : [chipId]);
    setSelected(next);
    onChange?.(next);
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
      {chips.map(chip => (
        <Pressable key={chip.id} onPress={() => handleToggle(chip.id)} style={[styles.chip, selected.includes(chip.id) ? styles.chipActive : styles.chipInactive]}>
          <Text style={[styles.chipText, selected.includes(chip.id) ? styles.chipTextActive : styles.chipTextInactive]}>{chip.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, paddingVertical: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  chipActive: { backgroundColor: '#8B5CF6' },
  chipInactive: { backgroundColor: '#f3f4f6' },
  chipText: { fontSize: 14, fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  chipTextInactive: { color: '#4b5563' },
});
