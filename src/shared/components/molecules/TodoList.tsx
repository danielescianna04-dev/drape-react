/**
 * TodoList Component - Display agent task progress
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../theme/colors';

interface Todo {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    activeForm: string;
}

interface Props {
    todos: Todo[];
    variant?: 'default' | 'inputbar';
    maxVisibleItems?: number;
    collapsible?: boolean;
    collapsed?: boolean;
    onToggleCollapse?: () => void;
    onDismiss?: () => void;
}

export const TodoList: React.FC<Props> = ({
    todos,
    variant = 'default',
    maxVisibleItems,
    collapsible = false,
    collapsed = false,
    onToggleCollapse,
    onDismiss,
}) => {
    if (!todos || todos.length === 0) {
        return null;
    }

    const visibleTodos = typeof maxVisibleItems === 'number' && maxVisibleItems > 0
        ? todos.slice(0, maxVisibleItems)
        : todos;
    const hiddenCount = Math.max(0, todos.length - visibleTodos.length);
    const isInputbar = variant === 'inputbar';
    const isCollapsed = collapsible ? collapsed : false;

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed':
                return 'checkmark-circle';
            case 'in_progress':
                return 'reload-circle';
            case 'pending':
                return 'ellipse-outline';
            default:
                return 'ellipse-outline';
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed':
                return AppColors.primary;
            case 'in_progress':
                return '#f59e0b';
            case 'pending':
                return '#6b7280';
            default:
                return '#6b7280';
        }
    };

    return (
        <View style={[styles.container, isInputbar && styles.containerInputbar, isInputbar && isCollapsed && styles.containerInputbarCollapsed]}>
            <View style={[styles.headerRow, isCollapsed && styles.headerRowCollapsed]}>
                <Text style={[styles.header, isInputbar && styles.headerInputbar]}>
                    Tasks ({todos.length})
                </Text>
                <View style={styles.headerButtons}>
                    {collapsible && (
                        <TouchableOpacity
                            onPress={onToggleCollapse}
                            style={styles.collapseButton}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Ionicons
                                name={isCollapsed ? 'chevron-up' : 'chevron-down'}
                                size={14}
                                color="rgba(255,255,255,0.65)"
                            />
                        </TouchableOpacity>
                    )}
                    {onDismiss && (
                        <TouchableOpacity
                            onPress={onDismiss}
                            style={styles.dismissButton}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Ionicons
                                name="close"
                                size={13}
                                color="rgba(255,255,255,0.5)"
                            />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
            {!isCollapsed && visibleTodos.map((todo, index) => (
                <View key={index} style={[styles.todoItem, isInputbar && styles.todoItemInputbar]}>
                    <Ionicons
                        name={getStatusIcon(todo.status)}
                        size={isInputbar ? 16 : 20}
                        color={getStatusColor(todo.status)}
                        style={styles.icon}
                    />
                    <View style={styles.todoContent}>
                        <Text style={[styles.todoText, isInputbar && styles.todoTextInputbar]}>
                            {todo.status === 'in_progress' ? todo.activeForm : todo.content}
                        </Text>
                    </View>
                </View>
            ))}
            {!isCollapsed && hiddenCount > 0 && (
                <Text style={[styles.moreText, isInputbar && styles.moreTextInputbar]}>
                    +{hiddenCount} altre attivita
                </Text>
            )}
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
        marginVertical: 8,
    },
    containerInputbar: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderColor: 'rgba(255,255,255,0.08)',
        marginVertical: 0,
        marginBottom: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 14,
    },
    containerInputbarCollapsed: {
        paddingVertical: 6,
    },
    header: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
        marginBottom: 12,
    },
    headerInputbar: {
        fontSize: 12,
        marginBottom: 0,
        color: 'rgba(255,255,255,0.78)',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    headerRowCollapsed: {
        marginBottom: 0,
    },
    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    collapseButton: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    dismissButton: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    todoItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
    },
    todoItemInputbar: {
        paddingVertical: 5,
    },
    icon: {
        marginRight: 12,
    },
    todoContent: {
        flex: 1,
    },
    todoText: {
        color: '#fff',
        fontSize: 14,
    },
    todoTextInputbar: {
        fontSize: 13,
        lineHeight: 18,
        color: 'rgba(255,255,255,0.92)',
    },
    moreText: {
        marginTop: 8,
        color: 'rgba(255,255,255,0.65)',
        fontSize: 12,
    },
    moreTextInputbar: {
        marginTop: 6,
        fontSize: 11,
        color: 'rgba(255,255,255,0.55)',
    },
});

export default TodoList;
