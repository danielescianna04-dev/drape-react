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
                    <Ionicons name="checkmark-circle" size={24} color={AppColors.success} />
                )}
                {error && (
                    <Ionicons name="alert-circle" size={24} color={AppColors.error} />
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
        backgroundColor: AppColors.white.w06,
        borderRadius: 12,
        padding: 12,
        marginHorizontal: 16,
        marginVertical: 8,
        borderWidth: 1,
        borderColor: AppColors.white.w10,
    },
    iconContainer: {
        marginRight: 12,
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    textContainer: {
        flex: 1,
    },
    title: {
        fontSize: 14,
        fontWeight: '600',
        color: AppColors.white.w80,
    },
    subtitle: {
        fontSize: 12,
        color: AppColors.white.w50,
        marginTop: 2,
    },
    errorText: {
        fontSize: 11,
        color: AppColors.error,
        marginTop: 4,
    },
});
