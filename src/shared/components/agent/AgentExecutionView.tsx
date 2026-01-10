import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { AgentToolExecution } from './AgentToolExecution';
import { AgentThinking } from './AgentThinking';
import { AgentProgressSteps, type ProgressStep } from './AgentProgressSteps';

interface AgentEvent {
  type: string;
  tool?: string;
  args?: any;
  result?: any;
  success?: boolean;
  iteration?: number;
  content?: string;
  message?: string;
  [key: string]: any;
}

interface AgentExecutionViewProps {
  events: AgentEvent[];
  status: 'running' | 'complete' | 'error';
  currentTool?: string;
}

export const AgentExecutionView: React.FC<AgentExecutionViewProps> = ({
  events,
  status,
  currentTool,
}) => {
  // Extract tool calls from events
  const toolCalls = useMemo(() => {
    const tools: Array<{
      id: string;
      tool: string;
      args: any;
      result?: any;
      status: 'pending' | 'running' | 'success' | 'error';
      description?: string;
    }> = [];

    const toolStarts = events.filter(e => e.type === 'tool_start');
    const toolCompletes = events.filter(e => e.type === 'tool_complete');

    toolStarts.forEach((startEvent, index) => {
      const toolName = startEvent.tool || 'unknown';
      const completeEvent = toolCompletes.find(
        c => c.tool === toolName && tools.filter(t => t.tool === toolName).length === index
      );

      tools.push({
        id: `tool-${index}-${toolName}`,
        tool: toolName,
        args: startEvent.args || startEvent.input || {},
        result: completeEvent?.result,
        status: completeEvent
          ? completeEvent.success !== false
            ? 'success'
            : 'error'
          : status === 'running' && currentTool === toolName
          ? 'running'
          : 'pending',
        description: getToolDescription(toolName),
      });
    });

    return tools;
  }, [events, status, currentTool]);

  // Extract progress steps (from iterations or explicit progress events)
  const progressSteps = useMemo(() => {
    const steps: ProgressStep[] = [];

    // Check for explicit progress events
    const progressEvents = events.filter(e => e.type === 'progress');
    if (progressEvents.length > 0) {
      progressEvents.forEach((event, index) => {
        steps.push({
          label: event.label || `Step ${index + 1}`,
          status: event.status || 'pending',
          order: event.order !== undefined ? event.order : index,
          message: event.message,
        });
      });
      return steps;
    }

    // Otherwise create steps from iterations
    const iterations = events.filter(e => e.type === 'iteration' || e.iteration !== undefined);
    if (iterations.length > 0) {
      iterations.forEach((event, index) => {
        const iterationNum = event.iteration || index + 1;
        const isComplete = events.some(
          e => e.type === 'iteration' && (e.iteration || 0) > iterationNum
        );

        steps.push({
          label: `Iteration ${iterationNum}`,
          status: isComplete
            ? 'complete'
            : status === 'running'
            ? 'running'
            : 'pending',
          order: index,
          message: event.message || event.content,
        });
      });
    }

    return steps;
  }, [events, status]);

  // Get current iteration number
  const currentIteration = useMemo(() => {
    const iterationEvents = events.filter(
      e => e.type === 'iteration' || e.iteration !== undefined
    );
    if (iterationEvents.length > 0) {
      const lastIteration = iterationEvents[iterationEvents.length - 1];
      return lastIteration.iteration || iterationEvents.length;
    }
    return undefined;
  }, [events]);

  // Check if agent is thinking (no tool calls yet or between tool calls)
  const isThinking = status === 'running' && !currentTool;

  return (
    <View style={styles.container}>
      {/* Show thinking indicator */}
      {isThinking && (
        <AgentThinking
          iteration={currentIteration}
          currentTool={currentTool}
          message="Processing your request..."
        />
      )}

      {/* Show progress steps if available */}
      {progressSteps.length > 0 && (
        <AgentProgressSteps steps={progressSteps} isCollapsible={true} />
      )}

      {/* Show tool execution */}
      {toolCalls.length > 0 && (
        <AgentToolExecution toolCalls={toolCalls} isThinking={isThinking} />
      )}
    </View>
  );
};

// Helper to get tool descriptions
function getToolDescription(toolName: string): string {
  const descriptions: Record<string, string> = {
    write_file: 'Create or overwrite a file',
    read_file: 'Read file contents',
    edit_file: 'Edit file with find/replace',
    list_directory: 'List directory contents',
    run_command: 'Execute bash command',
    glob_search: 'Search files by pattern',
    grep_search: 'Search file contents',
    todo_write: 'Update task list',
    ask_user_question: 'Ask user for input',
    launch_sub_agent: 'Launch specialized agent',
    enter_plan_mode: 'Enter planning mode',
    exit_plan_mode: 'Submit plan for approval',
    web_search: 'Search the web',
    execute_skill: 'Execute skill command',
    notebook_edit: 'Edit Jupyter notebook',
    kill_shell: 'Terminate background shell',
    get_task_output: 'Get task output',
    signal_completion: 'Signal task completion',
  };

  return descriptions[toolName] || 'Execute tool';
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
});
