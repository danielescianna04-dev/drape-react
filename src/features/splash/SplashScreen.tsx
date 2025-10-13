import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../shared/theme/colors';

export const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 840,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 840,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(onFinish, 1800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        <LinearGradient
          colors={[AppColors.purpleLight, AppColors.purpleMedium]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientText}
        >
          <Text style={styles.title}>Drape</Text>
        </LinearGradient>

        <Text style={[styles.subtitle, { color: AppColors.dark.bodyText, opacity: 0.5 }]}>
          AI-POWERED MOBILE IDE
        </Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090A0B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradientText: {
    borderRadius: 8,
  },
  title: {
    fontSize: 64,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -1,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 4,
    textAlign: 'center',
    marginTop: 12,
  },
});
