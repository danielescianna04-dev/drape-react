import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

export function SearchBar({ onSearch, placeholder = 'Search...', debounceMs = 300 }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSearch(value), debounceMs);
  }, [onSearch, debounceMs]);

  const handleClear = () => { setQuery(''); onSearch(''); };
  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <View style={styles.container}>
      <Ionicons name="search" size={18} color="#9ca3af" style={styles.icon} />
      <TextInput value={query} onChangeText={handleChange} placeholder={placeholder} placeholderTextColor="#9ca3af" style={styles.input} />
      {query ? (
        <Pressable onPress={handleClear} style={styles.clearBtn}>
          <Ionicons name="close-circle" size={18} color="#9ca3af" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 12 },
  icon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 10, fontSize: 14, color: '#111' },
  clearBtn: { padding: 4 },
});
