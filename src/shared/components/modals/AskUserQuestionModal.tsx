/**
 * AskUserQuestion Modal - Interactive question UI
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { AppColors } from '../../theme/colors';

interface QuestionOption {
    label: string;
    description: string;
}

interface Question {
    question: string;
    header: string;
    multiSelect: boolean;
    options: QuestionOption[];
}

interface Props {
    visible: boolean;
    questions: Question[];
    onAnswer: (answers: { [key: string]: string | string[] }) => void;
    onCancel: () => void;
}

export const AskUserQuestionModal: React.FC<Props> = ({
    visible,
    questions,
    onAnswer,
    onCancel
}) => {
    const [answers, setAnswers] = useState<{ [key: string]: string | string[] }>({});

    const handleOptionSelect = (questionIndex: number, optionLabel: string, multiSelect: boolean) => {
        const key = `question_${questionIndex}`;

        if (multiSelect) {
            const current = (answers[key] as string[]) || [];
            const newValue = current.includes(optionLabel)
                ? current.filter(l => l !== optionLabel)
                : [...current, optionLabel];
            setAnswers({ ...answers, [key]: newValue });
        } else {
            setAnswers({ ...answers, [key]: optionLabel });
        }
    };

    const handleSubmit = () => {
        onAnswer(answers);
        setAnswers({});
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onCancel}
        >
            <View style={styles.overlay}>
                <View style={styles.modal}>
                    <Text style={styles.title}>Agent has questions</Text>

                    <ScrollView style={styles.questionsContainer}>
                        {questions.map((q, qIndex) => (
                            <View key={qIndex} style={styles.questionBlock}>
                                <View style={styles.questionHeader}>
                                    <Text style={styles.headerChip}>{q.header}</Text>
                                </View>
                                <Text style={styles.questionText}>{q.question}</Text>

                                <View style={styles.optionsContainer}>
                                    {q.options.map((opt, oIndex) => {
                                        const key = `question_${qIndex}`;
                                        const isSelected = q.multiSelect
                                            ? ((answers[key] as string[]) || []).includes(opt.label)
                                            : answers[key] === opt.label;

                                        return (
                                            <TouchableOpacity
                                                key={oIndex}
                                                style={[
                                                    styles.option,
                                                    isSelected && styles.optionSelected
                                                ]}
                                                onPress={() => handleOptionSelect(qIndex, opt.label, q.multiSelect)}
                                            >
                                                <Text style={[
                                                    styles.optionLabel,
                                                    isSelected && styles.optionLabelSelected
                                                ]}>
                                                    {opt.label}
                                                </Text>
                                                <Text style={styles.optionDescription}>
                                                    {opt.description}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        ))}
                    </ScrollView>

                    <View style={styles.actions}>
                        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
                            <Text style={styles.submitText}>Submit</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modal: {
        backgroundColor: '#1a1a1a',
        borderRadius: 16,
        padding: 24,
        width: '100%',
        maxWidth: 500,
        maxHeight: '80%',
    },
    title: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '600',
        marginBottom: 20,
    },
    questionsContainer: {
        marginBottom: 20,
    },
    questionBlock: {
        marginBottom: 24,
    },
    questionHeader: {
        marginBottom: 8,
    },
    headerChip: {
        color: AppColors.primary,
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    questionText: {
        color: '#fff',
        fontSize: 16,
        marginBottom: 12,
    },
    optionsContainer: {
        gap: 8,
    },
    option: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        borderRadius: 8,
        padding: 12,
    },
    optionSelected: {
        borderColor: AppColors.primary,
        backgroundColor: 'rgba(139,92,246,0.1)',
    },
    optionLabel: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 4,
    },
    optionLabelSelected: {
        color: AppColors.primary,
    },
    optionDescription: {
        color: '#9ca3af',
        fontSize: 12,
    },
    actions: {
        flexDirection: 'row',
        gap: 12,
    },
    cancelButton: {
        flex: 1,
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
    },
    cancelText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
    },
    submitButton: {
        flex: 1,
        padding: 12,
        borderRadius: 8,
        backgroundColor: AppColors.primary,
        alignItems: 'center',
    },
    submitText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
});

export default AskUserQuestionModal;
