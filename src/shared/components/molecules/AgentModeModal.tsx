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
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppColors } from '../../theme/colors';
import { Ionicons } from '@expo/vector-icons';

interface Props {
    visible: boolean;
    onClose: () => void;
    onSelectMode: (mode: 'fast' | 'planning') => void;
}

const { width } = Dimensions.get('window');

export const AgentModeModal: React.FC<Props> = ({ visible, onClose, onSelectMode }) => {
    const renderContent = () => (
        <View style={styles.modalInner}>
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
                    onPress={() => onSelectMode('fast')}
                    activeOpacity={0.7}
                >
                    {isLiquidGlassSupported ? (
                        <LiquidGlassView
                            style={[styles.modeCard, { backgroundColor: 'rgba(139, 92, 246, 0.1)', overflow: 'hidden' }]}
                            interactive={true}
                            effect="clear"
                            colorScheme="dark"
                        >
                            <View style={{ padding: 16 }}>
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
                            </View>
                        </LiquidGlassView>
                    ) : (
                        <View style={styles.modeCard}>
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
                        </View>
                    )}
                </TouchableOpacity>

                {/* Planning Mode Card */}
                <TouchableOpacity
                    onPress={() => onSelectMode('planning')}
                    activeOpacity={0.7}
                >
                    {isLiquidGlassSupported ? (
                        <LiquidGlassView
                            style={[styles.modeCard, { backgroundColor: 'rgba(255, 255, 255, 0.03)', overflow: 'hidden' }]}
                            interactive={true}
                            effect="clear"
                            colorScheme="dark"
                        >
                            <View style={{ padding: 16 }}>
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
                            </View>
                        </LiquidGlassView>
                    ) : (
                        <View style={styles.modeCard}>
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
                        </View>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );

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

                {isLiquidGlassSupported ? (
                    <LiquidGlassView
                        style={[styles.modalContent, { backgroundColor: 'transparent', overflow: 'hidden' }]}
                        interactive={true}
                        effect="clear"
                        colorScheme="dark"
                    >
                        {renderContent()}
                    </LiquidGlassView>
                ) : (
                    <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                        {renderContent()}
                    </Pressable>
                )}
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
        borderRadius: 24,
    },
    modalInner: {
        padding: 24,
        backgroundColor: 'rgba(26, 26, 26, 0.4)',
        borderRadius: 24,
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
        gap: 16,
    },
    modeCard: {
        borderRadius: 20,
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
