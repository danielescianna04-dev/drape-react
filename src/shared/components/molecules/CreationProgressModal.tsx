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
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppColors } from '../../theme/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface Props {
    visible: boolean;
    progress: number;
    status: string;
    step?: string;
}

const { width } = Dimensions.get('window');

export const CreationProgressModal = ({ visible, progress, status, step }: Props) => {
    const progressAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const [activityLog, setActivityLog] = useState<string[]>([]);
    const scrollRef = useRef<ScrollView>(null);

    // Fade in animation
    useEffect(() => {
        if (visible) {
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }).start();
        } else {
            fadeAnim.setValue(0);
        }
    }, [visible]);

    // Animate progress bar smoothly
    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: progress,
            duration: 500,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [progress]);

    // Add status to activity log
    useEffect(() => {
        if (status && visible) {
            setActivityLog(prev => {
                // Avoid duplicates
                if (prev[prev.length - 1] === status) return prev;
                const newLog = [...prev, status];
                return newLog.slice(-8);
            });
            setTimeout(() => {
                scrollRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [status, visible]);

    // Reset log when modal opens
    useEffect(() => {
        if (visible) {
            setActivityLog([]);
        }
    }, [visible]);

    if (!visible) return null;

    const widthInterpolated = progressAnim.interpolate({
        inputRange: [0, 100],
        outputRange: ['0%', '100%'],
    });

    const renderCardContent = () => (
        <View style={styles.cardInner}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.iconWrapper}>
                    <Ionicons name="code-slash" size={22} color={AppColors.primary} />
                </View>
                <View style={styles.headerText}>
                    <Text style={styles.title}>Creazione progetto</Text>
                    <Text style={styles.subtitle}>{step || 'Inizializzazione...'}</Text>
                </View>
            </View>

            {/* Terminal-like log */}
            {isLiquidGlassSupported ? (
                <LiquidGlassView
                    style={[styles.terminal, { backgroundColor: 'transparent', overflow: 'hidden' }]}
                    interactive={true}
                    effect="clear"
                    colorScheme="dark"
                >
                    <View style={styles.terminalHeader}>
                        <View style={styles.terminalDots}>
                            <View style={[styles.dot, { backgroundColor: '#FF5F56' }]} />
                            <View style={[styles.dot, { backgroundColor: '#FFBD2E' }]} />
                            <View style={[styles.dot, { backgroundColor: '#27CA40' }]} />
                        </View>
                        <Text style={styles.terminalTitle}>output</Text>
                    </View>
                    <ScrollView
                        ref={scrollRef}
                        style={styles.terminalContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {activityLog.map((log, index) => (
                            <View key={index} style={styles.logLine}>
                                <Text style={styles.logPrefix}>{'>'}</Text>
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
                                <Text style={styles.logPrefix}>{'>'}</Text>
                                <Text style={styles.logText}>Avvio generazione...</Text>
                            </View>
                        )}
                    </ScrollView>
                </LiquidGlassView>
            ) : (
                <View style={styles.terminal}>
                    <View style={styles.terminalHeader}>
                        <View style={styles.terminalDots}>
                            <View style={[styles.dot, { backgroundColor: '#FF5F56' }]} />
                            <View style={[styles.dot, { backgroundColor: '#FFBD2E' }]} />
                            <View style={[styles.dot, { backgroundColor: '#27CA40' }]} />
                        </View>
                        <Text style={styles.terminalTitle}>output</Text>
                    </View>
                    <ScrollView
                        ref={scrollRef}
                        style={styles.terminalContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {activityLog.map((log, index) => (
                            <View key={index} style={styles.logLine}>
                                <Text style={styles.logPrefix}>{'>'}</Text>
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
                                <Text style={styles.logPrefix}>{'>'}</Text>
                                <Text style={styles.logText}>Avvio generazione...</Text>
                            </View>
                        )}
                    </ScrollView>
                </View>
            )}

            {/* Progress */}
            <View style={styles.progressContainer}>
                <View style={styles.progressInfo}>
                    <Text style={styles.progressLabel}>Progresso</Text>
                    <Text style={styles.progressValue}>{Math.round(progress)}%</Text>
                </View>
                <View style={styles.progressTrack}>
                    <Animated.View style={[styles.progressFill, { width: widthInterpolated }]}>
                        <LinearGradient
                            colors={[AppColors.primary, '#A855F7']}
                            style={StyleSheet.absoluteFill}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                        />
                    </Animated.View>
                </View>
            </View>
        </View>
    );

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            statusBarTranslucent={true}
        >
            <View style={styles.container}>
                <View style={styles.backdrop} />

                <Animated.View style={[styles.cardWrapper, { opacity: fadeAnim }]}>
                    {isLiquidGlassSupported ? (
                        <LiquidGlassView
                            style={[styles.card, { backgroundColor: 'transparent', overflow: 'hidden' }]}
                            interactive={true}
                            effect="clear"
                            colorScheme="dark"
                        >
                            {renderCardContent()}
                        </LiquidGlassView>
                    ) : (
                        <View style={styles.card}>
                            {renderCardContent()}
                        </View>
                    )}
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
        paddingHorizontal: 24,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
    },
    cardWrapper: {
        width: '100%',
        maxWidth: 380,
    },
    card: {
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    cardInner: {
        backgroundColor: 'rgba(26, 26, 46, 0.4)',
        borderRadius: 24,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        gap: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    iconWrapper: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(139, 92, 246, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerText: {
        flex: 1,
    },
    title: {
        fontSize: 17,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 2,
    },
    subtitle: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
    },
    terminal: {
        margin: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    terminalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    terminalDots: {
        flexDirection: 'row',
        gap: 6,
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    terminalTitle: {
        flex: 1,
        textAlign: 'center',
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        marginRight: 30,
    },
    terminalContent: {
        height: 120,
        padding: 12,
    },
    logLine: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 6,
    },
    logPrefix: {
        fontSize: 13,
        color: '#10B981',
        fontFamily: 'monospace',
        marginRight: 8,
        fontWeight: '600',
    },
    logText: {
        flex: 1,
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
        fontFamily: 'monospace',
    },
    logTextActive: {
        color: '#fff',
    },
    progressContainer: {
        padding: 20,
        paddingTop: 4,
    },
    progressInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    progressLabel: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
    },
    progressValue: {
        fontSize: 13,
        color: '#fff',
        fontWeight: '600',
    },
    progressTrack: {
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },
});
