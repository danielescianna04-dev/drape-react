import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppColors } from '../../../../shared/theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAgentStore, agentSelectors } from '../../../../core/agent/agentStore';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInUp, FadeInRight, Layout } from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
    tab: any;
}

export const TasksView = ({ tab }: Props) => {
    const insets = useSafeAreaInsets();
    const { plan, isRunning, error, summary, iteration, events, currentTool } = useAgentStore();
    const progress = agentSelectors.getAgentPlanProgress();
    const fileChanges = agentSelectors.getAllFileChanges();

    const [activeTab, setActiveTab] = useState<'plan' | 'logs' | 'files'>('plan');

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return '#00D084';
            case 'running': return AppColors.primary;
            case 'failed': return '#FF6B6B';
            default: return 'rgba(255,255,255,0.3)';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return 'checkmark-circle';
            case 'running': return 'play-circle';
            case 'failed': return 'alert-circle';
            default: return 'ellipse-outline';
        }
    };

    const renderPlan = () => (
        <View style={styles.section}>
            {!plan ? (
                <View style={styles.emptyContainer}>
                    <Ionicons name="list-outline" size={64} color="rgba(255,255,255,0.1)" />
                    <Text style={styles.emptyText}>Nessun piano attivo</Text>
                    <Text style={styles.emptySubtext}>Chiedi all'AI di eseguire un task per vedere il piano qui.</Text>
                </View>
            ) : (
                <>
                    <View style={styles.progressCard}>
                        {isLiquidGlassSupported ? (
                            <LiquidGlassView
                                style={[styles.progressCardInner, { backgroundColor: 'transparent', overflow: 'hidden' }]}
                                interactive={true}
                                effect="clear"
                                colorScheme="dark"
                            >
                                <View style={{ padding: 20 }}>
                                    <View style={styles.progressHeader}>
                                        <Text style={styles.progressTitle}>Avanzamento Piano</Text>
                                        <Text style={styles.progressPercentage}>{progress?.percentage}%</Text>
                                    </View>
                                    <View style={styles.progressBarBg}>
                                        <Animated.View
                                            style={[
                                                styles.progressBarFill,
                                                { width: `${progress?.percentage}%`, backgroundColor: AppColors.primary }
                                            ]}
                                        />
                                    </View>
                                    <View style={styles.progressStats}>
                                        <Text style={styles.statText}>{progress?.completed} Completati</Text>
                                        <Text style={styles.statText}>{progress?.total} Totali</Text>
                                    </View>
                                </View>
                            </LiquidGlassView>
                        ) : (
                            <View style={styles.progressCardInner}>
                                <View style={styles.progressHeader}>
                                    <Text style={styles.progressTitle}>Avanzamento Piano</Text>
                                    <Text style={styles.progressPercentage}>{progress?.percentage}%</Text>
                                </View>
                                <View style={styles.progressBarBg}>
                                    <Animated.View
                                        style={[
                                            styles.progressBarFill,
                                            { width: `${progress?.percentage}%`, backgroundColor: AppColors.primary }
                                        ]}
                                    />
                                </View>
                                <View style={styles.progressStats}>
                                    <Text style={styles.statText}>{progress?.completed} Completati</Text>
                                    <Text style={styles.statText}>{progress?.total} Totali</Text>
                                </View>
                            </View>
                        )}
                    </View>

                    <Text style={styles.sectionHeader}>Passaggi del Piano</Text>
                    {plan.steps.map((step, index) => {
                        const stepContent = (
                            <View style={styles.stepInner}>
                                <View style={[styles.stepIndicator, { backgroundColor: getStatusColor(step.status) }]} />
                                <View style={styles.stepContent}>
                                    <Text style={[styles.stepTitle, step.status === 'completed' && styles.stepCompleted]}>
                                        {step.title}
                                    </Text>
                                    {step.description && (
                                        <Text style={styles.stepDescription} numberOfLines={2}>
                                            {step.description}
                                        </Text>
                                    )}
                                </View>
                                <Ionicons
                                    name={getStatusIcon(step.status)}
                                    size={22}
                                    color={getStatusColor(step.status)}
                                />
                            </View>
                        );

                        return (
                            <Animated.View
                                key={step.id}
                                entering={FadeInUp.delay(index * 100)}
                                style={styles.stepCard}
                            >
                                {isLiquidGlassSupported ? (
                                    <LiquidGlassView
                                        style={{ backgroundColor: 'transparent', borderRadius: 14, overflow: 'hidden' }}
                                        interactive={true}
                                        effect="clear"
                                        colorScheme="dark"
                                    >
                                        {stepContent}
                                    </LiquidGlassView>
                                ) : (
                                    stepContent
                                )}
                            </Animated.View>
                        );
                    })}
                </>
            )}
        </View>
    );

    const renderLogs = () => (
        <View style={styles.section}>
            {events.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Ionicons name="terminal-outline" size={64} color="rgba(255,255,255,0.1)" />
                    <Text style={styles.emptyText}>Nessun log disponibile</Text>
                </View>
            ) : (
                <ScrollView style={styles.logsContainer} showsVerticalScrollIndicator={false}>
                    {events.map((event, index) => {
                        const logContent = (
                            <View style={styles.logInner}>
                                <View style={styles.logHeader}>
                                    <Text style={styles.logTime}>{new Date(event.timestamp).toLocaleTimeString()}</Text>
                                    <View style={[styles.logBadge, { backgroundColor: event.type === 'tool_error' ? '#FF6B6B' : 'rgba(255,255,255,0.1)' }]}>
                                        <Text style={styles.logBadgeText}>{event.type.replace('_', ' ').toUpperCase()}</Text>
                                    </View>
                                </View>
                                <Text style={styles.logTool}>{event.tool}</Text>
                                {typeof event.input === 'string' && (
                                    <Text style={styles.logData} numberOfLines={3}>{event.input}</Text>
                                )}
                                {event.error && (
                                    <Text style={styles.logError}>{event.error}</Text>
                                )}
                            </View>
                        );

                        return (
                            <View key={index} style={styles.logEntry}>
                                {isLiquidGlassSupported ? (
                                    <LiquidGlassView
                                        style={{ backgroundColor: 'transparent', borderRadius: 12, overflow: 'hidden' }}
                                        interactive={true}
                                        effect="clear"
                                        colorScheme="dark"
                                    >
                                        {logContent}
                                    </LiquidGlassView>
                                ) : (
                                    logContent
                                )}
                            </View>
                        );
                    })}
                </ScrollView>
            )}
        </View>
    );

    const renderFiles = () => (
        <View style={styles.section}>
            {fileChanges.total === 0 ? (
                <View style={styles.emptyContainer}>
                    <Ionicons name="copy-outline" size={64} color="rgba(255,255,255,0.1)" />
                    <Text style={styles.emptyText}>Nessun file modificato</Text>
                </View>
            ) : (
                <>
                    {fileChanges.created.length > 0 && (
                        <>
                            <Text style={styles.sectionHeader}>File Creati ({fileChanges.created.length})</Text>
                            {fileChanges.created.map((file, index) => {
                                const fileContent = (
                                    <View style={styles.fileRowInner}>
                                        <Ionicons name="add-circle" size={18} color="#00D084" />
                                        <Text style={styles.fileName}>{file}</Text>
                                    </View>
                                );
                                return (
                                    <View key={index} style={styles.fileRow}>
                                        {isLiquidGlassSupported ? (
                                            <LiquidGlassView
                                                style={{ backgroundColor: 'transparent', borderRadius: 10, overflow: 'hidden' }}
                                                interactive={true}
                                                effect="clear"
                                                colorScheme="dark"
                                            >
                                                {fileContent}
                                            </LiquidGlassView>
                                        ) : (
                                            fileContent
                                        )}
                                    </View>
                                );
                            })}
                        </>
                    )}
                    {fileChanges.modified.length > 0 && (
                        <>
                            <Text style={[styles.sectionHeader, { marginTop: 20 }]}>File Modificati ({fileChanges.modified.length})</Text>
                            {fileChanges.modified.map((file, index) => {
                                const fileContent = (
                                    <View style={styles.fileRowInner}>
                                        <Ionicons name="pencil" size={18} color={AppColors.primary} />
                                        <Text style={styles.fileName}>{file}</Text>
                                    </View>
                                );
                                return (
                                    <View key={index} style={styles.fileRow}>
                                        {isLiquidGlassSupported ? (
                                            <LiquidGlassView
                                                style={{ backgroundColor: 'transparent', borderRadius: 10, overflow: 'hidden' }}
                                                interactive={true}
                                                effect="clear"
                                                colorScheme="dark"
                                            >
                                                {fileContent}
                                            </LiquidGlassView>
                                        ) : (
                                            fileContent
                                        )}
                                    </View>
                                );
                            })}
                        </>
                    )}
                </>
            )}
        </View>
    );

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#1a1a1a', '#0a0a0a']}
                style={StyleSheet.absoluteFill}
            />

            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
                <View>
                    <Text style={styles.title}>Task Manager</Text>
                    <Text style={styles.subtitle}>
                        {isRunning ? 'Esecuzione in corso...' : 'In attesa'}
                    </Text>
                </View>
                {isLiquidGlassSupported ? (
                    <LiquidGlassView
                        style={[styles.iterationBadge, { backgroundColor: 'transparent', overflow: 'hidden' }]}
                        interactive={true}
                        effect="clear"
                        colorScheme="dark"
                    >
                        <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
                            <Text style={styles.iterationText}>Iterazione {iteration}</Text>
                        </View>
                    </LiquidGlassView>
                ) : (
                    <View style={styles.iterationBadge}>
                        <Text style={styles.iterationText}>Iterazione {iteration}</Text>
                    </View>
                )}
            </View>

            {/* Current Activity Banner */}
            {isRunning && (
                <Animated.View entering={FadeInRight} style={styles.activityBanner}>
                    {isLiquidGlassSupported ? (
                        <LiquidGlassView
                            style={[StyleSheet.absoluteFill, { borderRadius: 12, overflow: 'hidden' }]}
                            interactive={true}
                            effect="clear"
                            colorScheme="dark"
                        />
                    ) : (
                        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                    )}
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
                        <ActivityIndicator size="small" color={AppColors.primary} />
                        <Text style={styles.activityText}>
                            Usando <Text style={styles.bold}>{currentTool || 'AI'}</Text>...
                        </Text>
                    </View>
                </Animated.View>
            )}

            {/* Tabs */}
            <View style={styles.tabBar}>
                {isLiquidGlassSupported ? (
                    <LiquidGlassView
                        style={[StyleSheet.absoluteFill, { borderRadius: 12, overflow: 'hidden' }]}
                        interactive={true}
                        effect="clear"
                        colorScheme="dark"
                    />
                ) : null}
                <View style={{ flex: 1, flexDirection: 'row', padding: 4 }}>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'plan' && styles.activeTab]}
                        onPress={() => setActiveTab('plan')}
                    >
                        <Text style={[styles.tabLabel, activeTab === 'plan' && styles.activeTabLabel]}>Piano</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'logs' && styles.activeTab]}
                        onPress={() => setActiveTab('logs')}
                    >
                        <Text style={[styles.tabLabel, activeTab === 'logs' && styles.activeTabLabel]}>Log Eventi</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'files' && styles.activeTab]}
                        onPress={() => setActiveTab('files')}
                    >
                        <Text style={[styles.tabLabel, activeTab === 'files' && styles.activeTabLabel]}>File</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
                showsVerticalScrollIndicator={false}
            >
                {activeTab === 'plan' && renderPlan()}
                {activeTab === 'logs' && renderLogs()}
                {activeTab === 'files' && renderFiles()}

                {error && (
                    <View style={styles.errorCard}>
                        {isLiquidGlassSupported ? (
                            <LiquidGlassView
                                style={[StyleSheet.absoluteFill, { borderRadius: 12, overflow: 'hidden' }]}
                                interactive={true}
                                effect="clear"
                                colorScheme="dark"
                            />
                        ) : null}
                        <View style={{ flex: 1, flexDirection: 'row', gap: 12, alignItems: 'center', padding: 16 }}>
                            <Ionicons name="warning" size={24} color="#FF6B6B" />
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    </View>
                )}

                {summary && activeTab === 'plan' && (
                    <View style={styles.summaryCard}>
                        {isLiquidGlassSupported ? (
                            <LiquidGlassView
                                style={[StyleSheet.absoluteFill, { borderRadius: 16, overflow: 'hidden' }]}
                                interactive={true}
                                effect="clear"
                                colorScheme="dark"
                            />
                        ) : null}
                        <View style={{ padding: 20 }}>
                            <Text style={styles.summaryTitle}>Riepilogo Finale</Text>
                            <Text style={styles.summaryText}>{summary}</Text>
                        </View>
                    </View>
                )}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        color: '#fff',
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        marginTop: 2,
    },
    iterationBadge: {
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    iterationText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
        fontWeight: '600',
    },
    activityBanner: {
        marginHorizontal: 20,
        marginBottom: 20,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    activityText: {
        color: '#fff',
        fontSize: 14,
    },
    bold: {
        fontWeight: '700',
        color: AppColors.primary,
    },
    tabBar: {
        flexDirection: 'row',
        marginHorizontal: 20,
        borderRadius: 12,
        marginBottom: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 10,
    },
    activeTab: {
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    tabLabel: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
        fontWeight: '600',
    },
    activeTabLabel: {
        color: '#fff',
    },
    scrollContent: {
        paddingHorizontal: 20,
    },
    section: {
        width: '100%',
    },
    sectionHeader: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 16,
        marginTop: 24,
    },
    progressCard: {
        borderRadius: 16,
        marginBottom: 12,
    },
    progressCardInner: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    progressTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    progressPercentage: {
        color: AppColors.primary,
        fontWeight: '800',
    },
    progressBarBg: {
        height: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 4,
    },
    progressStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 12,
    },
    statText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
    },
    stepCard: {
        borderRadius: 14,
        marginBottom: 12,
    },
    stepInner: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 14,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    stepIndicator: {
        width: 4,
        height: 32,
        borderRadius: 2,
        marginRight: 16,
    },
    stepContent: {
        flex: 1,
    },
    stepTitle: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
    stepCompleted: {
        color: 'rgba(255,255,255,0.4)',
        textDecorationLine: 'line-through',
    },
    stepDescription: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        marginTop: 2,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 18,
        fontWeight: '600',
        marginTop: 16,
    },
    emptySubtext: {
        color: 'rgba(255,255,255,0.2)',
        fontSize: 14,
        marginTop: 8,
        textAlign: 'center',
        paddingHorizontal: 40,
    },
    logsContainer: {
        marginTop: 10,
    },
    logEntry: {
        borderRadius: 12,
        marginBottom: 12,
    },
    logInner: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    logHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    logTime: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 11,
    },
    logBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    logBadgeText: {
        color: '#fff',
        fontSize: 9,
        fontWeight: '800',
    },
    logTool: {
        color: AppColors.primary,
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 4,
    },
    logData: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    logError: {
        color: '#FF6B6B',
        fontSize: 12,
        marginTop: 8,
        backgroundColor: 'rgba(255,107,107,0.1)',
        padding: 8,
        borderRadius: 6,
    },
    fileRow: {
        borderRadius: 10,
        marginBottom: 8,
    },
    fileRowInner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.03)',
        padding: 12,
        borderRadius: 10,
        gap: 12,
    },
    fileName: {
        color: '#fff',
        fontSize: 14,
    },
    errorCard: {
        borderRadius: 12,
        marginTop: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,107,107,0.2)',
        backgroundColor: 'rgba(255,107,107,0.1)',
    },
    errorText: {
        color: '#FF6B6B',
        fontSize: 14,
        flex: 1,
    },
    summaryCard: {
        borderRadius: 16,
        marginTop: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(0,208,132,0.1)',
        backgroundColor: 'rgba(0,208,132,0.05)',
    },
    summaryTitle: {
        color: '#00D084',
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 8,
    },
    summaryText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        lineHeight: 20,
    },
});
