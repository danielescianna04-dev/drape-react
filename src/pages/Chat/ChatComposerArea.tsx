import React, { useRef } from 'react';
import { Alert, Image, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { withTiming } from 'react-native-reanimated';
import { UndoRedoBar } from '../../features/terminal/components/UndoRedoBar';
import { ChatInputBar } from './ChatInputBar';

interface SelectedImage {
  uri: string;
}

interface ComposerProps {
  styles: any;
  currentWorkstationId?: string;
  currentWorkstationRepoUrl?: string;
  selectedInputImages: SelectedImage[];
  showScrollToBottom: boolean;
  input: string;
  handleInputChange: (text: string) => void;
  handleSend: () => void;
  handleStop: () => void;
  agentMode: 'fast' | 'terminal';
  handleToggleMode: (mode: 'fast' | 'terminal') => void;
  agentStreaming: boolean;
  isLoading: boolean;
  selectedModel: string;
  currentModelName?: string;
  showModelSelector: boolean;
  toggleModelSelector: () => void;
  closeDropdown: () => void;
  setSelectedModel: (id: string) => void;
  tracciaModelloSelezionato: (id: string) => void;
  isPaidUser: boolean;
  thinkingLevel: string;
  setThinkingLevel: (value: any) => void;
  contextUsage: number;
  showContextInfo: boolean;
  setShowContextInfo: (value: boolean) => void;
  budgetInfo: any;
  navigateToPlans: () => void;
  toggleToolsSheet: () => void;
  inputBarGlassId: string;
  glassApplied: boolean;
  widgetHeight: any;
  isActiveTab: boolean;
  isSidebarOpen: boolean;
  hasChatStarted: boolean;
  inputGlassRevealDelay: number;
  applyInputGlass: () => void;
  aiModeAnimatedStyle: any;
  dropdownAnimatedStyle: any;
  scrollToBottom: (animated?: boolean) => void;
  onRemoveImage: (index: number) => void;
  onOpenGit: () => void;
  onOpenBranch: () => void;
  onOpenEnvVars: () => void;
  labels: {
    scrollToBottom: string;
  };
}

export const ChatComposerArea: React.FC<ComposerProps> = ({
  styles,
  currentWorkstationId,
  currentWorkstationRepoUrl,
  selectedInputImages,
  showScrollToBottom,
  input,
  handleInputChange,
  handleSend,
  handleStop,
  agentMode,
  handleToggleMode,
  agentStreaming,
  isLoading,
  selectedModel,
  currentModelName,
  showModelSelector,
  toggleModelSelector,
  closeDropdown,
  setSelectedModel,
  tracciaModelloSelezionato,
  isPaidUser,
  thinkingLevel,
  setThinkingLevel,
  contextUsage,
  showContextInfo,
  setShowContextInfo,
  budgetInfo,
  navigateToPlans,
  toggleToolsSheet,
  inputBarGlassId,
  glassApplied,
  widgetHeight,
  isActiveTab,
  isSidebarOpen,
  hasChatStarted,
  inputGlassRevealDelay,
  applyInputGlass,
  aiModeAnimatedStyle,
  dropdownAnimatedStyle,
  scrollToBottom,
  onRemoveImage,
  onOpenGit,
  onOpenBranch,
  onOpenEnvVars,
  labels,
}) => {
  const lastMeasuredHeightRef = useRef<number | null>(null);
  const lastGlassApplyKeyRef = useRef<string | null>(null);
  const layoutLogCountRef = useRef(0);
  const repoName = (() => {
    if (!currentWorkstationRepoUrl) return undefined;
    const match = currentWorkstationRepoUrl.match(/\/([^/]+?)(?:\.git)?$/);
    return match?.[1];
  })();

  return (
    <>
      {showScrollToBottom && (
        <TouchableOpacity
          style={[
            styles.scrollToBottomButton,
            selectedInputImages.length > 0 && styles.scrollToBottomButtonWithImages,
          ]}
          onPress={() => scrollToBottom(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-down" size={16} color="#FFFFFF" />
          <Text style={styles.scrollToBottomText}>{labels.scrollToBottom}</Text>
        </TouchableOpacity>
      )}

      {currentWorkstationId && (
        <View style={[
          styles.undoFloatingContainer,
          selectedInputImages.length > 0 && styles.undoFloatingContainerWithImages,
        ]}>
          <UndoRedoBar
            projectId={currentWorkstationId}
            onUndoComplete={() => {}}
            onRedoComplete={() => {}}
          />
        </View>
      )}

      {selectedInputImages.length > 0 && (
        <View style={styles.compactImageBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.compactImageBarContent}
          >
            {selectedInputImages.map((image, index) => (
              <View key={`${image.uri}-${index}`} style={styles.compactImageItem}>
                <Image source={{ uri: image.uri }} style={styles.compactImage} />
                <TouchableOpacity
                  style={styles.compactRemoveButton}
                  onPress={() => onRemoveImage(index)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <ChatInputBar
        input={input}
        onChangeText={handleInputChange}
        onSend={handleSend}
        onStop={handleStop}
        agentMode={agentMode}
        onToggleMode={handleToggleMode}
        isStreaming={agentStreaming}
        isLoading={isLoading}
        hasImages={selectedInputImages.length > 0}
        selectedModel={selectedModel}
        currentModelName={currentModelName}
        showModelSelector={showModelSelector}
        onToggleModelSelector={toggleModelSelector}
        onCloseDropdown={closeDropdown}
        onSelectModel={(id) => {
          setSelectedModel(id);
          tracciaModelloSelezionato(id);
        }}
        isPaidUser={isPaidUser}
        onLockedModelPress={(model) => {
          Alert.alert(
            model.name,
            model.id.includes('opus')
              ? 'Il modello piu potente. Genera codice complesso, debug avanzato e architettura superiore. Disponibile con il piano Go.'
              : model.id.includes('gpt')
                ? 'GPT-5.3 di OpenAI. Eccelle in ragionamento e coding. Disponibile con il piano Go.'
                : 'Gemini Pro di Google. Ottime capacita di ragionamento e analisi. Disponibile con il piano Go.',
            [
              { text: 'Annulla', style: 'cancel' },
              { text: 'Vedi piani', onPress: navigateToPlans },
            ],
          );
        }}
        thinkingLevel={thinkingLevel}
        onSetThinkingLevel={setThinkingLevel}
        contextUsage={contextUsage}
        showContextInfo={showContextInfo}
        onToggleContextInfo={setShowContextInfo}
        budgetInfo={budgetInfo}
        onBudgetPress={navigateToPlans}
        onToolsPress={toggleToolsSheet}
        inputBarGlassId={inputBarGlassId}
        glassApplied={glassApplied}
        onLayout={(event) => {
          const nextHeight = event.nativeEvent.layout.height;
          layoutLogCountRef.current += 1;
          if (layoutLogCountRef.current <= 25) {
            console.log('[ChatComposerDebug] input_layout', {
              count: layoutLogCountRef.current,
              nextHeight,
              previousHeight: lastMeasuredHeightRef.current,
              isActiveTab,
              isSidebarOpen,
              glassApplied,
              hasChatStarted,
              inputBarGlassId,
            });
          }
          if (lastMeasuredHeightRef.current !== nextHeight) {
            lastMeasuredHeightRef.current = nextHeight;
            widgetHeight.value = withTiming(nextHeight, { duration: 100 });
          }

          if (Platform.OS === 'ios' && isActiveTab && !isSidebarOpen && !glassApplied) {
            const layoutApplyKey = `${inputBarGlassId}:${hasChatStarted ? 'started' : 'welcome'}`;
            if (lastGlassApplyKeyRef.current === layoutApplyKey) return;
            lastGlassApplyKeyRef.current = layoutApplyKey;
            const delay = hasChatStarted ? 0 : inputGlassRevealDelay;
            setTimeout(() => { applyInputGlass(); }, delay);
          }
        }}
        aiModeAnimatedStyle={aiModeAnimatedStyle}
        dropdownAnimatedStyle={dropdownAnimatedStyle}
        onOpenGit={onOpenGit}
        onOpenBranch={onOpenBranch}
        onOpenEnvVars={onOpenEnvVars}
        repoName={repoName}
        branchName={currentWorkstationRepoUrl ? 'main' : undefined}
        hasEnvVars={false}
      />
    </>
  );
};
