import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Modal } from 'react-native';
import { AppColors } from '../../theme/colors';

interface Props {
    visible: boolean;
    message?: string;
}

export const LoadingModal = ({ visible, message = 'Loading...' }: Props) => {
    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            statusBarTranslucent={true}
        >
            <View style={styles.container}>
                <View style={styles.content}>
                    <ActivityIndicator size="large" color={AppColors.primary} style={styles.spinner} />
                    <Text style={styles.message}>{message}</Text>
                </View>
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
        borderRadius: 16,
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
