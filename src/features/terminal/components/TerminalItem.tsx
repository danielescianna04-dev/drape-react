import React, { useState, useCallback, useRef } from 'react';
import { View, Text, Animated, TouchableOpacity } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { TerminalItem as TerminalItemType, TerminalItemType as ItemType } from '../../../shared/types';
import { AppColors } from '../../../shared/theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { ImageViewerModal } from '../../../shared/components/modals/ImageViewerModal';
import { TerminalCommandItem } from './TerminalCommandItem';
import { TerminalOutputContent } from './TerminalOutputContent';
import { TerminalUserMessage } from './TerminalUserMessage';
import { TerminalSystemItem } from './TerminalSystemItem';
import { TerminalPlanItem } from './TerminalPlanItem';
import { FriendlyToolItem } from './FriendlyToolItem';
import { useUIStore } from '../../../core/terminal/uiStore';
import {
  TerminalBackendLogItem,
  TerminalErrorItem,
  TerminalLoadingItem,
} from './terminalSpecialItems';
import {
  canRetryTerminalTool,
  getTerminalItemDotColor,
  isUserMessageItem,
  shouldRenderTerminalItem,
} from './terminalItemUtils';
import { useTerminalItemAnimations } from './useTerminalItemAnimations';
import { styles } from './terminalItemStyles';

interface Props {
  item: TerminalItemType;
  isNextItemOutput?: boolean;
  outputItem?: TerminalItemType; // For terminal commands, include the output
  isLoading?: boolean; // For animated loading indicator
  onRetryTool?: (tool: string, input: any) => void | Promise<void>;
  onPlanApprove?: () => void; // Callback when plan is approved
  onPlanReject?: () => void; // Callback when plan is rejected
}

const TerminalItemInner = ({ item, isNextItemOutput, outputItem, isLoading = false, onRetryTool, onPlanApprove, onPlanReject }: Props) => {
  const { t } = useTranslation();
  const simpleToolView = useUIStore((s) => s.simpleToolView);
  const [isExpanded, setIsExpanded] = useState(false);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string>('');
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const [showMessageMenu, setShowMessageMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const messageRef = useRef<View>(null);

  const handleCopy = useCallback(async (text: string) => {
    await Clipboard.setStringAsync(text);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopiedFeedback(true);
    setTimeout(() => setCopiedFeedback(false), 1500);
  }, []);

  // Determine if we should show thinking state (either from parent isLoading or item.isThinking)
  const showThinking = isLoading || item?.isThinking;
  const canRetryTool = canRetryTerminalTool(item, typeof onRetryTool === 'function');

  // Determine if tool is executing (pulsing animation but with content visible)
  const isExecuting = item?.isExecuting;

  const {
    fadeAnim,
    slideAnim,
    pulseAnim,
    dotCount,
    thinkingPulseOpacity,
    thinkingDotOpacity1,
    thinkingDotOpacity2,
    thinkingDotOpacity3,
    threadDotOpacity,
    thinkingDisplayText,
    executingDots,
  } = useTerminalItemAnimations(item, showThinking, isExecuting, isLoading);

  // IMPORTANT: All hooks must be called before any conditional return!
  // Skip rendering empty placeholder messages (created for post-tool streaming)
  // BUT: Don't skip if showThinking is true - we want to show "Thinking..." indicator
  if (!shouldRenderTerminalItem(item, showThinking)) {
    return null;
  }

  // Check if this is a user message
  const isUserMessage = isUserMessageItem(item);
  const dotColor = getTerminalItemDotColor(item, outputItem);

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
      {/* Thread line and dot on the left - only for AI messages and bash commands */}
      {/* Hide for direct terminal commands that already have outputItem embedded in the card */}
      {!isUserMessage && !(item.content || '').startsWith('__PROJECT_CREATED__') && !(item.isDirectTerminal && outputItem) && (
        <View style={styles.threadContainer}>
          <Animated.View
            style={[
              styles.threadDot,
              { backgroundColor: isExecuting ? AppColors.primary : dotColor },
              { opacity: threadDotOpacity }
            ]}
          />
          {isNextItemOutput && <View style={styles.threadLine} />}
        </View>
      )}

      {/* Main content */}
      <View style={[styles.contentContainer, isUserMessage && styles.userMessageContainer]}>
        {item.type === ItemType.COMMAND && (
          <TerminalCommandItem item={item} outputItem={outputItem} styles={styles} />
        )}

        {item.type === ItemType.USER_MESSAGE && (
          <TerminalUserMessage
            item={item}
            styles={styles}
            t={t}
            messageRef={messageRef}
            handleCopy={handleCopy}
            setSelectedImageUri={setSelectedImageUri}
            setImageViewerVisible={setImageViewerVisible}
            showMessageMenu={showMessageMenu}
            setShowMessageMenu={setShowMessageMenu}
            menuPosition={menuPosition}
            setMenuPosition={setMenuPosition}
          />
        )}

        {item.type === ItemType.OUTPUT && (
          simpleToolView && (item as any).toolInfo ? (
            <FriendlyToolItem item={item as any} />
          ) : (
            <TerminalOutputContent
              item={item}
              styles={styles}
              t={t}
              isExpanded={isExpanded}
              setIsExpanded={setIsExpanded}
              isExecuting={isExecuting}
              executingDots={executingDots}
              pulseAnim={pulseAnim}
              showThinking={showThinking}
              thinkingDisplayText={thinkingDisplayText}
              thinkingPulseOpacity={thinkingPulseOpacity}
              thinkingDotOpacity1={thinkingDotOpacity1}
              thinkingDotOpacity2={thinkingDotOpacity2}
              thinkingDotOpacity3={thinkingDotOpacity3}
              handleCopy={handleCopy}
              copiedFeedback={copiedFeedback}
            />
          )
        )}

        {item.type === ItemType.ERROR && (
          <TerminalErrorItem item={item} styles={styles} t={t} />
        )}

        {item.type === ItemType.SYSTEM && (
          <TerminalSystemItem item={item} />
        )}

        {item.type === ItemType.LOADING && (
          <TerminalLoadingItem item={item} dotCount={dotCount} styles={styles} t={t} />
        )}

        {item.type === ItemType.BACKEND_LOG && (
          <TerminalBackendLogItem item={item} styles={styles} t={t} />
        )}

        {item.type === ItemType.PLAN_APPROVAL && item.planInfo && (
          <TerminalPlanItem item={item} onPlanApprove={onPlanApprove} onPlanReject={onPlanReject} />
        )}

        {canRetryTool && (
          <TouchableOpacity
            style={styles.retryToolButton}
            onPress={() => onRetryTool?.(item.toolInfo!.tool, item.toolInfo!.input)}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh" size={13} color="#58A6FF" />
            <Text style={styles.retryToolButtonText}>{t('terminal:terminalItem.retryTool')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Image Viewer Modal */}
      <ImageViewerModal
        visible={imageViewerVisible}
        imageUri={selectedImageUri}
        onClose={() => setImageViewerVisible(false)}
      />
    </Animated.View>
  );
};

const areTerminalItemPropsEqual = (prev: Props, next: Props) => (
  prev.item === next.item &&
  prev.outputItem === next.outputItem &&
  prev.isNextItemOutput === next.isNextItemOutput &&
  prev.isLoading === next.isLoading &&
  prev.onRetryTool === next.onRetryTool &&
  prev.onPlanApprove === next.onPlanApprove &&
  prev.onPlanReject === next.onPlanReject
);

export const TerminalItem = React.memo(TerminalItemInner, areTerminalItemPropsEqual);
