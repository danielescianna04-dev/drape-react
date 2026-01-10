/**
 * AgentStatusBadge Component
 * Small badge showing agent status with pulsing animation
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { AppColors } from '../../theme/colors';
import { Ionicons } from '@expo/vector-icons';

interface Props {
    isRunning: boolean;
    currentTool?: string | null;
    iteration?: number;
}

const TOOL_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
    write_file: 'document-text',
    read_file: 'book',
    list_directory: 'folder',
    run_command: 'flash',
    edit_file: 'create',
    signal_completion: 'checkmark-circle',
    search_files: 'search',
    code_analysis: 'code-slash',
};

export const AgentStatusBadge: React.FC<Props> = ({
    isRunning,
    currentTool,
    iteration,
}) => {
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const opacityAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (isRunning) {
            // Pulsing animation for the dot
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.3,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                ])
            ).start();

            // Subtle opacity pulse for the whole badge
            Animated.loop(
                Animated.sequence([
                    Animated.timing(opacityAnim, {
                        toValue: 0.8,
                        duration: 1200,
                        useNativeDriver: true,
                    }),
                    Animated.timing(opacityAnim, {
                        toValue: 1,
                        duration: 1200,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
            opacityAnim.setValue(1);
        }
    }, [isRunning]);

    const getToolIcon = (tool: string): keyof typeof Ionicons.glyphMap => {
        return TOOL_ICONS[tool] || 'build';
    };

    const getToolDisplayName = (tool: string): string => {
        const names: Record<string, string> = {
            write_file: 'Scrittura',
            read_file: 'Lettura',
            list_directory: 'Navigazione',
            run_command: 'Esecuzione',
            edit_file: 'Modifica',
            signal_completion: 'Completamento',
            search_files: 'Ricerca',
            code_analysis: 'Analisi',
        };
        return names[tool] || tool;
    };

    if (!isRunning && !currentTool) {
        return (
            <View style={styles.container}>
                <View style={styles.idleDot} />
                <Text style={styles.idleText}>Pronto</Text>
            </View>
        );
    }

    return (
        <Animated.View style={[styles.container, { opacity: opacityAnim }]}>
            <Animated.View
                style={[
                    styles.runningDot,
                    {
                        transform: [{ scale: pulseAnim }],
                    },
                ]}
            />

            {currentTool && (
                <View style={styles.toolInfo}>
                    <Ionicons
                        name={getToolIcon(currentTool)}
                        size={14}
                        color={AppColors.primary}
                    />
                    <Text style={styles.toolText}>{getToolDisplayName(currentTool)}</Text>
                </View>
            )}

            {iteration !== undefined && iteration > 0 && (
                <View style={styles.iterationBadge}>
                    <Text style={styles.iterationText}>{iteration}</Text>
                </View>
            )}
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: AppColors.dark.surfaceVariant,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 16,
        gap: 6,
        borderWidth: 1,
        borderColor: AppColors.white.w10,
        shadowColor: AppColors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 2,
    },
    runningDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: AppColors.primary,
        shadowColor: AppColors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 4,
    },
    idleDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: AppColors.white.w25,
    },
    idleText: {
        fontSize: 12,
        fontWeight: '500',
        color: AppColors.white.w60,
    },
    toolInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    toolText: {
        fontSize: 12,
        fontWeight: '600',
        color: AppColors.white.w90,
    },
    iterationBadge: {
        backgroundColor: AppColors.primaryAlpha.a20,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
        minWidth: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: AppColors.primaryAlpha.a40,
    },
    iterationText: {
        fontSize: 10,
        fontWeight: '700',
        color: AppColors.primary,
    },
});
