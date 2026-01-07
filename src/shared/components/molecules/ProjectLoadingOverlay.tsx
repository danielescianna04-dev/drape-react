import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Animated, Easing, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../theme/colors';

interface Props {
    visible: boolean;
    projectName?: string;
    message?: string;
}

export const ProjectLoadingOverlay = ({
    visible,
    projectName,
    message = 'Caricamento'
}: Props) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.9)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 250,
                    easing: Easing.out(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    friction: 8,
                    tension: 80,
                    useNativeDriver: true,
                }),
            ]).start();

            // Subtle pulse on icon background
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.05,
                        duration: 1200,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1200,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
            }).start();
        }

        return () => {
            fadeAnim.stopAnimation();
            scaleAnim.stopAnimation();
            pulseAnim.stopAnimation();
        };
    }, [visible]);

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="none"
            statusBarTranslucent={true}
        >
            <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
                <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />

                <Animated.View
                    style={[
                        styles.card,
                        { transform: [{ scale: scaleAnim }] }
                    ]}
                >
                    {/* Icon with pulse */}
                    <Animated.View style={[styles.iconWrapper, { transform: [{ scale: pulseAnim }] }]}>
                        <View style={styles.iconContainer}>
                            <Ionicons name="folder-open" size={32} color={AppColors.primary} />
                        </View>
                    </Animated.View>

                    {/* Project name */}
                    {projectName && (
                        <Text style={styles.projectName} numberOfLines={1}>
                            {projectName}
                        </Text>
                    )}

                    {/* Loading indicator + message */}
                    <View style={styles.loadingRow}>
                        <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
                        <Text style={styles.message}>{message}</Text>
                    </View>
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
        backgroundColor: 'rgba(28, 28, 30, 0.95)',
        paddingTop: 28,
        paddingBottom: 24,
        paddingHorizontal: 36,
        borderRadius: 20,
        alignItems: 'center',
        minWidth: 200,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    iconWrapper: {
        marginBottom: 16,
    },
    iconContainer: {
        width: 72,
        height: 72,
        borderRadius: 18,
        backgroundColor: `${AppColors.primary}15`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    projectName: {
        fontSize: 17,
        fontWeight: '600',
        color: '#FFFFFF',
        marginBottom: 12,
        textAlign: 'center',
        letterSpacing: 0.2,
    },
    loadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    message: {
        fontSize: 15,
        color: 'rgba(255, 255, 255, 0.5)',
        textAlign: 'center',
    },
});
