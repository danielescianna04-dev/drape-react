import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
    content: string;
    language?: string;
}

export const CollapsibleCodeBlock = ({ content, language }: Props) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Remove trailing newline
    const cleanContent = content.replace(/\n$/, '');
    const lines = cleanContent.split('\n');
    const isLong = lines.length > 6;
    const displayedLines = isExpanded || !isLong ? lines : lines.slice(0, 6);

    return (
        <View style={styles.container}>
            {language && (
                <View style={styles.header}>
                    <Text style={styles.language}>{language}</Text>
                </View>
            )}

            <View style={[styles.codeContainer, language ? styles.codeContainerWithHeader : {}]}>
                {displayedLines.map((line, index) => (
                    <Text key={index} style={styles.codeLine}>
                        {line}
                    </Text>
                ))}
            </View>

            {!isExpanded && isLong && (
                <View style={styles.overlay}>
                    <LinearGradient
                        colors={['transparent', 'rgba(20, 20, 20, 0.95)']}
                        style={styles.gradient}
                    />
                    <TouchableOpacity
                        onPress={() => setIsExpanded(true)}
                        style={styles.expandButton}
                    >
                        <Text style={styles.expandText}>Show {lines.length - 6} more lines</Text>
                        <Ionicons name="chevron-down" size={14} color="#8B949E" />
                    </TouchableOpacity>
                </View>
            )}

            {isExpanded && isLong && (
                <TouchableOpacity
                    onPress={() => setIsExpanded(false)}
                    style={styles.collapseButton}
                >
                    <Text style={styles.expandText}>Show less</Text>
                    <Ionicons name="chevron-up" size={14} color="#8B949E" />
                </TouchableOpacity>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        backgroundColor: 'rgba(20, 20, 20, 0.95)',
        overflow: 'hidden',
    },
    header: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
    },
    language: {
        fontSize: 11,
        fontWeight: '600',
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'uppercase',
    },
    codeContainer: {
        padding: 12,
    },
    codeContainerWithHeader: {
        paddingTop: 8,
    },
    codeLine: {
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.9)',
        lineHeight: 20,
    },
    overlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 60,
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 8,
    },
    gradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    expandButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#1C1C1E',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        zIndex: 10,
    },
    collapseButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
    },
    expandText: {
        fontSize: 12,
        fontWeight: '500',
        color: '#8B949E',
    },
});
