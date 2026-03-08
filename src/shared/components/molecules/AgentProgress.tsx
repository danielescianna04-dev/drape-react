/**
 * AgentProgress Component
 * Displays real-time progress of AI agent tool execution
 * Visual style restored to match "Loading Card" / "Badge" aesthetic
 */

import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppColors } from '../../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface ToolEvent {
    type: 'tool_start' | 'tool_complete' | 'tool_error' | 'status' | 'complete' | 'message' | 'thinking' | 'iteration_start';
    tool?: string;
    input?: any;
    success?: boolean;
    error?: string;
    message?: string;
    content?: string;
    timestamp?: number;
    iteration?: number;
}

interface Props {
    events: ToolEvent[];
    status: 'idle' | 'running' | 'complete' | 'error';
    currentTool?: string | null;
}

const TOOL_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
    'read_file': { icon: 'document-text-outline', label: 'Reading', color: '#58A6FF' },
    'glob_files': { icon: 'search-outline', label: 'Searching', color: '#A371F7' },
    'edit_file': { icon: 'create-outline', label: 'Editing', color: '#3FB950' },
    'write_file': { icon: 'save-outline', label: 'Writing', color: '#3FB950' },
    'search_in_files': { icon: 'code-slash-outline', label: 'Searching', color: '#FFA657' },
    'list_files': { icon: 'folder-outline', label: 'Listing', color: '#58A6FF' },
    'list_directory': { icon: 'folder-open-outline', label: 'Listing', color: '#58A6FF' },
    'create_folder': { icon: 'folder-outline', label: 'Creating', color: '#3FB950' },
    'delete_file': { icon: 'trash-outline', label: 'Deleting', color: '#F85149' },
    'move_file': { icon: 'arrow-forward-outline', label: 'Moving', color: '#FFA657' },
    'copy_file': { icon: 'copy-outline', label: 'Copying', color: '#A371F7' },
    'web_fetch': { icon: 'globe-outline', label: 'Fetching', color: '#58A6FF' },
    'execute_command': { icon: 'terminal-outline', label: 'Running', color: '#FFA657' },
    'think': { icon: 'bulb-outline', label: 'Thinking', color: '#F0E68C' },
    'default': { icon: 'cog-outline', label: 'Executing', color: '#8B949E' }
};

export const AgentProgress: React.FC<Props> = ({ events, status, currentTool }) => {
    const { t } = useTranslation('terminal');
    const scrollViewRef = useRef<ScrollView>(null);
    const pulseAnim = useRef(new Animated.Value(0.4)).current;
    const [loadingDots, setLoadingDots] = useState('.');

    // Pulse animation
    useEffect(() => {
        if (status === 'running') {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true })
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [status]);

    // Dots animation
    useEffect(() => {
        if (status === 'running') {
            const interval = setInterval(() => {
                setLoadingDots(prev => prev.length >= 3 ? '.' : prev + '.');
            }, 500);
            return () => clearInterval(interval);
        }
    }, [status]);

    // Scroll to end
    useEffect(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
    }, [events]);

    const localizedToolConfig = {
        ...TOOL_CONFIG,
        read_file: { ...TOOL_CONFIG.read_file, label: t('agentProgress.reading') },
        glob_files: { ...TOOL_CONFIG.glob_files, label: t('agentProgress.searching') },
        edit_file: { ...TOOL_CONFIG.edit_file, label: t('agentProgress.editing') },
        write_file: { ...TOOL_CONFIG.write_file, label: t('agentProgress.writing') },
        search_in_files: { ...TOOL_CONFIG.search_in_files, label: t('agentProgress.searching') },
        list_files: { ...TOOL_CONFIG.list_files, label: t('agentProgress.listing') },
        list_directory: { ...TOOL_CONFIG.list_directory, label: t('agentProgress.listing') },
        create_folder: { ...TOOL_CONFIG.create_folder, label: t('agentProgress.creating') },
        delete_file: { ...TOOL_CONFIG.delete_file, label: t('agentProgress.deleting') },
        move_file: { ...TOOL_CONFIG.move_file, label: t('agentProgress.moving') },
        copy_file: { ...TOOL_CONFIG.copy_file, label: t('agentProgress.copying') },
        web_fetch: { ...TOOL_CONFIG.web_fetch, label: t('agentProgress.fetching') },
        execute_command: { ...TOOL_CONFIG.execute_command, label: t('agentProgress.running') },
        think: { ...TOOL_CONFIG.think, label: t('agentProgress.thinking') },
        default: { ...TOOL_CONFIG.default, label: t('agentProgress.executing') },
    };

    const activeConfig = currentTool ? (localizedToolConfig[currentTool as keyof typeof localizedToolConfig] || localizedToolConfig.default) : localizedToolConfig.think;

    // Get details from the current running tool
    const getCurrentToolDetails = (): string => {
        if (!currentTool) return '';

        // Find the most recent tool_start event for current tool
        const toolStartEvent = [...events].reverse().find(e => e.type === 'tool_start' && e.tool === currentTool);
        if (!toolStartEvent || !toolStartEvent.input) return '';

        try {
            const input = typeof toolStartEvent.input === 'string' ? JSON.parse(toolStartEvent.input) : toolStartEvent.input;

            // Extract relevant details based on tool type
            if (currentTool === 'read_file') {
                const path = input.filePath || input.path || input.AbsolutePath;
                return path ? path.split('/').pop() : '';
            } else if (currentTool === 'edit_file' || currentTool === 'write_file' || currentTool === 'replace_file_content') {
                const path = input.filePath || input.targetFile || input.TargetFile || input.AbsolutePath;
                return path ? path.split('/').pop() : '';
            } else if (currentTool === 'search_web' || currentTool === 'web_search') {
                const query = input.query || input.q || input.search_term;
                return query ? `"${query.substring(0, 30)}"` : '';
            } else if (currentTool === 'glob_files' || currentTool === 'search_in_files') {
                const pattern = input.pattern || input.glob || input.query;
                return pattern ? `${pattern.substring(0, 30)}` : '';
            } else if (currentTool === 'execute_command' || currentTool === 'run_command') {
                const cmd = input.command || input.cmd;
                return cmd ? cmd.split(' ')[0] : '';
            }
        } catch (_) {}

        return '';
    };

    const currentToolDetails = getCurrentToolDetails();

    // Filter relevant events for the log
    const relevantEvents = events.filter(e =>
        ['tool_start', 'tool_complete', 'tool_error'].includes(e.type)
    );

    return (
        <View style={styles.cardContainer}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    {status === 'running' ? (
                        <View style={[styles.toolBadge, { backgroundColor: `${activeConfig.color}15`, borderColor: `${activeConfig.color}30` }]}>
                            <Ionicons name={activeConfig.icon as any} size={12} color={activeConfig.color} />
                            <Text style={[styles.toolBadgeText, { color: activeConfig.color }]}>
                                {t(`agent.toolAction.${activeConfig.label.toLowerCase()}`, { defaultValue: activeConfig.label }).toUpperCase()}
                            </Text>
                        </View>
                    ) : (
                        <View style={[styles.toolBadge, styles.toolBadgeComplete]}>
                            <Ionicons name={status === 'error' ? "warning-outline" : "checkmark-circle-outline"} size={12} color={status === 'error' ? '#FF4444' : '#3FB950'} />
                            <Text style={[styles.toolBadgeText, { color: status === 'error' ? '#FF4444' : '#3FB950' }]}>
                                {status === 'error' ? t('agent.event.failed').toUpperCase() : t('agent.event.completed').toUpperCase()}
                            </Text>
                        </View>
                    )}

                    {status === 'running' && (
                        <Animated.Text style={[styles.statusText, { opacity: pulseAnim }]}>
                            {currentToolDetails || currentTool || t('agent.toolAction.thinking')}{loadingDots}
                        </Animated.Text>
                    )}
                </View>

                {/* Iteration Counter */}
                <View style={styles.iterationBadge}>
                    <Text style={styles.iterationText}>
                        {events.filter(e => e.type === 'iteration_start').length || 1}
                    </Text>
                    <Ionicons name="infinite" size={10} color="rgba(255,255,255,0.3)" />
                </View>
            </View>

            {/* Event Log Body */}
            {relevantEvents.length > 0 && (
                <View style={styles.body}>
                    <ScrollView
                        ref={scrollViewRef}
                        style={styles.scrollView}
                        nestedScrollEnabled={true}
                    >
                        {relevantEvents.map((event, i) => {
                            const config = event.tool
                                ? (localizedToolConfig[event.tool as keyof typeof localizedToolConfig] || localizedToolConfig.default)
                                : localizedToolConfig.default;
                            // Format the description based on the tool and result
                            let details = '';
                            if (event.tool === 'read_file' && event.input) {
                                try {
                                    const input = typeof event.input === 'string' ? JSON.parse(event.input) : event.input;
                                    const path = input.filePath || input.path || input.AbsolutePath;
                                    if (path) details = path.split('/').pop();
                                } catch (_) { details = String(event.input).substring(0, 30); }
                            } else if ((event.tool === 'edit_file' || event.tool === 'replace_file_content' || event.tool === 'multi_replace_file_content') && event.input) {
                                try {
                                    const input = typeof event.input === 'string' ? JSON.parse(event.input) : event.input;
                                    const path = input.filePath || input.targetFile || input.TargetFile || input.AbsolutePath;
                                    if (path) details = path.split('/').pop();
                                } catch (_) { }
                            } else if (event.tool === 'write_file' && event.input) {
                                try {
                                    const input = typeof event.input === 'string' ? JSON.parse(event.input) : event.input;
                                    const path = input.filePath || input.TargetFile || input.TargetFile; // Check both standard and potential variations
                                    if (path) details = path.split('/').pop();
                                } catch (_) { }
                            } else if ((event.tool === 'search_web' || event.tool === 'web_search') && event.input) {
                                try {
                                    const input = typeof event.input === 'string' ? JSON.parse(event.input) : event.input;
                                    const query = input.query || input.q || input.search_term;
                                    if (query) details = `"${query}"`;
                                } catch (_) { }
                            }

                            return (
                                <View key={i} style={styles.logRow}>
                                    <View style={[styles.logIndicator, {
                                        backgroundColor: event.type === 'tool_error' ? '#F85149' :
                                            event.type === 'tool_complete' ? '#3FB950' : '#8B949E'
                                    }]} />
                                    <Text style={styles.logText} numberOfLines={1}>
                                        <Text style={{ color: config.color, fontWeight: '700' }}>{event.tool}</Text>
                                        <Text style={{ color: '#6E7681' }}>
                                            {event.type === 'tool_start' ? ` ${t('agent.event.started')}` :
                                                event.type === 'tool_complete' ? ` ${t('agent.event.completed')}` : ` ${t('agent.event.failed')}`}
                                        </Text>
                                        {details ? <Text style={{ color: '#8B949E' }}> {details}</Text> : null}
                                    </Text>
                                </View>
                            );
                        })}
                    </ScrollView>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    cardContainer: {
        backgroundColor: 'rgba(20, 20, 20, 0.95)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        overflow: 'hidden',
        marginBottom: 12,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    body: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: 'transparent',
    },
    scrollView: {
        maxHeight: 120,
    },
    // Badges
    toolBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(240, 230, 140, 0.15)', // Default thinking color
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(240, 230, 140, 0.3)',
    },
    toolBadgeComplete: {
        backgroundColor: 'rgba(63, 185, 80, 0.1)',
        borderColor: 'rgba(63, 185, 80, 0.2)',
    },
    toolBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    statusText: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    // Iteration
    iterationBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    iterationText: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.4)',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    // Log Rows
    logRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    logIndicator: {
        width: 4,
        height: 4,
        borderRadius: 2,
    },
    logText: {
        fontSize: 11,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        color: '#8B949E',
    },
});

export default AgentProgress;
