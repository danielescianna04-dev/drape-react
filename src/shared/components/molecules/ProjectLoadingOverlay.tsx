import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, Animated, Easing, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../theme/colors';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
    visible: boolean;
    projectName?: string;
    message?: string;
    progress?: number; // 0-100
    currentStep?: string; // e.g., "Allocating VM", "Syncing files"
    showTips?: boolean; // Show rotating tips
}

const LOADING_TIPS = [
    { icon: '⚡', text: 'Il codice pulito è più facile da mantenere' },
    { icon: '🚀', text: 'Committa spesso, pusha regolarmente' },
    { icon: '💡', text: 'La documentazione è parte del codice' },
    { icon: '🎯', text: 'Prima fallo funzionare, poi ottimizza' },
    { icon: '🔥', text: 'Testa il tuo codice prima di committare' },
    { icon: '⚙️', text: 'Le convenzioni di naming sono importanti' },
    { icon: '📦', text: 'Dependency injection rende testabile il codice' },
    { icon: '✨', text: 'Refactoring è sviluppo, non perdita di tempo' },
];

export const ProjectLoadingOverlay = ({
    visible,
    projectName,
    message = 'Caricamento',
    progress = 0,
    currentStep,
    showTips = true,
}: Props) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.8)).current;
    const translateYAnim = useRef(new Animated.Value(20)).current;
    const progressAnim = useRef(new Animated.Value(0)).current;
    const tipFadeAnim = useRef(new Animated.Value(0)).current;
    const [currentTip, setCurrentTip] = useState(0);

    // Rotate tips every 3 seconds with a nice fade transition
    useEffect(() => {
        if (!visible || !showTips) return;

        // Reset and fade in the first tip
        Animated.timing(tipFadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
        }).start();

        const interval = setInterval(() => {
            // Fade out
            Animated.timing(tipFadeAnim, {
                toValue: 0,
                duration: 400,
                useNativeDriver: true,
            }).start(() => {
                setCurrentTip((prev) => (prev + 1) % LOADING_TIPS.length);
                // Fade in next
                Animated.timing(tipFadeAnim, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                }).start();
            });
        }, 3500);

        return () => clearInterval(interval);
    }, [visible, showTips]);

    // Animate progress
    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: progress,
            duration: 500,
            easing: Easing.out(Easing.ease),
            useNativeDriver: false,
        }).start();
    }, [progress]);

    useEffect(() => {
        if (visible) {
            // Entry animation: Spring scale + Slide up + Fade
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    easing: Easing.out(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    friction: 8,
                    tension: 40,
                    useNativeDriver: true,
                }),
                Animated.timing(translateYAnim, {
                    toValue: 0,
                    duration: 400,
                    easing: Easing.out(Easing.back(1.5)),
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            // Exit animation: Quick fade + scale down
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(scaleAnim, {
                    toValue: 0.9,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(translateYAnim, {
                    toValue: 10,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
        }

        return () => {
            fadeAnim.stopAnimation();
            scaleAnim.stopAnimation();
            translateYAnim.stopAnimation();
        };
    }, [visible]);

    const progressWidth = progressAnim.interpolate({
        inputRange: [0, 100],
        outputRange: ['0%', '100%'],
    });

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="none"
            statusBarTranslucent={true}
        >
            <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
                <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

                <Animated.View
                    style={[
                        {
                            transform: [
                                { scale: scaleAnim },
                                { translateY: translateYAnim }
                            ]
                        }
                    ]}
                >
                    {isLiquidGlassSupported ? (
                        <LiquidGlassView
                            style={styles.cardGlass}
                            interactive={true}
                            effect="clear"
                            colorScheme="dark"
                        >
                            <View style={styles.cardInner}>
                                {/* Project name */}
                                {projectName && (
                                    <View style={styles.headerSection}>
                                        <Ionicons name="folder-open" size={20} color={AppColors.primary} />
                                        <Text style={styles.projectName} numberOfLines={1}>
                                            {projectName}
                                        </Text>
                                    </View>
                                )}

                                {/* Current step */}
                                {currentStep && (
                                    <Text style={styles.stepText}>{currentStep}</Text>
                                )}

                                {/* Progress bar */}
                                {progress > 0 && (
                                    <View style={styles.progressContainer}>
                                        <View style={styles.progressBar}>
                                            <Animated.View style={[styles.progressFill, { width: progressWidth }]}>
                                                <LinearGradient
                                                    colors={[AppColors.primary, '#8B5CF6']}
                                                    start={{ x: 0, y: 0 }}
                                                    end={{ x: 1, y: 0 }}
                                                    style={StyleSheet.absoluteFill}
                                                />
                                            </Animated.View>
                                        </View>
                                        <Text style={styles.progressText}>{Math.round(progress)}%</Text>
                                    </View>
                                )}

                                {/* Loading message */}
                                <Text style={styles.message}>{message}</Text>

                                {/* Rotating tips */}
                                {showTips && (
                                    <View style={styles.tipGlassWrapper}>
                                        <LiquidGlassView
                                            style={styles.tipGlass}
                                            interactive={true}
                                            effect="clear"
                                            colorScheme="dark"
                                        >
                                            <Animated.View style={[styles.tipContainerRaw, { opacity: tipFadeAnim }]}>
                                                <Text style={styles.tipIcon}>{LOADING_TIPS[currentTip].icon}</Text>
                                                <Text style={styles.tipText} numberOfLines={2}>
                                                    {LOADING_TIPS[currentTip].text}
                                                </Text>
                                            </Animated.View>
                                        </LiquidGlassView>
                                    </View>
                                )}
                            </View>
                        </LiquidGlassView>
                    ) : (
                        <View style={styles.card}>
                            {/* Project name */}
                            {projectName && (
                                <View style={styles.headerSection}>
                                    <Ionicons name="folder-open" size={20} color={AppColors.primary} />
                                    <Text style={styles.projectName} numberOfLines={1}>
                                        {projectName}
                                    </Text>
                                </View>
                            )}

                            {/* Current step */}
                            {currentStep && (
                                <Text style={styles.stepText}>{currentStep}</Text>
                            )}

                            {/* Progress bar */}
                            {progress > 0 && (
                                <View style={styles.progressContainer}>
                                    <View style={styles.progressBar}>
                                        <Animated.View style={[styles.progressFill, { width: progressWidth }]}>
                                            <LinearGradient
                                                colors={[AppColors.primary, '#8B5CF6']}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 0 }}
                                                style={StyleSheet.absoluteFill}
                                            />
                                        </Animated.View>
                                    </View>
                                    <Text style={styles.progressText}>{Math.round(progress)}%</Text>
                                </View>
                            )}

                            {/* Loading message */}
                            <Text style={styles.message}>{message}</Text>

                            {/* Rotating tips */}
                            {showTips && (
                                <View style={styles.tipBlurWrapper}>
                                    <BlurView intensity={40} tint="dark" style={styles.tipBlur}>
                                        <Animated.View style={[styles.tipContainerFallback, { opacity: tipFadeAnim }]}>
                                            <Text style={styles.tipIcon}>{LOADING_TIPS[currentTip].icon}</Text>
                                            <Text style={styles.tipText} numberOfLines={2}>
                                                {LOADING_TIPS[currentTip].text}
                                            </Text>
                                        </Animated.View>
                                    </BlurView>
                                </View>
                            )}
                        </View>
                    )}
                </Animated.View>
            </Animated.View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardGlass: {
        borderRadius: 24,
        overflow: 'hidden',
        width: 310,
        alignSelf: 'center',
    },
    cardInner: {
        backgroundColor: 'rgba(15, 15, 18, 0.95)',
        padding: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
        borderRadius: 24,
    },
    card: {
        backgroundColor: 'rgba(15, 15, 18, 0.7)',
        paddingTop: 24,
        paddingBottom: 24,
        paddingHorizontal: 28,
        borderRadius: 24,
        alignItems: 'center',
        minWidth: 300,
        maxWidth: Dimensions.get('window').width - 60,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.5,
        shadowRadius: 40,
        elevation: 20,
    },
    headerSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    projectName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
        textAlign: 'center',
        letterSpacing: 0.3,
    },
    stepText: {
        fontSize: 15,
        fontWeight: '600',
        color: AppColors.primary,
        marginBottom: 16,
        textAlign: 'center',
        letterSpacing: 0.5,
    },
    progressContainer: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },
    progressBar: {
        flex: 1,
        height: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 2,
    },
    progressText: {
        fontSize: 13,
        fontWeight: '700',
        color: AppColors.primary,
        minWidth: 42,
        textAlign: 'right',
    },
    message: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.3)',
        textAlign: 'center',
        marginBottom: 12,
        fontWeight: '500',
    },
    tipGlassWrapper: {
        borderRadius: 16,
        overflow: 'hidden',
        width: '100%',
    },
    tipGlass: {
        width: '100%',
        borderRadius: 16,
    },
    tipContainerRaw: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    tipBlurWrapper: {
        borderRadius: 16,
        overflow: 'hidden',
        width: '100%',
    },
    tipBlur: {
        width: '100%',
        borderRadius: 16,
        overflow: 'hidden',
    },
    tipContainerFallback: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 16,
    },
    tipIcon: {
        fontSize: 18,
    },
    tipText: {
        flex: 1,
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.8)',
        lineHeight: 17,
        fontWeight: '500',
    },
});
