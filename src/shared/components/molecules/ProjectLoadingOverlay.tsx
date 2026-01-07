import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Animated, Easing } from 'react-native';
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
    message = 'Caricamento file...'
}: Props) => {
    const progressAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (visible) {
            // Progress bar animation
            progressAnim.setValue(0);
            Animated.loop(
                Animated.timing(progressAnim, {
                    toValue: 1,
                    duration: 1500,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: false,
                })
            ).start();

            // Pulse animation for icon
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.1,
                        duration: 600,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 600,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            progressAnim.stopAnimation();
            pulseAnim.stopAnimation();
        }

        return () => {
            progressAnim.stopAnimation();
            pulseAnim.stopAnimation();
        };
    }, [visible]);

    const progressWidth = progressAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: ['0%', '70%', '100%'],
    });

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            statusBarTranslucent={true}
        >
            <View style={styles.container}>
                <View style={styles.content}>
                    {/* Icon with pulse animation */}
                    <Animated.View
                        style={[
                            styles.iconContainer,
                            { transform: [{ scale: pulseAnim }] }
                        ]}
                    >
                        <Ionicons name="folder-open" size={28} color={AppColors.primary} />
                    </Animated.View>

                    {/* Project name */}
                    {projectName && (
                        <Text style={styles.projectName} numberOfLines={1}>
                            {projectName}
                        </Text>
                    )}

                    {/* Message */}
                    <Text style={styles.message}>{message}</Text>

                    {/* Progress bar */}
                    <View style={styles.progressContainer}>
                        <Animated.View
                            style={[
                                styles.progressBar,
                                { width: progressWidth }
                            ]}
                        />
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        backgroundColor: '#141416',
        paddingVertical: 24,
        paddingHorizontal: 32,
        borderRadius: 20,
        alignItems: 'center',
        minWidth: 220,
        maxWidth: 280,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 8,
        },
        shadowOpacity: 0.44,
        shadowRadius: 10.32,
        elevation: 16,
    },
    iconContainer: {
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: `${AppColors.primary}15`,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    projectName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: 6,
        textAlign: 'center',
    },
    message: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.5)',
        textAlign: 'center',
        marginBottom: 20,
    },
    progressContainer: {
        width: '100%',
        height: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        backgroundColor: AppColors.primary,
        borderRadius: 2,
    },
});
