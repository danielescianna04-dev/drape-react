/**
 * AgentModeModal Component
 * Modal to select between Fast and Planning modes
 */

import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Dimensions,
    Pressable,
} from 'react-native';
import { AppColors } from '../../theme/colors';
import { Ionicons } from '@expo/vector-icons';

interface Props {
    visible: boolean;
    onClose: () => void;
    onSelectMode: (mode: 'fast' | 'planning') => void;
}

const { width } = Dimensions.get('window');

export const AgentModeModal: React.FC<Props> = ({ visible, onClose, onSelectMode }) => {
    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            statusBarTranslucent={true}
            onRequestClose={onClose}
        >
            <Pressable style={styles.container} onPress={onClose}>
                <View style={styles.backdrop} />

                <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>Seleziona Modalità</Text>
                        <TouchableOpacity
                            onPress={onClose}
                            style={styles.closeButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Ionicons name="close" size={24} color={AppColors.white.w60} />
                        </TouchableOpacity>
                    </View>

                    {/* Mode Cards */}
                    <View style={styles.cardsContainer}>
                        {/* Fast Mode Card */}
                        <TouchableOpacity
                            style={styles.modeCard}
                            onPress={() => onSelectMode('fast')}
                            activeOpacity={0.7}
                        >
                            <View style={styles.cardHeader}>
                                <View style={[styles.iconContainer, styles.iconContainerFast]}>
                                    <Ionicons name="flash" size={24} color={AppColors.primary} />
                                </View>
                                <View style={styles.recommendedBadge}>
                                    <Text style={styles.recommendedText}>Consigliato</Text>
                                </View>
                            </View>

                            <Text style={styles.modeTitle}>Esecuzione Rapida</Text>
                            <Text style={styles.modeDescription}>
                                Genera subito il codice e corregge eventuali errori in tempo reale
                            </Text>

                            <View style={styles.features}>
                                <View style={styles.feature}>
                                    <Ionicons
                                        name="checkmark-circle"
                                        size={16}
                                        color={AppColors.primary}
                                    />
                                    <Text style={styles.featureText}>Veloce</Text>
                                </View>
                                <View style={styles.feature}>
                                    <Ionicons
                                        name="checkmark-circle"
                                        size={16}
                                        color={AppColors.primary}
                                    />
                                    <Text style={styles.featureText}>Auto-correzione</Text>
                                </View>
                            </View>
                        </TouchableOpacity>

                        {/* Planning Mode Card */}
                        <TouchableOpacity
                            style={styles.modeCard}
                            onPress={() => onSelectMode('planning')}
                            activeOpacity={0.7}
                        >
                            <View style={styles.cardHeader}>
                                <View style={[styles.iconContainer, styles.iconContainerPlanning]}>
                                    <Ionicons
                                        name="clipboard-outline"
                                        size={24}
                                        color={AppColors.white.w70}
                                    />
                                </View>
                            </View>

                            <Text style={styles.modeTitle}>Pianificazione</Text>
                            <Text style={styles.modeDescription}>
                                Crea un piano dettagliato e attendi la tua approvazione prima di procedere
                            </Text>

                            <View style={styles.features}>
                                <View style={styles.feature}>
                                    <Ionicons
                                        name="checkmark-circle"
                                        size={16}
                                        color={AppColors.white.w40}
                                    />
                                    <Text style={styles.featureText}>Controllo totale</Text>
                                </View>
                                <View style={styles.feature}>
                                    <Ionicons
                                        name="checkmark-circle"
                                        size={16}
                                        color={AppColors.white.w40}
                                    />
                                    <Text style={styles.featureText}>Piano dettagliato</Text>
                                </View>
                            </View>
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
        justifyContent: 'center',
        alignItems: 'center',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
    },
    modalContent: {
        width: width * 0.9,
        maxWidth: 500,
        backgroundColor: AppColors.dark.surface,
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: AppColors.white.w10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: AppColors.white.full,
    },
    closeButton: {
        padding: 4,
    },
    cardsContainer: {
        gap: 12,
    },
    modeCard: {
        backgroundColor: AppColors.dark.surfaceVariant,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: AppColors.white.w10,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconContainerFast: {
        backgroundColor: AppColors.primaryAlpha.a15,
    },
    iconContainerPlanning: {
        backgroundColor: AppColors.white.w08,
    },
    recommendedBadge: {
        backgroundColor: AppColors.primaryAlpha.a20,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: AppColors.primaryAlpha.a40,
    },
    recommendedText: {
        fontSize: 11,
        fontWeight: '600',
        color: AppColors.primary,
    },
    modeTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: AppColors.white.full,
        marginBottom: 8,
    },
    modeDescription: {
        fontSize: 14,
        color: AppColors.white.w60,
        lineHeight: 20,
        marginBottom: 16,
    },
    features: {
        gap: 8,
    },
    feature: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    featureText: {
        fontSize: 13,
        color: AppColors.white.w70,
    },
});
