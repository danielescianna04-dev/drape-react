import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import {
  ChatMessageComponent,
  ToolMessageComponent,
  ToolResultMessageComponent,
  ThinkingMessageComponent,
  TodoMessageComponent,
  PlanMessageComponent,
  LoadingComponent,
} from './ClaudeMessageComponents';
import type {
  AllMessage,
  ChatMessage,
  ToolMessage,
  ToolResultMessage,
  ThinkingMessage,
  TodoMessage,
  PlanMessage,
} from './types';

interface AgentEvent {
  type: string;
  tool?: string;
  args?: any;
  result?: any;
  success?: boolean;
  iteration?: number;
  content?: string;
  message?: string;
  thinking?: string;
  todos?: any[];
  plan?: string;
  toolUseId?: string;
  [key: string]: any;
}

interface ClaudeCodeViewProps {
  events: AgentEvent[];
  status: 'running' | 'complete' | 'error';
  currentTool?: string;
  userMessage?: string;
}

export const ClaudeCodeView: React.FC<ClaudeCodeViewProps> = ({
  events,
  status,
  currentTool,
  userMessage,
}) => {
  // Convert agent events to typed messages
  const messages = useMemo(() => {
    const msgs: AllMessage[] = [];
    const timestamp = Date.now();

    // Add user message if provided
    if (userMessage) {
      msgs.push({
        type: 'chat',
        role: 'user',
        content: userMessage,
        timestamp: timestamp - 1000,
      } as ChatMessage);
    }

    // Process events
    events.forEach((event, index) => {
      const eventTimestamp = timestamp + index;

      // Tool start event
      if (event.type === 'tool_start' && event.tool) {
        msgs.push({
          type: 'tool',
          content: event.tool,
          timestamp: eventTimestamp,
        } as ToolMessage);
      }

      // Tool complete event
      else if (event.type === 'tool_complete' && event.tool) {
        const toolName = event.tool;
        const summary = getSummaryForTool(toolName, event.args);
        const content = formatToolResult(event.result);

        msgs.push({
          type: 'tool_result',
          toolName,
          content,
          summary,
          timestamp: eventTimestamp,
          toolUseResult: event.result,
        } as ToolResultMessage);
      }

      // Thinking event
      else if (event.type === 'thinking' && event.thinking) {
        msgs.push({
          type: 'thinking',
          content: event.thinking,
          timestamp: eventTimestamp,
        } as ThinkingMessage);
      }

      // Todo event
      else if (event.type === 'todo' && event.todos) {
        msgs.push({
          type: 'todo',
          todos: event.todos,
          timestamp: eventTimestamp,
        } as TodoMessage);
      }

      // Plan event
      else if (event.type === 'plan' && event.plan) {
        msgs.push({
          type: 'plan',
          plan: event.plan,
          toolUseId: event.toolUseId || '',
          timestamp: eventTimestamp,
        } as PlanMessage);
      }

      // Response/content event (Claude's response)
      else if (
        (event.type === 'response' || event.type === 'content') &&
        event.content
      ) {
        msgs.push({
          type: 'chat',
          role: 'assistant',
          content: event.content,
          timestamp: eventTimestamp,
        } as ChatMessage);
      }
    });

    return msgs;
  }, [events, userMessage]);

  // Render message based on type
  const renderMessage = (message: AllMessage, index: number) => {
    const key = `${message.type}-${message.timestamp}-${index}`;

    switch (message.type) {
      case 'chat':
        return <ChatMessageComponent key={key} message={message} />;
      case 'tool':
        return <ToolMessageComponent key={key} message={message} />;
      case 'tool_result':
        return <ToolResultMessageComponent key={key} message={message} />;
      case 'thinking':
        return <ThinkingMessageComponent key={key} message={message} />;
      case 'todo':
        return <TodoMessageComponent key={key} message={message} />;
      case 'plan':
        return <PlanMessageComponent key={key} message={message} />;
      default:
        return null;
    }
  };

  const isLoading = status === 'running';

  return (
    <View style={styles.container}>
      {messages.map(renderMessage)}
      {isLoading && <LoadingComponent />}
    </View>
  );
};

// Helper functions

function getSummaryForTool(toolName: string, args: any): string {
  if (!args) return toolName;

  switch (toolName) {
    case 'Read':
      return args.file_path ? `Reading ${args.file_path}` : 'Reading file';
    case 'Write':
      return args.file_path ? `Writing ${args.file_path}` : 'Writing file';
    case 'Edit':
      return args.file_path ? args.file_path : 'Editing file';
    case 'Bash':
      return args.command
        ? args.command.length > 50
          ? `${args.command.substring(0, 50)}...`
          : args.command
        : 'Running command';
    case 'Glob':
      return args.pattern ? `Searching ${args.pattern}` : 'Searching files';
    case 'Grep':
      return args.pattern ? `Grepping ${args.pattern}` : 'Searching content';
    default:
      return toolName;
  }
}

function formatToolResult(result: any): string {
  if (typeof result === 'string') {
    return result;
  }

  if (result && typeof result === 'object') {
    // Handle structured results
    if (result.stdout || result.stderr) {
      let output = '';
      if (result.stdout) output += result.stdout;
      if (result.stderr) output += `\n[stderr]\n${result.stderr}`;
      return output.trim();
    }

    // Handle other objects
    return JSON.stringify(result, null, 2);
  }

  return String(result || '');
}

const styles = StyleSheet.create({
  container: {
    gap: 0,
  },
});
