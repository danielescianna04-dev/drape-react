import React, { useRef, useState } from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';

interface DescriptionInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export const DescriptionInput: React.FC<DescriptionInputProps> = ({
  value,
  onChangeText,
  placeholder = "Es. Una landing page per vendere scarpe..."
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  return (
    <View style={styles.container}>
      <View style={[styles.inputContainer, isFocused && styles.inputContainerFocused]}>
        <TextInput
          ref={inputRef}
          style={styles.textInput}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={value}
          onChangeText={onChangeText}
          onFocus={() => {
            console.log('🟢 DescriptionInput FOCUSED');
            setIsFocused(true);
          }}
          onBlur={() => {
            console.log('🔴 DescriptionInput BLURRED');
            setIsFocused(false);
          }}
          multiline
          textAlignVertical="top"
          numberOfLines={6}
        />
      </View>
      <Text style={styles.hintText}>Più dettagli fornisci, migliore sarà il risultato.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  inputContainer: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
    minHeight: 160,
  },
  inputContainerFocused: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: '#8B5CF6',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
    lineHeight: 24,
    minHeight: 120,
  },
  hintText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginLeft: 12,
    fontStyle: 'italic',
  },
});
