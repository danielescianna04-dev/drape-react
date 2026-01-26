import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Modal } from 'react-native';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppColors } from '../../theme/colors';

interface Props {
    visible: boolean;
    message?: string;
}

export const LoadingModal = ({ visible, message = 'Loading...' }: Props) => {
    const renderContent = () => (
        <>
            <ActivityIndicator size="large" color={AppColors.primary} style={styles.spinner} />
            <Text style={styles.message}>{message}</Text>
        </>
    );

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            statusBarTranslucent={true}
        >
            <View style={styles.container}>
                {isLiquidGlassSupported ? (
                    <LiquidGlassView 
                        style={styles.glassContent}
                        interactive={true}
                        effect="clear"
                        colorScheme="dark"
                    >
                        <View style={styles.innerContent}>
                            {renderContent()}
                        </View>
                    </LiquidGlassView>
                ) : (
                    <View style={styles.content}>
                        {renderContent()}
                    </View>
                )}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
    },
    content: {
        backgroundColor: AppColors.dark.surfaceAlt,
        padding: 24,
        borderRadius: 24,
        alignItems: 'center',
        minWidth: 200,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.30,
        shadowRadius: 4.65,
        elevation: 8,
    },
    glassContent: {
        minWidth: 200,
        borderRadius: 24,
        overflow: 'hidden',
    },
    innerContent: {
        padding: 24,
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    spinner: {
        marginBottom: 16,
    },
    message: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
    },
});
