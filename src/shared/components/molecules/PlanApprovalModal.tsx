/**
 * PlanApprovalModal Component
 * Modal to review and approve execution plans
 */

import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Dimensions,
    ScrollView,
    Pressable,
} from 'react-native';
import { AppColors } from '../../theme/colors';
import { Ionicons } from '@expo/vector-icons';

export interface Plan {
    title: string;
    steps: string[];
    estimated_files?: number;
    technologies?: string[];
}

interface Props {
    visible: boolean;
    plan: Plan | null;
    onApprove: () => void;
    onReject: () => void;
    onClose: () => void;
}

const { width } = Dimensions.get('window');

export const PlanApprovalModal: React.FC<Props> = ({
    visible,
    plan,
    onApprove,
    onReject,
    onClose,
}) => {
    if (!plan) return null;

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="slide"
            statusBarTranslucent={true}
            onRequestClose={onClose}
        >
            <Pressable style={styles.container} onPress={onClose}>
                <View style={styles.backdrop} />

                <Pressable
                    style={styles.modalContent}
                    onPress={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerLeft}>
                            <View style={styles.iconContainer}>
                                <Ionicons
                                    name="clipboard-outline"
                                    size={24}
                                    color={AppColors.primary}
                                />
                            </View>
                            <Text style={styles.title}>Piano di Esecuzione</Text>
                        </View>
                        <TouchableOpacity
                            onPress={onClose}
                            style={styles.closeButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Ionicons name="close" size={24} color={AppColors.white.w60} />
                        </TouchableOpacity>
                    </View>

                    {/* Plan Title */}
                    <View style={styles.planTitleContainer}>
                        <Text style={styles.planTitle}>{plan.title}</Text>
                    </View>

                    {/* Meta Info */}
                    <View style={styles.metaContainer}>
                        {plan.estimated_files !== undefined && (
                            <View style={styles.metaBadge}>
                                <Ionicons
                                    name="document-text-outline"
                                    size={14}
                                    color={AppColors.white.w60}
                                />
                                <Text style={styles.metaText}>
                                    {plan.estimated_files} file
                                    {plan.estimated_files !== 1 ? 's' : ''}
                                </Text>
                            </View>
                        )}
                        {plan.technologies && plan.technologies.length > 0 && (
                            <View style={styles.metaBadge}>
                                <Ionicons
                                    name="code-slash-outline"
                                    size={14}
                                    color={AppColors.white.w60}
                                />
                                <Text style={styles.metaText}>
                                    {plan.technologies.join(', ')}
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Steps List */}
                    <ScrollView style={styles.stepsContainer} showsVerticalScrollIndicator={true}>
                        <Text style={styles.sectionTitle}>Passaggi da eseguire:</Text>
                        {plan.steps.map((step, index) => (
                            <View key={index} style={styles.stepItem}>
                                <View style={styles.stepNumber}>
                                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                                </View>
                                <Text style={styles.stepText}>{step}</Text>
                            </View>
                        ))}
                    </ScrollView>

                    {/* Action Buttons */}
                    <View style={styles.actionsContainer}>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.rejectButton]}
                            onPress={onReject}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="close-circle-outline" size={20} color="#fff" />
                            <Text style={styles.actionButtonText}>Rifiuta</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.actionButton, styles.approveButton]}
                            onPress={onApprove}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="checkmark-circle" size={20} color="#fff" />
                            <Text style={styles.actionButtonText}>Approva Piano</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
    },
    modalContent: {
        width: '100%',
        maxHeight: '85%',
        backgroundColor: AppColors.dark.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: AppColors.white.w10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 10,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: AppColors.primaryAlpha.a15,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: AppColors.white.full,
        flex: 1,
    },
    closeButton: {
        padding: 4,
    },
    planTitleContainer: {
        backgroundColor: AppColors.dark.surfaceVariant,
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: AppColors.white.w10,
    },
    planTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: AppColors.white.full,
        lineHeight: 22,
    },
    metaContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
    },
    metaBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: AppColors.white.w08,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: AppColors.white.w10,
    },
    metaText: {
        fontSize: 12,
        color: AppColors.white.w70,
        fontWeight: '500',
    },
    stepsContainer: {
        maxHeight: 300,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: AppColors.white.w80,
        marginBottom: 12,
    },
    stepItem: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
        alignItems: 'flex-start',
    },
    stepNumber: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: AppColors.primaryAlpha.a15,
        borderWidth: 1,
        borderColor: AppColors.primaryAlpha.a40,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 2,
    },
    stepNumberText: {
        fontSize: 13,
        fontWeight: '700',
        color: AppColors.primary,
    },
    stepText: {
        flex: 1,
        fontSize: 14,
        color: AppColors.white.w80,
        lineHeight: 20,
    },
    actionsContainer: {
        flexDirection: 'row',
        gap: 12,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 3,
    },
    rejectButton: {
        backgroundColor: '#FF4444',
    },
    approveButton: {
        backgroundColor: AppColors.success,
    },
    actionButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
    },
});
