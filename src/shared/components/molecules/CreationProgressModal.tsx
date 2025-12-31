import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Dimensions, Animated } from 'react-native';
import { AppColors } from '../../theme/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface Props {
    visible: boolean;
    progress: number; // 0 to 100
    status: string;
    step?: string;
}

const { width } = Dimensions.get('window');

export const CreationProgressModal = ({ visible, progress, status, step }: Props) => {
    const progressAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: progress,
            duration: 500,
            useNativeDriver: false,
        }).start();
    }, [progress]);

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
                {/* Blur/Dim background */}
                <View style={styles.backdrop} />

                <View style={styles.card}>
                    <View style={styles.iconContainer}>
                        <LinearGradient
                            colors={[AppColors.primary, '#9333EA']}
                            style={styles.iconGradient}
                        >
                            <Ionicons name="sparkles" size={24} color="#fff" />
                        </LinearGradient>
                    </View>

                    <Text style={styles.title}>Creating Magic</Text>
                    <Text style={styles.status}>{status}</Text>
                    {step && <Text style={styles.subStatus}>{step}</Text>}

                    <View style={styles.progressTrack}>
                        <Animated.View style={[styles.progressBar, { width: widthInterpolated }]}>
                            <LinearGradient
                                colors={[AppColors.primary, '#9333EA']}
                                style={StyleSheet.absoluteFill}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            />
                        </Animated.View>
                    </View>

                    <Text style={styles.percentage}>{Math.round(progress)}%</Text>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
    },
    card: {
        width: width * 0.85,
        backgroundColor: '#13131F',
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    iconContainer: {
        marginBottom: 20,
        shadowColor: AppColors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
    },
    iconGradient: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
        fontFamily: 'Inter-Bold',
    },
    status: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.9)',
        marginBottom: 4,
        textAlign: 'center',
        fontFamily: 'Inter-Medium',
    },
    subStatus: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 24,
        textAlign: 'center',
        fontFamily: 'Inter-Regular',
    },
    progressTrack: {
        width: '100%',
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 12,
    },
    progressBar: {
        height: '100%',
        borderRadius: 3,
    },
    percentage: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        fontFamily: 'Inter-Medium',
    },
});
