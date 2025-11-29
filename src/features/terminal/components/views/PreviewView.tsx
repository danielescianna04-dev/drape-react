import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';
import { AppColors } from '../../../../shared/theme/colors';
import { useSidebarOffset } from '../../context/SidebarContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

  const { sidebarTranslateX } = useSidebarOffset();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sidebarTranslateX.value / 2 }],
  }));

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

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      {/* Toolbar */}
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

      {/* Preview Info */}
      <View style={styles.infoBar}>
        <View style={styles.infoLeft}>
          <View style={[styles.statusDot, { backgroundColor: '#00D084' }]} />
          <Text style={styles.infoText}>Live Preview</Text>
        </View>
        <Text style={styles.dimensionsText}>
          {dimensions.width} × {dimensions.height}
        </Text>
      </View>

      {/* Preview Container */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.previewContainer}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
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

          {/* Device Label */}
          <View style={styles.deviceLabel}>
            <Ionicons name="information-circle" size={14} color="#6E6E73" />
            <Text style={styles.deviceLabelText}>
              {device.charAt(0).toUpperCase() + device.slice(1)} • {orientation}
            </Text>
          </View>
        </View>
      </ScrollView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingLeft: 50, // IconBar width
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
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
    backgroundColor: '#F5F5F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  deviceButtonActive: {
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
    borderColor: 'rgba(139, 124, 246, 0.3)',
  },
  deviceButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6E6E73',
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
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  toolButtonActive: {
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
    borderColor: 'rgba(139, 124, 246, 0.3)',
  },
  infoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
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
    color: '#1E1E1F',
  },
  dimensionsText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6E6E73',
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
    backgroundColor: '#F5F5F7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  deviceLabelText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6E6E73',
  },
});
