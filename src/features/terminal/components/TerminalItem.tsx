import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { TerminalItem as TerminalItemType, TerminalItemType as ItemType } from '../../../shared/types';
import { AppColors } from '../../../shared/theme/colors';

const colors = AppColors.dark;

interface Props {
  item: TerminalItemType;
}

export const TerminalItem = ({ item }: Props) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const getTextColor = () => {
    switch (item.type) {
      case ItemType.COMMAND:
        return AppColors.primary;
      case ItemType.ERROR:
        return AppColors.error;
      case ItemType.SYSTEM:
        return AppColors.warning;
      default:
        return colors.bodyText;
    }
  };

  const isTerminalCommand = item.type === ItemType.COMMAND && item.content.match(/^(ls|cd|pwd|mkdir|rm|cp|mv|cat|echo|touch|grep|find|chmod|chown|ps|kill|top|df|du|tar|zip|unzip|wget|curl|git|npm|node|python|pip|java|gcc|make|docker|kubectl)/);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {item.type === ItemType.COMMAND && (
        isTerminalCommand ? (
          <View style={styles.terminalCommand}>
            <Text style={styles.terminalPrompt}>$ </Text>
            <Text style={styles.terminalText}>{item.content}</Text>
          </View>
        ) : (
          <View style={styles.messageBlock}>
            <View style={styles.userHeader}>
              <View style={styles.userAvatar}>
                <Text style={styles.avatarText}>U</Text>
              </View>
              <Text style={styles.userName}>You</Text>
            </View>
            <View style={styles.messageContent}>
              <Text style={styles.userMessage}>{item.content}</Text>
            </View>
          </View>
        )
      )}

      {item.type === ItemType.OUTPUT && (
        isTerminalCommand ? (
          <Text style={styles.terminalOutput}>{item.content}</Text>
        ) : (
          <View style={styles.messageBlock}>
            <View style={styles.assistantHeader}>
              <View style={[styles.userAvatar, styles.assistantAvatar]}>
                <Text style={styles.avatarText}>AI</Text>
              </View>
              <Text style={styles.assistantName}>Drape AI</Text>
            </View>
            <View style={styles.messageContent}>
              <Text style={styles.assistantMessage}>{item.content}</Text>
            </View>
          </View>
        )
      )}

      {item.type === ItemType.ERROR && (
        <View style={styles.messageBlock}>
          <View style={styles.errorHeader}>
            <View style={[styles.userAvatar, styles.errorAvatar]}>
              <Text style={styles.avatarText}>!</Text>
            </View>
            <Text style={styles.errorName}>Error</Text>
          </View>
          <View style={styles.messageContent}>
            <Text style={styles.errorMessage}>{item.content}</Text>
          </View>
        </View>
      )}

      {item.type === ItemType.SYSTEM && (
        <View style={styles.systemBlock}>
          <Text style={styles.systemText}>{item.content}</Text>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  terminalCommand: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  terminalPrompt: {
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#00FF88',
    fontWeight: '600',
  },
  terminalText: {
    flex: 1,
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: 'rgba(255, 255, 255, 0.95)',
    lineHeight: 22,
  },
  terminalOutput: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 20,
    marginBottom: 12,
  },
  messageBlock: {
    marginBottom: 4,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  assistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  userAvatar: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: AppColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assistantAvatar: {
    backgroundColor: '#00D9FF',
  },
  errorAvatar: {
    backgroundColor: AppColors.error,
  },
  avatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  userName: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  assistantName: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  errorName: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.error,
  },
  messageContent: {
    paddingLeft: 32,
  },
  userMessage: {
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: 'rgba(255, 255, 255, 0.95)',
    lineHeight: 22,
  },
  assistantMessage: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 24,
  },
  errorMessage: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: AppColors.error,
    lineHeight: 20,
  },
  systemBlock: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 4,
  },
  systemText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
  },
});
