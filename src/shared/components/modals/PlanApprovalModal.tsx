/**
 * PlanApprovalModal Component
 * Shows the agent's execution plan and allows user to approve or reject it
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../theme/colors';

interface PlanStep {
  step: number;
  action: string;
  files?: string[];
  description: string;
}

interface Plan {
  title: string;
  steps: PlanStep[];
  estimated_files?: number;
  technologies?: string[];
}

interface Props {
  visible: boolean;
  plan: Plan | null;
  planContent?: string;
  onApprove: () => void;
  onReject: () => void;
}

export const PlanApprovalModal: React.FC<Props> = ({
  visible,
  plan,
  planContent,
  onApprove,
  onReject,
}) => {
  if (!plan && !planContent) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onReject}
    >
      <View style={styles.overlay}>
        <BlurView intensity={30} tint="dark" style={styles.blurOverlay}>
          <View style={styles.modalContainer}>
            <LinearGradient
              colors={['rgba(20, 20, 25, 0.98)', 'rgba(15, 15, 20, 0.98)']}
              style={styles.modalGradient}
            >
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <View style={styles.iconContainer}>
                    <Ionicons name="list-outline" size={22} color={AppColors.primary} />
                  </View>
                  <Text style={styles.title}>Execution Plan</Text>
                </View>
                <TouchableOpacity onPress={onReject} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color={AppColors.white.w60} />
                </TouchableOpacity>
              </View>

              <View style={styles.divider} />

              {/* Plan Content */}
              <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={true}
              >
                {plan && (
                  <>
                    {/* Plan Title */}
                    <Text style={styles.planTitle}>{plan.title}</Text>

                    {/* Plan Metadata */}
                    <View style={styles.metadata}>
                      {plan.estimated_files && (
                        <View style={styles.metadataItem}>
                          <Ionicons name="document-text-outline" size={14} color={AppColors.white.w60} />
                          <Text style={styles.metadataText}>
                            {plan.estimated_files} file{plan.estimated_files !== 1 ? 's' : ''}
                          </Text>
                        </View>
                      )}
                      {plan.technologies && plan.technologies.length > 0 && (
                        <View style={styles.metadataItem}>
                          <Ionicons name="code-outline" size={14} color={AppColors.white.w60} />
                          <Text style={styles.metadataText}>
                            {plan.technologies.join(', ')}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Steps */}
                    <View style={styles.stepsContainer}>
                      {plan.steps.map((step, index) => (
                        <View key={index} style={styles.stepCard}>
                          <View style={styles.stepHeader}>
                            <View style={styles.stepNumber}>
                              <Text style={styles.stepNumberText}>{step.step}</Text>
                            </View>
                            <Text style={styles.stepAction}>{step.action}</Text>
                          </View>

                          <Text style={styles.stepDescription}>{step.description}</Text>

                          {step.files && step.files.length > 0 && (
                            <View style={styles.filesContainer}>
                              <Text style={styles.filesLabel}>Files:</Text>
                              {step.files.map((file, fileIndex) => (
                                <View key={fileIndex} style={styles.fileItem}>
                                  <Ionicons name="document-outline" size={12} color={AppColors.primary} />
                                  <Text style={styles.fileName}>{file}</Text>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {planContent && !plan && (
                  <Text style={styles.planContentText}>{planContent}</Text>
                )}
              </ScrollView>

              {/* Actions */}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.button, styles.rejectButton]}
                  onPress={onReject}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle-outline" size={20} color={AppColors.error} />
                  <Text style={[styles.buttonText, styles.rejectButtonText]}>Reject</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.approveButton]}
                  onPress={onApprove}
                  activeOpacity={0.7}
                >
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                  <Text style={[styles.buttonText, styles.approveButtonText]}>Approve & Execute</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </BlurView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blurOverlay: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 600,
    maxHeight: '80%',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: AppColors.white.w10,
  },
  modalGradient: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
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
    borderRadius: 12,
    backgroundColor: AppColors.primaryAlpha.a15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: AppColors.white.full,
    letterSpacing: -0.3,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: AppColors.white.w10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: AppColors.white.w10,
    marginHorizontal: 20,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  planTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: AppColors.white.full,
    marginBottom: 16,
    letterSpacing: -0.4,
  },
  metadata: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: AppColors.white.w10,
    borderRadius: 8,
  },
  metadataText: {
    fontSize: 12,
    color: AppColors.white.w60,
    fontWeight: '500',
  },
  stepsContainer: {
    gap: 12,
  },
  stepCard: {
    backgroundColor: AppColors.white.w04,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: AppColors.white.w10,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: AppColors.primaryAlpha.a20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: AppColors.primary,
  },
  stepAction: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: AppColors.white.full,
    letterSpacing: -0.2,
  },
  stepDescription: {
    fontSize: 13,
    color: AppColors.white.w60,
    lineHeight: 20,
    marginBottom: 8,
  },
  filesContainer: {
    marginTop: 8,
    gap: 6,
  },
  filesLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: AppColors.white.w40,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  fileName: {
    fontSize: 12,
    color: AppColors.primary,
    fontFamily: 'monospace',
  },
  planContentText: {
    fontSize: 13,
    color: AppColors.white.w80,
    lineHeight: 20,
    fontFamily: 'monospace',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: AppColors.white.w10,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  rejectButton: {
    backgroundColor: 'transparent',
    borderColor: AppColors.error + '40',
  },
  approveButton: {
    backgroundColor: AppColors.primary,
    borderColor: 'transparent',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  rejectButtonText: {
    color: AppColors.error,
  },
  approveButtonText: {
    color: '#fff',
  },
});
