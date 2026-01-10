/**
 * TodoList Component - Display agent task progress
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../theme/colors';

interface Todo {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    activeForm: string;
}

interface Props {
    todos: Todo[];
}

export const TodoList: React.FC<Props> = ({ todos }) => {
    if (!todos || todos.length === 0) {
        return null;
    }

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
        <View style={styles.container}>
            <Text style={styles.header}>Tasks</Text>
            {todos.map((todo, index) => (
                <View key={index} style={styles.todoItem}>
                    <Ionicons
                        name={getStatusIcon(todo.status)}
                        size={20}
                        color={getStatusColor(todo.status)}
                        style={styles.icon}
                    />
                    <View style={styles.todoContent}>
                        <Text style={styles.todoText}>
                            {todo.status === 'in_progress' ? todo.activeForm : todo.content}
                        </Text>
                    </View>
                </View>
            ))}
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
    header: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
        marginBottom: 12,
    },
    todoItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
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
});

export default TodoList;
