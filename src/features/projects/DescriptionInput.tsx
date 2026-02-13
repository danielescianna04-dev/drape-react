import React, { useRef } from 'react';
import { View, TextInput, Text, StyleSheet, TouchableOpacity, Keyboard, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { useTranslation } from 'react-i18next';

const MAX_CHARS = 500;

interface DescriptionInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export const DescriptionInput = React.memo<DescriptionInputProps>(({
  value,
  onChangeText,
  placeholder = "Es. Una landing page per vendere scarpe..."
}) => {
  const { t } = useTranslation('projects');
  const inputRef = useRef<TextInput>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  React.useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            friction: 8,
            tension: 40,
            useNativeDriver: true,
          }),
        ]).start();
      }
    );

    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 0.8,
            duration: 150,
            useNativeDriver: true,
          }),
        ]).start();
      }
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const renderContent = () => (
    <>
      <TextInput
        ref={inputRef}
        style={styles.textInput}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.3)"
        value={value}
        onChangeText={(text) => {
          if (text.length <= MAX_CHARS) onChangeText(text);
        }}
        maxLength={MAX_CHARS}
        multiline
        scrollEnabled={true}
        textAlignVertical="top"
        numberOfLines={6}
        keyboardAppearance="dark"
      />
      <Animated.View
        style={[styles.fattoRow, {
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        }]}
      >
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={() => Keyboard.dismiss()}
          activeOpacity={0.7}
        >
          <Ionicons name="checkmark-circle" size={18} color="#fff" />
          <Text style={styles.dismissText}>Fatto</Text>
        </TouchableOpacity>
      </Animated.View>
    </>
  );

  return (
    <View style={styles.container}>
      {isLiquidGlassSupported ? (
        <LiquidGlassView
          style={[styles.inputContainer, { backgroundColor: 'transparent', overflow: 'hidden' }]}
          interactive={true}
          effect="clear"
          colorScheme="dark"
        >
          {renderContent()}
        </LiquidGlassView>
      ) : (
        <View style={styles.inputContainer}>
          {renderContent()}
        </View>
      )}
      <View style={styles.footerRow}>
        <View style={styles.aiHintContainer}>
          <Ionicons name="sparkles" size={14} color="rgba(139, 92, 246, 0.8)" />
          <Text style={styles.hintText}>{t('create.aiHint')}</Text>
        </View>
        <Text style={styles.charCount}>
          {value.length}/{MAX_CHARS}
        </Text>
      </View>
    </View>
  );
});

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
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 8,
    minHeight: 160,
    position: 'relative',
  },
  textInput: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
    lineHeight: 24,
    minHeight: 100,
    maxHeight: 120,
    paddingBottom: 4,
  },
  fattoRow: {
    marginTop: 4,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  charCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
  },
  dismissButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.45)', // Un po' più visibile essendo animato
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.5)',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  dismissText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  aiHintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  hintText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    flexShrink: 1,
  },
});
