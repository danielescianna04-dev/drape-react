/**
 * SubAgentStatus Component - Display running sub-agent progress
 */

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../theme/colors';

interface SubAgent {
    id: string;
    type: 'explore' | 'plan' | 'general' | 'bash';
    description: string;
    iteration?: number;
    maxIterations?: number;
    status: 'running' | 'completed' | 'failed';
}

interface Props {
    subAgent: SubAgent | null;
}

export const SubAgentStatus: React.FC<Props> = ({ subAgent }) => {
    if (!subAgent) {
        return null;
    }

    const getAgentIcon = (type: string) => {
        switch (type) {
            case 'explore':
                return 'search';
            case 'plan':
                return 'document-text';
            case 'general':
                return 'bulb';
            case 'bash':
                return 'terminal';
            default:
                return 'cube';
        }
    };

    const getAgentColor = (type: string) => {
        switch (type) {
            case 'explore':
                return '#3b82f6';
            case 'plan':
                return '#10b981';
            case 'general':
                return AppColors.primary;
            case 'bash':
                return '#f59e0b';
            default:
                return '#6b7280';
        }
    };

    const getAgentLabel = (type: string) => {
        switch (type) {
            case 'explore':
                return 'Exploring codebase';
            case 'plan':
                return 'Planning implementation';
            case 'general':
                return 'Processing task';
            case 'bash':
                return 'Executing command';
            default:
                return 'Running sub-agent';
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={[styles.iconContainer, { backgroundColor: `${getAgentColor(subAgent.type)}20` }]}>
                    <Ionicons
                        name={getAgentIcon(subAgent.type)}
                        size={16}
                        color={getAgentColor(subAgent.type)}
                    />
                </View>
                <Text style={styles.label}>{getAgentLabel(subAgent.type)}</Text>
                {subAgent.status === 'running' && (
                    <ActivityIndicator size="small" color={AppColors.primary} style={styles.spinner} />
                )}
                {subAgent.status === 'completed' && (
                    <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                )}
                {subAgent.status === 'failed' && (
                    <Ionicons name="close-circle" size={16} color="#ef4444" />
                )}
            </View>

            {subAgent.description && (
                <Text style={styles.description}>{subAgent.description}</Text>
            )}

            {subAgent.iteration !== undefined && subAgent.maxIterations !== undefined && (
                <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                        <View
                            style={[
                                styles.progressFill,
                                {
                                    width: `${(subAgent.iteration / subAgent.maxIterations) * 100}%`,
                                    backgroundColor: getAgentColor(subAgent.type)
                                }
                            ]}
                        />
                    </View>
                    <Text style={styles.progressText}>
                        {subAgent.iteration} / {subAgent.maxIterations}
                    </Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#0d0d0d',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        borderRadius: 12,
        padding: 16,
        marginVertical: 8,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    iconContainer: {
        width: 28,
        height: 28,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    label: {
        flex: 1,
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    spinner: {
        marginLeft: 8,
    },
    description: {
        color: '#9ca3af',
        fontSize: 13,
        marginLeft: 38,
        marginBottom: 12,
    },
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 38,
    },
    progressBar: {
        flex: 1,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 2,
        overflow: 'hidden',
        marginRight: 12,
    },
    progressFill: {
        height: '100%',
        borderRadius: 2,
    },
    progressText: {
        color: '#9ca3af',
        fontSize: 12,
        fontWeight: '500',
    },
});

export default SubAgentStatus;
