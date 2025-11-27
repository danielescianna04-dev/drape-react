import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../shared/theme/colors';

const { width, height } = Dimensions.get('window');

/**
 * Premium splash screen with smooth animations
 * Modern, clean, and impactful design
 */
export const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  // Background glow animations
  const glow1 = useRef(new Animated.Value(0)).current;
  const glow2 = useRef(new Animated.Value(0)).current;

  // Logo animations
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.9)).current;
  const logoY = useRef(new Animated.Value(30)).current;

  // Text animations
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    // Background glows pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow1, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(glow1, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glow2, {
          toValue: 1,
          duration: 2500,
          useNativeDriver: true,
        }),
        Animated.timing(glow2, {
          toValue: 0,
          duration: 2500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Logo entrance
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(logoY, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    // Text entrance
    Animated.sequence([
      Animated.delay(400),
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(textY, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    const timer = setTimeout(onFinish, 2200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      {/* Dark gradient background */}
      <LinearGradient
        colors={['#000000', '#0a0a0f', '#000000']}
        style={StyleSheet.absoluteFill}
      />

      {/* Animated glows */}
      <Animated.View
        style={[
          styles.glow1,
          {
            opacity: glow1.interpolate({
              inputRange: [0, 1],
              outputRange: [0.3, 0.6],
            }),
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(139, 124, 246, 0.4)', 'transparent']}
          style={styles.glowGradient}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.glow2,
          {
            opacity: glow2.interpolate({
              inputRange: [0, 1],
              outputRange: [0.2, 0.5],
            }),
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(168, 85, 247, 0.3)', 'transparent']}
          style={styles.glowGradient}
        />
      </Animated.View>

      {/* Main content */}
      <View style={styles.content}>
        {/* Logo */}
        <Animated.View
          style={{
            opacity: logoOpacity,
            transform: [
              { scale: logoScale },
              { translateY: logoY },
            ],
          }}
        >
          <View style={styles.logoContainer}>
            {/* Icon/Symbol */}
            <View style={styles.iconBox}>
              <LinearGradient
                colors={[AppColors.primary, AppColors.purpleMedium]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconGradient}
              >
                <View style={styles.iconInner}>
                  <View style={styles.iconBar} />
                  <View style={[styles.iconBar, { width: 16, marginTop: 3 }]} />
                  <View style={[styles.iconBar, { width: 12, marginTop: 3 }]} />
                </View>
              </LinearGradient>
            </View>

            {/* Brand name */}
            <Text style={styles.brandName}>Drape</Text>
          </View>
        </Animated.View>

        {/* Subtitle */}
        <Animated.View
          style={{
            opacity: textOpacity,
            transform: [{ translateY: textY }],
          }}
        >
          <Text style={styles.subtitle}>AI-Powered Mobile IDE</Text>
        </Animated.View>
      </View>

      {/* Bottom branding */}
      <Animated.View
        style={[
          styles.bottomBrand,
          {
            opacity: textOpacity,
          },
        ]}
      >
        <View style={styles.brandDot} />
        <Text style={styles.brandText}>Built for developers</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  // Glows
  glow1: {
    position: 'absolute',
    width: 400,
    height: 400,
    top: height * 0.15,
    left: -100,
    borderRadius: 200,
  },
  glow2: {
    position: 'absolute',
    width: 350,
    height: 350,
    bottom: height * 0.1,
    right: -80,
    borderRadius: 175,
  },
  glowGradient: {
    flex: 1,
    borderRadius: 200,
  },
  // Logo
  logoContainer: {
    alignItems: 'center',
    gap: 24,
  },
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  iconGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconInner: {
    alignItems: 'flex-start',
  },
  iconBar: {
    width: 20,
    height: 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  brandName: {
    fontSize: 52,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -2,
    textAlign: 'center',
  },
  // Subtitle
  subtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 1.5,
    textAlign: 'center',
    marginTop: 16,
    textTransform: 'uppercase',
  },
  // Bottom branding
  bottomBrand: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  brandDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: AppColors.primary,
  },
  brandText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 0.5,
  },
});
