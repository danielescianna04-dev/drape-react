import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

interface Props {
    isCloning: boolean;
    progress?: string;
    success?: boolean;
    error?: string;
    repoName?: string;
}

export const CloneWidget = ({ isCloning, progress, success, error, repoName }: Props) => {
    if (!isCloning && !success && !error) return null;

    return (
        <Animated.View
            entering={FadeIn.duration(300)}
            exiting={FadeOut.duration(200)}
            style={styles.container}
        >
            <View style={styles.iconContainer}>
                {isCloning && (
                    <ActivityIndicator size="small" color={AppColors.primary} />
                )}
                {success && (
                    <Ionicons name="checkmark-circle" size={18} color={AppColors.success} />
                )}
                {error && (
                    <Ionicons name="alert-circle" size={18} color={AppColors.error} />
                )}
            </View>

            <View style={styles.textContainer}>
                <Text style={styles.title}>
                    {isCloning && '📦 Sincronizzazione progetto...'}
                    {success && '✅ Progetto pronto'}
                    {error && '❌ Errore di sincronizzazione'}
                </Text>

                {(progress || repoName) && (
                    <Text style={styles.subtitle} numberOfLines={1}>
                        {progress || repoName}
                    </Text>
                )}

                {error && (
                    <Text style={styles.errorText} numberOfLines={2}>
                        {error}
                    </Text>
                )}
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1E1E1E', // Darker surface
        borderRadius: 24, // Pill shape
        paddingVertical: 8,
        paddingHorizontal: 16,
        alignSelf: 'center', // Center content
        marginVertical: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
        maxWidth: '90%',
    },
    iconContainer: {
        marginRight: 10,
        width: 18,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    textContainer: {
        flex: 0, // shrink to content
    },
    title: {
        fontSize: 13,
        fontWeight: '500',
        color: AppColors.white.w90,
    },
    subtitle: {
        fontSize: 11,
        color: AppColors.white.w50,
        marginTop: 0,
        display: 'none', // Hide subtitle to make it cleaner
    },
    errorText: {
        fontSize: 11,
        color: AppColors.error,
        marginTop: 2,
    },
});
