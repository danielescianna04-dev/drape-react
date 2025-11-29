import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, TextInput, KeyboardAvoidingView, Platform, FlatList } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, interpolate, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';
import { AppColors } from '../../../../shared/theme/colors';
import { useSidebarOffset } from '../../context/SidebarContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

interface Props {
  tab: any;
}

type DeviceType = 'mobile' | 'tablet' | 'desktop';
type Orientation = 'portrait' | 'landscape';

export const PreviewView = ({ tab }: Props) => {
  const [device, setDevice] = useState<DeviceType>('mobile');
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [showGrid, setShowGrid] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('http://localhost:8081');
  const [designMode, setDesignMode] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');

  const { sidebarTranslateX } = useSidebarOffset();

  // Animation values for design mode
  const designModeProgress = useSharedValue(0);
  const pinchScale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sidebarTranslateX.value / 2 }],
  }));

  // Animated style for the phone preview in design mode
  const phoneAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(designModeProgress.value, [0, 1], [1, 0.55]);
    const translateY = interpolate(designModeProgress.value, [0, 1], [0, -80]);

    return {
      transform: [
        { scale },
        { translateY },
      ],
    };
  });

  // Animated style for chat area
  const chatAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(designModeProgress.value, [0, 1], [300, 0]);
    const opacity = designModeProgress.value;

    return {
      transform: [{ translateY }],
      opacity,
    };
  });

  const enterDesignMode = useCallback(() => {
    setDesignMode(true);
    designModeProgress.value = withSpring(1, { damping: 15, stiffness: 100 });
  }, []);

  const exitDesignMode = useCallback(() => {
    designModeProgress.value = withSpring(0, { damping: 15, stiffness: 100 });
    setTimeout(() => setDesignMode(false), 300);
  }, []);

  // Pinch gesture to enter design mode
  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      pinchScale.value = event.scale;
    })
    .onEnd((event) => {
      if (event.scale < 0.7 && !designMode) {
        runOnJS(enterDesignMode)();
      }
      pinchScale.value = withSpring(1);
    });

  const handleSendMessage = useCallback(() => {
    if (!inputText.trim()) return;

    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      text: inputText.trim(),
      isUser: true,
      timestamp: new Date(),
    };

    setChatMessages(prev => [...prev, newMessage]);
    setInputText('');

    // Simulate AI response
    setTimeout(() => {
      const aiResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: "Sto analizzando la tua richiesta. Modifico il codice...",
        isUser: false,
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, aiResponse]);
    }, 1000);
  }, [inputText]);

  const getDeviceDimensions = () => {
    const baseWidth = SCREEN_WIDTH - 100;

    if (device === 'mobile') {
      return orientation === 'portrait'
        ? { width: 375, height: 667 }
        : { width: 667, height: 375 };
    } else if (device === 'tablet') {
      return orientation === 'portrait'
        ? { width: 768, height: 1024 }
        : { width: 1024, height: 768 };
    } else {
      return { width: baseWidth, height: 600 };
    }
  };

  const dimensions = getDeviceDimensions();
  const scale = Math.min(1, (SCREEN_WIDTH - 80) / dimensions.width);

  const renderChatMessage = ({ item }: { item: ChatMessage }) => (
    <View style={[styles.messageContainer, item.isUser ? styles.userMessage : styles.aiMessage]}>
      {!item.isUser && (
        <View style={styles.aiAvatar}>
          <Ionicons name="sparkles" size={14} color={AppColors.primary} />
        </View>
      )}
      <View style={[styles.messageBubble, item.isUser ? styles.userBubble : styles.aiBubble]}>
        <Text style={[styles.messageText, item.isUser ? styles.userMessageText : styles.aiMessageText]}>
          {item.text}
        </Text>
      </View>
    </View>
  );

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      {/* Design Mode Header */}
      {designMode && (
        <Animated.View style={[styles.designModeHeader]}>
          <TouchableOpacity onPress={exitDesignMode} style={styles.exitButton}>
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.designModeTitle}>Design Mode</Text>
          <View style={styles.exitButton}>
            <Ionicons name="sparkles" size={20} color={AppColors.primary} />
          </View>
        </Animated.View>
      )}

      {/* Toolbar - hidden in design mode */}
      {!designMode && (
        <View style={styles.toolbar}>
          <View style={styles.deviceSelector}>
            <TouchableOpacity
              style={[styles.deviceButton, device === 'mobile' && styles.deviceButtonActive]}
              onPress={() => setDevice('mobile')}
              activeOpacity={0.7}
            >
              <Ionicons name="phone-portrait" size={18} color={device === 'mobile' ? AppColors.primary : '#6E6E73'} />
              <Text style={[styles.deviceButtonText, device === 'mobile' && styles.deviceButtonTextActive]}>Mobile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.deviceButton, device === 'tablet' && styles.deviceButtonActive]}
              onPress={() => setDevice('tablet')}
              activeOpacity={0.7}
            >
              <Ionicons name="tablet-portrait" size={18} color={device === 'tablet' ? AppColors.primary : '#6E6E73'} />
              <Text style={[styles.deviceButtonText, device === 'tablet' && styles.deviceButtonTextActive]}>Tablet</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.deviceButton, device === 'desktop' && styles.deviceButtonActive]}
              onPress={() => setDevice('desktop')}
              activeOpacity={0.7}
            >
              <Ionicons name="desktop" size={18} color={device === 'desktop' ? AppColors.primary : '#6E6E73'} />
              <Text style={[styles.deviceButtonText, device === 'desktop' && styles.deviceButtonTextActive]}>Desktop</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.toolbarActions}>
            <TouchableOpacity
              style={[styles.toolButton, orientation === 'landscape' && styles.toolButtonActive]}
              onPress={() => setOrientation(orientation === 'portrait' ? 'landscape' : 'portrait')}
              activeOpacity={0.7}
            >
              <Ionicons name="phone-portrait" size={18} color="#6E6E73" style={{
                transform: [{ rotate: orientation === 'landscape' ? '90deg' : '0deg' }]
              }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.toolButton, showGrid && styles.toolButtonActive]}
              onPress={() => setShowGrid(!showGrid)}
              activeOpacity={0.7}
            >
              <Ionicons name="grid-outline" size={18} color="#6E6E73" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolButton} activeOpacity={0.7}>
              <Ionicons name="refresh" size={18} color="#6E6E73" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolButton} activeOpacity={0.7}>
              <Ionicons name="ellipsis-horizontal" size={18} color="#6E6E73" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Preview Info - hidden in design mode */}
      {!designMode && (
        <View style={styles.infoBar}>
          <View style={styles.infoLeft}>
            <View style={[styles.statusDot, { backgroundColor: '#00D084' }]} />
            <Text style={styles.infoText}>Live Preview</Text>
          </View>
          <Text style={styles.dimensionsText}>
            {dimensions.width} × {dimensions.height}
          </Text>
        </View>
      )}

      {/* Preview Container with Pinch Gesture */}
      <GestureDetector gesture={pinchGesture}>
        <Animated.View style={[styles.previewArea, designMode && styles.previewAreaDesignMode]}>
          <Animated.View style={[styles.phoneContainer, phoneAnimatedStyle]}>
            <View style={styles.previewWrapper}>
              <View
                style={[
                  styles.deviceFrame,
                  {
                    width: dimensions.width * scale,
                    height: dimensions.height * scale,
                    transform: [{ scale: 1 }]
                  }
                ]}
              >
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.02)']}
                  style={StyleSheet.absoluteFill}
                />

                {/* Mock Preview Content */}
                <View style={styles.mockContent}>
                  <View style={styles.mockHeader}>
                    <View style={styles.mockStatus} />
                  </View>
                  <View style={styles.mockBody}>
                    <View style={styles.mockCard} />
                    <View style={styles.mockCard} />
                    <View style={styles.mockCard} />
                  </View>
                </View>

                {/* Grid Overlay */}
                {showGrid && (
                  <View style={styles.gridOverlay}>
                    {[...Array(10)].map((_, i) => (
                      <View key={`v-${i}`} style={[styles.gridLine, styles.gridLineVertical, { left: `${i * 10}%` }]} />
                    ))}
                    {[...Array(10)].map((_, i) => (
                      <View key={`h-${i}`} style={[styles.gridLine, styles.gridLineHorizontal, { top: `${i * 10}%` }]} />
                    ))}
                  </View>
                )}
              </View>

              {/* Device Label - hidden in design mode */}
              {!designMode && (
                <View style={styles.deviceLabel}>
                  <Ionicons name="information-circle" size={14} color="#6E6E73" />
                  <Text style={styles.deviceLabelText}>
                    {device.charAt(0).toUpperCase() + device.slice(1)} • {orientation}
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>

          {/* Pinch hint - shown when not in design mode */}
          {!designMode && (
            <View style={styles.pinchHint}>
              <Ionicons name="contract-outline" size={16} color="#999" />
              <Text style={styles.pinchHintText}>Pizzica per la modalità design</Text>
            </View>
          )}
        </Animated.View>
      </GestureDetector>

      {/* Chat Interface - shown in design mode */}
      {designMode && (
        <Animated.View style={[styles.chatContainer, chatAnimatedStyle]}>
          <View style={styles.chatHeader}>
            <Ionicons name="chatbubbles" size={18} color={AppColors.primary} />
            <Text style={styles.chatHeaderText}>Chiedi modifiche all'AI</Text>
          </View>

          <FlatList
            data={chatMessages}
            renderItem={renderChatMessage}
            keyExtractor={item => item.id}
            style={styles.chatMessages}
            contentContainerStyle={styles.chatMessagesContent}
            inverted={false}
          />

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.chatInputContainer}>
              <TextInput
                style={styles.chatInput}
                placeholder="Descrivi le modifiche che vuoi..."
                placeholderTextColor="#666"
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
                onPress={handleSendMessage}
                disabled={!inputText.trim()}
              >
                <Ionicons name="send" size={18} color={inputText.trim() ? '#fff' : '#666'} />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingLeft: 50, // IconBar width
  },
  // Design Mode Header
  designModeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  exitButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  designModeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  // Preview area
  previewArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewAreaDesignMode: {
    flex: 0.5,
    justifyContent: 'flex-start',
    paddingTop: 20,
  },
  phoneContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinchHint: {
    position: 'absolute',
    bottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
  },
  pinchHintText: {
    fontSize: 12,
    color: '#999',
  },
  // Chat styles
  chatContainer: {
    flex: 0.5,
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  chatHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  chatMessages: {
    flex: 1,
  },
  chatMessagesContent: {
    padding: 16,
    gap: 12,
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  userMessage: {
    justifyContent: 'flex-end',
  },
  aiMessage: {
    justifyContent: 'flex-start',
  },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(139, 124, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: AppColors.primary,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userMessageText: {
    color: '#fff',
  },
  aiMessageText: {
    color: '#fff',
  },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  chatInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    color: '#fff',
    fontSize: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: '#1a1a1a',
  },
  deviceSelector: {
    flexDirection: 'row',
    gap: 6,
  },
  deviceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  deviceButtonActive: {
    backgroundColor: 'rgba(139, 124, 246, 0.2)',
    borderColor: 'rgba(139, 124, 246, 0.4)',
  },
  deviceButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
  },
  deviceButtonTextActive: {
    color: AppColors.primary,
  },
  toolbarActions: {
    flexDirection: 'row',
    gap: 6,
  },
  toolButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  toolButtonActive: {
    backgroundColor: 'rgba(139, 124, 246, 0.2)',
    borderColor: 'rgba(139, 124, 246, 0.4)',
  },
  infoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#151515',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  infoText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  dimensionsText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
    fontFamily: 'monospace',
  },
  scrollView: {
    flex: 1,
  },
  previewContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  previewWrapper: {
    alignItems: 'center',
  },
  deviceFrame: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 8,
    borderColor: '#1a1a1a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  mockContent: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  mockHeader: {
    height: 60,
    backgroundColor: 'rgba(139, 124, 246, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  mockStatus: {
    width: '40%',
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
  },
  mockBody: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  mockCard: {
    height: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(139, 124, 246, 0.2)',
  },
  gridLineVertical: {
    width: 1,
    height: '100%',
  },
  gridLineHorizontal: {
    height: 1,
    width: '100%',
  },
  deviceLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  deviceLabelText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
  },
});
