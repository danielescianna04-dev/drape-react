import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../shared/theme/colors';
import { DrapeLogo } from '../../shared/components/icons';

const { width, height } = Dimensions.get('window');

/**
 * Premium splash screen — clean, cinematic entrance
 */
export const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  // Icon
  const iconScale = useRef(new Animated.Value(0)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const iconRotate = useRef(new Animated.Value(0)).current;

  // Brand text
  const nameOpacity = useRef(new Animated.Value(0)).current;
  const nameY = useRef(new Animated.Value(16)).current;
  const nameScale = useRef(new Animated.Value(0.95)).current;

  // Tagline
  const tagOpacity = useRef(new Animated.Value(0)).current;
  const tagY = useRef(new Animated.Value(12)).current;

  // Bottom bar
  const bottomOpacity = useRef(new Animated.Value(0)).current;
  const bottomY = useRef(new Animated.Value(10)).current;

  // Shimmer line
  const shimmerX = useRef(new Animated.Value(-width)).current;

  // Exit
  const exitOpacity = useRef(new Animated.Value(1)).current;
  const exitScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Phase 1: Icon drops in with spring (0ms)
    Animated.parallel([
      Animated.spring(iconScale, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(iconOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(iconRotate, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Phase 2: Brand name (350ms)
    Animated.sequence([
      Animated.delay(350),
      Animated.parallel([
        Animated.timing(nameOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(nameY, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(nameScale, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      ]),
    ]).start();

    // Phase 3: Tagline (600ms)
    Animated.sequence([
      Animated.delay(600),
      Animated.parallel([
        Animated.timing(tagOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(tagY, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    // Phase 3b: Shimmer sweep across (800ms)
    Animated.sequence([
      Animated.delay(800),
      Animated.timing(shimmerX, {
        toValue: width,
        duration: 600,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Phase 4: Bottom (900ms)
    Animated.sequence([
      Animated.delay(900),
      Animated.parallel([
        Animated.timing(bottomOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(bottomY, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    // Phase 5: Exit (1800ms)
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(exitOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(exitScale, { toValue: 1.05, duration: 300, useNativeDriver: true }),
      ]).start(() => onFinish());
    }, 1800);

    return () => clearTimeout(timer);
  }, []);

  const iconSpin = iconRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['-8deg', '0deg'],
  });

  return (
    <Animated.View style={[styles.container, {
      opacity: exitOpacity,
      transform: [{ scale: exitScale }],
    }]}>
      {/* Deep gradient background */}
      <LinearGradient
        colors={['#0D0816', '#110A1F', '#0A0612', '#0D0816']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Subtle ambient glow behind icon */}
      <View style={styles.ambientGlow}>
        <LinearGradient
          colors={['rgba(155, 138, 255, 0.12)', 'transparent']}
          style={styles.ambientGlowInner}
        />
      </View>

      {/* Main content */}
      <View style={styles.content}>
        {/* App Icon */}
        <Animated.View style={[styles.iconShadow, {
          opacity: iconOpacity,
          transform: [
            { scale: iconScale },
            { rotate: iconSpin },
          ],
        }]}>
          <View style={styles.iconBox}>
            <LinearGradient
              colors={['#1A1028', '#130D1E', '#0F0A18']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconGradient}
            >
              <DrapeLogo size={52} gradient />
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Brand Name */}
        <Animated.View style={{
          opacity: nameOpacity,
          transform: [
            { translateY: nameY },
            { scale: nameScale },
          ],
        }}>
          <Text style={styles.brandName}>Drape</Text>
        </Animated.View>

        {/* Tagline with shimmer */}
        <Animated.View style={[styles.taglineWrap, {
          opacity: tagOpacity,
          transform: [{ translateY: tagY }],
        }]}>
          <Text style={styles.tagline}>AI-Powered Mobile IDE</Text>
          {/* Shimmer overlay */}
          <Animated.View style={[styles.shimmer, { transform: [{ translateX: shimmerX }] }]}>
            <LinearGradient
              colors={['transparent', 'rgba(155, 138, 255, 0.15)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.shimmerGradient}
            />
          </Animated.View>
        </Animated.View>
      </View>

      {/* Bottom */}
      <Animated.View style={[styles.bottom, {
        opacity: bottomOpacity,
        transform: [{ translateY: bottomY }],
      }]}>
        <View style={styles.bottomLine} />
        <View style={styles.bottomRow}>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>v1.0</Text>
          </View>
          <View style={styles.bottomDot} />
          <Text style={styles.bottomText}>Built for developers</Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0816',
  },
  ambientGlow: {
    position: 'absolute',
    width: 300,
    height: 300,
    top: height * 0.5 - 200,
    left: width * 0.5 - 150,
    borderRadius: 150,
  },
  ambientGlowInner: {
    flex: 1,
    borderRadius: 150,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  iconShadow: {
    marginBottom: 8,
  },
  iconBox: {
    width: 88,
    height: 88,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  iconGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandName: {
    fontSize: 48,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -1.5,
    textAlign: 'center',
  },
  taglineWrap: {
    overflow: 'hidden',
    paddingHorizontal: 2,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.white.w40,
    letterSpacing: 2,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  shimmerGradient: {
    flex: 1,
    width: 120,
  },
  bottom: {
    position: 'absolute',
    bottom: 54,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 12,
  },
  bottomLine: {
    width: 32,
    height: 1,
    backgroundColor: AppColors.white.w10,
    borderRadius: 1,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  versionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: AppColors.white.w06,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: AppColors.white.w08,
  },
  versionText: {
    fontSize: 11,
    fontWeight: '600',
    color: AppColors.white.w35,
    letterSpacing: 0.3,
  },
  bottomDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: AppColors.white.w25,
  },
  bottomText: {
    fontSize: 12,
    fontWeight: '500',
    color: AppColors.white.w35,
    letterSpacing: 0.3,
  },
});
