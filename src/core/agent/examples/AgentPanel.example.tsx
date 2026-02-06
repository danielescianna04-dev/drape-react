/**
 * Agent Panel Example Component
 * Demonstrates complete integration of Agent SSE infrastructure
 *
 * Features:
 * - Mode switching (fast/planning/executing)
 * - Real-time event streaming
 * - Plan visualization
 * - File change tracking
 * - Error handling
 */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { useAgentStream, AgentToolEvent } from '../../../hooks/api/useAgentStream';
import { useAgentStore, agentSelectors } from '../agentStore';

type AgentMode = 'fast' | 'planning' | 'executing';

export function AgentPanelExample() {
  // Local state
  const [mode, setMode] = useState<AgentMode>('fast');
  const [prompt, setPrompt] = useState('');
  const [projectId, setProjectId] = useState('example-project');

  // Agent stream hook
  const {
    events,
    isRunning,
    currentTool,
    error,
    plan,
    summary,
    start,
    stop,
    reset
  } = useAgentStream(mode, {
    enabled: true,
    onEvent: (event: AgentToolEvent) => {
      console.log('[AgentPanel] Event:', event.type, event.tool);
    },
    onComplete: (summary: string) => {
      console.log('[AgentPanel] Completed:', summary);
    },
    onError: (error: string) => {
      console.error('[AgentPanel] Error:', error);
    }
  });

  // Global store state
  const filesCreated = useAgentStore((state) => state.filesCreated);
  const filesModified = useAgentStore((state) => state.filesModified);
  const iteration = useAgentStore((state) => state.iteration);

  // Selectors
  const status = agentSelectors.getStatus();
  const planProgress = agentSelectors.getPlanProgress();
  const toolErrors = agentSelectors.getToolErrors();

  // Handlers
  const handleStart = () => {
    if (!prompt.trim()) {
      alert('Please enter a prompt');
      return;
    }
    start(prompt, projectId);
  };

  const handleStop = () => {
    stop();
  };

  const handleReset = () => {
    reset();
    setPrompt('');
  };

  const handleModeChange = (newMode: AgentMode) => {
    if (isRunning) {
      alert('Cannot change mode while running');
      return;
    }
    setMode(newMode);
    reset();
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Agent Control Panel</Text>
        <Text style={styles.subtitle}>Status: {status}</Text>
      </View>

      {/* Mode Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mode</Text>
        <View style={styles.modeButtons}>
          {(['fast', 'planning', 'executing'] as AgentMode[]).map((m) => (
            <TouchableOpacity
              key={m}
              style={[
                styles.modeButton,
                mode === m && styles.modeButtonActive,
                isRunning && styles.modeButtonDisabled
              ]}
              onPress={() => handleModeChange(m)}
              disabled={isRunning}
            >
              <Text style={[
                styles.modeButtonText,
                mode === m && styles.modeButtonTextActive
              ]}>
                {m}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Input */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Prompt</Text>
        <TextInput
          style={styles.input}
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Enter your task..."
          multiline
          numberOfLines={3}
          editable={!isRunning}
        />
      </View>

      {/* Project ID */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Project ID</Text>
        <TextInput
          style={styles.inputSmall}
          value={projectId}
          onChangeText={setProjectId}
          placeholder="project-id"
          editable={!isRunning}
        />
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.button, styles.buttonStart, isRunning && styles.buttonDisabled]}
          onPress={handleStart}
          disabled={isRunning}
        >
          <Text style={styles.buttonText}>Start</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonStop, !isRunning && styles.buttonDisabled]}
          onPress={handleStop}
          disabled={!isRunning}
        >
          <Text style={styles.buttonText}>Stop</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonReset]}
          onPress={handleReset}
        >
          <Text style={styles.buttonText}>Reset</Text>
        </TouchableOpacity>
      </View>

      {/* Status */}
      {isRunning && (
        <View style={[styles.section, styles.statusSection]}>
          <Text style={styles.statusText}>
            Running: {currentTool || 'Starting...'}
          </Text>
          {iteration > 0 && (
            <Text style={styles.statusText}>Iteration: {iteration}</Text>
          )}
        </View>
      )}

      {/* Plan (Planning Mode) */}
      {plan && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Execution Plan</Text>
          <View style={styles.planContainer}>
            <Text style={styles.planMeta}>
              Steps: {plan.steps.length} | Estimated: {plan.estimatedDuration}s
            </Text>
            {planProgress && (
              <Text style={styles.planMeta}>
                Progress: {planProgress.percentage}% ({planProgress.completed}/{planProgress.total})
              </Text>
            )}
            {plan.steps.map((step, index) => (
              <View key={step.id} style={styles.planStep}>
                <Text style={styles.planStepNumber}>{index + 1}.</Text>
                <View style={styles.planStepContent}>
                  <Text style={styles.planStepDescription}>{step.description}</Text>
                  {step.tool && (
                    <Text style={styles.planStepTool}>Tool: {step.tool}</Text>
                  )}
                  <Text style={[
                    styles.planStepStatus,
                    styles[`planStepStatus${step.status.charAt(0).toUpperCase() + step.status.slice(1)}`]
                  ]}>
                    {step.status}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* File Changes */}
      {(filesCreated.length > 0 || filesModified.length > 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>File Changes</Text>
          {filesCreated.length > 0 && (
            <View style={styles.fileSection}>
              <Text style={styles.fileHeader}>Created ({filesCreated.length})</Text>
              {filesCreated.map((file, i) => (
                <Text key={i} style={[styles.fileItem, styles.fileCreated]}>
                  + {file}
                </Text>
              ))}
            </View>
          )}
          {filesModified.length > 0 && (
            <View style={styles.fileSection}>
              <Text style={styles.fileHeader}>Modified ({filesModified.length})</Text>
              {filesModified.map((file, i) => (
                <Text key={i} style={[styles.fileItem, styles.fileModified]}>
                  ~ {file}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Errors */}
      {error && (
        <View style={[styles.section, styles.errorSection]}>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {toolErrors.length > 0 && (
        <View style={[styles.section, styles.errorSection]}>
          <Text style={styles.errorTitle}>Tool Errors ({toolErrors.length})</Text>
          {toolErrors.map((err) => (
            <View key={err.id} style={styles.toolError}>
              <Text style={styles.toolErrorTool}>{err.tool}</Text>
              <Text style={styles.errorText}>{err.error}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Success */}
      {summary && (
        <View style={[styles.section, styles.successSection]}>
          <Text style={styles.successTitle}>Completed</Text>
          <Text style={styles.successText}>{summary}</Text>
        </View>
      )}

      {/* Events Log */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Events ({events.length})</Text>
        <ScrollView style={styles.eventsContainer}>
          {events.slice().reverse().map((event) => (
            <View key={event.id} style={styles.event}>
              <Text style={styles.eventTime}>
                {event.timestamp.toLocaleTimeString()}
              </Text>
              <View style={styles.eventContent}>
                <Text style={[styles.eventType, styles[`eventType${event.type}`]]}>
                  [{event.type}]
                </Text>
                {event.tool && (
                  <Text style={styles.eventTool}>{event.tool}</Text>
                )}
                {event.message && (
                  <Text style={styles.eventMessage}>{event.message}</Text>
                )}
                {event.error && (
                  <Text style={styles.eventError}>{event.error}</Text>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  modeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  modeButtonDisabled: {
    opacity: 0.5,
  },
  modeButtonText: {
    fontSize: 14,
    color: '#666',
    textTransform: 'capitalize',
  },
  modeButtonTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputSmall: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
  },
  controls: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonStart: {
    backgroundColor: '#28a745',
  },
  buttonStop: {
    backgroundColor: '#dc3545',
  },
  buttonReset: {
    backgroundColor: '#6c757d',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  statusSection: {
    backgroundColor: '#e3f2fd',
  },
  statusText: {
    fontSize: 14,
    color: '#1976d2',
    marginBottom: 4,
  },
  planContainer: {
    gap: 8,
  },
  planMeta: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  planStep: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
    marginBottom: 8,
  },
  planStepNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginRight: 8,
  },
  planStepContent: {
    flex: 1,
  },
  planStepDescription: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  planStepTool: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  planStepStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  planStepStatusPending: {
    color: '#6c757d',
  },
  planStepStatusRunning: {
    color: '#007bff',
  },
  planStepStatusCompleted: {
    color: '#28a745',
  },
  planStepStatusFailed: {
    color: '#dc3545',
  },
  fileSection: {
    marginBottom: 12,
  },
  fileHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  fileItem: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    paddingVertical: 4,
  },
  fileCreated: {
    color: '#28a745',
  },
  fileModified: {
    color: '#ffc107',
  },
  errorSection: {
    backgroundColor: '#f8d7da',
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#721c24',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#721c24',
  },
  toolError: {
    marginBottom: 8,
  },
  toolErrorTool: {
    fontSize: 12,
    fontWeight: '600',
    color: '#721c24',
    marginBottom: 4,
  },
  successSection: {
    backgroundColor: '#d4edda',
  },
  successTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#155724',
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: '#155724',
  },
  eventsContainer: {
    maxHeight: 400,
  },
  event: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  eventTime: {
    fontSize: 10,
    color: '#999',
    width: 60,
    marginRight: 8,
  },
  eventContent: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  eventType: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  eventTypetool_start: {
    color: '#007bff',
  },
  eventTypetool_complete: {
    color: '#28a745',
  },
  eventTypetool_error: {
    color: '#dc3545',
  },
  eventTypeiteration_start: {
    color: '#6610f2',
  },
  eventTypethinking: {
    color: '#fd7e14',
  },
  eventTypemessage: {
    color: '#20c997',
  },
  eventTypeplan_ready: {
    color: '#0dcaf0',
  },
  eventTypecomplete: {
    color: '#198754',
  },
  eventTypeerror: {
    color: '#dc3545',
  },
  eventTypefatal_error: {
    color: '#721c24',
  },
  eventTypedone: {
    color: '#6c757d',
  },
  eventTool: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  eventMessage: {
    fontSize: 11,
    color: '#333',
    flex: 1,
  },
  eventError: {
    fontSize: 11,
    color: '#dc3545',
    flex: 1,
  },
});
