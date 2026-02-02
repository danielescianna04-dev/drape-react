import { aiProviderService, ChatMessage, ContentBlock, ToolDefinition } from './ai-provider.service';
import { agentToolsService } from './agent-tools.service';
import { fileService } from './file.service';
import { workspaceService } from './workspace.service';
import { sessionService } from './session.service';
import { metricsService } from './metrics.service';
import { getToolDefinitions } from '../tools';
import { log } from '../utils/logger';
import { AgentEvent, AgentMode, AgentOptions, Session, ToolResult } from '../types';
import path from 'path';
import { config } from '../config';

const MAX_ITERATIONS = 50;
const TOOL_TIMEOUT = 60000;

// USD to EUR conversion
const USD_TO_EUR = 0.92;

// AI Model Pricing (USD per 1M tokens)
const AI_PRICING: Record<string, { input: number; output: number; cachedInput: number }> = {
  'gemini-3-flash':          { input: 0.10,  output: 0.40,  cachedInput: 0.025 },
  'gemini-3-pro':            { input: 1.25,  output: 5.00,  cachedInput: 0.3125 },
  'gemini-2.5-flash':        { input: 0.15,  output: 0.60,  cachedInput: 0.04 },
  'gemini-2.5-flash-image':  { input: 0.15,  output: 0.60,  cachedInput: 0.04 },
  'claude-sonnet-4':         { input: 3.00,  output: 15.00, cachedInput: 0.30 },
  'claude-4-5-sonnet':       { input: 3.00,  output: 15.00, cachedInput: 0.30 },
  'claude-3.5-sonnet':       { input: 3.00,  output: 15.00, cachedInput: 0.30 },
  'claude-4-5-opus':         { input: 15.00, output: 75.00, cachedInput: 1.50 },
  'claude-3.5-haiku':        { input: 0.80,  output: 4.00,  cachedInput: 0.08 },
  'llama-3.3-70b':           { input: 0.59,  output: 0.79,  cachedInput: 0.15 },
  'llama-3.1-8b':            { input: 0.05,  output: 0.08,  cachedInput: 0.01 },
};

function calculateCostEur(model: string, inputTokens: number, outputTokens: number, cachedTokens = 0): number {
  const pricing = AI_PRICING[model] || AI_PRICING['gemini-3-flash'];
  const nonCachedInput = Math.max(0, inputTokens - cachedTokens);
  const costUsd = (nonCachedInput * pricing.input + cachedTokens * pricing.cachedInput + outputTokens * pricing.output) / 1_000_000;
  return costUsd * USD_TO_EUR;
}

/**
 * ReAct-style agent loop
 * Implements the core agent reasoning loop with tool use
 */
export class AgentLoop {
  private projectId: string;
  private mode: AgentMode;
  private model: string;
  private conversationHistory: ChatMessage[];
  private userId: string | null;
  private userPlan: string;
  private filesCreated: string[] = [];
  private filesModified: string[] = [];
  private session: Session | null = null;
  private totalTokensUsed: { input: number; output: number } = { input: 0, output: 0 };
  private iterationCount: number = 0;

  // Budget limits per plan (monthly EUR)
  private static readonly PLAN_BUDGETS: Record<string, number> = {
    free: 1.50,
    go: 7.50,
    pro: 50.00,
    team: 200.00,
  };

  constructor(options: AgentOptions) {
    this.projectId = options.projectId;
    this.mode = options.mode || 'fast';
    this.model = options.model || 'claude-sonnet-4';
    this.userId = options.userId || null;
    this.userPlan = options.userPlan || 'free';
    this.conversationHistory = options.conversationHistory || [];
  }

  /**
   * Check if user has exceeded their AI budget
   */
  private checkBudget(): { exceeded: boolean; percentUsed: number } {
    if (!this.userId) return { exceeded: false, percentUsed: 0 };

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const usage = metricsService.getAIUsageSummary(this.userId, monthStart.getTime());
    const budget = AgentLoop.PLAN_BUDGETS[this.userPlan] || AgentLoop.PLAN_BUDGETS.free;
    const percentUsed = budget > 0 ? Math.round((usage.totalCostEur / budget) * 100) : 0;

    return {
      exceeded: usage.totalCostEur >= budget,
      percentUsed,
    };
  }

  /**
   * Execute a single tool (used by /execute-tool endpoint)
   */
  async executeTool(toolName: string, input: any): Promise<{ success: boolean; result: string }> {
    if (!this.session) {
      this.session = await workspaceService.getOrCreateContainer(this.projectId);
    }
    const result = await agentToolsService.executeTool(toolName, input, this.projectId, this.session);
    return { success: result.success, result: result.content || result.error || '' };
  }

  /**
   * Main agent loop - streams events as it runs
   * @param prompt - User's prompt/request
   * @param images - Optional array of images (base64 encoded)
   */
  async *run(
    prompt: string,
    images?: Array<{ base64: string; type: string }>
  ): AsyncGenerator<AgentEvent> {
    try {
      // 1. Yield start event
      yield {
        type: 'start',
        mode: this.mode,
        projectId: this.projectId,
        model: this.model,
      };

      // 2. Check AI budget before doing anything expensive
      const budgetCheck = this.checkBudget();
      if (budgetCheck.exceeded) {
        log.warn(`[AgentLoop] Budget exceeded for user ${this.userId} (plan: ${this.userPlan}, ${budgetCheck.percentUsed}% used)`);
        yield {
          type: 'budget_exceeded',
          message: 'Hai esaurito il budget AI per questo mese.',
          percentUsed: budgetCheck.percentUsed,
          plan: this.userPlan,
        };
        return;
      }

      // 3. Ensure container exists and is ready
      log.info(`[AgentLoop] Starting agent for project ${this.projectId} with model ${this.model}`);
      this.session = await workspaceService.getOrCreateContainer(this.projectId);

      // 3. Build system prompt with project context
      const systemPrompt = await this.buildSystemPrompt();

      // 4. Add user message to conversation
      const userMessage = this.buildUserMessage(prompt, images);
      this.conversationHistory.push(userMessage);

      // 5. Main reasoning loop
      let shouldContinue = true;
      let consecutiveSameToolCount = 0;
      let lastToolName = '';

      while (shouldContinue && this.iterationCount < MAX_ITERATIONS) {
        this.iterationCount++;

        yield {
          type: 'iteration_start',
          iteration: this.iterationCount,
          maxIterations: MAX_ITERATIONS,
        };

        // Call AI model with streaming
        let fullText = '';
        let toolCalls: Array<{ id: string; name: string; input: any }> = [];
        let stopReason = '';

        try {
          const tools = getToolDefinitions();

          for await (const chunk of aiProviderService.chatStream(
            this.model,
            this.conversationHistory,
            tools,
            systemPrompt,
            { temperature: 0.7 }
          )) {
            switch (chunk.type) {
              case 'thinking_start':
                yield { type: 'thinking', text: '', start: true };
                break;

              case 'thinking':
                yield { type: 'thinking', text: chunk.text };
                break;

              case 'thinking_end':
                yield { type: 'thinking', text: '', end: true };
                break;

              case 'text':
                fullText += chunk.text;
                yield { type: 'text_delta', text: chunk.text };
                break;

              case 'tool_start':
                yield {
                  type: 'tool_start',
                  id: chunk.id,
                  tool: chunk.name,
                };
                break;

              case 'tool_use':
                toolCalls.push({
                  id: chunk.id,
                  name: chunk.name,
                  input: chunk.input,
                });
                yield {
                  type: 'tool_input',
                  id: chunk.id,
                  tool: chunk.name,
                  input: chunk.input,
                };
                break;

              case 'done':
                fullText = chunk.fullText;
                toolCalls = chunk.toolCalls;
                stopReason = chunk.stopReason;
                this.totalTokensUsed.input += chunk.usage.inputTokens;
                this.totalTokensUsed.output += chunk.usage.outputTokens;

                // Track AI usage for budget monitoring
                {
                  const cachedTokens = (chunk.usage.cacheReadTokens || 0);
                  const costEur = calculateCostEur(
                    this.model,
                    chunk.usage.inputTokens,
                    chunk.usage.outputTokens,
                    cachedTokens
                  );
                  metricsService.trackAIUsage({
                    userId: this.userId || 'anonymous',
                    model: this.model,
                    inputTokens: chunk.usage.inputTokens,
                    outputTokens: chunk.usage.outputTokens,
                    cachedTokens,
                    costEur,
                  });
                }
                break;
            }
          }
        } catch (error: any) {
          log.error(`[AgentLoop] AI streaming error: ${error.message}`);
          yield {
            type: 'error',
            error: `AI error: ${error.message}`,
          };
          return;
        }

        // Add assistant message to history
        const assistantContent: ContentBlock[] = [];

        if (fullText) {
          assistantContent.push({ type: 'text', text: fullText });
        }

        if (toolCalls.length > 0) {
          for (const tool of toolCalls) {
            assistantContent.push({
              type: 'tool_use',
              id: tool.id,
              name: tool.name,
              input: tool.input,
            });
          }
        }

        if (assistantContent.length > 0) {
          this.conversationHistory.push({
            role: 'assistant',
            content: assistantContent,
          });
        }

        // Handle tool calls
        if (toolCalls.length > 0) {
          // Check for infinite loops (same tool called repeatedly)
          const currentToolName = toolCalls[0].name;
          if (currentToolName === lastToolName) {
            consecutiveSameToolCount++;
            if (consecutiveSameToolCount >= 5) {
              log.warn(`[AgentLoop] Detected potential infinite loop with tool: ${currentToolName}`);
              yield {
                type: 'error',
                error: `Agent appears stuck in a loop calling ${currentToolName}. Stopping.`,
              };
              return;
            }
          } else {
            consecutiveSameToolCount = 0;
          }
          lastToolName = currentToolName;

          // Execute each tool
          const toolResults: ContentBlock[] = [];

          for (const toolCall of toolCalls) {
            try {
              const result = await agentToolsService.executeTool(
                toolCall.name,
                toolCall.input,
                this.projectId,
                this.session || undefined
              );

              // Handle special tool results
              if ((result as any)._pauseForUser) {
                // ask_user_question tool
                yield {
                  type: 'ask_user_question',
                  questions: (result as any).questions,
                };
                // Pause the loop - it will resume when user provides answers
                return;
              }

              if ((result as any)._completion) {
                // signal_completion tool
                yield {
                  type: 'complete',
                  result: result.content || 'Task completed',
                  filesCreated: this.filesCreated,
                  filesModified: this.filesModified,
                  tokensUsed: this.totalTokensUsed,
                  iterations: this.iterationCount,
                };
                return;
              }

              // Handle todo updates
              if (toolCall.name === 'todo_write' && (result as any).todos) {
                yield {
                  type: 'todo_update',
                  todos: (result as any).todos,
                };
              }

              // Track file operations
              if (toolCall.name === 'write_file') {
                const filePath = toolCall.input.file_path;
                if (this.filesCreated.includes(filePath)) {
                  if (!this.filesModified.includes(filePath)) {
                    this.filesModified.push(filePath);
                  }
                } else {
                  this.filesCreated.push(filePath);
                }
              } else if (toolCall.name === 'edit_file') {
                const filePath = toolCall.input.file_path;
                if (!this.filesModified.includes(filePath)) {
                  this.filesModified.push(filePath);
                }
              }

              // Yield tool completion
              yield {
                type: 'tool_complete',
                id: toolCall.id,
                tool: toolCall.name,
                result: result.content || JSON.stringify(result),
                success: result.success,
                input: toolCall.input,
              };

              // Add tool result to conversation
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: result.content || JSON.stringify(result),
              });
            } catch (error: any) {
              log.error(`[AgentLoop] Tool ${toolCall.name} error: ${error.message}`);
              yield {
                type: 'tool_error',
                id: toolCall.id,
                tool: toolCall.name,
                error: error.message,
              };

              // Add error result to conversation so agent can recover
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: `Error: ${error.message}`,
              });
            }
          }

          // Add tool results as user message
          if (toolResults.length > 0) {
            this.conversationHistory.push({
              role: 'user',
              content: toolResults,
            });
          }

          // Continue loop to get next agent response
          shouldContinue = true;
        } else {
          // No tool calls - agent is done
          shouldContinue = false;

          yield {
            type: 'complete',
            result: fullText || 'Task completed',
            filesCreated: this.filesCreated,
            filesModified: this.filesModified,
            tokensUsed: this.totalTokensUsed,
            iterations: this.iterationCount,
          };
        }

        // Check iteration limit
        if (this.iterationCount >= MAX_ITERATIONS) {
          yield {
            type: 'budget_exceeded',
            message: `Maximum iterations (${MAX_ITERATIONS}) reached`,
            iterations: this.iterationCount,
          };
          return;
        }
      }
    } catch (error: any) {
      log.error(`[AgentLoop] Fatal error: ${error.message}`);
      yield {
        type: 'fatal_error',
        error: error.message,
        stack: error.stack,
      };
    }
  }

  /**
   * Build system prompt with project context
   */
  private async buildSystemPrompt(): Promise<string> {
    const basePrompt = this.getBasePromptForMode();

    // Get project file tree
    let projectContext = '';
    try {
      const files = await fileService.listAllFiles(this.projectId);
      if (files.success && files.data && files.data.length > 0) {
        const fileList = files.data
          .slice(0, 200) // Limit to avoid token overflow
          .map(f => f.path)
          .join('\n');

        projectContext = `\n\n## Project Files\n\nThe project contains the following files:\n\`\`\`\n${fileList}\n\`\`\`\n`;

        if (files.data.length > 200) {
          projectContext += `\n(Showing first 200 of ${files.data.length} files)`;
        }
      }
    } catch (error: any) {
      log.warn(`[AgentLoop] Failed to load project files: ${error.message}`);
    }

    // Add session info
    let sessionInfo = '';
    if (this.session) {
      sessionInfo = `\n\n## Environment\n\nYou have access to a container with:\n`;
      sessionInfo += `- Project directory: /home/coder/project\n`;
      sessionInfo += `- Agent URL: ${this.session.agentUrl}\n`;
      if (this.session.projectInfo) {
        sessionInfo += `- Project type: ${this.session.projectInfo.type}\n`;
        sessionInfo += `- Package manager: ${this.session.projectInfo.packageManager || 'npm'}\n`;
      }
    }

    return basePrompt + projectContext + sessionInfo;
  }

  /**
   * Get base prompt based on agent mode
   */
  private getBasePromptForMode(): string {
    const commonInstructions = `
You are an AI coding assistant with access to a development environment. You can read and write files, run commands, search code, and more.

## Guidelines

- Be concise and efficient
- Always read files before editing them
- When making changes, explain what you're doing
- If you encounter errors, debug them systematically
- Use the todo_write tool to track progress on multi-step tasks
- Use signal_completion when the task is fully complete

## Available Tools

You have access to tools for:
- File operations (read, write, edit, list)
- Code search (glob patterns, grep)
- Command execution (run tests, install deps, build)
- Task tracking (todo list)
- Web search (documentation lookup)
- User interaction (ask questions)
`;

    switch (this.mode) {
      case 'fast':
        return `${commonInstructions}

## Mode: Fast

You are in FAST mode. Prioritize speed and efficiency:
- Get to the solution quickly
- Don't overthink - make reasonable assumptions
- Skip verbose explanations
- Use the most direct approach
`;

      case 'plan':
        return `${commonInstructions}

## Mode: Plan

You are in PLAN mode. Your goal is to create a detailed plan:
- Analyze the request thoroughly
- Break down into clear steps
- Use todo_write to create a structured plan
- Don't execute yet - just plan
- Ask clarifying questions if needed
- When the plan is ready, use signal_completion
`;

      case 'execute':
        return `${commonInstructions}

## Mode: Execute

You are in EXECUTE mode. Follow plans carefully:
- Execute each step methodically
- Update the todo list as you progress
- Verify each step before moving to the next
- Handle errors gracefully and adapt
- Provide detailed progress updates
`;

      default:
        return commonInstructions;
    }
  }

  /**
   * Build user message with optional images
   */
  private buildUserMessage(
    prompt: string,
    images?: Array<{ base64: string; type: string }>
  ): ChatMessage {
    if (!images || images.length === 0) {
      return {
        role: 'user',
        content: prompt,
      };
    }

    // Multimodal message with images
    const content: ContentBlock[] = [
      { type: 'text', text: prompt },
    ];

    for (const img of images) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.type || 'image/jpeg',
          data: img.base64,
        },
      });
    }

    return {
      role: 'user',
      content,
    };
  }

  /**
   * Get conversation history (for resuming)
   */
  getConversationHistory(): ChatMessage[] {
    return this.conversationHistory;
  }

  /**
   * Get files created/modified (for summary)
   */
  getFileChanges(): { created: string[]; modified: string[] } {
    return {
      created: this.filesCreated,
      modified: this.filesModified,
    };
  }

  /**
   * Get token usage
   */
  getTokenUsage(): { input: number; output: number } {
    return this.totalTokensUsed;
  }

  /**
   * Resume loop after user answers questions
   * This allows the agent to pause and wait for user input
   */
  async *resume(userAnswers: string): AsyncGenerator<AgentEvent> {
    // Add user's answers to conversation
    this.conversationHistory.push({
      role: 'user',
      content: userAnswers,
    });

    // Continue the loop
    yield* this.run('', []);
  }
}
