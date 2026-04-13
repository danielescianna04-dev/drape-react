import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated as RNAnimated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppColors } from '../../shared/theme/colors';

const DATE_WHEEL_ITEM_HEIGHT = 44;
const DATE_WHEEL_VISIBLE_ITEMS = 5;
const DATE_WHEEL_PADDING = (DATE_WHEEL_ITEM_HEIGHT * (DATE_WHEEL_VISIBLE_ITEMS - 1)) / 2;

export type DateWheelOption = {
  value: number;
  label: string;
};

export const DateWheelColumn = ({
  label,
  options,
  selectedValue,
  onChange,
  visible,
}: {
  label: string;
  options: DateWheelOption[];
  selectedValue: number;
  onChange: (value: number) => void;
  visible: boolean;
}) => {
  const scrollRef = useRef<ScrollView>(null);
  const isProgrammaticScrollRef = useRef(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === selectedValue),
  );

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      isProgrammaticScrollRef.current = true;
      scrollRef.current?.scrollTo({
        y: selectedIndex * DATE_WHEEL_ITEM_HEIGHT,
        animated: false,
      });
      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [visible, selectedIndex]);

  const snapToIndex = (index: number, animated: boolean) => {
    const clampedIndex = Math.max(0, Math.min(options.length - 1, index));
    const nextValue = options[clampedIndex]?.value;
    if (nextValue == null) return;
    if (nextValue !== selectedValue) {
      onChange(nextValue);
    }
    isProgrammaticScrollRef.current = true;
    scrollRef.current?.scrollTo({
      y: clampedIndex * DATE_WHEEL_ITEM_HEIGHT,
      animated,
    });
    requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false;
    });
  };

  const handleMomentumEnd = (offsetY: number) => {
    if (isProgrammaticScrollRef.current) return;
    const nextIndex = Math.round(offsetY / DATE_WHEEL_ITEM_HEIGHT);
    snapToIndex(nextIndex, false);
  };

  return (
    <View style={styles.dateWheelColumn}>
      <Text style={styles.dateWheelLabel}>{label}</Text>
      <View style={styles.dateWheelFrame}>
        <View pointerEvents="none" style={styles.dateWheelSelectionBand} />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(21, 16, 38, 0.98)', 'rgba(21, 16, 38, 0.78)', 'transparent']}
          style={styles.dateWheelFadeTop}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'rgba(21, 16, 38, 0.78)', 'rgba(21, 16, 38, 0.98)']}
          style={styles.dateWheelFadeBottom}
        />
        <ScrollView
          ref={scrollRef}
          style={styles.dateWheelScroll}
          contentContainerStyle={styles.dateWheelContent}
          showsVerticalScrollIndicator={false}
          snapToInterval={DATE_WHEEL_ITEM_HEIGHT}
          decelerationRate="fast"
          bounces={false}
          onMomentumScrollEnd={(event) => handleMomentumEnd(event.nativeEvent.contentOffset.y)}
        >
          {options.map((option, index) => (
            <TouchableOpacity
              key={`${label}-${option.value}`}
              style={styles.dateWheelItem}
              activeOpacity={0.8}
              onPress={() => snapToIndex(index, true)}
            >
              <Text
                style={[
                  styles.dateWheelItemText,
                  option.value === selectedValue && styles.dateWheelItemTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

export const AnimatedGradientBg = () => {
  const bgMove = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    RNAnimated.loop(
      RNAnimated.timing(bgMove, {
        toValue: 1,
        duration: 6000,
        useNativeDriver: true,
        easing: (t: number) => t,
      }),
    ).start();
  }, [bgMove]);

  const bgShift1 = bgMove.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 15, 0] });
  const bgShift2 = bgMove.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -15, 0] });
  const bgScale1 = bgMove.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1.2, 1.25, 1.2] });
  const bgScale2 = bgMove.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1.22, 1.18, 1.22] });

  return (
    <View style={[StyleSheet.absoluteFillObject, { overflow: 'hidden' }]} pointerEvents="none">
      <RNAnimated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: bgShift1 }, { scale: bgScale1 }] }]}>
        <LinearGradient
          colors={['#1a0a2e', '#2d0845', AppColors.primary, '#0A0A0F']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: 0.45 }]}
        />
      </RNAnimated.View>
      <RNAnimated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: bgShift2 }, { scale: bgScale2 }] }]}>
        <LinearGradient
          colors={['#0A0A0F', '#4c1d95', '#1a0a2e', '#0A0A0F']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: 0.4 }]}
        />
      </RNAnimated.View>
    </View>
  );
};

export const HeroShowcase = ({ t }: { t: (key: string) => string }) => {
  const pulse = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: true }),
        RNAnimated.timing(pulse, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  const nodes = [
    { icon: 'code-slash' as const, label: t('auth:hero.code') },
    { icon: 'sparkles' as const, label: t('auth:hero.ai') },
    { icon: 'eye' as const, label: t('auth:hero.preview') },
  ];

  return (
    <View style={heroStyles.wrapper}>
      <View style={heroStyles.canvas}>
        <View style={heroStyles.pathLine} />

        <View style={heroStyles.nodeRow}>
          {nodes.map((node, idx) => (
            <View key={node.label} style={heroStyles.nodeCluster}>
              {idx === 1 && (
                <RNAnimated.View
                  style={[
                    heroStyles.centerHalo,
                    {
                      opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }),
                      transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }],
                    },
                  ]}
                />
              )}
              <View style={[heroStyles.node, idx === 1 && heroStyles.nodeActive]}>
                <Ionicons name={node.icon} size={20} color={idx === 1 ? '#DCD4FF' : '#A98FFF'} />
              </View>
              <Text style={[heroStyles.nodeLabel, idx === 1 && heroStyles.nodeLabelActive]}>{node.label}</Text>
            </View>
          ))}
        </View>

        <View style={heroStyles.captionPill}>
          <Text style={heroStyles.captionText}>{t('auth:hero.caption')}</Text>
        </View>
      </View>
    </View>
  );
};

export const GlassInputWrapper = ({
  children,
  styles,
}: {
  children: React.ReactNode;
  styles: any;
}) => {
  if (isLiquidGlassSupported) {
    return (
      <LiquidGlassView style={styles.glassInputWrapper} interactive={true} effect="clear" colorScheme="dark">
        {children}
      </LiquidGlassView>
    );
  }

  return <View style={styles.inputWrapper}>{children}</View>;
};

export const GlassBackButton = ({
  onPress,
  accessibilityLabel,
  styles,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  styles: any;
}) => {
  if (isLiquidGlassSupported) {
    return (
      <LiquidGlassView style={styles.glassBackButton} interactive={true} effect="clear" colorScheme="dark">
        <TouchableOpacity
          onPress={onPress}
          style={styles.backButtonInner}
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
      </LiquidGlassView>
    );
  }

  return (
    <TouchableOpacity
      style={styles.backButton}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      <Ionicons name="arrow-back" size={22} color="#fff" />
    </TouchableOpacity>
  );
};

const heroStyles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    marginTop: 10,
  },
  canvas: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 26,
    paddingBottom: 20,
    backgroundColor: 'rgba(12, 9, 30, 0.56)',
    borderWidth: 1,
    borderColor: 'rgba(145,119,255,0.24)',
    shadowColor: '#5D3BFF',
    shadowOpacity: 0.26,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  nodeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    marginBottom: 26,
  },
  pathLine: {
    position: 'absolute',
    top: 53,
    left: 70,
    right: 70,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(131, 100, 255, 0.34)',
  },
  nodeCluster: {
    width: 84,
    alignItems: 'center',
    position: 'relative',
  },
  centerHalo: {
    position: 'absolute',
    top: -6,
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: 'rgba(126, 94, 255, 0.32)',
  },
  node: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(150, 121, 255, 0.4)',
  },
  nodeActive: {
    backgroundColor: 'rgba(122, 90, 255, 0.34)',
    borderColor: 'rgba(190, 170, 255, 0.8)',
  },
  nodeLabel: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(194, 178, 255, 0.85)',
    letterSpacing: 0.2,
  },
  nodeLabelActive: {
    color: '#EAE2FF',
    fontWeight: '700',
  },
  captionPill: {
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(151, 124, 255, 0.28)',
  },
  captionText: {
    fontSize: 12,
    color: 'rgba(206, 194, 255, 0.9)',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});

const styles = StyleSheet.create({
  dateWheelColumn: {
    flex: 1,
    alignItems: 'stretch',
  },
  dateWheelLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
    textAlign: 'center',
  },
  dateWheelFrame: {
    height: DATE_WHEEL_ITEM_HEIGHT * DATE_WHEEL_VISIBLE_ITEMS,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  dateWheelSelectionBand: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: DATE_WHEEL_PADDING,
    height: DATE_WHEEL_ITEM_HEIGHT,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  dateWheelFadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: DATE_WHEEL_PADDING,
    zIndex: 2,
  },
  dateWheelFadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: DATE_WHEEL_PADDING,
    zIndex: 2,
  },
  dateWheelScroll: {
    flex: 1,
  },
  dateWheelContent: {
    paddingVertical: DATE_WHEEL_PADDING,
  },
  dateWheelItem: {
    height: DATE_WHEEL_ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateWheelItemText: {
    fontSize: 18,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.36)',
    letterSpacing: 0.2,
  },
  dateWheelItemTextActive: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
});
