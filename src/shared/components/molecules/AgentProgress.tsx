/**
 * AgentProgress Component
 * Displays real-time progress of AI agent tool execution
 */

import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated } from 'react-native';
import { AppColors } from '../../theme/colors';
import { Ionicons } from '@expo/vector-icons';

interface ToolEvent {
    type: 'tool_start' | 'tool_complete' | 'tool_error' | 'status' | 'complete';
    tool?: string;
    input?: any;
    success?: boolean;
    error?: string;
    message?: string;
    timestamp?: number;
}

interface Props {
    events: ToolEvent[];
    status: 'idle' | 'running' | 'complete' | 'error';
    currentTool?: string | null;
}

const TOOL_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
    'write_file': 'document-text',
    'read_file': 'book',
    'list_directory': 'folder',
    'run_command': 'flash',
    'edit_file': 'create',
    'signal_completion': 'checkmark-circle'
};

export const AgentProgress: React.FC<Props> = ({ events, status, currentTool }) => {
    const scrollViewRef = useRef<ScrollView>(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (status === 'running') {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 0.5, duration: 750, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 750, useNativeDriver: true })
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [status]);

    useEffect(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
    }, [events]);

    const getToolIcon = (tool: string) => TOOL_ICONS[tool] || 'build';

    const filteredEvents = events.filter(e =>
        ['tool_start', 'tool_complete', 'tool_error', 'complete', 'status'].includes(e.type)
    );

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.statusIndicator}>
                    <Animated.View style={[
                        styles.statusDot,
                        status === 'running' && styles.statusDotRunning,
                        status === 'complete' && styles.statusDotComplete,
                        status === 'error' && styles.statusDotError,
                        { opacity: status === 'running' ? pulseAnim : 1 }
                    ]} />
                    <Text style={styles.statusText}>
                        {status === 'running'
                            ? (currentTool ? `Executing: ${currentTool}` : 'Thinking...')
                            : status.charAt(0).toUpperCase() + status.slice(1)
                        }
                    </Text>
                </View>
            </View>

            {/* Event log */}
            <ScrollView
                ref={scrollViewRef}
                style={styles.eventLog}
                showsVerticalScrollIndicator={true}
            >
                {filteredEvents.map((event, i) => (
                    <View
                        key={i}
                        style={[
                            styles.eventItem,
                            event.type === 'tool_complete' && styles.eventItemSuccess,
                            event.type === 'tool_error' && styles.eventItemError
                        ]}
                    >
                        <View style={styles.eventIcon}>
                            <Ionicons
                                name={event.tool ? getToolIcon(event.tool) :
                                      event.type === 'complete' ? 'checkmark-circle' :
                                      event.type === 'status' ? 'information-circle' : 'ellipse'}
                                size={18}
                                color={event.type === 'tool_error' ? '#ff4444' :
                                       event.type === 'complete' ? AppColors.primary : '#fff'}
                            />
                        </View>
                        <View style={styles.eventContent}>
                            <Text style={styles.eventTitle}>
                                {event.tool || event.message || event.type}
                            </Text>
                            {event.input && (
                                <Text style={styles.eventDetail} numberOfLines={1}>
                                    {typeof event.input === 'object'
                                        ? JSON.stringify(event.input)
                                        : event.input}
                                </Text>
                            )}
                            {event.error && (
                                <Text style={styles.eventError}>{event.error}</Text>
                            )}
                        </View>
                        {event.success !== undefined && (
                            <Ionicons
                                name={event.success ? 'checkmark' : 'close'}
                                size={16}
                                color={event.success ? AppColors.primary : '#ff4444'}
                            />
                        )}
                    </View>
                ))}
            </ScrollView>
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
    },
    header: {
        marginBottom: 12,
    },
    statusIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#666',
    },
    statusDotRunning: {
        backgroundColor: AppColors.primary,
    },
    statusDotComplete: {
        backgroundColor: AppColors.primary,
    },
    statusDotError: {
        backgroundColor: '#ff4444',
    },
    statusText: {
        color: '#fff',
        fontWeight: '500',
        fontSize: 14,
    },
    eventLog: {
        maxHeight: 300,
    },
    eventItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        padding: 10,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 8,
        marginBottom: 8,
        borderLeftWidth: 3,
        borderLeftColor: 'transparent',
    },
    eventItemSuccess: {
        borderLeftColor: AppColors.primary,
    },
    eventItemError: {
        borderLeftColor: '#ff4444',
        backgroundColor: 'rgba(255,68,68,0.1)',
    },
    eventIcon: {
        width: 24,
        alignItems: 'center',
    },
    eventContent: {
        flex: 1,
    },
    eventTitle: {
        color: '#fff',
        fontWeight: '500',
        fontSize: 14,
    },
    eventDetail: {
        color: '#666',
        fontSize: 12,
        fontFamily: 'monospace',
        marginTop: 4,
    },
    eventError: {
        color: '#ff6666',
        fontSize: 12,
        marginTop: 4,
    },
});

export default AgentProgress;
