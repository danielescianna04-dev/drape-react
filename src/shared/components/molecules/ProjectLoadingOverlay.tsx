import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, Animated, Easing, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
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
    const scaleAnim = useRef(new Animated.Value(0.9)).current;
    const progressAnim = useRef(new Animated.Value(0)).current;
    const [currentTip, setCurrentTip] = useState(0);

    // Rotate tips every 3 seconds
    useEffect(() => {
        if (!visible || !showTips) return;

        const interval = setInterval(() => {
            setCurrentTip((prev) => (prev + 1) % LOADING_TIPS.length);
        }, 3000);

        return () => clearInterval(interval);
    }, [visible, showTips]);

    // Animate progress
    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: progress,
            duration: 500,
            easing: Easing.out(Easing.ease),
            useNativeDriver: false, // width animation needs false
        }).start();
    }, [progress]);

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 200,
                    easing: Easing.out(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    friction: 10,
                    tension: 100,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 150,
                    useNativeDriver: true,
                }),
                Animated.timing(scaleAnim, {
                    toValue: 0.95,
                    duration: 150,
                    useNativeDriver: true,
                }),
            ]).start();
        }

        return () => {
            fadeAnim.stopAnimation();
            scaleAnim.stopAnimation();
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
                        styles.card,
                        { transform: [{ scale: scaleAnim }] }
                    ]}
                >
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
                        <View style={styles.tipContainer}>
                            <Text style={styles.tipIcon}>{LOADING_TIPS[currentTip].icon}</Text>
                            <Text style={styles.tipText} numberOfLines={2}>
                                {LOADING_TIPS[currentTip].text}
                            </Text>
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
    card: {
        backgroundColor: 'rgba(20, 20, 22, 0.97)',
        paddingTop: 24,
        paddingBottom: 24,
        paddingHorizontal: 28,
        borderRadius: 24,
        alignItems: 'center',
        minWidth: 300,
        maxWidth: Dimensions.get('window').width - 60,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.5,
        shadowRadius: 40,
        elevation: 20,
    },
    headerSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 20,
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
        gap: 14,
        marginBottom: 16,
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
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.4)',
        textAlign: 'center',
        marginBottom: 16,
        fontWeight: '500',
    },
    tipContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: 'rgba(155, 138, 255, 0.06)',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginBottom: 10,
        minHeight: 52,
        borderWidth: 1,
        borderColor: 'rgba(155, 138, 255, 0.1)',
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
