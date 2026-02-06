import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    Dimensions,
    Animated,
    ScrollView,
    Easing
} from 'react-native';
import { BlurView } from 'expo-blur';
import { AppColors } from '../../theme/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface Props {
    visible: boolean;
    progress: number;
    status: string;
    step?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const CreationProgressModal = ({ visible, progress, status, step }: Props) => {
    const progressAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const [activityLog, setActivityLog] = useState<string[]>([]);
    const [displayProgress, setDisplayProgress] = useState(0);
    const targetProgressRef = useRef(0);
    const scrollRef = useRef<ScrollView>(null);

    // Fade in animation
    useEffect(() => {
        if (visible) {
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
            }).start();
        } else {
            fadeAnim.setValue(0);
            setDisplayProgress(0);
            targetProgressRef.current = 0;
        }
    }, [visible]);

    // Smooth 1-by-1 progress counting
    useEffect(() => {
        let isMounted = true;

        if (isMounted) {
            targetProgressRef.current = Math.round(progress);
        }

        return () => { isMounted = false; };
    }, [progress]);

    useEffect(() => {
        let isMounted = true;

        if (!visible) return;

        const interval = setInterval(() => {
            if (isMounted) {
                setDisplayProgress(prev => {
                    const target = targetProgressRef.current;
                    if (prev < target) return prev + 1;
                    if (prev > target) return target;
                    return prev;
                });
            }
        }, 80);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [visible]);

    // Animate progress bar to match displayProgress
    useEffect(() => {
        let isMounted = true;

        if (isMounted) {
            Animated.timing(progressAnim, {
                toValue: displayProgress,
                duration: 80,
                easing: Easing.linear,
                useNativeDriver: false,
            }).start();
        }

        return () => { isMounted = false; };
    }, [displayProgress]);

    // Add status to activity log
    useEffect(() => {
        let isMounted = true;
        let timeoutId: NodeJS.Timeout | null = null;

        if (status && visible && isMounted) {
            setActivityLog(prev => {
                if (prev[prev.length - 1] === status) return prev;
                const newLog = [...prev, status];
                return newLog.slice(-6);
            });
            timeoutId = setTimeout(() => {
                if (isMounted) {
                    scrollRef.current?.scrollToEnd({ animated: true });
                }
            }, 100);
        }

        return () => {
            isMounted = false;
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [status, visible]);

    // Reset log when modal opens
    useEffect(() => {
        let isMounted = true;

        if (visible && isMounted) {
            setActivityLog([]);
        }

        return () => { isMounted = false; };
    }, [visible]);

    if (!visible) return null;

    const widthInterpolated = progressAnim.interpolate({
        inputRange: [0, 100],
        outputRange: ['0%', '100%'],
    });

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            statusBarTranslucent={true}
        >
            <View style={styles.container}>
                <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
                <View style={styles.backdrop} />

                <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
                    {/* Centered icon */}
                    <View style={styles.iconOuter}>
                        <LinearGradient
                            colors={[AppColors.primary, '#9333EA', '#6366F1']}
                            style={styles.iconGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        >
                            <Ionicons name="code-slash" size={28} color="#fff" />
                        </LinearGradient>
                    </View>

                    {/* Title */}
                    <Text style={styles.title}>Creazione in corso</Text>
                    <Text style={styles.subtitle}>{step || 'Inizializzazione...'}</Text>

                    {/* Big percentage */}
                    <Text style={styles.bigPercent}>{displayProgress}%</Text>

                    {/* Progress bar */}
                    <View style={styles.progressTrack}>
                        <Animated.View style={[styles.progressFill, { width: widthInterpolated }]}>
                            <LinearGradient
                                colors={[AppColors.primary, '#A855F7', '#6366F1']}
                                style={StyleSheet.absoluteFill}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            />
                        </Animated.View>
                    </View>

                    {/* Activity log */}
                    <View style={styles.logContainer}>
                        <ScrollView
                            ref={scrollRef}
                            style={styles.logScroll}
                            showsVerticalScrollIndicator={false}
                        >
                            {activityLog.map((log, index) => (
                                <View key={index} style={styles.logLine}>
                                    <Ionicons
                                        name={index === activityLog.length - 1 ? 'ellipse' : 'checkmark-circle'}
                                        size={12}
                                        color={index === activityLog.length - 1 ? AppColors.primary : '#10B981'}
                                        style={styles.logIcon}
                                    />
                                    <Text
                                        style={[
                                            styles.logText,
                                            index === activityLog.length - 1 && styles.logTextActive
                                        ]}
                                        numberOfLines={1}
                                    >
                                        {log}
                                    </Text>
                                </View>
                            ))}
                            {activityLog.length === 0 && (
                                <View style={styles.logLine}>
                                    <Ionicons name="ellipse" size={12} color={AppColors.primary} style={styles.logIcon} />
                                    <Text style={styles.logTextActive}>Avvio generazione...</Text>
                                </View>
                            )}
                        </ScrollView>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    content: {
        width: '100%',
        maxWidth: 340,
        alignItems: 'center',
    },
    // Icon
    iconOuter: {
        width: 80,
        height: 80,
        marginBottom: 28,
    },
    iconGradient: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: AppColors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 24,
        elevation: 12,
    },
    // Text
    title: {
        fontSize: 22,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 6,
        letterSpacing: -0.3,
    },
    subtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.45)',
        marginBottom: 32,
    },
    // Big percentage
    bigPercent: {
        fontSize: 56,
        fontWeight: '800',
        color: '#fff',
        marginBottom: 16,
        fontVariant: ['tabular-nums'],
        letterSpacing: -2,
    },
    // Progress bar
    progressTrack: {
        width: '100%',
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 2,
        overflow: 'hidden',
        marginBottom: 32,
    },
    progressFill: {
        height: '100%',
        borderRadius: 2,
    },
    // Log
    logContainer: {
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
    },
    logScroll: {
        maxHeight: 140,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    logLine: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    logIcon: {
        marginRight: 10,
    },
    logText: {
        flex: 1,
        fontSize: 13,
        color: 'rgba(255,255,255,0.35)',
    },
    logTextActive: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.8)',
        flex: 1,
    },
});
