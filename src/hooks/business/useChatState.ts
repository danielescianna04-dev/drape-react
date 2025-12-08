import { useState, useRef } from 'react';
import { useSharedValue } from 'react-native-reanimated';

/**
 * Manages all chat-related state, refs, and animated values
 * Extracted from ChatPage to separate concerns and improve testability
 *
 * @param isCardMode - Whether chat is in card/multitasking mode
 * @returns Object containing all chat state, refs, and animated values
 */
export const useChatState = (isCardMode: boolean) => {
  // User input state
  const [input, setInput] = useState('');
  const [isTerminalMode, setIsTerminalMode] = useState(true);
  const [forcedMode, setForcedMode] = useState<'terminal' | 'ai' | null>(null);
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4');
  const [conversationHistory, setConversationHistory] = useState<string[]>([]);
  const [scrollPaddingBottom, setScrollPaddingBottom] = useState(300);

  // Refs for managing state across renders
  const isProcessingToolsRef = useRef(false);
  const tabInputsRef = useRef<Record<string, string>>({});
  const previousTabIdRef = useRef<string | undefined>();
  const previousInputRef = useRef<string>('');

  // Animated values for smooth UI transitions
  const widgetHeight = useSharedValue(90); // Input widget height
  const scaleAnim = useSharedValue(1); // Scale animation for interactions
  const inputPositionAnim = useSharedValue(0); // Input vertical position
  const borderAnim = useSharedValue(0); // Border highlight animation
  const hasChatStartedAnim = useSharedValue(0); // 0 = welcome, 1 = chat started
  const cardModeAnim = useSharedValue(isCardMode ? 1 : 0); // Card mode transition
  const keyboardHeight = useSharedValue(0); // Keyboard height for layout

  return {
    // Input state
    input,
    setInput,
    isTerminalMode,
    setIsTerminalMode,
    forcedMode,
    setForcedMode,
    selectedModel,
    setSelectedModel,
    conversationHistory,
    setConversationHistory,
    scrollPaddingBottom,
    setScrollPaddingBottom,

    // Refs
    isProcessingToolsRef,
    tabInputsRef,
    previousTabIdRef,
    previousInputRef,

    // Animated values
    widgetHeight,
    scaleAnim,
    inputPositionAnim,
    borderAnim,
    hasChatStartedAnim,
    cardModeAnim,
    keyboardHeight,
  };
};
