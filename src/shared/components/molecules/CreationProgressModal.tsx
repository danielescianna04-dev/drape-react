import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    Animated,
    ScrollView,
    Easing,
    Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppColors } from '../../theme/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { DrapeLogo } from '../icons/DrapeLogo';

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
    visible: boolean;
    progress: number;
    status: string;
    step?: string;
    agentEvents?: ToolEvent[];
    agentStatus?: 'idle' | 'running' | 'complete' | 'error';
    agentCurrentTool?: string | null;
}

const TOOL_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
    'read_file': { icon: 'document-text-outline', label: 'Reading file', color: '#58A6FF' },
    'glob_files': { icon: 'search-outline', label: 'Searching files', color: '#A371F7' },
    'edit_file': { icon: 'create-outline', label: 'Editing file', color: '#3FB950' },
    'write_file': { icon: 'save-outline', label: 'Writing file', color: '#3FB950' },
    'replace_file_content': { icon: 'create-outline', label: 'Editing file', color: '#3FB950' },
    'multi_replace_file_content': { icon: 'create-outline', label: 'Editing files', color: '#3FB950' },
    'search_in_files': { icon: 'code-slash-outline', label: 'Searching code', color: '#FFA657' },
    'list_files': { icon: 'folder-outline', label: 'Listing files', color: '#58A6FF' },
    'list_directory': { icon: 'folder-open-outline', label: 'Listing directory', color: '#58A6FF' },
    'create_folder': { icon: 'folder-outline', label: 'Creating folder', color: '#3FB950' },
    'delete_file': { icon: 'trash-outline', label: 'Deleting file', color: '#F85149' },
    'execute_command': { icon: 'terminal-outline', label: 'Running command', color: '#FFA657' },
    'run_command': { icon: 'terminal-outline', label: 'Running command', color: '#FFA657' },
    'web_fetch': { icon: 'globe-outline', label: 'Fetching data', color: '#58A6FF' },
    'think': { icon: 'bulb-outline', label: 'Thinking', color: '#F0E68C' },
    'signal_completion': { icon: 'checkmark-done-outline', label: 'Finishing up', color: '#3FB950' },
};

// Step-to-icon mapping for polling status messages
const STEP_ICON: Record<string, { icon: string; color: string }> = {
    'generating': { icon: 'sparkles-outline', color: '#A371F7' },
    'creating_files': { icon: 'document-text-outline', color: '#58A6FF' },
    'installing': { icon: 'download-outline', color: '#FFA657' },
    'configuring': { icon: 'settings-outline', color: '#58A6FF' },
    'building': { icon: 'construct-outline', color: '#3FB950' },
    'deploying': { icon: 'cloud-upload-outline', color: '#A371F7' },
    'starting': { icon: 'rocket-outline', color: '#F97583' },
    'complete': { icon: 'checkmark-circle-outline', color: '#3FB950' },
    'error': { icon: 'alert-circle-outline', color: '#F85149' },
};

// Extract file/detail from tool input
const getToolDetail = (tool: string, input: any): string => {
    if (!input) return '';
    try {
        const data = typeof input === 'string' ? JSON.parse(input) : input;
        if (['read_file', 'edit_file', 'write_file', 'replace_file_content', 'multi_replace_file_content'].includes(tool)) {
            const path = data.filePath || data.path || data.AbsolutePath || data.targetFile || data.TargetFile;
            return path ? path.split('/').pop() : '';
        }
        if (['execute_command', 'run_command'].includes(tool)) {
            const cmd = data.command || data.cmd;
            return cmd ? (cmd.length > 40 ? cmd.substring(0, 40) + '...' : cmd) : '';
        }
        if (['glob_files', 'search_in_files'].includes(tool)) {
            return data.pattern || data.glob || data.query || '';
        }
    } catch (_) {}
    return '';
};

export const CreationProgressModal = ({ visible, progress, status, step, agentEvents, agentStatus, agentCurrentTool }: Props) => {
    const { t } = useTranslation('projects');
    const insets = useSafeAreaInsets();
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const logoScale = useRef(new Animated.Value(0.8)).current;
    const logoFade = useRef(new Animated.Value(0)).current;
    const titleFade = useRef(new Animated.Value(0)).current;
    const cardFade = useRef(new Animated.Value(0)).current;
    const cardSlide = useRef(new Animated.Value(20)).current;
    const pulseAnim = useRef(new Animated.Value(0.6)).current;
    const scrollRef = useRef<ScrollView>(null);
    const [displayProgress, setDisplayProgress] = useState(0);
    const targetProgressRef = useRef(0);
    const lastTickRef = useRef<number>(Date.now());
    const [statusLog, setStatusLog] = useState<{ text: string; icon: string; color: string }[]>([]);

    // Entrance animations
    useEffect(() => {
        if (visible) {
            fadeAnim.setValue(0);
            logoScale.setValue(0.8);
            logoFade.setValue(0);
            titleFade.setValue(0);
            cardFade.setValue(0);
            cardSlide.setValue(20);

            const anim = (node: Animated.Value, to: number, dur: number) =>
                Animated.timing(node, { toValue: to, duration: dur, useNativeDriver: true });

            Animated.parallel([
                anim(fadeAnim, 1, 400),
                Animated.sequence([
                    Animated.parallel([
                        Animated.spring(logoScale, { toValue: 1, tension: 50, friction: 9, useNativeDriver: true }),
                        anim(logoFade, 1, 500),
                    ]),
                    anim(titleFade, 1, 300),
                    Animated.parallel([
                        anim(cardFade, 1, 300),
                        anim(cardSlide, 0, 300),
                    ]),
                ]),
            ]).start();

            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 0.6, duration: 800, useNativeDriver: true }),
                ])
            ).start();
        } else {
            fadeAnim.setValue(0);
            setDisplayProgress(0);
            targetProgressRef.current = 0;
            setStatusLog([]);
        }
    }, [visible]);

    // Accumulate status messages into the log
    useEffect(() => {
        if (!status || !visible) return;
        setStatusLog(prev => {
            if (prev.length > 0 && prev[prev.length - 1].text === status) return prev;
            const stepConfig = step ? STEP_ICON[step] : null;
            return [...prev, {
                text: status,
                icon: stepConfig?.icon || 'ellipse',
                color: stepConfig?.color || '#A371F7',
            }];
        });
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, [status, visible]);

    // Smooth progress from polling
    useEffect(() => {
        const nextTarget = Math.max(0, Math.min(100, Math.round(progress)));
        targetProgressRef.current = Math.max(targetProgressRef.current, nextTarget);
    }, [progress]);

    useEffect(() => {
        if (!visible) return;
        let isMounted = true;
        lastTickRef.current = Date.now();

        const interval = setInterval(() => {
            if (!isMounted) return;
            const now = Date.now();
            const elapsedMs = Math.max(16, Math.min(120, now - lastTickRef.current));
            lastTickRef.current = now;

            setDisplayProgress(prev => {
                const target = targetProgressRef.current;
                if (prev < target) {
                    const remaining = target - prev;
                    const pointsPerSecond = target >= 90 ? 80 : prev < 90 ? 24 : 40;
                    const maxDelta = (pointsPerSecond * elapsedMs) / 1000;
                    const easedDelta = Math.max(0.2, remaining * 0.25);
                    const delta = Math.max(0.2, Math.min(remaining, Math.min(maxDelta, easedDelta)));
                    return Math.min(target, prev + delta);
                }
                return prev >= target ? target : prev;
            });
        }, 50);

        return () => { isMounted = false; clearInterval(interval); };
    }, [visible]);

    // Auto-scroll on new events
    useEffect(() => {
        if (agentEvents && agentEvents.length > 0) {
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
        }
    }, [agentEvents?.length]);

    if (!visible) return null;

    const hasAgentEvents = agentEvents && agentEvents.length > 0;

    // Build log entries from agent events
    const logEntries: { icon: string; color: string; label: string; detail: string; type: 'active' | 'done' | 'error' | 'message' | 'thinking' }[] = [];

    if (hasAgentEvents) {
        // Track tool starts to pair with completes
        const toolStarts = new Map<number, ToolEvent>();

        for (let i = 0; i < agentEvents.length; i++) {
            const ev = agentEvents[i];

            if (ev.type === 'tool_start' && ev.tool) {
                const config = TOOL_CONFIG[ev.tool] || { icon: 'cog-outline', label: ev.tool, color: '#8B949E' };
                const detail = getToolDetail(ev.tool, ev.input);

                // Check if this tool has a complete event later
                const hasComplete = agentEvents.slice(i + 1).some(
                    e => (e.type === 'tool_complete' || e.type === 'tool_error') && e.tool === ev.tool
                );

                logEntries.push({
                    icon: hasComplete ? 'checkmark' : config.icon,
                    color: hasComplete ? '#3FB950' : config.color,
                    label: config.label,
                    detail,
                    type: hasComplete ? 'done' : 'active',
                });
            } else if (ev.type === 'message' && ev.content) {
                logEntries.push({
                    icon: 'chatbubble-outline',
                    color: 'rgba(255,255,255,0.6)',
                    label: ev.content.length > 120 ? ev.content.substring(0, 120) + '...' : ev.content,
                    detail: '',
                    type: 'message',
                });
            } else if (ev.type === 'thinking' && ev.content) {
                const text = ev.content.length > 80 ? ev.content.substring(0, 80) + '...' : ev.content;
                logEntries.push({
                    icon: 'bulb-outline',
                    color: '#F0E68C',
                    label: text,
                    detail: '',
                    type: 'thinking',
                });
            }
        }
    }

    // Group consecutive same-tool entries
    const groupedEntries: typeof logEntries = [];
    let writeCount = 0;
    let readCount = 0;

    for (const entry of logEntries) {
        // Group consecutive writes
        if (entry.label === 'Writing file' && entry.type === 'done' && groupedEntries.length > 0) {
            const last = groupedEntries[groupedEntries.length - 1];
            if (last.label.startsWith('Writing file') || last.label.startsWith('Wrote ')) {
                const count = last.label.startsWith('Wrote ') ? parseInt(last.label.split(' ')[1]) + 1 : 2;
                last.label = `Wrote ${count} files`;
                last.detail = entry.detail;
                continue;
            }
        }
        // Group consecutive reads
        if (entry.label === 'Reading file' && entry.type === 'done' && groupedEntries.length > 0) {
            const last = groupedEntries[groupedEntries.length - 1];
            if (last.label.startsWith('Reading file') || last.label.startsWith('Read ')) {
                const count = last.label.startsWith('Read ') ? parseInt(last.label.split(' ')[1]) + 1 : 2;
                last.label = `Read ${count} files`;
                last.detail = entry.detail;
                continue;
            }
        }
        groupedEntries.push({ ...entry });
    }

    const displayEntries = groupedEntries.length > 0 ? groupedEntries : null;

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="none"
            statusBarTranslucent={true}
        >
            <View style={styles.container}>
                <LinearGradient
                    colors={['#0C0816', '#1a0a2e', '#0C0816']}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                />

                <Animated.View style={[styles.content, { opacity: fadeAnim, paddingTop: insets.top + 60 }]}>
                    {/* Logo */}
                    <Animated.View style={[styles.logoWrap, { opacity: logoFade, transform: [{ scale: logoScale }] }]}>
                        <LinearGradient
                            colors={['rgba(109, 76, 255, 0.2)', 'rgba(147, 51, 234, 0.1)', 'rgba(99, 102, 241, 0.15)']}
                            style={styles.logoGlow}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        />
                        <DrapeLogo size={64} gradient />
                    </Animated.View>

                    {/* Title */}
                    <Animated.View style={{ opacity: titleFade, alignItems: 'center' }}>
                        <Text style={styles.title}>{t('progress.creatingProject')}</Text>
                    </Animated.View>

                    {/* Log card */}
                    <Animated.View style={[styles.logCard, { opacity: cardFade, transform: [{ translateY: cardSlide }] }]}>
                        <ScrollView
                            ref={scrollRef}
                            style={styles.logScroll}
                            contentContainerStyle={styles.logScrollContent}
                            showsVerticalScrollIndicator={false}
                        >
                            {displayEntries ? displayEntries.map((entry, index) => {
                                const isActive = entry.type === 'active';
                                const isDone = entry.type === 'done';
                                const isMessage = entry.type === 'message';
                                const isThinking = entry.type === 'thinking';

                                return (
                                    <View key={index} style={styles.logRow}>
                                        {/* Timeline connector */}
                                        {index < displayEntries.length - 1 && (
                                            <View style={[styles.timelineLine, { backgroundColor: isDone ? 'rgba(63, 185, 80, 0.2)' : `${entry.color}20` }]} />
                                        )}

                                        {/* Icon */}
                                        <View style={[styles.logIconWrap, {
                                            backgroundColor: isDone ? 'rgba(63, 185, 80, 0.12)' : `${entry.color}15`,
                                        }]}>
                                            {isActive ? (
                                                <Animated.View style={{ opacity: pulseAnim }}>
                                                    <Ionicons name={entry.icon as any} size={14} color={entry.color} />
                                                </Animated.View>
                                            ) : isDone ? (
                                                <Ionicons name="checkmark" size={14} color="#3FB950" />
                                            ) : (
                                                <Ionicons name={entry.icon as any} size={13} color={entry.color} />
                                            )}
                                        </View>

                                        {/* Text */}
                                        <View style={styles.logTextWrap}>
                                            {isMessage || isThinking ? (
                                                <Text style={[styles.logTextMessage, isThinking && { color: 'rgba(240, 230, 140, 0.7)', fontStyle: 'italic' }]} numberOfLines={3}>
                                                    {entry.label}
                                                </Text>
                                            ) : (
                                                <View style={styles.logLabelRow}>
                                                    <Text style={[styles.logLabel, isActive && styles.logLabelActive]} numberOfLines={1}>
                                                        {entry.label}
                                                    </Text>
                                                    {entry.detail ? (
                                                        <Text style={styles.logDetail} numberOfLines={1}>
                                                            {entry.detail}
                                                        </Text>
                                                    ) : null}
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                );
                            }) : statusLog.length > 0 ? statusLog.map((entry, index) => {
                                const isLast = index === statusLog.length - 1;
                                const isDone = !isLast;

                                return (
                                    <View key={index} style={styles.logRow}>
                                        {/* Timeline connector */}
                                        {!isLast && (
                                            <View style={[styles.timelineLine, { backgroundColor: 'rgba(63, 185, 80, 0.2)' }]} />
                                        )}

                                        {/* Icon */}
                                        <View style={[styles.logIconWrap, {
                                            backgroundColor: isDone ? 'rgba(63, 185, 80, 0.12)' : `${entry.color}15`,
                                        }]}>
                                            {isDone ? (
                                                <Ionicons name="checkmark" size={14} color="#3FB950" />
                                            ) : (
                                                <Animated.View style={{ opacity: pulseAnim }}>
                                                    <Ionicons name={entry.icon as any} size={14} color={entry.color} />
                                                </Animated.View>
                                            )}
                                        </View>

                                        {/* Text */}
                                        <View style={styles.logTextWrap}>
                                            <Text style={isDone ? styles.logLabel : styles.logLabelActive} numberOfLines={2}>
                                                {entry.text}
                                            </Text>
                                        </View>
                                    </View>
                                );
                            }) : (
                                <View style={styles.logRow}>
                                    <View style={[styles.logIconWrap, { backgroundColor: 'rgba(163, 113, 247, 0.15)' }]}>
                                        <Animated.View style={{ opacity: pulseAnim }}>
                                            <Ionicons name="rocket-outline" size={14} color="#A371F7" />
                                        </Animated.View>
                                    </View>
                                    <View style={styles.logTextWrap}>
                                        <Text style={styles.logLabelActive}>{status || t('progress.initializing')}</Text>
                                    </View>
                                </View>
                            )}
                        </ScrollView>
                    </Animated.View>

                    {/* Progress bar */}
                    <View style={[styles.progressRow, { paddingBottom: insets.bottom + 16 }]}>
                        <View style={styles.progressTrack}>
                            <View style={[styles.progressFill, { width: `${Math.round(displayProgress)}%` }]}>
                                <LinearGradient
                                    colors={[AppColors.primary, '#A855F7']}
                                    style={StyleSheet.absoluteFill}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                />
                            </View>
                        </View>
                        <Text style={styles.progressPercent}>{Math.round(displayProgress)}%</Text>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0A0A0F',
    },
    content: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 28,
    },

    // Logo
    logoWrap: {
        width: 110,
        height: 110,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        overflow: 'hidden',
    },
    logoGlow: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 32,
    },

    // Text
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: -0.5,
        marginBottom: 32,
    },

    // Log card
    logCard: {
        width: '100%',
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
        marginBottom: 20,
    },
    logScroll: {
        flex: 1,
    },
    logScrollContent: {
        padding: 18,
    },

    // Log rows
    logRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 16,
        position: 'relative',
    },
    timelineLine: {
        position: 'absolute',
        left: 15,
        top: 32,
        width: 1.5,
        height: 16,
    },
    logIconWrap: {
        width: 30,
        height: 30,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    logTextWrap: {
        flex: 1,
        justifyContent: 'center',
        minHeight: 30,
    },
    logLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: 30,
    },
    logLabel: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.4)',
        fontWeight: '500',
    },
    logLabelActive: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.85)',
        fontWeight: '600',
    },
    logDetail: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.25)',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        flex: 1,
    },
    logTextMessage: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
        lineHeight: 20,
    },

    // Progress
    progressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        width: '100%',
    },
    progressTrack: {
        flex: 1,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressPercent: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.5)',
        fontVariant: ['tabular-nums'],
        minWidth: 36,
        textAlign: 'right',
    },
});
