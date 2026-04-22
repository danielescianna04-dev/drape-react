import React from 'react';
import { View, Text, TouchableOpacity, TouchableWithoutFeedback, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../../features/settings/components/GlassCard';
import { AppColors } from '../../../shared/theme/colors';
import { PreviewToolbar } from './PreviewToolbar';

interface Props {
  styles: any;
  isPreviewShowing: boolean;
  activeTabType?: string;
  databaseBackHandler?: (() => void) | null;
  tabs: Array<{ id: string; type?: string }>;
  setActiveTab: (id: string) => void;
  togglePanel: (panel: 'chat') => void;
  previewCurrentUrl: string;
  previewHandlers: any;
  previewPublishInfo: unknown;
  previewViewportMode: string;
  currentPreviewPath: string;
  showHeaderMenu: boolean;
  closeMenu: () => void;
  openMenu: () => void;
  morphStyle: any;
  dotsOpacity: any;
  menuItemsOpacity: any;
  backdropAnimatedStyle: any;
  hamburgerTopStyle: any;
  hamburgerMidStyle: any;
  hamburgerBotStyle: any;
  onOpenPreview: () => void;
  onRefreshPreview: () => void;
  onToggleViewport: () => void;
  onPublishPreview: () => void;
  onOpenInBrowser?: () => void;
  onOpenProjectHistory: () => void;
}

export const VSCodeSidebarHeader: React.FC<Props> = ({
  styles,
  isPreviewShowing,
  activeTabType,
  databaseBackHandler,
  tabs,
  setActiveTab,
  togglePanel,
  previewCurrentUrl,
  previewHandlers,
  previewPublishInfo,
  previewViewportMode,
  currentPreviewPath,
  showHeaderMenu,
  closeMenu,
  openMenu,
  morphStyle,
  dotsOpacity,
  menuItemsOpacity,
  backdropAnimatedStyle,
  hamburgerTopStyle,
  hamburgerMidStyle,
  hamburgerBotStyle,
  onOpenPreview,
  onRefreshPreview,
  onToggleViewport,
  onPublishPreview,
  onOpenInBrowser,
  onOpenProjectHistory,
}) => {
  const chatTab = tabs.find((tab) => tab.type === 'terminal' || tab.type === 'chat');

  return (
    <>
      <View style={styles.minimalHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => togglePanel('chat')}>
            <GlassCard style={styles.headerButtonGlass}>
              <View style={styles.headerButton}>
                <View style={{ width: 18, height: 14, justifyContent: 'space-between' }}>
                  <Animated.View style={[{ width: 18, height: 2, borderRadius: 1, backgroundColor: '#fff' }, hamburgerTopStyle]} />
                  <Animated.View style={[{ width: 14, height: 2, borderRadius: 1, backgroundColor: '#fff' }, hamburgerMidStyle]} />
                  <Animated.View style={[{ width: 18, height: 2, borderRadius: 1, backgroundColor: '#fff' }, hamburgerBotStyle]} />
                </View>
              </View>
            </GlassCard>
          </TouchableOpacity>

          {activeTabType !== 'terminal' && activeTabType !== 'chat' && chatTab && (
            <TouchableOpacity activeOpacity={0.7} onPress={() => setActiveTab(chatTab.id)}>
              <GlassCard style={styles.headerButtonGlass}>
                <View style={styles.headerButton}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
                </View>
              </GlassCard>
            </TouchableOpacity>
          )}

          {activeTabType === 'database' && databaseBackHandler && (
            <TouchableOpacity activeOpacity={0.7} onPress={() => databaseBackHandler()}>
              <GlassCard style={styles.headerButtonGlass}>
                <View style={styles.headerButton}>
                  <Ionicons name="chevron-back" size={18} color="#fff" />
                </View>
              </GlassCard>
            </TouchableOpacity>
          )}
        </View>

        {isPreviewShowing && (
          <>
            <TouchableOpacity
              onPress={() => previewHandlers.goBack?.()}
              activeOpacity={0.7}
              style={{ width: 28, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}
            >
              <Ionicons name="chevron-back" size={18} color="rgba(255, 255, 255, 0.5)" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => previewHandlers.goForward?.()}
              activeOpacity={0.7}
              style={{ width: 28, height: 40, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="chevron-forward" size={18} color="rgba(255, 255, 255, 0.5)" />
            </TouchableOpacity>
            <GlassCard style={{ borderRadius: 20, overflow: 'hidden', flex: 1, marginLeft: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', height: 40, paddingHorizontal: 14, gap: 6 }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: previewCurrentUrl ? '#00D084' : '#666' }} />
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }} numberOfLines={1}>
                  {currentPreviewPath}
                </Text>
              </View>
            </GlassCard>
          </>
        )}
      </View>

      {showHeaderMenu && (
        <TouchableWithoutFeedback onPress={closeMenu}>
          <Animated.View style={[styles.menuBackdrop, backdropAnimatedStyle]} />
        </TouchableWithoutFeedback>
      )}

      <View style={styles.morphButtonWrapper} pointerEvents="box-none">
        <TouchableOpacity activeOpacity={1} onPress={showHeaderMenu ? closeMenu : openMenu}>
          <GlassCard style={{ borderRadius: 20, overflow: 'visible' }}>
            <Animated.View style={[styles.morphButton, morphStyle]}>
              <Animated.View style={[styles.dotsContainer, dotsOpacity]}>
                <View style={localStyles.dot} />
                <View style={localStyles.dot} />
                <View style={localStyles.dot} />
              </Animated.View>
              <Animated.View style={[styles.menuContent, menuItemsOpacity]}>
                <TouchableOpacity style={styles.menuItem} activeOpacity={0.6} onPress={onOpenPreview}>
                  <Ionicons name="eye-outline" size={20} color="#fff" />
                  <Text style={styles.menuItemText}>Mostra preview</Text>
                </TouchableOpacity>
                {isPreviewShowing && (
                  <>
                    <View style={styles.menuDivider} />
                    <TouchableOpacity style={styles.menuItem} activeOpacity={0.6} onPress={onRefreshPreview}>
                      <Ionicons name="refresh" size={20} color="#fff" />
                      <Text style={styles.menuItemText}>Ricarica</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} activeOpacity={0.6} onPress={onToggleViewport}>
                      <Ionicons
                        name={previewViewportMode === 'desktop' ? 'phone-portrait-outline' : 'desktop-outline'}
                        size={20}
                        color="#fff"
                      />
                      <Text style={styles.menuItemText}>
                        {previewViewportMode === 'desktop' ? 'Vista mobile' : 'Vista desktop'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} activeOpacity={0.6} onPress={onPublishPreview}>
                      <Ionicons
                        name={previewPublishInfo ? 'cloud-done-outline' : 'cloud-upload-outline'}
                        size={20}
                        color={previewPublishInfo ? '#00D084' : '#fff'}
                      />
                      <Text style={styles.menuItemText}>
                        {previewPublishInfo ? 'Aggiorna sito' : 'Pubblica'}
                      </Text>
                    </TouchableOpacity>
                    {onOpenInBrowser && (
                      <TouchableOpacity style={styles.menuItem} activeOpacity={0.6} onPress={onOpenInBrowser}>
                        <Ionicons name="open-outline" size={20} color="#fff" />
                        <Text style={styles.menuItemText}>Apri nel browser</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
                <View style={styles.menuDivider} />
                <TouchableOpacity style={styles.menuItem} activeOpacity={0.6} onPress={onOpenProjectHistory}>
                  <Ionicons name="time-outline" size={20} color={AppColors.primary} />
                  <Text style={styles.menuItemText}>Project History</Text>
                </TouchableOpacity>
              </Animated.View>
            </Animated.View>
          </GlassCard>
        </TouchableOpacity>
      </View>
    </>
  );
};

const localStyles = StyleSheet.create({
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#fff',
  },
});

